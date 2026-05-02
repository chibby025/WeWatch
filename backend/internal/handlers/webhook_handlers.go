// WeWatch/backend/internal/handlers/webhook_handlers.go
package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// StripeWebhookEvent represents a Stripe webhook event
type StripeWebhookEvent struct {
	ID   string `json:"id"`
	Type string `json:"type"`
	Data struct {
		Object struct {
			ID               string `json:"id"`
			Amount           int64  `json:"amount"`
			Currency         string `json:"currency"`
			Status           string `json:"status"`
			Metadata         map[string]string `json:"metadata"`
			PaymentIntent    string `json:"payment_intent,omitempty"`
		} `json:"object"`
	} `json:"data"`
}

// calculatePaystackFee calculates Paystack transaction fee based on official pricing
// https://paystack.com/pricing
// https://support.paystack.com/en/articles/2130306
//
// Local cards (Nigerian):
// - < ₦2,500: 1.5% only (₦100 waived)
// - ≥ ₦2,500: 1.5% + ₦100 (capped at ₦2,000)
//
// International cards:
// - 3.9% + ₦100 (no waiver, no cap)
func calculatePaystackFee(amountNGN float64, countryCode string) float64 {
	isInternational := countryCode != "" && countryCode != "NG"
	
	if isInternational {
		// International cards: 3.9% + ₦100 (no waiver, no cap)
		return (amountNGN * 0.039) + 100.0
	}
	
	// Local Nigerian cards
	if amountNGN < 2500.0 {
		// Small transactions: 1.5% only (₦100 fee waived)
		return amountNGN * 0.015
	}
	
	// Medium/Large transactions: 1.5% + ₦100
	fee := (amountNGN * 0.015) + 100.0
	
	// Cap at ₦2,000 for local transactions
	if fee > 2000.0 {
		return 2000.0
	}
	
	return fee
}

// PaystackWebhookEvent represents a Paystack webhook event
type PaystackWebhookEvent struct {
	Event string `json:"event"`
	Data  struct {
		ID        int64  `json:"id"`
		Reference string `json:"reference"`
		Amount    int64  `json:"amount"`
		Currency  string `json:"currency"`
		Status    string `json:"status"`
		Metadata  map[string]interface{} `json:"metadata"`
		Authorization struct {
			CardType    string `json:"card_type"`
			CountryCode string `json:"country_code"`
			Bank        string `json:"bank"`
		} `json:"authorization"`
	} `json:"data"`
}

// StripeWebhookHandler handles Stripe payment webhooks
// POST /api/webhooks/stripe
func StripeWebhookHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get Stripe signature from headers
		signature := c.GetHeader("Stripe-Signature")
		if signature == "" {
			log.Println("❌ Missing Stripe signature")
			c.JSON(http.StatusBadRequest, gin.H{"error": "Missing signature"})
			return
		}

		// Read request body
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			log.Printf("❌ Error reading Stripe webhook body: %v", err)
			c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot read body"})
			return
		}

		// Verify webhook signature
		webhookSecret := os.Getenv("STRIPE_WEBHOOK_SECRET")
		if webhookSecret == "" {
			log.Println("⚠️ STRIPE_WEBHOOK_SECRET not set, skipping signature verification")
		} else {
			if !verifyStripeSignature(body, signature, webhookSecret) {
				log.Println("❌ Invalid Stripe signature")
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid signature"})
				return
			}
		}

		// Parse webhook event
		var event StripeWebhookEvent
		if err := json.Unmarshal(body, &event); err != nil {
			log.Printf("❌ Error parsing Stripe webhook: %v", err)
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON"})
			return
		}

		log.Printf("📥 Stripe webhook received: Type=%s, ID=%s", event.Type, event.ID)

		// ✅ P0 Security Fix: Check if webhook already processed (idempotency)
		if models.IsWebhookProcessed(db, event.ID) {
			log.Printf("✅ Webhook already processed (idempotent): %s", event.ID)
			c.JSON(http.StatusOK, gin.H{"received": true, "status": "already_processed"})
			return
		}

		// ✅ Mark as processed BEFORE handling (prevents race condition)
		if err := models.MarkWebhookProcessed(db, event.ID, event.Type, "stripe"); err != nil {
			log.Printf("⚠️ Warning: Failed to mark webhook as processed: %v", err)
		}

		// Handle different event types
		switch event.Type {
		case "payment_intent.succeeded":
			handleStripePaymentSuccess(db, &event)
		case "payment_intent.payment_failed":
			handleStripePaymentFailed(db, &event)
		case "charge.refunded":
			handleStripeRefund(db, &event)
		default:
			log.Printf("⚠️ Unhandled Stripe event type: %s", event.Type)
		}

		c.JSON(http.StatusOK, gin.H{"received": true})
	}
}

// PaystackWebhookHandler handles Paystack payment webhooks
// POST /api/webhooks/paystack
func PaystackWebhookHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get Paystack signature from headers
		signature := c.GetHeader("x-paystack-signature")
		if signature == "" {
			log.Println("❌ Missing Paystack signature")
			c.JSON(http.StatusBadRequest, gin.H{"error": "Missing signature"})
			return
		}

		// Read request body
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			log.Printf("❌ Error reading Paystack webhook body: %v", err)
			c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot read body"})
			return
		}

		// Verify webhook signature
		webhookSecret := os.Getenv("PAYSTACK_SECRET_KEY")
		if webhookSecret == "" {
			log.Println("⚠️ PAYSTACK_SECRET_KEY not set, skipping signature verification")
		} else {
			if !verifyPaystackSignature(body, signature, webhookSecret) {
				log.Println("❌ Invalid Paystack signature")
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid signature"})
				return
			}
		}

		// Parse webhook event
		var event PaystackWebhookEvent
		if err := json.Unmarshal(body, &event); err != nil {
			log.Printf("❌ Error parsing Paystack webhook: %v", err)
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON"})
			return
		}

		log.Printf("📥 Paystack webhook received: Event=%s, Reference=%s", event.Event, event.Data.Reference)

		// ✅ P0 Security Fix: Check if webhook already processed (idempotency)
		eventID := event.Data.Reference // Use reference as unique event ID
		if models.IsWebhookProcessed(db, eventID) {
			log.Printf("✅ Webhook already processed (idempotent): %s", eventID)
			c.JSON(http.StatusOK, gin.H{"status": "already_processed"})
			return
		}

		// ✅ Mark as processed BEFORE handling (prevents race condition)
		if err := models.MarkWebhookProcessed(db, eventID, event.Event, "paystack"); err != nil {
			log.Printf("⚠️ Warning: Failed to mark webhook as processed: %v", err)
		}

		// Handle different event types
		switch event.Event {
		case "charge.success":
			handlePaystackPaymentSuccess(db, &event)
		case "charge.failed":
			handlePaystackPaymentFailed(db, &event)
		case "refund.processed":
			handlePaystackRefund(db, &event)
		default:
			log.Printf("⚠️ Unhandled Paystack event type: %s", event.Event)
		}

		c.JSON(http.StatusOK, gin.H{"status": "success"})
	}
}

// verifyStripeSignature verifies Stripe webhook signature
func verifyStripeSignature(payload []byte, signature, secret string) bool {
	// Stripe signature format: t=timestamp,v1=signature
	// For simplicity, we'll just verify the v1 signature
	// In production, you should also verify the timestamp to prevent replay attacks

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	expectedSignature := hex.EncodeToString(mac.Sum(nil))

	// Extract v1 signature from header
	// TODO: Implement proper signature extraction and timestamp verification
	// For now, we'll do a simple comparison
	return hmac.Equal([]byte(signature), []byte(expectedSignature))
}

// verifyPaystackSignature verifies Paystack webhook signature
func verifyPaystackSignature(payload []byte, signature, secret string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	expectedSignature := hex.EncodeToString(mac.Sum(nil))

	return hmac.Equal([]byte(signature), []byte(expectedSignature))
}

// handleStripePaymentSuccess processes successful Stripe payment
func handleStripePaymentSuccess(db *gorm.DB, event *StripeWebhookEvent) {
	transactionID := event.Data.Object.Metadata["transaction_id"]
	if transactionID == "" {
		log.Println("❌ Missing transaction_id in Stripe metadata")
		return
	}

	// Find transaction
	var transaction models.TokenTransaction
	if err := db.Where("id = ?", transactionID).First(&transaction).Error; err != nil {
		log.Printf("❌ Transaction not found: %s", transactionID)
		return
	}

	// Check if already processed
	if transaction.Status == models.TransactionStatusCompleted {
		log.Printf("⚠️ Transaction already completed: %s", transactionID)
		return
	}

	// Update transaction status
	transaction.Status = models.TransactionStatusCompleted
	transaction.PaymentID = &event.Data.Object.PaymentIntent

	// Credit user wallet
	var wallet models.UserWallet
	result := db.Where("user_id = ?", transaction.UserID).First(&wallet)
	if result.Error == gorm.ErrRecordNotFound {
		wallet = models.UserWallet{
			UserID:         transaction.UserID,
			TokenBalance:   0,
			LifetimeEarned: 0,
			LifetimeSpent:  0,
		}
		db.Create(&wallet)
	}

	wallet.AddTokens(transaction.Amount)

	// Save changes in transaction
	tx := db.Begin()
	if err := tx.Save(&transaction).Error; err != nil {
		tx.Rollback()
		log.Printf("❌ Error updating transaction: %v", err)
		return
	}

	if err := tx.Save(&wallet).Error; err != nil {
		tx.Rollback()
		log.Printf("❌ Error updating wallet: %v", err)
		return
	}

	tx.Commit()

	log.Printf("✅ Stripe payment processed: User %d received %d tokens", transaction.UserID, transaction.Amount)

	// TODO: Send WebSocket notification to user
}

// handleStripePaymentFailed processes failed Stripe payment
func handleStripePaymentFailed(db *gorm.DB, event *StripeWebhookEvent) {
	transactionID := event.Data.Object.Metadata["transaction_id"]
	if transactionID == "" {
		log.Println("❌ Missing transaction_id in Stripe metadata")
		return
	}

	// Find transaction
	var transaction models.TokenTransaction
	if err := db.Where("id = ?", transactionID).First(&transaction).Error; err != nil {
		log.Printf("❌ Transaction not found: %s", transactionID)
		return
	}

	// Update transaction status
	transaction.Status = models.TransactionStatusFailed
	transaction.PaymentID = &event.Data.Object.PaymentIntent

	if err := db.Save(&transaction).Error; err != nil {
		log.Printf("❌ Error updating transaction: %v", err)
		return
	}

	log.Printf("❌ Stripe payment failed: Transaction %s", transactionID)

	// TODO: Send WebSocket notification to user
}

// handleStripeRefund processes Stripe refund
func handleStripeRefund(db *gorm.DB, event *StripeWebhookEvent) {
	// TODO: Implement refund handling
	log.Printf("💰 Stripe refund received: %s", event.Data.Object.ID)
}

// handlePaystackPaymentSuccess processes successful Paystack payment
func handlePaystackPaymentSuccess(db *gorm.DB, event *PaystackWebhookEvent) {
	reference := event.Data.Reference
	if reference == "" {
		log.Println("❌ Missing reference in Paystack event")
		return
	}

	// Find transaction by reference
	var transaction models.TokenTransaction
	if err := db.Where("payment_id = ?", reference).First(&transaction).Error; err != nil {
		log.Printf("❌ Transaction not found: %s", reference)
		return
	}

	// Check if already processed
	if transaction.Status == models.TransactionStatusCompleted {
		log.Printf("⚠️ Transaction already completed: %s", reference)
		return
	}

	// Update transaction status
	transaction.Status = models.TransactionStatusCompleted

	// Credit user wallet
	var wallet models.UserWallet
	result := db.Where("user_id = ?", transaction.UserID).First(&wallet)
	if result.Error == gorm.ErrRecordNotFound {
		wallet = models.UserWallet{
			UserID:         transaction.UserID,
			TokenBalance:   0,
			LifetimeEarned: 0,
			LifetimeSpent:  0,
		}
		db.Create(&wallet)
	}

	wallet.AddTokens(transaction.Amount)

	// 📊 Update platform accounting with NET payment amount (after Paystack fees)
	// Convert from kobo to naira (e.g., 20000 kobo = ₦200)
	grossAmount := float64(event.Data.Amount) / 100.0
	
	// Calculate Paystack fees using official pricing tiers
	countryCode := event.Data.Authorization.CountryCode
	gatewayFee := calculatePaystackFee(grossAmount, countryCode)
	netAmount := grossAmount - gatewayFee
	
	// Log fee calculation details
	if countryCode != "" && countryCode != "NG" {
		log.Printf("💳 International card (Country: %s) - Fee: ₦%.2f (3.9%% + ₦100)", countryCode, gatewayFee)
	} else if grossAmount < 2500.0 {
		log.Printf("💳 Local card (Nigeria) - Fee: ₦%.2f (1.5%% only, ₦100 waived)", gatewayFee)
	} else if gatewayFee >= 2000.0 {
		log.Printf("💳 Local card (Nigeria) - Fee: ₦%.2f (capped at ₦2,000)", gatewayFee)
	} else {
		log.Printf("💳 Local card (Nigeria) - Fee: ₦%.2f (1.5%% + ₦100)", gatewayFee)
	}
	
	accounting, accErr := models.GetPlatformAccounting(db)
	if accErr != nil {
		log.Printf("❌ Failed to get platform accounting: %v", accErr)
		// Don't fail the transaction, but log the error
	} else {
		// Record token purchase: Track NET amount (what we actually received)
		// User paid ₦200, Paystack kept ₦3, we got ₦197
		accounting.AddTokenPurchaseWithFee(grossAmount, netAmount, gatewayFee)
		if saveErr := db.Save(accounting).Error; saveErr != nil {
			log.Printf("❌ Failed to save platform accounting: %v", saveErr)
		} else {
			log.Printf("💰 Platform accounting updated: User paid ₦%.2f, Gateway fee ₦%.2f, Net received ₦%.2f (Profit: ₦%.2f, Reserve: ₦%.2f)", 
				grossAmount, gatewayFee, netAmount, accounting.PlatformProfit, accounting.HostReserveBalance)
		}
	}

	// Save changes in transaction
	tx := db.Begin()
	if err := tx.Save(&transaction).Error; err != nil {
		tx.Rollback()
		log.Printf("❌ Error updating transaction: %v", err)
		return
	}

	if err := tx.Save(&wallet).Error; err != nil {
		tx.Rollback()
		log.Printf("❌ Error updating wallet: %v", err)
		return
	}

	tx.Commit()

	log.Printf("✅ Paystack payment processed: User %d received %d tokens (User paid ₦%.2f, Net received ₦%.2f)", 
		transaction.UserID, transaction.Amount, grossAmount, netAmount)

	// TODO: Send WebSocket notification to user
}

// handlePaystackPaymentFailed processes failed Paystack payment
func handlePaystackPaymentFailed(db *gorm.DB, event *PaystackWebhookEvent) {
	reference := event.Data.Reference
	if reference == "" {
		log.Println("❌ Missing reference in Paystack event")
		return
	}

	// Find transaction by reference
	var transaction models.TokenTransaction
	if err := db.Where("payment_id = ?", reference).First(&transaction).Error; err != nil {
		log.Printf("❌ Transaction not found: %s", reference)
		return
	}

	// Update transaction status
	transaction.Status = models.TransactionStatusFailed

	if err := db.Save(&transaction).Error; err != nil {
		log.Printf("❌ Error updating transaction: %v", err)
		return
	}

	log.Printf("❌ Paystack payment failed: Reference %s", reference)

	// TODO: Send WebSocket notification to user
}

// handlePaystackRefund processes Paystack refund
func handlePaystackRefund(db *gorm.DB, event *PaystackWebhookEvent) {
	// TODO: Implement refund handling
	log.Printf("💰 Paystack refund received: %s", event.Data.Reference)
}

// GetWebhookSecrets returns webhook configuration (for testing)
// GET /api/webhooks/config
func GetWebhookConfigHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Only return in development mode
		if os.Getenv("ENV") != "development" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Not available in production"})
			return
		}

		config := gin.H{
			"stripe": gin.H{
				"endpoint": "/api/webhooks/stripe",
				"secret_set": os.Getenv("STRIPE_WEBHOOK_SECRET") != "",
			},
			"paystack": gin.H{
				"endpoint": "/api/webhooks/paystack",
				"secret_set": os.Getenv("PAYSTACK_SECRET_KEY") != "",
			},
		}

		c.JSON(http.StatusOK, config)
	}
}

// TestWebhookHandler allows testing webhooks in development
// POST /api/webhooks/test
func TestWebhookHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Only allow in development mode
		if os.Getenv("ENV") != "development" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Not available in production"})
			return
		}

		var req struct {
			Provider      string `json:"provider" binding:"required,oneof=stripe paystack"`
			TransactionID uint   `json:"transaction_id" binding:"required"`
			Success       bool   `json:"success"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Find transaction
		var transaction models.TokenTransaction
		if err := db.First(&transaction, req.TransactionID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Transaction not found"})
			return
		}

		// Simulate webhook
		if req.Success {
			if req.Provider == "stripe" {
				mockEvent := &StripeWebhookEvent{}
				mockEvent.Type = "payment_intent.succeeded"
				mockEvent.Data.Object.Metadata = map[string]string{
					"transaction_id": fmt.Sprintf("%d", req.TransactionID),
				}
				handleStripePaymentSuccess(db, mockEvent)
			} else {
				mockEvent := &PaystackWebhookEvent{}
				mockEvent.Event = "charge.success"
				mockEvent.Data.Reference = fmt.Sprintf("%d", req.TransactionID)
				handlePaystackPaymentSuccess(db, mockEvent)
			}
		} else {
			if req.Provider == "stripe" {
				mockEvent := &StripeWebhookEvent{}
				mockEvent.Type = "payment_intent.payment_failed"
				mockEvent.Data.Object.Metadata = map[string]string{
					"transaction_id": fmt.Sprintf("%d", req.TransactionID),
				}
				handleStripePaymentFailed(db, mockEvent)
			} else {
				mockEvent := &PaystackWebhookEvent{}
				mockEvent.Event = "charge.failed"
				mockEvent.Data.Reference = fmt.Sprintf("%d", req.TransactionID)
				handlePaystackPaymentFailed(db, mockEvent)
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Webhook simulated",
		})
	}
}
