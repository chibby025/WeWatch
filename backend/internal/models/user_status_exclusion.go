package models

import "time"

// UserStatusExclusion records a friend that the owner has excluded from seeing
// their statuses. All statuses are visible to all friends by default; this
// table only contains exceptions.
type UserStatusExclusion struct {
	OwnerUserID    uint      `gorm:"primaryKey;not null;index:idx_status_excl_owner" json:"owner_user_id"`
	ExcludedUserID uint      `gorm:"primaryKey;not null" json:"excluded_user_id"`
	CreatedAt      time.Time `json:"created_at"`
}
