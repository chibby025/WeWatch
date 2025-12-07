// WeWatch/backend/internal/models/room_invitation.go
package models

import (
	"time"
	"gorm.io/gorm"
)

// RoomInvitation represents an invitation to join a private room
type RoomInvitation struct {
	gorm.Model
	RoomID         uint       `gorm:"not null;index" json:"room_id"`
	InvitedUserID  *uint      `gorm:"index" json:"invited_user_id,omitempty"` // NULL for invite links
	InviterUserID  uint       `gorm:"not null" json:"inviter_user_id"`
	InviteToken    string     `gorm:"type:varchar(64);uniqueIndex" json:"invite_token,omitempty"` // For shareable links
	Status         string     `gorm:"type:varchar(20);default:'pending';index" json:"status"` // pending, accepted, declined, expired
	ExpiresAt      *time.Time `json:"expires_at,omitempty"` // NULL for permanent invites
	
	// Relationships
	Room         Room  `gorm:"foreignKey:RoomID" json:"room,omitempty"`
	InvitedUser  *User `gorm:"foreignKey:InvitedUserID" json:"invited_user,omitempty"`
	InviterUser  User  `gorm:"foreignKey:InviterUserID" json:"inviter_user,omitempty"`
}

// TableName overrides the table name used by GORM
func (RoomInvitation) TableName() string {
	return "room_invitations"
}

// IsValid checks if the invitation is still valid
func (ri *RoomInvitation) IsValid() bool {
	if ri.Status != "pending" {
		return false
	}
	if ri.ExpiresAt != nil && time.Now().After(*ri.ExpiresAt) {
		return false
	}
	return true
}
