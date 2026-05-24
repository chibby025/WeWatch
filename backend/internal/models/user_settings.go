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

	// Content preferences
	ShowMatureContent bool   `gorm:"default:false" json:"show_mature_content"` // true = skip blur overlay for 18+/Mature posts
	PrimaryRating     string `gorm:"type:varchar(20);default:''" json:"primary_rating"` // preferred content category for feed ranking: G, PG, Educational, Religious, 13+, 16+, 18+, Mature

	// Age-based content visibility flags (computed from date_of_birth, refreshed once per year)
	// All default false — no age-gated content until DOB is confirmed.
	CanSee13Plus  bool `gorm:"default:false" json:"can_see_13_plus"`
	CanSee16Plus  bool `gorm:"default:false" json:"can_see_16_plus"`
	CanSee18Plus  bool `gorm:"default:false" json:"can_see_18_plus"`
	CanSeeMature  bool `gorm:"default:false" json:"can_see_mature"`
	AgeFlagsYear  int  `gorm:"default:0"     json:"age_flags_year"` // Calendar year the flags were last computed; 0 = never
}
