// backend/internal/models/ad_settings.go
package models

import (
	"time"
	"gorm.io/gorm"
)

// AdSettings represents global ad system configuration
// Multiple rows for different ad types (global_enabled, feed_ads, session_ads, roomtv_ads)
type AdSettings struct {
	ID              uint           `gorm:"primaryKey" json:"id"`
	SettingKey      string         `gorm:"type:varchar(50);uniqueIndex;not null" json:"setting_key"` // 'global_enabled', 'feed_ads', 'session_ads', 'roomtv_ads'
	Enabled         bool           `gorm:"default:true;not null" json:"enabled"`
	UpdatedAt       time.Time      `json:"updated_at"`
	UpdatedByUserID uint           `json:"updated_by_user_id"` // Super admin who made change
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// TableName specifies the table name
func (AdSettings) TableName() string {
	return "ad_settings"
}

// Setting key constants
const (
	AdSettingGlobalEnabled  = "global_enabled"
	AdSettingFeedAds        = "feed_ads"
	AdSettingSessionAds     = "session_ads"
	AdSettingRoomTVAds      = "roomtv_ads"
	AdSettingDiscoverAds    = "discover_ads"
)
