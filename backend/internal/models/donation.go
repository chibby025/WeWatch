// WeWatch/backend/internal/models/donation.go
package models

import (
	"time"
	"gorm.io/gorm"
)

// Donation represents a donation made during a watch session
type Donation struct {
	ID               uint              `gorm:"primaryKey" json:"id"`
	SessionID        uint              `gorm:"not null;index" json:"session_id"`
	Session          *WatchSession     `gorm:"foreignKey:SessionID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"session,omitempty"`
	DonorID          *uint             `gorm:"index" json:"donor_id,omitempty"`
	Donor            *User             `gorm:"foreignKey:DonorID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"donor,omitempty"`
	HostID           uint              `gorm:"not null;index" json:"host_id"`
	Host             *User             `gorm:"foreignKey:HostID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"host,omitempty"`
	AmountTokens     int               `gorm:"not null;check:amount_tokens > 0" json:"amount_tokens"`
	PaymentMethod    string            `gorm:"type:varchar(20);not null" json:"payment_method"`
	Message          *string           `gorm:"type:text" json:"message,omitempty"`
	IsAnonymous      bool              `gorm:"default:false" json:"is_anonymous"`
	TransactionID    *uint             `gorm:"index" json:"transaction_id,omitempty"`
	Transaction      *TokenTransaction `gorm:"foreignKey:TransactionID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"transaction,omitempty"`
	GatewayEarningID *uint             `gorm:"index" json:"gateway_earning_id,omitempty"`
	GatewayEarning   *GatewayEarning   `gorm:"foreignKey:GatewayEarningID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"gateway_earning,omitempty"`
	CreatedAt        time.Time         `gorm:"autoCreateTime;index" json:"created_at"`
	UpdatedAt        time.Time         `gorm:"autoUpdateTime" json:"updated_at"`
}

// GetDonorName returns the donor's username or "Anonymous"
func (d *Donation) GetDonorName() string {
	if d.IsAnonymous || d.Donor == nil {
		return "Anonymous"
	}
	return d.Donor.Username
}

// BeforeCreate hook to validate donation
func (d *Donation) BeforeCreate(tx *gorm.DB) error {
	if d.AmountTokens < 1 {
		return ErrInvalidTicketPrice // Reusing error, could create ErrInvalidDonationAmount
	}
	return nil
}
