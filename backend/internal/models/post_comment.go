// backend/internal/models/post_comment.go
package models

import (
	"time"
	"gorm.io/gorm"
)

// PostComment represents a comment on a post (with support for threaded replies)
type PostComment struct {
	ID              uint           `gorm:"primaryKey" json:"id"`
	PostID          uint           `gorm:"not null;index" json:"post_id"`
	UserID          uint           `gorm:"not null;index" json:"user_id"`
	ParentCommentID *uint          `gorm:"index" json:"parent_comment_id,omitempty"` // NULL for top-level comments
	Content         string         `gorm:"type:text;not null" json:"content"`
	LikesCount      int            `gorm:"default:0;not null" json:"likes_count"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	
	// Associations
	Post          Post           `gorm:"foreignKey:PostID" json:"post,omitempty"`
	User          User           `gorm:"foreignKey:UserID" json:"user,omitempty"`
	ParentComment *PostComment   `gorm:"foreignKey:ParentCommentID" json:"parent_comment,omitempty"`
	Replies       []PostComment  `gorm:"foreignKey:ParentCommentID" json:"replies,omitempty"`
}

// TableName specifies the table name for PostComment model
func (PostComment) TableName() string {
	return "post_comments"
}
