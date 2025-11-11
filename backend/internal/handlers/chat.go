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

    // Allow delete if user is sender OR room host
    if message.UserID != userID {
        var room models.Room
        if err := DB.First(&room, message.RoomID).Error; err != nil || room.HostID != userID {
            c.JSON(http.StatusForbidden, gin.H{"error": "Cannot delete other users' messages"})
            return
        }
    }

    // ✅ Delete from database
    if err := DB.Delete(&message).Error; err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete message"})
        return
    }

    // ✅ Broadcast deletion
    //deletionMsg := map[string]interface{}{
      //  "type": "chat_message_deleted",
     //   "data": map[string]uint{"message_id": message.ID},
   // }
  //  broadcastData, _ := json.Marshal(deletionMsg)
  //  hub.BroadcastToRoom(message.RoomID, broadcastData, c)

    c.JSON(http.StatusOK, gin.H{"message": "Message deleted"})
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