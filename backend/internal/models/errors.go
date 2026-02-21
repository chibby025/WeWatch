// WeWatch/backend/internal/models/errors.go
package models

import "errors"

// Payment-related error definitions
var (
	ErrInsufficientBalance     = errors.New("insufficient token balance")
	ErrInvalidPaymentMethod    = errors.New("invalid payment method")
	ErrTicketAlreadyPurchased  = errors.New("ticket already purchased for this session")
	ErrSessionNotTicketed      = errors.New("session does not require tickets")
	ErrInvalidTicketPrice      = errors.New("invalid ticket price")
	ErrPaymentFailed           = errors.New("payment processing failed")
	ErrRefundNotAllowed        = errors.New("refund not allowed (24-hour window passed)")
	ErrKYCNotVerified          = errors.New("KYC verification required for this transaction")
	ErrMinimumPayoutNotMet     = errors.New("minimum payout amount not met (50 tokens)")
	ErrInvalidCurrency         = errors.New("invalid or unsupported currency")
	ErrPayoutProcessing        = errors.New("payout is already being processed")
	ErrInsufficientReserveBalance = errors.New("insufficient reserve balance for host payouts")
	ErrAccountingImbalance     = errors.New("accounting imbalance detected - total does not match reserve + revenue")
)
