// WeWatch/backend/internal/utils/account_manager.go
package utils

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"time"
	"github.com/stripe/stripe-go/v72"
	"github.com/stripe/stripe-go/v72/transfer"
)

// AccountType represents different payment account purposes
type AccountType string

const (
	AccountTypeRevenue AccountType = "revenue" // 25% platform profit
	AccountTypeReserve AccountType = "reserve" // 75% host payouts
	AccountTypeMain    AccountType = "main"    // Main collection account
)

// PaymentAccountManager handles multiple Stripe/Paystack accounts
type PaymentAccountManager struct {
	// Stripe accounts
	StripeRevenueKey string
	StripeReserveKey string
	StripeMainKey    string
	
	// Paystack accounts
	PaystackRevenueKey string
	PaystackReserveKey string
	PaystackMainKey    string
}

var AccountManager *PaymentAccountManager

// InitializeAccountManager sets up the multi-account system
func InitializeAccountManager() error {
	AccountManager = &PaymentAccountManager{
		// Stripe keys
		StripeRevenueKey: os.Getenv("STRIPE_REVENUE_SECRET_KEY"),
		StripeReserveKey: os.Getenv("STRIPE_RESERVE_SECRET_KEY"),
		StripeMainKey:    os.Getenv("STRIPE_MAIN_SECRET_KEY"),
		
		// Paystack keys
		PaystackRevenueKey: os.Getenv("PAYSTACK_REVENUE_SECRET_KEY"),
		PaystackReserveKey: os.Getenv("PAYSTACK_RESERVE_SECRET_KEY"),
		PaystackMainKey:    os.Getenv("PAYSTACK_MAIN_SECRET_KEY"),
	}
	
	// Validate at least revenue and reserve accounts exist
	if AccountManager.StripeRevenueKey == "" || AccountManager.StripeReserveKey == "" {
		return fmt.Errorf("missing required Stripe account keys (revenue and reserve)")
	}
	
	if AccountManager.PaystackRevenueKey == "" || AccountManager.PaystackReserveKey == "" {
		return fmt.Errorf("missing required Paystack account keys (revenue and reserve)")
	}
	
	// If no main account, use revenue as main collector
	if AccountManager.StripeMainKey == "" {
		AccountManager.StripeMainKey = AccountManager.StripeRevenueKey
	}
	if AccountManager.PaystackMainKey == "" {
		AccountManager.PaystackMainKey = AccountManager.PaystackRevenueKey
	}
	
	return nil
}

// GetStripeKey returns the appropriate Stripe key for the account type
func (am *PaymentAccountManager) GetStripeKey(accountType AccountType) string {
	switch accountType {
	case AccountTypeRevenue:
		return am.StripeRevenueKey
	case AccountTypeReserve:
		return am.StripeReserveKey
	case AccountTypeMain:
		return am.StripeMainKey
	default:
		return am.StripeMainKey
	}
}

// GetPaystackKey returns the appropriate Paystack key for the account type
func (am *PaymentAccountManager) GetPaystackKey(accountType AccountType) string {
	switch accountType {
	case AccountTypeRevenue:
		return am.PaystackRevenueKey
	case AccountTypeReserve:
		return am.PaystackReserveKey
	case AccountTypeMain:
		return am.PaystackMainKey
	default:
		return am.PaystackMainKey
	}
}

// SplitPaymentResult represents the result of splitting a payment
type SplitPaymentResult struct {
	TotalAmount        float64 `json:"total_amount"`
	RevenueAmount      float64 `json:"revenue_amount"`       // 25%
	ReserveAmount      float64 `json:"reserve_amount"`       // 75%
	RevenueTransferID  string  `json:"revenue_transfer_id"`  // Stripe/Paystack transfer ID
	ReserveTransferID  string  `json:"reserve_transfer_id"`  // Stripe/Paystack transfer ID
	Gateway            string  `json:"gateway"`              // "stripe" or "paystack"
	Status             string  `json:"status"`               // "success" or "failed"
	Error              string  `json:"error,omitempty"`
}

// SplitStripePayment splits a Stripe payment between revenue and reserve accounts
// This is called AFTER user payment is collected on main account
func (am *PaymentAccountManager) SplitStripePayment(amount float64, currency string, description string) (*SplitPaymentResult, error) {
	result := &SplitPaymentResult{
		TotalAmount:   amount,
		RevenueAmount: amount * 0.25,
		ReserveAmount: amount * 0.75,
		Gateway:       "stripe",
	}
	
	// If main account = revenue account, no need to transfer revenue portion
	// Just transfer 75% to reserve
	if am.StripeMainKey == am.StripeRevenueKey {
		// Only transfer to reserve account
		stripeAmount := int64(result.ReserveAmount * 100) // Convert to cents
		
		stripe.Key = am.StripeMainKey
		
		params := &stripe.TransferParams{
			Amount:      stripe.Int64(stripeAmount),
			Currency:    stripe.String(currency),
			Destination: stripe.String(am.getStripeAccountID(AccountTypeReserve)),
			Description: stripe.String(fmt.Sprintf("Reserve: %s", description)),
		}
		
		t, err := transfer.New(params)
		if err != nil {
			result.Status = "failed"
			result.Error = err.Error()
			return result, err
		}
		
		result.ReserveTransferID = t.ID
		result.Status = "success"
		return result, nil
	}
	
	// If using separate main account, transfer both portions
	// Transfer 25% to revenue account
	stripeRevenueAmount := int64(result.RevenueAmount * 100)
	stripe.Key = am.StripeMainKey
	
	revenueParams := &stripe.TransferParams{
		Amount:      stripe.Int64(stripeRevenueAmount),
		Currency:    stripe.String(currency),
		Destination: stripe.String(am.getStripeAccountID(AccountTypeRevenue)),
		Description: stripe.String(fmt.Sprintf("Revenue (25%%): %s", description)),
	}
	
	revenueTransfer, err := transfer.New(revenueParams)
	if err != nil {
		result.Status = "failed"
		result.Error = fmt.Sprintf("revenue transfer failed: %v", err)
		return result, err
	}
	result.RevenueTransferID = revenueTransfer.ID
	
	// Transfer 75% to reserve account
	stripeReserveAmount := int64(result.ReserveAmount * 100)
	
	reserveParams := &stripe.TransferParams{
		Amount:      stripe.Int64(stripeReserveAmount),
		Currency:    stripe.String(currency),
		Destination: stripe.String(am.getStripeAccountID(AccountTypeReserve)),
		Description: stripe.String(fmt.Sprintf("Reserve (75%%): %s", description)),
	}
	
	reserveTransfer, err := transfer.New(reserveParams)
	if err != nil {
		result.Status = "failed"
		result.Error = fmt.Sprintf("reserve transfer failed: %v", err)
		// Note: Revenue transfer already succeeded, need to handle this carefully
		return result, err
	}
	result.ReserveTransferID = reserveTransfer.ID
	
	result.Status = "success"
	return result, nil
}

// SplitPaystackPayment splits a Paystack payment between revenue and reserve accounts
// CalculatePaystackFee returns the Paystack fee and net amount for a given gross amount (in NGN)
func CalculatePaystackFee(amount float64) (fee float64, net float64) {
       // Paystack local fee: 1.5% + ₦100 (₦100 waived for < ₦2,500, cap ₦2,000)
       fee = amount * 0.015
       if amount >= 2500 {
	       fee += 100
       }
       if fee > 2000 {
	       fee = 2000
       }
       net = amount - fee
       if net < 0 {
	       net = 0
       }
       return fee, net
}

// SplitPaystackPayment splits a Paystack payment between revenue and reserve accounts using NET value after gateway fee
func (am *PaymentAccountManager) SplitPaystackPayment(amount float64, currency string, description string) (*SplitPaymentResult, error) {
       fee, netAmount := CalculatePaystackFee(amount)
       result := &SplitPaymentResult{
	       TotalAmount:   amount,
	       RevenueAmount: netAmount * 0.25,
	       ReserveAmount: netAmount * 0.75,
	       Gateway:       "paystack",
	       // Optionally, you can add the fee for reference
	       Error:         fmt.Sprintf("Paystack fee: ₦%.2f", fee),
       }

       // Paystack doesn't support automatic transfers like Stripe Connect
       // Instead, we'll track this in database and handle manually or via Transfer API
       // For now, just record the split intention

       result.Status = "success"
       result.RevenueTransferID = fmt.Sprintf("paystack_revenue_%s", generateID())
       result.ReserveTransferID = fmt.Sprintf("paystack_reserve_%s", generateID())

       // TODO: Implement Paystack Transfer API when ready
       // https://paystack.com/docs/transfers/single-transfers

       return result, nil
}

// WithdrawFromReserve processes a host withdrawal from the reserve account
func (am *PaymentAccountManager) WithdrawFromReserve(amount float64, currency, gateway, recipientAccount, description string) error {
	if gateway == "stripe" {
		return am.withdrawStripeFromReserve(amount, currency, recipientAccount, description)
	} else if gateway == "paystack" {
		return am.withdrawPaystackFromReserve(amount, currency, recipientAccount, description)
	}
	return fmt.Errorf("unsupported gateway: %s", gateway)
}

// withdrawStripeFromReserve sends money from Stripe reserve account to host
func (am *PaymentAccountManager) withdrawStripeFromReserve(amount float64, currency, recipientAccount, description string) error {
	stripeAmount := int64(amount * 100) // Convert to cents
	
	stripe.Key = am.StripeReserveKey // Use RESERVE account for payouts
	
	params := &stripe.TransferParams{
		Amount:      stripe.Int64(stripeAmount),
		Currency:    stripe.String(currency),
		Destination: stripe.String(recipientAccount), // Host's Stripe Connect account
		Description: stripe.String(description),
	}
	
	_, err := transfer.New(params)
	return err
}

// withdrawPaystackFromReserve sends money from Paystack reserve account to host
func (am *PaymentAccountManager) withdrawPaystackFromReserve(amount float64, currency, recipientAccount, description string) error {
	// Use Paystack Transfer API with RESERVE account credentials
	// Implementation similar to existing Paystack transfer code
	// but using am.PaystackReserveKey instead of main key
	
	// TODO: Implement Paystack transfer from reserve account
	return nil
}

// Helper function to get Stripe account ID from Connect account
func (am *PaymentAccountManager) getStripeAccountID(accountType AccountType) string {
	// In a real implementation, you'd store these Connect account IDs
	// For now, returning placeholder
	// You need to create Connect accounts and store their IDs
	switch accountType {
	case AccountTypeRevenue:
		return os.Getenv("STRIPE_REVENUE_ACCOUNT_ID")
	case AccountTypeReserve:
		return os.Getenv("STRIPE_RESERVE_ACCOUNT_ID")
	default:
		return ""
	}
}

// Helper to generate unique IDs
func generateID() string {
	// Simple implementation - in production use UUID
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

// PaystackTransferRecipient represents a Paystack transfer recipient
type PaystackTransferRecipient struct {
	RecipientCode string `json:"recipient_code"`
	Type          string `json:"type"`
	Name          string `json:"name"`
	Details       string `json:"details"`
	Currency      string `json:"currency"`
}

// PaystackTransferRequest represents a Paystack transfer API request
type PaystackTransferRequest struct {
	Source    string `json:"source"`
	Reason    string `json:"reason"`
	Amount    int    `json:"amount"`
	Recipient string `json:"recipient"`
	Reference string `json:"reference,omitempty"`
}

// PaystackTransferResponse represents a Paystack transfer API response
type PaystackTransferResponse struct {
	Status  bool   `json:"status"`
	Message string `json:"message"`
	Data    struct {
		Reference     string `json:"reference"`
		Recipient     string `json:"recipient"`
		Amount        int    `json:"amount"`
		TransferCode  string `json:"transfer_code"`
		Status        string `json:"status"`
		TransferredAt string `json:"transferred_at"`
	} `json:"data"`
}

// PaystackTransferFunds initiates a transfer using Paystack Transfer API
func PaystackTransferFunds(secretKey, recipientCode string, amountInKobo int, currency, reference, reason string) (string, error) {
	if secretKey == "" {
		return "", fmt.Errorf("secret key required")
	}
	if recipientCode == "" {
		return "", fmt.Errorf("recipient code required")
	}
	
	// Generate reference if not provided
	if reference == "" {
		reference = fmt.Sprintf("TXF_%d", time.Now().UnixNano())
	}
	
	// Prepare transfer request
	transferReq := PaystackTransferRequest{
		Source:    "balance", // Transfer from account balance
		Reason:    reason,
		Amount:    amountInKobo,
		Recipient: recipientCode,
		Reference: reference,
	}
	
	// Marshal request body
	jsonData, err := json.Marshal(transferReq)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}
	
	// Create HTTP request
	req, err := http.NewRequest("POST", "https://api.paystack.co/transfer", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	
	// Set headers
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", secretKey))
	req.Header.Set("Content-Type", "application/json")
	
	// Make request
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()
	
	// Read response
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}
	
	// Parse response
	var transferResp PaystackTransferResponse
	if err := json.Unmarshal(body, &transferResp); err != nil {
		return "", fmt.Errorf("failed to parse response: %w (body: %s)", err, string(body))
	}
	
	// Check if transfer succeeded
	if !transferResp.Status {
		return "", fmt.Errorf("transfer failed: %s", transferResp.Message)
	}
	
	return transferResp.Data.TransferCode, nil
}

// PaystackCreateTransferRecipient creates a transfer recipient on Paystack
// This is used for setting up bank account recipients for host payouts
func PaystackCreateTransferRecipient(secretKey, recipientType, name, accountNumber, bankCode, currency string) (string, error) {
	if secretKey == "" {
		return "", fmt.Errorf("secret key required")
	}
	
	// Prepare recipient data
	recipientData := map[string]interface{}{
		"type":           recipientType, // "nuban" for Nigerian bank accounts
		"name":           name,
		"account_number": accountNumber,
		"bank_code":      bankCode,
		"currency":       currency,
	}
	
	// Marshal request body
	jsonData, err := json.Marshal(recipientData)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}
	
	// Create HTTP request
	req, err := http.NewRequest("POST", "https://api.paystack.co/transferrecipient", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	
	// Set headers
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", secretKey))
	req.Header.Set("Content-Type", "application/json")
	
	// Make request
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()
	
	// Read response
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}
	
	// Parse response
	var result struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Data    struct {
			RecipientCode string `json:"recipient_code"`
		} `json:"data"`
	}
	
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("failed to parse response: %w (body: %s)", err, string(body))
	}
	
	// Check if creation succeeded
	if !result.Status {
		return "", fmt.Errorf("recipient creation failed: %s", result.Message)
	}
	
	return result.Data.RecipientCode, nil
}

// TransferToReserveAccount transfers funds from Revenue account to Reserve account
// This is called after token purchases to move 85% to the reserve for host payouts
func TransferToReserveAccount(amount float64, currency string, reference string, description string) error {
	// Use Paystack Transfer API to send money from Revenue → Reserve
	// https://paystack.com/docs/transfers/single-transfers
	
	revenueKey := AccountManager.PaystackRevenueKey
	if revenueKey == "" {
		return fmt.Errorf("revenue account key not configured")
	}
	
	// Get recipient code for Reserve account from environment
	reserveRecipient := os.Getenv("PAYSTACK_RESERVE_RECIPIENT_CODE")
	if reserveRecipient == "" {
		// If no recipient code configured, log and return error
		fmt.Printf("📝 MANUAL ACTION REQUIRED:\n")
		fmt.Printf("   Transfer ₦%.2f from Revenue to Reserve account\n", amount)
		fmt.Printf("   Reference: %s\n", reference)
		fmt.Printf("   Description: %s\n", description)
		fmt.Printf("   ⚠️  PAYSTACK_RESERVE_RECIPIENT_CODE not configured\n")
		return fmt.Errorf("PAYSTACK_RESERVE_RECIPIENT_CODE not configured - manual action required")
	}
	
	// Convert amount to kobo (Paystack uses kobo, not naira)
	amountInKobo := int(amount * 100)
	
	// Make transfer API call
	transferCode, err := PaystackTransferFunds(
		revenueKey,
		reserveRecipient,
		amountInKobo,
		currency,
		reference,
		description,
	)
	
	if err != nil {
		fmt.Printf("❌ Transfer to Reserve failed: %v\n", err)
		fmt.Printf("📝 MANUAL ACTION REQUIRED:\n")
		fmt.Printf("   Transfer ₦%.2f from Revenue to Reserve account\n", amount)
		return fmt.Errorf("transfer failed: %w", err)
	}
	
	fmt.Printf("✅ Transferred ₦%.2f to Reserve account (Transfer: %s)\n", amount, transferCode)
	return nil
}
