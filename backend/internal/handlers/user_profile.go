// backend/internal/handlers/user_profile.go
package handlers

import (
	"log"
	"net/http"
	"strconv"
	"wewatch-backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GetUserProfileHandler retrieves a user's profile with privacy enforcement
// GET /api/users/:id
func GetUserProfileHandler(c *gin.Context) {
	userIDStr := c.Param("id")
	targetUserID, err := strconv.ParseUint(userIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)
	currentUserID := c.GetUint("user_id") // May be 0 if not authenticated

	// Fetch target user
	var targetUser models.User
	if err := db.First(&targetUser, targetUserID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}
		log.Printf("Error finding user: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to find user"})
		return
	}

	// Fetch target user's privacy settings
	var settings models.UserSettings
	err = db.Where("user_id = ?", targetUserID).First(&settings).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		log.Printf("Error fetching user settings: %v", err)
		// Continue with default public profile if settings not found
	}

	// Default to public if no settings found
	profileType := "public"
	if err == nil {
		profileType = settings.ProfileType
	}

	// Check if requesting user can view this profile
	if profileType == "private" && currentUserID != uint(targetUserID) {
		// Private profile - only friends can see full profile
		var friendship models.Friendship
		err := db.Where(
			"((requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)) AND status = ?",
			currentUserID, targetUserID, targetUserID, currentUserID, "accepted",
		).First(&friendship).Error

		if err != nil {
			// Not friends - return limited profile
			c.JSON(http.StatusOK, gin.H{
				"user": gin.H{
					"id":            targetUser.ID,
					"username":      targetUser.Username,
					"avatar_url":    targetUser.AvatarURL,
					"profile_type":  "private",
					"is_private":    true,
					"message":       "This profile is private",
				},
			})
			return
		}
	}

	// Return raw avatar value (absolute URL for CDN, relative '/uploads/...' path,
	// or '' for users with no avatar). Frontend's resolveAvatarUrl() handles resolution.
	profilePicture := targetUser.AvatarURL

	// Check friendship status
	var friendshipStatus string = "none"
	if currentUserID != 0 && currentUserID != uint(targetUserID) {
		var friendship models.Friendship
		err := db.Where(
			"((requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?))",
			currentUserID, targetUserID, targetUserID, currentUserID,
		).First(&friendship).Error

		if err == nil {
			friendshipStatus = string(friendship.Status)
		}
	} else if currentUserID == uint(targetUserID) {
		friendshipStatus = "self"
	}

	// Fetch main room if public — only include room card when room is visible to everyone
	var mainRoomData gin.H
	if targetUser.MainRoomID != nil {
		var room models.Room
		if err := db.Select("id, name, room_type, is_public").First(&room, *targetUser.MainRoomID).Error; err == nil && room.IsPublic {
			mainRoomData = gin.H{
				"id":        room.ID,
				"name":      room.Name,
				"room_type": room.RoomType,
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"user": gin.H{
			"id":                targetUser.ID,
			"username":          targetUser.Username,
			"email":             targetUser.Email,
			"avatar_url":        profilePicture,
			"profile_picture":   profilePicture,
			"bio":               targetUser.Bio,
			"created_at":        targetUser.CreatedAt,
			"profile_type":      profileType,
			"is_private":        profileType == "private",
			"friendship_status": friendshipStatus,
			"main_room":         mainRoomData, // nil if no room or room is private
		},
	})
}
