package models

import (
	"time"

	"gorm.io/gorm"
)

// BroadcastRequest tracks user requests to broadcast to all theaters
type BroadcastRequest struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	WatchSessionID uint           `gorm:"index;not null" json:"watch_session_id"` // References WatchSession.ID
	UserID         uint           `gorm:"index;not null" json:"user_id"`
	Status         string         `gorm:"type:varchar(20);default:'pending'" json:"status"` // pending, approved, declined
	Message        string         `gorm:"type:text" json:"message,omitempty"` // Optional message from user
	CreatedAt      time.Time      `json:"created_at"`
	RespondedAt    *time.Time     `json:"responded_at"`
	RespondedBy    *uint          `json:"responded_by"` // Host's UserID who responded
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`

	// Relationships
	WatchSession     *WatchSession `gorm:"foreignKey:WatchSessionID" json:"watch_session,omitempty"`
	User             *User         `gorm:"foreignKey:UserID" json:"user,omitempty"`
	RespondedByUser  *User         `gorm:"foreignKey:RespondedBy" json:"responded_by_user,omitempty"`
}

// TableName specifies the table name for BroadcastRequest model
func (BroadcastRequest) TableName() string {
	return "broadcast_requests"
}

// IsPending returns true if request is still awaiting response
func (br *BroadcastRequest) IsPending() bool {
	return br.Status == "pending"
}

// Approve marks the request as approved
func (br *BroadcastRequest) Approve(hostID uint) {
	br.Status = "approved"
	now := time.Now()
	br.RespondedAt = &now
	br.RespondedBy = &hostID
}

// Decline marks the request as declined
func (br *BroadcastRequest) Decline(hostID uint) {
	br.Status = "declined"
	now := time.Now()
	br.RespondedAt = &now
	br.RespondedBy = &hostID
}
