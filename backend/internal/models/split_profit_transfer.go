// backend/internal/models/split_profit_transfer.go
package models

import "time"

// SplitProfitTransfer records each sweep of accumulated 25% platform profit
// from post sales into the super admin's wallet. TransferSplitProfit subtracts
// the running SUM(amount_tokens) from the lifetime entitlement to compute how
// much is still owed, so this row must be written inside the same transaction
// that credits the wallet.
type SplitProfitTransfer struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	AdminID       uint      `gorm:"not null;index" json:"admin_id"`
	AmountTokens  int64     `gorm:"not null" json:"amount_tokens"`
	Status        string    `gorm:"type:varchar(20);default:'completed';not null;index" json:"status"`
	TransferredAt time.Time `gorm:"autoCreateTime" json:"transferred_at"`

	Admin *User `gorm:"foreignKey:AdminID" json:"admin,omitempty"`
}

func (SplitProfitTransfer) TableName() string {
	return "split_profit_transfers"
}
