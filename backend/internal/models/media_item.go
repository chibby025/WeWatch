package models

import (
	"gorm.io/gorm"
)

// MediaItem reps a single media fliek uploaded to a room
// It establishes a 1:Many relationship: 1 Room : Many MediaItems
type MediaItem struct {
	gorm.Model 
	// Name of the file stored on the server (e.g room_123_video.mp4)
	FileName  string  `gorm:"type:varchar(255);not null"  json:"file_name"` 
	// Original name of the file uploaded by the user
	OriginalName string `gorm:"type:varchar(255);not null"  json:"original_name"` 
	// MIME type of the file (e.g., "video/mp4"). Useful for serving the file correctly.
	MimeType string `gorm:"type:varchar(100);not null" json:"mime_type"` 
	// Size of the file in bytes.
	FileSize int64 `gorm:"type:bigint;not null;default:0" json:"file_size"`
	// Path where the file is stored on the server (relative or absolute).
    // MVP: Relative path like "./uploads/room_123_video.mp4"
    // Production: URL to cloud storage (S3, GCS)
    FilePath string `gorm:"type:text;not null" json:"file_path"`

	// --- Foreign Keys for Relationships ---
	//RoomID references the Room this media item belongs to
	RoomID uint `gorm:"not null;index"  json:"room_id"`  // Index for faster lookups
	// Room   Room `gorm:"foreignKey:RoomID" json:"-"` // Optional: Embed Room data
	
	// UploaderID references the User who uploaded this media item
	UploaderID uint `gorm:"not null;index" json:"uploader_id"` // Index for faster lookups
	Uploader User `gorm:"foreignKey:UploaderID" json:"-"` // Optional: Embed User data

	// Add fields later like Title, Description, Duration (if extractable), ThumbnailPath, etc
}

// TableName overrides the table name used by GORM.
// By default, GORM uses the plural of the struct name ("media_items").
// This is optional but explicit.
func (MediaItem) TableName() string {
    return "media_items"
}

// --- Relationships (Defined on the related models) ---
// In models/room.go, you would add:
// func (r *Room) MediaItems() ([]MediaItem, error) {
//     var mediaItems []MediaItem
//     err := DB.Where("room_id = ?", r.ID).Find(&mediaItems).Error
//     return mediaItems, err
// }
//
// In models/user.go, you would add:
// func (u *User) UploadedMediaItems() ([]MediaItem, error) {
//     var mediaItems []MediaItem
//     err := DB.Where("uploader_id = ?", u.ID).Find(&mediaItems).Error
//     return mediaItems, err
// }