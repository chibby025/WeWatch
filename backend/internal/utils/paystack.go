// WeWatch/backend/internal/utils/paystack.go
package utils

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

// PaystackVerifyResponse represents the response from Paystack verify endpoint
type PaystackVerifyResponse struct {
	Status  bool   `json:"status"`
	Message string `json:"message"`
	Data    struct {
		Status    string  `json:"status"`
		Reference string  `json:"reference"`
		Amount    int     `json:"amount"` // Amount in kobo
		Currency  string  `json:"currency"`
		Customer  struct {
			Email string `json:"email"`
		} `json:"customer"`
	} `json:"data"`
}

// GetPaystackRevenueSecretKey returns the Paystack revenue secret key from environment
func GetPaystackRevenueSecretKey() string {
	// Try PAYSTACK_REVENUE_SECRET_KEY first
	if key := os.Getenv("PAYSTACK_REVENUE_SECRET_KEY"); key != "" {
		return key
	}
	// Fallback to PAYSTACK_SECRET_KEY
	return os.Getenv("PAYSTACK_SECRET_KEY")
}

// VerifyPaystackTransaction verifies a Paystack payment transaction
// Returns (verified, amountInKobo, error)
func VerifyPaystackTransaction(reference string, secretKey string) (bool, int, error) {
	url := fmt.Sprintf("https://api.paystack.co/transaction/verify/%s", reference)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return false, 0, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+secretKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return false, 0, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return false, 0, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return false, 0, fmt.Errorf("paystack API returned status %d: %s", resp.StatusCode, string(body))
	}

	var verifyResp PaystackVerifyResponse
	if err := json.Unmarshal(body, &verifyResp); err != nil {
		return false, 0, fmt.Errorf("failed to parse response: %w", err)
	}

	if !verifyResp.Status || verifyResp.Data.Status != "success" {
		return false, 0, fmt.Errorf("payment verification failed: %s", verifyResp.Message)
	}

	return true, verifyResp.Data.Amount, nil
}

// ParseInt safely parses a string to int
func ParseInt(s string) (int, error) {
	var result int
	_, err := fmt.Sscanf(s, "%d", &result)
	return result, err
}
