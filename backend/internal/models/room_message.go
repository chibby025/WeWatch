// backend/internal/models/room_message.go
package models

import (
	"database/sql/driver"
	"encoding/json"
	"time"
)

// PollData represents poll information stored as JSON
type PollData struct {
	Question      string     `json:"question"`
	Options       []string   `json:"options"`
	AllowMultiple bool       `json:"allow_multiple"`
	Votes         []PollVote `json:"votes"`
	IsClosed      bool       `json:"is_closed"`
}

// PollVote represents a single vote in a poll
type PollVote struct {
	UserID      uint `json:"user_id"`
	OptionIndex int  `json:"option_index"`
}

// Scan implements the sql.Scanner interface for PollData
func (p *PollData) Scan(value interface{}) error {
	if value == nil {
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, p)
}

// Value implements the driver.Valuer interface for PollData
func (p PollData) Value() (driver.Value, error) {
	if p.Question == "" {
		return nil, nil
	}
	return json.Marshal(p)
}

// RoomMessage represents a persistent message in a room's chat
// Separate from ChatMessage which is session-specific and ephemeral
type RoomMessage struct {
	ID            uint       `gorm:"primaryKey" json:"id"`
	RoomID        uint       `gorm:"not null;index" json:"room_id"`
	UserID        uint       `gorm:"not null" json:"user_id"`
	Username      string     `gorm:"-" json:"username"` // Not stored, populated from User
	Message       string     `gorm:"type:text;not null" json:"message"`
	DeletedByHost bool       `gorm:"default:false" json:"deleted_by_host"` // Track if deleted by host
	AudioURL      *string    `gorm:"type:varchar(500)" json:"audio_url,omitempty"` // Voice note URL
	Duration      *int       `gorm:"type:int" json:"duration,omitempty"` // Voice note duration in seconds
	MessageType   string     `gorm:"type:varchar(20);default:'text'" json:"message_type"` // text, voice_note, poll, etc.
	PollData      *PollData  `gorm:"type:jsonb" json:"poll_data,omitempty"` // Poll data (PostgreSQL JSONB)
	CreatedAt     time.Time  `gorm:"autoCreateTime" json:"created_at"`
	
	// Relationships
	Room Room `gorm:"foreignKey:RoomID;constraint:OnDelete:CASCADE" json:"-"`
	User User `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
}

// TableName specifies the table name for GORM
func (RoomMessage) TableName() string {
	return "room_messages"
}
