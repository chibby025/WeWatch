// WeWatch/backend/internal/models/gateway_earning.go
package models

import (
	"time"
	"gorm.io/gorm"
	"database/sql/driver"
)

// Currency enum for supported currencies
type Currency string

const (
	CurrencyUSD Currency = "USD"
	CurrencyNGN Currency = "NGN"
	CurrencyGHS Currency = "GHS"
	CurrencyKES Currency = "KES"
)

// Scan implements the sql.Scanner interface
func (c *Currency) Scan(value interface{}) error {
	*c = Currency(value.(string))
	return nil
}

// Value implements the driver.Valuer interface
func (c Currency) Value() (driver.Value, error) {
	return string(c), nil
}

// PaymentGateway enum
type PaymentGateway string

const (
	PaymentGatewayPaystack PaymentGateway = "paystack"
	PaymentGatewayStripe   PaymentGateway = "stripe"
)

// Scan implements the sql.Scanner interface
func (pg *PaymentGateway) Scan(value interface{}) error {
	*pg = PaymentGateway(value.(string))
	return nil
}

// Value implements the driver.Valuer interface
func (pg PaymentGateway) Value() (driver.Value, error) {
	return string(pg), nil
}

// GatewayEarning represents earnings from Stripe/Paystack payments
type GatewayEarning struct {
	ID                 uint            `gorm:"primaryKey" json:"id"`
	HostID             uint            `gorm:"not null;index" json:"host_id"`
	Host               *User           `gorm:"foreignKey:HostID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"host,omitempty"`
	SessionID          *uint           `gorm:"index" json:"session_id,omitempty"`
	Session            *WatchSession   `gorm:"foreignKey:SessionID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"session,omitempty"`
	SessionTicketID    *uint           `gorm:"index" json:"session_ticket_id,omitempty"`
	SessionTicket      *SessionTicket  `gorm:"foreignKey:SessionTicketID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"session_ticket,omitempty"`
	DonationID         *uint           `gorm:"index" json:"donation_id,omitempty"`
	Donation           *Donation       `gorm:"foreignKey:DonationID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"donation,omitempty"`
	PaymentGateway     string          `gorm:"type:varchar(20);not null" json:"payment_gateway"`
	Currency           string          `gorm:"type:varchar(10);not null" json:"currency"`
	GrossAmount        float64         `gorm:"type:decimal(10,2);not null" json:"gross_amount"`
	PlatformCommission float64         `gorm:"type:decimal(10,2);not null" json:"platform_commission"`
	NetAmount          float64         `gorm:"type:decimal(10,2);not null" json:"net_amount"`
	PaymentID          string          `gorm:"type:varchar(255);not null;uniqueIndex" json:"payment_id"`
	IsWithdrawn        bool            `gorm:"default:false;index" json:"is_withdrawn"`
	WithdrawnAt        *time.Time      `json:"withdrawn_at,omitempty"`
	CreatedAt          time.Time       `gorm:"autoCreateTime;index" json:"created_at"`
	UpdatedAt          time.Time       `gorm:"autoUpdateTime" json:"updated_at"`
}

// CalculateNetAmount calculates net amount after 25% commission
func CalculateNetAmount(grossAmount float64) (netAmount, commission float64) {
	commission = grossAmount * 0.25
	netAmount = grossAmount - commission
	return netAmount, commission
}

// CanWithdraw checks if earning can be withdrawn
func (g *GatewayEarning) CanWithdraw() bool {
	return !g.IsWithdrawn
}

// BeforeCreate hook to calculate net amount
func (g *GatewayEarning) BeforeCreate(tx *gorm.DB) error {
	if g.NetAmount == 0 && g.GrossAmount > 0 {
		g.NetAmount, g.PlatformCommission = CalculateNetAmount(g.GrossAmount)
	}
	return nil
}
