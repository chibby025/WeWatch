package models

import (
	"time"
	"gorm.io/gorm"
)

// ProcessedWebhook tracks webhook events that have been processed
// Prevents replay attacks (duplicate webhook processing)
type ProcessedWebhook struct {
	ID          uint      `gorm:"primaryKey"`
	EventID     string    `gorm:"uniqueIndex;not null;type:varchar(255)"` // Paystack/Stripe event ID
	EventType   string    `gorm:"index;type:varchar(100)"` // e.g., "charge.success", "transfer.success"
	Provider    string    `gorm:"index;type:varchar(20)"` // "paystack" or "stripe"
	ProcessedAt time.Time `gorm:"index"`
}

// IsWebhookProcessed checks if a webhook event has already been handled
func IsWebhookProcessed(db *gorm.DB, eventID string) bool {
	var webhook ProcessedWebhook
	result := db.Where("event_id = ?", eventID).First(&webhook)
	return result.Error == nil // No error means webhook was already processed
}

// MarkWebhookProcessed records that a webhook has been successfully processed
func MarkWebhookProcessed(db *gorm.DB, eventID, eventType, provider string) error {
	webhook := ProcessedWebhook{
		EventID:     eventID,
		EventType:   eventType,
		Provider:    provider,
		ProcessedAt: time.Now(),
	}
	return db.Create(&webhook).Error
}

// CleanupOldWebhooks removes webhook records older than 90 days
// Keeps audit trail for 3 months, then cleans up
func CleanupOldWebhooks(db *gorm.DB) error {
	cutoff := time.Now().AddDate(0, 0, -90)
	return db.Where("processed_at < ?", cutoff).Delete(&ProcessedWebhook{}).Error
}
