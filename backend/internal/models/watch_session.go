package models

import (
	"time"
	"gorm.io/gorm"
)

// WatchSession represents a temporary viewing session within a room.
// It is created when the host starts a watch session and deleted when the host ends it.
type WatchSession struct {
	gorm.Model
	SessionID string    `gorm:"type:varchar(36);uniqueIndex;not null" json:"session_id"`
	RoomID    uint      `gorm:"not null;index" json:"room_id"`
	HostID    uint      `gorm:"not null" json:"host_id"`
	Host      *User     `gorm:"foreignKey:HostID" json:"host,omitempty"`
	WatchType string    `gorm:"type:varchar(50);default:'video'" json:"watch_type"` // "video", "3d_cinema", or "classroom"
	ClassType string    `gorm:"type:varchar(50)" json:"class_type,omitempty"` // "classroom" or "lecture_hall" (only for watch_type="classroom")
	StartedAt time.Time `json:"started_at"`
	EndedAt   *time.Time `json:"ended_at,omitempty"`
	IsActive  bool      `gorm:"default:true;index:idx_watch_sessions_is_active" json:"is_active"` // Explicit active flag
	Members   []WatchSessionMember `json:"members"` // Active session participants
	
	// Ticketing fields (added via migration 003)
	TicketingEnabled      bool    `gorm:"default:false" json:"ticketing_enabled"`
	TicketPriceTokens     int     `gorm:"default:0" json:"ticket_price_tokens"`
	TicketPriceCurrency   string  `gorm:"type:varchar(10)" json:"ticket_price_currency,omitempty"`
	TicketPriceAmount     float64 `gorm:"type:decimal(10,2);default:0" json:"ticket_price_amount"`
	EarlyBirdEnabled      bool    `gorm:"default:false" json:"early_bird_enabled"`
	EarlyBirdPriceTokens  int     `gorm:"default:0" json:"early_bird_price_tokens"`
	EarlyBirdPriceAmount  float64 `gorm:"type:decimal(10,2);default:0" json:"early_bird_price_amount"`
	EarlyBirdActive       bool    `gorm:"default:true" json:"early_bird_active"`
	
	// Earnings tracking (for host session earnings display)
	TotalTicketsSold      int     `gorm:"default:0" json:"total_tickets_sold"`
	TotalTicketRevenue    int     `gorm:"default:0" json:"total_ticket_revenue"` // In CENTS (tokens × 100)
	
	// Discussion mode (lecture hall feature)
	DiscussionMode        bool    `gorm:"default:false" json:"discussion_mode"`
	
	// Current media state (for lecture hall preview generation)
	CurrentMediaURL       string  `gorm:"type:text" json:"current_media_url,omitempty"`          // file_url of currently playing media
	CurrentMediaType      string  `gorm:"type:varchar(20)" json:"current_media_type,omitempty"`  // "upload", "liveshare", "watchfrom"
	IsScreenSharingActive bool    `gorm:"default:false" json:"is_screen_sharing_active"`         // True if LiveShare/WatchFrom active
	SharingSource         string  `gorm:"type:varchar(20)" json:"sharing_source,omitempty"`      // "liveshare" or "watchfrom"
	SessionTitle          string  `gorm:"type:varchar(500)" json:"session_title,omitempty"`      // Display title for lobby watching tab
	
	// Privacy control (hidden from lobby unless user is member)
	IsPrivate             bool    `gorm:"default:false" json:"is_private"`                        // If true, session hidden from lobby "Watching Now" tab
	
	// Preview generation control (content moderation)
	PreviewEnabled        bool    `gorm:"default:true" json:"preview_enabled"`                    // If false, no preview thumbnails generated for lobby
	
	// Preview generation state
	CurrentPlaybackTime   int     `gorm:"default:0" json:"current_playback_time"`                // Current video timestamp in seconds
	CurrentMediaID        int     `gorm:"default:0" json:"current_media_id"`                      // ID of currently playing media item
	CurrentMediaPath      string  `gorm:"type:text" json:"current_media_path,omitempty"`          // File path of currently playing media
	
	// LiveShare mode (collaborative broadcasting)
	LiveshareMode         string  `gorm:"type:varchar(50);default:'regular'" json:"liveshare_mode"` // regular, podcast, interview, news, standup
	
	// Podcast mode configuration (only for liveshare_mode='podcast')
	PodcastTitle          string  `gorm:"type:varchar(500)" json:"podcast_title,omitempty"`           // Podcast episode title
	PodcastLogoURL        string  `gorm:"type:text" json:"podcast_logo_url,omitempty"`                // URL to podcast logo (optional)
	PodcastGuestUserID    *uint   `json:"podcast_guest_user_id,omitempty"`                            // Guest user ID (1 guest only for MVP)
	
	// Scheduled event integration
	ScheduledEventID      *uint   `gorm:"index" json:"scheduled_event_id,omitempty"`                  // Link to scheduled event (if auto-created)
	HostRequired          bool    `gorm:"default:true" json:"host_required"`                          // If false, session runs without host (for scheduled events)
}

// WatchSessionMember represents an active participant in a watch session
type WatchSessionMember struct {
	gorm.Model
	WatchSessionID uint      `gorm:"primaryKey" json:"watch_session_id"`
	UserID         uint      `gorm:"primaryKey" json:"user_id"`
	JoinedAt       time.Time `json:"joined_at"`
	LeftAt         *time.Time `json:"left_at,omitempty"`
	IsActive       bool      `gorm:"default:true" json:"is_active"`
	UserRole           string    `gorm:"type:varchar(20);default:'viewer'" json:"user_role"` // viewer, broadcaster
	CanBroadcast       bool      `gorm:"default:false" json:"can_broadcast"` // Host-granted permission to speak to whole room
	SeatID             *int      `json:"seat_id,omitempty"` // Seat number (1-145) in 3D classroom, NULL if not seated
	LectureHallNumber  *int      `gorm:"default:1" json:"lecture_hall_number,omitempty"` // Lecture hall number (1, 2, 3...) for overflow support
	// Client         *Client   `gorm:"-" json:"-"` // WebSocket client reference (not stored in DB)
}

// TableName overrides the table name used by GORM.
func (WatchSession) TableName() string {
	return "watch_sessions"
}

// TableName overrides the table name used by GORM
func (WatchSessionMember) TableName() string {
	return "watch_session_members"
}