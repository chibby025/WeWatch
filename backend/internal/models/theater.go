package models

import (
	"time"

	"gorm.io/gorm"
)

// Theater represents a virtual theater instance within a watch session
// Multiple theaters can exist for one session to handle 100+ concurrent users
type Theater struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	WatchSessionID uint           `gorm:"index;not null" json:"watch_session_id"` // References WatchSession.ID
	TheaterNumber  int            `gorm:"not null" json:"theater_number"` // 1, 2, 3...
	CustomName     string         `gorm:"size:100" json:"custom_name"`    // Optional: "Main Hall", "Balcony"
	OccupiedSeats  int            `gorm:"default:0" json:"occupied_seats"` // Current count (0-42)
	MaxSeats       int            `gorm:"default:42;not null" json:"max_seats"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`

	// Relationships
	WatchSession *WatchSession           `gorm:"foreignKey:WatchSessionID" json:"watch_session,omitempty"`
	Assignments  []UserTheaterAssignment `gorm:"foreignKey:TheaterID" json:"assignments,omitempty"`
}

// TableName specifies the table name for Theater model
func (Theater) TableName() string {
	return "theaters"
}

// GetDisplayName returns custom name if set, otherwise "Theater X"
func (t *Theater) GetDisplayName() string {
	if t.CustomName != "" {
		return t.CustomName
	}
	return "Theater " + string(rune(t.TheaterNumber+'0'))
}

// IsFull returns true if theater has reached max capacity
func (t *Theater) IsFull() bool {
	return t.OccupiedSeats >= t.MaxSeats
}

// HasAvailableSeats returns true if theater has empty seats
func (t *Theater) HasAvailableSeats() bool {
	return t.OccupiedSeats < t.MaxSeats
}
