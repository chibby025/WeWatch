package utils

import (
	"log"
	"time"
	"wewatch-backend/internal/models"

	"gorm.io/gorm"
)

// WebSocketBroadcaster is an interface for broadcasting WebSocket messages
type WebSocketBroadcaster interface {
	BroadcastJSON(roomID uint, data map[string]interface{})
}

var broadcaster WebSocketBroadcaster

// SetWebSocketHub sets the WebSocket hub for broadcasting
func SetWebSocketHub(b WebSocketBroadcaster) {
	broadcaster = b
}

// DeactivateExpiredEarlyBird deactivates early bird pricing 1 hour before scheduled events.
// Called by the central scheduler every minute.
func DeactivateExpiredEarlyBird(db *gorm.DB) {
	now := time.Now()
	oneHourFromNow := now.Add(1 * time.Hour)

	// Find events where:
	// 1. Early bird is enabled
	// 2. Early bird is still active
	// 3. Start time is within the next hour (meaning early bird should end now)
	// Query: start_time <= (now + 1hr) AND start_time > now
	var events []models.ScheduledEvent
	err := db.Where("early_bird_enabled = ? AND early_bird_active = ? AND start_time <= ? AND start_time > ?",
		true, true, oneHourFromNow, now).Find(&events).Error

	if err != nil {
		log.Printf("❌ [EarlyBirdScheduler] Error querying early bird events: %v", err)
		return
	}

	if len(events) == 0 {
		// No events to process - this is normal
		return
	}

	log.Printf("🎟️ [EarlyBirdScheduler] Processing %d event(s) with expiring early bird pricing", len(events))

	for _, event := range events {
		// Calculate when early bird should have ended
		earlyBirdEndTime := event.StartTime.Add(-1 * time.Hour)

		// Deactivate early bird
		if err := db.Model(&event).Update("early_bird_active", false).Error; err != nil {
			log.Printf("❌ [EarlyBirdScheduler] Failed to deactivate early bird for event %d: %v", event.ID, err)
			continue
		}

		log.Printf("✅ [EarlyBirdScheduler] Early bird deactivated for event %d: '%s'", event.ID, event.Title)
		log.Printf("   Event starts at: %s", event.StartTime.Format(time.RFC3339))
		log.Printf("   Early bird ended at: %s", earlyBirdEndTime.Format(time.RFC3339))
		log.Printf("   Price reverted: $%.2f %s (%d tokens) -> Regular Price",
			event.EarlyBirdPriceAmount, event.TicketPriceCurrency, event.EarlyBirdPriceTokens)
		log.Printf("   Regular price: $%.2f %s (%d tokens)",
			event.TicketPriceAmount, event.TicketPriceCurrency, event.TicketPriceTokens)

		// Broadcast to room via WebSocket
		if broadcaster != nil {
			broadcastData := map[string]interface{}{
				"type":                 "early_bird_ended",
				"event_id":             event.ID,
				"event_title":          event.Title,
				"regular_price_tokens": event.TicketPriceTokens,
				"regular_price_amount": event.TicketPriceAmount,
				"currency":             event.TicketPriceCurrency,
			}
			
			broadcaster.BroadcastJSON(event.RoomID, broadcastData)
			log.Printf("📢 [EarlyBirdScheduler] Sent 'early_bird_ended' notification to room %d", event.RoomID)
		}
	}
}
