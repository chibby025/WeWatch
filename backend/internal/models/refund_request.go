// WeWatch/backend/internal/models/refund_request.go
package models

import (
	"time"
	"gorm.io/gorm"
	"database/sql/driver"
)

// RefundStatus enum
type RefundStatus string

const (
	RefundStatusPending  RefundStatus = "pending"
	RefundStatusApproved RefundStatus = "approved"
	RefundStatusDenied   RefundStatus = "denied"
)

// Scan implements the sql.Scanner interface
func (rs *RefundStatus) Scan(value interface{}) error {
	*rs = RefundStatus(value.(string))
	return nil
}

// Value implements the driver.Valuer interface
func (rs RefundStatus) Value() (driver.Value, error) {
	return string(rs), nil
}

// RefundRequest represents a refund request for a ticket
type RefundRequest struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	TicketID      uint           `gorm:"not null;uniqueIndex" json:"ticket_id"`
	Ticket        *SessionTicket `gorm:"foreignKey:TicketID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"ticket,omitempty"`
	SessionID     uint           `gorm:"not null;index" json:"session_id"`
	Session       *WatchSession  `gorm:"foreignKey:SessionID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"session,omitempty"`
	UserID        uint           `gorm:"not null;index" json:"user_id"`
	User          *User          `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"user,omitempty"`
	HostID        uint           `gorm:"not null;index" json:"host_id"`
	Host          *User          `gorm:"foreignKey:HostID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"host,omitempty"`
	Reason        string         `gorm:"type:text;not null" json:"reason"`
	Status        string         `gorm:"type:varchar(20);not null;default:'pending';index" json:"status"`
	DenialReason  *string        `gorm:"type:text" json:"denial_reason,omitempty"`
	ReviewedAt    *time.Time     `json:"reviewed_at,omitempty"`
	CreatedAt     time.Time      `gorm:"autoCreateTime;index" json:"created_at"`
	UpdatedAt     time.Time      `gorm:"autoUpdateTime" json:"updated_at"`
}

// IsPending checks if refund request is pending
func (r *RefundRequest) IsPending() bool {
	return r.Status == string(RefundStatusPending)
}

// Approve approves the refund request
func (r *RefundRequest) Approve() {
	r.Status = string(RefundStatusApproved)
	now := time.Now()
	r.ReviewedAt = &now
}

// Deny denies the refund request
func (r *RefundRequest) Deny(reason string) {
	r.Status = string(RefundStatusDenied)
	r.DenialReason = &reason
	now := time.Now()
	r.ReviewedAt = &now
}

// IsExpired checks if 24-hour refund window has passed
func (r *RefundRequest) IsExpired() bool {
	return time.Since(r.CreatedAt) > 24*time.Hour
}

// BeforeCreate hook to validate refund request
func (r *RefundRequest) BeforeCreate(tx *gorm.DB) error {
	if r.IsExpired() {
		return ErrRefundNotAllowed
	}
	return nil
}
