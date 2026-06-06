package utils

import (
	"log"
	"time"
	"wewatch-backend/internal/models"

	"gorm.io/gorm"
)

// CleanupOldEvents deletes scheduled events older than 30 days.
// Called by the central scheduler every 24 hours.
func CleanupOldEvents(db *gorm.DB) {
	log.Println("🧹 [EventCleanup] Running cleanup job...")

	// Delete events older than 30 days
	thirtyDaysAgo := time.Now().Add(-30 * 24 * time.Hour)

	result := db.Where("start_time < ?", thirtyDaysAgo).
		Delete(&models.ScheduledEvent{})

	if result.Error != nil {
		log.Printf("❌ [EventCleanup] Error deleting old events: %v", result.Error)
		return
	}

	if result.RowsAffected > 0 {
		log.Printf("✅ [EventCleanup] Deleted %d old event(s) (older than 30 days)", result.RowsAffected)
	} else {
		log.Println("✨ [EventCleanup] No old events to delete - database is clean")
	}
}
