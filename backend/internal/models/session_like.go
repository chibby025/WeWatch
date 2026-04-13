package models

import (
	"time"
	"gorm.io/gorm"
)

// SessionLike represents a user liking a watch session
// Used for engagement tracking and social proof in lobby
type SessionLike struct {
	gorm.Model
	SessionID string    `gorm:"type:varchar(36);not null;index:idx_session_likes_session_user,priority:1" json:"session_id"`
	UserID    uint      `gorm:"not null;index:idx_session_likes_session_user,priority:2" json:"user_id"`
	User      *User     `gorm:"foreignKey:UserID" json:"user,omitempty"`
	LikedAt   time.Time `gorm:"autoCreateTime" json:"liked_at"`
}

// TableName overrides the table name used by GORM
func (SessionLike) TableName() string {
	return "session_likes"
}
