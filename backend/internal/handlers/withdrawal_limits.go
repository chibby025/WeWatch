package handlers

import (
	"time"

	"gorm.io/gorm"

	"wewatch-backend/internal/models"
)

// CheckDailyWithdrawalLimit checks if user has exceeded ₦500,000 daily withdrawal limit
func CheckDailyWithdrawalLimit(db *gorm.DB, userID uint, newAmount float64, currency string) (bool, float64, error) {
	// Only enforce limit for NGN withdrawals (₦500,000 = $500,000 NGN)
	if currency != "NGN" {
		return true, 0, nil // No limit for other currencies (yet)
	}
	
	// Get start of today (midnight)
	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	
	// Calculate total withdrawn today (approved + processing + completed statuses)
	var totalWithdrawnToday float64
	err := db.Model(&models.Payout{}).
		Where("user_id = ? AND created_at >= ? AND status IN (?, ?, ?)", 
			userID, 
			startOfDay,
			models.PayoutStatusProcessing,
			models.PayoutStatusCompleted,
			"approved", // Legacy status
		).
		Select("COALESCE(SUM(amount_value), 0)").
		Scan(&totalWithdrawnToday).Error
	
	if err != nil {
		return false, 0, err
	}
	
	// Daily limit: ₦500,000
	const dailyLimit = 500000.0
	
	// Check if adding new amount would exceed limit
	if totalWithdrawnToday + newAmount > dailyLimit {
		remaining := dailyLimit - totalWithdrawnToday
		if remaining < 0 {
			remaining = 0
		}
		return false, remaining, nil
	}
	
	return true, dailyLimit - (totalWithdrawnToday + newAmount), nil
}
