package models

import (
	"time"
	"gorm.io/gorm"
)

// SchedueledEvent represents a scheduled playback event in a room
type ScheduledEvent struct {
	gorm.Model
	RoomID          uint       `gorm:"not null;index" json:"room_id"`
	MediaItemID     *uint      `gorm:"index" json:"media_item_id"`                         // Optional: reference to uploaded media
	WatchType       string     `gorm:"type:varchar(50);not null" json:"watch_type"`        // "3d_cinema" or "video_watch"
	MediaFilePath   string     `gorm:"type:text" json:"media_file_path"`                   // Optional: localhost file path
	StartTime       time.Time  `gorm:"not null;index" json:"start_time"`                   // When to start
	Title           string     `gorm:"type:varchar(255)" json:"title"`                     // "Friday Movie Night"
	Description     string     `gorm:"type:text" json:"description"`                       // "Join us for Q&A after!"
	HostUserID      uint       `gorm:"not null" json:"host_user_id"`                       // Who scheduled it
	
	// Payment/Ticketing fields
	IsPaid                bool    `gorm:"default:false" json:"is_paid"`                      // Whether this is a paid event
	TicketPriceTokens     int     `gorm:"default:0" json:"ticket_price_tokens"`              // Price in tokens
	TicketPriceCurrency   string  `gorm:"type:varchar(10)" json:"ticket_price_currency"`     // USD, NGN, GHS, etc.
	TicketPriceAmount     float64 `gorm:"type:decimal(10,2);default:0" json:"ticket_price_amount"` // Price in fiat currency
	
	// Early Bird fields (auto-deactivates 1 hour before start_time)
	EarlyBirdEnabled      bool    `gorm:"default:false" json:"early_bird_enabled"`           // Whether early bird pricing is configured
	EarlyBirdPriceTokens  int     `gorm:"default:0" json:"early_bird_price_tokens"`          // Discounted price in tokens
	EarlyBirdPriceAmount  float64 `gorm:"type:decimal(10,2);default:0" json:"early_bird_price_amount"` // Discounted price in fiat
	EarlyBirdActive       bool    `gorm:"default:true" json:"early_bird_active"`             // Whether early bird is currently active
	
	// Booking/RSVP tracking
	RSVPCount       int  `gorm:"default:0" json:"rsvp_count"`        // Count of free RSVPs
	TicketsSold     int  `gorm:"default:0" json:"tickets_sold"`      // Count of paid tickets sold
	SessionCreated  bool `gorm:"default:false;index" json:"session_created"` // Whether auto-session was created
	WatchSessionID  *uint `gorm:"index" json:"watch_session_id,omitempty"` // Link to created session
	
	// Host attendance tracking (for report validation)
	HostJoinedSession bool `gorm:"default:false" json:"host_joined_session"` // Whether host joined the auto-created session
	
	// Trailer fields (auto-delete at start_time for legal protection & cost savings)
	TrailerURL            string     `gorm:"type:text" json:"trailer_url"`                      // S3/local path to trailer video
	TrailerTitle          string     `gorm:"type:varchar(255)" json:"trailer_title"`            // Custom trailer title (optional, defaults to event title)
	TrailerDuration       int        `gorm:"default:0" json:"trailer_duration"`                 // Duration in seconds (max 60)
	TrailerUploadedAt     *time.Time `json:"trailer_uploaded_at,omitempty"`                     // When trailer was uploaded
	TrailerDeletedAt      *time.Time `json:"trailer_deleted_at,omitempty" gorm:"index"`         // Soft delete at start_time
	
	// Relationships
	Room *Room `gorm:"foreignKey:RoomID" json:"Room,omitempty"` // ✅ Relationship to Room (for preloading room name in trailers)
	
	// We don't need ReminderType or CalendarEventID for MVP
	// We'll handle "Join on Schedule" via notifications, "Add to Calendar" via iCal download
}