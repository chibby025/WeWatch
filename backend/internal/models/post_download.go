// backend/internal/models/post_download.go
package models

import (
	"time"
)

// PostDownload tracks individual download events for analytics
type PostDownload struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	PostID       uint      `gorm:"not null;index" json:"post_id"`
	UserID       *uint     `gorm:"index" json:"user_id,omitempty"`
	IPAddress    string    `gorm:"type:varchar(45)" json:"ip_address"`
	UserAgent    string    `gorm:"type:text" json:"user_agent"`
	DownloadedAt time.Time `gorm:"default:CURRENT_TIMESTAMP;index" json:"downloaded_at"`
	
	// Associations
	Post Post  `gorm:"foreignKey:PostID" json:"post,omitempty"`
	User *User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// TableName specifies the table name for PostDownload model
func (PostDownload) TableName() string {
	return "post_downloads"
}
