package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// GetReadPosition returns the last-read message ID for this user+conversation,
// or nil if no position has ever been saved (a genuinely new conversation, or
// one this user has never opened before). Called directly (not over HTTP) by
// each of the three message-list handlers (GetRoomMessages, lobby DM, lobby
// group) so the read position comes back bundled with the message list
// itself — no extra round trip on every chat open.
func GetReadPosition(db *gorm.DB, userID uint, conversationType, conversationKey string) *uint {
	var pos models.ChatReadPosition
	err := db.Where("user_id = ? AND conversation_type = ? AND conversation_key = ?",
		userID, conversationType, conversationKey).First(&pos).Error
	if err != nil {
		return nil
	}
	return &pos.LastReadMessageID
}

// UpsertReadPositionRequest is the body for POST /api/chat/read-position.
type UpsertReadPositionRequest struct {
	ConversationType  string `json:"conversation_type" binding:"required"`
	ConversationKey   string `json:"conversation_key" binding:"required"`
	LastReadMessageID uint   `json:"last_read_message_id" binding:"required"`
}

// UpsertReadPositionHandler handles POST /api/chat/read-position — the
// shared, cross-surface (room/dm/group) endpoint the frontend calls
// (debounced, as the user scrolls, plus on close/backgrounding) to persist
// how far they've read in a conversation. Only ever advances the stored
// position forward, never regresses it — protects against a stale, out-of-
// order debounced save (e.g. from a flaky connection) silently rewinding an
// already-more-advanced position saved from elsewhere (a different device,
// or a since-arrived faster request from the same session).
func UpsertReadPositionHandler(c *gin.Context) {
	userID := c.MustGet("user_id").(uint)

	var req UpsertReadPositionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}
	if req.ConversationType != "room" && req.ConversationType != "dm" && req.ConversationType != "group" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid conversation_type"})
		return
	}

	var existing models.ChatReadPosition
	err := DB.Where("user_id = ? AND conversation_type = ? AND conversation_key = ?",
		userID, req.ConversationType, req.ConversationKey).First(&existing).Error

	if err == gorm.ErrRecordNotFound {
		newPos := models.ChatReadPosition{
			UserID:            userID,
			ConversationType:  req.ConversationType,
			ConversationKey:   req.ConversationKey,
			LastReadMessageID: req.LastReadMessageID,
		}
		if err := DB.Create(&newPos).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save read position"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"last_read_message_id": newPos.LastReadMessageID})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	if req.LastReadMessageID > existing.LastReadMessageID {
		DB.Model(&existing).Update("last_read_message_id", req.LastReadMessageID)
		c.JSON(http.StatusOK, gin.H{"last_read_message_id": req.LastReadMessageID})
		return
	}
	c.JSON(http.StatusOK, gin.H{"last_read_message_id": existing.LastReadMessageID})
}
