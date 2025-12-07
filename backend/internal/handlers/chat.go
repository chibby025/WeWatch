// backend/internal/handlers/chat.go
package handlers

import (
	"log"
	"net/http"
	"strconv"
	//"encoding/json"
	"errors"

	"github.com/gin-gonic/gin"
	"wewatch-backend/internal/models"
	"gorm.io/gorm"
)

// internal/handlers/chat.go

// CreateChatMessageHandler handles POST /api/rooms/:id/chat
func CreateChatMessageHandler(c *gin.Context) {
	// ... (binding, validation, DB save logic remains the same) ...

	// Parse the full WebSocket message structure
	var wsInput struct {
		Type string `json:"type"`
		Data struct {
			Message   string `json:"message" binding:"required"`
			SessionID string `json:"session_id,omitempty"`
		} `json:"data"`
	}

	if err := c.ShouldBindJSON(&wsInput); err != nil {
		log.Printf("Binding error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDValue.(uint)

	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	sessionID := wsInput.Data.SessionID
	if sessionID == "" {
		sessionID = c.Query("session_id")
	}

	var user models.User
	if err := DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "User not found"})
		return
	}

	message := models.ChatMessage{
		RoomID:    uint(roomID),
		SessionID: sessionID,
		UserID:    userID,
		Username:  user.Username,
		Message:   wsInput.Data.Message,
	}

	if err := DB.Create(&message).Error; err != nil {
		log.Printf("Failed to save chat message: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save message"})
		return
	}

	// No broadcast here - broadcasting happens in websocket.go when a WebSocket message is received

	c.JSON(http.StatusOK, gin.H{
		"message": "Chat saved",
		"data":    message,
	})
}

func DeleteChatMessageHandler(c *gin.Context) {
    messageIDStr := c.Param("message_id")
    messageID, err := strconv.ParseUint(messageIDStr, 10, 64)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid message ID"})
        return
    }

    userIDValue, exists := c.Get("user_id")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }
    userID := userIDValue.(uint)

    var message models.ChatMessage

    // ✅ Explicitly query by ID
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
        if err := DB.First(&room, message.RoomID).Error; err != nil {
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
        c.JSON(http.StatusOK, gin.H{"message": "Message deleted", "deleted_by_host": true})
    } else {
        // Owner deleting their own message - hard delete
        if err := DB.Delete(&message).Error; err != nil {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete message"})
            return
        }
        c.JSON(http.StatusOK, gin.H{"message": "Message deleted", "deleted_by_host": false})
    }
}

// UpdateChatMessageHandler handles PUT /api/rooms/:id/chat/:message_id
func UpdateChatMessageHandler(c *gin.Context) {
	roomIDStr := c.Param("id")
	messageIDStr := c.Param("message_id")
	
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	
	messageID, err := strconv.ParseUint(messageIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid message ID"})
		return
	}

	// Get authenticated user ID
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDValue.(uint)

	// Parse request body
	var input struct {
		Message string `json:"message" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Find the message
	var message models.ChatMessage
	if err := DB.Where("id = ? AND room_id = ?", uint(messageID), uint(roomID)).First(&message).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Message not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// Check if user owns the message
	if message.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only edit your own messages"})
		return
	}

	// Update the message
	message.Message = input.Message
	if err := DB.Save(&message).Error; err != nil {
		log.Printf("Error updating message: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update message"})
		return
	}

	log.Printf("✏️ User %d edited message %d in room %d", userID, messageID, roomID)
	c.JSON(http.StatusOK, gin.H{
		"message": "Message updated successfully",
		"data":    message,
	})
}

// GetChatHistoryHandler handles GET /api/rooms/:id/chat/history
func GetChatHistoryHandler(c *gin.Context) {
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// ✅ Get optional session_id from query
	sessionID := c.Query("session_id")

	var messages []models.ChatMessage
	query := DB.Where("room_id = ?", uint(roomID))

	if sessionID != "" {
		// Fetch only session-scoped messages
		query = query.Where("session_id = ?", sessionID)
	} else {
		// Fetch only room-level (non-session) messages
		query = query.Where("session_id = ?", "") // or use IS NULL if you switch to *string
		// Note: If you later change SessionID to *string, use: query.Where("session_id IS NULL")
	}

	if err := query.Order("created_at ASC").Limit(100).Find(&messages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load chat history"})
		return
	}

	// ✅ Fetch reactions for each message
	type MessageWithReactions struct {
		models.ChatMessage
		Reactions []models.Reaction `json:"reactions"`
	}

	messagesWithReactions := make([]MessageWithReactions, len(messages))
	for i, msg := range messages {
		var reactions []models.Reaction
		DB.Where("message_id = ?", msg.ID).Find(&reactions)
		
		messagesWithReactions[i] = MessageWithReactions{
			ChatMessage: msg,
			Reactions:   reactions,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"messages": messagesWithReactions,
	})
}