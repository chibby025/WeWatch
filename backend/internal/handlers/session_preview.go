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

// GenerateSessionPreviewHandler handles POST /api/sessions/:id/generate-preview
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
	gifFilename := fmt.Sprintf("session_%s_preview_%d.gif", sessionID, timestamp)
	posterPath := filepath.Join(PreviewsDir, posterFilename)
	gifPath := filepath.Join(PreviewsDir, gifFilename)

	var posterURL, gifURL string

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

		// Generate GIF (30 seconds)
		log.Printf("🎞️ [GenerateSessionPreview] Generating GIF from: %s", mediaPath)
		if err := utils.GeneratePreviewGIF(mediaPath, gifPath, startTime, 30); err != nil {
			log.Printf("❌ [GenerateSessionPreview] GIF generation failed: %v", err)
			gifURL = "" // Will fallback to poster
		} else {
			gifURL = fmt.Sprintf("/uploads/previews/%s", gifFilename)
			log.Printf("✅ [GenerateSessionPreview] GIF generated: %s", gifURL)
		}

	case "liveshare", "watchfrom":
		// For WebRTC streams, frontend will upload frames separately
		// This endpoint just acknowledges the request
		log.Printf("ℹ️ [GenerateSessionPreview] WebRTC source - expecting frame upload")
		posterURL = "/icons/placeholder-poster.jpg"
		gifURL = ""

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
		"preview_url": gifURL,
	})
}

// UploadSessionFramesHandler handles POST /api/sessions/:session_id/upload-frames
// Receives canvas-captured frames from WebRTC streams and generates GIF
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

	// Get uploaded frames
	form := c.Request.MultipartForm
	files := form.File["frames"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No frames provided"})
		return
	}

	log.Printf("📥 [UploadSessionFrames] Received %d frames for session %s", len(files), sessionID)

	// Create temporary directory for frames
	timestamp := time.Now().Unix()
	tempDir := filepath.Join(PreviewsDir, fmt.Sprintf("temp_session_%s_%d", sessionID, timestamp))
	if err := os.MkdirAll(tempDir, os.ModePerm); err != nil {
		log.Printf("❌ [UploadSessionFrames] Failed to create temp dir: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create temp directory"})
		return
	}
	defer os.RemoveAll(tempDir) // Cleanup temp directory

	// Save frames to disk
	for i, fileHeader := range files {
		file, err := fileHeader.Open()
		if err != nil {
			log.Printf("❌ [UploadSessionFrames] Failed to open frame %d: %v", i, err)
			continue
		}
		defer file.Close()

		framePath := filepath.Join(tempDir, fmt.Sprintf("frame_%03d.jpg", i))
		out, err := os.Create(framePath)
		if err != nil {
			log.Printf("❌ [UploadSessionFrames] Failed to create frame file %d: %v", i, err)
			continue
		}
		defer out.Close()

		if _, err := io.Copy(out, file); err != nil {
			log.Printf("❌ [UploadSessionFrames] Failed to save frame %d: %v", i, err)
			continue
		}
	}

	// Generate poster from first frame
	posterFilename := fmt.Sprintf("session_%s_poster_%d.jpg", sessionID, timestamp)
	posterPath := filepath.Join(PreviewsDir, posterFilename)
	firstFramePath := filepath.Join(tempDir, "frame_000.jpg")

	// Copy first frame as poster
	if err := copyFile(firstFramePath, posterPath); err != nil {
		log.Printf("❌ [UploadSessionFrames] Failed to create poster: %v", err)
	}
	posterURL := fmt.Sprintf("/uploads/previews/%s", posterFilename)

	// Generate GIF from frames
	gifFilename := fmt.Sprintf("session_%s_preview_%d.gif", sessionID, timestamp)
	gifPath := filepath.Join(PreviewsDir, gifFilename)
	framesPattern := filepath.Join(tempDir, "frame_%03d.jpg")

	log.Printf("🎞️ [UploadSessionFrames] Generating GIF from %d frames", len(files))
	if err := utils.GenerateGIFFromFrames(framesPattern, gifPath, 5); err != nil {
		log.Printf("❌ [UploadSessionFrames] GIF generation failed: %v", err)
		c.JSON(http.StatusOK, gin.H{
			"message":     "Frames uploaded but GIF generation failed",
			"session_id":  sessionID,
			"poster_url":  posterURL,
			"preview_url": "",
		})
		return
	}

	gifURL := fmt.Sprintf("/uploads/previews/%s", gifFilename)
	log.Printf("✅ [UploadSessionFrames] GIF generated successfully: %s", gifURL)

	// ✅ Update session with preview URLs in database
	if err := DB.Model(&models.WatchSession{}).
		Where("session_id = ?", sessionID).
		Updates(map[string]interface{}{
			"poster_url":  posterURL,
			"preview_url": gifURL,
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
		"preview_url": gifURL,
	}
	broadcastJSON, _ := json.Marshal(broadcastData)
	
	log.Printf("📡 [UploadSessionFrames] Broadcasting preview update to lobby...")
	hub.BroadcastToLobby(OutgoingMessage{
		Data:     broadcastJSON,
		IsBinary: false,
	})
	log.Printf("✅ [UploadSessionFrames] Lobby broadcast sent for session %s", sessionID)

	c.JSON(http.StatusOK, gin.H{
		"message":     "Frames uploaded and GIF generated",
		"session_id":  sessionID,
		"poster_url":  posterURL,
		"preview_url": gifURL,
	})
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
