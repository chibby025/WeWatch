package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// RSVPInput defines the expected structure for RSVP
type RSVPInput struct {
	ScheduledEventID uint `json:"scheduled_event_id" binding:"required"`
}

// PurchaseTicketInput defines the expected structure for ticket purchase
type PurchaseTicketInput struct {
	ScheduledEventID uint `json:"scheduled_event_id" binding:"required"`
	IsGift           bool `json:"is_gift"`           // Whether this ticket is a gift
	RecipientUserID  *uint `json:"recipient_user_id"` // Required if is_gift=true
}

// CreateFreeRSVPHandler handles POST /api/scheduled-events/:id/rsvp
// Allows users to RSVP to free events
func CreateFreeRSVPHandler(c *gin.Context) {
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

	// 2. Get event ID from URL
	eventIDStr := c.Param("id")
	eventID, err := strconv.ParseUint(eventIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event ID"})
		return
	}

	// 3. Fetch the scheduled event
	var event models.ScheduledEvent
	if err := DB.First(&event, uint(eventID)).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Event not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// 4. Validate event is free
	if event.IsPaid {
		c.JSON(http.StatusBadRequest, gin.H{"error": "This is a paid event. Use the ticket purchase endpoint instead."})
		return
	}

	// 5. Check if event has already started
	if time.Now().After(event.StartTime) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot RSVP to an event that has already started"})
		return
	}

	// 6. Check if user already has an RSVP
	var existingRSVP models.EventTicket
	err = DB.Where("scheduled_event_id = ? AND user_id = ?", uint(eventID), authenticatedUserID).
		First(&existingRSVP).Error
	
	if err == nil {
		// RSVP exists
		if existingRSVP.IsCancelled {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "You previously cancelled your RSVP. Please create a new RSVP.",
				"action": "rsvp_cancelled",
			})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "You have already RSVP'd to this event",
			"ticket": existingRSVP,
		})
		return
	} else if err != gorm.ErrRecordNotFound {
		log.Printf("Error checking existing RSVP: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// 7. Create RSVP ticket
	rsvpTicket := models.EventTicket{
		ScheduledEventID:    uint(eventID),
		UserID:              authenticatedUserID,
		HostID:              event.HostUserID,
		PaymentMethod:       "free_rsvp",
		TicketPriceTokens:   0,
		TicketPriceCurrency: "",
		TicketPriceAmount:   0,
		IsEarlyBird:         false,
		IsGift:              false,
	}

	if err := DB.Create(&rsvpTicket).Error; err != nil {
		log.Printf("Error creating RSVP: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create RSVP"})
		return
	}

	// 8. Update event RSVP count
	if err := DB.Model(&event).Update("rsvp_count", gorm.Expr("rsvp_count + 1")).Error; err != nil {
		log.Printf("Error updating RSVP count: %v", err)
		// Don't fail the request if count update fails
	}

	// 9. Broadcast to room
	broadcastData := map[string]interface{}{
		"type":              "rsvp_created",
		"scheduled_event_id": uint(eventID),
		"rsvp_count":        event.RSVPCount + 1,
	}
	jsonData, _ := json.Marshal(broadcastData)
	hub.BroadcastToRoom(event.RoomID, OutgoingMessage{
		Data:     jsonData,
		IsBinary: false,
	}, nil)

	// 10. Return success
	log.Printf("✅ [RSVP] User %d RSVP'd to event %d", authenticatedUserID, eventID)
	c.JSON(http.StatusCreated, gin.H{
		"message": "RSVP created successfully",
		"ticket":  rsvpTicket,
	})
}

// PurchaseEventTicketHandler handles POST /api/scheduled-events/:id/purchase-ticket
// Allows users to purchase tickets for paid events
func PurchaseEventTicketHandler(c *gin.Context) {
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

	// 2. Get event ID from URL
	eventIDStr := c.Param("id")
	eventID, err := strconv.ParseUint(eventIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event ID"})
		return
	}

	// 3. Bind input
	var input PurchaseTicketInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 4. Fetch the scheduled event
	var event models.ScheduledEvent
	if err := DB.First(&event, uint(eventID)).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Event not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// 5. Validate event is paid
	if !event.IsPaid {
		c.JSON(http.StatusBadRequest, gin.H{"error": "This is a free event. Use the RSVP endpoint instead."})
		return
	}

	// 6. Check if event has already started
	if time.Now().After(event.StartTime) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot purchase tickets for an event that has already started"})
		return
	}

	// 7. Determine the recipient (self or gift)
	recipientUserID := authenticatedUserID
	if input.IsGift {
		if input.RecipientUserID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "recipient_user_id is required when is_gift=true"})
			return
		}
		recipientUserID = *input.RecipientUserID

		// Validate recipient exists
		var recipientUser models.User
		if err := DB.First(&recipientUser, recipientUserID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Recipient user not found"})
			return
		}

		// Check if recipient already has a ticket
		var existingTicket models.EventTicket
		err = DB.Where("scheduled_event_id = ? AND user_id = ? AND (is_cancelled = ? OR is_refunded = ?)", 
			uint(eventID), recipientUserID, false, false).
			First(&existingTicket).Error
		
		if err == nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("User already has a ticket for this event"),
			})
			return
		} else if err != gorm.ErrRecordNotFound {
			log.Printf("Error checking existing ticket: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}
	} else {
		// Check if user already has a ticket (for self-purchase)
		var existingTicket models.EventTicket
		err = DB.Where("scheduled_event_id = ? AND user_id = ? AND (is_cancelled = ? OR is_refunded = ?)", 
			uint(eventID), authenticatedUserID, false, false).
			First(&existingTicket).Error
		
		if err == nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "You already have a ticket for this event",
				"ticket": existingTicket,
			})
			return
		} else if err != gorm.ErrRecordNotFound {
			log.Printf("Error checking existing ticket: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}
	}

	// 8. Determine ticket price (early bird or regular)
	ticketPriceTokens := event.TicketPriceTokens
	ticketPriceAmount := event.TicketPriceAmount
	isEarlyBird := false
	earlyBirdSavingsTokens := 0

	if event.EarlyBirdEnabled && event.EarlyBirdActive {
		// Check if we're still in early bird window (ends 1 hour before event)
		earlyBirdEndTime := event.StartTime.Add(-1 * time.Hour)
		if time.Now().Before(earlyBirdEndTime) {
			ticketPriceTokens = event.EarlyBirdPriceTokens
			ticketPriceAmount = event.EarlyBirdPriceAmount
			isEarlyBird = true
			earlyBirdSavingsTokens = event.TicketPriceTokens - event.EarlyBirdPriceTokens
			log.Printf("🎉 [TicketPurchase] Early bird pricing applied for event %d", eventID)
		}
	}

	// 9. Calculate transfer fee if gift (5% of ticket price, minimum 1 token)
	transferFeeTokens := 0
	if input.IsGift {
		transferFeeTokens = int(float64(ticketPriceTokens) * 0.05)
		if transferFeeTokens < 1 {
			transferFeeTokens = 1 // Minimum 1 token fee
		}
		log.Printf("💸 [TicketPurchase] Transfer fee for gift: %d tokens (5%% of %d)", transferFeeTokens, ticketPriceTokens)
	}

	// 10. Calculate total cost
	totalCostTokens := ticketPriceTokens + transferFeeTokens

	// 11. Get buyer's wallet
	var buyerWallet models.UserWallet
	if err := DB.Where("user_id = ?", authenticatedUserID).First(&buyerWallet).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Wallet not found. Please create a wallet first."})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// 12. Check sufficient balance
	if buyerWallet.TokenBalance < totalCostTokens {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Insufficient token balance",
			"required_tokens": totalCostTokens,
			"current_balance": buyerWallet.TokenBalance,
			"ticket_price": ticketPriceTokens,
			"transfer_fee": transferFeeTokens,
		})
		return
	}

	// 13. Begin transaction
	tx := DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// 14. Deduct tokens from buyer
	if err := tx.Model(&buyerWallet).Update("token_balance", gorm.Expr("token_balance - ?", totalCostTokens)).Error; err != nil {
		tx.Rollback()
		log.Printf("Error deducting tokens from buyer: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to deduct tokens"})
		return
	}

	// 15. Add tokens to host's reserve
	var hostWallet models.UserWallet
	if err := tx.Where("user_id = ?", event.HostUserID).First(&hostWallet).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			// Create wallet for host if doesn't exist
			hostWallet = models.UserWallet{
				UserID:       event.HostUserID,
				TokenBalance: ticketPriceTokens,
			}
			if err := tx.Create(&hostWallet).Error; err != nil {
				tx.Rollback()
				log.Printf("Error creating host wallet: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create host wallet"})
				return
			}
		} else {
			tx.Rollback()
			log.Printf("Error fetching host wallet: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}
	} else {
		// Update existing host wallet
		if err := tx.Model(&hostWallet).Update("token_balance", gorm.Expr("token_balance + ?", ticketPriceTokens)).Error; err != nil {
			tx.Rollback()
			log.Printf("Error adding tokens to host: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add tokens to host"})
			return
		}
	}

	// 16. Record ticket purchase transaction
	ticketTransaction := models.TokenTransaction{
		UserID:          authenticatedUserID,
		TransactionType: models.TransactionTypeTicketPurchase,
		Amount:          ticketPriceTokens,
		Status:          models.TransactionStatusCompleted,
	}

	if err := tx.Create(&ticketTransaction).Error; err != nil {
		tx.Rollback()
		log.Printf("Error recording ticket transaction: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to record transaction"})
		return
	}

	// 17. Record transfer fee transaction if gift
	if input.IsGift && transferFeeTokens > 0 {
		transferFeeTransaction := models.TokenTransaction{
			UserID:          authenticatedUserID,
			TransactionType: models.TransactionTypeTicketTransferFee,
			Amount:          transferFeeTokens,
			Status:          models.TransactionStatusCompleted,
		}

		if err := tx.Create(&transferFeeTransaction).Error; err != nil {
			tx.Rollback()
			log.Printf("Error recording transfer fee transaction: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to record transfer fee"})
			return
		}

		// Update platform accounting with transfer fee revenue
		var accounting models.PlatformAccounting
		if err := tx.First(&accounting, 1).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				// Create accounting record if doesn't exist
				accounting = models.PlatformAccounting{
					TransferFeeRevenue:         float64(transferFeeTokens),
					LifetimeTransferFeeRevenue: float64(transferFeeTokens),
				}
				if err := tx.Create(&accounting).Error; err != nil {
					tx.Rollback()
					log.Printf("Error creating platform accounting: %v", err)
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update accounting"})
					return
				}
			} else {
				tx.Rollback()
				log.Printf("Error fetching platform accounting: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
				return
			}
		} else {
			if err := tx.Model(&accounting).Updates(map[string]interface{}{
				"transfer_fee_revenue":          gorm.Expr("transfer_fee_revenue + ?", transferFeeTokens),
				"lifetime_transfer_fee_revenue": gorm.Expr("lifetime_transfer_fee_revenue + ?", transferFeeTokens),
			}).Error; err != nil {
				tx.Rollback()
				log.Printf("Error updating platform accounting: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update accounting"})
				return
			}
		}
	}

	// 18. Record early bird savings transaction if applicable (informational)
	if isEarlyBird && earlyBirdSavingsTokens > 0 {
		savingsTransaction := models.TokenTransaction{
			UserID:          authenticatedUserID,
			TransactionType: models.TransactionTypeEarlyBirdSavings,
			Amount:          earlyBirdSavingsTokens,
			Status:          models.TransactionStatusCompleted,
		}

		if err := tx.Create(&savingsTransaction).Error; err != nil {
			// Don't fail the transaction if savings recording fails (it's informational)
			log.Printf("⚠️ Warning: Failed to record early bird savings: %v", err)
		}

		// Update platform accounting with early bird savings (informational)
		var accounting models.PlatformAccounting
		if err := tx.First(&accounting, 1).Error; err == nil {
			if err := tx.Model(&accounting).Update("total_early_bird_savings", 
				gorm.Expr("total_early_bird_savings + ?", earlyBirdSavingsTokens)).Error; err != nil {
				log.Printf("⚠️ Warning: Failed to update early bird savings in accounting: %v", err)
			}
		}
	}

	// 19. Create event ticket record
	var giftedByUserID *uint
	if input.IsGift {
		giftedByUserID = &authenticatedUserID
	}

	ticket := models.EventTicket{
		ScheduledEventID:    uint(eventID),
		UserID:              recipientUserID,
		HostID:              event.HostUserID,
		PaymentMethod:       "tokens",
		TicketPriceTokens:   ticketPriceTokens,
		TicketPriceCurrency: event.TicketPriceCurrency,
		TicketPriceAmount:   ticketPriceAmount,
		IsEarlyBird:         isEarlyBird,
		TransactionID:       &ticketTransaction.ID,
		IsGift:              input.IsGift,
		GiftedByUserID:      giftedByUserID,
	}

	if err := tx.Create(&ticket).Error; err != nil {
		tx.Rollback()
		log.Printf("Error creating event ticket: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create ticket"})
		return
	}

	// 20. Update event ticket count
	if err := tx.Model(&event).Update("tickets_sold", gorm.Expr("tickets_sold + 1")).Error; err != nil {
		tx.Rollback()
		log.Printf("Error updating ticket count: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update ticket count"})
		return
	}

	// 21. Commit transaction
	if err := tx.Commit().Error; err != nil {
		log.Printf("Error committing transaction: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to complete purchase"})
		return
	}

	// 22. Broadcast to room
	broadcastData := map[string]interface{}{
		"type":                "ticket_purchased",
		"scheduled_event_id":  uint(eventID),
		"tickets_sold":        event.TicketsSold + 1,
	}
	jsonData, _ := json.Marshal(broadcastData)
	hub.BroadcastToRoom(event.RoomID, OutgoingMessage{
		Data:     jsonData,
		IsBinary: false,
	}, nil)

	// 23. Return success
	log.Printf("✅ [TicketPurchase] User %d purchased ticket for event %d (gift: %v, early bird: %v, fee: %d)", 
		authenticatedUserID, eventID, input.IsGift, isEarlyBird, transferFeeTokens)
	
	c.JSON(http.StatusCreated, gin.H{
		"message":             "Ticket purchased successfully",
		"ticket":              ticket,
		"total_cost_tokens":   totalCostTokens,
		"ticket_price_tokens": ticketPriceTokens,
		"transfer_fee_tokens": transferFeeTokens,
		"is_early_bird":       isEarlyBird,
		"early_bird_savings":  earlyBirdSavingsTokens,
	})
}

// CancelRSVPHandler handles DELETE /api/scheduled-events/:id/rsvp
// Allows users to cancel their free RSVP (up to 1 hour before event)
func CancelRSVPHandler(c *gin.Context) {
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

	// 2. Get event ID from URL
	eventIDStr := c.Param("id")
	eventID, err := strconv.ParseUint(eventIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event ID"})
		return
	}

	// 3. Fetch the scheduled event
	var event models.ScheduledEvent
	if err := DB.First(&event, uint(eventID)).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Event not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// 4. Find user's RSVP
	var rsvp models.EventTicket
	if err := DB.Where("scheduled_event_id = ? AND user_id = ?", uint(eventID), authenticatedUserID).
		First(&rsvp).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "RSVP not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// 5. Validate RSVP can be cancelled
	if !rsvp.CanCancel(event.StartTime) {
		if !rsvp.IsFreeRSVP() {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Paid tickets cannot be cancelled. Please contact support for refunds.",
			})
		} else if rsvp.IsCancelled {
			c.JSON(http.StatusBadRequest, gin.H{"error": "RSVP already cancelled"})
		} else {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Cannot cancel RSVP within 1 hour of event start time",
			})
		}
		return
	}

	// 6. Mark RSVP as cancelled
	now := time.Now()
	if err := DB.Model(&rsvp).Updates(map[string]interface{}{
		"is_cancelled":  true,
		"cancelled_at":  now,
	}).Error; err != nil {
		log.Printf("Error cancelling RSVP: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to cancel RSVP"})
		return
	}

	// 7. Update event RSVP count
	if err := DB.Model(&event).Update("rsvp_count", gorm.Expr("rsvp_count - 1")).Error; err != nil {
		log.Printf("Error updating RSVP count: %v", err)
		// Don't fail the request if count update fails
	}

	// 8. Broadcast to room
	broadcastData := map[string]interface{}{
		"type":               "rsvp_cancelled",
		"scheduled_event_id": uint(eventID),
		"rsvp_count":         event.RSVPCount - 1,
	}
	jsonData, _ := json.Marshal(broadcastData)
	hub.BroadcastToRoom(event.RoomID, OutgoingMessage{
		Data:     jsonData,
		IsBinary: false,
	}, nil)

	// 9. Return success
	log.Printf("✅ [RSVP] User %d cancelled RSVP for event %d", authenticatedUserID, eventID)
	c.JSON(http.StatusOK, gin.H{
		"message": "RSVP cancelled successfully",
	})
}

// GetUserEventTicketsHandler retrieves all event tickets and RSVPs for the authenticated user
// GET /api/users/me/event-tickets
func GetUserEventTicketsHandler(c *gin.Context) {
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

	// 2. Fetch all event tickets (paid + free RSVPs) with event details
	var allTickets []models.EventTicket
	err := DB.Preload("ScheduledEvent.Room").
		Preload("GiftedBy").
		Where("user_id = ? AND is_cancelled = ? AND is_refunded = ?", authenticatedUserID, false, false).
		Order("created_at DESC").
		Find(&allTickets).Error
	
	if err != nil {
		log.Printf("Error fetching event tickets: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch tickets"})
		return
	}

	// 3. Split into upcoming and past events
	now := time.Now()
	upcomingTickets := []models.EventTicket{}
	upcomingRSVPs := []models.EventTicket{}
	pastEvents := []models.EventTicket{}

	for _, ticket := range allTickets {
		if ticket.ScheduledEvent == nil {
			continue // Skip if event was deleted
		}

		isPast := ticket.ScheduledEvent.StartTime.Before(now)
		isRSVP := ticket.IsFreeRSVP()

		if isPast {
			pastEvents = append(pastEvents, ticket)
		} else if isRSVP {
			upcomingRSVPs = append(upcomingRSVPs, ticket)
		} else {
			upcomingTickets = append(upcomingTickets, ticket)
		}
	}

	// 4. Build response with ticket images
	buildTicketResponse := func(tickets []models.EventTicket) []map[string]interface{} {
		response := make([]map[string]interface{}, 0, len(tickets))
		for _, ticket := range tickets {
			if ticket.ScheduledEvent == nil {
				continue
			}

			// Get ticket image based on watch_type
			ticketImage := "/icons/TheaterTicket.png" // Default
			switch ticket.ScheduledEvent.WatchType {
			case "3d_cinema":
				ticketImage = "/icons/CinemaTicket.png"
			case "classroom":
				ticketImage = "/icons/LectureTicket.png"
			case "video_watch":
				ticketImage = "/icons/TheaterTicket.png"
			}

			// Calculate if event is starting soon (within 1 hour)
			timeUntilStart := time.Until(ticket.ScheduledEvent.StartTime)
			isStartingSoon := timeUntilStart > 0 && timeUntilStart <= time.Hour

			// Check if RSVP can be cancelled (>1 hour before start)
			canCancel := ticket.IsFreeRSVP() && ticket.CanCancel(ticket.ScheduledEvent.StartTime)

			ticketData := map[string]interface{}{
				"id":                ticket.ID,
				"scheduled_event_id": ticket.ScheduledEventID,
				"payment_method":    ticket.PaymentMethod,
				"ticket_price_tokens": ticket.TicketPriceTokens,
				"is_early_bird":     ticket.IsEarlyBird,
				"is_gift":           ticket.IsGift,
				"created_at":        ticket.CreatedAt,
				"ticket_image":      ticketImage,
				"can_cancel":        canCancel,
				"is_starting_soon":  isStartingSoon,
				"did_attend":        ticket.DidAttend,
				"event": map[string]interface{}{
					"id":          ticket.ScheduledEvent.ID,
					"title":       ticket.ScheduledEvent.Title,
					"description": ticket.ScheduledEvent.Description,
					"start_time":  ticket.ScheduledEvent.StartTime,
					"watch_type":  ticket.ScheduledEvent.WatchType,
					"room_id":     ticket.ScheduledEvent.RoomID,
				},
			}

			// Add room name if available
			if ticket.ScheduledEvent.Room != nil {
				ticketData["event"].(map[string]interface{})["room_name"] = ticket.ScheduledEvent.Room.Name
			}

			// Add gifted by info if applicable
			if ticket.IsGift && ticket.GiftedBy != nil {
				ticketData["gifted_by"] = map[string]interface{}{
					"id":       ticket.GiftedBy.ID,
					"username": ticket.GiftedBy.Username,
				}
			}

			response = append(response, ticketData)
		}
		return response
	}

	// 5. Return structured response
	c.JSON(http.StatusOK, gin.H{
		"upcoming_tickets": buildTicketResponse(upcomingTickets),
		"upcoming_rsvps":   buildTicketResponse(upcomingRSVPs),
		"past_events":      buildTicketResponse(pastEvents),
		"total_count":      len(allTickets),
	})
}
