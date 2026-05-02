// backend/internal/models/password_reset_token.go
package models

import (
	"time"
)

// PasswordResetToken represents a temporary token for password reset
type PasswordResetToken struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"not null;index" json:"user_id"`
	Token     string    `gorm:"type:varchar(64);not null;uniqueIndex" json:"token"`
	ExpiresAt time.Time `gorm:"not null;index" json:"expires_at"`
	Used      bool      `gorm:"default:false" json:"used"`
	CreatedAt time.Time `gorm:"default:CURRENT_TIMESTAMP" json:"created_at"`
	
	// Relations
	User User `gorm:"foreignKey:UserID" json:"-"`
}

// TableName specifies the table name for GORM
func (PasswordResetToken) TableName() string {
	return "password_reset_tokens"
}

// IsExpired checks if the token has expired
func (t *PasswordResetToken) IsExpired() bool {
	return time.Now().After(t.ExpiresAt)
}

// IsValid checks if token is valid (not used and not expired)
func (t *PasswordResetToken) IsValid() bool {
	return !t.Used && !t.IsExpired()
}
