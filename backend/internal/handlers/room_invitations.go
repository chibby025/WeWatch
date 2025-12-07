// WeWatch/backend/internal/handlers/room_invitations.go
package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"wewatch-backend/internal/models"
)

// GenerateInviteToken creates a secure random token for invite links
func GenerateInviteToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// CreateRoomInviteLinkHandler handles POST /api/rooms/:id/invites/link
// Creates a shareable invite link for a private room
func CreateRoomInviteLinkHandler(c *gin.Context) {
	// Get authenticated user ID
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	// Get room ID from URL
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// Check if room exists and is private
	var room models.Room
	if err := DB.First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	// Verify user is the room host
	userIDUint := userID.(uint)
	if room.HostID != userIDUint {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can create invite links"})
		return
	}

	if room.IsPublic {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot create invite links for public rooms"})
		return
	}

	// Parse request body for expiration
	type InviteLinkRequest struct {
		ExpiresInHours *int `json:"expires_in_hours"` // NULL for permanent
	}
	var req InviteLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// Default to no expiration if not provided
		req.ExpiresInHours = nil
	}

	// Generate invite token
	token, err := GenerateInviteToken()
	if err != nil {
		log.Printf("❌ Error generating invite token: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate invite token"})
		return
	}

	// Calculate expiration time
	var expiresAt *time.Time
	if req.ExpiresInHours != nil && *req.ExpiresInHours > 0 {
		expTime := time.Now().Add(time.Duration(*req.ExpiresInHours) * time.Hour)
		expiresAt = &expTime
	}

	// Create invitation record
	invitation := models.RoomInvitation{
		RoomID:        uint(roomID),
		InviterUserID: userIDUint,
		InviteToken:   token,
		Status:        "pending",
		ExpiresAt:     expiresAt,
	}

	if err := DB.Create(&invitation).Error; err != nil {
		log.Printf("❌ Error creating invite: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create invite"})
		return
	}

	log.Printf("✅ Created invite link for room %d: %s", roomID, token)
	c.JSON(http.StatusCreated, gin.H{
		"invite": gin.H{
			"id":          invitation.ID,
			"token":       token,
			"expires_at":  expiresAt,
			"invite_link": "/join/" + token, // Frontend will construct full URL
		},
	})
}

// AcceptInviteByTokenHandler handles POST /api/invites/:token/accept
// Accepts an invite link and adds user to the room
func AcceptInviteByTokenHandler(c *gin.Context) {
	// Get authenticated user ID
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userIDUint := userID.(uint)

	// Get invite token from URL
	token := c.Param("token")

	// Find invitation
	var invitation models.RoomInvitation
	if err := DB.Where("invite_token = ?", token).First(&invitation).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invalid or expired invite link"})
		return
	}

	// Check if invite is valid
	if !invitation.IsValid() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "This invite has expired or is no longer valid"})
		return
	}

	// Check if user is already a member
	var existingMembership models.UserRoom
	if err := DB.Where("user_id = ? AND room_id = ?", userIDUint, invitation.RoomID).First(&existingMembership).Error; err == nil {
		c.JSON(http.StatusOK, gin.H{
			"message": "You are already a member of this room",
			"room_id": invitation.RoomID,
		})
		return
	}

	// Create UserRoom membership
	userRoom := models.UserRoom{
		UserID: userIDUint,
		RoomID: invitation.RoomID,
	}

	if err := DB.Create(&userRoom).Error; err != nil {
		log.Printf("❌ Error creating room membership: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to join room"})
		return
	}

	// Update invitation status to accepted
	invitation.Status = "accepted"
	invitation.InvitedUserID = &userIDUint
	DB.Save(&invitation)

	log.Printf("✅ User %d accepted invite and joined room %d", userIDUint, invitation.RoomID)
	c.JSON(http.StatusOK, gin.H{
		"message": "Successfully joined the room",
		"room_id": invitation.RoomID,
	})
}

// GetRoomInvitesHandler handles GET /api/rooms/:id/invites
// Lists all invites for a room (host only)
func GetRoomInvitesHandler(c *gin.Context) {
	// Get authenticated user ID
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	// Get room ID from URL
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// Check if room exists
	var room models.Room
	if err := DB.First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	// Verify user is the room host
	if room.HostID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can view invites"})
		return
	}

	// Fetch all invites for this room
	var invites []models.RoomInvitation
	if err := DB.Where("room_id = ?", roomID).
		Preload("InvitedUser").
		Preload("InviterUser").
		Order("created_at DESC").
		Find(&invites).Error; err != nil {
		log.Printf("❌ Error fetching invites: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch invites"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"invites": invites,
		"count":   len(invites),
	})
}

// RevokeRoomInviteHandler handles DELETE /api/rooms/:id/invites/:invite_id
// Revokes/deletes an invite (host only)
func RevokeRoomInviteHandler(c *gin.Context) {
	// Get authenticated user ID
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	// Get room ID and invite ID from URL
	roomIDStr := c.Param("id")
	inviteIDStr := c.Param("invite_id")
	
	roomID, err := strconv.ParseUint(roomIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	
	inviteID, err := strconv.ParseUint(inviteIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid invite ID"})
		return
	}

	// Check if room exists
	var room models.Room
	if err := DB.First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	// Verify user is the room host
	if room.HostID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can revoke invites"})
		return
	}

	// Delete the invite
	if err := DB.Delete(&models.RoomInvitation{}, inviteID).Error; err != nil {
		log.Printf("❌ Error revoking invite: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to revoke invite"})
		return
	}

	log.Printf("✅ Revoked invite %d for room %d", inviteID, roomID)
	c.JSON(http.StatusOK, gin.H{"message": "Invite revoked successfully"})
}

// CheckUserRoomAccessHandler handles GET /api/rooms/:id/check-access
// Checks if user has access to a room (for private rooms)
func CheckUserRoomAccessHandler(c *gin.Context) {
	// Get authenticated user ID
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	// Get room ID from URL
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// Check if room exists
	var room models.Room
	if err := DB.First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	// If room is public, everyone has access
	if room.IsPublic {
		c.JSON(http.StatusOK, gin.H{
			"has_access": true,
			"reason":     "public_room",
		})
		return
	}

	// Check if user is the host
	if room.HostID == userID.(uint) {
		c.JSON(http.StatusOK, gin.H{
			"has_access": true,
			"reason":     "room_host",
		})
		return
	}

	// Check if user is already a member
	var membership models.UserRoom
	if err := DB.Where("user_id = ? AND room_id = ?", userID, roomID).First(&membership).Error; err == nil {
		c.JSON(http.StatusOK, gin.H{
			"has_access": true,
			"reason":     "existing_member",
		})
		return
	}

	// No access
	c.JSON(http.StatusForbidden, gin.H{
		"has_access": false,
		"reason":     "private_room_no_invite",
	})
}
