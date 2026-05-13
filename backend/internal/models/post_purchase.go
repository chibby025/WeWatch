// backend/internal/models/post_purchase.go
package models

import "time"

// PostPurchase records a user's one-time purchase of a paid post/recording.
// One row per (post, user) — enforced at the DB level by a unique constraint.
// Purchase grants permanent download right (see post_download_handler.go).
type PostPurchase struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	PostID         uint      `gorm:"not null;index;uniqueIndex:idx_post_purchases_unique_buyer" json:"post_id"`
	UserID         uint      `gorm:"not null;index;uniqueIndex:idx_post_purchases_unique_buyer" json:"user_id"`
	AmountTokens   int       `gorm:"not null" json:"amount_tokens"` // Full price in token cents (100 = 1 token)
	PaymentMethod  string    `gorm:"type:varchar(20);default:'tokens';not null" json:"payment_method"`
	TransactionRef string    `gorm:"type:varchar(100);uniqueIndex" json:"transaction_ref"`
	Status         string    `gorm:"type:varchar(20);default:'completed';not null;index" json:"status"`
	PurchasedAt    time.Time `gorm:"autoCreateTime" json:"purchased_at"`

	Post *Post `gorm:"foreignKey:PostID" json:"post,omitempty"`
	User *User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (PostPurchase) TableName() string {
	return "post_purchases"
}
