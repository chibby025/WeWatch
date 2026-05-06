package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/datatypes"

	"wewatch-backend/internal/models"
	"wewatch-backend/internal/services"
)

// WithdrawalRequest represents a withdrawal request from a host
type WithdrawalRequest struct {
	Amount           float64 `json:"amount" binding:"required,gt=0"`
	Currency         string  `json:"currency" binding:"required,oneof=USD NGN GHS KES EUR GBP"`
	PaymentAccountID uint    `json:"payment_account_id" binding:"required"`
	SourceType       string  `json:"source_type" binding:"required,oneof=tokens gateway_earnings"` // Where to withdraw from
}

// RequestWithdrawal processes a host's withdrawal request
// POST /api/withdrawals/request
func RequestWithdrawal(c *gin.Context) {
	// Get authenticated user ID from context
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDInterface.(uint)
	
	// Parse request body
	var req WithdrawalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Get database connection from context
	db := c.MustGet("db").(*gorm.DB)
	
	// Fetch the payment account
	var paymentAccount models.PaymentAccount
	if err := db.Where("id = ? AND user_id = ?", req.PaymentAccountID, userID).First(&paymentAccount).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Payment account not found"})
		return
	}
	
	// Verify account is verified
	if !paymentAccount.IsVerified {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Payment account is not verified. Complete verification first."})
		return
	}
	
	// Verify currency matches
	if paymentAccount.Currency != req.Currency {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Currency mismatch. Account currency is %s, but you requested %s", 
				paymentAccount.Currency, req.Currency),
		})
		return
	}
	
	// Check minimum withdrawal amount
	minimumAmount := paymentAccount.MinimumWithdrawalAmount()
	if req.Amount < minimumAmount {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Amount below minimum withdrawal of %.2f %s", 
				minimumAmount, req.Currency),
		})
		return
	}
	
	// ✅ NEW: Check daily withdrawal limit (₦500,000 per day for NGN)
	withinLimit, remaining, err := CheckDailyWithdrawalLimit(db, userID, req.Amount, req.Currency)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check daily withdrawal limit"})
		return
	}
	
	if !withinLimit {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Daily withdrawal limit exceeded. You have ₦%.2f remaining today. Limit resets at midnight.", remaining),
		})
		return
	}
	
	// Start database transaction
	tx := db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()
	
	// Check and deduct balance based on source type
	if req.SourceType == "tokens" {
		// Withdraw from token wallet
		var wallet models.UserWallet
		if err := tx.Where("user_id = ?", userID).First(&wallet).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusNotFound, gin.H{"error": "Wallet not found"})
			return
		}
		
		// Convert currency amount to tokens (as cents) based on withdrawal rates
		// Tokens are stored as INTEGER CENTS in DB (1 token = 100 cents)
		// For other currencies, convert to USD equivalent first
		var requiredTokens int
		switch req.Currency {
		case "NGN":
			// 1 token = ₦122 NGN (withdrawal rate after 75/25 split and fees)
			// Calculate tokens as float, then multiply by 100 to get cents
			tokensFloat := req.Amount / 122.0
			requiredTokens = int(tokensFloat * 100) // Convert to cents
		case "USD":
			// 1 token = $0.10 USD
			tokensFloat := req.Amount / 0.10
			requiredTokens = int(tokensFloat * 100)
		case "GHS":
			// 1 token = ₵1.50 GHS (approximate)
			tokensFloat := req.Amount / 1.50
			requiredTokens = int(tokensFloat * 100)
		case "KES":
			// 1 token = KSh15 KES (approximate)
			tokensFloat := req.Amount / 15.0
			requiredTokens = int(tokensFloat * 100)
		case "EUR":
			// 1 token = €0.09 EUR (approximate)
			tokensFloat := req.Amount / 0.09
			requiredTokens = int(tokensFloat * 100)
		case "GBP":
			// 1 token = £0.08 GBP (approximate)
			tokensFloat := req.Amount / 0.08
			requiredTokens = int(tokensFloat * 100)
		default:
			// Default to USD rate
			tokensFloat := req.Amount / 0.10
			requiredTokens = int(tokensFloat * 100)
		}
		
		if wallet.TokenBalance < requiredTokens {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("Insufficient token balance. Required: %d tokens, Available: %d tokens", 
					requiredTokens, wallet.TokenBalance),
			})
			return
		}
		
		// Deduct tokens
		wallet.TokenBalance -= requiredTokens
		if err := tx.Save(&wallet).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to deduct tokens"})
			return
		}
		
		// Create token transaction record
		amountTokens := requiredTokens
		usdValue := req.Amount
		tokenTx := models.TokenTransaction{
			UserID:          userID,
			Amount:          amountTokens,
			TransactionType: models.TransactionTypePayout,
			USDValue:        &usdValue,
			Status:          models.TransactionStatusCompleted,
			Metadata: map[string]interface{}{
				"currency": req.Currency,
				"description": fmt.Sprintf("Withdrawal of %d tokens (%.2f %s)", requiredTokens, req.Amount, req.Currency),
			},
		}
		if err := tx.Create(&tokenTx).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create transaction record"})
			return
		}
		
	} else if req.SourceType == "gateway_earnings" {
		// Withdraw from gateway earnings (ticket sales, donations)
		var totalEarnings float64
		if err := tx.Model(&models.GatewayEarning{}).
			Where("host_id = ? AND currency = ? AND is_withdrawn = ?", userID, req.Currency, false).
			Select("COALESCE(SUM(net_amount), 0)").
			Scan(&totalEarnings).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to calculate earnings"})
			return
		}
		
		if totalEarnings < req.Amount {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("Insufficient earnings. Available: %.2f %s, Requested: %.2f %s", 
					totalEarnings, req.Currency, req.Amount, req.Currency),
			})
			return
		}
		
		// Mark earnings as withdrawn (we'll mark specific records later)
		var earnings []models.GatewayEarning
		if err := tx.Where("host_id = ? AND currency = ? AND is_withdrawn = ?", userID, req.Currency, false).
			Order("created_at ASC").
			Find(&earnings).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch earnings"})
			return
		}
		
		// Mark enough earnings as withdrawn to cover the amount
		remainingAmount := req.Amount
		withdrawnAt := time.Now()
		for i := range earnings {
			if remainingAmount <= 0 {
				break
			}
			
			if earnings[i].NetAmount <= remainingAmount {
				earnings[i].IsWithdrawn = true
				earnings[i].WithdrawnAt = &withdrawnAt
				remainingAmount -= earnings[i].NetAmount
			} else {
				// Split this earning (complex, for now just mark as withdrawn)
				earnings[i].IsWithdrawn = true
				earnings[i].WithdrawnAt = &withdrawnAt
				remainingAmount = 0
			}
			
			if err := tx.Save(&earnings[i]).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to mark earnings as withdrawn"})
				return
			}
		}
	}
	
	// Create payout record
	amountValue := req.Amount
	amountCurrency := req.Currency
	
	// ✅ Validate amount before creating payout
	if amountValue <= 0 {
		tx.Rollback()
		fmt.Printf("❌ ERROR: Invalid withdrawal amount: %.2f %s\n", amountValue, amountCurrency)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid withdrawal amount",
			"amount": amountValue,
			"currency": amountCurrency,
		})
		return
	}
	
	// Log withdrawal details
	fmt.Printf("💰 Processing withdrawal request:\n")
	fmt.Printf("   User ID: %d\n", userID)
	fmt.Printf("   Amount: %.2f %s\n", amountValue, amountCurrency)
	fmt.Printf("   Source: %s\n", req.SourceType)
	fmt.Printf("   Account ID: %d\n", req.PaymentAccountID)
	
	// For token withdrawals, store the token amount
	var amountTokens *int
	if req.SourceType == "tokens" {
		// Calculate token amount (same logic as before)
		var tokensInCents int
		switch req.Currency {
		case "NGN":
			tokensFloat := req.Amount / 122.0
			tokensInCents = int(tokensFloat * 100)
		case "USD":
			tokensFloat := req.Amount / 0.10
			tokensInCents = int(tokensFloat * 100)
		case "GHS":
			tokensFloat := req.Amount / 1.50
			tokensInCents = int(tokensFloat * 100)
		case "KES":
			tokensFloat := req.Amount / 15.0
			tokensInCents = int(tokensFloat * 100)
		case "EUR":
			tokensFloat := req.Amount / 0.09
			tokensInCents = int(tokensFloat * 100)
		case "GBP":
			tokensFloat := req.Amount / 0.08
			tokensInCents = int(tokensFloat * 100)
		default:
			tokensFloat := req.Amount / 0.10
			tokensInCents = int(tokensFloat * 100)
		}
		amountTokens = &tokensInCents
	}
	
	// Prepare payout details as JSON
	payoutDetailsMap := map[string]interface{}{
		"gateway":        paymentAccount.Gateway,
		"currency":       req.Currency,
		"request_time":   time.Now().Format(time.RFC3339),
		"auto_approved":  true, // ✅ Flag to indicate automatic approval
	}
	payoutDetailsJSON, _ := json.Marshal(payoutDetailsMap)
	
	payout := models.Payout{
		UserID:           userID,
		PayoutType:       req.SourceType,
		PayoutMethod:     "bank_transfer",
		AmountTokens:     amountTokens,        // ✅ Add token amount for token withdrawals
		AmountCurrency:   &amountCurrency,
		AmountValue:      &amountValue,
		Status:           string(models.PayoutStatusProcessing), // ✅ Auto-approve: Start as "processing" instead of "pending"
		PaymentAccountID: &req.PaymentAccountID,
		PayoutDetails:    datatypes.JSON(payoutDetailsJSON),
	}
	
	if err := tx.Create(&payout).Error; err != nil {
		tx.Rollback()
		fmt.Printf("ERROR: Failed to create payout record: %v\n", err)
		fmt.Printf("DEBUG: Payout data - UserID: %d, Type: %s, Amount: %.2f %s, AccountID: %d\n", 
			userID, req.SourceType, req.Amount, req.Currency, req.PaymentAccountID)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create payout record"})
		return
	}
	
	// Commit transaction
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit transaction"})
		return
	}

	// 🔐 AUDIT LOG: Withdrawal requested
	log.Printf("🔐 AUDIT: User %d requested withdrawal (Payout ID: %d, Amount: %.2f %s, Source: %s, Account: %d)", 
		userID, payout.ID, req.Amount, req.Currency, req.SourceType, req.PaymentAccountID)
	
	// ✅ Send withdrawal confirmation email (async)
	go func() {
		// Get user details for email
		var user models.User
		if err := db.First(&user, userID).Error; err == nil {
			emailService := services.NewEmailService()
			err := emailService.SendWithdrawalSubmittedEmail(
				user.Email,
				user.Username,
				req.Amount,
				req.Currency,
			)
			if err != nil {
				fmt.Printf("⚠️  Failed to send withdrawal email to %s: %v\n", user.Email, err)
			}
		}
	}()
	
	// 📧 MANUAL WITHDRAWAL: Notify admin to manually process the withdrawal
	go func() {
		// Get admin email from environment or use default
		adminEmail := os.Getenv("ADMIN_EMAIL")
		if adminEmail == "" {
			adminEmail = "watchoutrev@gmail.com" // Default admin email
		}
		
		// Get user details
		var user models.User
		db.First(&user, userID)
		
		// Send admin notification email
		emailService := services.NewEmailService()
		
		// Format email body
		emailBody := fmt.Sprintf(`
New Withdrawal Request Pending Manual Approval

---------------------------------------------
WITHDRAWAL DETAILS:
---------------------------------------------
Payout ID: %d
User: %s (ID: %d)
Email: %s
Amount: %.2f %s
Source: %s
Payment Account: %s
Bank: %s
Account Number: %s
Status: PENDING MANUAL APPROVAL

---------------------------------------------
INSTRUCTIONS:
---------------------------------------------
1. Login to Paystack dashboard: https://dashboard.paystack.com/#/transfers
2. Click "New Transfer" → "Single Transfer"
3. Transfer %.2f %s to:
   Bank: %s
   Account: %s
   Account Name: %s
4. After transfer is successful, mark this payout as completed:
   - Go to WeWatch admin panel
   - Payouts → Payout #%d → Mark as Completed
   - Enter Paystack transfer reference

OR use the API:
curl -X POST http://localhost:8080/api/payouts/%d/complete \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"gateway_transfer_id": "TRF_xxx"}'

---------------------------------------------
`, 
			payout.ID,
			user.Username, userID, user.Email,
			req.Amount, req.Currency,
			req.SourceType,
			*paymentAccount.AccountName,
			*paymentAccount.BankName,
			*paymentAccount.AccountNumber,
			req.Amount, req.Currency,
			*paymentAccount.BankName,
			*paymentAccount.AccountNumber,
			*paymentAccount.AccountName,
			payout.ID,
			payout.ID,
		)
		
		err := emailService.SendEmail(
			adminEmail,
			"[MANUAL ACTION REQUIRED] Withdrawal Request #"+fmt.Sprint(payout.ID),
			emailBody,
		)
		
		if err != nil {
			fmt.Printf("⚠️  Failed to send admin notification to %s: %v\n", adminEmail, err)
		} else {
			fmt.Printf("📧 Admin notification sent to %s for payout #%d\n", adminEmail, payout.ID)
		}
	}()
	
	// ⚠️ MANUAL WITHDRAWAL MODE: Do NOT auto-process transfer
	// Admin will manually transfer via Paystack dashboard and mark as completed
	// Comment out the automatic processing line:
	// go processWithdrawal(DB, payout.ID, paymentAccount)
	
	fmt.Printf("⏸️  MANUAL WITHDRAWAL: Payout #%d is pending admin approval\n", payout.ID)
	fmt.Printf("   Admin will manually transfer %.2f %s to %s\n", req.Amount, req.Currency, *paymentAccount.AccountName)
	
	c.JSON(http.StatusOK, gin.H{
		"message": "Withdrawal request submitted! Our team will process it within 24 hours.",
		"payout_id": payout.ID,
		"amount": req.Amount,
		"currency": req.Currency,
		"status": "pending", // ✅ Changed from "processing" to "pending" for manual approval
		"payment_account": paymentAccount.ToResponse(),
		"estimated_arrival": time.Now().Add(24 * time.Hour).Format(time.RFC3339),
		"manual_approval": true, // ✅ Flag to indicate manual approval required
	})
}

// processWithdrawal handles the actual transfer via Paystack or Stripe
func processWithdrawal(db *gorm.DB, payoutID uint, paymentAccount models.PaymentAccount) {
	// Fetch the payout record
	var payout models.Payout
	if err := db.First(&payout, payoutID).Error; err != nil {
		fmt.Printf("ERROR: Failed to fetch payout %d: %v\n", payoutID, err)
		return
	}
	
	// 🔒 CRITICAL: Check reserve balance before withdrawal
	accounting, accErr := models.GetPlatformAccounting(db)
	if accErr != nil {
		fmt.Printf("ERROR: Failed to get accounting for payout %d: %v\n", payoutID, accErr)
		payout.MarkAsFailed("Accounting system unavailable")
		db.Save(&payout)
		return
	}
	
	payoutAmount := float64(0)
	if payout.AmountValue != nil {
		payoutAmount = *payout.AmountValue
	}
	
	availableReserve := accounting.GetAvailableReserve()
	if availableReserve < payoutAmount {
		fmt.Printf("ERROR: Insufficient reserve balance for payout %d: Available=%.2f, Requested=%.2f\n", 
			payoutID, availableReserve, payoutAmount)
		payout.MarkAsFailed(fmt.Sprintf("Insufficient reserve balance (available: %.2f)", availableReserve))
		db.Save(&payout)
		return
	}
	
	// Mark as processing
	payout.MarkAsProcessing()
	db.Save(&payout)
	
	// 💰 Withdraw from RESERVE account (75% host money)
	var transferID string
	var err error
	
	if paymentAccount.IsPaystack() {
		// Use Reserve Subaccount (OPay - 75% split) for Paystack withdrawals
		fmt.Printf("💳 Withdrawing ₦%.2f from Reserve Subaccount (OPay) for payout %d\n", payoutAmount, payoutID)
		transferID, err = initiatePaystackTransfer(db, &payout, &paymentAccount)
	} else if paymentAccount.IsStripe() {
		// Use reserve account for Stripe withdrawals
		fmt.Printf("💳 Withdrawing $%.2f from RESERVE account (Stripe) for payout %d\n", payoutAmount, payoutID)
		transferID, err = initiateStripeTransfer(db, &payout, &paymentAccount)
	} else {
		err = fmt.Errorf("unsupported gateway: %s", paymentAccount.Gateway)
	}
	
	if err != nil {
		// ❌ Transfer failed - but don't show to user yet (might be Paystack account issue)
		fmt.Printf("⚠️  Transfer initiation failed for payout %d: %v\n", payoutID, err)
		
		// Check if it's the "starter business" error (temporary issue)
		errorStr := err.Error()
		isStarterBusinessError := strings.Contains(errorStr, "starter business") || 
			strings.Contains(errorStr, "third party payouts")
		
		if isStarterBusinessError {
			// Leave as "processing" for manual admin approval
			fmt.Printf("💡 Starter business detected - payout %d left as 'processing' for manual approval\n", payout.ID)
			payout.Status = string(models.PayoutStatusPending) // Change to pending for admin review
			db.Save(&payout)
			
			// Don't refund - admin will handle manually
			fmt.Printf("📋 Admin action required: Review payout %d in admin dashboard\n", payout.ID)
			return
		}
		
		// For other errors, mark as failed and refund
		fmt.Printf("❌ ERROR: Transfer failed for payout %d: %v\n", payoutID, err)
		
		// Mark as failed
		payout.MarkAsFailed(err.Error())
		db.Save(&payout)
		
		// 💰 REFUND: Restore the deducted balance
		if payout.PayoutType == "tokens" {
			// Refund tokens to wallet
			var wallet models.UserWallet
			if walletErr := db.Where("user_id = ?", payout.UserID).First(&wallet).Error; walletErr == nil {
				// Get refund amount in cents
				refundAmountCents := 0
				if payout.AmountTokens != nil {
					refundAmountCents = *payout.AmountTokens
				}
				
				if refundAmountCents > 0 {
					wallet.TokenBalance += refundAmountCents
					db.Save(&wallet)
					
					// Create refund transaction record
					refundTx := models.TokenTransaction{
					UserID:             payout.UserID,
					TransactionType:    models.TransactionTypeRefund,
					Amount:             refundAmountCents,
					Status:             models.TransactionStatusCompleted,
					Metadata:           map[string]interface{}{
						"balance_after": wallet.TokenBalance,
						"description":   fmt.Sprintf("Refund for failed withdrawal (Payout #%d): %s", payout.ID, err.Error()),
						"payout_id":     payout.ID,
					},
				}
				db.Create(&refundTx)
				
				fmt.Printf("✅ REFUND: Restored %d token cents to user %d wallet (Payout #%d)\n", 
					refundAmountCents, payout.UserID, payout.ID)
			}
		} else {
			fmt.Printf("⚠️  WARNING: Failed to refund tokens for payout %d: %v\n", payout.ID, walletErr)
		}
		
	} else if payout.PayoutType == "gateway_earnings" {
		// Refund gateway earnings - mark as not withdrawn
		refundAmount := float64(0)
		if payout.AmountValue != nil {
			refundAmount = *payout.AmountValue
	}
	
	if refundAmount > 0 {
		// Find earnings that were marked as withdrawn for this payout
		db.Model(&models.GatewayEarning{}).
			Where("withdrawn = ? AND payout_id = ?", true, payout.ID).
			Updates(map[string]interface{}{
				"withdrawn": false,
				"payout_id": nil,
			})
		
		fmt.Printf("✅ REFUND: Restored %.2f earnings to user %d (Payout #%d)\n", 
			refundAmount, payout.UserID, payout.ID)
	}
}

// Don't update platform accounting since transfer never happened
fmt.Printf("💡 Platform reserve balance unchanged (transfer never completed)\n")

// 📢 Notify user via WebSocket about failure and refund
manager := GetWebSocketManager()
if manager != nil {
	notificationMsg := map[string]interface{}{
		"type": "withdrawal_failed",
		"data": map[string]interface{}{
			"payout_id": payout.ID,
			"error":     err.Error(),
			"refunded":  true,
			"message":   "Withdrawal failed and funds have been refunded to your account",
		},
	}
	
	jsonBytes, _ := json.Marshal(notificationMsg)
	manager.BroadcastToUsers([]uint{payout.UserID}, OutgoingMessage{
		Data:     jsonBytes,
		IsBinary: false,
	})
	
	fmt.Printf("📢 Sent failure notification to user %d\n", payout.UserID)
}

return
}

// 📊 Update platform accounting - deduct from reserve
if processErr := accounting.ProcessPayout(payoutAmount); processErr != nil {
	fmt.Printf("WARNING: Accounting update failed for payout %d: %v\n", payoutID, processErr)
	// Don't fail the payout, but log the issue
} else {
	db.Save(accounting)
	fmt.Printf("📊 Reserve balance updated: %.2f → %.2f (paid out %.2f)\n", 
		availableReserve, accounting.GetAvailableReserve(), payoutAmount)
}

// Save transfer ID
payout.GatewayTransferID = &transferID
db.Save(&payout)
	
	// Update last used timestamp on payment account
	paymentAccount.MarkAsUsed()
	db.Save(&paymentAccount)
	
	fmt.Printf("SUCCESS: Transfer initiated for payout %d. Transfer ID: %s\n", payoutID, transferID)
	
	// Start polling for transfer status (webhook will also update this)
	go pollTransferStatus(db, payoutID, paymentAccount.Gateway, transferID)
}

// initiatePaystackTransfer sends money via Paystack Transfer API
func initiatePaystackTransfer(db *gorm.DB, payout *models.Payout, paymentAccount *models.PaymentAccount) (string, error) {
	// 🔒 CRITICAL: Use main account key (subaccounts are managed through main account)
	paystackSecretKey := os.Getenv("PAYSTACK_REVENUE_SECRET_KEY")
	if paystackSecretKey == "" {
		// Fallback to legacy key
		paystackSecretKey = os.Getenv("PAYSTACK_SECRET_KEY")
		if paystackSecretKey == "" {
			return "", fmt.Errorf("PAYSTACK_REVENUE_SECRET_KEY not configured")
		}
		fmt.Println("⚠️  WARNING: Using legacy Paystack key")
	}
	
	// Get Reserve Subaccount ID (OPay - 75% host earnings)
	reserveSubaccountID := os.Getenv("PAYSTACK_RESERVE_SUBACCOUNT_ID")
	if reserveSubaccountID == "" {
		return "", fmt.Errorf("PAYSTACK_RESERVE_SUBACCOUNT_ID not configured")
	}
	
	// Prepare transfer payload
	// Paystack amount is in kobo (for NGN) or pesewas (for GHS), etc.
	// Multiply by 100 for Naira/Cedi
	amountInMinorUnits := int(*payout.AmountValue * 100)
	
	transferPayload := map[string]interface{}{
		"source":     "balance",
		"reason":     fmt.Sprintf("Host withdrawal for payout #%d", payout.ID),
		"amount":     amountInMinorUnits,
		"recipient":  *paymentAccount.PaystackRecipientCode,
		"subaccount": reserveSubaccountID, // 🔑 Withdraw from Reserve Subaccount (OPay - 75% host money)
	}
	
	fmt.Printf("💸 Initiating transfer from Reserve Subaccount (%s): ₦%.2f to recipient %s\n", 
		reserveSubaccountID, *payout.AmountValue, *paymentAccount.PaystackRecipientCode)
	
	transferJSON, _ := json.Marshal(transferPayload)
	
	req, err := http.NewRequest("POST", "https://api.paystack.co/transfer", bytes.NewBuffer(transferJSON))
	if err != nil {
		return "", fmt.Errorf("failed to prepare transfer request: %w", err)
	}
	
	req.Header.Set("Authorization", "Bearer "+paystackSecretKey)
	req.Header.Set("Content-Type", "application/json")
	
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to call Paystack API: %w", err)
	}
	defer resp.Body.Close()
	
	body, _ := io.ReadAll(resp.Body)
	
	var transferResponse struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Data    struct {
			TransferCode string `json:"transfer_code"`
			ID           int    `json:"id"`
			Amount       int    `json:"amount"`
			Status       string `json:"status"` // 'pending', 'success', 'failed'
		} `json:"data"`
	}
	
	if err := json.Unmarshal(body, &transferResponse); err != nil {
		fmt.Printf("❌ Failed to parse Paystack response: %v\nRaw response: %s\n", err, string(body))
		return "", fmt.Errorf("failed to parse Paystack response: %w", err)
	}

	if !transferResponse.Status {
		fmt.Printf("❌ PAYSTACK TRANSFER FAILED\n")
		fmt.Printf("   Payout ID: %d\n", payout.ID)
		fmt.Printf("   Amount: ₦%.2f\n", *payout.AmountValue)
		fmt.Printf("   Recipient: %s\n", *paymentAccount.PaystackRecipientCode)
		fmt.Printf("   Subaccount: %s\n", reserveSubaccountID)
		fmt.Printf("   Error: %s\n", transferResponse.Message)
		fmt.Printf("   Request payload: %s\n", string(transferJSON))
		fmt.Printf("   Response body: %s\n", string(body))
	}
	
	return transferResponse.Data.TransferCode, nil
}

// initiateStripeTransfer sends money via Stripe Transfer API
func initiateStripeTransfer(db *gorm.DB, payout *models.Payout, paymentAccount *models.PaymentAccount) (string, error) {
	// 🔒 CRITICAL: Use RESERVE account key (75% host money - NOT revenue account!)
	stripeSecretKey := os.Getenv("STRIPE_RESERVE_SECRET_KEY")
	if stripeSecretKey == "" {
		// Fallback to main key for backward compatibility
		stripeSecretKey = os.Getenv("STRIPE_SECRET_KEY")
		if stripeSecretKey == "" {
			return "", fmt.Errorf("STRIPE_RESERVE_SECRET_KEY not configured")
		}
		fmt.Println("⚠️  WARNING: Using main Stripe key instead of reserve account")
	}
	
	// Prepare transfer payload
	// Stripe amount is in cents (for USD) or pence (for GBP), etc.
	// Multiply by 100
	amountInMinorUnits := int(*payout.AmountValue * 100)
	
	transferPayload := map[string]interface{}{
		"amount":      amountInMinorUnits,
		"currency":    *payout.AmountCurrency,
		"destination": *paymentAccount.StripeAccountID,
		"description": fmt.Sprintf("Withdrawal for payout #%d", payout.ID),
		"metadata": map[string]interface{}{
			"payout_id": fmt.Sprintf("%d", payout.ID),
			"user_id":   fmt.Sprintf("%d", payout.UserID),
		},
	}
	
	transferJSON, _ := json.Marshal(transferPayload)
	
	req, err := http.NewRequest("POST", "https://api.stripe.com/v1/transfers", bytes.NewBuffer(transferJSON))
	if err != nil {
		return "", fmt.Errorf("failed to prepare transfer request: %w", err)
	}
	
	req.Header.Set("Authorization", "Bearer "+stripeSecretKey)
	req.Header.Set("Content-Type", "application/json")
	
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to call Stripe API: %w", err)
	}
	defer resp.Body.Close()
	
	body, _ := io.ReadAll(resp.Body)
	
	var transferResponse struct {
		ID       string `json:"id"`
		Object   string `json:"object"`
		Amount   int    `json:"amount"`
		Currency string `json:"currency"`
		Status   string `json:"status"` // 'pending', 'paid', 'failed'
		Error    *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	
	if err := json.Unmarshal(body, &transferResponse); err != nil {
		return "", fmt.Errorf("failed to parse Stripe response: %w", err)
	}
	
	if transferResponse.Error != nil {
		return "", fmt.Errorf("stripe transfer failed: %s", transferResponse.Error.Message)
	}
	
	return transferResponse.ID, nil
}

// pollTransferStatus checks transfer status periodically until completion
func pollTransferStatus(db *gorm.DB, payoutID uint, gateway string, transferID string) {
	maxAttempts := 20 // Poll for up to 10 minutes (20 attempts * 30 seconds)
	attempt := 0
	
	for attempt < maxAttempts {
		time.Sleep(30 * time.Second) // Wait 30 seconds between checks
		attempt++
		
		// Fetch current payout status
		var payout models.Payout
		if err := db.First(&payout, payoutID).Error; err != nil {
			fmt.Printf("ERROR: Failed to fetch payout %d during polling: %v\n", payoutID, err)
			return
		}
		
		// If webhook already updated it, stop polling
		if payout.Status == string(models.PayoutStatusCompleted) || 
		   payout.Status == string(models.PayoutStatusFailed) {
			fmt.Printf("INFO: Payout %d already updated by webhook. Status: %s\n", payoutID, payout.Status)
			return
		}
		
		// Check status with gateway
		var status string
		var err error
		
		if gateway == "paystack" {
			status, err = checkPaystackTransferStatus(transferID)
		} else if gateway == "stripe" {
			status, err = checkStripeTransferStatus(transferID)
		}
		
		if err != nil {
			fmt.Printf("WARN: Failed to check transfer status for payout %d (attempt %d): %v\n", 
				payoutID, attempt, err)
			continue
		}
		
		// Update payout based on status
		if status == "success" || status == "paid" {
			payout.MarkAsCompleted(transferID)
			db.Save(&payout)
			fmt.Printf("SUCCESS: Payout %d completed. Transfer ID: %s\n", payoutID, transferID)
			
			// ✅ Send completion email
			go func() {
				if err := db.Preload("User").First(&payout, payoutID).Error; err == nil {
					if payout.User.ID > 0 {
						emailService := services.NewEmailService()
						amount := float64(0)
						if payout.AmountValue != nil {
							amount = *payout.AmountValue
						}
						currency := "NGN"
						if payout.AmountCurrency != nil {
							currency = *payout.AmountCurrency
						}
						err := emailService.SendWithdrawalCompletedEmail(
							payout.User.Email,
							payout.User.Username,
							amount,
							currency,
						)
						if err != nil {
							fmt.Printf("⚠️  Failed to send completion email: %v\n", err)
						}
					}
				}
			}()
			
			return
		} else if status == "failed" || status == "reversed" {
			failReason := "Transfer failed or reversed"
			payout.MarkAsFailed(failReason)
			db.Save(&payout)
			fmt.Printf("ERROR: Payout %d failed. Transfer ID: %s\n", payoutID, transferID)
			
			// ✅ Send failure email
			go func() {
				if err := db.Preload("User").First(&payout, payoutID).Error; err == nil {
					if payout.User.ID > 0 {
						emailService := services.NewEmailService()
						amount := float64(0)
						if payout.AmountValue != nil {
							amount = *payout.AmountValue
						}
						currency := "NGN"
						if payout.AmountCurrency != nil {
							currency = *payout.AmountCurrency
						}
						err := emailService.SendWithdrawalFailedEmail(
							payout.User.Email,
							payout.User.Username,
							amount,
							currency,
							failReason,
						)
						if err != nil {
							fmt.Printf("⚠️  Failed to send failure email: %v\n", err)
						}
					}
				}
			}()
			
			return
		}
		
		// Still pending, continue polling
		fmt.Printf("INFO: Payout %d still pending (attempt %d/%d). Status: %s\n", 
			payoutID, attempt, maxAttempts, status)
	}
	
	// Max attempts reached
	fmt.Printf("WARN: Payout %d polling timeout after %d attempts. Check manually.\n", 
		payoutID, maxAttempts)
}

// checkPaystackTransferStatus queries Paystack for transfer status
func checkPaystackTransferStatus(transferCode string) (string, error) {
	paystackSecretKey := os.Getenv("PAYSTACK_SECRET_KEY")
	if paystackSecretKey == "" {
		return "", fmt.Errorf("PAYSTACK_SECRET_KEY not configured")
	}
	
	req, err := http.NewRequest("GET", 
		fmt.Sprintf("https://api.paystack.co/transfer/%s", transferCode), nil)
	if err != nil {
		return "", err
	}
	
	req.Header.Set("Authorization", "Bearer "+paystackSecretKey)
	
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	
	body, _ := io.ReadAll(resp.Body)
	
	var response struct {
		Status bool `json:"status"`
		Data   struct {
			Status string `json:"status"` // 'pending', 'success', 'failed'
		} `json:"data"`
	}
	
	if err := json.Unmarshal(body, &response); err != nil {
		return "", err
	}
	
	return response.Data.Status, nil
}

// checkStripeTransferStatus queries Stripe for transfer status
func checkStripeTransferStatus(transferID string) (string, error) {
	stripeSecretKey := os.Getenv("STRIPE_SECRET_KEY")
	if stripeSecretKey == "" {
		return "", fmt.Errorf("STRIPE_SECRET_KEY not configured")
	}
	
	req, err := http.NewRequest("GET", 
		fmt.Sprintf("https://api.stripe.com/v1/transfers/%s", transferID), nil)
	if err != nil {
		return "", err
	}
	
	req.Header.Set("Authorization", "Bearer "+stripeSecretKey)
	
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	
	body, _ := io.ReadAll(resp.Body)
	
	var response struct {
		ID     string `json:"id"`
		Status string `json:"status"` // 'pending', 'paid', 'failed'
	}
	
	if err := json.Unmarshal(body, &response); err != nil {
		return "", err
	}
	
	return response.Status, nil
}

// checkPaystackSubaccountBalance queries Paystack API for subaccount balance
func checkPaystackSubaccountBalance(subaccountID string) (float64, error) {
	paystackSecretKey := os.Getenv("PAYSTACK_REVENUE_SECRET_KEY")
	if paystackSecretKey == "" {
		paystackSecretKey = os.Getenv("PAYSTACK_SECRET_KEY")
		if paystackSecretKey == "" {
			return 0, fmt.Errorf("PAYSTACK_REVENUE_SECRET_KEY not configured")
		}
	}
	
	// Fetch subaccount details
	req, err := http.NewRequest("GET", 
		fmt.Sprintf("https://api.paystack.co/subaccount/%s", subaccountID), nil)
	if err != nil {
		return 0, err
	}
	
	req.Header.Set("Authorization", "Bearer "+paystackSecretKey)
	
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	
	body, _ := io.ReadAll(resp.Body)
	
	var response struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Data    struct {
			ID                  int     `json:"id"`
			SubaccountCode      string  `json:"subaccount_code"`
			BusinessName        string  `json:"business_name"`
			SettlementBank      string  `json:"settlement_bank"`
			AccountNumber       string  `json:"account_number"`
			PercentageCharge    float64 `json:"percentage_charge"`
			Currency            string  `json:"currency"`
			Active              bool    `json:"active"`
			// Note: Balance is NOT returned in subaccount fetch API
			// You need to check the main account balance and track splits internally
		} `json:"data"`
	}
	
	if err := json.Unmarshal(body, &response); err != nil {
		return 0, fmt.Errorf("failed to parse response: %w", err)
	}
	
	if !response.Status {
		return 0, fmt.Errorf("paystack error: %s", response.Message)
	}
	
	// ⚠️ Paystack subaccounts don't expose balance via API
	// You need to track this in your platform_accounting table
	fmt.Printf("⚠️  WARNING: Paystack subaccount balance is not available via API\n")
	fmt.Printf("   Subaccount: %s (%s)\n", response.Data.BusinessName, response.Data.SubaccountCode)
	fmt.Printf("   You must track the balance in your platform_accounting.reserve_balance\n")
	
	return 0, fmt.Errorf("subaccount balance not available via Paystack API - track internally")
}
