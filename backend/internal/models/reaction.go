// WeWatch/backend/internal/models/reaction.go
package models

import (
	"gorm.io/gorm"
	"time"
)

// Reaction represents a user reaction to content in a room
type Reaction struct {
	gorm.Model
	UserID    uint      `gorm:"not null;index" json:"user_id"`
	RoomID    uint      `gorm:"not null;index" json:"room_id"`
	SessionID string `gorm:"type:varchar(36);index"` // ← NEW: nullable session ID
	MessageID uint      `gorm:"index" json:"message_id"`
	Emoji     string    `gorm:"type:varchar(10);not null" json:"emoji"`
	Timestamp time.Time `gorm:"not null" json:"timestamp"`
	// Add more fields as needed: MediaItemID for reactions to specific media, etc.
}

// TableName overrides the table name used by GORM
func (Reaction) TableName() string {
    return "reactions"
}