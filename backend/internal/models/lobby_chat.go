// WeWatch/backend/internal/models/lobby_chat.go
package models

import (
	"time"

	"gorm.io/gorm"
)

// LobbyChat represents a direct message between users in the lobby
// Enables persistent conversations outside of watch sessions
// Supports rich message types: text, voice, images, videos, documents, stickers, polls
type LobbyChat struct {
	ID                  uint           `gorm:"primarykey" json:"id"`
	SenderID            uint           `gorm:"not null;index" json:"sender_id"`
	RecipientID         uint           `gorm:"not null;index" json:"recipient_id"`
	Message             string         `gorm:"type:text;not null" json:"message"`
	MessageType         string         `gorm:"type:varchar(20);default:'text';index" json:"message_type"`
	AttachmentURL       *string        `gorm:"type:text" json:"attachment_url,omitempty"`
	AttachmentName      *string        `gorm:"type:varchar(255)" json:"attachment_name,omitempty"`
	AttachmentSize      *int64         `json:"attachment_size,omitempty"`
	Metadata            *string        `gorm:"type:jsonb" json:"metadata,omitempty"`
	GroupID             *uint          `gorm:"index" json:"group_id,omitempty"`
	ReplyToID           *uint          `gorm:"index" json:"reply_to_id,omitempty"`
	ReplyToSnap         *string        `gorm:"type:text" json:"reply_to_snap,omitempty"` // snapshot of replied-to message text
	Edited              bool           `gorm:"default:false" json:"edited"`
	DeletedBySender     bool           `gorm:"default:false" json:"deleted_by_sender"`
	DeletedByRecipient  bool           `gorm:"default:false" json:"deleted_by_recipient"`
	CreatedAt           time.Time      `json:"created_at"`
	UpdatedAt           time.Time      `json:"updated_at"`
	DeletedAt           gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	ReadAt              *time.Time     `json:"read_at,omitempty"`

	// Relations (use Preload to fetch)
	Sender    *User        `gorm:"foreignKey:SenderID" json:"sender,omitempty"`
	Recipient *User        `gorm:"foreignKey:RecipientID" json:"recipient,omitempty"`
	Group     *LobbyGroup  `gorm:"foreignKey:GroupID" json:"group,omitempty"`
}

// TableName overrides the table name
func (LobbyChat) TableName() string {
	return "lobby_chats"
}
