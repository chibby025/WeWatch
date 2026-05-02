// backend/internal/models/ad_campaign.go
package models

import (
	"time"
)

// AdCampaign represents a running ad campaign
type AdCampaign struct {
	ID                uint      `gorm:"primaryKey" json:"id"`
	InquiryID         *uint     `json:"inquiry_id,omitempty"`                         // Link to original inquiry
	Inquiry           *AdInquiry `gorm:"foreignKey:InquiryID" json:"inquiry,omitempty"`
	AdvertiserID      uint      `json:"advertiser_id"`                                // User who created the campaign
	Advertiser        User      `gorm:"foreignKey:AdvertiserID" json:"advertiser"`
	CampaignName      string    `gorm:"size:255;not null" json:"campaign_name"`
	Budget            float64   `gorm:"type:decimal(10,2);not null" json:"budget"`    // Total budget in USD
	SpentAmount       float64   `gorm:"type:decimal(10,2);default:0" json:"spent_amount"`
	Status            string    `gorm:"size:50;default:'draft'" json:"status"`        // 'draft', 'pending_review', 'active', 'paused', 'completed', 'rejected'
	StartDate         time.Time `json:"start_date"`
	EndDate           time.Time `json:"end_date"`
	TargetAgeMin      int       `gorm:"default:13" json:"target_age_min"`
	TargetAgeMax      int       `gorm:"default:99" json:"target_age_max"`
	TargetContentRating string  `gorm:"size:50" json:"target_content_rating,omitempty"` // 'G', 'PG', '13+', '16+', '18+', 'Mature'
	AdType            string    `gorm:"size:50;not null" json:"ad_type"`              // 'banner', 'video_preroll', 'sponsored_room'
	MediaURL          string    `gorm:"size:500" json:"media_url,omitempty"`          // URL to ad creative
	ThumbnailURL      string    `gorm:"size:500" json:"thumbnail_url,omitempty"`
	ClickURL          string    `gorm:"size:500" json:"click_url,omitempty"`          // Where ad clicks go
	AdDuration        int       `gorm:"default:0" json:"ad_duration"`                 // Duration in seconds for video ads
	
	// Metrics
	Impressions       int64     `gorm:"default:0" json:"impressions"`
	Clicks            int64     `gorm:"default:0" json:"clicks"`
	CTR               float64   `gorm:"type:decimal(5,2);default:0" json:"ctr"`       // Click-through rate
	CPM               float64   `gorm:"type:decimal(10,2);default:0" json:"cpm"`      // Cost per 1000 impressions
	
	ApprovedByID      *uint     `json:"approved_by_id,omitempty"`
	ApprovedBy        *User     `gorm:"foreignKey:ApprovedByID" json:"approved_by,omitempty"`
	ApprovedAt        *time.Time `json:"approved_at,omitempty"`
	RejectionReason   string    `gorm:"type:text" json:"rejection_reason,omitempty"`
	
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// TableName overrides the default table name
func (AdCampaign) TableName() string {
	return "ad_campaigns"
}

// AdImpression represents an ad impression event
type AdImpression struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	CampaignID  uint      `gorm:"not null" json:"campaign_id"`
	Campaign    AdCampaign `gorm:"foreignKey:CampaignID" json:"-"`
	UserID      *uint     `json:"user_id,omitempty"`                    // Null for guest views
	RoomID      *uint     `json:"room_id,omitempty"`                    // Where ad was shown
	SessionID   string    `gorm:"size:255" json:"session_id,omitempty"` // Watch session UUID
	IPAddress   string    `gorm:"size:50" json:"ip_address"`
	UserAgent   string    `gorm:"size:500" json:"user_agent,omitempty"`
	Clicked     bool      `gorm:"default:false" json:"clicked"`
	ViewDuration int      `gorm:"default:0" json:"view_duration"`       // How long user watched (for video ads)
	CreatedAt   time.Time `json:"created_at"`
}

// TableName overrides the default table name
func (AdImpression) TableName() string {
	return "ad_impressions"
}

// AdPayment represents a payment for an ad campaign
type AdPayment struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	CampaignID    uint      `gorm:"not null" json:"campaign_id"`
	Campaign      AdCampaign `gorm:"foreignKey:CampaignID" json:"campaign"`
	Amount        float64   `gorm:"type:decimal(10,2);not null" json:"amount"`
	Currency      string    `gorm:"size:10;default:'USD'" json:"currency"`
	PaymentMethod string    `gorm:"size:50;not null" json:"payment_method"` // 'stripe', 'paypal', 'bank_transfer'
	PaymentStatus string    `gorm:"size:50;default:'pending'" json:"payment_status"` // 'pending', 'completed', 'failed', 'refunded'
	StripePaymentIntentID string `gorm:"size:255" json:"stripe_payment_intent_id,omitempty"`
	TransactionID string    `gorm:"size:255" json:"transaction_id,omitempty"`
	PaidAt        *time.Time `json:"paid_at,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// TableName overrides the default table name
func (AdPayment) TableName() string {
	return "ad_payments"
}
