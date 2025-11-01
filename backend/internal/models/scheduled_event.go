package models

import (
	"time"
	"gorm.io/gorm"
)

// SchedueledEvent represents a scheduled playback event in a room
type ScheduledEvent struct {
	gorm.Model
	RoomID          uint      `gorm:"not null;index" json:"room_id"`
	MediaItemID     uint      `gorm:"not null;index" json:"media_item_id"`
	StartTime       time.Time `gorm:"not null;index" json:"start_time"` // When to start
	Title           string    `gorm:"type:varchar(255)" json:"title"`   // "Friday Movie Night"
	Description     string    `gorm:"type:text" json:"description"`     // "Join us for Q&A after!"
	HostUserID      uint      `gorm:"not null" json:"host_user_id"`     // Who scheduled it
	// We don't need ReminderType or CalendarEventID for MVP
	// We'll handle "Join on Schedule" via notifications, "Add to Calendar" via iCal download
}