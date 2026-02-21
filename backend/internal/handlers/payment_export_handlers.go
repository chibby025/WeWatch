package handlers

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"wewatch-backend/internal/models"
)

// ExportPaymentHistory exports user's payment history as CSV
// GET /api/payments/export?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
func ExportPaymentHistory(c *gin.Context) {
	// Get authenticated user ID
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDInterface.(uint)
	
	// Get database connection
	db := c.MustGet("db").(*gorm.DB)
	
	// Parse date range (optional, defaults to last 90 days)
	startDateStr := c.Query("start_date")
	endDateStr := c.Query("end_date")
	
	var startDate, endDate time.Time
	var err error
	
	if startDateStr == "" || endDateStr == "" {
		// Default: Last 90 days
		endDate = time.Now()
		startDate = endDate.AddDate(0, 0, -90)
	} else {
		startDate, err = time.Parse("2006-01-02", startDateStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid start_date format. Use YYYY-MM-DD"})
			return
		}
		
		endDate, err = time.Parse("2006-01-02", endDateStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid end_date format. Use YYYY-MM-DD"})
			return
		}
	}
	
	// Validate date range (max 90 days)
	if endDate.Sub(startDate).Hours() > 90*24 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Date range cannot exceed 90 days"})
		return
	}
	
	// Collect all transactions
	type Transaction struct {
		Date        time.Time
		Type        string
		Amount      float64
		Currency    string
		Status      string
		TransactionID string
		Description string
	}
	
	var transactions []Transaction
	
	// 1. Token Purchases (from token_transactions)
	var tokenTxs []models.TokenTransaction
	if err := db.Where("user_id = ? AND transaction_type = ? AND created_at BETWEEN ? AND ?", 
		userID, models.TransactionTypePurchase, startDate, endDate).
		Order("created_at DESC").
		Find(&tokenTxs).Error; err == nil {
		for _, tx := range tokenTxs {
			currency := "USD"
			if tx.PaymentMethod != nil && *tx.PaymentMethod == "paystack" {
				currency = "NGN"
			}
			amount := float64(tx.Amount) / 100.0
			if tx.USDValue != nil {
				amount = *tx.USDValue
			}
			txID := ""
			if tx.PaymentID != nil {
				txID = *tx.PaymentID
			}
			transactions = append(transactions, Transaction{
				Date:        tx.CreatedAt,
				Type:        "Token Purchase",
				Amount:      amount,
				Currency:    currency,
				Status:      string(tx.Status),
				TransactionID: txID,
				Description: fmt.Sprintf("Purchased %d tokens", tx.Amount),
			})
		}
	}
	
	// 2. Withdrawals (from payouts)
	var payouts []models.Payout
	if err := db.Where("user_id = ? AND created_at BETWEEN ? AND ?", userID, startDate, endDate).
		Order("created_at DESC").
		Find(&payouts).Error; err == nil {
		for _, payout := range payouts {
			amount := float64(0)
			if payout.AmountValue != nil {
				amount = *payout.AmountValue
			}
			currency := "NGN"
			if payout.AmountCurrency != nil {
				currency = *payout.AmountCurrency
			}
			txID := ""
			if payout.GatewayTransferID != nil {
				txID = *payout.GatewayTransferID
			}
			
			transactions = append(transactions, Transaction{
				Date:        payout.CreatedAt,
				Type:        "Withdrawal",
				Amount:      amount,
				Currency:    currency,
				Status:      payout.Status,
				TransactionID: txID,
				Description: fmt.Sprintf("Withdrawal to bank account"),
			})
		}
	}
	
	// 3. Donations Received (from donations where host_id = user)
	var donationsReceived []models.Donation
	if err := db.Preload("Donor").
		Where("host_id = ? AND created_at BETWEEN ? AND ?", userID, startDate, endDate).
		Order("created_at DESC").
		Find(&donationsReceived).Error; err == nil {
		for _, donation := range donationsReceived {
			donorName := "Anonymous"
			if donation.Donor != nil && !donation.IsAnonymous {
				donorName = donation.Donor.Username
			}
			amount := float64(donation.AmountTokens) * 165.0 / 100.0 // Convert tokens to NGN
			transactions = append(transactions, Transaction{
				Date:        donation.CreatedAt,
				Type:        "Donation Received",
				Amount:      amount,
				Currency:    "NGN",
				Status:      "completed",
				TransactionID: fmt.Sprintf("DON-%d", donation.ID),
				Description: fmt.Sprintf("Donation from %s (%d tokens)", donorName, donation.AmountTokens),
			})
		}
	}
	
	// 4. Donations/Gifts Sent (from donations where donor_id = user)
	var donationsSent []models.Donation
	if err := db.Preload("Host").
		Where("donor_id = ? AND created_at BETWEEN ? AND ?", userID, startDate, endDate).
		Order("created_at DESC").
		Find(&donationsSent).Error; err == nil {
		for _, donation := range donationsSent {
			hostName := "Host"
			if donation.Host != nil {
				hostName = donation.Host.Username
			}
			amount := float64(donation.AmountTokens) * 165.0 / 100.0 // Convert tokens to NGN
			transactions = append(transactions, Transaction{
				Date:        donation.CreatedAt,
				Type:        "Gift Sent",
				Amount:      amount,
				Currency:    "NGN",
				Status:      "completed",
				TransactionID: fmt.Sprintf("GIFT-%d", donation.ID),
				Description: fmt.Sprintf("Gift to %s (%d tokens)", hostName, donation.AmountTokens),
			})
		}
	}
	
	// Sort transactions by date (newest first)
	// Already sorted by individual queries, but let's ensure overall order
	// (Simple approach: already sorted by DESC in queries)
	
	// Generate CSV
	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=wewatch_transactions_%s.csv", time.Now().Format("2006-01-02")))
	
	writer := csv.NewWriter(c.Writer)
	defer writer.Flush()
	
	// Write header
	writer.Write([]string{"Date", "Type", "Amount", "Currency", "Status", "Transaction ID", "Description"})
	
	// Write transactions
	for _, tx := range transactions {
		writer.Write([]string{
			tx.Date.Format("2006-01-02 15:04:05"),
			tx.Type,
			fmt.Sprintf("%.2f", tx.Amount),
			tx.Currency,
			tx.Status,
			tx.TransactionID,
			tx.Description,
		})
	}
	
	// Return count for debugging (client won't see this since CSV is downloading)
	fmt.Printf("📊 Exported %d transactions for user %d\n", len(transactions), userID)
}
