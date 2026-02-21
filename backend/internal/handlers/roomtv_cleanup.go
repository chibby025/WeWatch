// backend/internal/handlers/roomtv_cleanup.go
// Event-driven cleanup for expired RoomTV content (10-second precision)
package handlers

import (
	"encoding/json"
	"log"
	"os"
	"time"
	"wewatch-backend/internal/models"
)

// CleanupExpiredRoomTVContent deletes expired RoomTV content and their files
// Called every 10 seconds for precise event-driven deletion
func CleanupExpiredRoomTVContent() {
	now := time.Now()
	var expiredContent []models.RoomTVContent

	// Find all expired content (uses index on ends_at for fast query)
	if err := DB.Where("ends_at <= ?", now).Find(&expiredContent).Error; err != nil {
		log.Printf("❌ [RoomTV Cleanup] Failed to query expired content: %v", err)
		return
	}

	if len(expiredContent) == 0 {
		return // Silent when no work to do (runs every 10 sec)
	}

	log.Printf("�️  [RoomTV Cleanup] Processing %d expired content items", len(expiredContent))

	for _, content := range expiredContent {
		expiredFor := now.Sub(content.EndsAt)
		log.Printf("  ⏰ Deleting: ID=%d, Room=%d, Title=%s (expired %s ago)",
			content.ID, content.RoomID, content.Title, expiredFor.Round(time.Second))

		// Delete uploaded file if exists
		if content.IsUploaded && content.FilePath != "" {
			if err := os.Remove(content.FilePath); err != nil && !os.IsNotExist(err) {
				log.Printf("    ⚠️  Failed to delete file: %v", err)
			}
		}

		// Delete database record
		if err := DB.Delete(&content).Error; err != nil {
			log.Printf("    ⚠️  Failed to delete DB record: %v", err)
			continue
		}

		// Broadcast removal to room via WebSocket
		broadcastMsg := map[string]interface{}{
			"type":       "room_tv_content_removed",
			"content_id": content.ID,
		}
		if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
			hub.BroadcastToRoom(content.RoomID, OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
		}
	}

	log.Printf("✅ [RoomTV Cleanup] Deleted %d content items", len(expiredContent))
}
