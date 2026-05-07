package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
	"wewatch-backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GetBackendURL returns the backend base URL (for profile images)
func GetBackendURL() string {
	// Check if RAILWAY_ENVIRONMENT is set (production)
	if os.Getenv("RAILWAY_ENVIRONMENT") != "" {
		return "https://letswatchout-production.up.railway.app"
	}
	// Local development
	return "http://localhost:8080"
}

// SendFriendRequestHandler sends a friend request to another user
func SendFriendRequestHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	requesterID := userID.(uint)

	recipientIDStr := c.Param("userId")
	recipientID, err := strconv.ParseUint(recipientIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if requesterID == uint(recipientID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot send friend request to yourself"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	// Get current user info for notification
	var currentUser models.User
	if err := db.First(&currentUser, requesterID).Error; err != nil {
		log.Printf("Error finding current user: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to find user"})
		return
	}

	var recipient models.User
	if err := db.First(&recipient, recipientID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}
		log.Printf("Error finding recipient: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to find user"})
		return
	}

	var existingFriendship models.Friendship
	err = db.Where(
		"(requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)",
		requesterID, recipientID, recipientID, requesterID,
	).First(&existingFriendship).Error

	if err == nil {
		switch existingFriendship.Status {
		case models.FriendshipStatusPending:
			c.JSON(http.StatusConflict, gin.H{"error": "Friend request already pending"})
			return
		case models.FriendshipStatusAccepted:
			c.JSON(http.StatusConflict, gin.H{"error": "Already friends"})
			return
		case models.FriendshipStatusRejected:
			existingFriendship.Status = models.FriendshipStatusPending
			if err := db.Save(&existingFriendship).Error; err != nil {
				log.Printf("Error updating friendship: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send friend request"})
				return
			}
			c.JSON(http.StatusOK, gin.H{
				"message":    "Friend request sent",
				"friendship": existingFriendship,
			})
			return
		}
	} else if err != gorm.ErrRecordNotFound {
		log.Printf("Error checking existing friendship: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check friendship status"})
		return
	}

	friendship := models.Friendship{
		RequesterID: requesterID,
		RecipientID: uint(recipientID),
		Status:      models.FriendshipStatusPending,
	}

	if err := db.Create(&friendship).Error; err != nil {
		log.Printf("Error creating friendship: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send friend request"})
		return
	}

	db.Preload("Requester").First(&friendship, friendship.ID)

	// ✅ Broadcast to recipient via lobby WebSocket
	hub := GetWebSocketManager()
	if hub != nil {
		notification := map[string]interface{}{
			"type":          "friend_request_received",
			"from_user_id":  requesterID,
			"from_username": currentUser.Username,
			"timestamp":     time.Now().Unix(),
		}
		data, _ := json.Marshal(notification)
		hub.BroadcastToUsers([]uint{uint(recipientID)}, OutgoingMessage{
			Data:     data,
			IsBinary: false,
		})
		log.Printf("✅ Sent friend request notification to user %d", recipientID)
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":    "Friend request sent",
		"friendship": friendship,
	})
}

// AcceptFriendRequestHandler accepts a pending friend request
func AcceptFriendRequestHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	recipientID := userID.(uint)

	requesterIDStr := c.Param("userId")
	requesterID, err := strconv.ParseUint(requesterIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	var friendship models.Friendship
	err = db.Where(
		"requester_id = ? AND recipient_id = ? AND status = ?",
		requesterID, recipientID, models.FriendshipStatusPending,
	).First(&friendship).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "No pending friend request found"})
			return
		}
		log.Printf("Error finding friend request: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to find friend request"})
		return
	}

	friendship.Status = models.FriendshipStatusAccepted
	if err := db.Save(&friendship).Error; err != nil {
		log.Printf("Error accepting friend request: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to accept friend request"})
		return
	}

	db.Preload("Requester").First(&friendship, friendship.ID)

	// ✅ Broadcast to requester via lobby WebSocket
	hub := GetWebSocketManager()
	if hub != nil {
		// Get recipient user info
		var recipient models.User
		if err := db.First(&recipient, recipientID).Error; err == nil {
			notification := map[string]interface{}{
				"type":          "friend_request_accepted",
				"from_user_id":  recipientID,
				"from_username": recipient.Username,
				"timestamp":     time.Now().Unix(),
			}
			data, _ := json.Marshal(notification)
			hub.BroadcastToUsers([]uint{uint(requesterID)}, OutgoingMessage{
				Data:     data,
				IsBinary: false,
			})
			log.Printf("✅ Sent friend request acceptance notification to user %d", requesterID)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    "Friend request accepted",
		"friendship": friendship,
	})
}

// RejectFriendRequestHandler rejects a pending friend request
func RejectFriendRequestHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	recipientID := userID.(uint)

	requesterIDStr := c.Param("userId")
	requesterID, err := strconv.ParseUint(requesterIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	var friendship models.Friendship
	err = db.Where(
		"requester_id = ? AND recipient_id = ? AND status = ?",
		requesterID, recipientID, models.FriendshipStatusPending,
	).First(&friendship).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "No pending friend request found"})
			return
		}
		log.Printf("Error finding friend request: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to find friend request"})
		return
	}

	friendship.Status = models.FriendshipStatusRejected
	if err := db.Save(&friendship).Error; err != nil {
		log.Printf("Error rejecting friend request: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reject friend request"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Friend request rejected",
	})
}

// GetPendingFriendRequestsHandler returns all pending friend requests for the current user
func GetPendingFriendRequestsHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	currentUserID := userID.(uint)

	db := c.MustGet("db").(*gorm.DB)

	var friendRequests []models.Friendship
	err := db.
		Where("recipient_id = ? AND status = ?", currentUserID, models.FriendshipStatusPending).
		Preload("Requester").
		Order("created_at DESC").
		Find(&friendRequests).Error

	if err != nil {
		log.Printf("Error fetching pending friend requests: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch friend requests"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"requests": friendRequests,
		"count":    len(friendRequests),
	})
}

// GetSentFriendRequestsHandler returns all pending friend requests sent by the current user
func GetSentFriendRequestsHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	currentUserID := userID.(uint)

	db := c.MustGet("db").(*gorm.DB)

	var sentRequests []models.Friendship
	err := db.
		Where("requester_id = ? AND status = ?", currentUserID, models.FriendshipStatusPending).
		Preload("Recipient").
		Order("created_at DESC").
		Find(&sentRequests).Error

	if err != nil {
		log.Printf("Error fetching sent friend requests: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch sent requests"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"requests": sentRequests,
		"count":    len(sentRequests),
	})
}

// GetFriendsListHandler returns all accepted friends for the current user
func GetFriendsListHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	currentUserID := userID.(uint)

	db := c.MustGet("db").(*gorm.DB)

	var friendships []models.Friendship
	err := db.
		Where(
			"(requester_id = ? OR recipient_id = ?) AND status = ?",
			currentUserID, currentUserID, models.FriendshipStatusAccepted,
		).
		Preload("Requester").
		Preload("Recipient").
		Find(&friendships).Error

	if err != nil {
		log.Printf("Error fetching friends: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch friends"})
		return
	}

	friends := make([]gin.H, 0, len(friendships))
	for _, friendship := range friendships {
		var friend models.User
		if friendship.RequesterID == currentUserID {
			friend = friendship.Recipient
		} else {
			friend = friendship.Requester
		}
		
		// ✅ Generate full URL for profile picture
		profilePictureURL := ""
		if friend.AvatarURL != "" {
			if strings.HasPrefix(friend.AvatarURL, "http") {
				// Already a full URL (Bunny CDN)
				profilePictureURL = friend.AvatarURL
			} else {
				// Railway backend path - construct full URL
				profilePictureURL = GetBackendURL() + "/" + strings.TrimPrefix(friend.AvatarURL, "/")
			}
		}
		
		friends = append(friends, gin.H{
			"id":              friend.ID,
			"username":        friend.Username,
			"display_name":    friend.Username, // Use Username as display name
			"email":           friend.Email,
			"profile_picture": profilePictureURL,
			"created_at":      friend.CreatedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"friends": friends,
		"count":   len(friends),
	})
}

// RemoveFriendHandler removes an accepted friendship
func RemoveFriendHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	currentUserID := userID.(uint)

	friendIDStr := c.Param("userId")
	friendID, err := strconv.ParseUint(friendIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	var friendship models.Friendship
	err = db.Where(
		"((requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)) AND status = ?",
		currentUserID, friendID, friendID, currentUserID, models.FriendshipStatusAccepted,
	).First(&friendship).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Friendship not found"})
			return
		}
		log.Printf("Error finding friendship: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to find friendship"})
		return
	}

	if err := db.Delete(&friendship).Error; err != nil {
		log.Printf("Error removing friendship: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove friend"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Friend removed successfully",
	})
}

// GetFriendshipStatusHandler checks the friendship status with another user
func GetFriendshipStatusHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	currentUserID := userID.(uint)

	otherUserIDStr := c.Param("userId")
	otherUserID, err := strconv.ParseUint(otherUserIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	var friendship models.Friendship
	err = db.Where(
		"(requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)",
		currentUserID, otherUserID, otherUserID, currentUserID,
	).First(&friendship).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusOK, gin.H{
				"status":      "none",
				"can_request": true,
			})
			return
		}
		log.Printf("Error checking friendship status: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check friendship status"})
		return
	}

	isRequester := friendship.RequesterID == currentUserID

	c.JSON(http.StatusOK, gin.H{
		"status":       friendship.Status,
		"is_requester": isRequester,
		"friendship":   friendship,
	})
}

// GetFriendCountHandler returns the total number of friends for a user
func GetFriendCountHandler(c *gin.Context) {
	userIDStr := c.Param("userId")
	userID, err := strconv.ParseUint(userIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	var count int64
	err = db.Model(&models.Friendship{}).
		Where(
			"(requester_id = ? OR recipient_id = ?) AND status = ?",
			userID, userID, models.FriendshipStatusAccepted,
		).
		Count(&count).Error

	if err != nil {
		log.Printf("Error counting friends for user %d: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count friends"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"user_id": userID,
		"count":   count,
	})
}

// GetFollowersCountHandler returns unique member count across all rooms hosted by a user
func GetFollowersCountHandler(c *gin.Context) {
	userIDStr := c.Param("userId")
	userID, err := strconv.ParseUint(userIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	// Count unique members across all rooms hosted by this user
	// Excludes the host themselves from the count
	var count int64
	err = db.Table("user_rooms").
		Select("COUNT(DISTINCT user_rooms.user_id)").
		Joins("JOIN rooms ON user_rooms.room_id = rooms.id").
		Where("rooms.host_id = ? AND user_rooms.user_id != ?", userID, userID).
		Count(&count).Error

	if err != nil {
		log.Printf("Error counting followers for user %d: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count followers"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"user_id":         userID,
		"followers_count": count,
	})
}
