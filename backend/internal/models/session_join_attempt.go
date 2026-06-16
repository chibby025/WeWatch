package models

import (
	"time"

	"gorm.io/gorm"
)

// SessionJoinAttempt records a user starting to join a watch session, logged
// client-side before the WebSocket/LiveKit connection is attempted. Comparing
// "attempted" against "confirmed" (set once the server-side member row is
// written) surfaces users who tried to join but never fully connected —
// e.g. bad network — rather than looking like they never tried at all.
type SessionJoinAttempt struct {
	gorm.Model
	WatchSessionID uint       `json:"watch_session_id"`
	UserID         uint       `json:"user_id"`
	AttemptedAt    time.Time  `json:"attempted_at"`
	ConfirmedAt    *time.Time `json:"confirmed_at,omitempty"`
	Status         string     `gorm:"type:varchar(20);default:'pending'" json:"status"` // pending | confirmed
}

func (SessionJoinAttempt) TableName() string {
	return "session_join_attempts"
}
