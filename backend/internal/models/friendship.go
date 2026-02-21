package models

import (
"time"
)

// Friendship represents a friend request or accepted friendship
type Friendship struct {
ID          uint      `gorm:"primarykey" json:"id"`
RequesterID uint      `gorm:"not null;index" json:"requester_id"`
RecipientID uint      `gorm:"not null;index" json:"recipient_id"`
Status      string    `gorm:"type:varchar(20);not null;default:'pending';index" json:"status"` // 'pending', 'accepted', 'rejected'
CreatedAt   time.Time `json:"created_at"`
UpdatedAt   time.Time `json:"updated_at"`

// Associations
Requester User `gorm:"foreignKey:RequesterID" json:"requester,omitempty"`
Recipient User `gorm:"foreignKey:RecipientID" json:"recipient,omitempty"`
}

// FriendshipStatus constants
const (
FriendshipStatusPending  = "pending"
FriendshipStatusAccepted = "accepted"
FriendshipStatusRejected = "rejected"
)
