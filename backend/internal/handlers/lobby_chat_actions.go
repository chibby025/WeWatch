// backend/internal/handlers/lobby_chat_actions.go
package handlers

import (
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
)

// EditLobbyChatMessageRequest defines the request body for editing a message
type EditLobbyChatMessageRequest struct {
	Message string `json:"message" binding:"required,min=1,max=1000"`
}

// EditLobbyChatMessageHandler edits a text message
// PATCH /api/lobby-chats/:messageId
func EditLobbyChatMessageHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		log.Println("EditLobbyChatMessageHandler: Unauthorized - user_id not found")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	currentUserID, ok := userID.(uint)
	if !ok {
		log.Println("EditLobbyChatMessageHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	messageIDStr := c.Param("messageId")
	messageID, err := strconv.ParseUint(messageIDStr, 10, 32)
	if err != nil {
		log.Printf("EditLobbyChatMessageHandler: Invalid message ID: %s", messageIDStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid message ID"})
		return
	}

	var req EditLobbyChatMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("EditLobbyChatMessageHandler: Invalid request: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Trim message
	trimmedMessage := strings.TrimSpace(req.Message)
	if len(trimmedMessage) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message cannot be empty"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	// Get the message
	var chat models.LobbyChat
	if err := db.First(&chat, messageID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Message not found"})
			return
		}
		log.Printf("EditLobbyChatMessageHandler: Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Verify user is the sender
	if chat.SenderID != currentUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only edit your own messages"})
		return
	}

	// Verify message type is text
	if chat.MessageType != "text" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Only text messages can be edited"})
		return
	}

	// Update message
	chat.Message = trimmedMessage
	chat.Edited = true

	if err := db.Save(&chat).Error; err != nil {
		log.Printf("EditLobbyChatMessageHandler: Failed to update message: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to edit message"})
		return
	}

	// Load sender info for WebSocket
	var sender models.User
	db.First(&sender, chat.SenderID)

	log.Printf("EditLobbyChatMessageHandler: User %d edited message %d", currentUserID, messageID)

	// Broadcast edited message via WebSocket
	BroadcastLobbyChatMessage(db, chat, sender)

	c.JSON(http.StatusOK, gin.H{
		"message": "Message edited successfully",
		"chat":    chat,
	})
}

// DeleteLobbyChatMessageHandler soft deletes a message for the requesting user
// DELETE /api/lobby-chats/:messageId
func DeleteLobbyChatMessageHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		log.Println("DeleteLobbyChatMessageHandler: Unauthorized - user_id not found")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	currentUserID, ok := userID.(uint)
	if !ok {
		log.Println("DeleteLobbyChatMessageHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	messageIDStr := c.Param("messageId")
	messageID, err := strconv.ParseUint(messageIDStr, 10, 32)
	if err != nil {
		log.Printf("DeleteLobbyChatMessageHandler: Invalid message ID: %s", messageIDStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid message ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	// Get the message
	var chat models.LobbyChat
	if err := db.First(&chat, messageID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Message not found"})
			return
		}
		log.Printf("DeleteLobbyChatMessageHandler: Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Verify user is sender or recipient
	if chat.SenderID != currentUserID && chat.RecipientID != currentUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only delete messages in your conversations"})
		return
	}

	// Mark as deleted for the requesting user
	if chat.SenderID == currentUserID {
		chat.DeletedBySender = true
	} else {
		chat.DeletedByRecipient = true
	}

	// If both users deleted, soft delete completely
	if chat.DeletedBySender && chat.DeletedByRecipient {
		// ✅ Delete attachment from BunnyCDN before deleting record (async to not block)
		attachmentURL := chat.AttachmentURL
		
		if err := db.Delete(&chat).Error; err != nil {
			log.Printf("DeleteLobbyChatMessageHandler: Failed to delete message: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete message"})
			return
		}
		
		// Delete attachment from BunnyCDN asynchronously
		if attachmentURL != nil && *attachmentURL != "" {
			go func(url string) {
				if strings.HasPrefix(url, "http://") || strings.HasPrefix(url, "https://") {
					if err := utils.DeleteFromBunnyCDN(url); err != nil {
						log.Printf("⚠️  [DeleteLobbyChat] Failed to delete attachment from BunnyCDN: %v", err)
					}
				}
			}(*attachmentURL)
		}
		
		log.Printf("DeleteLobbyChatMessageHandler: Message %d permanently deleted (both users)", messageID)
	} else {
		if err := db.Save(&chat).Error; err != nil {
			log.Printf("DeleteLobbyChatMessageHandler: Failed to update message: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete message"})
			return
		}
		log.Printf("DeleteLobbyChatMessageHandler: User %d deleted message %d", currentUserID, messageID)
	}

	// Load sender info for WebSocket
	var sender models.User
	db.First(&sender, chat.SenderID)

	// Broadcast deletion via WebSocket
	BroadcastLobbyChatMessage(db, chat, sender)

	c.JSON(http.StatusOK, gin.H{"message": "Message deleted successfully"})
}

// ClearLobbyChatHandler marks all messages in a conversation as deleted for the requesting user
// DELETE /api/lobby-chats/clear/:userId
func ClearLobbyChatHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		log.Println("ClearLobbyChatHandler: Unauthorized - user_id not found")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	currentUserID, ok := userID.(uint)
	if !ok {
		log.Println("ClearLobbyChatHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	otherUserIDStr := c.Param("userId")
	otherUserID, err := strconv.ParseUint(otherUserIDStr, 10, 32)
	if err != nil {
		log.Printf("ClearLobbyChatHandler: Invalid user ID: %s", otherUserIDStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	// Get all messages in conversation
	var messages []models.LobbyChat
	err = db.Where(
		"((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)) AND deleted_at IS NULL",
		currentUserID, uint(otherUserID), uint(otherUserID), currentUserID,
	).Find(&messages).Error

	if err != nil {
		log.Printf("ClearLobbyChatHandler: Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clear chat"})
		return
	}

	// Mark each message as deleted for current user
	deletedCount := 0
	for _, msg := range messages {
		if msg.SenderID == currentUserID {
			msg.DeletedBySender = true
		} else {
			msg.DeletedByRecipient = true
		}

		// If both deleted, soft delete completely
		if msg.DeletedBySender && msg.DeletedByRecipient {
			db.Delete(&msg)
		} else {
			db.Save(&msg)
		}
		deletedCount++
	}

	log.Printf("ClearLobbyChatHandler: User %d cleared %d messages with user %d", currentUserID, deletedCount, otherUserID)

	c.JSON(http.StatusOK, gin.H{
		"message":        "Chat cleared successfully",
		"deleted_count":  deletedCount,
	})
}
