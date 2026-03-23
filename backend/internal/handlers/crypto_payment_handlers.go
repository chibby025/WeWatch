// backend/internal/handlers/crypto_payment_handlers.go
package handlers

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// CoinbaseChargeResponse represents the response from Coinbase Commerce API
type CoinbaseChargeResponse struct {
	Data struct {
		ID          string `json:"id"`
		Code        string `json:"code"`
		Name        string `json:"name"`
		Description string `json:"description"`
		HostedURL   string `json:"hosted_url"`
		PricingType string `json:"pricing_type"`
		Pricing     struct {
			Local struct {
				Amount   string `json:"amount"`
				Currency string `json:"currency"`
			} `json:"local"`
		} `json:"pricing"`
		Addresses struct {
			Ethereum string `json:"ethereum,omitempty"`
			Polygon  string `json:"polygon,omitempty"`
			Base     string `json:"base,omitempty"`
		} `json:"addresses"`
		CreatedAt time.Time `json:"created_at"`
		ExpiresAt time.Time `json:"expires_at"`
	} `json:"data"`
}

// CreateCryptoChargeRequest represents the request to create a crypto payment
type CreateCryptoChargeRequest struct {
	AmountTokens int    `json:"amount_tokens" binding:"required,min=10,max=10000"`
	Currency     string `json:"currency" binding:"required,oneof=USD"` // Only USD for now
}

// CreateCryptoChargeHandler creates a Coinbase Commerce charge for token purchase
// POST /api/payments/crypto/create-charge
func CreateCryptoChargeHandler(c *gin.Context) {
	// Get authenticated user
	authUser, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	user := authUser.(*models.User)

	var req CreateCryptoChargeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Calculate USD amount (1 token = $0.10)
	usdAmount := float64(req.AmountTokens) * 0.10

	// Get Coinbase API key
	apiKey := os.Getenv("COINBASE_COMMERCE_API_KEY")
	if apiKey == "" {
		log.Println("❌ COINBASE_COMMERCE_API_KEY not set")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Payment gateway not configured"})
		return
	}

	// Create charge payload
	chargePayload := map[string]interface{}{
		"name":         fmt.Sprintf("WeWatch Token Purchase - %d tokens", req.AmountTokens),
		"description":  fmt.Sprintf("Purchase %d WeWatch tokens for user %s", req.AmountTokens, user.Username),
		"pricing_type": "fixed_price",
		"local_price": map[string]interface{}{
			"amount":   fmt.Sprintf("%.2f", usdAmount),
			"currency": "USD",
		},
		"metadata": map[string]interface{}{
			"user_id":       user.ID,
			"amount_tokens": req.AmountTokens,
			"customer_email": user.Email,
			"customer_name":  user.Username,
		},
		"redirect_url": os.Getenv("FRONTEND_URL") + "/payment/success",
		"cancel_url":   os.Getenv("FRONTEND_URL") + "/payment/cancel",
	}

	// Marshal payload
	payloadBytes, err := json.Marshal(chargePayload)
	if err != nil {
		log.Printf("❌ Error marshaling charge payload: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create payment"})
		return
	}

	// Create HTTP request to Coinbase Commerce API
	req2, err := http.NewRequest("POST", "https://api.commerce.coinbase.com/charges", 
		io.NopCloser(bytes.NewReader(payloadBytes)))
	if err != nil {
		log.Printf("❌ Error creating request: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create payment"})
		return
	}

	// Set headers
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("X-CC-Api-Key", apiKey)
	req2.Header.Set("X-CC-Version", "2018-03-22")

	// Send request
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req2)
	if err != nil {
		log.Printf("❌ Error sending request to Coinbase: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create payment"})
		return
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("❌ Error reading response: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create payment"})
		return
	}

	// Check status code
	if resp.StatusCode != http.StatusCreated {
		log.Printf("❌ Coinbase API error (status %d): %s", resp.StatusCode, string(body))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Payment gateway error"})
		return
	}

	// Parse response
	var chargeResp CoinbaseChargeResponse
	if err := json.Unmarshal(body, &chargeResp); err != nil {
		log.Printf("❌ Error parsing Coinbase response: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse payment response"})
		return
	}

	// Create pending transaction in database
	db := c.MustGet("db").(*gorm.DB)
	usdVal := usdAmount
	paymentMethod := "coinbase_commerce"
	
	transaction := models.TokenTransaction{
		UserID:            user.ID,
		TransactionType:   models.TransactionTypePurchase,
		Amount:            req.AmountTokens,
		USDValue:          &usdVal,
		PaymentMethod:     &paymentMethod,
		Status:            models.TransactionStatusPending,
		PaymentProvider:   "coinbase_commerce",
		CoinbaseChargeID:  chargeResp.Data.ID,
	}

	if err := db.Create(&transaction).Error; err != nil {
		log.Printf("❌ Error creating transaction record: %v", err)
		// Don't fail - user can still pay, we'll handle via webhook
	}

	log.Printf("💰 Created crypto charge for user %d: %d tokens ($%.2f) - Charge ID: %s", 
		user.ID, req.AmountTokens, usdAmount, chargeResp.Data.ID)

	// Return hosted URL for payment
	c.JSON(http.StatusOK, gin.H{
		"charge_id":   chargeResp.Data.ID,
		"hosted_url":  chargeResp.Data.HostedURL,
		"amount_usd":  usdAmount,
		"amount_tokens": req.AmountTokens,
		"expires_at":  chargeResp.Data.ExpiresAt,
	})
}

// CoinbaseWebhookHandler handles payment notifications from Coinbase Commerce
// POST /api/payments/crypto/webhook
func CoinbaseWebhookHandler(c *gin.Context) {
	// Get webhook secret
	webhookSecret := os.Getenv("COINBASE_COMMERCE_WEBHOOK_SECRET")
	if webhookSecret == "" {
		log.Println("❌ COINBASE_COMMERCE_WEBHOOK_SECRET not set")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Webhook not configured"})
		return
	}

	// Read request body
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		log.Printf("❌ Error reading webhook body: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Verify webhook signature
	signature := c.GetHeader("X-CC-Webhook-Signature")
	if !verifyWebhookSignature(body, signature, webhookSecret) {
		log.Println("❌ Invalid webhook signature")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid signature"})
		return
	}

	// Parse webhook payload
	var webhook struct {
		Event struct {
			Type string `json:"type"`
			Data struct {
				ID       string `json:"id"`
				Code     string `json:"code"`
				Metadata struct {
					UserID       uint   `json:"user_id"`
					AmountTokens int    `json:"amount_tokens"`
				} `json:"metadata"`
				Payments []struct {
					Network     string `json:"network"`
					Transaction string `json:"transaction_id"`
					Value       struct {
						Crypto struct {
							Amount   string `json:"amount"`
							Currency string `json:"currency"`
						} `json:"crypto"`
					} `json:"value"`
					Status string `json:"status"`
				} `json:"payments"`
			} `json:"data"`
		} `json:"event"`
	}

	if err := json.Unmarshal(body, &webhook); err != nil {
		log.Printf("❌ Error parsing webhook: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	log.Printf("📬 Received Coinbase webhook: %s for charge %s", 
		webhook.Event.Type, webhook.Event.Data.ID)

	// Handle different event types
	switch webhook.Event.Type {
	case "charge:confirmed":
		handleChargeConfirmed(c, webhook.Event.Data)
	case "charge:failed":
		handleChargeFailed(c, webhook.Event.Data)
	case "charge:pending":
		log.Printf("⏳ Charge pending: %s", webhook.Event.Data.ID)
	default:
		log.Printf("ℹ️ Unhandled webhook type: %s", webhook.Event.Type)
	}

	c.JSON(http.StatusOK, gin.H{"status": "received"})
}

// verifyWebhookSignature verifies the Coinbase Commerce webhook signature
func verifyWebhookSignature(payload []byte, signature, secret string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	expectedSignature := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(signature), []byte(expectedSignature))
}

// handleChargeConfirmed processes a confirmed crypto payment
func handleChargeConfirmed(c *gin.Context, data interface{}) {
	db := c.MustGet("db").(*gorm.DB)
	
	// Type assert to access data
	chargeData := data.(struct {
		ID       string `json:"id"`
		Code     string `json:"code"`
		Metadata struct {
			UserID       uint `json:"user_id"`
			AmountTokens int  `json:"amount_tokens"`
		} `json:"metadata"`
		Payments []struct {
			Network     string `json:"network"`
			Transaction string `json:"transaction_id"`
			Value       struct {
				Crypto struct {
					Amount   string `json:"amount"`
					Currency string `json:"currency"`
				} `json:"crypto"`
			} `json:"value"`
			Status string `json:"status"`
		} `json:"payments"`
	})

	userID := chargeData.Metadata.UserID
	amountTokens := chargeData.Metadata.AmountTokens
	chargeID := chargeData.ID

	// Get payment details
	var cryptoCurrency, cryptoAmount, network, txHash string
	if len(chargeData.Payments) > 0 {
		payment := chargeData.Payments[0]
		cryptoCurrency = payment.Value.Crypto.Currency
		cryptoAmount = payment.Value.Crypto.Amount
		network = payment.Network
		txHash = payment.Transaction
	}

	log.Printf("✅ Payment confirmed! User %d paid %s %s for %d tokens (Charge: %s, Tx: %s)",
		userID, cryptoAmount, cryptoCurrency, amountTokens, chargeID, txHash)

	// Find transaction in database
	var transaction models.TokenTransaction
	result := db.Where("coinbase_charge_id = ?", chargeID).First(&transaction)
	
	if result.Error != nil {
		log.Printf("⚠️ Transaction not found in DB, creating new one")
		// Create new transaction
		usdVal := float64(amountTokens) * 0.10
		paymentMethod := "coinbase_commerce"
		
		transaction = models.TokenTransaction{
			UserID:           userID,
			TransactionType:  models.TransactionTypePurchase,
			Amount:           amountTokens,
			USDValue:         &usdVal,
			PaymentMethod:    &paymentMethod,
			Status:           models.TransactionStatusCompleted,
			PaymentProvider:  "coinbase_commerce",
			CoinbaseChargeID: chargeID,
			CryptoCurrency:   cryptoCurrency,
			CryptoAmount:     cryptoAmount,
			CryptoNetwork:    network,
			BlockchainTxHash: txHash,
		}
		db.Create(&transaction)
	} else {
		// Update existing transaction
		transaction.Status = models.TransactionStatusCompleted
		transaction.CryptoCurrency = cryptoCurrency
		transaction.CryptoAmount = cryptoAmount
		transaction.CryptoNetwork = network
		transaction.BlockchainTxHash = txHash
		db.Save(&transaction)
	}

	// Credit user wallet
	var wallet models.UserWallet
	if err := db.Where("user_id = ?", userID).First(&wallet).Error; err != nil {
		log.Printf("❌ Wallet not found for user %d", userID)
		return
	}

	wallet.AddTokens(amountTokens)
	if err := db.Save(&wallet).Error; err != nil {
		log.Printf("❌ Error crediting wallet: %v", err)
		return
	}

	log.Printf("💰 Credited %d tokens to user %d wallet (new balance: %d)", 
		amountTokens, userID, wallet.TokenBalance)

	// TODO: Send email confirmation
}

// handleChargeFailed processes a failed crypto payment
func handleChargeFailed(c *gin.Context, data interface{}) {
	// Similar structure, just mark as failed
	log.Printf("❌ Charge failed: %+v", data)
	
	// Update transaction status to failed
	// db.Model(&transaction).Where("coinbase_charge_id = ?", chargeID).
	//     Update("status", models.TransactionStatusFailed)
}
