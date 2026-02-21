// backend/internal/models/user_block.go
package models

import (
	"time"
)

// UserBlock represents a blocking relationship between two users
// Prevents messaging without removing friendship
type UserBlock struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	BlockerID uint      `gorm:"not null;index" json:"blocker_id"`
	BlockedID uint      `gorm:"not null;index" json:"blocked_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// Relations
	Blocker *User `gorm:"foreignKey:BlockerID" json:"blocker,omitempty"`
	Blocked *User `gorm:"foreignKey:BlockedID" json:"blocked,omitempty"`
}

// TableName overrides the table name
func (UserBlock) TableName() string {
	return "user_blocks"
}
