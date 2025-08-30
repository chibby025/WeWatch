// WeWatch/backend/internal/models/room.go
package models

import (
	"gorm.io/gorm"
)


// Room represents a synchronized viewing room.
type Room struct {
	gorm.Model
	Name          string  `gorm:"type:varchar(100);not null" json:"name"`
	Description   string  `gorm:"type:text" json:"description"`
	HostID        uint    `gorm:"not null" json:"host_id"`
	MediaFileName string  `gorm:"type:varchar(255)" json:"media_file_name"`
	PlaybackState string  `gorm:"type:varchar(20);default:'paused'" json:"playback_state"`
	PlaybackTime  float64 `gorm:"type:decimal(10,3);default:0.000" json:"playback_time"`
	// Add more fields later like MaxViewers, Password, etc.
}

// Remove or fix any incorrect hook functions like BeforeCreate or BeforeUpdate
// that might contain 'return Error'. They should 'return nil' if no error occurs.
// Example of a corrected hook (optional):
/*
func (r *Room) BeforeCreate(tx *gorm.DB) (err error) {
	// Example logic or just return nil
	// if r.PlaybackState == "" {
	//	 r.PlaybackState = "paused"
	// }
	return nil // Correct way to return no error
}
*/