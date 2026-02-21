package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"wewatch-backend/internal/models"
)

// PaystackBankListResponse represents the response from Paystack List Banks API
type PaystackBankListResponse struct {
	Status  bool   `json:"status"`
	Message string `json:"message"`
	Data    []struct {
		ID       int    `json:"id"`
		Name     string `json:"name"`
		Slug     string `json:"slug"`
		Code     string `json:"code"`
		Country  string `json:"country"`
		Currency string `json:"currency"`
		Type     string `json:"type"`
		Active   bool   `json:"active"`
	} `json:"data"`
}

// PaystackResolveAccountResponse represents the response from Paystack Resolve Account Number API
type PaystackResolveAccountResponse struct {
	Status  bool   `json:"status"`
	Message string `json:"message"`
	Data    struct {
		AccountNumber string `json:"account_number"`
		AccountName   string `json:"account_name"`
		BankID        int    `json:"bank_id"`
	} `json:"data"`
}

// PaystackCreateRecipientResponse represents the response from Paystack Create Transfer Recipient API
type PaystackCreateRecipientResponse struct {
	Status  bool   `json:"status"`
	Message string `json:"message"`
	Data    struct {
		Active        bool   `json:"active"`
		CreatedAt     string `json:"createdAt"`
		Currency      string `json:"currency"`
		Domain        string `json:"domain"`
		ID            int    `json:"id"`
		Integration   int    `json:"integration"`
		Name          string `json:"name"`
		RecipientCode string `json:"recipient_code"`
		Type          string `json:"type"`
		IsDeleted     bool   `json:"is_deleted"`
		Details       struct {
			AccountNumber string `json:"account_number"`
			AccountName   string `json:"account_name"`
			BankCode      string `json:"bank_code"`
			BankName      string `json:"bank_name"`
		} `json:"details"`
	} `json:"data"`
}

// AddPaystackBankAccountRequest represents a request to add a Paystack bank account
type AddPaystackBankAccountRequest struct {
	BankCode      string `json:"bank_code" binding:"required"`
	AccountNumber string `json:"account_number" binding:"required"`
	Currency      string `json:"currency" binding:"required,oneof=NGN GHS ZAR KES"`
	IsPrimary     bool   `json:"is_primary"`
}

// GetPaystackBanks returns the list of banks for a given country
// GET /api/payment-accounts/paystack/banks/:country
func GetPaystackBanks(c *gin.Context) {
	country := strings.ToUpper(c.Param("country"))
	
	// Validate country
	validCountries := map[string]string{
		"NG": "NGN", // Nigeria
		"GH": "GHS", // Ghana
		"ZA": "ZAR", // South Africa
		"KE": "KES", // Kenya
	}
	
	currency, valid := validCountries[country]
	if !valid {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported country. Supported: NG, GH, ZA, KE"})
		return
	}
	
	// Get Paystack secret key from environment (use Revenue account for bank lookups)
	paystackSecretKey := os.Getenv("PAYSTACK_REVENUE_SECRET_KEY")
	if paystackSecretKey == "" {
		// Fallback to legacy key name for backward compatibility
		paystackSecretKey = os.Getenv("PAYSTACK_SECRET_KEY")
	}
	if paystackSecretKey == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Paystack not configured"})
		return
	}
	
	// Debug: Log the secret key prefix (first 15 chars to verify it's loaded)
	fmt.Printf("🔑 Using Paystack key: %s...\n", paystackSecretKey[:15])
	
	// Call Paystack List Banks API - Try WITHOUT any parameters
	apiURL := "https://api.paystack.co/bank"
	fmt.Printf("🌐 Calling Paystack API: %s (NO filters - getting ALL banks)\n", apiURL)
	
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare request"})
		return
	}
	
	req.Header.Set("Authorization", "Bearer "+paystackSecretKey)
	req.Header.Set("Content-Type", "application/json")
	
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch banks from Paystack"})
		return
	}
	defer resp.Body.Close()
	
	body, _ := io.ReadAll(resp.Body)
	
	// Debug: Log the raw response from Paystack
	fmt.Printf("🏦 Paystack API Response Status: %d\n", resp.StatusCode)
	fmt.Printf("🏦 Paystack API Response Body: %s\n", string(body))
	
	var paystackResponse PaystackBankListResponse
	if err := json.Unmarshal(body, &paystackResponse); err != nil {
		fmt.Printf("❌ Failed to parse Paystack response: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse Paystack response"})
		return
	}
	
	fmt.Printf("🏦 Paystack Response Status: %v, Total Banks: %d\n", paystackResponse.Status, len(paystackResponse.Data))
	
	if !paystackResponse.Status {
		fmt.Printf("❌ Paystack returned error: %s\n", paystackResponse.Message)
		c.JSON(http.StatusBadRequest, gin.H{"error": paystackResponse.Message})
		return
	}
	
	// Return only active banks
	activeBanks := []gin.H{}
	for _, bank := range paystackResponse.Data {
		if bank.Active {
			activeBanks = append(activeBanks, gin.H{
				"name":     bank.Name,
				"code":     bank.Code,
				"country":  bank.Country,
				"currency": bank.Currency,
			})
		}
	}
	
	fmt.Printf("🏦 Active Banks Count: %d / %d\n", len(activeBanks), len(paystackResponse.Data))
	
	c.JSON(http.StatusOK, gin.H{
		"banks":    activeBanks,
		"country":  country,
		"currency": currency,
	})
}

// AddPaystackBankAccount verifies and adds a Paystack bank account for the authenticated user
// POST /api/payment-accounts/paystack
func AddPaystackBankAccount(c *gin.Context) {
	// Get authenticated user ID from context
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDInterface.(uint)
	
	// Parse request body
	var req AddPaystackBankAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Get database connection from context
	db := c.MustGet("db").(*gorm.DB)
	
	// Get Paystack secret key from environment (use revenue account for payouts)
	paystackSecretKey := os.Getenv("PAYSTACK_REVENUE_SECRET_KEY")
	if paystackSecretKey == "" {
		paystackSecretKey = os.Getenv("PAYSTACK_SECRET_KEY") // fallback
	}
	if paystackSecretKey == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Paystack not configured"})
		return
	}
	
	fmt.Printf("💳 Adding Paystack account for user %d\n", userID)
	fmt.Printf("🔑 Using Paystack key: %s...\n", paystackSecretKey[:15])
	
	// Step 1: Resolve account number to verify it exists and get account name
	resolveReq, err := http.NewRequest("GET", 
		fmt.Sprintf("https://api.paystack.co/bank/resolve?account_number=%s&bank_code=%s", 
			req.AccountNumber, req.BankCode), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare verification request"})
		return
	}
	
	resolveReq.Header.Set("Authorization", "Bearer "+paystackSecretKey)
	resolveReq.Header.Set("Content-Type", "application/json")
	
	client := &http.Client{}
	resolveResp, err := client.Do(resolveReq)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify account with Paystack"})
		return
	}
	defer resolveResp.Body.Close()
	
	resolveBody, _ := io.ReadAll(resolveResp.Body)
	
	var resolveResponse PaystackResolveAccountResponse
	if err := json.Unmarshal(resolveBody, &resolveResponse); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse verification response"})
		return
	}
	
	if !resolveResponse.Status {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Account verification failed: " + resolveResponse.Message})
		return
	}
	
	accountName := resolveResponse.Data.AccountName
	
	// Step 2: Get bank name from bank code
	bankListReq, err := http.NewRequest("GET", "https://api.paystack.co/bank", nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch bank list"})
		return
	}
	
	bankListReq.Header.Set("Authorization", "Bearer "+paystackSecretKey)
	
	bankListResp, err := client.Do(bankListReq)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch bank list"})
		return
	}
	defer bankListResp.Body.Close()
	
	bankListBody, _ := io.ReadAll(bankListResp.Body)
	
	var bankListResponse PaystackBankListResponse
	json.Unmarshal(bankListBody, &bankListResponse)
	
	bankName := ""
	for _, bank := range bankListResponse.Data {
		if bank.Code == req.BankCode {
			bankName = bank.Name
			break
		}
	}
	
	if bankName == "" {
		bankName = "Unknown Bank"
	}
	
	// Step 3: Create transfer recipient on Paystack
	recipientPayload := map[string]interface{}{
		"type":           "nuban", // Nigerian Uniform Bank Account Number (works for other countries too)
		"name":           accountName,
		"account_number": req.AccountNumber,
		"bank_code":      req.BankCode,
		"currency":       req.Currency,
	}
	recipientJSON, _ := json.Marshal(recipientPayload)
	
	recipientReq, err := http.NewRequest("POST", "https://api.paystack.co/transferrecipient", bytes.NewBuffer(recipientJSON))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create transfer recipient"})
		return
	}
	
	recipientReq.Header.Set("Authorization", "Bearer "+paystackSecretKey)
	recipientReq.Header.Set("Content-Type", "application/json")
	
	recipientResp, err := client.Do(recipientReq)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create transfer recipient"})
		return
	}
	defer recipientResp.Body.Close()
	
	recipientBody, _ := io.ReadAll(recipientResp.Body)
	
	var recipientResponse PaystackCreateRecipientResponse
	if err := json.Unmarshal(recipientBody, &recipientResponse); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse recipient response"})
		return
	}
	
	if !recipientResponse.Status {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to create transfer recipient: " + recipientResponse.Message})
		return
	}
	
	recipientCode := recipientResponse.Data.RecipientCode
	
	// Step 4: Check if this account already exists
	var existingAccount models.PaymentAccount
	result := db.Where("user_id = ? AND account_number = ? AND bank_code = ?", 
		userID, req.AccountNumber, req.BankCode).First(&existingAccount)
	
	if result.Error == nil {
		// Account already exists
		c.JSON(http.StatusConflict, gin.H{"error": "This bank account is already linked"})
		return
	}
	
	// Step 5: If this is marked as primary, unset other primary accounts
	if req.IsPrimary {
		db.Model(&models.PaymentAccount{}).
			Where("user_id = ? AND gateway = 'paystack'", userID).
			Update("is_primary", false)
	}
	
	// Step 6: Create payment account record
	paymentAccount := models.PaymentAccount{
		UserID:                userID,
		Gateway:               "paystack",
		BankCode:              &req.BankCode,
		BankName:              &bankName,
		AccountNumber:         &req.AccountNumber,
		AccountName:           &accountName,
		PaystackRecipientCode: &recipientCode,
		IsPrimary:             req.IsPrimary,
		IsVerified:            true,
		VerificationMethod:    stringPtr("paystack_resolve_account"),
		Currency:              req.Currency,
	}
	
	if err := db.Create(&paymentAccount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save payment account"})
		return
	}
	
	// Update user's country and preferred gateway if not set
	var user models.User
	if err := db.First(&user, userID).Error; err == nil {
		if user.Country == nil {
			countryMap := map[string]string{
				"NGN": "NG",
				"GHS": "GH",
				"ZAR": "ZA",
				"KES": "KE",
			}
			country := countryMap[req.Currency]
			user.Country = &country
		}
		if user.PreferredGateway == nil {
			gateway := "paystack"
			user.PreferredGateway = &gateway
		}
		db.Save(&user)
	}
	
	c.JSON(http.StatusCreated, gin.H{
		"message": "Bank account verified and linked successfully",
		"account": paymentAccount.ToResponse(),
	})
}

// GetPaymentAccounts returns all payment accounts for the authenticated user
// GET /api/payment-accounts
func GetPaymentAccounts(c *gin.Context) {
	// Get authenticated user ID from context
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDInterface.(uint)
	
	// Get database connection from context
	db := c.MustGet("db").(*gorm.DB)
	
	// Fetch all payment accounts for this user
	var accounts []models.PaymentAccount
	if err := db.Where("user_id = ?", userID).Order("is_primary DESC, created_at DESC").Find(&accounts).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch payment accounts"})
		return
	}
	
	// Convert to response objects
	accountResponses := make([]models.PaymentAccountResponse, len(accounts))
	for i, account := range accounts {
		accountResponses[i] = account.ToResponse()
	}
	
	c.JSON(http.StatusOK, gin.H{
		"accounts": accountResponses,
	})
}

// SetPrimaryPaymentAccount sets a payment account as primary
// PUT /api/payment-accounts/:id/primary
func SetPrimaryPaymentAccount(c *gin.Context) {
	// Get authenticated user ID from context
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDInterface.(uint)
	
	// Get account ID from URL
	accountID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid account ID"})
		return
	}
	
	// Get database connection from context
	db := c.MustGet("db").(*gorm.DB)
	
	// Fetch the account
	var account models.PaymentAccount
	if err := db.Where("id = ? AND user_id = ?", uint(accountID), userID).First(&account).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Payment account not found"})
		return
	}
	
	// Unset other primary accounts for this gateway
	db.Model(&models.PaymentAccount{}).
		Where("user_id = ? AND gateway = ?", userID, account.Gateway).
		Update("is_primary", false)
	
	// Set this account as primary
	account.IsPrimary = true
	if err := db.Save(&account).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update payment account"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"message": "Primary payment account updated",
		"account": account.ToResponse(),
	})
}

// DeletePaymentAccount deletes a payment account
// DELETE /api/payment-accounts/:id
func DeletePaymentAccount(c *gin.Context) {
	// Get authenticated user ID from context
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDInterface.(uint)
	
	// Get account ID from URL
	accountID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid account ID"})
		return
	}
	
	// Get database connection from context
	db := c.MustGet("db").(*gorm.DB)
	
	// Fetch the account
	var account models.PaymentAccount
	if err := db.Where("id = ? AND user_id = ?", uint(accountID), userID).First(&account).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Payment account not found"})
		return
	}
	
	// Check if there are pending payouts using this account
	var pendingPayouts int64
	db.Model(&models.Payout{}).
		Where("payment_account_id = ? AND status IN (?)", account.ID, []string{"pending", "processing"}).
		Count(&pendingPayouts)
	
	if pendingPayouts > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot delete account with pending payouts"})
		return
	}
	
	// Delete the account
	if err := db.Delete(&account).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete payment account"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"message": "Payment account deleted successfully",
	})
}

// Helper function to create string pointer
func stringPtr(s string) *string {
	return &s
}

// ============================================================================
// STRIPE CONNECT HANDLERS
// ============================================================================

// StripeAccountRequest represents a request to create a Stripe Connect account
type StripeAccountRequest struct {
	Country   string `json:"country" binding:"required,len=2"`   // US, GB, etc.
	Currency  string `json:"currency" binding:"required,len=3"`  // USD, GBP, EUR
	IsPrimary bool   `json:"is_primary"`
}

// StripeAccountLinkResponse represents the response with Stripe onboarding link
type StripeAccountLinkResponse struct {
	AccountID string `json:"account_id"`
	URL       string `json:"url"`
	ExpiresAt int64  `json:"expires_at"`
}

// CreateStripeConnectAccount creates a Stripe Express account and returns onboarding link
// POST /api/payment-accounts/stripe/connect
func CreateStripeConnectAccount(c *gin.Context) {
	// Get authenticated user ID from context
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDInterface.(uint)
	
	// Parse request body
	var req StripeAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Get database connection from context
	db := c.MustGet("db").(*gorm.DB)
	
	// Get Stripe secret key from environment
	stripeSecretKey := os.Getenv("STRIPE_SECRET_KEY")
	if stripeSecretKey == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Stripe not configured"})
		return
	}
	
	// Get user details for metadata
	var user models.User
	if err := db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "User not found"})
		return
	}
	
	// Step 1: Create Stripe Express Account
	accountPayload := map[string]interface{}{
		"type":    "express",
		"country": req.Country,
		"email":   user.Email,
		"capabilities": map[string]interface{}{
			"transfers": map[string]interface{}{
				"requested": true,
			},
		},
		"business_type": "individual",
		"metadata": map[string]interface{}{
			"wewatch_user_id": fmt.Sprintf("%d", userID),
			"username":        user.Username,
		},
	}
	
	accountJSON, _ := json.Marshal(accountPayload)
	
	accountReq, err := http.NewRequest("POST", "https://api.stripe.com/v1/accounts", bytes.NewBuffer(accountJSON))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare Stripe account creation"})
		return
	}
	
	accountReq.Header.Set("Authorization", "Bearer "+stripeSecretKey)
	accountReq.Header.Set("Content-Type", "application/json")
	
	client := &http.Client{}
	accountResp, err := client.Do(accountReq)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create Stripe account"})
		return
	}
	defer accountResp.Body.Close()
	
	accountBody, _ := io.ReadAll(accountResp.Body)
	
	var accountResponse struct {
		ID     string `json:"id"`
		Object string `json:"object"`
		Error  *struct {
			Message string `json:"message"`
			Type    string `json:"type"`
		} `json:"error"`
	}
	
	if err := json.Unmarshal(accountBody, &accountResponse); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse Stripe response"})
		return
	}
	
	if accountResponse.Error != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Stripe error: " + accountResponse.Error.Message})
		return
	}
	
	stripeAccountID := accountResponse.ID
	
	// Step 2: Create Account Link for onboarding
	baseURL := os.Getenv("FRONTEND_URL")
	if baseURL == "" {
		baseURL = "http://localhost:3000"
	}
	
	linkPayload := map[string]interface{}{
		"account":     stripeAccountID,
		"refresh_url": baseURL + "/payment?refresh=true",
		"return_url":  baseURL + "/payment?success=true",
		"type":        "account_onboarding",
	}
	
	linkJSON, _ := json.Marshal(linkPayload)
	
	linkReq, err := http.NewRequest("POST", "https://api.stripe.com/v1/account_links", bytes.NewBuffer(linkJSON))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare onboarding link"})
		return
	}
	
	linkReq.Header.Set("Authorization", "Bearer "+stripeSecretKey)
	linkReq.Header.Set("Content-Type", "application/json")
	
	linkResp, err := client.Do(linkReq)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create onboarding link"})
		return
	}
	defer linkResp.Body.Close()
	
	linkBody, _ := io.ReadAll(linkResp.Body)
	
	var linkResponse struct {
		Object    string `json:"object"`
		Created   int64  `json:"created"`
		ExpiresAt int64  `json:"expires_at"`
		URL       string `json:"url"`
		Error     *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	
	if err := json.Unmarshal(linkBody, &linkResponse); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse link response"})
		return
	}
	
	if linkResponse.Error != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Stripe link error: " + linkResponse.Error.Message})
		return
	}
	
	// Step 3: Save payment account (not verified yet, will be verified by webhook)
	country := req.Country
	paymentAccount := models.PaymentAccount{
		UserID:          userID,
		Gateway:         "stripe",
		StripeAccountID: &stripeAccountID,
		StripeCountry:   &country,
		IsPrimary:       req.IsPrimary,
		IsVerified:      false, // Will be set to true by webhook when onboarding completes
		Currency:        req.Currency,
	}
	
	// If this is marked as primary, unset other primary accounts
	if req.IsPrimary {
		db.Model(&models.PaymentAccount{}).
			Where("user_id = ? AND gateway = 'stripe'", userID).
			Update("is_primary", false)
	}
	
	if err := db.Create(&paymentAccount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save payment account"})
		return
	}
	
	// Update user's country and preferred gateway if not set
	if user.Country == nil {
		user.Country = &country
	}
	if user.PreferredGateway == nil {
		gateway := "stripe"
		user.PreferredGateway = &gateway
	}
	db.Save(&user)
	
	c.JSON(http.StatusOK, gin.H{
		"message":    "Stripe Connect account created. Complete onboarding to verify.",
		"account_id": stripeAccountID,
		"onboarding_url": linkResponse.URL,
		"expires_at": linkResponse.ExpiresAt,
		"account": paymentAccount.ToResponse(),
	})
}

// GetStripeAccountStatus checks the status of a Stripe Connect account
// GET /api/payment-accounts/stripe/:accountId/status
func GetStripeAccountStatus(c *gin.Context) {
	// Get authenticated user ID from context
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDInterface.(uint)
	
	// Get account ID from URL
	accountID := c.Param("accountId")
	
	// Get database connection from context
	db := c.MustGet("db").(*gorm.DB)
	
	// Verify this account belongs to the user
	var paymentAccount models.PaymentAccount
	if err := db.Where("user_id = ? AND stripe_account_id = ?", userID, accountID).First(&paymentAccount).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Account not found"})
		return
	}
	
	// Get Stripe secret key from environment
	stripeSecretKey := os.Getenv("STRIPE_SECRET_KEY")
	if stripeSecretKey == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Stripe not configured"})
		return
	}
	
	// Call Stripe API to get account details
	req, err := http.NewRequest("GET", fmt.Sprintf("https://api.stripe.com/v1/accounts/%s", accountID), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare request"})
		return
	}
	
	req.Header.Set("Authorization", "Bearer "+stripeSecretKey)
	
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch account status"})
		return
	}
	defer resp.Body.Close()
	
	body, _ := io.ReadAll(resp.Body)
	
	var accountDetails struct {
		ID              string `json:"id"`
		ChargesEnabled  bool   `json:"charges_enabled"`
		PayoutsEnabled  bool   `json:"payouts_enabled"`
		DetailsSubmitted bool  `json:"details_submitted"`
		Error           *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	
	if err := json.Unmarshal(body, &accountDetails); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse Stripe response"})
		return
	}
	
	if accountDetails.Error != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Stripe error: " + accountDetails.Error.Message})
		return
	}
	
	// Update payment account if status changed
	if accountDetails.ChargesEnabled && !paymentAccount.IsVerified {
		paymentAccount.IsVerified = true
		verificationMethod := "stripe_connect_onboarding"
		paymentAccount.VerificationMethod = &verificationMethod
		db.Save(&paymentAccount)
	}
	
	c.JSON(http.StatusOK, gin.H{
		"account_id":        accountDetails.ID,
		"charges_enabled":   accountDetails.ChargesEnabled,
		"payouts_enabled":   accountDetails.PayoutsEnabled,
		"details_submitted": accountDetails.DetailsSubmitted,
		"is_verified":       paymentAccount.IsVerified,
		"account":           paymentAccount.ToResponse(),
	})
}

// RefreshStripeOnboardingLink generates a new onboarding link for incomplete accounts
// POST /api/payment-accounts/stripe/:accountId/refresh-link
func RefreshStripeOnboardingLink(c *gin.Context) {
	// Get authenticated user ID from context
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDInterface.(uint)
	
	// Get account ID from URL
	accountID := c.Param("accountId")
	
	// Get database connection from context
	db := c.MustGet("db").(*gorm.DB)
	
	// Verify this account belongs to the user
	var paymentAccount models.PaymentAccount
	if err := db.Where("user_id = ? AND stripe_account_id = ?", userID, accountID).First(&paymentAccount).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Account not found"})
		return
	}
	
	// Get Stripe secret key from environment
	stripeSecretKey := os.Getenv("STRIPE_SECRET_KEY")
	if stripeSecretKey == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Stripe not configured"})
		return
	}
	
	// Create new Account Link
	baseURL := os.Getenv("FRONTEND_URL")
	if baseURL == "" {
		baseURL = "http://localhost:3000"
	}
	
	linkPayload := map[string]interface{}{
		"account":     accountID,
		"refresh_url": baseURL + "/payment?refresh=true",
		"return_url":  baseURL + "/payment?success=true",
		"type":        "account_onboarding",
	}
	
	linkJSON, _ := json.Marshal(linkPayload)
	
	linkReq, err := http.NewRequest("POST", "https://api.stripe.com/v1/account_links", bytes.NewBuffer(linkJSON))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare onboarding link"})
		return
	}
	
	linkReq.Header.Set("Authorization", "Bearer "+stripeSecretKey)
	linkReq.Header.Set("Content-Type", "application/json")
	
	client := &http.Client{}
	linkResp, err := client.Do(linkReq)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create onboarding link"})
		return
	}
	defer linkResp.Body.Close()
	
	linkBody, _ := io.ReadAll(linkResp.Body)
	
	var linkResponse struct {
		Object    string `json:"object"`
		Created   int64  `json:"created"`
		ExpiresAt int64  `json:"expires_at"`
		URL       string `json:"url"`
		Error     *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	
	if err := json.Unmarshal(linkBody, &linkResponse); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse link response"})
		return
	}
	
	if linkResponse.Error != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Stripe link error: " + linkResponse.Error.Message})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"message":        "New onboarding link created",
		"onboarding_url": linkResponse.URL,
		"expires_at":     linkResponse.ExpiresAt,
	})
}
