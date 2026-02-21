package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"wewatch-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// GetRoomTVContent fetches active TV content for a room
// Optionally filter by session_id query param
func GetRoomTVContent(c *gin.Context) {
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// Optional session filtering
	sessionIDStr := c.Query("session_id")
	
	var content []models.RoomTVContent
	now := time.Now()

	query := DB.Where("room_id = ? AND ends_at > ?", uint(roomID), now)
	
	// If session_id provided, filter by it (or NULL for room-level content)
	if sessionIDStr != "" {
		sessionID, err := strconv.ParseUint(sessionIDStr, 10, 32)
		if err == nil {
			// Get content for this session OR room-level content (session_id IS NULL)
			query = query.Where("session_id = ? OR session_id IS NULL", uint(sessionID))
		}
	} else {
		// No session specified - only return room-level content (session_id IS NULL)
		query = query.Where("session_id IS NULL")
	}

	// Get active content
	if err := query.Order("starts_at DESC").Find(&content).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch TV content"})
		return
	}

	// Return most recent active content (if any)
	if len(content) > 0 {
		c.JSON(http.StatusOK, content[0])
	} else {
		c.JSON(http.StatusOK, nil)
	}
}

// CreateRoomTVContent allows host to create announcement/media content
func CreateRoomTVContent(c *gin.Context) {
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	// Verify user is host
	var room models.Room
	if err := DB.First(&room, uint(roomID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	if room.HostID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only host can create TV content"})
		return
	}

	var input struct {
		ContentType    string `json:"content_type" binding:"required"` // 'announcement' or 'media'
		Title          string `json:"title" binding:"required"`
		Description    string `json:"description"`
		ContentURL     string `json:"content_url"`
		ThumbnailURL   string `json:"thumbnail_url"`
		DurationMins   int    `json:"duration_mins" binding:"required"` // How long to display
		AnimationType  string `json:"animation_type"`                   // 'scroll-left', 'fade-pulse', etc.
		TextColor      string `json:"text_color"`                       // Hex color like '#FF6B35'
		BgGradient     string `json:"bg_gradient"`                      // CSS gradient string
		AnimationSpeed string `json:"animation_speed"`                  // 'slow', 'medium', 'fast'
		SessionID      *uint  `json:"session_id"`                       // Links to active session (optional)
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate content type
	if input.ContentType != "announcement" && input.ContentType != "media" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Content type must be 'announcement' or 'media'"})
		return
	}

	now := time.Now()
	endsAt := now.Add(time.Duration(input.DurationMins) * time.Minute)

	content := models.RoomTVContent{
		RoomID:         uint(roomID),
		SessionID:      input.SessionID,
		ContentType:    input.ContentType,
		Title:          input.Title,
		Description:    input.Description,
		ContentURL:     input.ContentURL,
		ThumbnailURL:   input.ThumbnailURL,
		AnimationType:  input.AnimationType,
		TextColor:      input.TextColor,
		BgGradient:     input.BgGradient,
		AnimationSpeed: input.AnimationSpeed,
		StartsAt:       now,
		EndsAt:         endsAt,
		CreatedBy:      userID.(uint),
	}

	if err := DB.Create(&content).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create TV content"})
		return
	}

	// Broadcast to room via WebSocket
	broadcastMsg := map[string]interface{}{
		"type":    "room_tv_content_created",
		"content": content,
	}
	if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
		log.Printf("📺 [RoomTV] Broadcasting content_created to room %d: %s", roomID, string(msgBytes))
		hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
		log.Printf("✅ [RoomTV] Broadcast complete for room %d", roomID)
	} else {
		log.Printf("❌ [RoomTV] Failed to marshal broadcast message: %v", err)
	}

	c.JSON(http.StatusCreated, content)
}

// DeleteRoomTVContent allows host to dismiss content early
func DeleteRoomTVContent(c *gin.Context) {
	roomIDStr := c.Param("id")
	contentIDStr := c.Param("content_id")

	roomID, err := strconv.ParseUint(roomIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	contentID, err := strconv.ParseUint(contentIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid content ID"})
		return
	}

	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	// Verify user is host
	var room models.Room
	if err := DB.First(&room, uint(roomID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	if room.HostID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only host can delete TV content"})
		return
	}

	// Delete content
	if err := DB.Where("id = ? AND room_id = ?", uint(contentID), uint(roomID)).
		Delete(&models.RoomTVContent{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete TV content"})
		return
	}

	// Broadcast removal
	broadcastMsg := map[string]interface{}{
		"type":       "room_tv_content_removed",
		"content_id": uint(contentID),
	}
	if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
		hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
	}

	c.JSON(http.StatusOK, gin.H{"message": "TV content dismissed"})
}

// UploadTVMedia handles video file uploads for RoomTV
// Max file size: 100 MB (separate from 1GB watch session limit)
func UploadTVMedia(c *gin.Context) {
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	// Verify user is host
	var room models.Room
	if err := DB.First(&room, uint(roomID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	if room.HostID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only host can upload TV content"})
		return
	}

	// Get file from form
	file, err := c.FormFile("video")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No video file provided"})
		return
	}

	// Get other form fields
	title := c.PostForm("title")
	description := c.PostForm("description")
	durationMinsStr := c.PostForm("duration_mins")
	videoDurationStr := c.PostForm("video_duration") // seconds, from frontend
	animationType := c.PostForm("animation_type")
	textColor := c.PostForm("text_color")
	bgGradient := c.PostForm("bg_gradient")
	animationSpeed := c.PostForm("animation_speed")
	sessionIDStr := c.PostForm("session_id")

	if title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Title is required"})
		return
	}

	durationMins, err := strconv.Atoi(durationMinsStr)
	if err != nil || durationMins < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid duration"})
		return
	}

	// Validate file size (100 MB = 104857600 bytes) - RoomTV specific limit
	const maxFileSize int64 = 100 * 1024 * 1024
	if file.Size > maxFileSize {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("File too large. Max size: 100 MB, uploaded: %.2f MB", 
				float64(file.Size)/1024/1024),
		})
		return
	}

	// Validate file type
	fileExt := strings.ToLower(filepath.Ext(file.Filename))
	mimeType := file.Header.Get("Content-Type")
	
	allowedExts := map[string]string{
		".mp4":  "video/mp4",
		".webm": "video/webm",
	}
	
	allowedType, validExt := allowedExts[fileExt]
	if !validExt || !strings.Contains(mimeType, "video") {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid file type. Only MP4 and WebM videos are allowed",
		})
		return
	}

	// Parse video duration (client-validated)
	videoDuration := 0
	if videoDurationStr != "" {
		videoDuration, _ = strconv.Atoi(videoDurationStr)
	}

	// Validate video duration (10 minutes = 600 seconds)
	if videoDuration > 600 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Video too long. Max duration: 10 minutes, uploaded: %.1f minutes", 
				float64(videoDuration)/60),
		})
		return
	}

	// Generate unique filename
	uniqueID := uuid.New().String()
	filename := fmt.Sprintf("%s%s", uniqueID, fileExt)
	
	// Create directory if not exists
	uploadDir := "./uploads/tv-content"
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create upload directory"})
		return
	}

	// Save file
	filePath := filepath.Join(uploadDir, filename)
	if err := c.SaveUploadedFile(file, filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	// Build public URL
	publicURL := fmt.Sprintf("/uploads/tv-content/%s", filename)
	
	// Parse session_id
	var sessionID *uint
	if sessionIDStr != "" {
		if sid, err := strconv.ParseUint(sessionIDStr, 10, 32); err == nil {
			uidVal := uint(sid)
			sessionID = &uidVal
		}
	}

	// Create database record
	now := time.Now()
	endsAt := now.Add(time.Duration(durationMins) * time.Minute)
	
	fileSize := file.Size
	videoDurationInt := videoDuration
	
	content := models.RoomTVContent{
		RoomID:         uint(roomID),
		SessionID:      sessionID,
		ContentType:    "media",
		Title:          title,
		Description:    description,
		ContentURL:     publicURL,
		FileSize:       &fileSize,
		FileType:       allowedType,
		IsUploaded:     true,
		VideoDuration:  &videoDurationInt,
		FilePath:       filePath,
		AnimationType:  animationType,
		TextColor:      textColor,
		BgGradient:     bgGradient,
		AnimationSpeed: animationSpeed,
		StartsAt:       now,
		EndsAt:         endsAt,
		CreatedBy:      userID.(uint),
		AdType:         "host_ad",   // Default to host ad
		RevenueShare:   100.00,      // Host keeps 100%
	}

	if err := DB.Create(&content).Error; err != nil {
		// Delete file if database insert fails
		os.Remove(filePath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create TV content record"})
		return
	}

	// Broadcast to room via WebSocket
	broadcastMsg := map[string]interface{}{
		"type":    "room_tv_content_created",
		"content": content,
	}
	if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
		hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
	}

	log.Printf("✅ TV video uploaded: ID=%d, Room=%d, File=%s, Size=%.2f MB", 
		content.ID, roomID, filename, float64(file.Size)/1024/1024)

	c.JSON(http.StatusCreated, gin.H{
		"message": "Video uploaded successfully",
		"content": content,
	})
}

// MarkTVContentCompleted handles video completion events from client
// EVENT-DRIVEN DELETION: No cron needed, deletes immediately on completion
func MarkTVContentCompleted(c *gin.Context) {
	contentIDStr := c.Param("content_id")
	contentID, err := strconv.ParseUint(contentIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid content ID"})
		return
	}

	// Fetch content
	var content models.RoomTVContent
	if err := DB.First(&content, uint(contentID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Content not found"})
		return
	}

	// ✅ EVENT-DRIVEN DELETION (no cron needed!)
	// Delete file if uploaded
	if content.IsUploaded && content.FilePath != "" {
		if err := os.Remove(content.FilePath); err != nil {
			log.Printf("⚠️ Failed to delete video file %s: %v", content.FilePath, err)
		} else {
			log.Printf("✅ Deleted video file: %s", content.FilePath)
		}
	}

	// Delete database record
	if err := DB.Delete(&content).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete content"})
		return
	}

	// Broadcast removal to room
	broadcastMsg := map[string]interface{}{
		"type":       "room_tv_content_removed",
		"content_id": uint(contentID),
	}
	if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
		hub.BroadcastToRoom(content.RoomID, OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
	}

	log.Printf("✅ TV content completed and deleted: ID=%d, Room=%d", contentID, content.RoomID)
	c.JSON(http.StatusOK, gin.H{"message": "Content completed and deleted"})
}
