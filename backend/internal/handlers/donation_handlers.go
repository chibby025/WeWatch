// WeWatch/backend/internal/handlers/donation_handlers.go
package handlers

import (
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// DonationRequest represents a donation request
type DonationRequest struct {
	AmountTokens  int     `json:"amount_tokens" binding:"required,min=1"`
	PaymentMethod string  `json:"payment_method" binding:"required,oneof=tokens paystack stripe"`
	PaymentToken  *string `json:"payment_token"` // Required for paystack/stripe
	Message       *string `json:"message"`       // Optional message
	IsAnonymous   bool    `json:"is_anonymous"`  // Always false per spec, but keeping for flexibility
}

// DonateToSessionHandler handles donations during a watch session
// POST /api/sessions/:id/donate
func DonateToSessionHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		sessionIDStr := c.Param("id")
		sessionID, err := strconv.ParseUint(sessionIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
			return
		}

		// Get authenticated user
		authUser, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		donor := authUser.(*models.User)

		var req DonationRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate minimum donation (1 token)
		if req.AmountTokens < 1 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Minimum donation is 1 token"})
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

		// Prevent donating to own session
		if session.HostID == donor.ID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot donate to your own session"})
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
			// Deduct tokens from donor's wallet
			var donorWallet models.UserWallet
			if err := tx.Where("user_id = ?", donor.ID).First(&donorWallet).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch wallet"})
				return
			}

			if err := donorWallet.DeductTokens(req.AmountTokens); err != nil {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			if err := tx.Save(&donorWallet).Error; err != nil {
				tx.Rollback()
				log.Printf("❌ Error updating donor wallet: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process payment"})
				return
			}

			// Create transaction record
			usdValue := float64(req.AmountTokens) * 0.10
			transaction := models.TokenTransaction{
				UserID:          donor.ID,
				SessionID:       &session.ID,
				TransactionType: models.TransactionTypeDonation,
				Amount:          req.AmountTokens,
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

			// Credit host wallet with 95% (platform keeps 5% as transfer fee)
			// AmountTokens is in cents (100 = 1.00 token)
			hostEarning := int(float64(req.AmountTokens) * 0.95)
			platformCommission := req.AmountTokens - hostEarning  // 5% fee in cents

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

			// 📊 Update platform accounting: Record 5% commission from donation
			// Commission stays as token cents and reduces reserve backing
			accounting, accErr := models.GetPlatformAccounting(tx)
			if accErr == nil {
				// Record the 5% commission (in cents)
				accounting.RecordTokenDonationCommission(float64(platformCommission))
				if saveErr := tx.Save(accounting).Error; saveErr != nil {
					log.Printf("⚠️ Failed to update platform accounting: %v", saveErr)
					// Don't fail transaction, just log
				} else {
					log.Printf("📊 Platform accounting updated: Donation commission %d cents (5%% fee)", platformCommission)
				}
			}

			log.Printf("✅ Token donation: %d cents from user %d → Host gets %d cents (95%%), Platform keeps %d cents (5%% fee)", 
				req.AmountTokens, donor.ID, hostEarning, platformCommission)

		} else {
			// Gateway payment (Stripe/Paystack)
			// Calculate USD equivalent (1 token = $0.10)
			amountUSD := float64(req.AmountTokens) * 0.10

			// TODO: Process payment with gateway API
			log.Printf("💳 Processing %s donation: $%.2f USD", req.PaymentMethod, amountUSD)

			// Calculate commission (15%)
			grossAmount := amountUSD
			commission := grossAmount * 0.15
			netAmount := grossAmount - commission

			// Create gateway earning record
			gatewayEarning := models.GatewayEarning{
				HostID:             session.HostID,
				SessionID:          &session.ID,
				PaymentGateway:     req.PaymentMethod,
				Currency:           "USD", // Gateway donations always in USD
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

			log.Printf("✅ Gateway donation recorded: Gross=%.2f, Commission=%.2f, Net=%.2f USD", grossAmount, commission, netAmount)
		}

		// Create donation record
		donation := models.Donation{
			SessionID:        uint(sessionID),
			DonorID:          &donor.ID,
			HostID:           session.HostID,
			AmountTokens:     req.AmountTokens,
			PaymentMethod:    req.PaymentMethod,
			Message:          req.Message,
			IsAnonymous:      req.IsAnonymous, // Always false per spec
			TransactionID:    transactionID,
			GatewayEarningID: gatewayEarningID,
		}

		if err := tx.Create(&donation).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ Error creating donation: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create donation"})
			return
		}

		// Commit transaction
		if err := tx.Commit().Error; err != nil {
			log.Printf("❌ Error committing transaction: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to complete donation"})
			return
		}

		log.Printf("✅ Donation created: Session %d, Donor %d, Amount %d tokens", sessionID, donor.ID, req.AmountTokens)

		// 📡 Broadcast donation notification to room via WebSocket
		hub := GetHub()
		if hub != nil && session.RoomID != 0 {
			hub.BroadcastJSON(session.RoomID, map[string]interface{}{
				"type": "donation_notification",
				"data": map[string]interface{}{
					"donor_id":           donor.ID,
					"donor_username":     donor.Username,
					"recipient_id":       session.HostID,
					"recipient_username": session.Host.Username,
					"amount_tokens":      req.AmountTokens,
					"is_host_donation":   true,
					"session_id":         sessionID,
				},
			})
			log.Printf("📡 Broadcasted donation notification to room %d", session.RoomID)
		}

		c.JSON(http.StatusOK, gin.H{
			"success":  true,
			"donation": donation,
			"message":  "Donation sent successfully",
		})
	}
}

// GetSessionDonationsHandler retrieves all donations for a session
// GET /api/sessions/:id/donations?limit=50&offset=0
func GetSessionDonationsHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		sessionIDStr := c.Param("id")
		sessionID, err := strconv.ParseUint(sessionIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
			return
		}

		// Parse pagination parameters
		limit := 50
		if limitStr := c.Query("limit"); limitStr != "" {
			if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 && parsedLimit <= 100 {
				limit = parsedLimit
			}
		}

		offset := 0
		if offsetStr := c.Query("offset"); offsetStr != "" {
			if parsedOffset, err := strconv.Atoi(offsetStr); err == nil && parsedOffset >= 0 {
				offset = parsedOffset
			}
		}

		// Get donations
		var donations []models.Donation
		if err := db.Preload("Donor").
			Where("session_id = ?", sessionID).
			Order("created_at DESC").
			Limit(limit).
			Offset(offset).
			Find(&donations).Error; err != nil {
			log.Printf("❌ Error fetching donations: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch donations"})
			return
		}

		// Get total count
		var totalCount int64
		db.Model(&models.Donation{}).Where("session_id = ?", sessionID).Count(&totalCount)

		// Calculate total amount
		var totalAmount int64
		db.Model(&models.Donation{}).
			Where("session_id = ?", sessionID).
			Select("COALESCE(SUM(amount_tokens), 0)").
			Scan(&totalAmount)

		c.JSON(http.StatusOK, gin.H{
			"donations":    donations,
			"total_amount": totalAmount,
			"pagination": gin.H{
				"limit":  limit,
				"offset": offset,
				"total":  totalCount,
			},
		})
	}
}

// GetSessionTopDonorsHandler retrieves top donors leaderboard for a session
// GET /api/sessions/:id/top-donors?limit=10
func GetSessionTopDonorsHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		sessionIDStr := c.Param("id")
		sessionID, err := strconv.ParseUint(sessionIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
			return
		}

		// Parse limit parameter
		limit := 10
		if limitStr := c.Query("limit"); limitStr != "" {
			if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 && parsedLimit <= 50 {
				limit = parsedLimit
			}
		}

		// Get top donors
		type TopDonor struct {
			DonorID       uint   `json:"donor_id"`
			Username      string `json:"username"`
			AvatarURL     string `json:"avatar_url"`
			TotalDonated  int64  `json:"total_donated"`
			DonationCount int64  `json:"donation_count"`
		}

		var topDonors []TopDonor
		if err := db.Table("donations").
			Select("donations.donor_id, users.username, users.avatar_url, SUM(donations.amount_tokens) as total_donated, COUNT(*) as donation_count").
			Joins("LEFT JOIN users ON users.id = donations.donor_id").
			Where("donations.session_id = ? AND donations.donor_id IS NOT NULL", sessionID).
			Group("donations.donor_id, users.username, users.avatar_url").
			Order("total_donated DESC").
			Limit(limit).
			Scan(&topDonors).Error; err != nil {
			log.Printf("❌ Error fetching top donors: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch top donors"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"top_donors": topDonors,
		})
	}
}

// GiftTokensRequest represents a wallet-to-wallet gift request
type GiftTokensRequest struct {
	RecipientID  uint `json:"recipient_id" binding:"required"`
	AmountTokens int  `json:"amount_tokens" binding:"required,min=1"`
}

// GiftTokensHandler handles wallet-to-wallet token gifts (5% platform commission)
// POST /api/donations/gift
func GiftTokensHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get authenticated user ID from middleware
		userID, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		
		// Fetch full user object
		var donor models.User
		if err := db.First(&donor, userID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
			return
		}

		var req GiftTokensRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate minimum gift (1 token)
		if req.AmountTokens < 1 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Minimum gift is 1 token"})
			return
		}

		// Prevent self-gifting
		if req.RecipientID == donor.ID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot send tokens to yourself"})
			return
		}

		// Verify recipient exists
		var recipient models.User
		if err := db.First(&recipient, req.RecipientID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "Recipient not found"})
			} else {
				log.Printf("❌ Error fetching recipient: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch recipient"})
			}
			return
		}

		// Verify both users share at least one room
		var sharedRoomCount int64
		db.Table("user_rooms as ur1").
			Joins("INNER JOIN user_rooms as ur2 ON ur1.room_id = ur2.room_id").
			Where("ur1.user_id = ? AND ur2.user_id = ?", donor.ID, req.RecipientID).
			Count(&sharedRoomCount)

		if sharedRoomCount == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "You can only gift tokens to members of your rooms"})
			return
		}

		// Start transaction
		tx := db.Begin()
		defer func() {
			if r := recover(); r != nil {
				tx.Rollback()
			}
		}()

		// Deduct tokens from donor's wallet
		var donorWallet models.UserWallet
		if err := tx.Where("user_id = ?", donor.ID).First(&donorWallet).Error; err != nil {
			tx.Rollback()
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Wallet not found"})
			} else {
				log.Printf("❌ Error fetching donor wallet: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch wallet"})
			}
			return
		}

		if err := donorWallet.DeductTokens(req.AmountTokens); err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if err := tx.Save(&donorWallet).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ Error updating donor wallet: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process payment"})
			return
		}

		// Calculate 5% platform commission, 95% to recipient
		// Use proper rounding to avoid 0 amounts for small gifts
		recipientAmount := int(float64(req.AmountTokens) * 0.95 + 0.5) // Round to nearest int
		if recipientAmount < 1 {
			recipientAmount = 1 // Minimum 1 token to recipient
		}
		platformCommission := req.AmountTokens - recipientAmount

		// Credit recipient wallet
		var recipientWallet models.UserWallet
		result := tx.Where("user_id = ?", req.RecipientID).First(&recipientWallet)
		if result.Error == gorm.ErrRecordNotFound {
			// Create wallet if it doesn't exist
			recipientWallet = models.UserWallet{
				UserID:         req.RecipientID,
				TokenBalance:   0,
				LifetimeEarned: 0,
				LifetimeSpent:  0,
			}
			tx.Create(&recipientWallet)
		}

		recipientWallet.AddTokens(recipientAmount)
		if err := tx.Save(&recipientWallet).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ Error updating recipient wallet: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to credit recipient"})
			return
		}

		// Create transaction record for donor (debit)
		usdValue := float64(req.AmountTokens) * 0.10
		donorTransaction := models.TokenTransaction{
			UserID:          donor.ID,
			TransactionType: models.TransactionTypeGiftSent,
			Amount:          req.AmountTokens, // Store as positive, TransactionType indicates debit
			USDValue:        &usdValue,
			Status:          models.TransactionStatusCompleted,
		}
		if err := tx.Create(&donorTransaction).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ Error creating donor transaction: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create transaction"})
			return
		}

		// Create transaction record for recipient (credit)
		recipientUsdValue := float64(recipientAmount) * 0.10
		recipientTransaction := models.TokenTransaction{
			UserID:          req.RecipientID,
			TransactionType: models.TransactionTypeGiftReceived,
			Amount:          recipientAmount, // Positive for credit
			USDValue:        &recipientUsdValue,
			Status:          models.TransactionStatusCompleted,
		}
		if err := tx.Create(&recipientTransaction).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ Error creating recipient transaction: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create transaction"})
			return
		}

		// Update platform accounting: 5% commission from gift
		accounting, accErr := models.GetPlatformAccounting(tx)
		if accErr == nil {
			// Record commission in cents (will be converted to naira in accounting model)
			accounting.RecordTokenDonationCommission(float64(platformCommission))
			
			if saveErr := tx.Save(accounting).Error; saveErr != nil {
				log.Printf("⚠️ Failed to update platform accounting: %v", saveErr)
				// Don't fail transaction, just log
			} else {
				log.Printf("📊 Platform accounting updated: Token gift commission %d cents (5%%)", platformCommission)
			}
		}

		// Commit transaction
		if err := tx.Commit().Error; err != nil {
			log.Printf("❌ Error committing transaction: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to complete gift"})
			return
		}

		log.Printf("🎁 Token gift: %d tokens from user %d → %d (recipient gets %d tokens (95%%), platform keeps %d tokens (5%%))",
			req.AmountTokens, donor.ID, req.RecipientID, recipientAmount, platformCommission)

		// 📡 Broadcast gift notification to all rooms where both users are members
		var sharedRooms []uint
		db.Table("user_rooms as ur1").
			Select("ur1.room_id").
			Joins("INNER JOIN user_rooms as ur2 ON ur1.room_id = ur2.room_id").
			Where("ur1.user_id = ? AND ur2.user_id = ?", donor.ID, req.RecipientID).
			Pluck("room_id", &sharedRooms)

		for _, roomID := range sharedRooms {
			hub := GetHub()
			if hub != nil {
				hub.BroadcastJSON(roomID, map[string]interface{}{
					"type": "donation_notification",
					"data": map[string]interface{}{
						"donor_id":           donor.ID,
						"donor_username":     donor.Username,
						"recipient_id":       req.RecipientID,
						"recipient_username": recipient.Username,
						"amount_tokens":      req.AmountTokens,
						"is_host_donation":   false,
					},
				})
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Gift sent successfully",
			"donor_balance": gin.H{
				"token_balance":    donorWallet.TokenBalance,
				"lifetime_earned":  donorWallet.LifetimeEarned,
				"lifetime_spent":   donorWallet.LifetimeSpent,
			},
			"gift_details": gin.H{
				"amount_sent":        req.AmountTokens,
				"amount_received":    recipientAmount,
				"platform_fee":       platformCommission,
				"recipient_username": recipient.Username,
			},
		})
	}
}

// GetTopDonorsHandler retrieves global top donors across all donations
// GET /api/donations/top-donors?limit=20
func GetTopDonorsHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Parse limit parameter
		limit := 20
		if limitStr := c.Query("limit"); limitStr != "" {
			if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 && parsedLimit <= 100 {
				limit = parsedLimit
			}
		}

		// Get top donors across all sessions
		type TopDonor struct {
			DonorID       uint   `json:"donor_id"`
			Username      string `json:"username"`
			AvatarURL     string `json:"avatar_url"`
			TotalDonated  int64  `json:"total_donated"`
			DonationCount int64  `json:"donation_count"`
			SessionCount  int64  `json:"session_count"`
		}

		var topDonors []TopDonor
		if err := db.Table("donations").
			Select("donations.donor_id, users.username, users.avatar_url, SUM(donations.amount_tokens) as total_donated, COUNT(*) as donation_count, COUNT(DISTINCT donations.session_id) as session_count").
			Joins("LEFT JOIN users ON users.id = donations.donor_id").
			Where("donations.donor_id IS NOT NULL").
			Group("donations.donor_id, users.username, users.avatar_url").
			Order("total_donated DESC").
			Limit(limit).
			Scan(&topDonors).Error; err != nil {
			log.Printf("❌ Error fetching global top donors: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch top donors"})
			return
		}

		// Get total donation statistics
		var totalStats struct {
			TotalDonated  int64 `json:"total_donated"`
			TotalDonors   int64 `json:"total_donors"`
			TotalSessions int64 `json:"total_sessions"`
		}
		db.Table("donations").
			Select("SUM(amount_tokens) as total_donated, COUNT(DISTINCT donor_id) as total_donors, COUNT(DISTINCT session_id) as total_sessions").
			Where("donor_id IS NOT NULL").
			Scan(&totalStats)

		c.JSON(http.StatusOK, gin.H{
			"top_donors": topDonors,
			"statistics": gin.H{
				"total_donated_tokens": totalStats.TotalDonated,
				"total_donors":         totalStats.TotalDonors,
				"total_sessions":       totalStats.TotalSessions,
			},
		})
	}
}
