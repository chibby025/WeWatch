package handlers

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// GetMyPayouts returns payout history for the authenticated user
// GET /api/payouts/me
func GetMyPayouts(c *gin.Context) {
	// Get authenticated user ID from context
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDInterface.(uint)

	// Get database connection from context
	db := c.MustGet("db").(*gorm.DB)

	// Fetch user's payouts with payment account details
	var payouts []models.Payout
	err := db.Preload("PaymentAccount").
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Find(&payouts).Error

	if err != nil {
		log.Printf("Error fetching payouts for user %d: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch payouts"})
		return
	}

	// Calculate summary statistics
	totalRequested := 0.0
	totalCompleted := 0.0
	totalPending := 0.0
	totalFailed := 0.0

	for _, payout := range payouts {
		// Get amount (either from tokens or currency value)
		var amount float64
		if payout.AmountValue != nil {
			amount = *payout.AmountValue
		} else if payout.AmountTokens != nil {
			amount = float64(*payout.AmountTokens) * 165.0 / 100.0 // Convert token units to NGN
		}
		
		totalRequested += amount
		
		switch payout.Status {
		case string(models.PayoutStatusCompleted):
			totalCompleted += amount
		case string(models.PayoutStatusPending), string(models.PayoutStatusProcessing):
			totalPending += amount
		case string(models.PayoutStatusFailed), string(models.PayoutStatusCancelled):
			totalFailed += amount
		}
	}

	// Convert payouts to safe response format with masked account data
	type PayoutResponse struct {
		ID                uint                            `json:"id"`
		UserID            uint                            `json:"user_id"`
		PayoutType        string                          `json:"payout_type"`
		PayoutMethod      string                          `json:"payout_method"`
		AmountTokens      *int                            `json:"amount_tokens,omitempty"`
		AmountCurrency    *string                         `json:"amount_currency,omitempty"`
		AmountValue       *float64                        `json:"amount_value,omitempty"`
		Status            string                          `json:"status"`
		PayoutDetails     interface{}                     `json:"payout_details,omitempty"`
		ProcessedAt       *string                         `json:"processed_at,omitempty"`
		CreatedAt         string                          `json:"created_at"`
		UpdatedAt         string                          `json:"updated_at"`
		GatewayTransferID string                          `json:"gateway_transfer_id,omitempty"`
		PaymentAccountID  uint                            `json:"payment_account_id,omitempty"`
		PaymentAccount    *models.PaymentAccountResponse  `json:"payment_account,omitempty"`
	}

	payoutResponses := make([]PayoutResponse, len(payouts))
	for i, payout := range payouts {
		var paymentAccountResp *models.PaymentAccountResponse
		if payout.PaymentAccount != nil {
			resp := payout.PaymentAccount.ToResponse()
			paymentAccountResp = &resp
		}
		
		var processedAtStr *string
		if payout.ProcessedAt != nil {
			t := payout.ProcessedAt.Format("2006-01-02T15:04:05.999999Z07:00")
			processedAtStr = &t
		}

		var gatewayTransferID string
		if payout.GatewayTransferID != nil {
			gatewayTransferID = *payout.GatewayTransferID
		}
		
		var paymentAccountID uint
		if payout.PaymentAccountID != nil {
			paymentAccountID = *payout.PaymentAccountID
		}

		payoutResponses[i] = PayoutResponse{
			ID:                payout.ID,
			UserID:            payout.UserID,
			PayoutType:        payout.PayoutType,
			PayoutMethod:      payout.PayoutMethod,
			AmountTokens:      payout.AmountTokens,
			AmountCurrency:    payout.AmountCurrency,
			AmountValue:       payout.AmountValue,
			Status:            payout.Status,
			PayoutDetails:     payout.PayoutDetails,
			ProcessedAt:       processedAtStr,
			CreatedAt:         payout.CreatedAt.Format("2006-01-02T15:04:05.999999Z07:00"),
			UpdatedAt:         payout.UpdatedAt.Format("2006-01-02T15:04:05.999999Z07:00"),
			GatewayTransferID: gatewayTransferID,
			PaymentAccountID:  paymentAccountID,
			PaymentAccount:    paymentAccountResp,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"payouts": payoutResponses,
		"summary": gin.H{
			"total_requested": totalRequested,
			"total_completed": totalCompleted,
			"total_pending":   totalPending,
			"total_failed":    totalFailed,
			"count":           len(payouts),
		},
	})
}
