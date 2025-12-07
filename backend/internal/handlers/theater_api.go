package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"wewatch-backend/internal/models"
)

// GetSessionTheaters returns all theaters for a session
// GET /api/sessions/:id/theaters
func GetSessionTheaters(c *gin.Context) {
	sessionIDStr := c.Param("id")
	sessionID, err := strconv.ParseUint(sessionIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
		return
	}

	// Verify session exists
	var session models.WatchSession
	if err := DB.First(&session, uint(sessionID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	// Get all theaters
	theaters, err := GetAllTheatersForSession(uint(sessionID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch theaters"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"theaters": theaters})
}

// RenameTheater updates a theater's custom name
// PUT /api/theaters/:id/name
func RenameTheater(c *gin.Context) {
	theaterIDStr := c.Param("id")
	theaterID, err := strconv.ParseUint(theaterIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid theater ID"})
		return
	}

	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Name is required"})
		return
	}

	// Get theater
	var theater models.Theater
	if err := DB.First(&theater, uint(theaterID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Theater not found"})
		return
	}

	// Verify user is host
	var session models.WatchSession
	if err := DB.First(&session, theater.WatchSessionID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Session not found"})
		return
	}

	userID, _ := c.Get("userID")
	if session.HostID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only host can rename theaters"})
		return
	}

	// Update name
	theater.CustomName = req.Name
	if err := DB.Save(&theater).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update theater name"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"theater": theater})
}

// GetTheaterOccupancy returns detailed occupancy for a theater
// GET /api/theaters/:id/occupancy
func GetTheaterOccupancy(c *gin.Context) {
	theaterIDStr := c.Param("id")
	theaterID, err := strconv.ParseUint(theaterIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid theater ID"})
		return
	}

	var theater models.Theater
	if err := DB.Preload("Assignments.User").First(&theater, uint(theaterID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Theater not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"theater_id":      theater.ID,
		"theater_number":  theater.TheaterNumber,
		"theater_name":    theater.GetDisplayName(),
		"occupied_seats":  theater.OccupiedSeats,
		"max_seats":       theater.MaxSeats,
		"is_full":         theater.IsFull(),
		"assignments":     theater.Assignments,
	})
}

// RequestBroadcast creates a broadcast request from a user
// POST /api/sessions/:id/broadcast/request
func RequestBroadcast(c *gin.Context) {
	sessionIDStr := c.Param("id")
	sessionID, err := strconv.ParseUint(sessionIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
		return
	}

	userID, _ := c.Get("userID")

	var req struct {
		Message string `json:"message"` // Optional message from user
	}
	c.ShouldBindJSON(&req)

	// Verify session exists
	var session models.WatchSession
	if err := DB.First(&session, uint(sessionID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	// Check if user already has active permission
	var existingPermission models.BroadcastPermission
	err = DB.Where("watch_session_id = ? AND user_id = ? AND is_active = ?", 
		uint(sessionID), userID.(uint), true).First(&existingPermission).Error
	if err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "You already have broadcast permission"})
		return
	}

	// Check if there's already a pending request
	var pendingRequest models.BroadcastRequest
	err = DB.Where("watch_session_id = ? AND user_id = ? AND status = ?", 
		uint(sessionID), userID.(uint), "pending").First(&pendingRequest).Error
	if err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "You already have a pending request"})
		return
	}

	// Create request
	request := models.BroadcastRequest{
		WatchSessionID: uint(sessionID),
		UserID:         userID.(uint),
		Status:         "pending",
		Message:        req.Message,
	}

	if err := DB.Create(&request).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
		return
	}

	// TODO: Send WebSocket notification to host
	// This will be handled in the WebSocket handler

	c.JSON(http.StatusOK, gin.H{
		"message": "Broadcast request sent to host",
		"request": request,
	})
}

// GrantBroadcast grants broadcast permission to a user (host only)
// POST /api/sessions/:id/broadcast/grant
func GrantBroadcast(c *gin.Context) {
	sessionIDStr := c.Param("id")
	sessionID, err := strconv.ParseUint(sessionIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
		return
	}

	var req struct {
		UserID uint `json:"user_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id is required"})
		return
	}

	// Verify session and host
	var session models.WatchSession
	if err := DB.First(&session, uint(sessionID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	hostID, _ := c.Get("userID")
	if session.HostID != hostID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only host can grant broadcast permissions"})
		return
	}

	// Check if permission already exists
	var existingPermission models.BroadcastPermission
	err = DB.Where("watch_session_id = ? AND user_id = ?", uint(sessionID), req.UserID).
		First(&existingPermission).Error

	if err == nil {
		// Permission exists - activate it if inactive
		if !existingPermission.IsActive {
			existingPermission.Activate()
			if err := DB.Save(&existingPermission).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to activate permission"})
				return
			}
			c.JSON(http.StatusOK, gin.H{
				"message":    "Broadcast permission reactivated",
				"permission": existingPermission,
			})
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "User already has active broadcast permission"})
		}
		return
	}

	// Create new permission
	permission := models.BroadcastPermission{
		WatchSessionID: uint(sessionID),
		UserID:         req.UserID,
		GrantedBy:      hostID.(uint),
		IsActive:       true,
	}

	if err := DB.Create(&permission).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to grant permission"})
		return
	}

	// Update any pending requests to approved
	DB.Model(&models.BroadcastRequest{}).
		Where("watch_session_id = ? AND user_id = ? AND status = ?", uint(sessionID), req.UserID, "pending").
		Updates(map[string]interface{}{
			"status":       "approved",
			"responded_at": time.Now(),
			"responded_by": hostID.(uint),
		})

	// TODO: Send WebSocket notification to user
	// This will be handled in the WebSocket handler

	c.JSON(http.StatusOK, gin.H{
		"message":    "Broadcast permission granted",
		"permission": permission,
	})
}

// RevokeBroadcast revokes broadcast permission from a user (host only)
// POST /api/sessions/:id/broadcast/revoke
func RevokeBroadcast(c *gin.Context) {
	sessionIDStr := c.Param("id")
	sessionID, err := strconv.ParseUint(sessionIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
		return
	}

	var req struct {
		UserID uint `json:"user_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id is required"})
		return
	}

	// Verify session and host
	var session models.WatchSession
	if err := DB.First(&session, uint(sessionID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	hostID, _ := c.Get("userID")
	if session.HostID != hostID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only host can revoke broadcast permissions"})
		return
	}

	// Find and revoke permission
	var permission models.BroadcastPermission
	err = DB.Where("watch_session_id = ? AND user_id = ? AND is_active = ?", 
		uint(sessionID), req.UserID, true).First(&permission).Error
	
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No active broadcast permission found for this user"})
		return
	}

	permission.Revoke()
	if err := DB.Save(&permission).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to revoke permission"})
		return
	}

	// TODO: Send WebSocket notification to user
	// This will be handled in the WebSocket handler

	c.JSON(http.StatusOK, gin.H{
		"message": "Broadcast permission revoked",
	})
}

// GetActiveBroadcasters returns all users with active broadcast permissions
// GET /api/sessions/:id/broadcast/active
func GetActiveBroadcasters(c *gin.Context) {
	sessionIDStr := c.Param("id")
	sessionID, err := strconv.ParseUint(sessionIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
		return
	}

	var permissions []models.BroadcastPermission
	err = DB.Preload("User").
		Where("watch_session_id = ? AND is_active = ?", uint(sessionID), true).
		Find(&permissions).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch broadcasters"})
		return
	}

	// Include host (implicit broadcast permission)
	var session models.WatchSession
	DB.First(&session, uint(sessionID))

	broadcasters := make([]map[string]interface{}, 0)
	
	// Add host
	var host models.User
	if err := DB.First(&host, session.HostID).Error; err == nil {
		broadcasters = append(broadcasters, map[string]interface{}{
			"user_id":  session.HostID,
			"username": host.Username,
			"is_host":  true,
		})
	}

	// Add users with permissions
	for _, perm := range permissions {
		if perm.User != nil {
			broadcasters = append(broadcasters, map[string]interface{}{
				"user_id":    perm.UserID,
				"username":   perm.User.Username,
				"is_host":    false,
				"granted_at": perm.CreatedAt,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{"broadcasters": broadcasters})
}

// GetPendingBroadcastRequests returns all pending broadcast requests (host only)
// GET /api/sessions/:id/broadcast/requests
func GetPendingBroadcastRequests(c *gin.Context) {
	sessionIDStr := c.Param("id")
	sessionID, err := strconv.ParseUint(sessionIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
		return
	}

	// Verify session and host
	var session models.WatchSession
	if err := DB.First(&session, uint(sessionID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	hostID, _ := c.Get("userID")
	if session.HostID != hostID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only host can view broadcast requests"})
		return
	}

	var requests []models.BroadcastRequest
	err = DB.Preload("User").
		Where("watch_session_id = ? AND status = ?", uint(sessionID), "pending").
		Order("created_at ASC").
		Find(&requests).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch requests"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"requests": requests})
}
