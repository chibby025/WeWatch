package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"
	"wewatch-backend/internal/models"

	"github.com/gin-gonic/gin"
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
		hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
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
