package models

import (
	"time"

	"gorm.io/gorm"
)

// UserTheaterAssignment tracks which theater and seat a user is assigned to in a session
type UserTheaterAssignment struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	UserID         uint           `gorm:"index;not null" json:"user_id"`
	WatchSessionID uint           `gorm:"index;not null" json:"watch_session_id"` // References WatchSession.ID
	TheaterID      uint           `gorm:"index;not null" json:"theater_id"`
	SeatNumber     int            `gorm:"not null" json:"seat_number"` // 1-42
	SeatRow        string         `gorm:"size:1" json:"seat_row"`      // A, B, C, D, E, F, G
	SeatCol        int            `json:"seat_col"`                     // 1-6
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`

	// Relationships
	User         *User         `gorm:"foreignKey:UserID" json:"user,omitempty"`
	WatchSession *WatchSession `gorm:"foreignKey:WatchSessionID" json:"watch_session,omitempty"`
	Theater      *Theater      `gorm:"foreignKey:TheaterID" json:"theater,omitempty"`
}

// TableName specifies the table name for UserTheaterAssignment model
func (UserTheaterAssignment) TableName() string {
	return "user_theater_assignments"
}

// GetSeatID returns the seat identifier in format "G-4" (Row-Column)
func (uta *UserTheaterAssignment) GetSeatID() string {
	if uta.SeatRow != "" && uta.SeatCol > 0 {
		return uta.SeatRow + "-" + string(rune(uta.SeatCol+'0'))
	}
	return ""
}
