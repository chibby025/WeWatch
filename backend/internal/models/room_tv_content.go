package models

import "time"

type RoomTVContent struct {
	ID            uint      `gorm:"primarykey" json:"id"`
	RoomID        uint      `gorm:"not null;index" json:"room_id"`
	SessionID     *uint     `gorm:"index" json:"session_id"` // Links to watch_sessions.id (NULL = room-level)
	ContentType   string    `gorm:"not null;type:varchar(50)" json:"content_type"` // 'announcement', 'media', 'ad'
	Title         string    `gorm:"not null;type:varchar(255)" json:"title"`
	Description   string    `gorm:"type:text" json:"description"`
	ContentURL    string    `gorm:"type:text" json:"content_url"`
	ThumbnailURL  string    `gorm:"type:text" json:"thumbnail_url"`
	
	// Video file metadata
	FileSize        *int64    `gorm:"type:bigint" json:"file_size,omitempty"`
	FileType        string    `gorm:"type:varchar(50)" json:"file_type,omitempty"`
	IsUploaded      bool      `gorm:"default:false" json:"is_uploaded"`
	VideoDuration   *int      `gorm:"type:int" json:"video_duration,omitempty"` // Duration in seconds
	FilePath        string    `gorm:"type:text" json:"file_path,omitempty"`
	
	// Analytics (hidden for now, used later)
	ViewCount       int       `gorm:"default:0" json:"view_count"`
	CompletionCount int       `gorm:"default:0" json:"completion_count"`
	CompletionRate  float64   `gorm:"type:decimal(5,2);default:0.00" json:"completion_rate"`
	
	// Monetization (hidden for now, used post-Payment)
	AdType          string    `gorm:"type:varchar(20);default:'host_ad'" json:"ad_type"`
	RevenueShare    float64   `gorm:"type:decimal(5,2);default:100.00" json:"revenue_share"`
	
	// Animation settings
	AnimationType string    `gorm:"type:varchar(50)" json:"animation_type"` // 'scroll-left', 'fade-pulse', 'slide-up', 'typewriter', 'bounce-in', 'zoom-flash'
	TextColor     string    `gorm:"type:varchar(7)" json:"text_color"`      // Hex color like '#FF6B35'
	BgGradient    string    `gorm:"type:text" json:"bg_gradient"`           // CSS gradient string
	AnimationSpeed string   `gorm:"type:varchar(20)" json:"animation_speed"` // 'slow', 'medium', 'fast'
	
	StartsAt      time.Time `gorm:"not null;default:CURRENT_TIMESTAMP" json:"starts_at"`
	EndsAt        time.Time `gorm:"not null" json:"ends_at"`
	CreatedBy     uint      `gorm:"not null" json:"created_by"`
	CreatedAt     time.Time `gorm:"not null;default:CURRENT_TIMESTAMP" json:"created_at"`
	UpdatedAt     time.Time `gorm:"not null;default:CURRENT_TIMESTAMP" json:"updated_at"`
}
