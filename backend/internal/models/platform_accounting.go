// WeWatch/backend/internal/models/platform_accounting.go
package models

import (
	"time"
	"gorm.io/gorm"
)

// PlatformAccounting tracks platform revenue vs host reserves
// This ensures we never overspend money that belongs to hosts
type PlatformAccounting struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	
	// Current Balances (Real-time)
	TotalPlatformRevenue float64 `gorm:"type:decimal(15,2);not null;default:0" json:"total_platform_revenue"` // All NET money that entered platform (never decreases)
	PlatformProfit       float64 `gorm:"type:decimal(15,2);not null;default:0;check:platform_profit >= 0" json:"platform_profit"` // Platform 25% commission - can withdraw safely
	HostReserveBalance   float64 `gorm:"type:decimal(15,2);not null;default:0;check:host_reserve_balance >= 0" json:"host_reserve_balance"` // Money owed to hosts (75%)
	TotalGatewayBalance  float64 `gorm:"type:decimal(15,2);not null;default:0" json:"total_gateway_balance"` // Actual money in Stripe/Paystack right now
	
	// Lifetime metrics (Historical - never decrease)
	LifetimeTotalRevenue    float64 `gorm:"type:decimal(15,2);not null;default:0" json:"lifetime_total_revenue"`    // All NET money ever entered
	LifetimePlatformProfit  float64 `gorm:"type:decimal(15,2);not null;default:0" json:"lifetime_platform_profit"`  // All 25% commission ever earned
	LifetimeHostEarnings    float64 `gorm:"type:decimal(15,2);not null;default:0" json:"lifetime_host_earnings"`    // All host earnings ever attributed
	LifetimePayouts         float64 `gorm:"type:decimal(15,2);not null;default:0" json:"lifetime_payouts"`         // Total paid out to hosts
	LifetimeUserSpend       float64 `gorm:"type:decimal(15,2);not null;default:0" json:"lifetime_user_spend"`       // Total GROSS user spending
	LifetimeGatewayFees     float64 `gorm:"type:decimal(15,2);not null;default:0" json:"lifetime_gateway_fees"`     // Total fees paid to Paystack/Stripe
	
	// Token Donation Commission (5% from wallet-to-wallet gifts)
	TokenDonationCommission         float64 `gorm:"type:decimal(15,2);not null;default:0" json:"token_donation_commission"`          // Current balance of 5% gift commissions
	LifetimeTokenDonationCommission float64 `gorm:"type:decimal(15,2);not null;default:0" json:"lifetime_token_donation_commission"` // All gift commissions ever earned
	
	// Ticket Transfer Fee Revenue (5% fee on ticket gifts/transfers)
	TransferFeeRevenue         float64 `gorm:"type:decimal(15,2);not null;default:0" json:"transfer_fee_revenue"`          // Current balance of 5% transfer fees
	LifetimeTransferFeeRevenue float64 `gorm:"type:decimal(15,2);not null;default:0" json:"lifetime_transfer_fee_revenue"` // All transfer fees ever earned
	
	// Early Bird Analytics (informational - not revenue)
	TotalEarlyBirdSavings float64 `gorm:"type:decimal(15,2);not null;default:0" json:"total_early_bird_savings"` // Total savings given to users via early bird pricing
	
	// Pending amounts
	PendingPayouts float64 `gorm:"type:decimal(15,2);not null;default:0" json:"pending_payouts"` // Withdrawal requests pending
	
	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// TableName specifies the table name (override GORM's default pluralization)
func (PlatformAccounting) TableName() string {
	return "platform_accounting"
}

// AddTokenPurchase records revenue from token purchases
// NEW MODEL: Token economics = Buy ₦165, Sell ₦122, Profit ₦43 per token
// amount: Total ₦165 received when user buys tokens
func (pa *PlatformAccounting) AddTokenPurchase(amount float64) {
	// New economics: Split purchase into profit (₦43) and reserve (₦122) per token
	// Example: User buys 1 token for ₦165
	//   - Platform Profit: ₦43 (165 - 122) = 26% margin
	//   - Reserve (backing): ₦122 (for future withdrawal at ₦122/token)
	reservePortion := amount * (122.0 / 165.0)   // ₦122 per token
	platformPortion := amount * (43.0 / 165.0)   // ₦43 per token (26% profit)
	
	pa.TotalPlatformRevenue += amount            // All NET money that entered
	pa.PlatformProfit += platformPortion         // Your ₦43 per token profit
	pa.HostReserveBalance += reservePortion      // ₦122 per token backing
	pa.TotalGatewayBalance += amount             // Total in gateway
	pa.LifetimeTotalRevenue += amount            // Historical: all money in
	pa.LifetimePlatformProfit += platformPortion // Historical: your commission
	// Note: LifetimeHostEarnings updated when tokens are spent (attribution)
}

// AddTokenPurchaseWithFee records revenue from token purchases including fee tracking
// NEW MODEL: Token economics = Buy ₦165, Sell ₦122, Profit ₦43 per token
// grossAmount: What user paid (e.g., ₦200)
// netAmount: What platform received after fees (e.g., ₦197)
// fee: Gateway fee (e.g., ₦3)
func (pa *PlatformAccounting) AddTokenPurchaseWithFee(grossAmount, netAmount, fee float64) {
	// New economics: Split netAmount into profit (₦43) and reserve (₦122) per token
	reservePortion := netAmount * (122.0 / 165.0)   // ₦122 per token backing
	platformPortion := netAmount * (43.0 / 165.0)   // ₦43 per token profit
	
	pa.TotalPlatformRevenue += netAmount       // All NET money that entered
	pa.PlatformProfit += platformPortion       // Your ₦43 per token profit
	pa.HostReserveBalance += reservePortion    // ₦122 per token backing
	pa.TotalGatewayBalance += netAmount        // Total in gateway
	pa.LifetimeTotalRevenue += netAmount       // Historical: all money in
	pa.LifetimePlatformProfit += platformPortion // Historical: your commission
	pa.LifetimeUserSpend += grossAmount        // Historical: GROSS user spending
	pa.LifetimeGatewayFees += fee              // Historical: fees paid to gateways
	// Note: LifetimeHostEarnings updated when tokens are spent (attribution)
}

// AddTokenRevenue records revenue from token purchases
// DEPRECATED: Use AddTokenPurchaseWithFee for token purchases
// NEW MODEL: Splits at ₦122 reserve / ₦43 profit ratio
func (pa *PlatformAccounting) AddTokenRevenue(amount float64) {
	reservePortion := amount * (122.0 / 165.0)
	platformPortion := amount * (43.0 / 165.0)
	
	pa.HostReserveBalance += reservePortion
	pa.PlatformProfit += platformPortion
	pa.TotalGatewayBalance += amount
	pa.LifetimeUserSpend += amount
}

// RecordTokenSpending tracks when users spend tokens (tickets/donations)
// NEW MODEL: No accounting changes - just track attribution
// Host gets 100% of tokens spent, platform already profited on purchase
func (pa *PlatformAccounting) RecordTokenSpending(amount float64) {
	// Host gets 100% of token value when user spends
	// Example: User spends 82 cents on ticket
	//   - Host wallet: +82 cents
	//   - Platform accounting: NO CHANGE (profit already captured at purchase)
	//   - Reserve backing: Still ₦122 per token for future withdrawal
	
	// Track host earnings attribution (historical metric)
	// This is for analytics/reporting only, no balance changes
	pa.LifetimeHostEarnings += amount
	
	// Note: No balance changes needed!
	// - PlatformProfit already has ₦43 per token from purchase
	// - HostReserveBalance already has ₦122 per token backing from purchase
	// - When host withdraws, we pay ₦122 per token from reserve
}

// RecordTokenDonationCommission tracks 5% commission from wallet-to-wallet token gifts
// NEW MODEL: Keep as token cents, deduct from reserve when calculating withdrawals
// This is NOT converted to naira - stays as token cents for tracking
func (pa *PlatformAccounting) RecordTokenDonationCommission(commissionInCents float64) {
	// Commission is in token cents (e.g., 5 cents from 100 cent gift)
	// Convert to naira value for accounting: 5 cents = 5 × 122 ÷ 100 = ₦6.10
	commissionInNaira := commissionInCents * 122.0 / 100.0
	
	// This commission comes from the reserve (since tokens were already backed)
	// Transfer from reserve to platform profit
	pa.HostReserveBalance -= commissionInNaira
	pa.PlatformProfit += commissionInNaira
	
	pa.TokenDonationCommission += commissionInNaira
	pa.LifetimeTokenDonationCommission += commissionInNaira
}

// RecordHostEarning when host earns from tickets/donations
// This doesn't add new money, just tracks who earned what
func (pa *PlatformAccounting) RecordHostEarning(amount float64) {
	// Money already in reserve, just tracking attribution
	// 85% was already allocated to reserve
	// 15% already in platform revenue
}

// ProcessPayout when host withdraws money
func (pa *PlatformAccounting) ProcessPayout(amount float64) error {
	if pa.HostReserveBalance < amount {
		return ErrInsufficientReserveBalance
	}
	
	pa.HostReserveBalance -= amount    // Deduct from reserve
	pa.TotalGatewayBalance -= amount   // Money leaves gateway
	pa.LifetimePayouts += amount       // Track total paid out (historical)
	pa.PendingPayouts -= amount        // Remove from pending
	
	// Note: TotalPlatformRevenue unchanged (historical metric)
	// Note: PlatformProfit unchanged (your money is safe)
	
	return nil
}

// AddPendingPayout when withdrawal is requested but not yet processed
func (pa *PlatformAccounting) AddPendingPayout(amount float64) error {
	if pa.HostReserveBalance < amount {
		return ErrInsufficientReserveBalance
	}
	pa.PendingPayouts += amount
	return nil
}

// CancelPendingPayout when withdrawal is cancelled
func (pa *PlatformAccounting) CancelPendingPayout(amount float64) {
	pa.PendingPayouts -= amount
}

// GetAvailableReserve returns how much can be paid out to hosts
func (pa *PlatformAccounting) GetAvailableReserve() float64 {
	return pa.HostReserveBalance - pa.PendingPayouts
}

// GetPlatformProfit returns actual platform profit (what you can withdraw safely)
func (pa *PlatformAccounting) GetPlatformProfit() float64 {
	return pa.PlatformProfit
}

// IsBalanced checks if accounting is correct
// Total gateway balance should equal profit + reserve
func (pa *PlatformAccounting) IsBalanced() bool {
	expected := pa.PlatformProfit + pa.HostReserveBalance
	tolerance := 0.01 // Allow 1 cent difference for floating point
	difference := pa.TotalGatewayBalance - expected
	
	if difference < 0 {
		difference = -difference
	}
	
	return difference <= tolerance
}

// BeforeUpdate hook to validate accounting
func (pa *PlatformAccounting) BeforeUpdate(tx *gorm.DB) error {
	if !pa.IsBalanced() {
		return ErrAccountingImbalance
	}
	return nil
}

// Singleton instance - only one accounting record
func GetPlatformAccounting(db *gorm.DB) (*PlatformAccounting, error) {
	var accounting PlatformAccounting
	
	err := db.FirstOrCreate(&accounting, PlatformAccounting{ID: 1}).Error
	if err != nil {
		return nil, err
	}
	
	return &accounting, nil
}
