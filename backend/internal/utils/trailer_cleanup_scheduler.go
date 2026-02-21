// WeWatch/backend/internal/utils/trailer_cleanup_scheduler.go
package utils

import (
	"log"
	"os"
	"time"

	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// StartTrailerCleanupScheduler initializes a goroutine that auto-deletes trailers
// when their associated event start_time has passed
func StartTrailerCleanupScheduler(db *gorm.DB) {
	go func() {
		// Run cleanup immediately on startup
		cleanupExpiredTrailers(db)

		// Then run every 1 minute
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()

		for range ticker.C {
			cleanupExpiredTrailers(db)
		}
	}()

	log.Println("✅ [TrailerCleanup] Scheduler initialized - checking every 1 minute")
}

// cleanupExpiredTrailers deletes trailers for events that have already started
func cleanupExpiredTrailers(db *gorm.DB) {
	// Find events where:
	// 1. start_time has passed (event started)
	// 2. trailer_url is not empty (has trailer)
	// 3. trailer_deleted_at is NULL (not already deleted)
	var expiredEvents []models.ScheduledEvent
	now := time.Now()

	err := db.Where("start_time <= ? AND trailer_url != '' AND trailer_deleted_at IS NULL", now).
		Find(&expiredEvents).Error

	if err != nil {
		log.Printf("❌ [TrailerCleanup] Error querying expired trailers: %v", err)
		return
	}

	if len(expiredEvents) == 0 {
		// No trailers to delete - silent return (no spam logs)
		return
	}

	log.Printf("🗑️ [TrailerCleanup] Found %d expired trailer(s) to delete", len(expiredEvents))

	for _, event := range expiredEvents {
		// Delete trailer file from storage
		if err := deleteTrailerFile(event.TrailerURL); err != nil {
			log.Printf("❌ [TrailerCleanup] Failed to delete trailer file %s: %v", event.TrailerURL, err)
			continue
		}

		// Mark as deleted in database (soft delete)
		deletedAt := time.Now()
		if err := db.Model(&event).Update("trailer_deleted_at", deletedAt).Error; err != nil {
			log.Printf("❌ [TrailerCleanup] Failed to mark trailer as deleted for event %d: %v", event.ID, err)
			continue
		}

		log.Printf("✅ [TrailerCleanup] Auto-deleted trailer for event %d (%s)", event.ID, event.Title)

		// TODO: Broadcast to lobby via WebSocket to update "Watching Now" immediately
		// This requires access to the WebSocket hub - can be added when refactoring
	}
}

// deleteTrailerFile removes the trailer file from storage
func deleteTrailerFile(trailerURL string) error {
	// Handle different storage types
	if trailerURL == "" {
		return nil // Nothing to delete
	}

	// For local filesystem storage (uploads/)
	if _, err := os.Stat(trailerURL); err == nil {
		if err := os.Remove(trailerURL); err != nil {
			return err
		}
		log.Printf("🗑️ [TrailerCleanup] Deleted local file: %s", trailerURL)
	}

	// TODO: Add S3/cloud storage deletion when implemented
	// Example:
	// if strings.HasPrefix(trailerURL, "https://s3.amazonaws.com/") {
	//     return deleteFromS3(trailerURL)
	// }

	return nil
}
