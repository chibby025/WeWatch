package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"wewatch-backend/internal/models"
)

// LogSessionJoinAttemptHandler records that a user started trying to join a watch
// session, called from the frontend before it opens the WebSocket/LiveKit
// connection. This exists independently of the WS handshake so a user whose
// connection never completes (bad network, server hiccup) still shows up as a
// recorded attempt instead of vanishing entirely.
func LogSessionJoinAttemptHandler(c *gin.Context) {
	userID := c.MustGet("user_id").(uint)
	sessionID := c.Param("session_id")

	var session models.WatchSession
	if err := DB.Where("session_id = ?", sessionID).First(&session).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	attempt := models.SessionJoinAttempt{
		WatchSessionID: session.ID,
		UserID:         userID,
		AttemptedAt:    time.Now(),
		Status:         "pending",
	}
	if err := DB.Create(&attempt).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to log join attempt"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetSessionJoinStatsHandler compares join attempts against confirmed members
// for a session. stuck_pending is the count of users who attempted to join but
// never reached the point where the server wrote their member row — i.e. the
// "joined for them, ghost for everyone else" failure mode.
func GetSessionJoinStatsHandler(c *gin.Context) {
	sessionID := c.Param("session_id")

	var session models.WatchSession
	if err := DB.Where("session_id = ?", sessionID).First(&session).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	var attempted, confirmed int64
	DB.Model(&models.SessionJoinAttempt{}).Where("watch_session_id = ?", session.ID).Count(&attempted)
	DB.Model(&models.SessionJoinAttempt{}).Where("watch_session_id = ? AND status = ?", session.ID, "confirmed").Count(&confirmed)

	var currentMembers int64
	DB.Model(&models.WatchSessionMember{}).Where("watch_session_id = ? AND is_active = ?", session.ID, true).Count(&currentMembers)

	c.JSON(http.StatusOK, gin.H{
		"attempted":       attempted,
		"confirmed":       confirmed,
		"stuck_pending":   attempted - confirmed,
		"current_members": currentMembers,
	})
}
