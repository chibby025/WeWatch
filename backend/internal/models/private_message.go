// models/private_message.go
package models

import "gorm.io/gorm"

type PrivateMessage struct {
	gorm.Model
	SenderID   uint   `gorm:"not null;index:idx_private_chat"`
	ReceiverID uint   `gorm:"not null;index:idx_private_chat"`
	Message    string `gorm:"type:text;not null"`
}