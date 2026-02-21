// WeWatch/backend/internal/models/session_ticket.go
package models

import (
	"time"
	"gorm.io/gorm"
	"database/sql/driver"
)

// PaymentMethod enum for ticket payment methods
type PaymentMethod string

const (
	PaymentMethodTokens   PaymentMethod = "tokens"
	PaymentMethodPaystack PaymentMethod = "paystack"
	PaymentMethodStripe   PaymentMethod = "stripe"
)

// Scan implements the sql.Scanner interface
func (pm *PaymentMethod) Scan(value interface{}) error {
	*pm = PaymentMethod(value.(string))
	return nil
}

// Value implements the driver.Valuer interface
func (pm PaymentMethod) Value() (driver.Value, error) {
	return string(pm), nil
}

// SessionTicket represents a purchased ticket for a watch session
type SessionTicket struct {
	ID                  uint           `gorm:"primaryKey" json:"id"`
	SessionID           uint           `gorm:"not null;index" json:"session_id"`
	Session             *WatchSession  `gorm:"foreignKey:SessionID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"session,omitempty"`
	UserID              uint           `gorm:"not null;index" json:"user_id"`
	User                *User          `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"user,omitempty"`
	HostID              uint           `gorm:"not null;index" json:"host_id"`
	Host                *User          `gorm:"foreignKey:HostID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"host,omitempty"`
	PaymentMethod       string         `gorm:"type:varchar(20);not null" json:"payment_method"`
	TicketPriceTokens   int            `gorm:"default:0" json:"ticket_price_tokens"`
	TicketPriceCurrency string         `gorm:"type:varchar(10)" json:"ticket_price_currency,omitempty"`
	TicketPriceAmount   float64        `gorm:"type:decimal(10,2);default:0" json:"ticket_price_amount"`
	IsEarlyBird         bool           `gorm:"default:false" json:"is_early_bird"`
	TransactionID       *uint          `gorm:"index" json:"transaction_id,omitempty"`
	Transaction         *TokenTransaction `gorm:"foreignKey:TransactionID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"transaction,omitempty"`
	GatewayEarningID    *uint          `gorm:"index" json:"gateway_earning_id,omitempty"`
	GatewayEarning      *GatewayEarning `gorm:"foreignKey:GatewayEarningID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"gateway_earning,omitempty"`
	IsGift              bool           `gorm:"default:false" json:"is_gift"`
	GiftedByUserID      *uint          `gorm:"index" json:"gifted_by_user_id,omitempty"`
	GiftedBy            *User          `gorm:"foreignKey:GiftedByUserID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"gifted_by,omitempty"`
	IsRefunded          bool           `gorm:"default:false;index" json:"is_refunded"`
	RefundReason        *string        `gorm:"type:text" json:"refund_reason,omitempty"`
	RefundedAt          *time.Time     `json:"refunded_at,omitempty"`
	CreatedAt           time.Time      `gorm:"autoCreateTime;index" json:"created_at"`
	UpdatedAt           time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
}

// IsGifted checks if the ticket was a gift
func (t *SessionTicket) IsGifted() bool {
	return t.IsGift && t.GiftedByUserID != nil
}

// CanRefund checks if the ticket is eligible for refund
func (t *SessionTicket) CanRefund() bool {
	return !t.IsRefunded && time.Since(t.CreatedAt) < 24*time.Hour
}

// BeforeCreate hook to validate ticket
func (t *SessionTicket) BeforeCreate(tx *gorm.DB) error {
	// Ensure at least one price is set
	if t.TicketPriceTokens == 0 && t.TicketPriceAmount == 0 {
		return ErrInvalidTicketPrice
	}
	return nil
}
