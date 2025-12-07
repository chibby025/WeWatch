package models

import (
	"time"

	"gorm.io/gorm"
)

// BroadcastPermission tracks which users can broadcast audio to all theaters
// Host always has implicit broadcast permission (not stored in DB)
type BroadcastPermission struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	WatchSessionID uint           `gorm:"index;not null" json:"watch_session_id"` // References WatchSession.ID
	UserID         uint           `gorm:"index;not null" json:"user_id"`
	GrantedBy      uint           `gorm:"not null" json:"granted_by"` // Host's UserID who granted permission
	IsActive       bool           `gorm:"default:true" json:"is_active"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	RevokedAt      *time.Time     `json:"revoked_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`

	// Relationships
	WatchSession   *WatchSession `gorm:"foreignKey:WatchSessionID" json:"watch_session,omitempty"`
	User           *User         `gorm:"foreignKey:UserID" json:"user,omitempty"`
	GrantedByUser  *User         `gorm:"foreignKey:GrantedBy" json:"granted_by_user,omitempty"`
}

// TableName specifies the table name for BroadcastPermission model
func (BroadcastPermission) TableName() string {
	return "broadcast_permissions"
}

// Revoke marks the permission as inactive and sets revoked timestamp
func (bp *BroadcastPermission) Revoke() {
	bp.IsActive = false
	now := time.Now()
	bp.RevokedAt = &now
}

// Activate marks the permission as active and clears revoked timestamp
func (bp *BroadcastPermission) Activate() {
	bp.IsActive = true
	bp.RevokedAt = nil
}
