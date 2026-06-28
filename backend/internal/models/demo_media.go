package models

import "time"

// DemoMediaItem represents a media entry in the shared demo library.
// These play on loop in always-on rooms. Duration is auto-detected by ffprobe on first play.
type DemoMediaItem struct {
	ID              uint   `gorm:"primaryKey" json:"id"`
	URL             string `gorm:"type:text;not null" json:"url"`
	Title           string `gorm:"type:text;not null" json:"title"`
	PosterURL       string `gorm:"type:text" json:"poster_url"`               // thumbnail for LobbyPage session card
	DurationSeconds int    `gorm:"default:0" json:"duration_seconds"`         // 0 = not yet detected
	WatchTypes      string `gorm:"type:text;default:'{}'" json:"watch_types"` // PostgreSQL TEXT[] stored as string — controls RENDERING mode (video/3d_cinema), independent of RoomID below
	// RoomID scopes an item to one specific always-on room (e.g. anime episodes only
	// for the AnimeTV room) — independent of WatchTypes, which controls *rendering
	// mode* only. Two rooms can share the same WatchTypes (both "video") while each
	// drawing from a completely separate content bucket via this field. NULL means
	// "available to any room matching WatchTypes" (kept for backward compat with
	// any pre-existing unscoped rows).
	RoomID    *uint     `gorm:"column:room_id" json:"room_id,omitempty"`
	IsActive  bool      `gorm:"default:true" json:"is_active"`
	SortOrder int       `gorm:"default:0" json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
}

func (DemoMediaItem) TableName() string { return "demo_media_library" }
