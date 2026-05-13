// WeWatch/backend/internal/models/token_transaction.go
package models

import (
	"time"
	"gorm.io/gorm"
	"database/sql/driver"
)

// TransactionType enum for different types of token transactions
type TransactionType string

const (
	TransactionTypePurchase          TransactionType = "purchase"
	TransactionTypeTicket            TransactionType = "ticket"
	TransactionTypeTicketPurchase    TransactionType = "ticket_purchase"
	TransactionTypeDonation          TransactionType = "donation"
	TransactionTypeRefund            TransactionType = "refund"
	TransactionTypePayout            TransactionType = "payout"
	TransactionTypeGiftSent          TransactionType = "gift_sent"
	TransactionTypeGiftReceived      TransactionType = "gift_received"
	TransactionTypeTicketTransferFee TransactionType = "ticket_transfer_fee" // 5% platform fee on ticket transfers
	TransactionTypeEarlyBirdSavings  TransactionType = "early_bird_savings"  // Informational: savings from early bird pricing
	TransactionTypePostPurchase      TransactionType = "post_purchase"       // Buyer side: tokens spent on a paid post
	TransactionTypePostSale          TransactionType = "post_sale"           // Creator side: 75% of post purchase credited to creator wallet
)

// Scan implements the sql.Scanner interface
func (tt *TransactionType) Scan(value interface{}) error {
	*tt = TransactionType(value.(string))
	return nil
}

// Value implements the driver.Valuer interface
func (tt TransactionType) Value() (driver.Value, error) {
	return string(tt), nil
}

// TransactionStatus enum for transaction states
type TransactionStatus string

const (
	TransactionStatusPending   TransactionStatus = "pending"
	TransactionStatusCompleted TransactionStatus = "completed"
	TransactionStatusFailed    TransactionStatus = "failed"
	TransactionStatusRefunded  TransactionStatus = "refunded"
)

// Scan implements the sql.Scanner interface
func (ts *TransactionStatus) Scan(value interface{}) error {
	*ts = TransactionStatus(value.(string))
	return nil
}

// Value implements the driver.Valuer interface
func (ts TransactionStatus) Value() (driver.Value, error) {
	return string(ts), nil
}

// TokenTransaction represents a token transaction record
type TokenTransaction struct {
	ID                 uint              `gorm:"primaryKey" json:"id"`
	UserID             uint              `gorm:"not null;index" json:"user_id"`
	User               *User             `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"user,omitempty"`
	SessionID          *uint             `gorm:"index" json:"session_id,omitempty"`
	Session            *WatchSession     `gorm:"foreignKey:SessionID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"session,omitempty"`
	TransactionType    TransactionType   `gorm:"type:varchar(20);not null;index" json:"transaction_type"`
	Amount             int               `gorm:"not null;check:amount > 0" json:"amount"`
	USDValue           *float64          `gorm:"type:decimal(10,2)" json:"usd_value,omitempty"`
	PaymentMethod      *string           `gorm:"type:varchar(20)" json:"payment_method,omitempty"`
	PaymentID          *string           `gorm:"type:varchar(255);index" json:"payment_id,omitempty"`
	RevenueTransferID  *string           `gorm:"type:varchar(255);index" json:"revenue_transfer_id,omitempty"` // 25% platform revenue
	ReserveTransferID  *string           `gorm:"type:varchar(255);index" json:"reserve_transfer_id,omitempty"` // 75% host reserve
	Status             TransactionStatus `gorm:"type:varchar(20);not null;default:'pending';index" json:"status"`
	Metadata           map[string]interface{} `gorm:"type:jsonb" json:"metadata,omitempty"`
	
	// Crypto payment fields
	PaymentProvider    string  `gorm:"type:varchar(50)" json:"payment_provider,omitempty"`      // 'stripe', 'paystack', 'coinbase_commerce'
	CryptoCurrency     string  `gorm:"type:varchar(10)" json:"crypto_currency,omitempty"`       // 'USDT', 'USDC', 'ETH', NULL for fiat
	CryptoAmount       string  `gorm:"type:varchar(50)" json:"crypto_amount,omitempty"`         // Amount in crypto (stored as string for precision)
	CryptoNetwork      string  `gorm:"type:varchar(50)" json:"crypto_network,omitempty"`        // 'ethereum', 'polygon', 'base', NULL for fiat
	BlockchainTxHash   string  `gorm:"type:varchar(100);index" json:"blockchain_tx_hash,omitempty"` // Blockchain transaction hash
	CoinbaseChargeID   string  `gorm:"type:varchar(100);index" json:"coinbase_charge_id,omitempty"` // Coinbase Commerce charge ID
	
	CreatedAt          time.Time         `gorm:"autoCreateTime;index" json:"created_at"`
	UpdatedAt          time.Time         `gorm:"autoUpdateTime" json:"updated_at"`
}

// BeforeCreate hook to validate transaction
func (t *TokenTransaction) BeforeCreate(tx *gorm.DB) error {
	if t.Amount <= 0 {
		return ErrInvalidTicketPrice
	}
	return nil
}
