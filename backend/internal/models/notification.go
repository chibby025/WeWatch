package models

import (
	"time"
	"gorm.io/gorm"
)

// Notification stores per-user activity records so users see missed events on login.
// Type values: "room_post" | "session_started" | "friend_request" | "friend_accepted"
// EntityType values: "post" | "session" | "room" | "user"
type Notification struct {
	ID         uint           `gorm:"primaryKey" json:"id"`
	UserID     uint           `gorm:"not null;index" json:"user_id"`
	Type       string         `gorm:"type:varchar(50);not null" json:"type"`
	Title      string         `gorm:"type:varchar(255)" json:"title"`
	Body       string         `gorm:"type:text" json:"body"`
	EntityType string         `gorm:"type:varchar(50)" json:"entity_type"`
	EntityID   uint           `json:"entity_id"`
	IsRead     bool           `gorm:"default:false;not null" json:"is_read"`
	CreatedAt  time.Time      `json:"created_at"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}
