package models

import (
	"time"
)

// ScreenShare represents a screen sharing session in a room.
type ScreenShare struct {
	ID        uint      `gorm:"primaryKey"`
	RoomID    uint      `gorm:"index;not null"`
	HostID    uint      `gorm:"index;not null"`
	Active    bool      `gorm:"index;not null"`
	StartedAt time.Time `gorm:"not null"`
	EndedAt   *time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
}
