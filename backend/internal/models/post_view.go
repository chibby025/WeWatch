// backend/internal/models/post_view.go
package models

import (
	"time"
)

// PostView represents a view event for analytics
type PostView struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	PostID    uint      `gorm:"not null;index" json:"post_id"`
	UserID    *uint     `gorm:"index" json:"user_id,omitempty"` // NULL for anonymous views
	IPAddress string    `gorm:"type:varchar(45)" json:"-"`       // Hidden from JSON (privacy)
	CreatedAt time.Time `json:"created_at"`
	
	// Associations
	Post Post  `gorm:"foreignKey:PostID" json:"post,omitempty"`
	User *User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// TableName specifies the table name for PostView model
func (PostView) TableName() string {
	return "post_views"
}
