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

	c.JSON(http.StatusOK, gin.H{
		"payouts": payouts,
		"summary": gin.H{
			"total_requested": totalRequested,
			"total_completed": totalCompleted,
			"total_pending":   totalPending,
			"total_failed":    totalFailed,
			"count":           len(payouts),
		},
	})
}
