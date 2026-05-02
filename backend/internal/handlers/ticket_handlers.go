// WeWatch/backend/internal/handlers/ticket_handlers.go
package handlers

import (
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// PurchaseTicketRequest represents a ticket purchase request
type PurchaseTicketRequest struct {
	PaymentMethod string  `json:"payment_method" binding:"required,oneof=tokens paystack stripe"`
	PaymentToken  *string `json:"payment_token"` // Required for paystack/stripe
	GiftToUserID  *uint   `json:"gift_to_user_id"` // Optional: if gifting to someone
}

// PurchaseSessionTicketHandler handles ticket purchases for a watch session
// POST /api/sessions/:id/tickets/purchase
func PurchaseSessionTicketHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		sessionIDStr := c.Param("id")
		sessionID, err := strconv.ParseUint(sessionIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
			return
		}

		// Get authenticated user ID from context
		userIDInterface, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		userID := userIDInterface.(uint)

		// Fetch user from database
		var buyer models.User
		if err := db.First(&buyer, userID).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user"})
			return
		}

		var req PurchaseTicketRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate payment token for gateway payments
		if (req.PaymentMethod == "paystack" || req.PaymentMethod == "stripe") && req.PaymentToken == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Payment token required for gateway payments"})
			return
		}

		// Get session details
		var session models.WatchSession
		if err := db.Preload("Host").First(&session, sessionID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			} else {
				log.Printf("❌ Error fetching session: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch session"})
			}
			return
		}

		// Check if session requires tickets
		if !session.TicketingEnabled {
			c.JSON(http.StatusBadRequest, gin.H{"error": models.ErrSessionNotTicketed.Error()})
			return
		}

		// Determine ticket recipient
		recipientUserID := buyer.ID
		isGift := req.GiftToUserID != nil
		var transferFeeTokens int = 0 // 5% transfer fee for gifts
		
		if isGift {
			recipientUserID = *req.GiftToUserID

			// Validate gift recipient exists and is not the buyer
			var recipientUser models.User
			if err := db.First(&recipientUser, recipientUserID).Error; err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Gift recipient not found"})
				return
			}
			if recipientUserID == buyer.ID {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot gift ticket to yourself"})
				return
			}
		}

		// Check if user already has ticket
		var existingTicket models.SessionTicket
		result := db.Where("session_id = ? AND user_id = ?", sessionID, recipientUserID).First(&existingTicket)
		if result.Error == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": models.ErrTicketAlreadyPurchased.Error()})
			return
		}

		// Determine ticket price (early bird or regular)
		ticketPriceTokens := session.TicketPriceTokens
		ticketPriceCurrency := session.TicketPriceCurrency
		ticketPriceAmount := session.TicketPriceAmount
		isEarlyBird := false
		earlyBirdSavings := 0 // Track savings for analytics

		if session.EarlyBirdEnabled && session.EarlyBirdActive {
			earlyBirdSavings = session.TicketPriceTokens - session.EarlyBirdPriceTokens
			ticketPriceTokens = session.EarlyBirdPriceTokens
			ticketPriceAmount = session.EarlyBirdPriceAmount
			isEarlyBird = true
		}

		// Calculate 5% transfer fee for gifts
		if isGift {
			transferFeeTokens = int(float64(ticketPriceTokens) * 0.05)
			if transferFeeTokens < 1 {
				transferFeeTokens = 1 // Minimum 1 token fee
			}
		}

		// Validate ticket price exists for payment method
		if req.PaymentMethod == "tokens" && ticketPriceTokens == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Token payment not available for this session"})
			return
		}
		if (req.PaymentMethod == "paystack" || req.PaymentMethod == "stripe") && ticketPriceAmount == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Gateway payment not available for this session"})
			return
		}

		// Start transaction
		tx := db.Begin()
		defer func() {
			if r := recover(); r != nil {
				tx.Rollback()
			}
		}()

		var transactionID *uint
		var gatewayEarningID *uint

		// Process payment based on method
		if req.PaymentMethod == "tokens" {
			// Deduct tokens from buyer's wallet (ticket price + transfer fee if gifting)
			totalCostTokens := ticketPriceTokens + transferFeeTokens
			
			var buyerWallet models.UserWallet
			if err := tx.Where("user_id = ?", buyer.ID).First(&buyerWallet).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch wallet"})
				return
			}

			if err := buyerWallet.DeductTokens(totalCostTokens); err != nil {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			if err := tx.Save(&buyerWallet).Error; err != nil {
				tx.Rollback()
				log.Printf("❌ Error updating buyer wallet: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process payment"})
				return
			}

			// Create transaction record
			usdValue := float64(ticketPriceTokens) * 0.10
			transaction := models.TokenTransaction{
				UserID:          buyer.ID,
				SessionID:       &session.ID,
				TransactionType: models.TransactionTypeTicket,
				Amount:          ticketPriceTokens,
				USDValue:        &usdValue,
				Status:          models.TransactionStatusCompleted,
			}
			if err := tx.Create(&transaction).Error; err != nil {
				tx.Rollback()
				log.Printf("❌ Error creating transaction: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create transaction"})
				return
			}
			transactionID = &transaction.ID

			// Credit host wallet with 100% of tokens spent (platform already profited on token purchase at ₦165/token)
			// Host will withdraw at ₦122/token, platform keeps the ₦43/token spread as profit
			hostEarning := ticketPriceTokens  // 100% to host

			var hostWallet models.UserWallet
			result := tx.Where("user_id = ?", session.HostID).First(&hostWallet)
			if result.Error == gorm.ErrRecordNotFound {
				hostWallet = models.UserWallet{
					UserID:         session.HostID,
					TokenBalance:   0,
					LifetimeEarned: 0,
					LifetimeSpent:  0,
				}
				tx.Create(&hostWallet)
			}

			hostWallet.AddTokens(hostEarning)
			if err := tx.Save(&hostWallet).Error; err != nil {
				tx.Rollback()
				log.Printf("❌ Error updating host wallet: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to credit host"})
				return
			}

			// Record 5% transfer fee as platform revenue (if gifting)
			if isGift && transferFeeTokens > 0 {
				usdValue := float64(transferFeeTokens) * 0.10
				transferFeeTransaction := models.TokenTransaction{
					UserID:          buyer.ID,
					SessionID:       &session.ID,
					TransactionType: models.TransactionTypeTicketTransferFee,
					Amount:          transferFeeTokens,
					USDValue:        &usdValue,
					Status:          models.TransactionStatusCompleted,
				}
				if err := tx.Create(&transferFeeTransaction).Error; err != nil {
					tx.Rollback()
					log.Printf("❌ Error recording transfer fee: %v", err)
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to record transfer fee"})
					return
				}

				// Update platform accounting with transfer fee revenue
				accounting, accErr := models.GetPlatformAccounting(tx)
				if accErr != nil {
					log.Printf("⚠️ Could not fetch platform accounting: %v", accErr)
				} else {
					// Transfer fees go 100% to platform (additional revenue stream)
					transferFeeNaira := float64(transferFeeTokens) * 1.65 // ₦165 per token in cents
					accounting.TransferFeeRevenue += transferFeeNaira
					accounting.LifetimeTransferFeeRevenue += transferFeeNaira
					accounting.LifetimePlatformProfit += transferFeeNaira
					if saveErr := tx.Save(accounting).Error; saveErr != nil {
						log.Printf("⚠️ Could not update platform accounting: %v", saveErr)
					}
				}

				log.Printf("💰 Transfer fee collected: %d tokens (₦%.2f) from user %d", transferFeeTokens, float64(transferFeeTokens)*1.65, buyer.ID)
			}

			// Record early bird savings for analytics (informational)
			if isEarlyBird && earlyBirdSavings > 0 {
				usdValue := float64(earlyBirdSavings) * 0.10
				savingsTransaction := models.TokenTransaction{
					UserID:          buyer.ID,
					SessionID:       &session.ID,
					TransactionType: models.TransactionTypeEarlyBirdSavings,
					Amount:          earlyBirdSavings,
					USDValue:        &usdValue,
					Status:          models.TransactionStatusCompleted,
				}
				if err := tx.Create(&savingsTransaction).Error; err != nil {
					log.Printf("⚠️ Could not record early bird savings (non-critical): %v", err)
				} else {
					// Update platform accounting with early bird savings (informational)
					accounting, accErr := models.GetPlatformAccounting(tx)
					if accErr == nil {
						savingsNaira := float64(earlyBirdSavings) * 1.65
						accounting.TotalEarlyBirdSavings += savingsNaira
						tx.Save(accounting)
					}
				}
			}

			// 📊 No platform accounting change for ticket sales: profit already captured on token purchase
			// Token economics: Buy ₦165 → Host earns tokens → Withdraw ₦122 → Platform profit = ₦43/token

			log.Printf("✅ Token ticket: %d cents from user %d → Host gets %d cents (100%%), Transfer fee: %d cents, Platform profit from spread", 
				ticketPriceTokens, buyer.ID, hostEarning, transferFeeTokens)

		} else {
			// Gateway payment (Stripe/Paystack)
			// TODO: Process payment with gateway API
			log.Printf("💳 Processing %s payment: $%.2f %s", req.PaymentMethod, ticketPriceAmount, ticketPriceCurrency)

			// Calculate commission (15%)
			grossAmount := ticketPriceAmount
			commission := grossAmount * 0.15
			netAmount := grossAmount - commission

			// Create gateway earning record
			gatewayEarning := models.GatewayEarning{
				HostID:             session.HostID,
				SessionID:          &session.ID,
				PaymentGateway:     req.PaymentMethod,
				Currency:           ticketPriceCurrency,
				GrossAmount:        grossAmount,
				PlatformCommission: commission,
				NetAmount:          netAmount,
				PaymentID:          *req.PaymentToken,
			}
			if err := tx.Create(&gatewayEarning).Error; err != nil {
				tx.Rollback()
				log.Printf("❌ Error creating gateway earning: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to record earning"})
				return
			}
			gatewayEarningID = &gatewayEarning.ID

			log.Printf("✅ Gateway earning recorded: Gross=%.2f, Commission=%.2f, Net=%.2f %s", grossAmount, commission, netAmount, ticketPriceCurrency)
		}

		// Create ticket record
		ticket := models.SessionTicket{
			SessionID:           uint(sessionID),
			UserID:              recipientUserID,
			HostID:              session.HostID,
			PaymentMethod:       req.PaymentMethod,
			TicketPriceTokens:   ticketPriceTokens,
			TicketPriceCurrency: ticketPriceCurrency,
			TicketPriceAmount:   ticketPriceAmount,
			IsEarlyBird:         isEarlyBird,
			TransactionID:       transactionID,
			GatewayEarningID:    gatewayEarningID,
			IsGift:              isGift,
			IsRefunded:          false,
		}

		if isGift {
			ticket.GiftedByUserID = &buyer.ID
		}

		if err := tx.Create(&ticket).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ Error creating ticket: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create ticket"})
			return
		}

		// ✅ Update session earnings counters
		if err := tx.Model(&session).Updates(map[string]interface{}{
			"total_tickets_sold":   gorm.Expr("total_tickets_sold + ?", 1),
			"total_ticket_revenue": gorm.Expr("total_ticket_revenue + ?", ticketPriceTokens),
		}).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ Error updating session earnings: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update earnings"})
			return
		}
		log.Printf("📊 Updated session %d earnings: +1 ticket, +%d cents revenue", sessionID, ticketPriceTokens)

		// Commit transaction
		if err := tx.Commit().Error; err != nil {
			log.Printf("❌ Error committing transaction: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to complete purchase"})
			return
		}

		log.Printf("✅ Ticket purchased: Session %d, User %d, Payment: %s, IsGift: %v", sessionID, recipientUserID, req.PaymentMethod, isGift)

		// TODO: Send WebSocket notification to session participants

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"ticket":  ticket,
			"message": func() string {
				if isGift {
					return "Ticket gifted successfully"
				}
				return "Ticket purchased successfully"
			}(),
		})
	}
}

// GetSessionTicketsHandler retrieves all tickets for a session (host only)
// GET /api/sessions/:id/tickets
func GetSessionTicketsHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		sessionIDStr := c.Param("id")
		sessionID, err := strconv.ParseUint(sessionIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
			return
		}

		// Get authenticated user ID from context
		userIDInterface, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		userID := userIDInterface.(uint)

		// Get session and verify host
		var session models.WatchSession
		if err := db.First(&session, sessionID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}

		if session.HostID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Only session host can view tickets"})
			return
		}

		// Get all tickets for session
		var tickets []models.SessionTicket
		if err := db.Preload("User").Preload("GiftedBy").
			Where("session_id = ?", sessionID).
			Order("created_at ASC").
			Find(&tickets).Error; err != nil {
			log.Printf("❌ Error fetching tickets: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch tickets"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"tickets": tickets,
			"count":   len(tickets),
		})
	}
}

// GetUserTicketHandler checks if user has a ticket for a session
// GET /api/sessions/:id/tickets/me
func GetUserTicketHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		sessionIDStr := c.Param("id")
		sessionID, err := strconv.ParseUint(sessionIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
			return
		}

		// Get authenticated user ID from context
		userIDInterface, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		userID := userIDInterface.(uint)

		// Check if user has ticket
		var ticket models.SessionTicket
		result := db.Preload("GiftedBy").
			Where("session_id = ? AND user_id = ?", sessionID, userID).
			First(&ticket)

		if result.Error == gorm.ErrRecordNotFound {
			c.JSON(http.StatusOK, gin.H{
				"has_ticket": false,
				"ticket":     nil,
			})
			return
		} else if result.Error != nil {
			log.Printf("❌ Error checking ticket: %v", result.Error)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check ticket"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"has_ticket": true,
			"ticket":     ticket,
		})
	}
}
