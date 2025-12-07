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
