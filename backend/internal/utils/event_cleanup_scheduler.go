package utils

import (
	"log"
	"time"
	"wewatch-backend/internal/models"

	"gorm.io/gorm"
)

// StartEventCleanupScheduler starts a background job that deletes old scheduled events
// Events older than 30 days are permanently deleted from the database
func StartEventCleanupScheduler(db *gorm.DB) {
	log.Println("🧹 [EventCleanup] Starting Event Cleanup Scheduler...")
	log.Println("   Checking every 24 hours for events older than 30 days")
	log.Println("   Old events will be permanently deleted to keep database clean")

	// Run immediately on startup
	cleanupOldEvents(db)

	// Then run every 24 hours
	ticker := time.NewTicker(24 * time.Hour)
	go func() {
		for range ticker.C {
			cleanupOldEvents(db)
		}
	}()
}

func cleanupOldEvents(db *gorm.DB) {
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
