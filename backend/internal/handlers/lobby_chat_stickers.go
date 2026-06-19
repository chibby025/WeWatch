// backend/internal/handlers/lobby_chat_stickers.go
package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// SendLobbyChatStickerRequest defines the request body for sending a sticker
type SendLobbyChatStickerRequest struct {
	RecipientID uint   `json:"recipient_id" binding:"required"`
	StickerURL  string `json:"sticker_url" binding:"required"`
	Provider    string `json:"provider" binding:"required"` // "giphy" or "tenor"
	StickerID   string `json:"sticker_id" binding:"required"`
}

// SendLobbyChatStickerHandler sends a sticker/GIF to another user
// POST /api/lobby-chats/sticker
func SendLobbyChatStickerHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		log.Println("SendLobbyChatStickerHandler: Unauthorized - user_id not found")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	senderID, ok := userID.(uint)
	if !ok {
		log.Println("SendLobbyChatStickerHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	var req SendLobbyChatStickerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("SendLobbyChatStickerHandler: Invalid request: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate provider
	validProviders := map[string]bool{"giphy": true, "tenor": true, "emoji": true, "cdn": true}
	if !validProviders[req.Provider] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid provider"})
		return
	}

	// Validate sticker URL
	var stickerURL string
	switch req.Provider {
	case "emoji":
		stickerURL = req.StickerURL
	case "cdn":
		// BunnyCDN or local uploads
		if !strings.Contains(req.StickerURL, "b-cdn.net") &&
			!strings.HasPrefix(req.StickerURL, "/uploads/") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid CDN sticker URL"})
			return
		}
		stickerURL = req.StickerURL
	default:
		// Giphy / Tenor
		if !strings.Contains(req.StickerURL, "giphy.com") &&
			!strings.Contains(req.StickerURL, "tenor.com") &&
			!strings.Contains(req.StickerURL, "media.tenor.com") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid sticker URL domain"})
			return
		}
		stickerURL = req.StickerURL
	}

	// Prevent sending stickers to self
	if req.RecipientID == senderID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot send sticker to yourself"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	// Check if users have blocked each other
	var blockCheck int64
	db.Model(&models.UserBlock{}).Where(
		"(blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)",
		senderID, req.RecipientID, req.RecipientID, senderID,
	).Count(&blockCheck)

	if blockCheck > 0 {
		log.Printf("SendLobbyChatStickerHandler: Block exists between users %d and %d", senderID, req.RecipientID)
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot send sticker - user blocked"})
		return
	}

	// Check friendship
	var friendship models.Friendship
	err := db.Where(
		"((requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)) AND status = ?",
		senderID, req.RecipientID, req.RecipientID, senderID, models.FriendshipStatusAccepted,
	).First(&friendship).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusForbidden, gin.H{"error": "You must be friends to send stickers"})
			return
		}
		log.Printf("SendLobbyChatStickerHandler: Database error checking friendship: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Prepare metadata
	metadataMap := map[string]interface{}{
		"provider":   req.Provider,
		"sticker_id": req.StickerID,
	}
	metadataBytes, _ := json.Marshal(metadataMap)
	metadataStr := string(metadataBytes)

	// Create lobby chat message
	chat := models.LobbyChat{
		SenderID:      senderID,
		RecipientID:   req.RecipientID,
		Message:       "Sent a sticker",
		MessageType:   "sticker",
		AttachmentURL: &stickerURL,
		Metadata:      &metadataStr,
	}

	if err := db.Create(&chat).Error; err != nil {
		log.Printf("SendLobbyChatStickerHandler: Failed to create message: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send sticker"})
		return
	}

	// Load sender info for WebSocket
	var sender models.User
	db.First(&sender, senderID)

	// Prepare response
	chatResponse := struct {
		models.LobbyChat
		SenderUsername string `json:"sender_username"`
	}{
		LobbyChat:      chat,
		SenderUsername: sender.Username,
	}

	log.Printf("SendLobbyChatStickerHandler: Sticker sent from user %d to user %d (%s sticker %s)",
		senderID, req.RecipientID, req.Provider, req.StickerID)

	// Broadcast via WebSocket
	BroadcastLobbyChatMessage(db, chat, sender)

	c.JSON(http.StatusOK, chatResponse)
}
