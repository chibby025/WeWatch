// backend/internal/models/post_like.go
package models

import (
	"time"
)

// PostLike represents a user's like on a post
type PostLike struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	PostID    uint      `gorm:"not null;index;uniqueIndex:uq_post_likes_post_user" json:"post_id"`
	UserID    uint      `gorm:"not null;index;uniqueIndex:uq_post_likes_post_user" json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
	
	// Associations
	Post Post `gorm:"foreignKey:PostID" json:"post,omitempty"`
	User User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// TableName specifies the table name for PostLike model
func (PostLike) TableName() string {
	return "post_likes"
}
