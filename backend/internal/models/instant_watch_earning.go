// WeWatch/backend/internal/models/instant_watch_earning.go
package models

import (
	"time"
	"gorm.io/gorm"
)

// InstantWatchEarning persists earnings data after instant watch room deletion
type InstantWatchEarning struct {
	ID                   uint          `gorm:"primaryKey" json:"id"`
	SessionID            uint          `gorm:"not null;uniqueIndex" json:"session_id"`
	Session              *WatchSession `gorm:"foreignKey:SessionID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"session,omitempty"`
	HostID               uint          `gorm:"not null;index" json:"host_id"`
	Host                 *User         `gorm:"foreignKey:HostID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"host,omitempty"`
	TokenEarnings        int           `gorm:"not null;default:0" json:"token_earnings"`
	GatewayEarningsUSD   float64       `gorm:"type:decimal(10,2);default:0" json:"gateway_earnings_usd"`
	GatewayEarningsNGN   float64       `gorm:"type:decimal(10,2);default:0" json:"gateway_earnings_ngn"`
	GatewayEarningsGHS   float64       `gorm:"type:decimal(10,2);default:0" json:"gateway_earnings_ghs"`
	GatewayEarningsKES   float64       `gorm:"type:decimal(10,2);default:0" json:"gateway_earnings_kes"`
	TotalTicketsSold     int           `gorm:"default:0" json:"total_tickets_sold"`
	TotalDonations       int           `gorm:"default:0" json:"total_donations"`
	TotalAttendees       int           `gorm:"default:0" json:"total_attendees"`
	CreatedAt            time.Time     `gorm:"autoCreateTime;index" json:"created_at"`
	UpdatedAt            time.Time     `gorm:"autoUpdateTime" json:"updated_at"`
}

// GetTotalEarningsUSD returns total earnings converted to USD (tokens + gateway)
func (e *InstantWatchEarning) GetTotalEarningsUSD() float64 {
	tokenUSD := float64(e.TokenEarnings) * 0.10
	return tokenUSD + e.GatewayEarningsUSD + e.GatewayEarningsNGN + e.GatewayEarningsGHS + e.GatewayEarningsKES
}

// GetGatewayEarningsByCurrency returns gateway earnings for a specific currency
func (e *InstantWatchEarning) GetGatewayEarningsByCurrency(currency Currency) float64 {
	switch currency {
	case CurrencyUSD:
		return e.GatewayEarningsUSD
	case CurrencyNGN:
		return e.GatewayEarningsNGN
	case CurrencyGHS:
		return e.GatewayEarningsGHS
	case CurrencyKES:
		return e.GatewayEarningsKES
	default:
		return 0
	}
}

// BeforeCreate hook
func (e *InstantWatchEarning) BeforeCreate(tx *gorm.DB) error {
	return nil
}
