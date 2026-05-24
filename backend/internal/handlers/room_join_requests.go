package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"
	"wewatch-backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GetRoomJoinRequestsHandler handles GET /api/rooms/:id/join-requests
// Returns pending join requests for a private room. Host only.
// Also returns the pending count for the floating badge.
func GetRoomJoinRequestsHandler(c *gin.Context) {
	currentUserID := c.MustGet("user_id").(uint)

	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil || roomID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	var room models.Room
	if err := db.First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}
	if room.HostID != currentUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the host can view join requests"})
		return
	}

	var requests []models.UserRoom
	if err := db.Where("room_id = ? AND status = ?", roomID, "pending").
		Preload("User").
		Order("created_at ASC").
		Find(&requests).Error; err != nil {
		log.Printf("❌ [JoinRequests] DB error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch join requests"})
		return
	}

	type requestDTO struct {
		UserRoomID uint      `json:"user_room_id"`
		UserID     uint      `json:"user_id"`
		Username   string    `json:"username"`
		AvatarURL  string    `json:"avatar_url"`
		RequestedAt time.Time `json:"requested_at"`
	}
	result := make([]requestDTO, 0, len(requests))
	for _, r := range requests {
		dto := requestDTO{
			UserRoomID:  r.ID,
			UserID:      r.UserID,
			RequestedAt: r.CreatedAt,
		}
		if r.User != nil {
			dto.Username = r.User.Username
			dto.AvatarURL = r.User.AvatarURL
		}
		result = append(result, dto)
	}

	c.JSON(http.StatusOK, gin.H{
		"requests": result,
		"count":    len(result),
	})
}

// ApproveRoomJoinRequestHandler handles POST /api/rooms/:id/join-requests/:userId/approve
// Moves a pending UserRoom entry to 'active' and notifies the user.
func ApproveRoomJoinRequestHandler(c *gin.Context) {
	currentUserID := c.MustGet("user_id").(uint)

	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil || roomID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	targetIDStr := c.Param("userId")
	targetID, err := strconv.ParseUint(targetIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	var room models.Room
	if err := db.First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}
	if room.HostID != currentUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the host can approve requests"})
		return
	}

	result := db.Model(&models.UserRoom{}).
		Where("user_id = ? AND room_id = ? AND status = ?", targetID, roomID, "pending").
		Update("status", "active")
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to approve request"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "No pending request found for this user"})
		return
	}

	// Notify the approved user
	hub := GetWebSocketManager()
	if hub != nil {
		var hostUser models.User
		db.First(&hostUser, currentUserID)
		payload := map[string]interface{}{
			"type":      "room_join_approved",
			"room_id":   roomID,
			"room_name": room.Name,
			"host_id":   currentUserID,
			"host_username": hostUser.Username,
			"timestamp": time.Now().Unix(),
		}
		data, _ := json.Marshal(payload)
		hub.BroadcastToUsers([]uint{uint(targetID)}, OutgoingMessage{Data: data})
	}

	log.Printf("✅ [JoinRequests] Host %d approved user %d for room %d", currentUserID, targetID, roomID)
	c.JSON(http.StatusOK, gin.H{"message": "Request approved"})
}

// RejectRoomJoinRequestHandler handles POST /api/rooms/:id/join-requests/:userId/reject
// Deletes a pending UserRoom entry and notifies the user.
func RejectRoomJoinRequestHandler(c *gin.Context) {
	currentUserID := c.MustGet("user_id").(uint)

	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil || roomID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	targetIDStr := c.Param("userId")
	targetID, err := strconv.ParseUint(targetIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	var room models.Room
	if err := db.First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}
	if room.HostID != currentUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the host can reject requests"})
		return
	}

	result := db.Where("user_id = ? AND room_id = ? AND status = ?", targetID, roomID, "pending").
		Delete(&models.UserRoom{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reject request"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "No pending request found for this user"})
		return
	}

	// Notify the rejected user
	hub := GetWebSocketManager()
	if hub != nil {
		payload := map[string]interface{}{
			"type":      "room_join_rejected",
			"room_id":   roomID,
			"room_name": room.Name,
			"timestamp": time.Now().Unix(),
		}
		data, _ := json.Marshal(payload)
		hub.BroadcastToUsers([]uint{uint(targetID)}, OutgoingMessage{Data: data})
	}

	log.Printf("✅ [JoinRequests] Host %d rejected user %d for room %d", currentUserID, targetID, roomID)
	c.JSON(http.StatusOK, gin.H{"message": "Request rejected"})
}
