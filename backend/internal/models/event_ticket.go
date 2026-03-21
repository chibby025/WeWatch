package models

import (
	"time"
	"gorm.io/gorm"
)

// EventTicket represents a purchased ticket or RSVP for a scheduled event
type EventTicket struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	ScheduledEventID uint    `gorm:"not null;index" json:"scheduled_event_id"`
	UserID         uint      `gorm:"not null;index" json:"user_id"`
	HostID         uint      `gorm:"not null;index" json:"host_id"` // For quick host earnings queries
	
	// Payment details
	PaymentMethod       string  `gorm:"type:varchar(20);not null" json:"payment_method"` // "tokens", "free_rsvp", "paystack", "stripe"
	TicketPriceTokens   int     `gorm:"default:0" json:"ticket_price_tokens"`
	TicketPriceCurrency string  `gorm:"type:varchar(10)" json:"ticket_price_currency"`
	TicketPriceAmount   float64 `gorm:"type:decimal(10,2);default:0" json:"ticket_price_amount"`
	IsEarlyBird         bool    `gorm:"default:false" json:"is_early_bird"`
	
	// Transaction tracking
	TransactionID    *uint `gorm:"index" json:"transaction_id,omitempty"`    // Link to token_transactions
	GatewayEarningID *uint `gorm:"index" json:"gateway_earning_id,omitempty"` // Link to gateway_earnings
	
	// Gifting support
	IsGift          bool  `gorm:"default:false" json:"is_gift"`
	GiftedByUserID  *uint `gorm:"index" json:"gifted_by_user_id,omitempty"`
	
	// Status
	IsRefunded      bool       `gorm:"default:false;index" json:"is_refunded"`
	RefundedAt      *time.Time `json:"refunded_at,omitempty"`
	IsCancelled     bool       `gorm:"default:false" json:"is_cancelled"` // For free RSVP cancellations
	CancelledAt     *time.Time `json:"cancelled_at,omitempty"`
	
	// Attendance tracking
	DidAttend       *bool      `json:"did_attend,omitempty"` // NULL if event hasn't started, true/false after
	AttendedAt      *time.Time `json:"attended_at,omitempty"` // When user joined the session
	
	CreatedAt time.Time `gorm:"autoCreateTime;index" json:"created_at"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
	
	// Relationships
	ScheduledEvent *ScheduledEvent    `gorm:"foreignKey:ScheduledEventID" json:"scheduled_event,omitempty"`
	User           *User              `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Host           *User              `gorm:"foreignKey:HostID" json:"host,omitempty"`
	GiftedBy       *User              `gorm:"foreignKey:GiftedByUserID" json:"gifted_by,omitempty"`
	Transaction    *TokenTransaction  `gorm:"foreignKey:TransactionID" json:"transaction,omitempty"`
	GatewayEarning *GatewayEarning    `gorm:"foreignKey:GatewayEarningID" json:"gateway_earning,omitempty"`
}

// TableName specifies the table name
func (EventTicket) TableName() string {
	return "event_tickets"
}

// BeforeCreate hook
func (et *EventTicket) BeforeCreate(tx *gorm.DB) error {
	// Validate that either payment method is set
	if et.PaymentMethod == "" {
		return ErrInvalidPaymentMethod
	}
	return nil
}

// IsValid checks if the ticket is valid (not refunded, not cancelled)
func (et *EventTicket) IsValid() bool {
	return !et.IsRefunded && !et.IsCancelled
}

// IsFreeRSVP checks if this is a free RSVP (not a paid ticket)
func (et *EventTicket) IsFreeRSVP() bool {
	return et.PaymentMethod == "free_rsvp"
}

// CanCancel checks if this ticket/RSVP can be cancelled
// Free RSVPs can be cancelled up to 1 hour before event
// Paid tickets cannot be cancelled (refund via report system only)
func (et *EventTicket) CanCancel(eventStartTime time.Time) bool {
	if !et.IsFreeRSVP() {
		return false // Paid tickets cannot be cancelled
	}
	
	if et.IsCancelled || et.IsRefunded {
		return false // Already cancelled
	}
	
	// Check if more than 1 hour before event start
	oneHourBeforeStart := eventStartTime.Add(-1 * time.Hour)
	return time.Now().Before(oneHourBeforeStart)
}
