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
	RoomID        *uint          `gorm:"index" json:"room_id"`
	Description   string         `gorm:"type:text" json:"description"`
	TextContent   *string        `gorm:"type:text" json:"text_content,omitempty"`
	VideoURL      string         `gorm:"type:text" json:"video_url,omitempty"`
	ThumbnailURL  string         `gorm:"type:text" json:"thumbnail_url,omitempty"`
	MediaType     string         `gorm:"type:varchar(20);not null" json:"media_type"` // 'video', 'image', 'gif'
	PostType      string         `gorm:"type:varchar(20);not null" json:"post_type"`  // 'recording', 'upload', 'text'
	Duration      *int           `json:"duration,omitempty"`                           // Seconds (for videos)
	Resolution    string         `gorm:"type:varchar(10)" json:"resolution,omitempty"` // '720p', '1080p', etc.
	ContentRating string         `gorm:"type:varchar(20);default:'G';not null" json:"content_rating"` // 'G', 'PG', 'Educational', 'Religious', '13+', '16+', '18+', 'Mature'
	ViewCount      int            `gorm:"default:0;not null" json:"view_count"`
	LikesCount     int            `gorm:"default:0;not null" json:"likes_count"`
	CommentsCount  int            `gorm:"default:0;not null" json:"comments_count"`
	TipCount       int            `gorm:"default:0;not null" json:"tip_count"`
	DownloadsCount int            `gorm:"default:0;not null" json:"downloads_count"`
	IsPaid         bool           `gorm:"default:false;not null" json:"is_paid"`
	// Price is in tokens (e.g. 50.0 = 50 tokens). Convert to cents at purchase time: int(price * 100)
	Price          *float64       `gorm:"type:decimal(10,2)" json:"price,omitempty"`
	IsPublic       bool           `gorm:"default:true;not null" json:"is_public"`
	AllowDownloads bool           `gorm:"default:true;not null" json:"allow_downloads"`
	Mp4URL         string         `gorm:"type:text" json:"mp4_url,omitempty"`
	Mp4Ready       bool           `gorm:"default:false;not null" json:"mp4_ready"`
	Mp4Processing  bool           `gorm:"default:false;not null" json:"mp4_processing"`
	CreatedAt      time.Time      `json:"created_at"`
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
	PostTypeText      = "text"
)
