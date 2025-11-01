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
	StartedAt time.Time `json:"started_at"`
	EndedAt   *time.Time `json:"ended_at,omitempty"`
	Members   []WatchSessionMember `json:"members"` // Active session participants
}

// WatchSessionMember represents an active participant in a watch session
type WatchSessionMember struct {
	gorm.Model
	WatchSessionID uint      `gorm:"primaryKey" json:"watch_session_id"`
	UserID         uint      `gorm:"primaryKey" json:"user_id"`
	JoinedAt       time.Time `json:"joined_at"`
	LeftAt         *time.Time `json:"left_at,omitempty"`
	IsActive       bool      `gorm:"default:true" json:"is_active"`
	UserRole       string    `gorm:"type:varchar(20);default:'viewer'" json:"user_role"` // viewer, broadcaster
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