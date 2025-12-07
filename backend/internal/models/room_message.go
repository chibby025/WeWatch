// backend/internal/models/room_message.go
package models

import (
	"time"
)

// RoomMessage represents a persistent message in a room's chat
// Separate from ChatMessage which is session-specific and ephemeral
type RoomMessage struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	RoomID        uint      `gorm:"not null;index" json:"room_id"`
	UserID        uint      `gorm:"not null" json:"user_id"`
	Username      string    `gorm:"-" json:"username"` // Not stored, populated from User
	Message       string    `gorm:"type:text;not null" json:"message"`
	DeletedByHost bool      `gorm:"default:false" json:"deleted_by_host"` // Track if deleted by host
	CreatedAt     time.Time `gorm:"autoCreateTime" json:"created_at"`
	
	// Relationships
	Room Room `gorm:"foreignKey:RoomID;constraint:OnDelete:CASCADE" json:"-"`
	User User `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
}

// TableName specifies the table name for GORM
func (RoomMessage) TableName() string {
	return "room_messages"
}
