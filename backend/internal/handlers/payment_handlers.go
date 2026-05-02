// WeWatch/backend/internal/handlers/payment_handlers.go
package handlers

import (
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
)

// GetUserWalletHandler retrieves a user's token wallet balance
// GET /api/wallet/:userId
func GetUserWalletHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDStr := c.Param("userId")
		userID, err := strconv.ParseUint(userIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
			return
		}

		// Get authenticated user from context
		authUser, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		authenticatedUserID := authUser.(*models.User).ID

		// Users can only view their own wallet
		if uint(userID) != authenticatedUserID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Cannot view other users' wallets"})
			return
		}

		// Get or create wallet
		var wallet models.UserWallet
		result := db.Where("user_id = ?", userID).First(&wallet)
		if result.Error == gorm.ErrRecordNotFound {
			// Create wallet if doesn't exist
			wallet = models.UserWallet{
				UserID:         uint(userID),
				TokenBalance:   0,
				LifetimeEarned: 0,
				LifetimeSpent:  0,
			}
			if err := db.Create(&wallet).Error; err != nil {
				log.Printf("❌ Error creating wallet for user %d: %v", userID, err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create wallet"})
				return
			}
		} else if result.Error != nil {
			log.Printf("❌ Error fetching wallet for user %d: %v", userID, result.Error)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch wallet"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"wallet":    wallet,
			"usd_value": float64(wallet.TokenBalance) * 0.10,
		})
	}
}

// GetWalletTransactionsHandler retrieves transaction history for a user
// GET /api/wallet/:userId/transactions?limit=50&offset=0
func GetWalletTransactionsHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDStr := c.Param("userId")
		userID, err := strconv.ParseUint(userIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
			return
		}

		// Get authenticated user
		authUser, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		authenticatedUserID := authUser.(*models.User).ID

		// Users can only view their own transactions
		if uint(userID) != authenticatedUserID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Cannot view other users' transactions"})
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

		// Get transactions
		var transactions []models.TokenTransaction
		if err := db.Where("user_id = ?", userID).
			Order("created_at DESC").
			Limit(limit).
			Offset(offset).
			Find(&transactions).Error; err != nil {
			log.Printf("❌ Error fetching transactions for user %d: %v", userID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch transactions"})
			return
		}

		// Get total count
		var totalCount int64
		db.Model(&models.TokenTransaction{}).Where("user_id = ?", userID).Count(&totalCount)

		c.JSON(http.StatusOK, gin.H{
			"transactions": transactions,
			"pagination": gin.H{
				"limit":  limit,
				"offset": offset,
				"total":  totalCount,
			},
		})
	}
}

// PurchaseTokensRequest represents a token purchase request
type PurchaseTokensRequest struct {
	Amount        int    `json:"amount" binding:"required,min=10,max=10000"` // Min 10, max 10,000 tokens
	PaymentMethod string `json:"payment_method" binding:"required,oneof=stripe paystack"`
	PaymentToken  string `json:"payment_token" binding:"required"` // Stripe/Paystack token
	Currency      string `json:"currency" binding:"required,oneof=USD NGN GHS KES"`
}

// PurchaseTokensHandler handles token purchases via Stripe/Paystack
// POST /api/tokens/purchase
func PurchaseTokensHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get authenticated user
		authUser, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		user := authUser.(*models.User)

		var req PurchaseTokensRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Calculate amount in USD
		usdAmount := float64(req.Amount) * 0.10

		// TODO: Integrate with Stripe/Paystack payment processing
		// For now, we'll create a pending transaction
		log.Printf("💰 User %d purchasing %d tokens for $%.2f via %s", user.ID, req.Amount, usdAmount, req.PaymentMethod)

		// Create transaction record
		transaction := models.TokenTransaction{
			UserID:          user.ID,
			TransactionType: models.TransactionTypePurchase,
			Amount:          req.Amount,
			USDValue:        &usdAmount,
			PaymentMethod:   &req.PaymentMethod,
			PaymentID:       &req.PaymentToken,
			Status:          models.TransactionStatusPending,
		}

		if err := db.Create(&transaction).Error; err != nil {
			log.Printf("❌ Error creating transaction: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create transaction"})
			return
		}

		// TODO: Process payment with Stripe/Paystack
		// On success, update transaction status and credit wallet
		// For now, we'll simulate success
		transaction.Status = models.TransactionStatusCompleted

		// 🎯 AUTO-SPLIT PAYMENT: 75% to reserve, 25% to revenue
		var splitResult *utils.SplitPaymentResult
		var splitErr error
		
		if req.PaymentMethod == "stripe" {
			log.Printf("💳 Splitting Stripe payment: $%.2f (75%% reserve, 25%% revenue)", usdAmount)
			splitResult, splitErr = utils.AccountManager.SplitStripePayment(usdAmount, "usd", fmt.Sprintf("Token purchase by user %d", user.ID))
		} else if req.PaymentMethod == "paystack" {
			log.Printf("💳 Splitting Paystack payment: ₦%.2f (75%% reserve, 25%% revenue)", usdAmount*1000) // Assuming ₦1000/$1
			splitResult, splitErr = utils.AccountManager.SplitPaystackPayment(usdAmount*1000, "NGN", fmt.Sprintf("Token purchase by user %d", user.ID))
		}
		
		if splitErr != nil {
			log.Printf("⚠️  Payment split failed: %v (continuing anyway for MVP)", splitErr)
			// Don't fail the purchase, just log the error for now
		} else if splitResult != nil {
			log.Printf("✅ Payment split successful:")
			log.Printf("   - Revenue account (25%%): $%.2f (ID: %s)", splitResult.RevenueAmount, splitResult.RevenueTransferID)
			log.Printf("   - Reserve account (75%%): $%.2f (ID: %s)", splitResult.ReserveAmount, splitResult.ReserveTransferID)
			
			// 📝 Store both transfer IDs for audit trail
			transaction.RevenueTransferID = &splitResult.RevenueTransferID
			transaction.ReserveTransferID = &splitResult.ReserveTransferID
		}

		// Update wallet
		var wallet models.UserWallet
		result := db.Where("user_id = ?", user.ID).First(&wallet)
		if result.Error == gorm.ErrRecordNotFound {
			wallet = models.UserWallet{
				UserID:         user.ID,
				TokenBalance:   0,
				LifetimeEarned: 0,
				LifetimeSpent:  0,
			}
			db.Create(&wallet)
		}

		wallet.AddTokens(req.Amount)
		if err := db.Save(&wallet).Error; err != nil {
			log.Printf("❌ Error updating wallet: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update wallet"})
			return
		}

		// Update transaction status
		db.Save(&transaction)
		
		// 📊 Update platform accounting with proper NET calculation
		accounting, err := models.GetPlatformAccounting(db)
		if err == nil {
			// Assume payment gateway takes ~1.5% fee (Paystack/Stripe typical rate)
			grossAmount := usdAmount
			gatewayFeePercent := 0.015
			gatewayFee := grossAmount * gatewayFeePercent
			netAmount := grossAmount - gatewayFee
			
			// Add purchase with fee breakdown
			accounting.AddTokenPurchaseWithFee(grossAmount, netAmount, gatewayFee)
			db.Save(accounting)
			log.Printf("📊 Platform accounting updated: TotalRevenue=%.2f (NET), Profit=%.2f (25%%), Reserve=%.2f (75%%), GatewayFee=%.2f", 
				accounting.TotalPlatformRevenue, accounting.PlatformProfit, accounting.HostReserveBalance, gatewayFee)
		}

		log.Printf("✅ Token purchase successful: User %d bought %d tokens", user.ID, req.Amount)

		c.JSON(http.StatusOK, gin.H{
			"success":     true,
			"transaction": transaction,
			"wallet":      wallet,
			"message":     "Token purchase successful",
		})
	}
}

// GetUserEarningsHandler retrieves host earnings data for dashboard
// GET /api/earnings/:userId?timeframe=all-time
func GetUserEarningsHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDStr := c.Param("userId")
		userID, err := strconv.ParseUint(userIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
			return
		}

		// Get authenticated user
		authUser, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		authenticatedUserID := authUser.(*models.User).ID

		// Users can only view their own earnings
		if uint(userID) != authenticatedUserID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Cannot view other users' earnings"})
			return
		}

		timeframe := c.DefaultQuery("timeframe", "all-time")

		// Calculate time range
		var startTime time.Time
		now := time.Now()
		switch timeframe {
		case "weekly":
			startTime = now.AddDate(0, 0, -7)
		case "monthly":
			startTime = now.AddDate(0, -1, 0)
		case "all-time":
			startTime = time.Time{} // Zero time (beginning of time)
		default:
			startTime = time.Time{}
		}

		// Get wallet balance
		var wallet models.UserWallet
		db.Where("user_id = ?", userID).First(&wallet)

		// Get token earnings from tickets
		var tokenTicketEarnings int64
		query := db.Model(&models.SessionTicket{}).
			Where("host_id = ? AND payment_method = ? AND is_refunded = ?", userID, "tokens", false)
		if !startTime.IsZero() {
			query = query.Where("created_at >= ?", startTime)
		}
		query.Select("COALESCE(SUM(ticket_price_tokens), 0)").Scan(&tokenTicketEarnings)

		// Get token earnings from donations
		var tokenDonationEarnings int64
		donationQuery := db.Model(&models.Donation{}).
			Where("host_id = ? AND payment_method = ?", userID, "tokens")
		if !startTime.IsZero() {
			donationQuery = donationQuery.Where("created_at >= ?", startTime)
		}
		donationQuery.Select("COALESCE(SUM(amount_tokens), 0)").Scan(&tokenDonationEarnings)

		// Get gateway earnings
		type GatewayEarningSummary struct {
			Currency   string
			TotalGross float64
			TotalNet   float64
		}
		var gatewayEarnings []GatewayEarningSummary
		gatewayQuery := db.Model(&models.GatewayEarning{}).
			Where("host_id = ?", userID)
		if !startTime.IsZero() {
			gatewayQuery = gatewayQuery.Where("created_at >= ?", startTime)
		}
		gatewayQuery.Select("currency, SUM(gross_amount) as total_gross, SUM(net_amount) as total_net").
			Group("currency").
			Scan(&gatewayEarnings)

		// Get session analytics
		var totalSessions int64
		var totalTicketsSold int64

		sessionQuery := db.Model(&models.WatchSession{}).
			Where("host_id = ?", userID)
		if !startTime.IsZero() {
			sessionQuery = sessionQuery.Where("started_at >= ?", startTime)
		}
		sessionQuery.Count(&totalSessions)

		ticketQuery := db.Model(&models.SessionTicket{}).
			Where("host_id = ? AND is_refunded = ?", userID, false)
		if !startTime.IsZero() {
			ticketQuery = ticketQuery.Where("created_at >= ?", startTime)
		}
		ticketQuery.Count(&totalTicketsSold)

		// Get average ticket price (in tokens)
		var avgTicketPrice float64
		if totalTicketsSold > 0 {
			db.Model(&models.SessionTicket{}).
				Where("host_id = ? AND is_refunded = ? AND payment_method = ?", userID, false, "tokens").
				Select("AVG(ticket_price_tokens)").
				Scan(&avgTicketPrice)
		}

		c.JSON(http.StatusOK, gin.H{
			"timeframe": timeframe,
			"wallet": gin.H{
				"token_balance":   wallet.TokenBalance,
				"lifetime_earned": wallet.LifetimeEarned,
				"lifetime_spent":  wallet.LifetimeSpent,
			},
			"token_earnings": gin.H{
				"tickets":   tokenTicketEarnings,
				"donations": tokenDonationEarnings,
				"total":     tokenTicketEarnings + tokenDonationEarnings,
			},
			"gateway_earnings": gatewayEarnings,
			"analytics": gin.H{
				"total_sessions":     totalSessions,
				"total_tickets_sold": totalTicketsSold,
				"avg_ticket_price":   avgTicketPrice,
			},
		})
	}
}
