package models

import "time"

// DemoMediaItem represents a media entry in the shared demo library.
// These play on loop in always-on rooms. Duration is auto-detected by ffprobe on first play.
type DemoMediaItem struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	URL             string    `gorm:"type:text;not null" json:"url"`
	Title           string    `gorm:"type:text;not null" json:"title"`
	PosterURL       string    `gorm:"type:text" json:"poster_url"`           // thumbnail for LobbyPage session card
	DurationSeconds int       `gorm:"default:0" json:"duration_seconds"`     // 0 = not yet detected
	WatchTypes      string    `gorm:"type:text;default:'{}'" json:"watch_types"` // PostgreSQL TEXT[] stored as string
	IsActive        bool      `gorm:"default:true" json:"is_active"`
	SortOrder       int       `gorm:"default:0" json:"sort_order"`
	CreatedAt       time.Time `json:"created_at"`
}

func (DemoMediaItem) TableName() string { return "demo_media_library" }
