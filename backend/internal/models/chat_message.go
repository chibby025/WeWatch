package models

import "gorm.io/gorm"

type ChatMessage struct {
	gorm.Model
	RoomID        uint   `gorm:"not null;index"`
	SessionID string `gorm:"type:varchar(36);index"` // ← NEW: nullable session ID
	UserID        uint   `gorm:"not null"`
	Username      string `gorm:"not null"`
	Message       string `gorm:"type:text;not null"`
}