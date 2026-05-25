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

// roomTypeLabel returns a contextual community label for room-invite notifications.
func roomTypeLabel(roomType string) string {
	switch roomType {
	case "church":
		return "congregation"
	case "education":
		return "class"
	default:
		return "community"
	}
}

// FollowUserHandler handles POST /api/follow/:userId
// Follows are auto-approved (no pending state). If the target host has rooms with
// auto_invite_followers enabled, the follower receives a room invite notification.
func FollowUserHandler(c *gin.Context) {
	followerID := c.MustGet("user_id").(uint)

	targetIDStr := c.Param("userId")
	targetID, err := strconv.ParseUint(targetIDStr, 10, 32)
	if err != nil || uint(targetID) == followerID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	// Verify target exists
	var target models.User
	if err := db.First(&target, targetID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Idempotent: already following?
	var existing models.UserFollow
	if err := db.Where("follower_id = ? AND following_id = ?", followerID, targetID).First(&existing).Error; err == nil {
		c.JSON(http.StatusOK, gin.H{"message": "Already following", "following": true})
		return
	}

	follow := models.UserFollow{
		FollowerID:  followerID,
		FollowingID: uint(targetID),
	}
	if err := db.Create(&follow).Error; err != nil {
		log.Printf("❌ [Follow] Error creating follow: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to follow user"})
		return
	}

	// Notify target: "X started following you"
	var followerUser models.User
	db.First(&followerUser, followerID)
	hub := GetWebSocketManager()
	if hub != nil {
		payload := map[string]interface{}{
			"type":            "new_follower",
			"follower_id":     followerID,
			"follower_username": followerUser.Username,
			"timestamp":       time.Now().Unix(),
		}
		data, _ := json.Marshal(payload)
		hub.BroadcastToUsers([]uint{uint(targetID)}, OutgoingMessage{Data: data})
	}

	// Auto-invite: find target's rooms with auto_invite_followers = true
	var rooms []models.Room
	db.Where("host_id = ? AND is_temporary = false AND auto_invite_followers = true", targetID).Find(&rooms)

	for _, room := range rooms {
		label := roomTypeLabel(room.RoomType)
		title := "You're invited!"
		body := followerUser.Username + " invited you to join their " + label
		if room.Name != "" {
			body = "Join \"" + room.Name + "\" - " + followerUser.Username + "'s " + label
		}

		// Persist notification
		notif := models.Notification{
			UserID:     followerID,
			Type:       "room_invite",
			Title:      title,
			Body:       body,
			EntityType: "room",
			EntityID:   room.ID,
		}
		db.Create(&notif)

		// Real-time push
		if hub != nil {
			wsPayload := map[string]interface{}{
				"type":       "room_invite",
				"room_id":    room.ID,
				"room_name":  room.Name,
				"room_type":  room.RoomType,
				"host_id":    targetID,
				"host_username": target.Username,
				"title":      title,
				"body":       body,
				"notif_id":   notif.ID,
				"timestamp":  time.Now().Unix(),
			}
			data, _ := json.Marshal(wsPayload)
			hub.BroadcastToUsers([]uint{followerID}, OutgoingMessage{Data: data})
		}
	}

	log.Printf("✅ [Follow] User %d followed user %d; sent %d room invite(s)", followerID, targetID, len(rooms))
	c.JSON(http.StatusCreated, gin.H{"message": "Now following", "following": true})
}

// UnfollowUserHandler handles DELETE /api/follow/:userId
// Unfollow does NOT remove the user from any rooms — membership is independent.
func UnfollowUserHandler(c *gin.Context) {
	followerID := c.MustGet("user_id").(uint)

	targetIDStr := c.Param("userId")
	targetID, err := strconv.ParseUint(targetIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	result := db.Where("follower_id = ? AND following_id = ?", followerID, targetID).Delete(&models.UserFollow{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unfollow"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Unfollowed", "following": false})
}

// GetFollowStatusHandler handles GET /api/follow/status/:userId
// Returns whether the current user follows the target user.
func GetFollowStatusHandler(c *gin.Context) {
	followerID := c.MustGet("user_id").(uint)

	targetIDStr := c.Param("userId")
	targetID, err := strconv.ParseUint(targetIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	var follow models.UserFollow
	err = db.Where("follower_id = ? AND following_id = ?", followerID, targetID).First(&follow).Error
	isFollowing := err == nil

	// Also return follower count for the target
	var followerCount int64
	db.Model(&models.UserFollow{}).Where("following_id = ?", targetID).Count(&followerCount)

	c.JSON(http.StatusOK, gin.H{
		"following":       isFollowing,
		"followers_count": followerCount,
	})
}

// GetFollowingCountHandler handles GET /api/users/:id/following-count
// Returns count of unique users this person is following:
// hosts of rooms they've joined + explicit user_follows, deduped.
func GetFollowingCountHandler(c *gin.Context) {
	userIDStr := c.Param("id")
	userID, err := strconv.ParseUint(userIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	var count int64
	if err := db.Raw(`
		SELECT COUNT(DISTINCT target_id) FROM (
			SELECT r.host_id AS target_id
			FROM user_rooms ur
			JOIN rooms r ON ur.room_id = r.id
			WHERE ur.user_id = ? AND r.host_id != ? AND r.is_temporary = false
			UNION
			SELECT following_id AS target_id
			FROM user_follows
			WHERE follower_id = ? AND following_id != ?
		) AS all_following
	`, userID, userID, userID, userID).Scan(&count).Error; err != nil {
		log.Printf("Error counting following for user %d: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count following"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"user_id": userID, "following_count": count})
}

// GetFollowingListHandler handles GET /api/users/:id/following
// Returns the list of users this person follows (room hosts + explicit follows, deduped).
// Access: always allowed for the owner; for others, only if show_following_public = true.
func GetFollowingListHandler(c *gin.Context) {
	userIDStr := c.Param("id")
	userID, err := strconv.ParseUint(userIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	requesterID := c.MustGet("user_id").(uint)
	db := c.MustGet("db").(*gorm.DB)

	var targetUser models.User
	if err := db.Select("id, show_following_public").First(&targetUser, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	if requesterID != uint(userID) && !targetUser.ShowFollowingPublic {
		c.JSON(http.StatusForbidden, gin.H{"error": "This user's following list is private"})
		return
	}

	type FollowingUser struct {
		ID         uint   `json:"id"`
		Username   string `json:"username"`
		AvatarURL  string `json:"avatar_url"`
		MainRoomID *uint  `json:"main_room_id"`
	}

	var users []FollowingUser
	if err := db.Raw(`
		SELECT DISTINCT u.id, u.username, u.avatar_url, u.main_room_id
		FROM users u
		WHERE u.id IN (
			SELECT DISTINCT r.host_id
			FROM user_rooms ur
			JOIN rooms r ON ur.room_id = r.id
			WHERE ur.user_id = ? AND r.host_id != ? AND r.is_temporary = false
			UNION
			SELECT following_id
			FROM user_follows
			WHERE follower_id = ? AND following_id != ?
		)
		AND u.deleted_at IS NULL
		ORDER BY u.username
	`, userID, userID, userID, userID).Scan(&users).Error; err != nil {
		log.Printf("Error fetching following list for user %d: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch following list"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"following": users, "count": len(users)})
}

// UpdateFollowingPrivacyHandler handles PATCH /api/users/privacy
// Toggles whether the user's following/followers list is publicly visible.
func UpdateFollowingPrivacyHandler(c *gin.Context) {
	userID := c.MustGet("user_id").(uint)
	db := c.MustGet("db").(*gorm.DB)

	var req struct {
		ShowFollowingPublic bool `json:"show_following_public"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	if err := db.Model(&models.User{}).Where("id = ?", userID).Update("show_following_public", req.ShowFollowingPublic).Error; err != nil {
		log.Printf("Error updating following privacy for user %d: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update privacy setting"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"show_following_public": req.ShowFollowingPublic})
}
