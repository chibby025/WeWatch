// WeWatch/backend/internal/handlers/lobby_chats.go
package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// GetLobbyChatFriendsHandler returns list of users who have chatted with current user
// GET /api/lobby-chats/friends
func GetLobbyChatFriendsHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		log.Println("GetLobbyChatFriendsHandler: Unauthorized - user_id not found")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	currentUserID, ok := userID.(uint)
	if !ok {
		log.Println("GetLobbyChatFriendsHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	var friends []models.User

	// Get all accepted friends (mutual friendship required)
	// Exclude blocked users (both directions)
	err := db.Raw(`
		SELECT DISTINCT users.id, users.username, users.email, users.created_at, users.updated_at
		FROM users
		INNER JOIN friendships ON 
			((friendships.requester_id = ? AND friendships.recipient_id = users.id) OR
			 (friendships.recipient_id = ? AND friendships.requester_id = users.id))
		WHERE friendships.status = 'accepted'
		  AND NOT EXISTS (
			SELECT 1 FROM user_blocks 
			WHERE (blocker_id = ? AND blocked_id = users.id)
			   OR (blocker_id = users.id AND blocked_id = ?)
		  )
		ORDER BY users.username
	`, currentUserID, currentUserID, currentUserID, currentUserID).Scan(&friends).Error

	if err != nil {
		log.Printf("GetLobbyChatFriendsHandler: Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch friends"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"friends": friends})
}

// GetLobbyChatMessagesHandler returns all messages between current user and specified user
// GET /api/lobby-chats/messages/:userId
func GetLobbyChatMessagesHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		log.Println("GetLobbyChatMessagesHandler: Unauthorized - user_id not found")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	currentUserID, ok := userID.(uint)
	if !ok {
		log.Println("GetLobbyChatMessagesHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	otherUserIDStr := c.Param("userId")
	otherUserID, err := strconv.ParseUint(otherUserIDStr, 10, 32)
	if err != nil {
		log.Printf("GetLobbyChatMessagesHandler: Invalid user ID: %s", otherUserIDStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	// Check if users have blocked each other
	var blockCheck int64
	db.Model(&models.UserBlock{}).Where(
		"(blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)",
		currentUserID, uint(otherUserID), uint(otherUserID), currentUserID,
	).Count(&blockCheck)

	if blockCheck > 0 {
		log.Printf("GetLobbyChatMessagesHandler: Block exists between users %d and %d", currentUserID, otherUserID)
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot view messages - user blocked"})
		return
	}

	var messages []models.LobbyChat

	// Get messages between these two users, filtering by deletion status
	// For messages sent BY current user: check deleted_by_sender
	// For messages sent TO current user: check deleted_by_recipient
	log.Printf("GetLobbyChatMessagesHandler: Fetching messages for user %d with user %d", currentUserID, otherUserID)
	
	err = db.Where(
		"((sender_id = ? AND recipient_id = ? AND deleted_by_sender = FALSE) OR "+
		"(sender_id = ? AND recipient_id = ? AND deleted_by_recipient = FALSE)) AND deleted_at IS NULL",
		currentUserID, uint(otherUserID), uint(otherUserID), currentUserID,
	).Order("created_at ASC").Find(&messages).Error

	if err != nil {
		log.Printf("GetLobbyChatMessagesHandler: Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch messages"})
		return
	}
	
	log.Printf("GetLobbyChatMessagesHandler: Found %d messages between user %d and user %d", len(messages), currentUserID, otherUserID)

	// Collect exactly which of the just-fetched messages this call is about
	// to mark as read — derived from the `messages` slice already in hand,
	// no extra query needed. This is what makes a live read-receipt push to
	// the SENDER possible: without it, the sender only ever finds out a
	// message was read the next time THEY happen to re-fetch this same
	// conversation (this handler's own previous behavior), not in real
	// time while both people are actively chatting.
	var justReadIDs []uint
	for _, m := range messages {
		if m.SenderID == uint(otherUserID) && m.ReadAt == nil {
			justReadIDs = append(justReadIDs, m.ID)
		}
	}

	// Mark all unread messages from other user as read
	now := time.Now()
	db.Model(&models.LobbyChat{}).
		Where("sender_id = ? AND recipient_id = ? AND read_at IS NULL AND deleted_at IS NULL", uint(otherUserID), currentUserID).
		Update("read_at", now)

	// Tell the sender live, over WebSocket, that these specific messages are
	// now read — the read-receipt ticks in their own open chat update
	// immediately instead of waiting on their next fetch.
	if len(justReadIDs) > 0 {
		go BroadcastLobbyChatRead(uint(otherUserID), currentUserID, justReadIDs, now)
	}

	log.Printf("GetLobbyChatMessagesHandler: Fetched %d messages between user %d and user %d", len(messages), currentUserID, otherUserID)

	readPosition := GetReadPosition(db, currentUserID, "dm", strconv.FormatUint(otherUserID, 10))

	c.JSON(http.StatusOK, gin.H{"messages": messages, "last_read_message_id": readPosition})
}

// SendLobbyChatMessageRequest defines the request body for sending a lobby chat
type SendLobbyChatMessageRequest struct {
	RecipientID uint   `json:"recipient_id" binding:"required"`
	Message     string `json:"message" binding:"required,max=1000"`
	ReplyToID   *uint  `json:"reply_to_id"`
}

// SendLobbyChatMessageHandler sends a message to another user
// POST /api/lobby-chats/send
func SendLobbyChatMessageHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		log.Println("SendLobbyChatMessageHandler: Unauthorized - user_id not found")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	senderID, ok := userID.(uint)
	if !ok {
		log.Println("SendLobbyChatMessageHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	var req SendLobbyChatMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("SendLobbyChatMessageHandler: Invalid request: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Prevent sending messages to self
	if req.RecipientID == senderID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot send message to yourself"})
		return
	}

	// Trim and validate message
	trimmedMessage := strings.TrimSpace(req.Message)
	if len(trimmedMessage) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message cannot be empty"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	// Verify recipient exists
	var recipient models.User
	if err := db.First(&recipient, req.RecipientID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("SendLobbyChatMessageHandler: Recipient not found: %d", req.RecipientID)
			c.JSON(http.StatusNotFound, gin.H{"error": "Recipient not found"})
			return
		}
		log.Printf("SendLobbyChatMessageHandler: Database error checking recipient: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Check if users have blocked each other
	var blockCheck int64
	db.Model(&models.UserBlock{}).Where(
		"(blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)",
		senderID, req.RecipientID, req.RecipientID, senderID,
	).Count(&blockCheck)

	if blockCheck > 0 {
		log.Printf("SendLobbyChatMessageHandler: Block exists between users %d and %d", senderID, req.RecipientID)
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot send message - user blocked"})
		return
	}

	// Check if friendship exists and is accepted (required for private messaging)
	var friendship models.Friendship
	err := db.Where(
		"((requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)) AND status = ?",
		senderID, req.RecipientID, req.RecipientID, senderID, models.FriendshipStatusAccepted,
	).First(&friendship).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("SendLobbyChatMessageHandler: No accepted friendship between users %d and %d", senderID, req.RecipientID)
			c.JSON(http.StatusForbidden, gin.H{"error": "You must be friends to send private messages"})
			return
		}
		log.Printf("SendLobbyChatMessageHandler: Database error checking friendship: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Build chat message — attach reply snapshot if provided
	chat := models.LobbyChat{
		SenderID:    senderID,
		RecipientID: req.RecipientID,
		Message:     trimmedMessage,
	}
	if req.ReplyToID != nil {
		var original models.LobbyChat
		if err := db.Select("id, sender_id, recipient_id, message").First(&original, req.ReplyToID).Error; err == nil {
			// Verify the original belongs to this conversation
			isInConvo := (original.SenderID == senderID && original.RecipientID == req.RecipientID) ||
				(original.SenderID == req.RecipientID && original.RecipientID == senderID)
			if isInConvo {
				snap := original.Message
				if len([]rune(snap)) > 100 {
					snap = string([]rune(snap)[:100]) + "…"
				}
				chat.ReplyToID = req.ReplyToID
				chat.ReplyToSnap = &snap
			}
		}
	}

	if err := db.Create(&chat).Error; err != nil {
		log.Printf("SendLobbyChatMessageHandler: Failed to create message: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send message"})
		return
	}

	// Load sender info for WebSocket broadcast
	var sender models.User
	db.First(&sender, senderID)

	// Prepare response with sender info
	chatResponse := struct {
		models.LobbyChat
		SenderUsername string `json:"sender_username"`
	}{
		LobbyChat:      chat,
		SenderUsername: sender.Username,
	}

	log.Printf("SendLobbyChatMessageHandler: Message sent from user %d to user %d", senderID, req.RecipientID)

	// Broadcast via WebSocket to both users
	BroadcastLobbyChatMessage(db, chat, sender)

	// Upsert dm_received notification (batches multiple messages from same sender)
	go UpsertDMNotification(req.RecipientID, senderID, sender.Username, trimmedMessage)

	c.JSON(http.StatusOK, chatResponse)
}

// BroadcastLobbyChatMessage sends the message to both sender and recipient via WebSocket.
// For group messages (chat.GroupID != nil) it fans out to all group members instead.
func BroadcastLobbyChatMessage(db *gorm.DB, chat models.LobbyChat, sender models.User) {
	// Group messages are handled by BroadcastLobbyGroupMessage
	if chat.GroupID != nil {
		BroadcastLobbyGroupMessage(db, chat, sender)
		return
	}

	// Get WebSocket manager
	manager := GetWebSocketManager()
	if manager == nil {
		log.Println("BroadcastLobbyChatMessage: WebSocket manager not available")
		return
	}

	// Prepare message payload
	payload := map[string]interface{}{
		"id":              chat.ID,
		"sender_id":       chat.SenderID,
		"recipient_id":    chat.RecipientID,
		"message":         chat.Message,
		"message_type":    chat.MessageType,
		"attachment_url":  chat.AttachmentURL,
		"attachment_name": chat.AttachmentName,
		"attachment_size": chat.AttachmentSize,
		"metadata":        chat.Metadata,
		"reply_to_id":     chat.ReplyToID,
		"reply_to_snap":   chat.ReplyToSnap,
		"created_at":      chat.CreatedAt,
		"read_at":         chat.ReadAt,
		"sender_username": sender.Username,
	}

	wsMessage := map[string]interface{}{
		"type": "lobby_chat",
		"data": payload,
	}

	// Convert to JSON bytes
	jsonBytes, err := json.Marshal(wsMessage)
	if err != nil {
		log.Printf("BroadcastLobbyChatMessage: Failed to marshal message: %v", err)
		return
	}

	// Create OutgoingMessage
	outgoingMsg := OutgoingMessage{
		Data:     jsonBytes,
		IsBinary: false,
	}

	// Broadcast to both sender and recipient
	manager.BroadcastToUsers([]uint{chat.SenderID, chat.RecipientID}, outgoingMsg)

	log.Printf("BroadcastLobbyChatMessage: Broadcast sent to users %d and %d", chat.SenderID, chat.RecipientID)
}

// BroadcastLobbyChatRead notifies the ORIGINAL SENDER (senderID) that the
// reader (readerID) just read a batch of that sender's own messages —
// pushed live over WebSocket the moment GetLobbyChatMessagesHandler marks
// them read, rather than waiting for the sender's own client to happen to
// re-fetch the conversation. Only the sender needs this push: the reader
// already knows they just read the messages (it's their own action), so
// there's nothing to tell them.
func BroadcastLobbyChatRead(senderID, readerID uint, messageIDs []uint, readAt time.Time) {
	manager := GetWebSocketManager()
	if manager == nil {
		log.Println("BroadcastLobbyChatRead: WebSocket manager not available")
		return
	}

	payload := map[string]interface{}{
		"reader_id":   readerID,
		"sender_id":   senderID,
		"message_ids": messageIDs,
		"read_at":     readAt,
	}

	wsMessage := map[string]interface{}{
		"type": "lobby_chat_read",
		"data": payload,
	}

	jsonBytes, err := json.Marshal(wsMessage)
	if err != nil {
		log.Printf("BroadcastLobbyChatRead: Failed to marshal message: %v", err)
		return
	}

	outgoingMsg := OutgoingMessage{
		Data:     jsonBytes,
		IsBinary: false,
	}

	manager.BroadcastToUsers([]uint{senderID}, outgoingMsg)

	log.Printf("BroadcastLobbyChatRead: %d message(s) marked read by user %d, notified sender %d", len(messageIDs), readerID, senderID)
}
