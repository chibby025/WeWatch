package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// HandleStreamURL handles requests to add a stream URL to a room's playlist
func HandleStreamURL(c *gin.Context) {
	log.Println("🔗 HandleStreamURL CALLED")

	// 1. Get user ID from context (AuthMiddleware)
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		log.Println("HandleStreamURL: Unauthorized access, user_id not found in context")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
		return
	}

	userID, ok := userIDInterface.(uint)
	if !ok {
		log.Println("HandleStreamURL: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user ID format"})
		return
	}

	// 2. Get room ID from URL params
	roomIDStr := c.Param("id")
	if roomIDStr == "" {
		log.Println("HandleStreamURL: Missing room ID parameter")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Room ID is required"})
		return
	}

	roomIDUint64, err := strconv.ParseUint(roomIDStr, 10, 32)
	if err != nil {
		log.Printf("HandleStreamURL: Invalid room ID format: %s", roomIDStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID format"})
		return
	}
	roomID := uint(roomIDUint64)

	// 3. Parse request body
	var req struct {
		StreamURL string `json:"stream_url" binding:"required"`
		SessionID string `json:"session_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("HandleStreamURL: Error parsing request body: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	log.Printf("HandleStreamURL: Room ID: %d, User ID: %d, Stream URL: %s", roomID, userID, req.StreamURL)

	// 4. Validate URL format
	parsedURL, err := url.Parse(req.StreamURL)
	if err != nil || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
		log.Printf("HandleStreamURL: Invalid URL format: %s", req.StreamURL)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid URL format. Must be http or https."})
		return
	}

	// 5. Check if URL is a supported embed platform (Google Drive, YouTube, Twitch).
	// Embed URLs bypass the video-extension and accessibility checks — they are rendered
	// as iframes in the player rather than fed to a <video> element.
	originalURL := req.StreamURL
	embedResult := utils.DetectEmbedPlatform(originalURL)

	if embedResult.IsEmbed {
		log.Printf("✅ HandleStreamURL: Embed platform detected (%s) → %s", embedResult.Platform, embedResult.EmbedURL)

		var room models.Room
		if err := DB.First(&room, roomID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			}
			return
		}

		now := time.Now()
		mediaItem := models.TemporaryMediaItem{
			FilePath:          embedResult.EmbedURL,
			FileName:          embedResult.Platform,
			OriginalName:      originalURL,
			MimeType:          "text/html",
			FileSize:          0,
			SessionID:         req.SessionID,
			RoomID:            roomID,
			UploaderID:        userID,
			IsStream:          false,
			IsEmbed:           true,
			EmbedPlatform:     embedResult.Platform,
			OriginalStreamURL: originalURL,
			CreatedAt:         now,
			UpdatedAt:         now,
		}
		if err := DB.Create(&mediaItem).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save embed URL"})
			return
		}

		hub := GetWebSocketManager()
		if hub != nil {
			broadcastMsg := map[string]interface{}{
				"type":                "media_added",
				"media_id":            mediaItem.ID,
				"file_path":           mediaItem.FilePath,
				"file_name":           mediaItem.FileName,
				"original_name":       mediaItem.OriginalName,
				"is_stream":           false,
				"is_embed":            true,
				"embed_platform":      embedResult.Platform,
				"original_stream_url": originalURL,
				"uploader_id":         mediaItem.UploaderID,
				"created_at":          mediaItem.CreatedAt,
				"session_id":          req.SessionID,
			}
			if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
				hub.BroadcastToRoom(roomID, OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Embed URL added successfully",
			"media": gin.H{
				"id":             mediaItem.ID,
				"file_path":      mediaItem.FilePath,
				"original_name":  mediaItem.OriginalName,
				"is_embed":       true,
				"embed_platform": embedResult.Platform,
				"uploader_id":    mediaItem.UploaderID,
				"created_at":     mediaItem.CreatedAt,
			},
		})
		return
	}

	// 6. Non-embed path: validate that URL points to a direct video file. This first
	// pass is purely syntactic (host + extension) — it catches known file-locker
	// domains and non-video links without a network round trip.
	directURL := utils.ConvertToDirectStreamURL(originalURL)
	log.Printf("🔗 HandleStreamURL: Original URL: %s", originalURL)
	log.Printf("🔗 HandleStreamURL: Direct URL: %s", directURL)

	classification := utils.ClassifyDirectVideoURL(directURL)
	if !classification.Valid {
		log.Printf("❌ HandleStreamURL: URL rejected (%s): %s", classification.Reason, directURL)
		c.JSON(http.StatusBadRequest, gin.H{
			"error":  classification.Message,
			"reason": classification.Reason,
		})
		return
	}
	log.Printf("✅ HandleStreamURL: URL validation passed")

	// 7. Test if the URL is actually reachable AND actually serves video content. A
	// 200 status alone isn't proof — plenty of download-portal links return 200 for
	// an HTML wait-timer/interstitial page even when the URL itself ends in a video
	// extension (e.g. "Movie.mkv.html"). Checking the real Content-Type is what
	// catches those.
	log.Printf("🔍 HandleStreamURL: Testing URL accessibility and content type...")
	accessible, isVideoContent, contentType := utils.CheckURLAccessibility(directURL)
	if !accessible {
		log.Printf("❌ HandleStreamURL: URL is not accessible: %s", directURL)
		c.JSON(http.StatusForbidden, gin.H{
			"error":  "Unable to access the video URL. Please ensure it's a public link.",
			"reason": "not_accessible",
		})
		return
	}
	if !isVideoContent {
		log.Printf("❌ HandleStreamURL: URL accessible but not video content (Content-Type: %q): %s", contentType, directURL)
		c.JSON(http.StatusBadRequest, gin.H{
			"error":  utils.NotVideoContentMessage(contentType),
			"reason": "not_video_content",
		})
		return
	}

	// 8. Verify room exists
	var room models.Room
	result := DB.First(&room, roomID)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			log.Printf("HandleStreamURL: Room with ID %d not found", roomID)
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		} else {
			log.Printf("HandleStreamURL: Database error fetching room %d: %v", roomID, result.Error)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// 9. Create TemporaryMediaItem record
	now := time.Now()
	mediaItem := models.TemporaryMediaItem{
		FilePath:          directURL,
		FileName:          parsedURL.Path,
		OriginalName:      originalURL,
		MimeType:          "video/mp4",
		FileSize:          0,
		SessionID:         req.SessionID,
		RoomID:            roomID,
		UploaderID:        userID,
		IsStream:          true,
		OriginalStreamURL: originalURL,
		CreatedAt:         now,
		UpdatedAt:         now,
	}

	if err := DB.Create(&mediaItem).Error; err != nil {
		log.Printf("HandleStreamURL: Error creating media item: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save stream URL"})
		return
	}

	log.Printf("✅ HandleStreamURL: Stream URL added successfully. Media ID: %d", mediaItem.ID)

	// 10. Broadcast to room via WebSocket
	hub := GetWebSocketManager()
	if hub == nil {
		log.Printf("⚠️ HandleStreamURL: WebSocket hub not available, skipping broadcast")
	} else {
		broadcastMsg := map[string]interface{}{
			"type":                "media_added",
			"media_id":            mediaItem.ID,
			"file_path":           mediaItem.FilePath,
			"file_name":           mediaItem.FileName,
			"original_name":       mediaItem.OriginalName,
			"is_stream":           mediaItem.IsStream,
			"original_stream_url": mediaItem.OriginalStreamURL,
			"uploader_id":         mediaItem.UploaderID,
			"created_at":          mediaItem.CreatedAt,
			"session_id":          req.SessionID,
		}

		msgBytes, err := json.Marshal(broadcastMsg)
		if err != nil {
			log.Printf("⚠️ HandleStreamURL: Error marshaling broadcast message: %v", err)
		} else {
			hub.BroadcastToRoom(roomID, OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
			log.Printf("✅ HandleStreamURL: Broadcasted media_added message to room %d", roomID)
		}
	}

	// 11. Return success response
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Stream URL added successfully",
		"media": gin.H{
			"id":                  mediaItem.ID,
			"file_path":           mediaItem.FilePath,
			"file_name":           mediaItem.FileName,
			"original_name":       mediaItem.OriginalName,
			"is_stream":           mediaItem.IsStream,
			"original_stream_url": mediaItem.OriginalStreamURL,
			"uploader_id":         mediaItem.UploaderID,
			"created_at":          mediaItem.CreatedAt,
		},
	})
}
