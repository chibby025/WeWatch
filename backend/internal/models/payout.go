// WeWatch/backend/internal/models/payout.go
package models

import (
	"time"
	"gorm.io/gorm"
	"gorm.io/datatypes"
	"database/sql/driver"
)

// PayoutType enum
type PayoutType string

const (
	PayoutTypeTokens          PayoutType = "tokens"
	PayoutTypeGatewayEarnings PayoutType = "gateway_earnings"
)

// Scan implements the sql.Scanner interface
func (pt *PayoutType) Scan(value interface{}) error {
	*pt = PayoutType(value.(string))
	return nil
}

// Value implements the driver.Valuer interface
func (pt PayoutType) Value() (driver.Value, error) {
	return string(pt), nil
}

// PayoutMethod enum
type PayoutMethod string

const (
	PayoutMethodBankTransfer PayoutMethod = "bank_transfer"
	PayoutMethodPayPal       PayoutMethod = "paypal"
	PayoutMethodMobileMoney  PayoutMethod = "mobile_money"
)

// Scan implements the sql.Scanner interface
func (pm *PayoutMethod) Scan(value interface{}) error {
	*pm = PayoutMethod(value.(string))
	return nil
}

// Value implements the driver.Valuer interface
func (pm PayoutMethod) Value() (driver.Value, error) {
	return string(pm), nil
}

// PayoutStatus enum
type PayoutStatus string

const (
	PayoutStatusPending    PayoutStatus = "pending"
	PayoutStatusProcessing PayoutStatus = "processing"
	PayoutStatusCompleted  PayoutStatus = "completed"
	PayoutStatusFailed     PayoutStatus = "failed"
	PayoutStatusCancelled  PayoutStatus = "cancelled"
	PayoutStatusRejected   PayoutStatus = "rejected"
)

// Scan implements the sql.Scanner interface
func (ps *PayoutStatus) Scan(value interface{}) error {
	*ps = PayoutStatus(value.(string))
	return nil
}

// Value implements the driver.Valuer interface
func (ps PayoutStatus) Value() (driver.Value, error) {
	return string(ps), nil
}

// Payout represents a withdrawal request
type Payout struct {
	ID              uint                   `gorm:"primaryKey" json:"id"`
	UserID          uint                   `gorm:"not null;index" json:"user_id"`
	User            *User                  `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"user,omitempty"`
	PayoutType      string                 `gorm:"type:varchar(20);not null" json:"payout_type"`
	PayoutMethod    string                 `gorm:"type:varchar(20);not null" json:"payout_method"`
	AmountTokens    *int                   `gorm:"check:amount_tokens > 0" json:"amount_tokens,omitempty"`
	AmountCurrency  *string                `gorm:"type:varchar(10)" json:"amount_currency,omitempty"`
	AmountValue     *float64               `gorm:"type:decimal(10,2)" json:"amount_value,omitempty"`
	Status          string                 `gorm:"type:varchar(20);not null;default:'pending';index" json:"status"`
	PayoutDetails   datatypes.JSON         `gorm:"type:jsonb" json:"payout_details"`
	ExternalID      *string                `gorm:"type:varchar(255);index" json:"external_id,omitempty"`
	FailureReason   *string                `gorm:"type:text" json:"failure_reason,omitempty"`
	ProcessedAt     *time.Time             `json:"processed_at,omitempty"`
	CompletedAt     *time.Time             `json:"completed_at,omitempty"`
	CreatedAt       time.Time              `gorm:"autoCreateTime;index" json:"created_at"`
	UpdatedAt       time.Time              `gorm:"autoUpdateTime" json:"updated_at"`
	
	// New fields for automated payouts (Phase 3)
	GatewayTransferID *string         `gorm:"type:varchar(100);index" json:"gateway_transfer_id,omitempty"` // Paystack/Stripe transfer ID
	PaymentAccountID  *uint           `gorm:"index" json:"payment_account_id,omitempty"`                     // FK to payment_accounts
	PaymentAccount    *PaymentAccount `gorm:"foreignKey:PaymentAccountID" json:"payment_account,omitempty"`
}

// IsProcessable checks if payout can be processed
func (p *Payout) IsProcessable() bool {
	return p.Status == string(PayoutStatusPending)
}

// MarkAsProcessing updates status to processing
func (p *Payout) MarkAsProcessing() {
	p.Status = string(PayoutStatusProcessing)
	now := time.Now()
	p.ProcessedAt = &now
}

// MarkAsCompleted updates status to completed
func (p *Payout) MarkAsCompleted(externalID string) {
	p.Status = string(PayoutStatusCompleted)
	p.ExternalID = &externalID
	now := time.Now()
	p.CompletedAt = &now
}

// MarkAsFailed updates status to failed
func (p *Payout) MarkAsFailed(reason string) {
	p.Status = string(PayoutStatusFailed)
	p.FailureReason = &reason
}

// GetAmount returns the amount as interface{} (could be tokens or currency value)
func (p *Payout) GetAmount() interface{} {
	if p.PayoutType == string(PayoutTypeTokens) && p.AmountTokens != nil {
		return *p.AmountTokens
	}
	if p.AmountValue != nil {
		return *p.AmountValue
	}
	return 0
}

// BeforeCreate hook to validate payout
func (p *Payout) BeforeCreate(tx *gorm.DB) error {
	// No minimum restrictions - allow withdrawals of any amount
	return nil
}
