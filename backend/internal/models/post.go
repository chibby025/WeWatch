// backend/internal/models/post.go
package models

import (
	"time"
	"gorm.io/gorm"
)

// Post represents user-generated content (recordings or uploads)
type Post struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	UserID        uint           `gorm:"not null;index" json:"user_id"`
	RoomID        *uint          `gorm:"index" json:"room_id,omitempty"`
	Title         string         `gorm:"type:varchar(255);not null" json:"title"`
	Description   string         `gorm:"type:text" json:"description"`
	VideoURL      string         `gorm:"type:text" json:"video_url,omitempty"`
	ThumbnailURL  string         `gorm:"type:text" json:"thumbnail_url,omitempty"`
	MediaType     string         `gorm:"type:varchar(20);not null" json:"media_type"` // 'video', 'image', 'gif'
	PostType      string         `gorm:"type:varchar(20);not null" json:"post_type"`  // 'recording', 'upload'
	Duration      *int           `json:"duration,omitempty"`                           // Seconds (for videos)
	Resolution    string         `gorm:"type:varchar(10)" json:"resolution,omitempty"` // '720p', '1080p', etc.
	ViewCount     int            `gorm:"default:0;not null" json:"view_count"`
	LikesCount    int            `gorm:"default:0;not null" json:"likes_count"`
	CommentsCount int            `gorm:"default:0;not null" json:"comments_count"`
	IsPaid        bool           `gorm:"default:false;not null" json:"is_paid"`
	Price         *float64       `gorm:"type:decimal(10,2)" json:"price,omitempty"`
	IsPublic      bool           `gorm:"default:true;not null" json:"is_public"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	
	// Associations
	User User `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Room *Room `gorm:"foreignKey:RoomID" json:"room,omitempty"`
}

// TableName specifies the table name for Post model
func (Post) TableName() string {
	return "posts"
}

// Media type constants
const (
	MediaTypeVideo = "video"
	MediaTypeImage = "image"
	MediaTypeGIF   = "gif"
)

// Post type constants
const (
	PostTypeRecording = "recording"
	PostTypeUpload    = "upload"
)
