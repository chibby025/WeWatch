package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"wewatch-backend/internal/models"
)

type SendRoomChatStickerRequest struct {
	StickerURL string `json:"sticker_url" binding:"required"`
	Provider   string `json:"provider" binding:"required"` // "tenor" or "giphy"
	StickerID  string `json:"sticker_id"`
}

// SendRoomChatStickerHandler handles POST /api/rooms/:id/messages/sticker
func SendRoomChatStickerHandler(c *gin.Context) {
	roomIDStr := c.Param("id")
	roomIDUint, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	roomID := uint(roomIDUint)

	userIDVal, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	senderID, ok := userIDVal.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	var req SendRoomChatStickerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	validProviders := map[string]bool{"tenor": true, "giphy": true, "cdn": true, "emoji": true}
	if !validProviders[req.Provider] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid provider"})
		return
	}

	if req.Provider == "cdn" {
		if !strings.Contains(req.StickerURL, "b-cdn.net") &&
			!strings.HasPrefix(req.StickerURL, "/uploads/") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid CDN sticker URL"})
			return
		}
	} else if req.Provider != "emoji" {
		valid := strings.Contains(req.StickerURL, "tenor.com") ||
			strings.Contains(req.StickerURL, "giphy.com") ||
			strings.Contains(req.StickerURL, "media.tenor.com") ||
			strings.Contains(req.StickerURL, "media.giphy.com")
		if !valid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid sticker URL domain"})
			return
		}
	}

	// Verify sender is a member or the host
	var room models.Room
	if err := DB.Select("id, host_id").First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}
	if room.HostID != senderID {
		var membership models.UserRoom
		if err := DB.Where("user_id = ? AND room_id = ? AND (is_banned IS NULL OR is_banned = false)", senderID, roomID).
			First(&membership).Error; err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "Not a room member"})
			return
		}
	}

	var sender models.User
	DB.Select("id, username").First(&sender, senderID)

	stickerURL := req.StickerURL
	msg := models.RoomMessage{
		RoomID:        roomID,
		UserID:        senderID,
		Username:      sender.Username,
		Message:       "",
		MessageType:   "sticker",
		AttachmentURL: &stickerURL,
		CreatedAt:     time.Now(),
	}
	if err := DB.Create(&msg).Error; err != nil {
		log.Printf("SendRoomChatStickerHandler: DB create failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save sticker"})
		return
	}

	hub := GetHub()
	if hub != nil {
		payload := map[string]interface{}{
			"type": "room_chat",
			"data": map[string]interface{}{
				"id":             msg.ID,
				"room_id":        roomID,
				"user_id":        senderID,
				"username":       sender.Username,
				"message":        "",
				"message_type":   "sticker",
				"attachment_url": stickerURL,
				"created_at":     msg.CreatedAt,
			},
		}
		if b, err := json.Marshal(payload); err == nil {
			hub.BroadcastToRoom(roomID, OutgoingMessage{Data: b, IsBinary: false}, nil)
		}
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":             msg.ID,
		"user_id":        senderID,
		"username":       sender.Username,
		"message":        "",
		"message_type":   "sticker",
		"attachment_url": stickerURL,
		"created_at":     msg.CreatedAt,
	})
}
