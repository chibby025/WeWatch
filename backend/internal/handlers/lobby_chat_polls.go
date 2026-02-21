// backend/internal/handlers/lobby_chat_polls.go
package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// CreateLobbyChatPollRequest defines the request body for creating a poll
type CreateLobbyChatPollRequest struct {
	RecipientID uint     `json:"recipient_id" binding:"required"`
	Question    string   `json:"question" binding:"required,min=3,max=200"`
	PollType    string   `json:"poll_type" binding:"required"` // "yes_no" or "multiple_choice"
	Options     []string `json:"options"`                      // Required for multiple_choice
}

// VoteLobbyChatPollRequest defines the request body for voting on a poll
type VoteLobbyChatPollRequest struct {
	OptionIndex int `json:"option_index" binding:"required,min=0"`
}

// CreateLobbyChatPollHandler creates a poll message
// POST /api/lobby-chats/poll
func CreateLobbyChatPollHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		log.Println("CreateLobbyChatPollHandler: Unauthorized - user_id not found")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	senderID, ok := userID.(uint)
	if !ok {
		log.Println("CreateLobbyChatPollHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	var req CreateLobbyChatPollRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("CreateLobbyChatPollHandler: Invalid request: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate poll type
	if req.PollType != "yes_no" && req.PollType != "multiple_choice" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid poll type (must be yes_no or multiple_choice)"})
		return
	}

	// Validate options for multiple choice
	if req.PollType == "multiple_choice" {
		if len(req.Options) < 2 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Multiple choice polls must have at least 2 options"})
			return
		}
		if len(req.Options) > 10 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Multiple choice polls cannot have more than 10 options"})
			return
		}
		for _, opt := range req.Options {
			if strings.TrimSpace(opt) == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Poll options cannot be empty"})
				return
			}
		}
	} else {
		// Yes/No polls have predefined options
		req.Options = []string{"Yes", "No"}
	}

	// Prevent sending polls to self
	if req.RecipientID == senderID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot send poll to yourself"})
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
		log.Printf("CreateLobbyChatPollHandler: Block exists between users %d and %d", senderID, req.RecipientID)
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot send poll - user blocked"})
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
			c.JSON(http.StatusForbidden, gin.H{"error": "You must be friends to send polls"})
			return
		}
		log.Printf("CreateLobbyChatPollHandler: Database error checking friendship: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Prepare metadata
	metadataMap := map[string]interface{}{
		"poll_type":   req.PollType,
		"question":    req.Question,
		"options":     req.Options,
		"votes":       make(map[string][]uint), // option_index -> []user_ids
		"total_votes": 0,
	}
	metadataBytes, _ := json.Marshal(metadataMap)
	metadataStr := string(metadataBytes)

	// Create lobby chat message
	messageText := fmt.Sprintf("📊 Poll: %s", req.Question)
	chat := models.LobbyChat{
		SenderID:    senderID,
		RecipientID: req.RecipientID,
		Message:     messageText,
		MessageType: "poll",
		Metadata:    &metadataStr,
	}

	if err := db.Create(&chat).Error; err != nil {
		log.Printf("CreateLobbyChatPollHandler: Failed to create message: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create poll"})
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

	log.Printf("CreateLobbyChatPollHandler: Poll created from user %d to user %d (%s: %s)",
		senderID, req.RecipientID, req.PollType, req.Question)

	// Broadcast via WebSocket
	BroadcastLobbyChatMessage(db, chat, sender)

	c.JSON(http.StatusOK, chatResponse)
}

// VoteLobbyChatPollHandler handles voting on a poll
// POST /api/lobby-chats/poll/:messageId/vote
func VoteLobbyChatPollHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		log.Println("VoteLobbyChatPollHandler: Unauthorized - user_id not found")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	voterID, ok := userID.(uint)
	if !ok {
		log.Println("VoteLobbyChatPollHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	messageIDStr := c.Param("messageId")
	messageID, err := strconv.ParseUint(messageIDStr, 10, 32)
	if err != nil {
		log.Printf("VoteLobbyChatPollHandler: Invalid message ID: %s", messageIDStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid message ID"})
		return
	}

	var req VoteLobbyChatPollRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("VoteLobbyChatPollHandler: Invalid request: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	// Get the poll message
	var chat models.LobbyChat
	if err := db.First(&chat, messageID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found"})
			return
		}
		log.Printf("VoteLobbyChatPollHandler: Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Verify it's a poll
	if chat.MessageType != "poll" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message is not a poll"})
		return
	}

	// Verify user is sender or recipient
	if chat.SenderID != voterID && chat.RecipientID != voterID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not part of this conversation"})
		return
	}

	// Parse metadata
	var metadata map[string]interface{}
	if err := json.Unmarshal([]byte(*chat.Metadata), &metadata); err != nil {
		log.Printf("VoteLobbyChatPollHandler: Failed to parse metadata: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid poll data"})
		return
	}

	// Get options
	optionsRaw, ok := metadata["options"].([]interface{})
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid poll options"})
		return
	}

	// Validate option index
	if req.OptionIndex < 0 || req.OptionIndex >= len(optionsRaw) {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid option index (must be 0-%d)", len(optionsRaw)-1)})
		return
	}

	// Get current votes
	votesRaw, ok := metadata["votes"].(map[string]interface{})
	if !ok {
		votesRaw = make(map[string]interface{})
	}

	// Remove user's previous vote from all options
	for optIdx := range optionsRaw {
		key := fmt.Sprintf("%d", optIdx)
		if voters, ok := votesRaw[key].([]interface{}); ok {
			newVoters := []interface{}{}
			for _, v := range voters {
				if voterIDFloat, ok := v.(float64); ok && uint(voterIDFloat) != voterID {
					newVoters = append(newVoters, v)
				}
			}
			votesRaw[key] = newVoters
		}
	}

	// Add new vote
	optionKey := fmt.Sprintf("%d", req.OptionIndex)
	if _, ok := votesRaw[optionKey]; !ok {
		votesRaw[optionKey] = []interface{}{}
	}
	votersForOption := votesRaw[optionKey].([]interface{})
	votersForOption = append(votersForOption, float64(voterID))
	votesRaw[optionKey] = votersForOption

	// Calculate total votes
	totalVotes := 0
	for _, voters := range votesRaw {
		if voterList, ok := voters.([]interface{}); ok {
			totalVotes += len(voterList)
		}
	}

	// Update metadata
	metadata["votes"] = votesRaw
	metadata["total_votes"] = totalVotes

	metadataBytes, _ := json.Marshal(metadata)
	metadataStr := string(metadataBytes)
	chat.Metadata = &metadataStr

	// Save updated poll
	if err := db.Save(&chat).Error; err != nil {
		log.Printf("VoteLobbyChatPollHandler: Failed to update poll: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to record vote"})
		return
	}

	// Load sender info for WebSocket
	var sender models.User
	db.First(&sender, chat.SenderID)

	log.Printf("VoteLobbyChatPollHandler: User %d voted on poll %d (option %d)", voterID, messageID, req.OptionIndex)

	// Broadcast updated poll via WebSocket
	BroadcastLobbyChatMessage(db, chat, sender)

	c.JSON(http.StatusOK, gin.H{
		"message": "Vote recorded successfully",
		"poll":    chat,
	})
}
