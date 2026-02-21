package models

import (
	"gorm.io/gorm"
	//"time"
)

// User represents a user in the Wewatch application
// gorm.Model provides ID, CreatedAt, UpdatedAt, DeletedAt fields automatically
type User struct {
	gorm.Model // Embeds ID, CreatedAt, UpdatedAt, DeletedAT
	Username   string  `gorm:"type:varchar(50);uniqueIndex;not null" json:"username"`
	Email	   string  `gorm:"type:varchar(100);uniqueIndex;not null" json:"email"`
	// Passwordhash to store hashed password not plain text!
	PasswordHash string `gorm:"type:varchar(255);not null" json:"-"`
	AvatarURL string `gorm:"default:'/avatars/default.png'" json:"avatar_url"`
	Bio       string `gorm:"type:text" json:"bio"` // User bio/description
	Role      string `gorm:"type:varchar(20);default:'user'" json:"role"` // 'user', 'admin', 'super_admin'
	
	// Payment-related fields (Phase 3)
	Country          *string `gorm:"type:varchar(2)" json:"country,omitempty"`           // ISO country code (US, NG, GH, etc.)
	PreferredGateway *string `gorm:"type:varchar(20)" json:"preferred_gateway,omitempty"` // 'paystack' or 'stripe'
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

