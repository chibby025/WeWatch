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

	// ✅ Check recipient's privacy settings for friend requests
	var recipientSettings models.UserSettings
	err = db.Where("user_id = ?", recipientID).First(&recipientSettings).Error
	if err == nil {
		// Privacy enforcement
		switch recipientSettings.WhoCanFriendRequest {
		case "nobody":
			c.JSON(http.StatusForbidden, gin.H{"error": "This user is not accepting friend requests"})
			return
		case "friends_of_friends":
			// Check if requester is a friend of any of recipient's friends
			var mutualFriendsCount int64
			db.Raw(`
				SELECT COUNT(DISTINCT f1.requester_id) + COUNT(DISTINCT f1.recipient_id)
				FROM friendships f1
				INNER JOIN friendships f2 ON (
					(f1.requester_id = f2.requester_id OR f1.requester_id = f2.recipient_id OR 
					 f1.recipient_id = f2.requester_id OR f1.recipient_id = f2.recipient_id)
					AND f1.status = 'accepted' AND f2.status = 'accepted'
				)
				WHERE ((f1.requester_id = ? OR f1.recipient_id = ?) AND f1.status = 'accepted')
				AND ((f2.requester_id = ? OR f2.recipient_id = ?) AND f2.status = 'accepted')
				AND f1.requester_id != f2.requester_id AND f1.requester_id != f2.recipient_id
				AND f1.recipient_id != f2.requester_id AND f1.recipient_id != f2.recipient_id
			`, recipientID, recipientID, requesterID, requesterID).Scan(&mutualFriendsCount)
			
			if mutualFriendsCount == 0 {
				c.JSON(http.StatusForbidden, gin.H{"error": "You need mutual friends to send a request to this user"})
				return
			}
		// "everyone" - no restriction
		}
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
		// Check notification settings
		var settings models.UserSettings
		if err := db.Where("user_id = ?", recipientID).First(&settings).Error; err == nil {
			if settings.PushEnabled && settings.FriendRequestsNotif {
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
			} else {
				log.Printf("🔕 User %d has friend request notifications disabled", recipientID)
			}
		}
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
			// Check notification settings
			var settings models.UserSettings
			if err := db.Where("user_id = ?", requesterID).First(&settings).Error; err == nil {
				if settings.PushEnabled && settings.FriendRequestsNotif {
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
				} else {
					log.Printf("🔕 User %d has friend request notifications disabled", requesterID)
				}
			}
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

// GetFriendsListHandler returns all accepted friends with last-message preview for each DM thread.
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

	// Batch-fetch last message per DM thread in one query so the friend list
	// shows previews without the user having to open each chat first.
	type lastMsgRow struct {
		OtherUserID uint   `gorm:"column:other_user_id"`
		Message     string `gorm:"column:message"`
		MessageType string `gorm:"column:message_type"`
		SenderID    uint   `gorm:"column:sender_id"`
		CreatedAt   string `gorm:"column:created_at"`
	}
	var lastMsgs []lastMsgRow
	db.Raw(`
		SELECT DISTINCT ON (other_user_id)
			other_user_id, message, message_type, sender_id, created_at
		FROM (
			SELECT
				CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END AS other_user_id,
				message, message_type, sender_id, created_at
			FROM lobby_chats
			WHERE (sender_id = ? OR recipient_id = ?)
			  AND deleted_at IS NULL
		) t
		ORDER BY other_user_id, created_at DESC
	`, currentUserID, currentUserID, currentUserID).Scan(&lastMsgs)

	// Build lookup map: friend_user_id → last message row
	previewMap := make(map[uint]lastMsgRow, len(lastMsgs))
	for _, row := range lastMsgs {
		previewMap[row.OtherUserID] = row
	}

	friends := make([]gin.H, 0, len(friendships))
	for _, friendship := range friendships {
		var friend models.User
		if friendship.RequesterID == currentUserID {
			friend = friendship.Recipient
		} else {
			friend = friendship.Requester
		}

		entry := gin.H{
			"id":              friend.ID,
			"username":        friend.Username,
			"display_name":    friend.Username,
			"email":           friend.Email,
			"avatar_url":      friend.AvatarURL,
			"profile_picture": friend.AvatarURL,
			"created_at":      friend.CreatedAt,
		}

		// Attach last-message preview if a thread exists
		if lm, ok := previewMap[friend.ID]; ok {
			entry["last_message"]      = lm.Message
			entry["last_message_type"] = lm.MessageType
			entry["last_message_at"]   = lm.CreatedAt
			entry["last_message_own"]  = lm.SenderID == currentUserID
		}

		friends = append(friends, entry)
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

// GetFollowersCountHandler returns the total unique audience of a user:
// room members across all non-temporary rooms they host, plus explicit user_follows, deduped.
func GetFollowersCountHandler(c *gin.Context) {
	userIDStr := c.Param("userId")
	userID, err := strconv.ParseUint(userIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	var count int64
	if err := db.Raw(`
		SELECT COUNT(DISTINCT viewer_id) FROM (
			SELECT ur.user_id AS viewer_id
			FROM user_rooms ur
			JOIN rooms r ON ur.room_id = r.id
			WHERE r.host_id = ? AND ur.user_id != ? AND r.is_temporary = false
			UNION
			SELECT follower_id AS viewer_id
			FROM user_follows
			WHERE following_id = ?
		) AS all_followers
	`, userID, userID, userID).Scan(&count).Error; err != nil {
		log.Printf("Error counting followers for user %d: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count followers"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"user_id":         userID,
		"followers_count": count,
	})
}
