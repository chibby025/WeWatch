// WeWatch/backend/internal/models/room.go
package models

import (
	"time"
	"gorm.io/gorm"
)


// Room represents a synchronized viewing room.
type Room struct {
	gorm.Model
	Name          string  `gorm:"type:varchar(100);not null" json:"name"`
	Description   string  `gorm:"type:text" json:"description"`
	HostID        uint    `gorm:"not null" json:"host_id"`
	IsTemporary   bool    `gorm:"default:false" json:"is_temporary"`
	IsPublic      bool    `gorm:"default:true" json:"is_public"`
	MediaFileName string  `gorm:"type:varchar(255)" json:"media_file_name"`
	PlaybackState string  `gorm:"type:varchar(20);default:'paused'" json:"playback_state"`
	PlaybackTime  float64 `gorm:"type:decimal(10,3);default:0.000" json:"playback_time"`
	ImageURL      string  `gorm:"type:text" json:"image_url,omitempty"` // Room profile image
	// Lobby Display Fields
	CurrentlyPlaying	string `gorm:"type:varchar(255)" json:"currently_playing,omitempty"`
	ComingNext			string `gorm:"type:varchar(255)" json:"coming_next,omitempty"`
	IsScreenSharing      bool `gorm:"default:false" json:"is_screen_sharing"`
	ScreenSharingUserID  uint `gorm:"default:0" json:"screen_sharing_user_id"`
	// Persistent state
	LoopMode string `gorm:"type:varchar(20);default:'none'" json:"loop_mode"` // 'none', 'playlist', 'single'
	OverridePlaying 	string  `gorm:"override_playing,omitempty"`
	OverrideComingNext	string	`gorm:"override_coming_next,omitempty"`
	SeatingModeEnabled   bool `json:"seating_mode_enabled"`
    HostBroadcastEnabled bool `json:"host_broadcast_enabled"`
	ShowHost             bool `gorm:"default:true" json:"show_host"`
	ShowDescription      bool `gorm:"default:true" json:"show_description"`
	HostOnlyChat         bool `gorm:"default:false" json:"host_only_chat"`
	
	// Rating fields (competitive quality system)
	AverageRating       float64 `gorm:"type:decimal(3,2);default:0.00" json:"average_rating"`
	TotalRatings        int     `gorm:"default:0" json:"total_ratings"`
	CumulativeRatingSum int     `gorm:"default:0" json:"cumulative_rating_sum"`
	
	// Room identity — determines permanent character of the room
	RoomType      string `gorm:"type:varchar(20);default:'general'" json:"room_type"` // 'general', 'church', 'education', 'other'
	OtherRoomType string `gorm:"type:varchar(100)" json:"other_room_type,omitempty"`  // user-described type when room_type = 'other'

	// Content moderation (age-based filtering; auto-locked for church/education rooms)
	ContentRating string `gorm:"type:varchar(10);default:'G';not null" json:"content_rating"` // 'G', 'PG', '13+', '16+', '18+', 'Mature', 'Educational', 'Religious'
	
	// Follow-based room auto-invite: when a user follows this host, send them a room invite if enabled
	AutoInviteFollowers bool `gorm:"default:true" json:"auto_invite_followers"`

	// Ad tracking (for RoomTV ad frequency capping)
	LastAdShownAt *time.Time `gorm:"type:timestamp" json:"last_ad_shown_at,omitempty"`
	// Handle — unique short identifier (e.g. "cinemahouse_108")
	Handle string `gorm:"type:varchar(50);uniqueIndex" json:"handle,omitempty"`

	// Always-on demo session fields
	IsAlwaysOn       bool   `gorm:"column:is_always_on;default:false" json:"is_always_on"`
	DemoWatchType    string `gorm:"column:demo_watch_type;type:varchar(50);default:'video'" json:"demo_watch_type,omitempty"`
	DemoHostUserID   uint   `gorm:"column:demo_host_user_id" json:"demo_host_user_id,omitempty"`
}

// Remove or fix any incorrect hook functions like BeforeCreate or BeforeUpdate
// that might contain 'return Error'. They should 'return nil' if no error occurs.
// Example of a corrected hook (optional):
/*
func (r *Room) BeforeCreate(tx *gorm.DB) (err error) {
	// Example logic or just return nil
	// if r.PlaybackState == "" {
	//	 r.PlaybackState = "paused"
	// }
	return nil // Correct way to return no error
}
*/