// backend/internal/handlers/session_preview.go
package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
)

const PreviewsDir = "./uploads/previews"

func init() {
	err := os.MkdirAll(PreviewsDir, os.ModePerm)
	if err != nil {
		log.Fatalf("Failed to create previews directory '%s': %v", PreviewsDir, err)
	}
	log.Printf("Previews directory '%s' is ready.", PreviewsDir)
}

// GenerateSessionPreviewRequest defines the expected input for preview generation
type GenerateSessionPreviewRequest struct {
	Source      string `json:"source" binding:"required"`       // "upload" | "liveshare" | "watchfrom"
	CurrentTime string `json:"current_time"`                    // "HH:MM:SS" for upload videos
	MediaItemID *uint  `json:"media_item_id"`                   // For upload source
}

// GenerateSessionPreviewHandler handles POST /api/sessions/:sessionId/generate-preview
func GenerateSessionPreviewHandler(c *gin.Context) {
	log.Println("🎬 [GenerateSessionPreview] Request received")

	// Authenticate user
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	_, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Get session ID
	sessionID := c.Param("id")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Session ID is required"})
		return
	}

	// Verify session exists
	var session models.WatchSession
	if err := DB.Where("session_id = ?", sessionID).First(&session).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// ✅ Check if preview generation is enabled for this session
	if !session.PreviewEnabled {
		log.Printf("⏸️ [GenerateSessionPreview] Preview generation disabled for session %s, skipping", sessionID)
		c.JSON(http.StatusOK, gin.H{
			"message": "Preview generation is disabled for this session",
			"poster_url": "",
			"preview_url": "",
		})
		return
	}

	// Parse request body
	var req GenerateSessionPreviewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	log.Printf("📋 [GenerateSessionPreview] Session: %s, Source: %s", sessionID, req.Source)

	// Generate unique filenames
	timestamp := time.Now().Unix()
	posterFilename := fmt.Sprintf("session_%s_poster_%d.jpg", sessionID, timestamp)
	mp4Filename := fmt.Sprintf("session_%s_preview_%d.mp4", sessionID, timestamp)
	posterPath := filepath.Join(PreviewsDir, posterFilename)
	mp4Path := filepath.Join(PreviewsDir, mp4Filename)

	var posterURL, mp4URL string

	// Handle different sources
	switch req.Source {
	case "upload":
		// For uploaded videos, generate from file
		var mediaItem models.MediaItem
		var tempMediaItem models.TemporaryMediaItem
		var mediaPath string
		var mediaFound bool

		// Try using media_item_id if provided
		if req.MediaItemID != nil {
			// Try permanent media first
			if err := DB.First(&mediaItem, *req.MediaItemID).Error; err == nil {
				mediaPath = mediaItem.FilePath
				mediaFound = true
			} else {
				// Try temporary media
				if err := DB.First(&tempMediaItem, *req.MediaItemID).Error; err == nil {
					mediaPath = tempMediaItem.FilePath
					mediaFound = true
				}
			}
		}

		// If no media_item_id or not found, try to find media from session's current_media_url
		if !mediaFound && session.CurrentMediaURL != "" {
			log.Printf("🔍 [GenerateSessionPreview] No media_item_id, searching by current_media_url: %s", session.CurrentMediaURL)
			
			// Extract filename from URL (e.g., "http://localhost:8080/uploads/temp/file.mp4" -> "file.mp4")
			urlParts := filepath.Base(session.CurrentMediaURL)
			
			// Try to find in temporary media by filename
			if err := DB.Where("file_name = ? AND session_id = ?", urlParts, sessionID).First(&tempMediaItem).Error; err == nil {
				mediaPath = tempMediaItem.FilePath
				mediaFound = true
				log.Printf("✅ [GenerateSessionPreview] Found temporary media by filename: %s", tempMediaItem.FilePath)
			} else {
				// Try permanent media by checking file_path contains the filename
				if err := DB.Where("file_path LIKE ?", "%"+urlParts).First(&mediaItem).Error; err == nil {
					mediaPath = mediaItem.FilePath
					mediaFound = true
					log.Printf("✅ [GenerateSessionPreview] Found permanent media by filename: %s", mediaItem.FilePath)
				}
			}
		}

		if !mediaFound {
			log.Printf("❌ [GenerateSessionPreview] No media found for session %s", sessionID)
			c.JSON(http.StatusNotFound, gin.H{"error": "Media item not found for session"})
			return
		}

		// Use current time or default to 5 seconds
		startTime := req.CurrentTime
		if startTime == "" {
			startTime = "5" // 5 seconds
		}

		// Generate poster
		log.Printf("🖼️ [GenerateSessionPreview] Generating poster from: %s", mediaPath)
		if err := utils.ExtractThumbnail(mediaPath, posterPath); err != nil {
			log.Printf("❌ [GenerateSessionPreview] Poster generation failed: %v", err)
			posterURL = "/icons/placeholder-poster.jpg"
		} else {
			posterURL = fmt.Sprintf("/uploads/previews/%s", posterFilename)
			log.Printf("✅ [GenerateSessionPreview] Poster generated: %s", posterURL)
		}

		// Generate MP4 preview (30 seconds) with audio
		log.Printf("🎞️ [GenerateSessionPreview] Generating MP4 preview from: %s", mediaPath)
		if err := utils.GeneratePreviewMP4(mediaPath, mp4Path, startTime, 30); err != nil {
			log.Printf("❌ [GenerateSessionPreview] MP4 generation failed: %v", err)
			mp4URL = "" // Will fallback to poster
		} else {
			mp4URL = fmt.Sprintf("/uploads/previews/%s", mp4Filename)
			log.Printf("✅ [GenerateSessionPreview] MP4 generated: %s", mp4URL)
			// Upload to BunnyCDN when configured so the URL is stable across redeploys
			if fileData, readErr := os.ReadFile(mp4Path); readErr == nil {
				if cdnURL, uploadErr := utils.UploadPreviewToBunnyCDN(fileData, mp4Filename); uploadErr == nil {
					mp4URL = cdnURL
					if strings.HasPrefix(cdnURL, "http") {
						os.Remove(mp4Path) // only clean up local file when CDN took over
					}
					log.Printf("✅ [GenerateSessionPreview] MP4 uploaded to CDN: %s", mp4URL)
				}
			}
		}

	case "liveshare", "watchfrom":
		// For WebRTC streams, frontend will upload frames separately
		// This endpoint just acknowledges the request
		log.Printf("ℹ️ [GenerateSessionPreview] WebRTC source - expecting frame upload")
		posterURL = "/icons/placeholder-poster.jpg"
		mp4URL = ""

	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid source type"})
		return
	}

	// Return URLs
	c.JSON(http.StatusOK, gin.H{
		"message":     "Preview generation completed",
		"session_id":  sessionID,
		"source":      req.Source,
		"poster_url":  posterURL,
		"preview_url": mp4URL,
	})
}

// UploadSessionFramesHandler handles POST /api/sessions/:sessionId/upload-frames
// Receives canvas-captured frames from WebRTC streams and generates MP4
func UploadSessionFramesHandler(c *gin.Context) {
	log.Println("📸 [UploadSessionFrames] Request received")

	// Authenticate user
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	_, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Get session ID
	sessionID := c.Param("id")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Session ID is required"})
		return
	}

	// Verify session exists
	var session models.WatchSession
	if err := DB.Where("session_id = ?", sessionID).First(&session).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Parse multipart form (max 10MB for frames)
	if err := c.Request.ParseMultipartForm(10 << 20); err != nil {
		log.Printf("❌ [UploadSessionFrames] Failed to parse form: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse form data"})
		return
	}

	// Read source_type BEFORE the frames check — clip uploads use a "clip" field, not "frames"
	sourceType := c.PostForm("source_type")

	// Liveshare video clip — upload WebM directly as preview_url
	if sourceType == "liveshare_clip" {
		clipFile, clipHeader, clipErr := c.Request.FormFile("clip")
		if clipErr != nil {
			log.Printf("❌ [UploadSessionFrames] No clip file: %v", clipErr)
			c.JSON(http.StatusBadRequest, gin.H{"error": "no clip file"})
			return
		}
		defer clipFile.Close()

		clipData, readErr := io.ReadAll(clipFile)
		if readErr != nil || len(clipData) < 1000 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "clip too small or unreadable"})
			return
		}

		// Delete the previous clip from CDN before uploading the new one — prevents
		// one file per liveshare clip capture accumulating on the storage bucket.
		if session.PreviewURL != "" && strings.Contains(session.PreviewURL, "b-cdn.net") {
			utils.DeleteFromBunnyCDN(session.PreviewURL)
		}

		ext := filepath.Ext(clipHeader.Filename)
		if ext == "" {
			ext = ".webm"
		}
		clipFilename := fmt.Sprintf("session_%s_preview_%d%s", sessionID, time.Now().UnixNano(), ext)
		clipURL := fmt.Sprintf("/uploads/previews/%s", clipFilename)
		if cdnURL, uploadErr := utils.UploadPreviewToBunnyCDN(clipData, clipFilename); uploadErr == nil {
			clipURL = cdnURL
		}

		DB.Model(&models.WatchSession{}).Where("session_id = ?", sessionID).Update("preview_url", clipURL)

		broadcastData := map[string]interface{}{
			"type":             "session_preview_updated",
			"session_id":       sessionID,
			"poster_url":       session.PosterURL,
			"preview_url":      clipURL,
			"liveshare_mode":   session.LiveshareMode,
			"podcast_title":    session.PodcastTitle,
			"podcast_logo_url": session.PodcastLogoURL,
		}
		broadcastJSON, _ := json.Marshal(broadcastData)
		hub.BroadcastToLobby(OutgoingMessage{Data: broadcastJSON, IsBinary: false})
		log.Printf("✅ [UploadSessionFrames] Liveshare clip uploaded for session %s: %s", sessionID, clipURL)
		c.JSON(http.StatusOK, gin.H{"message": "Liveshare preview clip updated", "preview_url": clipURL})
		return
	}

	// All remaining paths require a "frames" multipart field
	form := c.Request.MultipartForm
	files := form.File["frames"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No frames provided"})
		return
	}

	log.Printf("📥 [UploadSessionFrames] Received %d frames for session %s", len(files), sessionID)

	timestamp := time.Now().Unix()
	tempDir := filepath.Join(PreviewsDir, fmt.Sprintf("temp_session_%s_%d", sessionID, timestamp))
	if err := os.MkdirAll(tempDir, os.ModePerm); err != nil {
		log.Printf("❌ [UploadSessionFrames] Failed to create temp dir: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create temp directory"})
		return
	}
	defer os.RemoveAll(tempDir)

	for i, fileHeader := range files {
		file, err := fileHeader.Open()
		if err != nil {
			log.Printf("❌ [UploadSessionFrames] Failed to open frame %d: %v", i, err)
			continue
		}
		framePath := filepath.Join(tempDir, fmt.Sprintf("frame_%03d.jpg", i))
		out, err := os.Create(framePath)
		if err != nil {
			file.Close()
			log.Printf("❌ [UploadSessionFrames] Failed to create frame file %d: %v", i, err)
			continue
		}
		if _, err := io.Copy(out, file); err != nil {
			log.Printf("❌ [UploadSessionFrames] Failed to save frame %d: %v", i, err)
		}
		out.Close()
		file.Close()
	}

	posterFilename := fmt.Sprintf("session_%s_poster_%d.jpg", sessionID, timestamp)
	posterPath := filepath.Join(PreviewsDir, posterFilename)
	firstFramePath := filepath.Join(tempDir, "frame_000.jpg")

	if err := copyFile(firstFramePath, posterPath); err != nil {
		log.Printf("❌ [UploadSessionFrames] Failed to create poster: %v", err)
	} else {
		cwd, _ := os.Getwd()
		log.Printf("📂 [UploadSessionFrames] cwd=%s posterPath=%s", cwd, posterPath)
		if _, statErr := os.Stat(posterPath); statErr != nil {
			log.Printf("❌ [UploadSessionFrames] Poster file missing on disk after copy: %v", statErr)
		} else {
			log.Printf("✅ [UploadSessionFrames] Poster file confirmed on disk")
		}
	}
	posterURL := fmt.Sprintf("/uploads/previews/%s", posterFilename)

	// For liveshare snapshots, skip MP4 — a static poster is all we need
	if sourceType == "liveshare" {
		// Delete the previous poster from CDN before uploading the new one.
		if session.PosterURL != "" && strings.Contains(session.PosterURL, "b-cdn.net") {
			utils.DeleteFromBunnyCDN(session.PosterURL)
		}
		if fileData, readErr := os.ReadFile(posterPath); readErr == nil {
			if cdnURL, uploadErr := utils.UploadPreviewToBunnyCDN(fileData, posterFilename); uploadErr == nil {
				posterURL = cdnURL
				if strings.HasPrefix(cdnURL, "http") {
					os.Remove(posterPath) // only clean up local file when CDN took over
				}
			}
		}
		DB.Model(&models.WatchSession{}).Where("session_id = ?", sessionID).Update("poster_url", posterURL)
		broadcastData := map[string]interface{}{
			"type":             "session_preview_updated",
			"session_id":       sessionID,
			"poster_url":       posterURL,
			"preview_url":      "",
			"liveshare_mode":   session.LiveshareMode,
			"podcast_title":    session.PodcastTitle,
			"podcast_logo_url": session.PodcastLogoURL,
		}
		broadcastJSON, _ := json.Marshal(broadcastData)
		hub.BroadcastToLobby(OutgoingMessage{Data: broadcastJSON, IsBinary: false})
		log.Printf("✅ [UploadSessionFrames] Liveshare poster broadcast for session %s", sessionID)
		c.JSON(http.StatusOK, gin.H{"message": "Liveshare poster updated", "session_id": sessionID, "poster_url": posterURL})
		return
	}

	// Generate MP4 from frames
	mp4Filename := fmt.Sprintf("session_%s_preview_%d.mp4", sessionID, timestamp)
	mp4Path := filepath.Join(PreviewsDir, mp4Filename)
	framesPattern := filepath.Join(tempDir, "frame_%03d.jpg")

	log.Printf("🎞️ [UploadSessionFrames] Generating MP4 from %d frames", len(files))
	if err := utils.GenerateMP4FromFrames(framesPattern, mp4Path, 5); err != nil {
		log.Printf("❌ [UploadSessionFrames] MP4 generation failed: %v", err)
		// Still update DB and broadcast poster so lobby reflects the new camera frame
		DB.Model(&models.WatchSession{}).Where("session_id = ?", sessionID).Update("poster_url", posterURL)
		fallbackBroadcast := map[string]interface{}{
			"type":        "session_preview_updated",
			"session_id":  sessionID,
			"poster_url":  posterURL,
			"preview_url": "",
		}
		fallbackJSON, _ := json.Marshal(fallbackBroadcast)
		hub.BroadcastToLobby(OutgoingMessage{Data: fallbackJSON, IsBinary: false})
		c.JSON(http.StatusOK, gin.H{
			"message":     "Frames uploaded but MP4 generation failed",
			"session_id":  sessionID,
			"poster_url":  posterURL,
			"preview_url": "",
		})
		return
	}

	mp4URL := fmt.Sprintf("/uploads/previews/%s", mp4Filename)
	log.Printf("✅ [UploadSessionFrames] MP4 generated: %s", mp4URL)

	// Upload to CDN so lobby clients don't hit Railway disk directly
	if fileData, readErr := os.ReadFile(mp4Path); readErr == nil {
		if cdnURL, uploadErr := utils.UploadPreviewToBunnyCDN(fileData, mp4Filename); uploadErr == nil {
			mp4URL = cdnURL
			if strings.HasPrefix(cdnURL, "http") {
				os.Remove(mp4Path) // only clean up local file when CDN took over
			}
		}
	}

	// ✅ Update session with preview URLs in database
	if err := DB.Model(&models.WatchSession{}).
		Where("session_id = ?", sessionID).
		Updates(map[string]interface{}{
			"poster_url":  posterURL,
			"preview_url": mp4URL,
		}).Error; err != nil {
		log.Printf("❌ [UploadSessionFrames] Failed to update session preview URLs: %v", err)
	} else {
		log.Printf("✅ [UploadSessionFrames] Session preview URLs updated in database")
	}

	// ✅ Broadcast preview update to lobby WebSocket (roomID=0)
	broadcastData := map[string]interface{}{
		"type":        "session_preview_updated",
		"session_id":  sessionID,
		"poster_url":  posterURL,
		"preview_url": mp4URL,
	}
	broadcastJSON, _ := json.Marshal(broadcastData)
	
	log.Printf("📡 [UploadSessionFrames] Broadcasting preview update to lobby...")
	hub.BroadcastToLobby(OutgoingMessage{
		Data:     broadcastJSON,
		IsBinary: false,
	})
	log.Printf("✅ [UploadSessionFrames] Lobby broadcast sent for session %s", sessionID)

	c.JSON(http.StatusOK, gin.H{
		"message":     "Frames uploaded and MP4 generated",
		"session_id":  sessionID,
		"poster_url":  posterURL,
		"preview_url": mp4URL,
	})
}

// UploadCustomBackgroundHandler saves a custom background image for the Custom watch type.
// POST /api/upload/custom-background  (multipart field: "image")
// Returns { "url": "/uploads/custom_backgrounds/filename.jpg" }
func UploadCustomBackgroundHandler(c *gin.Context) {
	file, header, err := c.Request.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing image field"})
		return
	}
	defer file.Close()

	// Validate content-type (JPEG / PNG / WebP only)
	ct := header.Header.Get("Content-Type")
	var ext string
	switch ct {
	case "image/jpeg", "image/jpg":
		ext = ".jpg"
	case "image/png":
		ext = ".png"
	case "image/webp":
		ext = ".webp"
	default:
		// Fallback: derive from filename
		e := strings.ToLower(filepath.Ext(header.Filename))
		if e == ".jpg" || e == ".jpeg" || e == ".png" || e == ".webp" {
			ext = e
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported image type (jpeg/png/webp only)"})
			return
		}
	}

	dir := "./uploads/custom_backgrounds"
	if err := os.MkdirAll(dir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "storage error"})
		return
	}

	filename := fmt.Sprintf("bg_%d%s", time.Now().UnixMilli(), ext)
	destPath := filepath.Join(dir, filename)

	out, err := os.Create(destPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save image"})
		return
	}
	defer out.Close()

	if _, err := io.Copy(out, file); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to write image"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"url": "/uploads/custom_backgrounds/" + filename})
}

// Helper function to copy files
func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	return err
}

// CleanupSessionPreviews deletes all preview files for a session
func CleanupSessionPreviews(sessionID string) error {
	pattern := filepath.Join(PreviewsDir, fmt.Sprintf("session_%s_*", sessionID))
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return fmt.Errorf("failed to find preview files: %w", err)
	}

	for _, filePath := range matches {
		if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
			log.Printf("⚠️ [CleanupSessionPreviews] Failed to delete %s: %v", filePath, err)
		} else {
			log.Printf("🗑️ [CleanupSessionPreviews] Deleted: %s", filePath)
		}
	}

	return nil
}

// RequestFrameCaptureHandler sends WebSocket message to session host to capture frames
func RequestFrameCaptureHandler(c *gin.Context) {
	sessionID := c.Param("id")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Session ID is required"})
		return
	}

	log.Printf("📸 [RequestFrameCapture] Request received for session: %s", sessionID)

	// Verify session exists and is active
	var session models.WatchSession
	result := DB.Where("session_id = ? AND ended_at IS NULL", sessionID).First(&session)
	if result.Error != nil {
		log.Printf("❌ [RequestFrameCapture] Session not found: %s", sessionID)
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found or ended"})
		return
	}

	// ✅ Check if preview generation is enabled for this session
	if !session.PreviewEnabled {
		log.Printf("⏸️ [RequestFrameCapture] Preview generation disabled for session %s, skipping", sessionID)
		c.JSON(http.StatusOK, gin.H{
			"message": "Preview generation is disabled for this session",
		})
		return
	}

	// Get source from request body
	var requestData struct {
		Source string `json:"source"` // "liveshare" or "watchfrom"
	}
	if err := c.ShouldBindJSON(&requestData); err != nil {
		log.Printf("❌ [RequestFrameCapture] Invalid request body: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	log.Printf("📡 [RequestFrameCapture] Sending capture request to session %s (source: %s)", sessionID, requestData.Source)

	// Get hub and broadcast to session room
	hub := GetHub()
	if hub == nil {
		log.Printf("❌ [RequestFrameCapture] Hub not available")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "WebSocket hub not available"})
		return
	}

	// Broadcast to all clients in the session room (host will handle it)
	message := map[string]interface{}{
		"type": "capture_preview_frames",
		"data": map[string]interface{}{
			"session_id": sessionID,
			"source":     requestData.Source,
		},
	}

	// Marshal message to JSON bytes
	messageBytes, err := json.Marshal(message)
	if err != nil {
		log.Printf("❌ [RequestFrameCapture] Failed to marshal message: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create broadcast message"})
		return
	}

	// Send as OutgoingMessage
	hub.BroadcastToRoom(session.RoomID, OutgoingMessage{
		Data:     messageBytes,
		IsBinary: false,
	}, nil)
	log.Printf("✅ [RequestFrameCapture] Capture request sent to room %d", session.RoomID)

	c.JSON(http.StatusOK, gin.H{
		"message":    "Frame capture requested",
		"session_id": sessionID,
	})
}
