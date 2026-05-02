package models

import (
	"time"
	"gorm.io/gorm"
)

// SecurityEvent logs security-related activities for audit and monitoring
type SecurityEvent struct {
	ID        uint      `gorm:"primaryKey"`
	UserID    *uint     `gorm:"index"` // Null for failed login attempts (user not found)
	EventType string    `gorm:"index;type:varchar(50)"` // "failed_login", "2fa_failed", "ip_change", etc.
	IPAddress string    `gorm:"type:varchar(45)"` // IPv4 or IPv6
	UserAgent string    `gorm:"type:text"`
	Metadata  string    `gorm:"type:jsonb"` // Additional context as JSON
	Timestamp time.Time `gorm:"index"`
}

// Event type constants
const (
	EventFailedLogin        = "failed_login"
	EventSuccessfulLogin    = "successful_login"
	Event2FAFailed          = "2fa_failed"
	EventAccountLocked      = "account_locked"
	EventIPChange           = "ip_change"
	EventPasswordChanged    = "password_changed"
	EventUnauthorizedAccess = "unauthorized_access"
	EventSuspiciousActivity = "suspicious_activity"
)

// LogSecurityEvent records a security event
func LogSecurityEvent(db *gorm.DB, userID *uint, eventType, ipAddress, userAgent, metadata string) error {
	event := SecurityEvent{
		UserID:    userID,
		EventType: eventType,
		IPAddress: ipAddress,
		UserAgent: userAgent,
		Metadata:  metadata,
		Timestamp: time.Now(),
	}
	return db.Create(&event).Error
}

// DetectBruteForce checks for multiple failed login attempts
// Returns true if user has exceeded threshold (5 attempts in 15 minutes)
func DetectBruteForce(db *gorm.DB, userID uint) bool {
	var count int64
	cutoff := time.Now().Add(-15 * time.Minute)
	
	db.Model(&SecurityEvent{}).
		Where("user_id = ? AND event_type = ? AND timestamp > ?", userID, EventFailedLogin, cutoff).
		Count(&count)
	
	return count >= 5
}
