package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
	"strconv"
	"strings"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
)

// ScheduledEventInput defines the expected structure for creating a scheduled event
type ScheduledEventInput struct {
	MediaItemID         *uint   `json:"media_item_id"`                          // Optional: reference to uploaded media
	WatchType           string  `json:"watch_type" binding:"required"`          // Required: "3d_cinema" or "video_watch"
	MediaFilePath       string  `json:"media_file_path"`                        // Optional: localhost file path
	StartTime           string  `json:"start_time" binding:"required"`          // ISO 8601 string (e.g., "2025-09-15T20:00:00Z")
	Title               string  `json:"title" binding:"required"`
	Description         string  `json:"description"`
	IsPaid              bool    `json:"is_paid"`                                // Whether this is a paid event
	TicketPriceTokens   int     `json:"ticket_price_tokens"`                    // Price in tokens (if is_paid=true)
	TicketPriceCurrency string  `json:"ticket_price_currency"`                  // Currency (USD, NGN, etc.)
	TicketPriceAmount   float64 `json:"ticket_price_amount"`                    // Price in fiat currency
	
	// Early Bird fields
	EarlyBirdEnabled     bool    `json:"early_bird_enabled"`                    // Whether early bird pricing is enabled
	EarlyBirdPriceTokens int     `json:"early_bird_price_tokens"`               // Discounted price in tokens
	EarlyBirdPriceAmount float64 `json:"early_bird_price_amount"`               // Discounted price in fiat
	
	// Trailer fields
	TrailerURL      string `json:"trailer_url"`       // Uploaded trailer file path
	TrailerTitle    string `json:"trailer_title"`     // Custom trailer title
	TrailerDuration int    `json:"trailer_duration"`  // Duration in seconds

	// Recurrence fields
	RecurrenceType    string `json:"recurrence_type"`    // none/weekly/biweekly/monthly
	RecurrenceEndDate string `json:"recurrence_end_date"` // ISO 8601 end date for recurrence

	ContentRating string `json:"content_rating"` // G, PG, Educational, Religious, 13+, 16+, 18+, Mature
}

// CreateScheduledEventHandler handles POST /api/rooms/:id/scheduled-events
func CreateScheduledEventHandler(c *gin.Context) {
	// 1. Get authenticated user ID
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	authenticatedUserID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// 2. Get room ID
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// 3. Check if user is host of the room
	var room models.Room
	if err := DB.First(&room, uint(roomID)).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}
	if room.HostID != authenticatedUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can schedule events"})
		return
	}

	// 4. Bind input
	var input ScheduledEventInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 5. Validate watch_type
	if input.WatchType != "3d_cinema" && input.WatchType != "video_watch" && input.WatchType != "classroom" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid watch_type. Must be '3d_cinema', 'classroom', or 'video_watch'"})
		return
	}

	// 5b. Validate paid event requirements
	if input.IsPaid {
		// Check for verified payment account
		var paymentAccount models.PaymentAccount
		if err := DB.Where("user_id = ? AND is_verified = ?", authenticatedUserID, true).
			First(&paymentAccount).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusBadRequest, gin.H{
					"error":              "Payment account required",
					"message":            "You must set up a verified payment account before creating paid events. This allows you to receive payments from ticket sales.",
					"action":             "setup_payment_account",
					"redirect":           "/wallet/accounts",
					"needs_kyc":          true,
					"setup_instructions": "1. Complete KYC verification at /wallet/kyc\n2. Add a payment account (Paystack or Stripe) at /wallet/accounts\n3. Wait for account verification\n4. Return to create your paid event",
				})
				return
			}
			// Database error
			log.Printf("Error checking payment account: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify payment account"})
			return
		}

		// Validate that either token price or fiat price is provided
		if input.TicketPriceTokens <= 0 && input.TicketPriceAmount <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Paid events must have a ticket price (tokens or currency amount)"})
			return
		}

		// If fiat amount provided, currency is required
		if input.TicketPriceAmount > 0 && input.TicketPriceCurrency == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ticket_price_currency is required when ticket_price_amount is set"})
			return
		}

		// Validate currency if provided
		if input.TicketPriceCurrency != "" {
			validCurrencies := []string{"USD", "NGN", "GHS", "ZAR", "KES", "EUR", "GBP"}
			isValid := false
			for _, curr := range validCurrencies {
				if input.TicketPriceCurrency == curr {
					isValid = true
					break
				}
			}
			if !isValid {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid currency. Supported: USD, NGN, GHS, ZAR, KES, EUR, GBP"})
				return
			}
		}
	}

	// 6. Parse StartTime
	startTime, err := time.Parse(time.RFC3339, input.StartTime)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid start_time format. Use ISO 8601 (e.g., 2025-09-15T20:00:00Z)"})
		return
	}
	
	// 6b. Validate early bird pricing
	if input.EarlyBirdEnabled {
		// Early bird requires paid event
		if !input.IsPaid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Early bird pricing requires a paid event"})
			return
		}
		
		// Early bird price must be set
		if input.EarlyBirdPriceTokens <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Early bird price must be greater than 0"})
			return
		}
		
		// Early bird price must be less than regular price
		if input.EarlyBirdPriceTokens >= input.TicketPriceTokens {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Early bird price must be less than regular price"})
			return
		}
		
		// Validate that event is scheduled far enough in advance
		// Early bird ends 1 hour before event, so need at least some lead time
		earlyBirdEndTime := startTime.Add(-1 * time.Hour)
		if earlyBirdEndTime.Before(time.Now()) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Event must be scheduled more than 1 hour in advance to enable early bird pricing",
				"message": "Early bird pricing ends 1 hour before the event starts",
			})
			return
		}
		
		log.Printf("✅ [ScheduledEvents] Early bird pricing validated for event '%s'", input.Title)
		log.Printf("   Event starts: %s", startTime.Format(time.RFC3339))
		log.Printf("   Early bird ends: %s (1 hour before)", earlyBirdEndTime.Format(time.RFC3339))
		log.Printf("   Regular: %d tokens ($%.2f %s)", input.TicketPriceTokens, input.TicketPriceAmount, input.TicketPriceCurrency)
		log.Printf("   Early Bird: %d tokens ($%.2f %s)", input.EarlyBirdPriceTokens, input.EarlyBirdPriceAmount, input.TicketPriceCurrency)
	}

	// 7. Validate MediaItem if provided (optional)
	if input.MediaItemID != nil {
		var mediaItem models.MediaItem
		if err := DB.First(&mediaItem, *input.MediaItemID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Media item not found"})
			return
		}
		if mediaItem.RoomID != uint(roomID) {
			c.JSON(http.StatusForbidden, gin.H{"error": "Media item does not belong to this room"})
			return
		}
	}

	// 8. Create ScheduledEvent
	if input.ContentRating == "" {
		input.ContentRating = "G"
	}
	event := models.ScheduledEvent{
		RoomID:              uint(roomID),
		MediaItemID:         input.MediaItemID,
		WatchType:           input.WatchType,
		MediaFilePath:       input.MediaFilePath,
		StartTime:           startTime,
		Title:               input.Title,
		Description:         input.Description,
		HostUserID:          authenticatedUserID,
		ContentRating:       input.ContentRating,
		IsPaid:              input.IsPaid,
		TicketPriceTokens:   input.TicketPriceTokens,
		TicketPriceCurrency: input.TicketPriceCurrency,
		TicketPriceAmount:   input.TicketPriceAmount,
		EarlyBirdEnabled:    input.EarlyBirdEnabled,
		EarlyBirdPriceTokens: input.EarlyBirdPriceTokens,
		EarlyBirdPriceAmount: input.EarlyBirdPriceAmount,
		EarlyBirdActive:     input.EarlyBirdEnabled, // Active by default if enabled
		TrailerURL:          input.TrailerURL,
		TrailerTitle:        input.TrailerTitle,
		TrailerDuration:     input.TrailerDuration,
		RecurrenceType:      "none",
	}

	// 8b. Set recurrence fields if provided
	recurrenceType := input.RecurrenceType
	if recurrenceType == "weekly" || recurrenceType == "biweekly" || recurrenceType == "monthly" {
		event.RecurrenceGroupID = uuid.New().String()
		event.RecurrenceType = recurrenceType
		if input.RecurrenceEndDate != "" {
			if recurEnd, err := time.Parse(time.RFC3339, input.RecurrenceEndDate); err == nil {
				event.RecurrenceEndDate = &recurEnd
			}
		}
	}
	
	// Set trailer uploaded time if trailer URL is provided
	if input.TrailerURL != "" {
		now := time.Now()
		event.TrailerUploadedAt = &now
		log.Printf("✅ [CreateScheduledEvent] Trailer uploaded for event '%s': %s", input.Title, input.TrailerURL)
	}

	// 9. Save to DB
	if err := DB.Create(&event).Error; err != nil {
		log.Printf("Error creating scheduled event: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create scheduled event"})
		return
	}

	// 9b. Create recurring instances if applicable
	if event.RecurrenceGroupID != "" {
		var recurEnd time.Time
		if event.RecurrenceEndDate != nil {
			recurEnd = *event.RecurrenceEndDate
		}
		maxInstances := map[string]int{"weekly": 52, "biweekly": 26, "monthly": 12}[event.RecurrenceType]
		nextTime := startTime
		for i := 1; i <= maxInstances; i++ {
			switch event.RecurrenceType {
			case "weekly":
				nextTime = nextTime.Add(7 * 24 * time.Hour)
			case "biweekly":
				nextTime = nextTime.Add(14 * 24 * time.Hour)
			case "monthly":
				nextTime = nextTime.AddDate(0, 1, 0)
			}
			if !recurEnd.IsZero() && nextTime.After(recurEnd) {
				break
			}
			instance := models.ScheduledEvent{
				RoomID:               event.RoomID,
				MediaItemID:          event.MediaItemID,
				WatchType:            event.WatchType,
				MediaFilePath:        event.MediaFilePath,
				StartTime:            nextTime,
				Title:                event.Title,
				Description:          event.Description,
				HostUserID:           event.HostUserID,
				ContentRating:        event.ContentRating,
				IsPaid:               event.IsPaid,
				TicketPriceTokens:    event.TicketPriceTokens,
				TicketPriceCurrency:  event.TicketPriceCurrency,
				TicketPriceAmount:    event.TicketPriceAmount,
				EarlyBirdEnabled:     event.EarlyBirdEnabled,
				EarlyBirdPriceTokens: event.EarlyBirdPriceTokens,
				EarlyBirdPriceAmount: event.EarlyBirdPriceAmount,
				EarlyBirdActive:      event.EarlyBirdEnabled,
				RecurrenceType:       event.RecurrenceType,
				RecurrenceGroupID:    event.RecurrenceGroupID,
				RecurrenceEndDate:    event.RecurrenceEndDate,
			}
			if err := DB.Create(&instance).Error; err != nil {
				log.Printf("⚠️ [CreateScheduledEvent] Recurrence instance %d failed: %v", i, err)
			}
		}
		log.Printf("✅ [CreateScheduledEvent] Created %s recurring group %s", event.RecurrenceType, event.RecurrenceGroupID)
	}

	// 10. Broadcast to room via WebSocket
	broadcastData := map[string]interface{}{
		"type":  "scheduled_event_created",
		"event": event,
	}
	jsonData, _ := json.Marshal(broadcastData)
	hub.BroadcastToRoom(uint(roomID), OutgoingMessage{
		Data:     jsonData,
		IsBinary: false,
	}, nil)

	// 10b. Broadcast to lobby for real-time event count updates
	lobbyBroadcastData := map[string]interface{}{
		"type":    "event_created",
		"room_id": uint(roomID),
	}
	lobbyJsonData, _ := json.Marshal(lobbyBroadcastData)
	hub.BroadcastToLobby(OutgoingMessage{
		Data:     lobbyJsonData,
		IsBinary: false,
	})

	// 11. Return success
	c.JSON(http.StatusCreated, gin.H{
		"message": "Scheduled event created successfully",
		"event":   event,
	})
}

// GetScheduledEventsHandler handles GET /api/rooms/:id/scheduled-events
func GetScheduledEventsHandler(c *gin.Context) {
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// Fetch scheduled events for this room (exclude events older than 7 days)
	// This keeps recent past events visible for a week, then auto-cleans
	sevenDaysAgo := time.Now().Add(-7 * 24 * time.Hour)
	
	var events []models.ScheduledEvent
	if err := DB.Where("room_id = ? AND start_time >= ?", uint(roomID), sevenDaysAgo).
		Order("start_time ASC").
		Find(&events).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch scheduled events"})
		return
}

	c.JSON(http.StatusOK, gin.H{
		"events": events,
	})
}

// GetScheduledEventsWithTrailersHandler handles GET /api/scheduled-events/with-trailers?limit=10&offset=0
// Returns upcoming events that have trailers for lobby "Watching Now" infinite scroll
func GetScheduledEventsWithTrailersHandler(c *gin.Context) {
	// ✅ Parse pagination parameters
	limit := 10 // Default
	if l := c.Query("limit"); l != "" {
		if parsedLimit, err := strconv.Atoi(l); err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}
	
	offset := 0
	if o := c.Query("offset"); o != "" {
		if parsedOffset, err := strconv.Atoi(o); err == nil && parsedOffset >= 0 {
			offset = parsedOffset
		}
	}
	
	log.Printf("🔍 [GetScheduledEventsWithTrailersHandler] Fetching trailers (limit: %d, offset: %d)...", limit, offset)
	
	// Get total count for pagination
	var totalCount int64
	if err := DB.Model(&models.ScheduledEvent{}).
		Where("trailer_url != '' AND trailer_deleted_at IS NULL AND start_time > ?", time.Now()).
		Count(&totalCount).Error; err != nil {
		log.Printf("❌ Error counting trailers: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count trailers"})
		return
	}
	
	// Fetch events with trailers (upcoming only, not deleted)
	var events []models.ScheduledEvent
	if err := DB.Preload("Room").Where("trailer_url != '' AND trailer_deleted_at IS NULL AND start_time > ?", time.Now()).
		Order("start_time ASC"). // Soonest events first
		Limit(limit).
		Offset(offset).
		Find(&events).Error; err != nil {
		log.Printf("❌ Error fetching trailers: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch trailers"})
		return
	}
	
	log.Printf("✅ [GetScheduledEventsWithTrailersHandler] Returning %d trailers (total: %d, has_more: %v)", 
		len(events), totalCount, int64(offset + limit) < totalCount)
	
	c.JSON(http.StatusOK, gin.H{
		"events":   events,
		"count":    len(events),
		"total":    totalCount,
		"limit":    limit,
		"offset":   offset,
		"has_more": int64(offset + limit) < totalCount,
	})
}

// DeleteScheduledEventHandler handles DELETE /api/scheduled-events/:id
func DeleteScheduledEventHandler(c *gin.Context) {
	// 1. Get authenticated user ID
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	authenticatedUserID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// 2. Get event ID
	eventIDStr := c.Param("id")
	eventID, err := strconv.ParseUint(eventIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event ID"})
		return
	}

	// 3. Fetch the event
	var event models.ScheduledEvent
	if err := DB.First(&event, uint(eventID)).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Event not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// 4. Check if user is host of the room
	var room models.Room
	if err := DB.First(&room, event.RoomID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch room"})
		return
	}
	if room.HostID != authenticatedUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can delete events"})
		return
	}

	// 5. Auto-refund paid token tickets before deleting.
	// Free events have no paid tickets — skip entirely to avoid querying an
	// event_tickets table that may not yet have all columns on this env.
	var paidTickets []models.EventTicket
	if event.IsPaid {
		if err := DB.Where(
			"scheduled_event_id = ? AND payment_method = ? AND is_refunded = ? AND is_cancelled = ?",
			event.ID, "tokens", false, false,
		).Find(&paidTickets).Error; err != nil {
			log.Printf("Error fetching tickets for refund: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch tickets for refund"})
			return
		}
	}

	if len(paidTickets) > 0 {
		refundTx := DB.Begin()
		defer func() {
			if r := recover(); r != nil {
				refundTx.Rollback()
			}
		}()

		refundedAt := time.Now()
		for _, ticket := range paidTickets {
			// Gifted tickets refund to the gifter, not the recipient
			refundRecipientID := ticket.UserID
			if ticket.IsGift && ticket.GiftedByUserID != nil {
				refundRecipientID = *ticket.GiftedByUserID
			}

			if err := refundTx.Model(&models.UserWallet{}).
				Where("user_id = ?", refundRecipientID).
				Update("token_balance", gorm.Expr("token_balance + ?", ticket.TicketPriceTokens)).Error; err != nil {
				refundTx.Rollback()
				log.Printf("Error refunding tokens to user %d: %v", refundRecipientID, err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process refunds"})
				return
			}

			if err := refundTx.Model(&models.UserWallet{}).
				Where("user_id = ?", event.HostUserID).
				Update("token_balance", gorm.Expr("token_balance - ?", ticket.TicketPriceTokens)).Error; err != nil {
				refundTx.Rollback()
				log.Printf("Error deducting refund from host %d: %v", event.HostUserID, err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process refunds"})
				return
			}

			if err := refundTx.Model(&ticket).Updates(map[string]interface{}{
				"is_refunded": true,
				"refunded_at": refundedAt,
			}).Error; err != nil {
				refundTx.Rollback()
				log.Printf("Error marking ticket %d refunded: %v", ticket.ID, err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mark tickets as refunded"})
				return
			}
		}

		if err := refundTx.Commit().Error; err != nil {
			log.Printf("Error committing refunds: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to complete refunds"})
			return
		}

		log.Printf("✅ [DeleteEvent] Auto-refunded %d paid ticket(s) for event %d '%s'", len(paidTickets), event.ID, event.Title)
	}

	// 6. Delete the event
	if err := DB.Delete(&event).Error; err != nil {
		log.Printf("Error deleting scheduled event: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete event"})
		return
	}

	// 5b. Broadcast to lobby for real-time event count updates
	lobbyBroadcastData := map[string]interface{}{
		"type":    "event_deleted",
		"room_id": event.RoomID,
	}
	lobbyJsonData, _ := json.Marshal(lobbyBroadcastData)
	hub.BroadcastToLobby(OutgoingMessage{
		Data:     lobbyJsonData,
		IsBinary: false,
	})

	// 6. Return success
	c.JSON(http.StatusOK, gin.H{
		"message": "Event deleted successfully",
	})
}

// UpdateScheduledEventHandler handles PUT /api/scheduled-events/:id
func UpdateScheduledEventHandler(c *gin.Context) {
	// 1. Get authenticated user ID
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	authenticatedUserID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// 2. Get event ID
	eventIDStr := c.Param("id")
	eventID, err := strconv.ParseUint(eventIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event ID"})
		return
	}

	// 3. Bind input
	var input ScheduledEventInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 4. Validate watch_type
	if input.WatchType != "3d_cinema" && input.WatchType != "video_watch" && input.WatchType != "classroom" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid watch_type. Must be '3d_cinema', 'classroom', or 'video_watch'"})
		return
	}

	// 5. Fetch the event
	var event models.ScheduledEvent
	if err := DB.First(&event, uint(eventID)).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Event not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// 6. Check if user is host
	var room models.Room
	if err := DB.First(&room, event.RoomID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch room"})
		return
	}
	if room.HostID != authenticatedUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can edit events"})
		return
	}

	// 7. Validate MediaItem if provided (optional)
	if input.MediaItemID != nil {
		var mediaItem models.MediaItem
		if err := DB.First(&mediaItem, *input.MediaItemID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Media item not found"})
			return
		}
		if mediaItem.RoomID != event.RoomID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Media item does not belong to this room"})
			return
		}
	}

	// 8. Update event
	event.MediaItemID = input.MediaItemID
	event.WatchType = input.WatchType
	event.MediaFilePath = input.MediaFilePath
	event.StartTime, _ = time.Parse(time.RFC3339, input.StartTime)
	event.Title = input.Title
	event.Description = input.Description
	if input.ContentRating != "" {
		event.ContentRating = input.ContentRating
	}

	if err := DB.Save(&event).Error; err != nil {
		log.Printf("Error updating scheduled event: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update event"})
		return
	}

	// 8b. Broadcast to lobby for real-time event updates
	lobbyBroadcastData := map[string]interface{}{
		"type":    "event_updated",
		"room_id": event.RoomID,
	}
	lobbyJsonData, _ := json.Marshal(lobbyBroadcastData)
	hub.BroadcastToLobby(OutgoingMessage{
		Data:     lobbyJsonData,
		IsBinary: false,
	})

	c.JSON(http.StatusOK, gin.H{
		"message": "Event updated successfully",
		"event":   event,
	})
}

// ToggleEarlyBirdHandler handles PATCH /api/scheduled-events/:id/early-bird
// Allows host to manually activate/deactivate early bird pricing
func ToggleEarlyBirdHandler(c *gin.Context) {
	// 1. Get authenticated user ID
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	authenticatedUserID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// 2. Get event ID
	eventIDStr := c.Param("id")
	eventID, err := strconv.ParseUint(eventIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event ID"})
		return
	}

	// 3. Bind input
	var input struct {
		EarlyBirdActive bool `json:"early_bird_active"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body. Expected: {\"early_bird_active\": true/false}"})
		return
	}

	// 4. Fetch the event
	var event models.ScheduledEvent
	if err := DB.First(&event, uint(eventID)).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Event not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// 5. Check if user is host
	var room models.Room
	if err := DB.First(&room, event.RoomID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch room"})
		return
	}
	if room.HostID != authenticatedUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can toggle early bird pricing"})
		return
	}

	// 6. Validate early bird is enabled for this event
	if !event.EarlyBirdEnabled {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Early bird pricing is not enabled for this event",
			"message": "You can only toggle early bird status for events that have early bird pricing configured",
		})
		return
	}

	// 7. Check if trying to re-activate after event has already started
	if input.EarlyBirdActive && time.Now().After(event.StartTime) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Cannot activate early bird for past events",
			"message": "The event has already started",
		})
		return
	}

	// 8. Check if trying to re-activate when less than 1 hour remains
	if input.EarlyBirdActive {
		earlyBirdEndTime := event.StartTime.Add(-1 * time.Hour)
		if time.Now().After(earlyBirdEndTime) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Cannot activate early bird within 1 hour of event start",
				"message": "Early bird pricing automatically ends 1 hour before the event",
				"early_bird_end_time": earlyBirdEndTime.Format(time.RFC3339),
			})
			return
		}
	}

	// 9. Update early bird status
	previousStatus := event.EarlyBirdActive
	if err := DB.Model(&event).Update("early_bird_active", input.EarlyBirdActive).Error; err != nil {
		log.Printf("Error toggling early bird: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update early bird status"})
		return
	}

	// 10. Log the change
	if input.EarlyBirdActive && !previousStatus {
		log.Printf("✅ [ToggleEarlyBird] Early bird RE-ACTIVATED for event %d: '%s'", event.ID, event.Title)
		log.Printf("   Host %d manually enabled early bird pricing", authenticatedUserID)
		log.Printf("   Early bird price: %d tokens ($%.2f %s)", 
			event.EarlyBirdPriceTokens, event.EarlyBirdPriceAmount, event.TicketPriceCurrency)
	} else if !input.EarlyBirdActive && previousStatus {
		log.Printf("⏹️ [ToggleEarlyBird] Early bird MANUALLY DEACTIVATED for event %d: '%s'", event.ID, event.Title)
		log.Printf("   Host %d ended early bird pricing early", authenticatedUserID)
		log.Printf("   Regular price now in effect: %d tokens ($%.2f %s)", 
			event.TicketPriceTokens, event.TicketPriceAmount, event.TicketPriceCurrency)
	}

	// 11. Broadcast to room via WebSocket
	broadcastData := map[string]interface{}{
		"type":                "early_bird_toggled",
		"event_id":            event.ID,
		"event_title":         event.Title,
		"early_bird_active":   input.EarlyBirdActive,
		"early_bird_price_tokens": event.EarlyBirdPriceTokens,
		"early_bird_price_amount": event.EarlyBirdPriceAmount,
		"regular_price_tokens": event.TicketPriceTokens,
		"regular_price_amount": event.TicketPriceAmount,
		"currency":            event.TicketPriceCurrency,
	}
	jsonData, _ := json.Marshal(broadcastData)
	hub.BroadcastToRoom(event.RoomID, OutgoingMessage{
		Data:     jsonData,
		IsBinary: false,
	}, nil)

	// 12. Refresh event from database to get updated values
	DB.First(&event, uint(eventID))

	// 13. Return success
	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Early bird pricing %s successfully", 
			map[bool]string{true: "activated", false: "deactivated"}[input.EarlyBirdActive]),
		"event": event,
		"early_bird_active": event.EarlyBirdActive,
		"status": map[bool]string{
			true:  "Early bird pricing is now active - discounted tickets available",
			false: "Early bird pricing ended - regular pricing now in effect",
		}[input.EarlyBirdActive],
	})
}

// DownloadICalHandler handles GET /api/scheduled-events/:id/ical
func DownloadICalHandler(c *gin.Context) {
	eventIDStr := c.Param("id")
	eventID, err := strconv.ParseUint(eventIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event ID"})
		return
	}

	// Fetch the event
	var event models.ScheduledEvent
	if err := DB.First(&event, uint(eventID)).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Event not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// Fetch the room and media item for details
	var room models.Room
	var mediaItem models.MediaItem
	DB.First(&room, event.RoomID)
	DB.First(&mediaItem, event.MediaItemID)

	// Generate iCal content
	icalContent := generateICal(event, room, mediaItem)

	// Set headers for file download
	c.Header("Content-Type", "text/calendar")
	c.Header("Content-Disposition", "attachment; filename=event.ics")

	// Send iCal content
	c.String(http.StatusOK, icalContent)
}

// Helper function to generate iCal content
func generateICal(event models.ScheduledEvent, room models.Room, mediaItem models.MediaItem) string {
	// Format times for iCal (YYYYMMDDTHHMMSSZ)
	startTime := event.StartTime.UTC().Format("20060102T150405Z")
	endTime := event.StartTime.Add(time.Hour * 2).UTC().Format("20060102T150405Z") // Assume 2-hour event

	// Escape special characters for iCal
	escapeICal := func(s string) string {
		s = strings.ReplaceAll(s, "\\", "\\\\")
		s = strings.ReplaceAll(s, ";", "\\;")
		s = strings.ReplaceAll(s, ",", "\\,")
		s = strings.ReplaceAll(s, "\n", "\\n")
		return s
	}

	summary := escapeICal(event.Title)
	description := escapeICal(event.Description + "\n\nJoin the room: http://localhost:5173/rooms/" + strconv.FormatUint(uint64(room.ID), 10))
	location := escapeICal("WeWatch Room: " + room.Name)

	return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//WeWatch//EN
BEGIN:VEVENT
UID:` + strconv.FormatUint(uint64(event.ID), 10) + `@wewatch.com
DTSTAMP:` + time.Now().UTC().Format("20060102T150405Z") + `
DTSTART:` + startTime + `
DTEND:` + endTime + `
SUMMARY:` + summary + `
DESCRIPTION:` + description + `
LOCATION:` + location + `
END:VEVENT
END:VCALENDAR`
}

// UploadTrailerHandler handles POST /api/scheduled-events/upload-trailer
// Uploads a trailer video file for a scheduled event
func UploadTrailerHandler(c *gin.Context) {
	// 1. Get authenticated user ID
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	authenticatedUserID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	log.Printf("🎬 [UploadTrailer] Upload initiated by user %d", authenticatedUserID)

	// 2. Parse multipart form (60 MB limit for trailers)
	const maxMemory int64 = 64 << 20 // 64 MB memory buffer
	const maxSize int64 = 60 << 20   // 60 MB max file size for trailers

	if err := c.Request.ParseMultipartForm(maxMemory); err != nil {
		log.Printf("❌ [UploadTrailer] Error parsing multipart form: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Error parsing upload data"})
		return
	}

	// 3. Get file from form
	formFile, err := c.FormFile("trailerFile")
	if err != nil {
		log.Printf("❌ [UploadTrailer] Error retrieving file from form: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file provided or error reading file"})
		return
	}

	log.Printf("📹 [UploadTrailer] Received file: %s (size: %.2f MB)", formFile.Filename, float64(formFile.Size)/(1024*1024))

	// 4. Enforce 60MB limit
	if formFile.Size > maxSize {
		log.Printf("❌ [UploadTrailer] File too large (%d bytes). Max size: %d bytes", formFile.Size, maxSize)
		c.JSON(http.StatusBadRequest, gin.H{"error": "File too large. Maximum size is 60 MB for trailers."})
		return
	}

	// 5. Validate file type (video only)
	allowedExtensions := map[string]bool{
		".mp4": true, ".webm": true, ".mov": true, ".mkv": true,
	}
	ext := strings.ToLower(filepath.Ext(formFile.Filename))
	if !allowedExtensions[ext] {
		log.Printf("❌ [UploadTrailer] Invalid file type: %s", ext)
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid file type '%s'. Allowed types: mp4, webm, mov, mkv", ext)})
		return
	}

	// 6. Create unique filename
	uniqueID := uuid.New()
	uniqueFilename := fmt.Sprintf("trailer_%s%s", uniqueID.String(), ext)

	// 7. Create trailers directory
	trailerUploadDir := "./uploads/trailers"
	if err := os.MkdirAll(trailerUploadDir, os.ModePerm); err != nil {
		log.Printf("❌ [UploadTrailer] Failed to create trailer directory '%s': %v", trailerUploadDir, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare storage"})
		return
	}

	filePath := filepath.Join(trailerUploadDir, uniqueFilename)
	log.Printf("💾 [UploadTrailer] Saving file to: %s", filePath)

	// 8. Save file
	if err := c.SaveUploadedFile(formFile, filePath); err != nil {
		log.Printf("❌ [UploadTrailer] Error saving file to '%s': %v", filePath, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save uploaded file"})
		return
	}

	log.Printf("✅ [UploadTrailer] File saved successfully to '%s'", filePath)

	// 9. Get video duration
	log.Printf("⏱️ [UploadTrailer] Extracting duration for '%s'", filePath)
	durationStr, err := utils.GetVideoDuration(filePath)
	if err != nil {
		log.Printf("⚠️ [UploadTrailer] Could not extract duration: %v (defaulting to 60s)", err)
		durationStr = "00:01:00" // Default to 60 seconds if extraction fails
	}

	// Parse duration from HH:MM:SS format to seconds
	var durationSeconds int
	parts := strings.Split(durationStr, ":")
	if len(parts) == 3 {
		hours, _ := strconv.Atoi(parts[0])
		minutes, _ := strconv.Atoi(parts[1])
		seconds, _ := strconv.Atoi(parts[2])
		durationSeconds = hours*3600 + minutes*60 + seconds
	} else {
		durationSeconds = 60 // Default if parsing fails
	}

	// 10. Validate duration (max 60 seconds)
	if durationSeconds > 60 {
		log.Printf("❌ [UploadTrailer] Trailer too long: %ds (max 60s)", durationSeconds)
		// Delete the file
		os.Remove(filePath)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Trailer must be 60 seconds or less"})
		return
	}

	log.Printf("✅ [UploadTrailer] Duration: %ds", durationSeconds)

	// 11. Upload to BunnyCDN (falls back to local if not configured)
	fileBytes, err := os.ReadFile(filePath)
	if err != nil {
		log.Printf("❌ [UploadTrailer] Failed to read file for CDN upload: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process uploaded file"})
		return
	}

	contentTypeMap := map[string]string{
		".mp4":  "video/mp4",
		".webm": "video/webm",
		".mov":  "video/quicktime",
		".mkv":  "video/x-matroska",
	}
	contentType := contentTypeMap[ext]
	if contentType == "" {
		contentType = "video/mp4"
	}

	cdnURL, cdnErr := utils.UploadTrailerToBunnyCDN(fileBytes, uniqueFilename, contentType)
	if cdnErr != nil {
		log.Printf("⚠️ [UploadTrailer] CDN upload failed, using local fallback: %v", cdnErr)
		cdnURL = filePath // serve from local if CDN fails
	} else {
		// CDN has the file — delete local temp copy
		os.Remove(filePath)
		log.Printf("🗑️ [UploadTrailer] Local temp file removed after CDN upload")
	}

	// 12. Return success
	c.JSON(http.StatusOK, gin.H{
		"message":   "Trailer uploaded successfully",
		"file_path": cdnURL,
		"duration":  durationSeconds,
		"size":      formFile.Size,
	})
}

// GetUserUpcomingEventsHandler handles GET /api/user/upcoming-events
// Returns events from now to +30 days from all rooms the user belongs to
func GetUserUpcomingEventsHandler(c *gin.Context) {
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	authenticatedUserID := userIDValue.(uint)

	now := time.Now().UTC()
	end := now.Add(30 * 24 * time.Hour)

	var userRooms []models.UserRoom
	if err := DB.Where("user_id = ? AND status = 'active'", authenticatedUserID).Find(&userRooms).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user rooms"})
		return
	}

	roomIDs := make([]uint, 0, len(userRooms))
	for _, ur := range userRooms {
		roomIDs = append(roomIDs, ur.RoomID)
	}

	if len(roomIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"events": []interface{}{}})
		return
	}

	var events []models.ScheduledEvent
	if err := DB.Preload("Room").
		Where("room_id IN ? AND start_time >= ? AND start_time <= ?", roomIDs, now, end).
		Order("start_time ASC").
		Find(&events).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch upcoming events"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"events": events})
}

// GetUserCalendarHandler handles GET /api/user/calendar?month=2026-05
// Returns all scheduled events from rooms the user belongs to for a given month
func GetUserCalendarHandler(c *gin.Context) {
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	authenticatedUserID := userIDValue.(uint)

	monthStr := c.Query("month")
	var startDate, endDate time.Time
	if monthStr != "" {
		if t, err := time.Parse("2006-01", monthStr); err == nil {
			startDate = time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
			endDate = startDate.AddDate(0, 1, 0)
		}
	}
	if startDate.IsZero() {
		now := time.Now().UTC()
		startDate = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		endDate = startDate.AddDate(0, 1, 0)
	}

	// Get room IDs the user belongs to
	var userRooms []models.UserRoom
	if err := DB.Where("user_id = ?", authenticatedUserID).Find(&userRooms).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user rooms"})
		return
	}

	roomIDs := make([]uint, 0, len(userRooms))
	for _, ur := range userRooms {
		roomIDs = append(roomIDs, ur.RoomID)
	}

	if len(roomIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"events": []interface{}{}, "month": monthStr})
		return
	}

	var events []models.ScheduledEvent
	if err := DB.Preload("Room").
		Where("room_id IN ? AND start_time >= ? AND start_time < ?", roomIDs, startDate, endDate).
		Order("start_time ASC").
		Find(&events).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch calendar events"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"events": events,
		"month":  monthStr,
		"start":  startDate.Format(time.RFC3339),
		"end":    endDate.Format(time.RFC3339),
	})
}
