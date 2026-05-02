// backend/internal/models/admin_audit_log.go
package models

import (
	"time"
)

// AdminAuditLog tracks all administrative actions for security and compliance
type AdminAuditLog struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	AdminID     uint      `json:"admin_id" gorm:"not null;index"` // Who performed the action
	Action      string    `json:"action" gorm:"not null;index"`   // What action was performed (e.g., "approve_kyc", "reject_payout", "ban_user")
	TargetType  string    `json:"target_type"`                    // Type of entity affected (e.g., "user", "kyc", "payout", "session")
	TargetID    uint      `json:"target_id" gorm:"index"`         // ID of the affected entity
	Details     string    `json:"details" gorm:"type:text"`       // JSON or text description of the action
	IPAddress   string    `json:"ip_address"`                     // IP address of the admin
	UserAgent   string    `json:"user_agent"`                     // Browser/client info
	Success     bool      `json:"success" gorm:"default:true"`    // Whether the action succeeded
	ErrorMsg    string    `json:"error_msg"`                      // Error message if action failed
	CreatedAt   time.Time `json:"created_at" gorm:"index"`
	
	// Relationships
	Admin User `json:"admin" gorm:"foreignKey:AdminID"`
}

func (AdminAuditLog) TableName() string {
	return "admin_audit_logs"
}
