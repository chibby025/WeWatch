package handlers

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"wewatch-backend/internal/utils"

	"github.com/gin-gonic/gin"
)

// UploadRhythmHeroAudioHandler handles POST /api/rooms/:id/rhythm-hero-audio —
// uploads an "Upload Your Own" Rhythm Hero song to BunnyCDN so every connected
// client (not just the uploader) can fetch and decode the identical audio for
// the room-wide live-broadcast feature (see websocket.go's rhythm_hero_start
// handling). Deliberately NOT routed through the chunked-upload/progressive-
// HLS pipeline (chunk_upload.go) — that machinery exists to let a large video
// start playing while still uploading and become the room's shared "Playing
// Now" media; a Rhythm Hero song is small, already fully decoded client-side
// before this call even happens (SongPicker's file input reads the whole file
// synchronously via decodeAudioData), and must never become a playlist item.
// Mirrors UploadVoiceNote's much simpler single-shot save-then-push pattern
// instead (room_handlers.go).
//
// Uploaded under a predictable rhythm_hero/session_{sessionID}/ prefix —
// EndWatchSessionHandler/AutoEndSession/CleanupStaleSessions all delete this
// whole prefix on session end (see rooms.go/websocket.go), so there's no DB
// row or per-file tracking needed for cleanup.
func UploadRhythmHeroAudioHandler(c *gin.Context) {
	roomIDStr := c.Param("id")
	if _, err := strconv.ParseUint(roomIDStr, 10, 64); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	userID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user ID"})
		return
	}

	sessionID := strings.TrimSpace(c.PostForm("session_id"))
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "session_id is required"})
		return
	}

	file, err := c.FormFile("audio")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Audio file is required"})
		return
	}

	// 25MB cap — a full song, not a video; generous enough for any real MP3/
	// WAV/M4A upload without approaching the territory chunked upload exists for.
	if file.Size > 25*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Audio file too large (max 25MB)"})
		return
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext == "" {
		ext = ".mp3"
	}
	contentType := getMimeType(ext)

	uploadDir := fmt.Sprintf("uploads/rhythm_hero/session_%s", sessionID)
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		log.Printf("Failed to create rhythm hero audio directory: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create storage directory"})
		return
	}

	timestamp := time.Now().UnixNano()
	filename := fmt.Sprintf("%d_%d%s", userID, timestamp, ext)
	localPath := fmt.Sprintf("%s/%s", uploadDir, filename)

	if err := c.SaveUploadedFile(file, localPath); err != nil {
		log.Printf("Failed to save rhythm hero audio: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save audio file"})
		return
	}

	// Push to BunnyCDN in production — same reasoning as UploadVoiceNote:
	// Railway's local disk isn't guaranteed to persist across deploys, and a
	// bare relative path would resolve against the frontend's own origin in
	// the browser, not the backend's. UploadLocalFileToBunnyCDN already does
	// the right thing for local dev (returns the relative path unchanged,
	// leaves the file on disk — Vite's dev proxy forwards /uploads to the
	// backend, masking this distinction there).
	remotePath := fmt.Sprintf("rhythm_hero/session_%s/%s", sessionID, filename)
	audioURL, err := utils.UploadLocalFileToBunnyCDN(localPath, remotePath, contentType)
	if err != nil {
		log.Printf("Failed to upload rhythm hero audio to BunnyCDN: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to store audio file"})
		os.Remove(localPath)
		return
	}
	// Local copy is no longer needed once it's safely on the CDN — only
	// happens in production; UploadLocalFileToBunnyCDN returns before this
	// point in local dev, leaving the local copy as the served file.
	if strings.HasPrefix(audioURL, "http") {
		os.Remove(localPath)
	}

	c.JSON(http.StatusOK, gin.H{"audio_url": audioURL})
}
