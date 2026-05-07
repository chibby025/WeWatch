// WeWatch/backend/internal/models/kyc_verification.go
package models

import (
	"time"
	"gorm.io/gorm"
	"database/sql/driver"
)

// IDType enum for KYC identification types
type IDType string

const (
	IDTypeNationalID      IDType = "national_id"
	IDTypePassport        IDType = "passport"
	IDTypeDriversLicense  IDType = "drivers_license"
	IDTypeVotersCard      IDType = "voters_card"
)

// Scan implements the sql.Scanner interface
func (it *IDType) Scan(value interface{}) error {
	*it = IDType(value.(string))
	return nil
}

// Value implements the driver.Valuer interface
func (it IDType) Value() (driver.Value, error) {
	return string(it), nil
}

// KYCStatus enum
type KYCStatus string

const (
	KYCStatusPending  KYCStatus = "pending"
	KYCStatusApproved KYCStatus = "approved"
	KYCStatusRejected KYCStatus = "rejected"
	KYCStatusExpired  KYCStatus = "expired"
)

// Scan implements the sql.Scanner interface
func (ks *KYCStatus) Scan(value interface{}) error {
	*ks = KYCStatus(value.(string))
	return nil
}

// Value implements the driver.Valuer interface
func (ks KYCStatus) Value() (driver.Value, error) {
	return string(ks), nil
}

// KYCVerification represents a KYC verification record
type KYCVerification struct {
	ID                   uint                   `gorm:"primaryKey" json:"id"`
	UserID               uint                   `gorm:"not null;uniqueIndex" json:"user_id"`
	User                 *User                  `gorm:"foreignKey:UserID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"user,omitempty"`
	FullName             string                 `gorm:"type:varchar(255);not null" json:"full_name"` // User's legal name (must match ID)
	IDType               string                 `gorm:"type:varchar(20);not null" json:"id_type"`
	IDNumber             string                 `gorm:"type:varchar(100);not null" json:"id_number"`
	IDDocumentURL        string                 `gorm:"type:varchar(500);not null" json:"id_document_url"`
	SelfieURL            string                 `gorm:"type:varchar(500);not null" json:"selfie_url"`
	BankDetails          map[string]interface{} `gorm:"type:jsonb" json:"bank_details"`
	Status               string                 `gorm:"type:varchar(20);not null;default:'pending';index" json:"status"`
	RejectionReason      *string                `gorm:"type:text" json:"rejection_reason,omitempty"`
	VerifiedByUserID     *uint                  `gorm:"index" json:"verified_by_user_id,omitempty"`
	VerifiedBy           *User                  `gorm:"foreignKey:VerifiedByUserID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;" json:"verified_by,omitempty"`
	VerifiedAt           *time.Time             `json:"verified_at,omitempty"`
	ExpiresAt            *time.Time             `gorm:"index" json:"expires_at,omitempty"`
	CreatedAt            time.Time              `gorm:"autoCreateTime;index" json:"created_at"`
	UpdatedAt            time.Time              `gorm:"autoUpdateTime" json:"updated_at"`
}

// IsApproved checks if KYC is approved and not expired
func (k *KYCVerification) IsApproved() bool {
	return k.Status == string(KYCStatusApproved) && (k.ExpiresAt == nil || time.Now().Before(*k.ExpiresAt))
}

// Approve approves the KYC verification
func (k *KYCVerification) Approve(verifiedBy uint) {
	k.Status = string(KYCStatusApproved)
	k.VerifiedByUserID = &verifiedBy
	now := time.Now()
	k.VerifiedAt = &now
	// KYC expires in 2 years
	expiresAt := now.AddDate(2, 0, 0)
	k.ExpiresAt = &expiresAt
}

// Reject rejects the KYC verification
func (k *KYCVerification) Reject(reason string, rejectedBy uint) {
	k.Status = string(KYCStatusRejected)
	k.RejectionReason = &reason
	k.VerifiedByUserID = &rejectedBy
	now := time.Now()
	k.VerifiedAt = &now
}

// CheckExpiration updates status to expired if past expiration date
func (k *KYCVerification) CheckExpiration() {
	if k.Status == string(KYCStatusApproved) && k.ExpiresAt != nil && time.Now().After(*k.ExpiresAt) {
		k.Status = string(KYCStatusExpired)
	}
}

// BeforeCreate hook
func (k *KYCVerification) BeforeCreate(tx *gorm.DB) error {
	return nil
}
