// WeWatch/backend/internal/handlers/wallet_handlers.go
package handlers

import (
	"net/http"
	"log"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
)

// GetMyWallet returns the authenticated user's wallet
// GET /api/wallets/me
func GetMyWallet(c *gin.Context) {
	// Get authenticated user ID from context
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDInterface.(uint)

	// Get database connection from context
	db := c.MustGet("db").(*gorm.DB)

	// Fetch wallet for this user
	var wallet models.UserWallet
	if err := db.Where("user_id = ?", userID).First(&wallet).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			// Wallet doesn't exist - create one
			wallet = models.UserWallet{
				UserID:         userID,
				TokenBalance:   0,
				LifetimeEarned: 0,
				LifetimeSpent:  0,
			}
			if err := db.Create(&wallet).Error; err != nil {
				log.Printf("Error creating wallet for user %d: %v", userID, err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create wallet"})
				return
			}
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch wallet"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"wallet":              wallet,
		"token_balance_display": wallet.GetTokensAsFloat(),
	})
}

// WalletPurchaseRequest represents a request to purchase tokens for wallet
type WalletPurchaseRequest struct {
	Amount        int    `json:"amount" binding:"required,min=1"`          // Amount in NGN
	PaymentMethod string `json:"payment_method" binding:"required"`        // 'paystack' or 'stripe'
	PaymentID     string `json:"payment_id" binding:"required"`            // Payment reference from gateway
	Currency      string `json:"currency" binding:"required,oneof=NGN USD"` // Currency used
}

// PurchaseTokens handles token purchases via payment gateway
// POST /api/wallets/purchase-tokens
func PurchaseTokens(c *gin.Context) {
	// Get authenticated user ID from context
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDInterface.(uint)

	// Parse request body
	var req WalletPurchaseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get database connection from context
	db := c.MustGet("db").(*gorm.DB)

	// Verify payment with gateway (Paystack or Stripe)
	var usdValue float64
	var tokensToAdd int

	if req.PaymentMethod == "paystack" {
		// Verify Paystack payment
		verified, amount, err := verifyPaystackPayment(req.PaymentID)
		if err != nil || !verified {
			log.Printf("Paystack verification failed for payment %s: %v", req.PaymentID, err)
			c.JSON(http.StatusBadRequest, gin.H{"error": "Payment verification failed"})
			return
		}

		// Calculate tokens for NGN
		// TOKEN PRICING: ₦165 = 1 token (stored as actual tokens, not units)
		// Example: ₦200 = 200 / 165 = 1.21 tokens
		// We store tokens * 100 to avoid decimals: 1.21 → 121 (represents 1.21 tokens)
		tokensInCents := int((amount * 100.0) / 165.0) // Store as cents (121 = 1.21 tokens)
		tokensToAdd = tokensInCents // Store the integer representation
		usdValue = float64(amount) / 165.0

		if tokensInCents < 100 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Minimum purchase is ₦165 (1 token)"})
			return
		}
	} else if req.PaymentMethod == "stripe" {
		// For future Stripe implementation
		c.JSON(http.StatusNotImplemented, gin.H{"error": "Stripe payments not yet supported for token purchases"})
		return
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payment method"})
		return
	}

	// Start database transaction
	err := db.Transaction(func(tx *gorm.DB) error {
		// Get or create user wallet
		var wallet models.UserWallet
		if err := tx.Where("user_id = ?", userID).First(&wallet).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				wallet = models.UserWallet{
					UserID:         userID,
					TokenBalance:   0,
					LifetimeEarned: 0,
					LifetimeSpent:  0,
				}
				if err := tx.Create(&wallet).Error; err != nil {
					return err
				}
			} else {
				return err
			}
		}

		// Add tokens to wallet
		wallet.AddTokens(tokensToAdd)
		if err := tx.Save(&wallet).Error; err != nil {
			return err
		}

		// Create transaction record
		transaction := models.TokenTransaction{
			UserID:          userID,
			TransactionType: models.TransactionTypePurchase,
			Amount:          tokensToAdd,
			USDValue:        &usdValue,
			PaymentMethod:   &req.PaymentMethod,
			PaymentID:       &req.PaymentID,
			Status:          models.TransactionStatusCompleted,
			Metadata: map[string]interface{}{
				"currency":  req.Currency,
				"ngn_amount": req.Amount,
			},
		}
		if err := tx.Create(&transaction).Error; err != nil {
			return err
		}

		// 💰 Create GatewayEarning for revenue tracking
		// For token purchases, platform gets 15%, reserve gets 85%
		// Note: We set HostID to system user (1) since token purchases aren't tied to specific hosts
		grossAmount := float64(req.Amount)
		platformCommission := grossAmount * 0.25
		netAmount := grossAmount * 0.75
		
		earning := models.GatewayEarning{
			HostID:             1, // System/Platform user ID for token purchases
			PaymentGateway:     req.PaymentMethod,
			Currency:           req.Currency,
			GrossAmount:        grossAmount,
			PlatformCommission: platformCommission,
			NetAmount:          netAmount,
			PaymentID:          req.PaymentID,
			IsWithdrawn:        false,
		}
		if err := tx.Create(&earning).Error; err != nil {
			return err
		}

		log.Printf("💰 User %d purchased %d tokens (%.2f tokens) for ₦%d via %s", 
			userID, tokensToAdd, float64(tokensToAdd)/100.0, req.Amount, req.PaymentMethod)
		log.Printf("   💵 Revenue split: Platform ₦%.2f (15%%), Reserve ₦%.2f (85%%)", 
			platformCommission, netAmount)
		
		// ✅ AUTOMATIC SPLIT: Payment split handled by Paystack Split Code (SPL_CcDDM4qs7n)
		// Money goes directly: 85% → Reserve subaccount, 15% → Revenue subaccount
		// No transfer fees! No additional API calls needed!
		if req.PaymentMethod == "paystack" {
			log.Printf("✅ Paystack split payment: ₦%.2f automatically split via SPL_CcDDM4qs7n", grossAmount)
			log.Printf("   → Revenue account receives: ₦%.2f (15%%)", platformCommission)
			log.Printf("   → Reserve account receives: ₦%.2f (85%%)", netAmount)
		}

		return nil
	})

	if err != nil {
		log.Printf("Error processing token purchase: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process token purchase"})
		return
	}

	// 📊 Update platform accounting with proper NET calculation
	accounting, accErr := models.GetPlatformAccounting(db)
	if accErr == nil {
		// Calculate gateway fee (1.5% of gross)
		purchaseGross := float64(req.Amount)
		gatewayFeePercent := 0.015
		gatewayFee := purchaseGross * gatewayFeePercent
		netAfterFee := purchaseGross - gatewayFee
		
		// Add purchase with fee breakdown
		accounting.AddTokenPurchaseWithFee(purchaseGross, netAfterFee, gatewayFee)
		db.Save(accounting)
		log.Printf("📊 Platform accounting updated: TotalRevenue=%.2f (NET), Profit=%.2f (15%%), Reserve=%.2f (85%%), GatewayFee=%.2f", 
			accounting.TotalPlatformRevenue, accounting.PlatformProfit, accounting.HostReserveBalance, gatewayFee)
	} else {
		log.Printf("⚠️  Failed to update platform accounting: %v", accErr)
	}

	// Fetch updated wallet
	var wallet models.UserWallet
	db.Where("user_id = ?", userID).First(&wallet)

	c.JSON(http.StatusOK, gin.H{
		"message":              "Tokens purchased successfully",
		"tokens_added":         float64(tokensToAdd) / 100.0,
		"new_balance":          wallet.TokenBalance,
		"new_balance_display":  wallet.GetTokensAsFloat(),
	})
}

// verifyPaystackPayment verifies a Paystack payment transaction
func verifyPaystackPayment(reference string) (bool, float64, error) {
	secretKey := utils.GetPaystackRevenueSecretKey()
	
	verified, amountInKobo, err := utils.VerifyPaystackTransaction(reference, secretKey)
	if err != nil {
		return false, 0, err
	}

	// Convert kobo to naira (100 kobo = 1 naira)
	amountInNaira := float64(amountInKobo) / 100.0

	return verified, amountInNaira, nil
}

// GetMyTransactions returns the authenticated user's token transaction history
// GET /api/token-transactions/me
func GetMyTransactions(c *gin.Context) {
	// Get authenticated user ID from context
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDInterface.(uint)

	// Get database connection from context
	db := c.MustGet("db").(*gorm.DB)

	// Parse query parameters for pagination
	limit := 50 // Default limit
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := utils.ParseInt(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	// Fetch transactions for this user
	var transactions []models.TokenTransaction
	if err := db.Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(limit).
		Find(&transactions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch transactions"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"transactions": transactions,
		"count":        len(transactions),
	})
}
