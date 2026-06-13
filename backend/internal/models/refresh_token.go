package models

import (
	"time"

	"gorm.io/gorm"
)

type RefreshToken struct {
	ID        uint       `gorm:"primaryKey"`
	UserID    uint       `gorm:"index;not null"`
	TokenHash string     `gorm:"uniqueIndex;not null;type:char(64)"`
	ExpiresAt time.Time  `gorm:"index;not null"`
	RevokedAt *time.Time
	CreatedAt time.Time
}

// RevokeRefreshToken marks a token as revoked by its plaintext hash.
func RevokeRefreshToken(db *gorm.DB, tokenHash string) {
	now := time.Now()
	db.Model(&RefreshToken{}).Where("token_hash = ?", tokenHash).Update("revoked_at", &now)
}

// RevokeAllUserRefreshTokens revokes every active refresh token for a user (e.g. on password change).
func RevokeAllUserRefreshTokens(db *gorm.DB, userID uint) {
	now := time.Now()
	db.Model(&RefreshToken{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Update("revoked_at", &now)
}
