// backend/internal/handlers/call_history.go
package handlers

import (
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"wewatch-backend/internal/models"
)

// CallHistoryItem represents a call entry in the history
type CallHistoryItem struct {
	ID        uint                   `json:"id"`
	CallType  string                 `json:"call_type"` // "incoming", "outgoing", "missed", "declined"
	OtherUser map[string]interface{} `json:"other_user"`
	Duration  int                    `json:"duration,omitempty"` // in seconds
	CreatedAt string                 `json:"created_at"`
}

// GetCallHistoryHandler returns the call history for the authenticated user
// GET /api/lobby/call-history
func GetCallHistoryHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	currentUserID := userID.(uint)

	// Fetch call-related system messages from lobby_chats
	// System messages contain call info in the Message field
	var messages []models.LobbyChat
	err := DB.Where(
		"(sender_id = ? OR recipient_id = ?) AND message_type = ? AND (message LIKE ? OR message LIKE ? OR message LIKE ?)",
		currentUserID, currentUserID, "system",
		"%call%", "%Call%", "%CALL%",
	).Order("created_at DESC").Limit(100).Find(&messages).Error

	if err != nil {
		log.Printf("Error fetching call history: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch call history"})
		return
	}

	// Parse messages into CallHistoryItems
	callHistory := []CallHistoryItem{}

	for _, msg := range messages {
		// Determine call type from message content
		callType := parseCallType(msg.Message, currentUserID, msg.SenderID, msg.RecipientID)
		if callType == "" {
			continue // Skip if not a call message
		}

		// Determine the other user (not the current user)
		var otherUserID uint
		if msg.SenderID == currentUserID {
			otherUserID = msg.RecipientID
		} else {
			otherUserID = msg.SenderID
		}

		// Fetch other user info
		var otherUser models.User
		if err := DB.Select("id", "username", "avatar_url").First(&otherUser, otherUserID).Error; err != nil {
			log.Printf("Warning: Could not fetch user %d: %v", otherUserID, err)
			continue
		}

		// Parse duration if available (from "Call completed (Xm Ys)" messages)
		duration := parseDuration(msg.Message)

		callHistory = append(callHistory, CallHistoryItem{
			ID:       msg.ID,
			CallType: callType,
			OtherUser: map[string]interface{}{
				"id":         otherUser.ID,
				"username":   otherUser.Username,
				"avatar_url": otherUser.AvatarURL,
			},
			Duration:  duration,
			CreatedAt: msg.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"calls": callHistory,
		"total": len(callHistory),
	})
}

// parseCallType determines the call type from the message content
func parseCallType(message string, currentUserID, senderID, recipientID uint) string {
	msgLower := strings.ToLower(message)

	// Completed call
	if strings.Contains(msgLower, "call completed") {
		// If current user is sender, it's outgoing; if recipient, it's incoming
		if senderID == currentUserID {
			return "outgoing"
		}
		return "incoming"
	}

	// Missed call
	if strings.Contains(msgLower, "missed your call") || strings.Contains(msgLower, "missed call") {
		// "You missed X's call" = incoming missed
		// "X missed your call" = outgoing missed (they didn't answer)
		if strings.Contains(msgLower, "you missed") {
			return "missed"
		}
		return "outgoing" // They missed our call
	}

	// Declined call
	if strings.Contains(msgLower, "declined") {
		// "You declined X's call" = incoming declined
		// "X declined your call" = outgoing declined
		if strings.Contains(msgLower, "you declined") || recipientID == currentUserID {
			return "declined"
		}
		return "outgoing"
	}

	return ""
}

// parseDuration extracts duration in seconds from messages like "Call completed (2m 30s)"
func parseDuration(message string) int {
	// Find pattern like "(Xm Ys)" or "(Xs)"
	if !strings.Contains(message, "(") || !strings.Contains(message, ")") {
		return 0
	}

	start := strings.Index(message, "(")
	end := strings.Index(message, ")")
	if start == -1 || end == -1 || end <= start {
		return 0
	}

	durationStr := message[start+1 : end]
	
	var minutes, seconds int
	
	// Try to parse "Xm Ys" format
	if strings.Contains(durationStr, "m") {
		parts := strings.Split(durationStr, " ")
		for _, part := range parts {
			if strings.HasSuffix(part, "m") {
				fmt.Sscanf(part, "%dm", &minutes)
			} else if strings.HasSuffix(part, "s") {
				fmt.Sscanf(part, "%ds", &seconds)
			}
		}
	} else if strings.HasSuffix(durationStr, "s") {
		// Just seconds: "Xs"
		fmt.Sscanf(durationStr, "%ds", &seconds)
	}

	return minutes*60 + seconds
}
