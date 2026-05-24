package models

import (
	"log"
	"time"

	"gorm.io/gorm"
	"wewatch-backend/internal/encrypt"
)

// PaymentAccount represents a host's linked bank account for withdrawals
// Supports both Paystack (Africa) and Stripe Connect (International)
type PaymentAccount struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"not null;index" json:"user_id"`
	Gateway   string    `gorm:"type:varchar(20);not null;index" json:"gateway"` // 'paystack' or 'stripe'
	
	// Paystack-specific fields (Nigerian, Ghanaian, South African, Kenyan banks)
	BankCode              *string `gorm:"type:varchar(10)" json:"bank_code,omitempty"`
	BankName              *string `gorm:"type:varchar(100)" json:"bank_name,omitempty"`
	AccountNumber         *string `gorm:"type:text" json:"account_number,omitempty"` // stored AES-256-GCM encrypted
	AccountNumberHash     *string `gorm:"type:varchar(64);index" json:"-"`            // HMAC-SHA256 for deduplication lookup
	AccountName           *string `gorm:"type:varchar(255)" json:"account_name,omitempty"`
	PaystackRecipientCode *string `gorm:"type:varchar(100);uniqueIndex" json:"paystack_recipient_code,omitempty"`
	
	// Stripe-specific fields (International bank accounts)
	StripeAccountID *string `gorm:"type:varchar(100);uniqueIndex" json:"stripe_account_id,omitempty"`
	StripeCountry   *string `gorm:"type:varchar(2)" json:"stripe_country,omitempty"`
	
	// Status fields
	IsPrimary        bool   `gorm:"default:false;index" json:"is_primary"`
	IsVerified       bool   `gorm:"default:false" json:"is_verified"`
	VerificationMethod *string `gorm:"type:varchar(50)" json:"verification_method,omitempty"`
	Currency         string `gorm:"type:varchar(3);not null" json:"currency"` // USD, NGN, GHS, KES, EUR, GBP
	
	// Timestamps
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	
	// Relationships
	User    User     `gorm:"foreignKey:UserID" json:"-"`
	Payouts []Payout `gorm:"foreignKey:PaymentAccountID" json:"-"`
}

// TableName specifies the table name for GORM
func (PaymentAccount) TableName() string {
	return "payment_accounts"
}

// BeforeSave encrypts AccountNumber and computes AccountNumberHash before any DB write.
// If ENCRYPTION_KEY is not configured the save is blocked — account numbers must not be stored plaintext.
func (pa *PaymentAccount) BeforeSave(tx *gorm.DB) error {
	if pa.AccountNumber == nil || *pa.AccountNumber == "" {
		return nil
	}

	// Skip if the value is already encrypted (base64 encoded length is much longer than a raw account number).
	// A plaintext Nigerian account number is 10 digits; an encrypted one is ~60+ base64 chars.
	if len(*pa.AccountNumber) > 20 {
		return nil // already encrypted
	}

	encrypted, err := encrypt.Field(*pa.AccountNumber)
	if err != nil {
		log.Printf("❌ Failed to encrypt account number: %v", err)
		return err
	}

	hash, err := encrypt.HMAC(*pa.AccountNumber)
	if err != nil {
		log.Printf("❌ Failed to hash account number: %v", err)
		return err
	}

	pa.AccountNumber = &encrypted
	pa.AccountNumberHash = &hash
	return nil
}

// AfterFind decrypts AccountNumber after loading from the DB.
// If decryption fails (e.g. key rotation or corrupt value), the field is set to empty string
// rather than surfacing raw ciphertext to callers.
func (pa *PaymentAccount) AfterFind(tx *gorm.DB) error {
	if pa.AccountNumber == nil || *pa.AccountNumber == "" {
		return nil
	}

	// Only attempt decryption if the value looks like base64 (longer than any plaintext account number).
	if len(*pa.AccountNumber) <= 20 {
		return nil // legacy plaintext row — leave as-is until re-encryption migration runs
	}

	decrypted, err := encrypt.Decrypt(*pa.AccountNumber)
	if err != nil {
		log.Printf("⚠️ Failed to decrypt account_number for PaymentAccount %d: %v", pa.ID, err)
		empty := ""
		pa.AccountNumber = &empty
		return nil
	}

	pa.AccountNumber = &decrypted
	return nil
}

// IsPaystack checks if this is a Paystack account
func (pa *PaymentAccount) IsPaystack() bool {
	return pa.Gateway == "paystack"
}

// IsStripe checks if this is a Stripe Connect account
func (pa *PaymentAccount) IsStripe() bool {
	return pa.Gateway == "stripe"
}

// IsValid checks if the account has all required fields for its gateway
func (pa *PaymentAccount) IsValid() bool {
	if pa.IsPaystack() {
		return pa.BankCode != nil && *pa.BankCode != "" &&
			pa.AccountNumber != nil && *pa.AccountNumber != "" &&
			pa.AccountName != nil && *pa.AccountName != "" &&
			pa.PaystackRecipientCode != nil && *pa.PaystackRecipientCode != ""
	}
	
	if pa.IsStripe() {
		return pa.StripeAccountID != nil && *pa.StripeAccountID != "" &&
			pa.StripeCountry != nil && *pa.StripeCountry != ""
	}
	
	return false
}

// GetDisplayName returns a user-friendly account identifier
func (pa *PaymentAccount) GetDisplayName() string {
	if pa.IsPaystack() {
		if pa.BankName != nil && pa.AccountNumber != nil {
			return *pa.BankName + " - " + maskAccountNumber(*pa.AccountNumber)
		}
	}
	
	if pa.IsStripe() {
		if pa.StripeCountry != nil {
			return "Stripe Account (" + *pa.StripeCountry + ")"
		}
	}
	
	return "Payment Account"
}

// maskAccountNumber masks the account number for display (e.g., 1234567890 -> ****7890)
func maskAccountNumber(accountNumber string) string {
	if len(accountNumber) <= 4 {
		return accountNumber
	}
	return "****" + accountNumber[len(accountNumber)-4:]
}

// MarkAsUsed updates the last_used_at timestamp
func (pa *PaymentAccount) MarkAsUsed() {
	now := time.Now()
	pa.LastUsedAt = &now
}

// PaymentAccountRequest represents a request to add a new payment account
type PaymentAccountRequest struct {
	Gateway string `json:"gateway" binding:"required,oneof=paystack stripe"`
	
	// Paystack fields
	BankCode      *string `json:"bank_code,omitempty"`
	AccountNumber *string `json:"account_number,omitempty"`
	
	// Stripe fields (for connecting existing Stripe account)
	StripeAccountID *string `json:"stripe_account_id,omitempty"`
	
	Currency string `json:"currency" binding:"required,oneof=USD NGN GHS KES EUR GBP"`
	IsPrimary bool  `json:"is_primary"`
}

// PaymentAccountResponse represents a sanitized payment account for API responses
type PaymentAccountResponse struct {
	ID             uint       `json:"id"`
	Gateway        string     `json:"gateway"`
	DisplayName    string     `json:"display_name"`
	Currency       string     `json:"currency"`
	IsPrimary      bool       `json:"is_primary"`
	IsVerified     bool       `json:"is_verified"`
	LastUsedAt     *time.Time `json:"last_used_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	
	// Only include masked account details
	MaskedAccountNumber *string `json:"masked_account_number,omitempty"`
	AccountName         *string `json:"account_name,omitempty"`  // Account holder's name (Paystack)
	BankName            *string `json:"bank_name,omitempty"`
	StripeCountry       *string `json:"stripe_country,omitempty"`
}

// ToResponse converts a PaymentAccount to a response object (sanitized for API)
func (pa *PaymentAccount) ToResponse() PaymentAccountResponse {
	resp := PaymentAccountResponse{
		ID:             pa.ID,
		Gateway:        pa.Gateway,
		DisplayName:    pa.GetDisplayName(),
		Currency:       pa.Currency,
		IsPrimary:      pa.IsPrimary,
		IsVerified:     pa.IsVerified,
		LastUsedAt:     pa.LastUsedAt,
		CreatedAt:      pa.CreatedAt,
		BankName:       pa.BankName,
		AccountName:    pa.AccountName,  // Include account holder's name
		StripeCountry:  pa.StripeCountry,
	}
	
	// Add masked account number for Paystack
	if pa.IsPaystack() && pa.AccountNumber != nil {
		masked := maskAccountNumber(*pa.AccountNumber)
		resp.MaskedAccountNumber = &masked
	}
	
	return resp
}

// MinimumWithdrawalAmount returns the minimum withdrawal amount for the account's currency
// Based on Paystack/Stripe gateway minimums (cannot go lower than this)
func (pa *PaymentAccount) MinimumWithdrawalAmount() float64 {
	switch pa.Currency {
	case "USD":
		return 1.00    // Stripe minimum: $1
	case "NGN":
		return 50.00   // Paystack minimum: ₦50
	case "GHS":
		return 10.00   // Paystack minimum: GHS 10
	case "KES":
		return 1.00    // Paystack minimum: KES 1
	case "EUR":
		return 1.00    // Stripe minimum: €1
	case "GBP":
		return 1.00    // Stripe minimum: £1
	default:
		return 1.00    // Default: 1 unit of any currency
	}
}

// GetWithdrawalFee returns the gateway's transfer fee for the currency
func (pa *PaymentAccount) GetWithdrawalFee() float64 {
	if pa.IsPaystack() {
		switch pa.Currency {
		case "NGN":
			return 10.00 // ₦10 flat fee for Nigerian transfers
		case "GHS":
			return 1.00 // GHS 1 flat fee for Ghanaian transfers
		case "KES":
			return 25.00 // KES 25 flat fee for Kenyan transfers
		default:
			return 0.00
		}
	}
	
	if pa.IsStripe() {
		// Stripe charges percentage-based fees for transfers
		// Platform absorbs these fees (as per user requirement)
		return 0.00
	}
	
	return 0.00
}
