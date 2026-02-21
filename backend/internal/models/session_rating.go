// backend/internal/models/session_rating.go
package models

import (
	"time"
	"gorm.io/gorm"
)

// SessionRating represents a user's rating of a session
// Ratings contribute to the room's overall average rating
type SessionRating struct {
	gorm.Model
	SessionID string `gorm:"type:varchar(255);not null;index" json:"session_id"`
	UserID    uint   `gorm:"not null;index" json:"user_id"`
	HostID    uint   `gorm:"not null;index" json:"host_id"`
	RoomID    uint   `gorm:"not null;index" json:"room_id"` // ✅ Link to room for aggregation
	
	// Rating data
	Rating    int    `gorm:"not null;check:rating >= 1 AND rating <= 5" json:"rating"`
	Review    string `gorm:"type:text" json:"review,omitempty"`
	
	// Metadata
	CreatedAt time.Time `json:"created_at"`
	
	// Relationships
	User    *User         `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Host    *User         `gorm:"foreignKey:HostID" json:"host,omitempty"`
	Room    *Room         `gorm:"foreignKey:RoomID" json:"room,omitempty"`
	Session *WatchSession `gorm:"foreignKey:SessionID;references:SessionID" json:"session,omitempty"`
}

// TableName overrides the table name used by GORM
func (SessionRating) TableName() string {
	return "session_ratings"
}

// BeforeCreate hook to ensure rating is valid
func (sr *SessionRating) BeforeCreate(tx *gorm.DB) error {
	if sr.Rating < 1 || sr.Rating > 5 {
		return gorm.ErrInvalidValue
	}
	return nil
}
