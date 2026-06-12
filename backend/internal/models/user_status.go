package models

import "time"

type UserStatus struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	UserID      uint       `gorm:"not null;index" json:"user_id"`
	User        User       `gorm:"foreignKey:UserID" json:"user,omitempty"`
	StatusType  string     `gorm:"type:varchar(20);not null;default:'text'" json:"status_type"` // text | image | session
	TextContent string     `gorm:"type:text" json:"text_content,omitempty"`
	MediaURL    string     `gorm:"type:text" json:"media_url,omitempty"`
	BgColor     string     `gorm:"type:varchar(30);default:'#7c3aed'" json:"bg_color"`
	SessionID   *uint      `gorm:"index" json:"session_id,omitempty"`
	RoomID      *uint      `gorm:"index" json:"room_id,omitempty"`
	RoomName    string     `gorm:"type:varchar(120)" json:"room_name,omitempty"`
	SessionTitle string    `gorm:"type:varchar(200)" json:"session_title,omitempty"`
	// 'friends' = accepted friends only | 'public' = visible on public profile too
	Visibility  string     `gorm:"type:varchar(20);not null;default:'friends'" json:"visibility"`
	ExpiresAt   time.Time  `gorm:"not null;index" json:"expires_at"`
	ViewCount   int        `gorm:"default:0" json:"view_count"`
	CreatedAt   time.Time  `json:"created_at"`
}

type UserStatusView struct {
	ID       uint      `gorm:"primaryKey"`
	StatusID uint      `gorm:"not null;uniqueIndex:idx_status_viewer" json:"status_id"`
	ViewerID uint      `gorm:"not null;uniqueIndex:idx_status_viewer" json:"viewer_id"`
	ViewedAt time.Time `gorm:"autoCreateTime" json:"viewed_at"`
}

type UserStatusLike struct {
	ID        uint      `gorm:"primaryKey"`
	StatusID  uint      `gorm:"not null;uniqueIndex:idx_status_liker" json:"status_id"`
	UserID    uint      `gorm:"not null;uniqueIndex:idx_status_liker" json:"user_id"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}
