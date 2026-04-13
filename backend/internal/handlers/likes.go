// backend/internal/handlers/likes.go
package handlers

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"wewatch-backend/internal/models"
	"encoding/json"
)

// LikeSessionHandler handles POST /api/sessions/:id/like
func LikeSessionHandler(c *gin.Context) {
	sessionID := c.Param("id")
	
	// Get authenticated user ID
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDValue.(uint)
	
	// Check if session exists
	var session models.WatchSession
	if err := DB.Where("session_id = ?", sessionID).First(&session).Error; err != nil {
		log.Printf("❌ [LikeSession] Session not found: %s", sessionID)
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}
	
	// Check if user already liked this session (including soft-deleted)
	var existingLike models.SessionLike
	err := DB.Unscoped().Where("session_id = ? AND user_id = ?", sessionID, userID).First(&existingLike).Error
	
	if err == nil {
		// Like exists - check if it's soft-deleted
		if existingLike.DeletedAt.Valid {
			// Restore soft-deleted like
			if err := DB.Unscoped().Model(&existingLike).Update("deleted_at", nil).Error; err != nil {
				log.Printf("❌ [LikeSession] Failed to restore like: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to like session"})
				return
			}
			log.Printf("🔄 [LikeSession] Restored soft-deleted like for user %d on session %s", userID, sessionID)
		} else {
			// Already liked and not deleted - return 409 Conflict
			log.Printf("⚠️ [LikeSession] User %d already liked session %s", userID, sessionID)
			c.JSON(http.StatusConflict, gin.H{
				"error": "You have already liked this session",
				"likes_count": session.LikesCount,
			})
			return
		}
	} else {
		// Like doesn't exist - create new one
		like := models.SessionLike{
			SessionID: sessionID,
			UserID:    userID,
		}
		
		if err := DB.Create(&like).Error; err != nil {
			log.Printf("❌ [LikeSession] Failed to create like: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to like session"})
			return
		}
	}
	
	// Increment cached likes_count
	if err := DB.Model(&models.WatchSession{}).Where("session_id = ?", sessionID).Update("likes_count", session.LikesCount+1).Error; err != nil {
		log.Printf("❌ [LikeSession] Failed to update likes_count: %v", err)
	}
	
	// Get updated count
	var updatedSession models.WatchSession
	DB.Where("session_id = ?", sessionID).First(&updatedSession)
	
	log.Printf("✅ [LikeSession] User %d liked session %s (new count: %d)", userID, sessionID, updatedSession.LikesCount)
	
	// Broadcast to lobby via WebSocket
	broadcastSessionLiked(sessionID, updatedSession.LikesCount, userID)
	
	c.JSON(http.StatusOK, gin.H{
		"message": "Session liked successfully",
		"likes_count": updatedSession.LikesCount,
	})
}

// UnlikeSessionHandler handles DELETE /api/sessions/:id/unlike
func UnlikeSessionHandler(c *gin.Context) {
	sessionID := c.Param("id")
	
	// Get authenticated user ID
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDValue.(uint)
	
	// Check if session exists
	var session models.WatchSession
	if err := DB.Where("session_id = ?", sessionID).First(&session).Error; err != nil {
		log.Printf("❌ [UnlikeSession] Session not found: %s", sessionID)
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}
	
	// Check if like exists
	var like models.SessionLike
	if err := DB.Where("session_id = ? AND user_id = ?", sessionID, userID).First(&like).Error; err != nil {
		log.Printf("⚠️ [UnlikeSession] Like not found for user %d on session %s", userID, sessionID)
		c.JSON(http.StatusNotFound, gin.H{"error": "You haven't liked this session"})
		return
	}
	
	// Hard delete like (permanent removal to avoid unique constraint issues)
	if err := DB.Unscoped().Delete(&like).Error; err != nil {
		log.Printf("❌ [UnlikeSession] Failed to delete like: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unlike session"})
		return
	}
	
	// Decrement cached likes_count (prevent negative)
	newCount := session.LikesCount - 1
	if newCount < 0 {
		newCount = 0
	}
	
	if err := DB.Model(&models.WatchSession{}).Where("session_id = ?", sessionID).Update("likes_count", newCount).Error; err != nil {
		log.Printf("❌ [UnlikeSession] Failed to update likes_count: %v", err)
	}
	
	log.Printf("✅ [UnlikeSession] User %d unliked session %s (new count: %d)", userID, sessionID, newCount)
	
	// Broadcast to lobby via WebSocket
	broadcastSessionUnliked(sessionID, newCount, userID)
	
	c.JSON(http.StatusOK, gin.H{
		"message": "Session unliked successfully",
		"likes_count": newCount,
	})
}

// GetSessionLikesCountHandler handles GET /api/sessions/:id/likes-count
func GetSessionLikesCountHandler(c *gin.Context) {
	sessionID := c.Param("id")
	
	// Check if session exists
	var session models.WatchSession
	if err := DB.Where("session_id = ?", sessionID).First(&session).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"session_id": sessionID,
		"likes_count": session.LikesCount,
	})
}

// IsSessionLikedHandler handles GET /api/sessions/:id/is-liked
func IsSessionLikedHandler(c *gin.Context) {
	sessionID := c.Param("id")
	
	// Get authenticated user ID
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDValue.(uint)
	
	// Check if like exists
	var like models.SessionLike
	isLiked := false
	if err := DB.Where("session_id = ? AND user_id = ?", sessionID, userID).First(&like).Error; err == nil {
		isLiked = true
	}
	
	c.JSON(http.StatusOK, gin.H{
		"session_id": sessionID,
		"is_liked": isLiked,
	})
}

// GetSessionLikeStatusHandler handles GET /api/sessions/:id/like-status
// Returns both isLiked and count in one request
func GetSessionLikeStatusHandler(c *gin.Context) {
	sessionID := c.Param("id")
	
	// Get authenticated user ID
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDValue.(uint)
	
	// Check if session exists and get likes count
	var session models.WatchSession
	if err := DB.Where("session_id = ?", sessionID).First(&session).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}
	
	// Check if user liked this session
	var like models.SessionLike
	isLiked := false
	if err := DB.Where("session_id = ? AND user_id = ?", sessionID, userID).First(&like).Error; err == nil {
		isLiked = true
	}
	
	c.JSON(http.StatusOK, gin.H{
		"sessionId": sessionID,
		"isLiked":   isLiked,
		"count":     session.LikesCount,
	})
}

// broadcastSessionLiked broadcasts session_liked event to lobby
func broadcastSessionLiked(sessionID string, likesCount int, userID uint) {
	if hub == nil {
		log.Println("⚠️ [BroadcastSessionLiked] Hub is nil, cannot broadcast")
		return
	}
	
	event := map[string]interface{}{
		"type":        "session_liked",
		"session_id":  sessionID,
		"likes_count": likesCount,
		"user_id":     userID,
	}
	
	eventJSON, err := json.Marshal(event)
	if err != nil {
		log.Printf("❌ [BroadcastSessionLiked] Failed to marshal event: %v", err)
		return
	}
	
	hub.BroadcastToLobby(OutgoingMessage{
		Data:     eventJSON,
		IsBinary: false,
	})
	
	log.Printf("📡 [BroadcastSessionLiked] Broadcasted like event for session %s (count: %d)", sessionID, likesCount)
}

// broadcastSessionUnliked broadcasts session_unliked event to lobby
func broadcastSessionUnliked(sessionID string, likesCount int, userID uint) {
	if hub == nil {
		log.Println("⚠️ [BroadcastSessionUnliked] Hub is nil, cannot broadcast")
		return
	}
	
	event := map[string]interface{}{
		"type":        "session_unliked",
		"session_id":  sessionID,
		"likes_count": likesCount,
		"user_id":     userID,
	}
	
	eventJSON, err := json.Marshal(event)
	if err != nil {
		log.Printf("❌ [BroadcastSessionUnliked] Failed to marshal event: %v", err)
		return
	}
	
	hub.BroadcastToLobby(OutgoingMessage{
		Data:     eventJSON,
		IsBinary: false,
	})
	
	log.Printf("📡 [BroadcastSessionUnliked] Broadcasted unlike event for session %s (count: %d)", sessionID, likesCount)
}
