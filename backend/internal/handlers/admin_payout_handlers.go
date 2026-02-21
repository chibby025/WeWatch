// WeWatch/backend/internal/handlers/admin_payout_handlers.go
package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
)

// ⚠️ LEGACY ADMIN APPROVAL HANDLERS - For Manually Flagged Accounts Only
// 
// Most withdrawals are now AUTO-APPROVED (see withdrawal_handlers.go).
// These handlers are kept for:
// 1. Manually reviewing suspicious/flagged accounts
// 2. Processing old pending payouts created before auto-approval was implemented
// 3. Emergency manual intervention when needed
//
// Normal withdrawal flow (95% of cases):
// User clicks "Withdraw" → Auto-approved → Paystack Transfer → Complete
//
// Flagged account flow (5% of cases):
// User clicks "Withdraw" → Flagged as pending → Admin reviews → Manual approval

// GetPendingPayoutsHandler returns all pending payouts for admin review
// GET /api/admin/payouts/pending
func GetPendingPayoutsHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var payouts []models.Payout
		if err := db.Preload("User").
			Where("status = ?", models.PayoutStatusPending).
			Order("created_at ASC").
			Find(&payouts).Error; err != nil {
			log.Printf("❌ Error fetching pending payouts: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch pending payouts"})
			return
		}

		// Calculate totals
		var totalAmount float64
		for _, payout := range payouts {
			if payout.AmountValue != nil {
				totalAmount += *payout.AmountValue
			} else if payout.AmountTokens != nil {
				// Convert tokens to value (₦165 per token / 100 for cents storage)
				totalAmount += float64(*payout.AmountTokens) * 165.0 / 100.0
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"payouts":      payouts,
			"count":        len(payouts),
			"total_amount": totalAmount,
		})
	}
}

// GetProcessingPayoutsHandler returns all processing payouts for manual completion
// GET /api/admin/payouts/processing
//
// This endpoint returns payouts that are stuck in "processing" state due to Paystack starter account limitations.
// Admin should manually transfer funds via Paystack dashboard, then mark as completed.
func GetProcessingPayoutsHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var payouts []models.Payout
		if err := db.Preload("User").Preload("PaymentAccount").
			Where("status = ?", models.PayoutStatusProcessing).
			Order("created_at ASC").
			Find(&payouts).Error; err != nil {
			log.Printf("❌ Error fetching processing payouts: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch processing payouts"})
			return
		}

		// Calculate totals
		var totalAmount float64
		for _, payout := range payouts {
			if payout.AmountValue != nil {
				totalAmount += *payout.AmountValue
			} else if payout.AmountTokens != nil {
				// Convert tokens to value (₦122 per token / 100 for cents storage - after 75% split)
				totalAmount += float64(*payout.AmountTokens) * 122.0 / 100.0
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"payouts":      payouts,
			"count":        len(payouts),
			"total_amount": totalAmount,
		})
	}
}


// ProcessPayoutHandler processes a pending payout by initiating transfer from Reserve account
// POST /api/admin/payouts/:id/process
func ProcessPayoutHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		payoutIDStr := c.Param("id")
		payoutID, err := strconv.ParseUint(payoutIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payout ID"})
			return
		}

		// Start transaction
		tx := db.Begin()
		defer func() {
			if r := recover(); r != nil {
				tx.Rollback()
			}
		}()

		// Fetch payout with user details
		var payout models.Payout
		if err := tx.Preload("User").First(&payout, payoutID).Error; err != nil {
			tx.Rollback()
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "Payout not found"})
			} else {
				log.Printf("❌ Error fetching payout: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch payout"})
			}
			return
		}

		// Verify payout is pending
		if payout.Status != string(models.PayoutStatusPending) {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "Payout is not pending",
				"status":  payout.Status,
				"message": "Only pending payouts can be processed",
			})
			return
		}

		// Get payout amount and currency
		var amount float64
		var currency string
		var recipientInfo map[string]interface{}

		if payout.PayoutType == string(models.PayoutTypeTokens) && payout.AmountTokens != nil {
			// Token payout - convert to naira (₦165 per token / 100 for cents)
			amount = float64(*payout.AmountTokens) * 165.0 / 100.0
			currency = "NGN"
		} else if payout.PayoutType == string(models.PayoutTypeGatewayEarnings) && payout.AmountValue != nil {
			amount = *payout.AmountValue
			if payout.AmountCurrency != nil {
				currency = *payout.AmountCurrency
			} else {
				currency = "NGN"
			}
		} else {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payout amount"})
			return
		}

		// Extract recipient details from payout_details
		if err := json.Unmarshal(payout.PayoutDetails, &recipientInfo); err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payout details format"})
			return
		}
		if recipientInfo == nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": "Missing recipient details"})
			return
		}

		// Process payout based on method
		var transferCode string
		var transferErr error

		if payout.PayoutMethod == string(models.PayoutMethodBankTransfer) {
			// Bank transfer via Paystack
			transferCode, transferErr = processPaystackBankTransfer(
				payout.ID,
				payout.User.ID,
				amount,
				currency,
				recipientInfo,
			)
		} else if payout.PayoutMethod == string(models.PayoutMethodPayPal) {
			// PayPal transfer (not implemented yet)
			tx.Rollback()
			c.JSON(http.StatusNotImplemented, gin.H{
				"error":   "PayPal payouts not yet implemented",
				"message": "Please use bank transfer for now",
			})
			return
		} else if payout.PayoutMethod == string(models.PayoutMethodMobileMoney) {
			// Mobile money transfer (not implemented yet)
			tx.Rollback()
			c.JSON(http.StatusNotImplemented, gin.H{
				"error":   "Mobile money payouts not yet implemented",
				"message": "Please use bank transfer for now",
			})
			return
		} else {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported payout method"})
			return
		}

		// Check if transfer succeeded
		if transferErr != nil {
			// Mark payout as failed
			payout.Status = string(models.PayoutStatusFailed)
			errorMsg := transferErr.Error()
			payout.FailureReason = &errorMsg
			if err := tx.Save(&payout).Error; err != nil {
				tx.Rollback()
				log.Printf("❌ Error updating failed payout: %v", err)
			} else {
				tx.Commit()
			}

			c.JSON(http.StatusInternalServerError, gin.H{
				"error":   "Transfer failed",
				"message": transferErr.Error(),
			})
			return
		}

		// Update payout status to completed
		payout.Status = string(models.PayoutStatusCompleted)
		payout.GatewayTransferID = &transferCode

		if err := tx.Save(&payout).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ Error updating payout status: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update payout"})
			return
		}

		// Mark gateway earnings as withdrawn if applicable
		if payout.PayoutType == string(models.PayoutTypeGatewayEarnings) {
			// Update gateway_earnings to mark as withdrawn
			tx.Model(&models.GatewayEarning{}).
				Where("host_id = ? AND currency = ? AND is_withdrawn = ?", payout.UserID, currency, false).
				Limit(1). // Mark only the amount needed
				Update("is_withdrawn", true)
		}

		// Commit transaction
		if err := tx.Commit().Error; err != nil {
			log.Printf("❌ Error committing payout: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to complete payout"})
			return
		}

		log.Printf("✅ Payout processed successfully: ID %d, User %d, Amount %.2f %s, Transfer: %s",
			payoutID, payout.UserID, amount, currency, transferCode)

		c.JSON(http.StatusOK, gin.H{
			"success":      true,
			"payout":       payout,
			"transfer_code": transferCode,
			"message":      "Payout processed successfully",
		})
	}
}

// processPaystackBankTransfer initiates a Paystack bank transfer from Reserve account
func processPaystackBankTransfer(payoutID, userID uint, amount float64, currency string, recipientDetails map[string]interface{}) (string, error) {
	// Get Reserve account secret key
	reserveKey := utils.AccountManager.PaystackReserveKey
	if reserveKey == "" {
		return "", fmt.Errorf("reserve account key not configured")
	}

	// Check if recipient code exists
	recipientCode, hasRecipient := recipientDetails["recipient_code"].(string)
	
	if !hasRecipient || recipientCode == "" {
		// Create new recipient
		accountNumber, ok1 := recipientDetails["account_number"].(string)
		bankCode, ok2 := recipientDetails["bank_code"].(string)
		accountName, ok3 := recipientDetails["account_name"].(string)

		if !ok1 || !ok2 || !ok3 {
			return "", fmt.Errorf("missing required bank details (account_number, bank_code, account_name)")
		}

		// Create recipient on Paystack
		var err error
		recipientCode, err = utils.PaystackCreateTransferRecipient(
			reserveKey,
			"nuban", // Nigerian bank account
			accountName,
			accountNumber,
			bankCode,
			currency,
		)

		if err != nil {
			return "", fmt.Errorf("failed to create recipient: %w", err)
		}

		log.Printf("✅ Created transfer recipient: %s for user %d", recipientCode, userID)
	}

	// Initiate transfer
	amountInKobo := int(amount * 100)
	reference := fmt.Sprintf("PAYOUT_%d_%d", payoutID, userID)
	reason := fmt.Sprintf("Host payout for user %d", userID)

	transferCode, err := utils.PaystackTransferFunds(
		reserveKey,
		recipientCode,
		amountInKobo,
		currency,
		reference,
		reason,
	)

	if err != nil {
		return "", fmt.Errorf("transfer failed: %w", err)
	}

	return transferCode, nil
}

// RejectPayoutHandler rejects a pending payout with reason
// POST /api/admin/payouts/:id/reject
func RejectPayoutHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		payoutIDStr := c.Param("id")
		payoutID, err := strconv.ParseUint(payoutIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payout ID"})
			return
		}

		var req struct {
			Reason string `json:"reason" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Reason is required"})
			return
		}

		// Start transaction
		tx := db.Begin()
		defer func() {
			if r := recover(); r != nil {
				tx.Rollback()
			}
		}()

		// Fetch payout
		var payout models.Payout
		if err := tx.First(&payout, payoutID).Error; err != nil {
			tx.Rollback()
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "Payout not found"})
			} else {
				log.Printf("❌ Error fetching payout: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch payout"})
			}
			return
		}

		// Verify payout is pending
		if payout.Status != string(models.PayoutStatusPending) {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{
				"error":  "Payout is not pending",
				"status": payout.Status,
			})
			return
		}

		// If token payout, refund tokens to wallet
		if payout.PayoutType == string(models.PayoutTypeTokens) && payout.AmountTokens != nil {
			var wallet models.UserWallet
			if err := tx.Where("user_id = ?", payout.UserID).First(&wallet).Error; err != nil {
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
		payout.Status = string(models.PayoutStatusRejected)
		payout.FailureReason = &req.Reason

		if err := tx.Save(&payout).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ Error rejecting payout: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reject payout"})
			return
		}

		// Commit transaction
		if err := tx.Commit().Error; err != nil {
			log.Printf("❌ Error committing rejection: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to complete rejection"})
			return
		}

		log.Printf("✅ Payout rejected: ID %d, Reason: %s", payoutID, req.Reason)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"payout":  payout,
			"message": "Payout rejected successfully",
		})
	}
}
// MarkPayoutCompletedHandler marks a "processing" payout as completed (manual workflow)
// POST /api/admin/payouts/:id/complete
// 
// This is used when admin manually transfers funds via Paystack dashboard (due to starter account limitation)
// and then marks the payout as completed in the system.
// 
// Workflow:
// 1. User requests withdrawal → Status: "processing"
// 2. Auto-transfer fails (starter account) → Stays "processing"
// 3. Admin logs into Paystack dashboard → Manually transfers ₦122
// 4. Admin calls this endpoint → Status: "completed"
func MarkPayoutCompletedHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		payoutIDStr := c.Param("id")
		payoutID, err := strconv.ParseUint(payoutIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payout ID"})
			return
		}

		// Optional: Accept transfer reference from admin
		var req struct {
			TransferReference *string `json:"transfer_reference"` // Optional Paystack transfer code/reference
			Notes             *string `json:"notes"`              // Optional admin notes
		}
		c.ShouldBindJSON(&req) // Optional, don't error if empty

		// Start transaction
		tx := db.Begin()
		defer func() {
			if r := recover(); r != nil {
				tx.Rollback()
			}
		}()

		// Fetch payout
		var payout models.Payout
		if err := tx.Preload("User").First(&payout, payoutID).Error; err != nil {
			tx.Rollback()
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "Payout not found"})
			} else {
				log.Printf("❌ Error fetching payout: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch payout"})
			}
			return
		}

		// Verify payout is in "processing" state
		if payout.Status != string(models.PayoutStatusProcessing) {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "Payout is not in processing state",
				"status":  payout.Status,
				"message": "Only processing payouts can be marked as completed",
			})
			return
		}

		// Update payout to completed
		payout.Status = string(models.PayoutStatusCompleted)
		
		// Store transfer reference if provided
		if req.TransferReference != nil && *req.TransferReference != "" {
			payout.GatewayTransferID = req.TransferReference
		}

		// Store admin notes if provided
		if req.Notes != nil && *req.Notes != "" {
			// Could add a Notes field to Payout model, or just log it
			log.Printf("📝 Admin notes for payout %d: %s", payoutID, *req.Notes)
		}

		if err := tx.Save(&payout).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ Error marking payout as completed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update payout"})
			return
		}

		// Commit transaction
		if err := tx.Commit().Error; err != nil {
			log.Printf("❌ Error committing completion: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to complete payout"})
			return
		}

		// Send success notification to user via WebSocket (optional)
		if hub := GetHub(); hub != nil {
			notificationData := map[string]interface{}{
				"type":    "withdrawal_completed",
				"message": fmt.Sprintf("Your withdrawal of %.2f %s has been completed", 
					*payout.AmountValue, *payout.AmountCurrency),
				"payout_id": payout.ID,
			}
			msgBytes, _ := json.Marshal(notificationData)
			hub.BroadcastToUser(payout.UserID, 0, OutgoingMessage{Data: msgBytes, IsBinary: false})
		}

		log.Printf("✅ Payout manually marked as completed: ID %d, User %d, Amount %.2f %s",
			payoutID, payout.UserID, *payout.AmountValue, *payout.AmountCurrency)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"payout":  payout,
			"message": "Payout marked as completed successfully",
		})
	}
}