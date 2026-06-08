package models

import (
	"time"

	"gorm.io/gorm"
)

type CommunityRequest struct {
	gorm.Model
	UserID        uint       `gorm:"not null;index" json:"user_id"`
	Title         string     `gorm:"type:varchar(200);not null" json:"title"`
	ContentRating string     `gorm:"type:varchar(20);not null;default:'G'" json:"content_rating"`
	PreferredDate *time.Time `json:"preferred_date,omitempty"`
	Description   string     `gorm:"type:text" json:"description"`
	Status        string     `gorm:"type:varchar(20);not null;default:'open'" json:"status"` // open, claimed, closed
	UpvoteCount   int        `gorm:"not null;default:0" json:"upvote_count"`
	ImageURL      string     `gorm:"type:text" json:"image_url,omitempty"`

	User   *User                   `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Claims []CommunityRequestClaim `gorm:"foreignKey:RequestID" json:"claims,omitempty"`
}

type CommunityRequestUpvote struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	RequestID uint      `gorm:"not null;index;uniqueIndex:idx_request_user_upvote" json:"request_id"`
	UserID    uint      `gorm:"not null;index;uniqueIndex:idx_request_user_upvote" json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
}

type CommunityRequestClaim struct {
	ID               uint       `gorm:"primarykey" json:"id"`
	RequestID        uint       `gorm:"not null;index;uniqueIndex:idx_request_host_claim" json:"request_id"`
	HostUserID       uint       `gorm:"not null;index;uniqueIndex:idx_request_host_claim" json:"host_user_id"`
	RoomID           uint       `gorm:"not null" json:"room_id"`
	ScheduledEventID *uint      `gorm:"index" json:"scheduled_event_id,omitempty"`
	ClaimedAt        time.Time  `json:"claimed_at"`

	Host *User `gorm:"foreignKey:HostUserID" json:"host,omitempty"`
	Room *Room `gorm:"foreignKey:RoomID" json:"room,omitempty"`
}
