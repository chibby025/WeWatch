package handlers

import (
	"fmt"
	"net/http"
	"time"
	"wewatch-backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GetPlatformAccountingHandler returns platform accounting summary
// GET /api/admin/accounting
func GetPlatformAccountingHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// TODO: Add admin auth middleware
		// For now, just check if user is authenticated
		_, exists := c.Get("userID")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		// Get platform accounting
		accounting, err := models.GetPlatformAccounting(db)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch accounting"})
			return
		}

		// Calculate metrics
		availableReserve := accounting.GetAvailableReserve()
		isBalanced := accounting.IsBalanced()

		response := gin.H{
			"platform_owner": gin.H{
				"your_profit":           accounting.PlatformProfit,
				"lifetime_profit":       accounting.LifetimePlatformProfit,
				"total_revenue":         accounting.TotalPlatformRevenue,
				"lifetime_revenue":      accounting.LifetimeTotalRevenue,
				"can_withdraw_safely":   accounting.PlatformProfit > 0,
				"explanation":           "This is YOUR money - 15% commission from all transactions",
			},
			"host_reserves": gin.H{
				"total_reserved":        accounting.HostReserveBalance,
				"pending_payouts":       accounting.PendingPayouts,
				"available_for_payouts": availableReserve,
				"lifetime_paid_out":     accounting.LifetimePayouts,
				"lifetime_earned":       accounting.LifetimeHostEarnings,
				"explanation":           "This is HOST money (75%) - DO NOT TOUCH!",
			},
			"gateway_accounts": gin.H{
				"total_balance":         accounting.TotalGatewayBalance,
				"is_balanced":           isBalanced,
				"explanation":           "Total in Stripe/Paystack = Profit + Reserve",
			},
			"health_check": gin.H{
				"accounting_balanced":   isBalanced,
				"sufficient_reserves":   availableReserve >= 0,
				"status":                getAccountingStatus(isBalanced, availableReserve),
			},
			"updated_at": accounting.UpdatedAt,
		}

		c.JSON(http.StatusOK, response)
	}
}

// GetAccountingHistoryHandler returns recent accounting transactions
// GET /api/admin/accounting/history
func GetAccountingHistoryHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// TODO: Add admin auth middleware
		_, exists := c.Get("userID")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		// Get recent token purchases with split info
		var tokenPurchases []models.TokenTransaction
		db.Where("transaction_type = ? AND status = ?", "purchase", "completed").
			Order("created_at DESC").
			Limit(50).
			Find(&tokenPurchases)

		// Get recent payouts
		var payouts []models.Payout
		db.Where("status IN ?", []string{"completed", "processing"}).
			Order("created_at DESC").
			Limit(50).
			Find(&payouts)

		// Format history
		history := []gin.H{}

		// Add purchases
		for _, tx := range tokenPurchases {
			usdValue := float64(0)
			if tx.USDValue != nil {
				usdValue = *tx.USDValue
			}

			entry := gin.H{
				"type":         "token_purchase",
				"amount":       usdValue,
				"revenue_25":   usdValue * 0.25,
				"reserve_75":   usdValue * 0.75,
				"user_id":      tx.UserID,
				"created_at":   tx.CreatedAt,
				"revenue_transfer_id": tx.RevenueTransferID,
				"reserve_transfer_id": tx.ReserveTransferID,
			}
			history = append(history, entry)
		}

		// Add payouts
		for _, payout := range payouts {
			amount := float64(0)
			if payout.AmountValue != nil {
				amount = *payout.AmountValue
			}
			
			entry := gin.H{
				"type":       "host_payout",
				"amount":     -amount, // Negative because it's outgoing
				"revenue_15": 0.0,     // No split on payouts
				"reserve_85": -amount, // Deducted from reserve
				"user_id":    payout.UserID,
				"created_at": payout.CreatedAt,
				"status":     payout.Status,
				"gateway_transfer_id": payout.GatewayTransferID,
			}
			history = append(history, entry)
		}

		c.JSON(http.StatusOK, gin.H{
			"history": history,
			"total_entries": len(history),
		})
	}
}

// GetAccountingExportHandler exports accounting data as CSV
// GET /api/admin/accounting/export
func GetAccountingExportHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// TODO: Add admin auth middleware
		_, exists := c.Get("userID")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		// Get all token purchases
		var tokenPurchases []models.TokenTransaction
		db.Where("transaction_type = ? AND status = ?", "purchase", "completed").
			Order("created_at ASC").
			Find(&tokenPurchases)

		// Get all payouts
		var payouts []models.Payout
		db.Where("status = ?", "completed").
			Order("created_at ASC").
			Find(&payouts)

		// Generate CSV
		csv := "Date,Type,User ID,Amount USD,Revenue (15%),Reserve (85%),Transfer ID\n"

		for _, tx := range tokenPurchases {
			usdValue := float64(0)
			if tx.USDValue != nil {
				usdValue = *tx.USDValue
			}

			transferID := ""
			if tx.RevenueTransferID != nil {
				transferID = *tx.RevenueTransferID
			}

			csv += fmt.Sprintf("%s,Purchase,%d,%.2f,%.2f,%.2f,%s\n",
				tx.CreatedAt.Format("2006-01-02 15:04:05"),
				tx.UserID,
				usdValue,
				usdValue*0.25,
				usdValue*0.75,
				transferID,
			)
		}

		for _, payout := range payouts {
			amount := float64(0)
			if payout.AmountValue != nil {
				amount = *payout.AmountValue
			}
			
			transferID := ""
			if payout.GatewayTransferID != nil {
				transferID = *payout.GatewayTransferID
			}

			csv += fmt.Sprintf("%s,Payout,%d,-%.2f,0.00,-%.2f,%s\n",
				payout.CreatedAt.Format("2006-01-02 15:04:05"),
				payout.UserID,
				amount,
				amount,
				transferID,
			)
		}

		// Set headers for CSV download
		filename := fmt.Sprintf("accounting_export_%s.csv", time.Now().Format("20060102_150405"))
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
		c.Header("Content-Type", "text/csv")
		c.String(http.StatusOK, csv)
	}
}

// Helper function to get accounting status
func getAccountingStatus(isBalanced bool, availableReserve float64) string {
	if !isBalanced {
		return "⚠️ ERROR: Accounting imbalanced - please investigate!"
	}
	if availableReserve < 0 {
		return "⚠️ WARNING: Negative reserve balance - insufficient funds!"
	}
	if availableReserve < 1000 {
		return "⚠️ WARNING: Low reserve balance - may not cover upcoming payouts"
	}
	return "✅ Healthy - all systems operational"
}
