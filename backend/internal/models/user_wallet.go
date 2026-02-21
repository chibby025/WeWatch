// WeWatch/backend/internal/models/user_wallet.go
package models

import (
	"errors"
	"time"
	"gorm.io/gorm"
)

// UserWallet represents a user's token wallet
type UserWallet struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	UserID         uint      `gorm:"uniqueIndex;not null" json:"user_id"`
	User           *User     `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"user,omitempty"`
	TokenBalance   int       `gorm:"not null;default:0;check:token_balance >= 0" json:"token_balance"`
	LifetimeEarned int       `gorm:"not null;default:0" json:"lifetime_earned"`
	LifetimeSpent  int       `gorm:"not null;default:0" json:"lifetime_spent"`
	CreatedAt      time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt      time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// AddTokens adds tokens to the wallet (for purchases or earnings)
// AddTokens adds tokens (in units, where 100 units = 1 token)
func (w *UserWallet) AddTokens(amount int) {
	w.TokenBalance += amount
	w.LifetimeEarned += amount
}

// GetTokensAsFloat returns the token balance as a float (e.g., 121 units = 1.21 tokens)
func (w *UserWallet) GetTokensAsFloat() float64 {
	return float64(w.TokenBalance) / 100.0
}

// TokensToUnits converts token amount to storage units (e.g., 1.5 tokens = 150 units)
func TokensToUnits(tokens float64) int {
	return int(tokens * 100)
}

// DeductTokens removes tokens from the wallet (for purchases)
func (w *UserWallet) DeductTokens(amount int) error {
	if w.TokenBalance < amount {
		return ErrInsufficientBalance
	}
	w.TokenBalance -= amount
	w.LifetimeSpent += amount
	return nil
}

// CanWithdraw checks if user meets minimum payout threshold
func (w *UserWallet) CanWithdraw(minTokens int) bool {
	return w.TokenBalance >= minTokens
}

// BeforeCreate hook to initialize default values
func (w *UserWallet) BeforeCreate(tx *gorm.DB) error {
	if w.TokenBalance < 0 {
		return errors.New("token balance cannot be negative")
	}
	return nil
}
