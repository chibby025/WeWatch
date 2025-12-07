// backend/internal/handlers/room_handlers.go
package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"wewatch-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CreateWatchSessionWithType is a helper function to create a watch session
// Returns the created session or an error
func CreateWatchSessionWithType(roomID uint, hostID uint, watchType string) (*models.WatchSession, error) {
	sessionID := uuid.New().String()
	session := models.WatchSession{
		SessionID: sessionID,
		RoomID:    roomID,
		HostID:    hostID,
		WatchType: watchType,
		StartedAt: time.Now(),
	}

	if err := DB.Create(&session).Error; err != nil {
		log.Printf("❌ CreateWatchSessionWithType: Failed to create session: %v", err)
		return nil, err
	}

	log.Printf("✅ CreateWatchSessionWithType: Created session %s for room %d (type: %s)", sessionID, roomID, watchType)
	return &session, nil
}

// GetRoomMessages handles GET /api/rooms/:id/messages
func GetRoomMessages(c *gin.Context) {
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	var messages []models.RoomMessage
	if err := DB.Where("room_id = ?", uint(roomID)).
		Order("created_at ASC").
		Find(&messages).Error; err != nil {
		log.Printf("Error fetching room messages: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch messages"})
		return
	}

	// Populate usernames
	for i := range messages {
		var user models.User
		if err := DB.Select("username").Where("id = ?", messages[i].UserID).First(&user).Error; err == nil {
			messages[i].Username = user.Username
		}
	}

	c.JSON(http.StatusOK, gin.H{"messages": messages})
}

// CreateRoomMessage creates a new persistent message in a room
func CreateRoomMessage(c *gin.Context) {
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// Get authenticated user ID
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var input struct {
		Message string `json:"message" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message is required"})
		return
	}

	// Get username
	var user models.User
	if err := DB.Select("username").Where("id = ?", userID).First(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user"})
		return
	}

	message := models.RoomMessage{
		RoomID:    uint(roomID),
		UserID:    userID.(uint),
		Username:  user.Username,
		Message:   input.Message,
		CreatedAt: time.Now(),
	}

	if err := DB.Create(&message).Error; err != nil {
		log.Printf("Error creating room message: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create message"})
		return
	}

	// Broadcast message via WebSocket to all room members
	broadcastMsg := map[string]interface{}{
		"type": "room_chat",
		"data": map[string]interface{}{
			"id":         message.ID,
			"user_id":    message.UserID,
			"username":   message.Username,
			"message":    message.Message,
			"created_at": message.CreatedAt,
		},
	}
	if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
		hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
	} else {
		log.Printf("Failed to marshal room chat message: %v", err)
	}

	c.JSON(http.StatusCreated, gin.H{"message": message})
}

// CreateWatchSession creates a new watch session for a room
func CreateWatchSession(c *gin.Context) {
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// Get authenticated user ID
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var input struct {
		WatchType string `json:"watch_type" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "watch_type is required"})
		return
	}

	// Validate watch_type
	if input.WatchType != "video" && input.WatchType != "3d_cinema" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "watch_type must be 'video' or '3d_cinema'"})
		return
	}

	// Check if there's already an active session
	var existingSession models.WatchSession
	if err := DB.Where("room_id = ? AND ended_at IS NULL", uint(roomID)).First(&existingSession).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{
			"error":      "Active session already exists",
			"session_id": existingSession.SessionID,
		})
		return
	}

	// Create new session with watch_type
	session, err := CreateWatchSessionWithType(uint(roomID), userID.(uint), input.WatchType)
	if err != nil {
		log.Printf("Error creating watch session: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	// Broadcast session started to all room members
	sessionMsg := map[string]interface{}{
		"type": "session_started",
		"data": map[string]interface{}{
			"session_id": session.SessionID,
			"watch_type": session.WatchType,
			"host_id":    session.HostID,
		},
	}
	if msgBytes, err := json.Marshal(sessionMsg); err == nil {
		hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
	} else {
		log.Printf("Failed to marshal session_started message: %v", err)
	}

	c.JSON(http.StatusCreated, gin.H{
		"session_id": session.SessionID,
		"watch_type": session.WatchType,
	})
}

// DeleteRoomMessage deletes a room message (with host permissions)
func DeleteRoomMessage(c *gin.Context) {
	messageIDStr := c.Param("message_id")
	messageID, err := strconv.ParseUint(messageIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid message ID"})
		return
	}

	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDValue.(uint)

	var message models.RoomMessage
	if err := DB.Where("id = ?", messageID).First(&message).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Message not found"})
		} else {
			log.Printf("Database error finding message %d: %v", messageID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// Check if user is the sender or room host
	isOwner := message.UserID == userID
	isHost := false

	if !isOwner {
		var room models.Room
		if err := DB.First(&room, uint(roomID)).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch room"})
			return
		}
		if room.HostID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Cannot delete other users' messages"})
			return
		}
		isHost = true
	}

	// If host is deleting someone else's message, soft delete with flag
	if isHost && !isOwner {
		message.Message = "[Message deleted by host]"
		message.DeletedByHost = true
		if err := DB.Save(&message).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete message"})
			return
		}

		// Broadcast the update
		broadcastMsg := map[string]interface{}{
			"type": "room_message_deleted",
			"data": map[string]interface{}{
				"id":              message.ID,
				"message":         message.Message,
				"deleted_by_host": true,
			},
		}
		if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
			hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
		}

		c.JSON(http.StatusOK, gin.H{"message": "Message deleted", "deleted_by_host": true})
	} else {
		// Owner deleting their own message - hard delete
		if err := DB.Delete(&message).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete message"})
			return
		}

		// Broadcast the deletion
		broadcastMsg := map[string]interface{}{
			"type": "room_message_removed",
			"data": map[string]interface{}{
				"id": message.ID,
			},
		}
		if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
			hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
		}

		c.JSON(http.StatusOK, gin.H{"message": "Message deleted", "deleted_by_host": false})
	}
}

// EditRoomMessage edits a room message (owner only)
func EditRoomMessage(c *gin.Context) {
	messageIDStr := c.Param("message_id")
	messageID, err := strconv.ParseUint(messageIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid message ID"})
		return
	}

	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDValue.(uint)

	var input struct {
		Message string `json:"message" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message is required"})
		return
	}

	var message models.RoomMessage
	if err := DB.Where("id = ?", messageID).First(&message).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Message not found"})
		} else {
			log.Printf("Database error finding message %d: %v", messageID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// Only owner can edit
	if message.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot edit other users' messages"})
		return
	}

	// Update message
	message.Message = input.Message
	if err := DB.Save(&message).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update message"})
		return
	}

	// Broadcast the update
	broadcastMsg := map[string]interface{}{
		"type": "room_message_edited",
		"data": map[string]interface{}{
			"id":      message.ID,
			"message": message.Message,
		},
	}
	if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
		hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
	}

	c.JSON(http.StatusOK, gin.H{"message": message.Message})
}

