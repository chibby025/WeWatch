package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"wewatch-backend/internal/models"
)

// GetGuestSessionViewHandler returns public session metadata for unauthenticated viewers.
// Private sessions and ended sessions return 403/404 respectively.
func GetGuestSessionViewHandler(c *gin.Context) {
	sessionID := c.Param("id")

	var session models.WatchSession
	if err := DB.Where("session_id = ? AND is_active = true", sessionID).First(&session).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found or has ended"})
		return
	}

	if session.IsPrivate {
		c.JSON(http.StatusForbidden, gin.H{"error": "This session is private"})
		return
	}

	isPaid := session.TicketPriceTokens > 0 || session.TicketPriceAmount > 0

	// Fetch room separately (WatchSession has RoomID but may not have preloaded Room)
	var room models.Room
	DB.Select("id, name, room_type, image_url").First(&room, session.RoomID)

	var memberCount int64
	DB.Model(&models.WatchSessionMember{}).
		Where("watch_session_id = ? AND is_active = true", session.ID).
		Count(&memberCount)

	// Don't expose media URL to unauthenticated guests for paid sessions
	mediaURL := session.CurrentMediaURL
	if isPaid {
		mediaURL = ""
	}

	c.JSON(http.StatusOK, gin.H{
		"session_id":     session.SessionID,
		"session_title":  session.SessionTitle,
		"watch_type":     session.WatchType,
		"media_url":      mediaURL,
		"media_type":     session.CurrentMediaType,
		"room_name":      room.Name,
		"room_type":      room.RoomType,
		"room_image_url": room.ImageURL,
		"member_count":   memberCount,
		"content_rating": session.ContentRating,
		"started_at":     session.StartedAt,
		"is_paid":        isPaid,
	})
}

// GetGuestSessionChatHandler returns the 20 most recent visible chat messages
// for an active public session — no auth required.
func GetGuestSessionChatHandler(c *gin.Context) {
	sessionID := c.Param("id")

	// Lightweight check: is session active and public?
	var session models.WatchSession
	if err := DB.Select("id, session_id, is_active, is_private").
		Where("session_id = ? AND is_active = true", sessionID).
		First(&session).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	if session.IsPrivate {
		c.JSON(http.StatusForbidden, gin.H{"error": "private"})
		return
	}

	var messages []models.ChatMessage
	DB.Select("id, username, message, created_at").
		Where("session_id = ? AND deleted_by_host = false", sessionID).
		Order("created_at DESC").
		Limit(20).
		Find(&messages)

	// Reverse so oldest message is first (natural scroll order for ticker)
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	c.JSON(http.StatusOK, gin.H{"messages": messages})
}
