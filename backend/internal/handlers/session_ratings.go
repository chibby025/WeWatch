// backend/internal/handlers/session_ratings.go
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

// SubmitSessionRatingRequest defines the request body for rating submission
type SubmitSessionRatingRequest struct {
	Rating int    `json:"rating" binding:"required,min=1,max=5"`
	Review string `json:"review" binding:"max=500"`
}

// SubmitSessionRatingHandler handles POST /api/sessions/:id/ratings
// Allows users to rate a session after it ends, contributing to room's overall rating
func SubmitSessionRatingHandler(c *gin.Context) {
	log.Println("⭐ [SubmitSessionRating] Request received")

	// 1. Authenticate user
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// 2. Get session ID from URL
	sessionID := c.Param("id")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Session ID is required"})
		return
	}

	// 3. Parse request body
	var req SubmitSessionRatingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("❌ [SubmitSessionRating] Invalid request body: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	// 4. Get session and verify it exists
	var session models.WatchSession
	if err := DB.Where("session_id = ?", sessionID).First(&session).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// 5. ✅ REMOVED membership check - members are cleaned up after session ends
	// Frontend sessionStorage already verifies user was present (received session_ended WebSocket)
	// UNIQUE constraint on ratings table prevents duplicate ratings
	log.Printf("✅ [SubmitSessionRating] Processing rating from user %d for session %s", userID, sessionID)

	// 6. Create rating (UNIQUE constraint prevents duplicate ratings)
	rating := models.SessionRating{
		SessionID: sessionID,
		UserID:    userID,
		HostID:    session.HostID,
		RoomID:    session.RoomID, // ✅ Link to room for aggregation
		Rating:    req.Rating,
		Review:    req.Review,
	}

	if err := DB.Create(&rating).Error; err != nil {
		// Handle duplicate rating error
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			c.JSON(http.StatusConflict, gin.H{"error": "You have already rated this session"})
			return
		}
		log.Printf("❌ [SubmitSessionRating] Failed to save rating: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save rating"})
		return
	}

	log.Printf("✅ [SubmitSessionRating] Rating saved: user=%d, session=%s, rating=%d", userID, sessionID, req.Rating)

	// 7. ✅ Update room's running average (atomic operation)
	var room models.Room
	if err := DB.First(&room, session.RoomID).Error; err != nil {
		log.Printf("⚠️ [SubmitSessionRating] Failed to load room: %v", err)
		// Rating saved, but room update failed - still return success
		c.JSON(http.StatusOK, gin.H{
			"message": "Rating submitted successfully",
		})
		return
	}

	// Calculate new average using cumulative sum approach
	newSum := room.CumulativeRatingSum + req.Rating
	newCount := room.TotalRatings + 1
	newAverage := float64(newSum) / float64(newCount)

	// Update room with new rating stats
	if err := DB.Model(&room).Updates(map[string]interface{}{
		"cumulative_rating_sum": newSum,
		"total_ratings":         newCount,
		"average_rating":        newAverage,
	}).Error; err != nil {
		log.Printf("⚠️ [SubmitSessionRating] Failed to update room rating: %v", err)
		// Rating saved, but room update failed - still return success
		c.JSON(http.StatusOK, gin.H{
			"message": "Rating submitted successfully",
		})
		return
	}

	log.Printf("✅ [SubmitSessionRating] Room %d rating updated: %.2f (%d ratings)", session.RoomID, newAverage, newCount)

	// 8. ✅ Broadcast rating update to lobby WebSocket
	hub := GetHub()
	if hub != nil {
		broadcastData := map[string]interface{}{
			"type":           "room_rating_updated",
			"room_id":        session.RoomID,
			"average_rating": newAverage,
			"total_ratings":  newCount,
		}
		broadcastJSON, _ := json.Marshal(broadcastData)
		hub.BroadcastToLobby(OutgoingMessage{
			Data:     broadcastJSON,
			IsBinary: false,
		})
		log.Printf("📡 [SubmitSessionRating] Broadcasted rating update to lobby")
	}

	// 9. Return success with updated room rating
	c.JSON(http.StatusOK, gin.H{
		"message":          "Rating submitted successfully",
		"new_room_average": newAverage,
		"total_ratings":    newCount,
	})
}

// GetRoomRatingsHandler handles GET /api/rooms/:id/ratings
// Returns all ratings for a specific room with user details and reviews
func GetRoomRatingsHandler(c *gin.Context) {
	roomID := c.Param("id")
	if roomID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Room ID is required"})
		return
	}

	// Verify room exists
	var room models.Room
	if err := DB.First(&room, roomID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Get all ratings for this room with user details
	var ratings []models.SessionRating
	if err := DB.Where("room_id = ?", roomID).
		Preload("User").
		Order("created_at DESC").
		Limit(50). // Latest 50 ratings
		Find(&ratings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch ratings"})
		return
	}

	// Format response
	ratingsResponse := make([]gin.H, len(ratings))
	for i, r := range ratings {
		username := "Anonymous"
		if r.User != nil {
			username = r.User.Username
		}

		ratingsResponse[i] = gin.H{
			"id":          r.ID,
			"rating":      r.Rating,
			"review":      r.Review,
			"username":    username,
			"created_at":  r.CreatedAt,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"room_id":        room.ID,
		"room_name":      room.Name,
		"average_rating": room.AverageRating,
		"total_ratings":  room.TotalRatings,
		"ratings":        ratingsResponse,
	})
}
