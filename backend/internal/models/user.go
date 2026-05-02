package models

import (
	"time"
	"gorm.io/gorm"
)

// User represents a user in the Wewatch application
// gorm.Model provides ID, CreatedAt, UpdatedAt, DeletedAt fields automatically
type User struct {
	gorm.Model // Embeds ID, CreatedAt, UpdatedAt, DeletedAT
	Username   string  `gorm:"type:varchar(50);uniqueIndex;not null" json:"username"`
	Email	   string  `gorm:"type:varchar(100);uniqueIndex;not null" json:"email"`
	// Passwordhash to store hashed password not plain text!
	PasswordHash string `gorm:"type:varchar(255)" json:"-"` // Nullable for OAuth users
	AvatarURL string `gorm:"default:'/avatars/default.png'" json:"avatar_url"`
	Bio       string `gorm:"type:text" json:"bio"` // User bio/description
	Role      string `gorm:"type:varchar(20);default:'user'" json:"role"` // 'user', 'admin', 'super_admin'
	
	// OAuth authentication fields
	OAuthProvider   *string `gorm:"type:varchar(20)" json:"oauth_provider,omitempty"` // 'google', 'facebook', 'apple'
	OAuthProviderID *string `gorm:"type:varchar(255)" json:"-"` // Provider's unique user ID (private)
	EmailVerified   bool    `gorm:"default:false" json:"email_verified"` // OAuth users auto-verified
	
	// Age verification & content moderation (NEVER expose in JSON)
	DateOfBirth *time.Time `gorm:"type:date" json:"-"` // Private: For age calculation and content filtering
	
	// Payment-related fields (Phase 3)
	Country          *string `gorm:"type:varchar(2)" json:"country,omitempty"`           // ISO country code (US, NG, GH, etc.)
	PreferredGateway *string `gorm:"type:varchar(20)" json:"preferred_gateway,omitempty"` // 'paystack' or 'stripe'
	
	// 2FA fields (Security enhancement - P0)
	TwoFactorSecret  *string `gorm:"type:varchar(255)" json:"-"` // TOTP secret (never expose in JSON)
	TwoFactorEnabled bool    `gorm:"default:false" json:"two_factor_enabled"` // Is 2FA active
	BackupCodes      *string `gorm:"type:text" json:"-"` // Encrypted backup codes (never expose)
	LastLoginIP      *string `gorm:"type:varchar(45)" json:"-"` // Track IP changes (security)
}

// User role constants
const (
	RoleUser       = "user"
	RoleAdmin      = "admin"
	RoleSuperAdmin = "super_admin"
)

// IsSuperAdmin checks if user is a super admin
func (u *User) IsSuperAdmin() bool {
	return u.Role == RoleSuperAdmin
}

// IsAdmin checks if user is an admin or super admin
func (u *User) IsAdmin() bool {
	return u.Role == RoleAdmin || u.Role == RoleSuperAdmin
}

// GetAge calculates the user's current age from their date of birth
// Returns 0 if DateOfBirth is nil (unknown age)
func (u *User) GetAge() int {
	if u.DateOfBirth == nil {
		return 0 // Unknown age
	}
	
	now := time.Now()
	age := now.Year() - u.DateOfBirth.Year()
	
	// Adjust if birthday hasn't occurred yet this year
	if now.Month() < u.DateOfBirth.Month() || 
	   (now.Month() == u.DateOfBirth.Month() && now.Day() < u.DateOfBirth.Day()) {
		age--
	}
	
	return age
}

// CanViewContent checks if user can view content based on their age and content rating
// Returns true if user meets minimum age requirement for the content rating
func (u *User) CanViewContent(contentRating string) bool {
	age := u.GetAge()
	
	// Unknown age = restricted to G and PG only
	if age == 0 {
		return contentRating == "G" || contentRating == "PG"
	}
	
	// Check age requirements for each rating
	switch contentRating {
	case "G", "PG":
		return true // All ages
	case "13+":
		return age >= 13
	case "16+":
		return age >= 16
	case "18+", "Mature":
		return age >= 18
	default:
		return true // Unknown rating = allow
	}
}

// HasDateOfBirth checks if user has provided their date of birth
func (u *User) HasDateOfBirth() bool {
	return u.DateOfBirth != nil
}

