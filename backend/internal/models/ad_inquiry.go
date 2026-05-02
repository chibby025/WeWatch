// backend/internal/models/ad_inquiry.go
package models

import (
	"time"
)

// AdInquiry represents an advertising inquiry from potential advertisers
type AdInquiry struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	CompanyName     string    `gorm:"size:255;not null" json:"company_name"`
	ContactName     string    `gorm:"size:255;not null" json:"contact_name"`
	Email           string    `gorm:"size:255;not null" json:"email"`
	Phone           string    `gorm:"size:50" json:"phone,omitempty"`
	Budget          string    `gorm:"size:50;not null" json:"budget"` // 'under_500', '500_1k', '1k_5k', '5k_10k', 'over_10k'
	CampaignGoals   string    `gorm:"type:text;not null" json:"campaign_goals"`
	TargetAudience  string    `gorm:"type:text" json:"target_audience,omitempty"`
	Message         string    `gorm:"type:text" json:"message,omitempty"`
	Status          string    `gorm:"size:50;default:'pending'" json:"status"` // 'pending', 'approved', 'rejected', 'contacted'
	AdminNotes      string    `gorm:"type:text" json:"admin_notes,omitempty"`
	ReviewedByID    *uint     `json:"reviewed_by_id,omitempty"`
	ReviewedBy      *User     `gorm:"foreignKey:ReviewedByID" json:"reviewed_by,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// TableName overrides the default table name
func (AdInquiry) TableName() string {
	return "ad_inquiries"
}
