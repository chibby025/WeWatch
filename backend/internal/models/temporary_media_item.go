
package models

import (
	"gorm.io/gorm"
	"time"
)

// TemporaryMediaItem represents a media file temporarily uploaded for a specific watch session.
// It mirrors MediaItem but is stored in a separate table and cleaned up after the session.
type TemporaryMediaItem struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"` // Soft delete
	// --- Basic Media Attributes ---
	SessionID    string    `gorm:"type:varchar(36);index"` // Foreign key to WatchSession
	FileName     string    `gorm:"type:varchar(255);not null" json:"file_name"`
	OriginalName string    `gorm:"type:varchar(255);not null" json:"original_name"`
	MimeType     string    `gorm:"type:varchar(100);not null" json:"mime_type"`
	FileSize     int64     `gorm:"type:bigint;not null;default:0" json:"file_size"`
	FilePath     string    `gorm:"type:text;not null" json:"file_path"` // Path to the uploaded file
	PosterURL    string    `gorm:"type:text;not null" json:"poster_url"` // URL to the generated poster/thumbnail
	Duration     string    `gorm:"type:varchar(20);not null;default:'00:00:00'" json:"duration"` // Extracted duration (HH:MM:SS)
	OrderIndex   int       `gorm:"type:int;default:0" json:"order_index"` // For playlist ordering

	// --- Foreign Keys for Relationships ---
	RoomID       uint      `gorm:"not null;index" json:"room_id"` // Link to the room this media belongs to
	UploaderID   uint      `gorm:"not null;index" json:"uploader_id"` // Link to the user who uploaded this media
}

// TableName overrides the table name used by GORM.
func (TemporaryMediaItem) TableName() string {
	return "temporary_media_items"
}