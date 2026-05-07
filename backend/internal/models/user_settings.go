package models

import "gorm.io/gorm"

// UserSettings stores user notification and privacy preferences
type UserSettings struct {
	gorm.Model
	UserID uint `gorm:"uniqueIndex;not null" json:"user_id"`
	
	// Notification preferences
	PushEnabled         bool `gorm:"default:true" json:"push_enabled"`
	FriendRequestsNotif bool `gorm:"default:true" json:"friend_requests_notif"`
	MessagesNotif       bool `gorm:"default:true" json:"messages_notif"`
	CallsNotif          bool `gorm:"default:true" json:"calls_notif"`
	SessionInvitesNotif bool `gorm:"default:true" json:"session_invites_notif"`
	LikesCommentsNotif  bool `gorm:"default:true" json:"likes_comments_notif"`
	SoundEnabled        bool `gorm:"default:true" json:"sound_enabled"`
	VibrationEnabled    bool `gorm:"default:true" json:"vibration_enabled"`
	
	// Privacy settings
	ProfileType         string `gorm:"default:'public'" json:"profile_type"`         // 'public' or 'private'
	WhoCanFriendRequest string `gorm:"default:'everyone'" json:"who_can_friend_request"` // 'everyone', 'friends_of_friends', 'nobody'
	WhoCanSeePosts      string `gorm:"default:'public'" json:"who_can_see_posts"`    // 'public', 'friends', 'only_me'
	WhoCanCall          string `gorm:"default:'friends'" json:"who_can_call"`        // 'everyone', 'friends', 'nobody'
}
