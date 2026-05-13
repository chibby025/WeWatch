// WeWatch/backend/internal/handlers/payout_handlers.go
package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/datatypes"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
)

// PayoutRequestBody represents a payout request payload
type PayoutRequestBody struct {
	PayoutType   string                 `json:"payout_type" binding:"required,oneof=tokens gateway_earnings"`
	PayoutMethod string                 `json:"payout_method" binding:"required,oneof=bank_transfer paypal mobile_money"`
	AmountTokens *int                   `json:"amount_tokens"` // Required for token payouts
	Currency     *string                `json:"currency"`      // Required for gateway earnings (USD, NGN, GHS, KES)
	Amount       *float64               `json:"amount"`        // Required for gateway earnings
	Details      map[string]interface{} `json:"details" binding:"required"` // Bank account, PayPal email, mobile number, etc.
}

// RequestPayoutHandler handles payout requests from hosts
// POST /api/payouts/request
// Supports AUTO-APPROVAL for small amounts with KYC verification
func RequestPayoutHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get authenticated user
		authUser, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		user := authUser.(*models.User)

		var req PayoutRequestBody
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Validate payout type-specific fields
		if req.PayoutType == "tokens" {
			if req.AmountTokens == nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "amount_tokens required for token payouts"})
				return
			}
			if *req.AmountTokens < 50 {
				c.JSON(http.StatusBadRequest, gin.H{"error": models.ErrMinimumPayoutNotMet.Error()})
				return
			}
		} else if req.PayoutType == "gateway_earnings" {
			if req.Currency == nil || req.Amount == nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "currency and amount required for gateway earnings payouts"})
				return
			}
			if *req.Amount <= 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "amount must be greater than 0"})
				return
			}
		}

		// Calculate amount in USD for validation
		var amountUSD float64
		var amountNGN float64
		if req.PayoutType == "tokens" {
			// Tokens are stored in cents: 121 = 1.21 tokens
			// Convert to naira at withdrawal rate: (tokens_in_cents / 100) * 122 = naira
			// Or simplified: tokens_in_cents * 122 / 100 = naira
			amountNGN = float64(*req.AmountTokens) * 122.0 / 100.0
			amountUSD = amountNGN / 1650.0 // ₦1,650 = $1 USD
		} else {
			// Convert to USD if needed
			if *req.Currency == "USD" {
				amountUSD = *req.Amount
				amountNGN = *req.Amount * 1500 // Approximate conversion
			} else if *req.Currency == "NGN" {
				amountNGN = *req.Amount
				amountUSD = *req.Amount / 1500
			} else {
				amountUSD = *req.Amount
				amountNGN = *req.Amount * 1500
			}
		}

		// Check KYC verification for payouts > $100
		var kycVerified bool
		var kyc models.KYCVerification
		result := db.Where("user_id = ? AND status = ?", user.ID, "approved").First(&kyc)
		if result.Error == gorm.ErrRecordNotFound {
			kycVerified = false
			if amountUSD > 100 {
				c.JSON(http.StatusForbidden, gin.H{
					"error":   models.ErrKYCNotVerified.Error(),
					"message": "KYC verification required for payouts over $100",
				})
				return
			}
		} else {
			// Check if KYC is expired
			kyc.CheckExpiration()
			if kyc.Status == string(models.KYCStatusExpired) {
				db.Save(&kyc)
				kycVerified = false
				if amountUSD > 100 {
					c.JSON(http.StatusForbidden, gin.H{
						"error":   "KYC verification expired",
						"message": "Please resubmit KYC documents",
					})
					return
				}
			} else {
				kycVerified = true
			}
		}

		// Check if this is first-time withdrawal
		var previousPayouts int64
		db.Model(&models.Payout{}).Where("user_id = ? AND status = ?", user.ID, models.PayoutStatusCompleted).Count(&previousPayouts)
		isFirstTime := previousPayouts == 0

		// Start transaction
		tx := db.Begin()
		defer func() {
			if r := recover(); r != nil {
				tx.Rollback()
			}
		}()

		// Process token payout
		if req.PayoutType == "tokens" {
			// Check wallet balance
			var wallet models.UserWallet
			if err := tx.Where("user_id = ?", user.ID).First(&wallet).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch wallet"})
				return
			}

			if !wallet.CanWithdraw(50) {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{"error": models.ErrMinimumPayoutNotMet.Error()})
				return
			}

			if wallet.TokenBalance < *req.AmountTokens {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{"error": models.ErrInsufficientBalance.Error()})
				return
			}

			// Deduct tokens from wallet (mark as pending withdrawal)
			if err := wallet.DeductTokens(*req.AmountTokens); err != nil {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			if err := tx.Save(&wallet).Error; err != nil {
				tx.Rollback()
				log.Printf("❌ Error updating wallet: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process payout"})
				return
			}

			// Determine if auto-approval is eligible
			autoApprove := shouldAutoApprovePayout(amountNGN, kycVerified, isFirstTime, req.PayoutMethod, user.Role)
			
			initialStatus := string(models.PayoutStatusPending)
			var processingMessage string
			
			if autoApprove {
				initialStatus = string(models.PayoutStatusProcessing)
				processingMessage = "Processing withdrawal automatically..."
			} else {
				processingMessage = "Payout request submitted for admin review"
			}

			// Create payout record
			payout := models.Payout{
				UserID:       user.ID,
				PayoutType:   req.PayoutType,
				PayoutMethod: req.PayoutMethod,
				AmountTokens: req.AmountTokens,
				Status:       initialStatus,
			}
			
			// Convert details map to JSON
			if req.Details != nil {
				detailsJSON, err := json.Marshal(req.Details)
				if err != nil {
					tx.Rollback()
					log.Printf("❌ Error marshaling payout details: %v", err)
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process payout details"})
					return
				}
				payout.PayoutDetails = datatypes.JSON(detailsJSON)
			}
			
			// Save payout to database
			if err := tx.Create(&payout).Error; err != nil {
				tx.Rollback()
				log.Printf("❌ Error creating token payout: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create payout request"})
				return
			}

			// Commit transaction
			if err := tx.Commit().Error; err != nil {
				log.Printf("❌ Error committing token payout: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to complete payout request"})
				return
			}

			log.Printf("✅ Token payout created: ID=%d, UserID=%d, Amount=%d tokens, Status=%s", 
				payout.ID, user.ID, *req.AmountTokens, initialStatus)
			
			// Process auto-approval if applicable
			if autoApprove && req.PayoutMethod == string(models.PayoutMethodBankTransfer) {
				go autoProcessPayout(db, payout.ID, user.ID, float64(*req.AmountTokens)*122.0/100.0, "NGN", req.Details)
			}

			c.JSON(http.StatusOK, gin.H{
				"success":      true,
				"payout":       payout,
				"auto_approve": autoApprove,
				"message":      processingMessage,
			})

		} else {
			// Gateway earnings payout
			// Calculate total available gateway earnings in the requested currency
			var totalAvailable float64
			tx.Model(&models.GatewayEarning{}).
				Where("host_id = ? AND currency = ? AND is_withdrawn = ?", user.ID, *req.Currency, false).
				Select("COALESCE(SUM(net_amount), 0)").
				Scan(&totalAvailable)

			if totalAvailable < *req.Amount {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{
					"error":   "Insufficient gateway earnings balance",
					"message": "You can only withdraw up to your available balance",
					"available": totalAvailable,
					"requested": *req.Amount,
				})
				return
			}

			// Determine if auto-approval is eligible
			autoApprove := shouldAutoApprovePayout(amountNGN, kycVerified, isFirstTime, req.PayoutMethod, user.Role)
			
			initialStatus := string(models.PayoutStatusPending)
			var processingMessage string
			
			if autoApprove {
				initialStatus = string(models.PayoutStatusProcessing)
				processingMessage = "Processing withdrawal automatically..."
			} else {
				processingMessage = "Payout request submitted for admin review"
			}

			// Create payout record
			payout := models.Payout{
				UserID:         user.ID,
				PayoutType:     req.PayoutType,
				PayoutMethod:   req.PayoutMethod,
				AmountCurrency: req.Currency,
				AmountValue:    req.Amount,
				Status:         initialStatus,
			}
			
			// Convert details map to JSON
			if req.Details != nil {
				detailsJSON, err := json.Marshal(req.Details)
				if err != nil {
					tx.Rollback()
					log.Printf("❌ Error marshaling gateway payout details: %v", err)
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process payout details"})
					return
				}
				payout.PayoutDetails = datatypes.JSON(detailsJSON)
			}
			
			// Save payout to database
			if err := tx.Create(&payout).Error; err != nil {
				tx.Rollback()
				log.Printf("❌ Error creating gateway payout: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create payout request"})
				return
			}

			// Commit transaction
			if err := tx.Commit().Error; err != nil {
				log.Printf("❌ Error committing gateway payout: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to complete payout request"})
				return
			}

			log.Printf("✅ Gateway earnings payout created: ID=%d, UserID=%d, Amount=%.2f %s, Status=%s", 
				payout.ID, user.ID, *req.Amount, *req.Currency, initialStatus)

			c.JSON(http.StatusOK, gin.H{
				"success":      true,
				"payout":       payout,
				"auto_approve": autoApprove,
				"message":      processingMessage,
			})
		}
	}
}

// GetUserPayoutsHandler retrieves payout history for a user
// GET /api/payouts/:userId?status=pending
func GetUserPayoutsHandler(db *gorm.DB) gin.HandlerFunc {
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

		// Users can only view their own payouts
		if uint(userID) != authenticatedUserID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Cannot view other users' payouts"})
			return
		}

		// Filter by status if provided
		query := db.Where("user_id = ?", userID)
		if status := c.Query("status"); status != "" {
			query = query.Where("status = ?", status)
		}

		var payouts []models.Payout
		if err := query.Order("created_at DESC").Find(&payouts).Error; err != nil {
			log.Printf("❌ Error fetching payouts: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch payouts"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"payouts": payouts,
			"count":   len(payouts),
		})
	}
}

// GetPayoutDetailsHandler retrieves details of a specific payout
// GET /api/payouts/:id
func GetPayoutDetailsHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		payoutIDStr := c.Param("id")
		payoutID, err := strconv.ParseUint(payoutIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payout ID"})
			return
		}

		// Get authenticated user
		authUser, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		user := authUser.(*models.User)

		var payout models.Payout
		if err := db.First(&payout, payoutID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "Payout not found"})
			} else {
				log.Printf("❌ Error fetching payout: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch payout"})
			}
			return
		}

		// Verify ownership
		if payout.UserID != user.ID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Cannot view other users' payouts"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"payout": payout,
		})
	}
}

// CancelPayoutHandler allows users to cancel pending payouts
// POST /api/payouts/:id/cancel
func CancelPayoutHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		payoutIDStr := c.Param("id")
		payoutID, err := strconv.ParseUint(payoutIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payout ID"})
			return
		}

		// Get authenticated user
		authUser, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		user := authUser.(*models.User)

		var payout models.Payout
		if err := db.First(&payout, payoutID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "Payout not found"})
			} else {
				log.Printf("❌ Error fetching payout: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch payout"})
			}
			return
		}

		// Verify ownership
		if payout.UserID != user.ID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Cannot cancel other users' payouts"})
			return
		}

		// Can only cancel pending payouts
		if payout.Status != string(models.PayoutStatusPending) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "Cannot cancel payout",
				"message": "Only pending payouts can be cancelled",
				"status":  payout.Status,
			})
			return
		}

		// Start transaction
		tx := db.Begin()
		defer func() {
			if r := recover(); r != nil {
				tx.Rollback()
			}
		}()

		// If token payout, refund tokens to wallet
		if payout.PayoutType == string(models.PayoutTypeTokens) && payout.AmountTokens != nil {
			var wallet models.UserWallet
			if err := tx.Where("user_id = ?", user.ID).First(&wallet).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch wallet"})
				return
			}

			wallet.AddTokens(*payout.AmountTokens)
			if err := tx.Save(&wallet).Error; err != nil {
				tx.Rollback()
				log.Printf("❌ Error refunding tokens: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to refund tokens"})
				return
			}
		}

		// Update payout status
		payout.Status = string(models.PayoutStatusCancelled)
		if err := tx.Save(&payout).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ Error cancelling payout: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to cancel payout"})
			return
		}

		// Commit transaction
		if err := tx.Commit().Error; err != nil {
			log.Printf("❌ Error committing cancellation: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to complete cancellation"})
			return
		}

		log.Printf("✅ Payout cancelled: ID %d, User %d", payoutID, user.ID)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"payout":  payout,
			"message": "Payout cancelled successfully",
		})
	}
}

// shouldAutoApprovePayout determines if a payout should be automatically approved
func shouldAutoApprovePayout(amountNGN float64, kycVerified bool, isFirstTime bool, payoutMethod string, userRole string) bool {
	// 👑 Admin/Super Admin bypass - auto-approve regardless of amount or other checks
	if userRole == "admin" || userRole == "super_admin" {
		log.Printf("✅ Auto-approve: YES - Admin/Super Admin bypass (role: %s)", userRole)
		return true
	}

	// Bank transfers only for now
	if payoutMethod != string(models.PayoutMethodBankTransfer) {
		return false
	}

	// First-time withdrawals require manual review
	if isFirstTime {
		log.Printf("🔍 Auto-approve: NO - First-time withdrawal requires review")
		return false
	}

	// Large amounts require manual review (₦10,000 = ~$100)
	if amountNGN >= 10000 {
		log.Printf("🔍 Auto-approve: NO - Amount ₦%.2f exceeds threshold (₦10,000)", amountNGN)
		return false
	}

	// KYC required for amounts > ₦5,000
	if amountNGN > 5000 && !kycVerified {
		log.Printf("🔍 Auto-approve: NO - Amount ₦%.2f requires KYC verification", amountNGN)
		return false
	}

	// All checks passed
	log.Printf("✅ Auto-approve: YES - Amount ₦%.2f, KYC: %v, First-time: %v", amountNGN, kycVerified, isFirstTime)
	return true
}

// autoProcessPayout processes a payout automatically in the background
func autoProcessPayout(db *gorm.DB, payoutID uint, userID uint, amount float64, currency string, recipientDetails map[string]interface{}) {
	log.Printf("🤖 Auto-processing payout %d for user %d...", payoutID, userID)

	// Get Reserve account secret key
	reserveKey := utils.AccountManager.PaystackReserveKey
	if reserveKey == "" {
		log.Printf("❌ Auto-process failed: Reserve account key not configured")
		updatePayoutStatus(db, payoutID, models.PayoutStatusFailed, "Reserve account not configured")
		return
	}

	// Check if recipient code exists
	recipientCode, hasRecipient := recipientDetails["recipient_code"].(string)
	
	if !hasRecipient || recipientCode == "" {
		// Create new recipient
		accountNumber, ok1 := recipientDetails["account_number"].(string)
		bankCode, ok2 := recipientDetails["bank_code"].(string)
		accountName, ok3 := recipientDetails["account_name"].(string)

		if !ok1 || !ok2 || !ok3 {
			log.Printf("❌ Auto-process failed: Missing bank details")
			updatePayoutStatus(db, payoutID, models.PayoutStatusFailed, "Missing required bank details")
			return
		}

		// Create recipient on Paystack
		var err error
		recipientCode, err = utils.PaystackCreateTransferRecipient(
			reserveKey,
			"nuban",
			accountName,
			accountNumber,
			bankCode,
			currency,
		)

		if err != nil {
			log.Printf("❌ Auto-process failed: Could not create recipient - %v", err)
			updatePayoutStatus(db, payoutID, models.PayoutStatusPending, fmt.Sprintf("Failed to create recipient: %v", err))
			return
		}

		log.Printf("✅ Created transfer recipient: %s for user %d", recipientCode, userID)

		// Save recipient code for future use
		recipientDetails["recipient_code"] = recipientCode
		db.Model(&models.Payout{}).Where("id = ?", payoutID).Update("payout_details", recipientDetails)
	}

	// Initiate transfer
	amountInKobo := int(amount * 100)
	reference := fmt.Sprintf("PAYOUT_%d_%d", payoutID, userID)
	reason := fmt.Sprintf("Auto-withdrawal for user %d", userID)

	transferCode, err := utils.PaystackTransferFunds(
		reserveKey,
		recipientCode,
		amountInKobo,
		currency,
		reference,
		reason,
	)

	if err != nil {
		log.Printf("❌ Auto-process failed: Transfer failed - %v", err)
		updatePayoutStatus(db, payoutID, models.PayoutStatusPending, fmt.Sprintf("Transfer failed: %v - Requires admin review", err))
		return
	}

	// Update payout status to completed
	db.Model(&models.Payout{}).Where("id = ?", payoutID).Updates(map[string]interface{}{
		"status":              models.PayoutStatusCompleted,
		"gateway_transfer_id": transferCode,
	})

	// Mark gateway earnings as withdrawn if applicable
	db.Model(&models.GatewayEarning{}).
		Where("host_id = ? AND currency = ? AND is_withdrawn = ?", userID, currency, false).
		Limit(1).
		Update("is_withdrawn", true)

	log.Printf("✅ Auto-processed payout %d: Transfer %s, Amount %.2f %s", payoutID, transferCode, amount, currency)
}

// updatePayoutStatus updates the status of a payout
func updatePayoutStatus(db *gorm.DB, payoutID uint, status models.PayoutStatus, reason string) {
	updates := map[string]interface{}{
		"status": status,
	}
	
	if reason != "" {
		updates["failure_reason"] = reason
	}
	
	db.Model(&models.Payout{}).Where("id = ?", payoutID).Updates(updates)
}
