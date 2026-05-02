package models

import (
	"time"
	"gorm.io/gorm"
)

// TokenBlacklist stores invalidated JWT tokens (logged out tokens)
// Used to prevent stolen tokens from being used after logout
type TokenBlacklist struct {
	ID        uint      `gorm:"primaryKey"`
	Token     string    `gorm:"uniqueIndex;not null;type:varchar(500)"` // JWT token string
	ExpiresAt time.Time `gorm:"index;not null"` // When the token would naturally expire
	CreatedAt time.Time // When token was blacklisted
}

// IsTokenBlacklisted checks if a token has been revoked/blacklisted
func IsTokenBlacklisted(db *gorm.DB, token string) bool {
	var blacklisted TokenBlacklist
	result := db.Where("token = ? AND expires_at > ?", token, time.Now()).First(&blacklisted)
	return result.Error == nil // No error means token found (blacklisted)
}

// BlacklistToken adds a token to the blacklist
func BlacklistToken(db *gorm.DB, token string, expiresAt time.Time) error {
	blacklist := TokenBlacklist{
		Token:     token,
		ExpiresAt: expiresAt,
	}
	return db.Create(&blacklist).Error
}

// CleanupExpiredTokens removes tokens that have naturally expired
// Should be run periodically (e.g., daily cron job)
func CleanupExpiredTokens(db *gorm.DB) error {
	return db.Where("expires_at < ?", time.Now()).Delete(&TokenBlacklist{}).Error
}
