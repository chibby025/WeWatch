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

// GetPrivateMessagesHandler handles GET /api/private-messages/:userId
// Fetches all private messages between current user and specified user
func GetPrivateMessagesHandler(c *gin.Context) {
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	currentUserID := userIDValue.(uint)

	otherUserIDStr := c.Param("userId")
	otherUserID, err := strconv.ParseUint(otherUserIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	var messages []models.PrivateMessage

	// Fetch messages where current user is sender OR receiver AND other user is the opposite
	if err := DB.Where(
		"(sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)",
		currentUserID, uint(otherUserID), uint(otherUserID), currentUserID,
	).Order("created_at ASC").Find(&messages).Error; err != nil {
		log.Printf("Error fetching private messages: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch messages"})
		return
	}

	log.Printf("📬 Fetched %d private messages between user %d and user %d", len(messages), currentUserID, otherUserID)

	c.JSON(http.StatusOK, gin.H{
		"messages": messages,
	})
}

// DeleteSessionPrivateMessagesHandler handles DELETE /api/sessions/:sessionId/private-messages
// Deletes all private messages for a specific session (called when session ends)
func DeleteSessionPrivateMessagesHandler(c *gin.Context) {
	sessionID := c.Param("id")
	
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Session ID required"})
		return
	}

	// Get all members of this session
	var members []models.WatchSessionMember
	if err := DB.Where("session_id = ?", sessionID).Find(&members).Error; err != nil {
		log.Printf("Error fetching session members: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch session members"})
		return
	}

	if len(members) == 0 {
		log.Printf("No members found for session %s, nothing to delete", sessionID)
		c.JSON(http.StatusOK, gin.H{"deleted_count": 0})
		return
	}

	// Extract user IDs
	userIDs := make([]uint, len(members))
	for i, member := range members {
		userIDs[i] = member.UserID
	}

	// Delete all private messages between these users
	result := DB.Where(
		"sender_id IN (?) AND receiver_id IN (?)",
		userIDs, userIDs,
	).Delete(&models.PrivateMessage{})

	if result.Error != nil {
		log.Printf("Error deleting private messages: %v", result.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete messages"})
		return
	}

	log.Printf("🗑️ Deleted %d private messages for session %s", result.RowsAffected, sessionID)

	c.JSON(http.StatusOK, gin.H{
		"deleted_count": result.RowsAffected,
		"message":       "Private messages deleted successfully",
	})
}

// GetSessionChatPreviewHandler handles GET /api/sessions/:id/chat-preview
// Returns last 10 messages for a session (for lobby preview)
func GetSessionChatPreviewHandler(c *gin.Context) {
	sessionID := c.Param("id")
	
	// Check if session exists and get privacy settings
	var session models.WatchSession
	if err := DB.Where("session_id = ?", sessionID).First(&session).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}
	
	// Check privacy flags - deny if session is private or preview disabled
	if session.IsPrivate || !session.PreviewEnabled {
		c.JSON(http.StatusForbidden, gin.H{"error": "Chat preview disabled for this session"})
		return
	}
	
	// Check content rating - deny if 18+ or Mature
	if session.ContentRating == "18+" || session.ContentRating == "Mature" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Chat preview disabled for mature content"})
		return
	}
	
	// Get total count of non-deleted messages
	var totalCount int64
	if err := DB.Model(&models.ChatMessage{}).
		Where("session_id = ? AND deleted_by_host = false", sessionID).
		Count(&totalCount).Error; err != nil {
		log.Printf("❌ [ChatPreview] Failed to count messages: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch chat count"})
		return
	}
	
	// Fetch last 10 messages (ORDER BY DESC, then reverse in response)
	var messages []models.ChatMessage
	if err := DB.Where("session_id = ? AND deleted_by_host = false", sessionID).
		Order("created_at DESC").
		Limit(10).
		Find(&messages).Error; err != nil {
		log.Printf("❌ [ChatPreview] Failed to fetch messages: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch chat preview"})
		return
	}
	
	// Reverse messages to show oldest first
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}
	
	log.Printf("✅ [ChatPreview] Returned %d messages for session %s (total: %d)", len(messages), sessionID, totalCount)
	
	c.JSON(http.StatusOK, gin.H{
		"messages":    messages,
		"total_count": totalCount,
	})
}

// GetSessionChatCountHandler handles GET /api/sessions/:id/chat-count
// Returns total message count for a session
func GetSessionChatCountHandler(c *gin.Context) {
	sessionID := c.Param("id")
	
	// Check if session exists
	var session models.WatchSession
	if err := DB.Where("session_id = ?", sessionID).First(&session).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}
	
	// Count non-deleted messages
	var count int64
	if err := DB.Model(&models.ChatMessage{}).
		Where("session_id = ? AND deleted_by_host = false", sessionID).
		Count(&count).Error; err != nil {
		log.Printf("❌ [ChatCount] Failed to count messages: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count messages"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"session_id": sessionID,
		"count":      count, // ✅ Changed from chat_count to match frontend expectation
	})
}
