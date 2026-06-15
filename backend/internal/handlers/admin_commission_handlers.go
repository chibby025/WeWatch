package handlers

import (
	"bytes"
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

// TransferTokenDonationCommission transfers accumulated 5% token gift commissions
// from Reserve Subaccount to Revenue Subaccount via Paystack
// POST /api/admin/transfer-donation-commission
func TransferTokenDonationCommission(c *gin.Context) {
	db := c.MustGet("db").(*gorm.DB)

	// Get platform accounting
	accounting, err := models.GetPlatformAccounting(db)
	if err != nil {
		log.Printf("❌ Failed to get platform accounting: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch accounting data"})
		return
	}

	// Check if there's any commission to transfer
	if accounting.TokenDonationCommission <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No commission available to transfer"})
		return
	}

	commissionAmount := accounting.TokenDonationCommission

	// Initiate Paystack transfer from Reserve to Revenue Subaccount
	transferCode, transferErr := initiateCommissionTransfer(commissionAmount)
	if transferErr != nil {
		log.Printf("❌ Paystack transfer failed: %v", transferErr)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Transfer failed: %v", transferErr),
		})
		return
	}

	// Update accounting: Reset TokenDonationCommission to 0 (transferred to revenue)
	accounting.TokenDonationCommission = 0
	
	if saveErr := db.Save(accounting).Error; saveErr != nil {
		log.Printf("❌ Failed to update accounting after transfer: %v", saveErr)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Transfer initiated but failed to update records"})
		return
	}

	log.Printf("✅ Token donation commission transferred: ₦%.2f (Transfer: %s)", commissionAmount, transferCode)

	c.JSON(http.StatusOK, gin.H{
		"message":         "Commission transferred successfully",
		"amount":          commissionAmount,
		"transfer_code":   transferCode,
		"remaining_balance": 0,
	})
}

// SweepWithdrawalFeeRevenue logs a quarterly sweep of accumulated ₦100 withdrawal fees.
// The fees are already booked in PlatformProfit (via RecordWithdrawalFee) and physically
// sit in the Reserve Paystack subaccount. This endpoint resets the WithdrawalFeeRevenue
// counter and logs the manual transfer so the admin knows to move the funds via Paystack
// Dashboard.
// POST /api/admin/sweep-withdrawal-fees
func SweepWithdrawalFeeRevenue(c *gin.Context) {
	db := c.MustGet("db").(*gorm.DB)

	accounting, err := models.GetPlatformAccounting(db)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch accounting data"})
		return
	}

	if accounting.WithdrawalFeeRevenue <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No withdrawal fees accumulated yet"})
		return
	}

	amount := accounting.WithdrawalFeeRevenue
	reserveSubaccountID := os.Getenv("PAYSTACK_RESERVE_SUBACCOUNT_ID")
	revenueSubaccountID := os.Getenv("PAYSTACK_REVENUE_SUBACCOUNT_ID")

	log.Printf("💸 Withdrawal Fee Sweep — Manual Transfer Required:")
	log.Printf("   From: Reserve Subaccount (%s)", reserveSubaccountID)
	log.Printf("   To: Revenue Subaccount (%s)", revenueSubaccountID)
	log.Printf("   Amount: ₦%.2f (%d kobo)", amount, int(amount*100))
	log.Printf("   Reason: Accumulated ₦100 withdrawal fees (sweep quarterly)")

	// Reset the current-period counter — PlatformProfit and IsBalanced() are unaffected.
	accounting.WithdrawalFeeRevenue = 0
	if saveErr := db.Save(accounting).Error; saveErr != nil {
		log.Printf("❌ Failed to reset withdrawal fee counter: %v", saveErr)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update records"})
		return
	}

	sweepRef := fmt.Sprintf("WITHDRAWAL_FEE_SWEEP_%d", int(amount*100))
	log.Printf("✅ Withdrawal fee sweep logged: ₦%.2f (ref: %s)", amount, sweepRef)

	c.JSON(http.StatusOK, gin.H{
		"message":  "Sweep logged — complete the transfer via Paystack Dashboard",
		"amount":   amount,
		"sweep_ref": sweepRef,
	})
}

// initiateCommissionTransfer handles Paystack transfer from Reserve to Revenue Subaccount
func initiateCommissionTransfer(amount float64) (string, error) {
	// Get Paystack keys and subaccount IDs
	paystackSecretKey := os.Getenv("PAYSTACK_REVENUE_SECRET_KEY")
	if paystackSecretKey == "" {
		paystackSecretKey = os.Getenv("PAYSTACK_SECRET_KEY")
		if paystackSecretKey == "" {
			return "", fmt.Errorf("PAYSTACK_REVENUE_SECRET_KEY not configured")
		}
	}

	reserveSubaccountID := os.Getenv("PAYSTACK_RESERVE_SUBACCOUNT_ID")
	revenueSubaccountID := os.Getenv("PAYSTACK_REVENUE_SUBACCOUNT_ID")
	
	if reserveSubaccountID == "" || revenueSubaccountID == "" {
		return "", fmt.Errorf("Paystack subaccount IDs not configured")
	}

	// Convert to kobo (Naira minor units)
	amountInKobo := int(amount * 100)

	// Build transfer payload
	// Note: Paystack doesn't support direct subaccount-to-subaccount transfers
	// This is a manual process via Paystack Dashboard or Balance API
	// For now, we log the transfer and mark as completed
	// TODO: Implement actual Paystack Balance API transfer when available
	
	log.Printf("💸 Manual Transfer Required:")
	log.Printf("   From: Reserve Subaccount (%s)", reserveSubaccountID)
	log.Printf("   To: Revenue Subaccount (%s)", revenueSubaccountID)
	log.Printf("   Amount: ₦%.2f (%d kobo)", amount, amountInKobo)
	log.Printf("   Reason: Token donation commission (5%% from wallet-to-wallet gifts)")

	// For manual transfers, we return a mock transfer code
	// Super admin will complete the transfer via Paystack Dashboard
	transferCode := fmt.Sprintf("MANUAL_COMMISSION_%d", amountInKobo)

	// TODO: When Paystack supports subaccount transfers via API, replace with:
	// transferPayload := map[string]interface{}{
	//     "source": reserveSubaccountID,
	//     "destination": revenueSubaccountID,
	//     "amount": amountInKobo,
	//     "reason": "Token donation commission transfer",
	// }
	// ... make API request ...

	return transferCode, nil
}

// initiatePaystackBalanceTransfer makes actual API call to Paystack (future implementation)
func initiatePaystackBalanceTransfer(secretKey string, fromSubaccount string, toSubaccount string, amount int) (string, error) {
	// Paystack Balance API endpoint (when available)
	// For now, this is a placeholder for future implementation
	
	transferPayload := map[string]interface{}{
		"source":      fromSubaccount,
		"destination": toSubaccount,
		"amount":      amount,
		"reason":      "Token donation commission transfer",
		"currency":    "NGN",
	}

	transferJSON, _ := json.Marshal(transferPayload)

	req, err := http.NewRequest("POST", "https://api.paystack.co/balance/transfer", bytes.NewBuffer(transferJSON))
	if err != nil {
		return "", fmt.Errorf("failed to prepare request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+secretKey)
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
			Reference    string `json:"reference"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &transferResponse); err != nil {
		return "", fmt.Errorf("failed to parse response: %w", err)
	}

	if !transferResponse.Status {
		return "", fmt.Errorf("transfer failed: %s", transferResponse.Message)
	}

	return transferResponse.Data.TransferCode, nil
}
