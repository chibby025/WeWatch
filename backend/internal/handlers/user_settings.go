package handlers

import (
	"log"
	"net/http"
	"time"
	"wewatch-backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// saveAgeFlagsForUser computes the four content-visibility flags from a user's age and
// persists them to user_settings. Call this whenever a user's DOB is first set (registration
// or update-dob endpoint) so flags are ready without a per-request DOB query.
// The lazy yearly recompute in GetDiscoverFeed calls this too when AgeFlagsYear is stale.
func saveAgeFlagsForUser(db *gorm.DB, userID uint, age int) {
	currentYear := time.Now().Year()
	flags := map[string]interface{}{
		"can_see_13_plus": age >= 13,
		"can_see_16_plus": age >= 16,
		"can_see_18_plus": age >= 18,
		"can_see_mature":  age >= 18,
		"age_flags_year":  currentYear,
	}

	var settings models.UserSettings
	err := db.Where("user_id = ?", userID).First(&settings).Error
	if err == gorm.ErrRecordNotFound {
		settings = models.UserSettings{
			UserID:       userID,
			CanSee13Plus: age >= 13,
			CanSee16Plus: age >= 16,
			CanSee18Plus: age >= 18,
			CanSeeMature: age >= 18,
			AgeFlagsYear: currentYear,
		}
		if err := db.Create(&settings).Error; err != nil {
			log.Printf("⚠️ [saveAgeFlagsForUser] Failed to create settings for user %d: %v", userID, err)
		}
	} else if err == nil {
		if err := db.Model(&settings).Updates(flags).Error; err != nil {
			log.Printf("⚠️ [saveAgeFlagsForUser] Failed to update flags for user %d: %v", userID, err)
		}
	}
}

// GetUserSettings retrieves the current user's settings
func GetUserSettings(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	var settings models.UserSettings
	// Try to find existing settings
	err := db.Where("user_id = ?", userID).First(&settings).Error
	
	if err == gorm.ErrRecordNotFound {
		// Create default settings if they don't exist
		settings = models.UserSettings{
			UserID:              userID.(uint),
			PushEnabled:         true,
			FriendRequestsNotif: true,
			MessagesNotif:       true,
			CallsNotif:          true,
			SessionInvitesNotif: true,
			LikesCommentsNotif:  true,
			SoundEnabled:        true,
			VibrationEnabled:    true,
			ProfileType:         "public",
			WhoCanFriendRequest: "everyone",
			WhoCanSeePosts:      "public",
			WhoCanCall:          "friends",
		}
		
		if err := db.Create(&settings).Error; err != nil {
			log.Printf("Error creating default settings: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create settings"})
			return
		}
	} else if err != nil {
		log.Printf("Error fetching settings: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch settings"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"settings": settings})
}

// UpdateUserSettings updates the current user's settings
func UpdateUserSettings(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	var input struct {
		// Notifications
		PushEnabled         *bool   `json:"push_enabled"`
		FriendRequestsNotif *bool   `json:"friend_requests_notif"`
		MessagesNotif       *bool   `json:"messages_notif"`
		CallsNotif          *bool   `json:"calls_notif"`
		SessionInvitesNotif *bool   `json:"session_invites_notif"`
		LikesCommentsNotif  *bool   `json:"likes_comments_notif"`
		SoundEnabled        *bool   `json:"sound_enabled"`
		VibrationEnabled    *bool   `json:"vibration_enabled"`
		
		// Privacy
		ProfileType         *string `json:"profile_type"`
		WhoCanFriendRequest *string `json:"who_can_friend_request"`
		WhoCanSeePosts      *string `json:"who_can_see_posts"`
		WhoCanCall          *string `json:"who_can_call"`

		// Content preferences
		ShowMatureContent *bool `json:"show_mature_content"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate privacy settings if provided
	if input.ProfileType != nil && *input.ProfileType != "public" && *input.ProfileType != "private" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid profile type. Must be 'public' or 'private'"})
		return
	}
	
	if input.WhoCanFriendRequest != nil {
		valid := *input.WhoCanFriendRequest == "everyone" || *input.WhoCanFriendRequest == "friends_of_friends" || *input.WhoCanFriendRequest == "nobody"
		if !valid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid friend request setting"})
			return
		}
	}
	
	if input.WhoCanSeePosts != nil {
		valid := *input.WhoCanSeePosts == "public" || *input.WhoCanSeePosts == "friends" || *input.WhoCanSeePosts == "only_me"
		if !valid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid posts visibility setting"})
			return
		}
	}
	
	if input.WhoCanCall != nil {
		valid := *input.WhoCanCall == "everyone" || *input.WhoCanCall == "friends" || *input.WhoCanCall == "nobody"
		if !valid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid call permission setting"})
			return
		}
	}

	// Find or create settings
	var settings models.UserSettings
	err := db.Where("user_id = ?", userID).First(&settings).Error
	
	if err == gorm.ErrRecordNotFound {
		// Create new settings with input values
		settings = models.UserSettings{UserID: userID.(uint)}
	} else if err != nil {
		log.Printf("Error fetching settings: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch settings"})
		return
	}

	// Update only provided fields (partial update support)
	updates := make(map[string]interface{})
	
	if input.PushEnabled != nil {
		updates["push_enabled"] = *input.PushEnabled
	}
	if input.FriendRequestsNotif != nil {
		updates["friend_requests_notif"] = *input.FriendRequestsNotif
	}
	if input.MessagesNotif != nil {
		updates["messages_notif"] = *input.MessagesNotif
	}
	if input.CallsNotif != nil {
		updates["calls_notif"] = *input.CallsNotif
	}
	if input.SessionInvitesNotif != nil {
		updates["session_invites_notif"] = *input.SessionInvitesNotif
	}
	if input.LikesCommentsNotif != nil {
		updates["likes_comments_notif"] = *input.LikesCommentsNotif
	}
	if input.SoundEnabled != nil {
		updates["sound_enabled"] = *input.SoundEnabled
	}
	if input.VibrationEnabled != nil {
		updates["vibration_enabled"] = *input.VibrationEnabled
	}
	if input.ProfileType != nil {
		updates["profile_type"] = *input.ProfileType
	}
	if input.WhoCanFriendRequest != nil {
		updates["who_can_friend_request"] = *input.WhoCanFriendRequest
	}
	if input.WhoCanSeePosts != nil {
		updates["who_can_see_posts"] = *input.WhoCanSeePosts
	}
	if input.WhoCanCall != nil {
		updates["who_can_call"] = *input.WhoCanCall
	}
	if input.ShowMatureContent != nil {
		updates["show_mature_content"] = *input.ShowMatureContent
	}

	// If settings don't exist yet, create them
	if settings.ID == 0 {
		settings.UserID = userID.(uint)
		// Apply updates to new settings
		for key, value := range updates {
			switch key {
			case "push_enabled":
				settings.PushEnabled = value.(bool)
			case "friend_requests_notif":
				settings.FriendRequestsNotif = value.(bool)
			case "messages_notif":
				settings.MessagesNotif = value.(bool)
			case "calls_notif":
				settings.CallsNotif = value.(bool)
			case "session_invites_notif":
				settings.SessionInvitesNotif = value.(bool)
			case "likes_comments_notif":
				settings.LikesCommentsNotif = value.(bool)
			case "sound_enabled":
				settings.SoundEnabled = value.(bool)
			case "vibration_enabled":
				settings.VibrationEnabled = value.(bool)
			case "profile_type":
				settings.ProfileType = value.(string)
			case "who_can_friend_request":
				settings.WhoCanFriendRequest = value.(string)
			case "who_can_see_posts":
				settings.WhoCanSeePosts = value.(string)
			case "who_can_call":
				settings.WhoCanCall = value.(string)
			case "show_mature_content":
				settings.ShowMatureContent = value.(bool)
			}
		}
		
		if err := db.Create(&settings).Error; err != nil {
			log.Printf("Error creating settings: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create settings"})
			return
		}
	} else {
		// Update existing settings
		if err := db.Model(&settings).Updates(updates).Error; err != nil {
			log.Printf("Error updating settings: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update settings"})
			return
		}
	}

	// Fetch updated settings to return
	db.Where("user_id = ?", userID).First(&settings)

	c.JSON(http.StatusOK, gin.H{
		"message":  "Settings updated successfully",
		"settings": settings,
	})
}
