package handlers

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// GetPlatformAnalytics returns comprehensive platform metrics for super admins
// GET /api/admin/analytics
func GetPlatformAnalytics(c *gin.Context) {
	db := c.MustGet("db").(*gorm.DB)

	// Time ranges
	now := time.Now()
	startOfToday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	startOfWeek := now.AddDate(0, 0, -7)
	startOfMonth := now.AddDate(0, -1, 0)
	startOfQuarter := now.AddDate(0, -3, 0)
	startOfYear := now.AddDate(-1, 0, 0)

	// ==== USER METRICS ====
	var totalUsers int64
	var newUsersToday int64
	var newUsersWeek int64
	var newUsersMonth int64
	
	db.Model(&struct{ ID uint }{}).Table("users").Where("deleted_at IS NULL").Count(&totalUsers)
	db.Model(&struct{ ID uint }{}).Table("users").Where("created_at >= ? AND deleted_at IS NULL", startOfToday).Count(&newUsersToday)
	db.Model(&struct{ ID uint }{}).Table("users").Where("created_at >= ? AND deleted_at IS NULL", startOfWeek).Count(&newUsersWeek)
	db.Model(&struct{ ID uint }{}).Table("users").Where("created_at >= ? AND deleted_at IS NULL", startOfMonth).Count(&newUsersMonth)

	// ==== ROOM METRICS ====
	var totalRooms int64
	var publicRooms int64
	var privateRooms int64
	var roomsCreatedWeek int64
	var roomsCreatedMonth int64
	
	db.Model(&struct{ ID uint }{}).Table("rooms").Where("deleted_at IS NULL").Count(&totalRooms)
	db.Model(&struct{ ID uint }{}).Table("rooms").Where("is_public = ? AND deleted_at IS NULL", true).Count(&publicRooms)
	db.Model(&struct{ ID uint }{}).Table("rooms").Where("is_public = ? AND deleted_at IS NULL", false).Count(&privateRooms)
	db.Model(&struct{ ID uint }{}).Table("rooms").Where("created_at >= ? AND deleted_at IS NULL", startOfWeek).Count(&roomsCreatedWeek)
	db.Model(&struct{ ID uint }{}).Table("rooms").Where("created_at >= ? AND deleted_at IS NULL", startOfMonth).Count(&roomsCreatedMonth)

	// ==== WATCH SESSION METRICS ====
	var totalSessions int64
	var activeSessions int64
	var sessionsToday int64
	var sessionsWeek int64
	var sessionsMonth int64
	var sessionsQuarter int64
	var sessionsYear int64
	
	db.Model(&struct{ ID uint }{}).Table("watch_sessions").Count(&totalSessions)
	db.Model(&struct{ ID uint }{}).Table("watch_sessions").Where("ended_at IS NULL").Count(&activeSessions)
	db.Model(&struct{ ID uint }{}).Table("watch_sessions").Where("started_at >= ?", startOfToday).Count(&sessionsToday)
	db.Model(&struct{ ID uint }{}).Table("watch_sessions").Where("started_at >= ?", startOfWeek).Count(&sessionsWeek)
	db.Model(&struct{ ID uint }{}).Table("watch_sessions").Where("started_at >= ?", startOfMonth).Count(&sessionsMonth)
	db.Model(&struct{ ID uint }{}).Table("watch_sessions").Where("started_at >= ?", startOfQuarter).Count(&sessionsQuarter)
	db.Model(&struct{ ID uint }{}).Table("watch_sessions").Where("started_at >= ?", startOfYear).Count(&sessionsYear)


	// ==== NEW REVENUE METRICS (NET-BASED, CORRECT SOURCES) ====
	type NetRevenueResult struct {
		GMV                float64 // Net GMV (all net ticket sales + net token purchases)
		PlatformRevenue    float64 // Platform's 15% of net ticket sales + all net token purchases
		Reserve            float64 // Host 85% of net ticket sales
		TokenMinted        float64 // All tokens minted (purchased)
		TokenSpent         float64 // All tokens spent (tickets, donations)
		DonatedTicketCount int64   // Number of tickets donated
		TicketCount        int64   // Number of tickets sold (not refunded)
	}

	var netRevenueAll NetRevenueResult
	var netRevenueToday NetRevenueResult
	var netRevenueWeek NetRevenueResult
	var netRevenueMonth NetRevenueResult
	var netRevenueQuarter NetRevenueResult
	var netRevenueYear NetRevenueResult

	// All time net revenue - from platform_accounting lifetime fields
	db.Raw(`
		SELECT 
			 COALESCE(lifetime_total_revenue, 0) AS gmv,
			 COALESCE(lifetime_platform_profit, 0) AS platform_revenue,
			 COALESCE(lifetime_host_earnings, 0) AS reserve,
			 0 AS token_minted,
			 0 AS token_spent,
			 0 AS donated_ticket_count,
			 0 AS ticket_count
		FROM platform_accounting
		WHERE id = 1
	`).Scan(&netRevenueAll)

	// Today net revenue - calculate from token_transactions
	db.Raw(`
		SELECT 
			 COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN COALESCE(usd_value, 0) * 165 ELSE 0 END), 0) AS gmv,
			 COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN COALESCE(usd_value, 0) * 165 * 0.25 ELSE 0 END), 0) AS platform_revenue,
			 COALESCE(SUM(CASE WHEN transaction_type IN ('ticket_purchase', 'donation') THEN amount * 0.01 * 165 * 0.75 ELSE 0 END), 0) AS reserve,
			 COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN amount ELSE 0 END), 0) AS token_minted,
			 COALESCE(SUM(CASE WHEN transaction_type IN ('ticket_purchase', 'donation') THEN amount ELSE 0 END), 0) AS token_spent,
			 0 AS donated_ticket_count,
			 0 AS ticket_count
		FROM token_transactions
		WHERE DATE(created_at) = CURRENT_DATE AND status = 'completed'
	`).Scan(&netRevenueToday)

	// Week net revenue
	db.Raw(`
		SELECT 
			 COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN COALESCE(usd_value, 0) * 165 ELSE 0 END), 0) AS gmv,
			 COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN COALESCE(usd_value, 0) * 165 * 0.25 ELSE 0 END), 0) AS platform_revenue,
			 COALESCE(SUM(CASE WHEN transaction_type IN ('ticket_purchase', 'donation') THEN amount * 0.01 * 165 * 0.75 ELSE 0 END), 0) AS reserve,
			 COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN amount ELSE 0 END), 0) AS token_minted,
			 COALESCE(SUM(CASE WHEN transaction_type IN ('ticket_purchase', 'donation') THEN amount ELSE 0 END), 0) AS token_spent,
			 0 AS donated_ticket_count,
			 0 AS ticket_count
		FROM token_transactions
		WHERE created_at >= ? AND status = 'completed'
	`, startOfWeek).Scan(&netRevenueWeek)

	// Month net revenue
	db.Raw(`
		SELECT 
			 COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN COALESCE(usd_value, 0) * 165 ELSE 0 END), 0) AS gmv,
			 COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN COALESCE(usd_value, 0) * 165 * 0.25 ELSE 0 END), 0) AS platform_revenue,
			 COALESCE(SUM(CASE WHEN transaction_type IN ('ticket_purchase', 'donation') THEN amount * 0.01 * 165 * 0.75 ELSE 0 END), 0) AS reserve,
			 COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN amount ELSE 0 END), 0) AS token_minted,
			 COALESCE(SUM(CASE WHEN transaction_type IN ('ticket_purchase', 'donation') THEN amount ELSE 0 END), 0) AS token_spent,
			 0 AS donated_ticket_count,
			 0 AS ticket_count
		FROM token_transactions
		WHERE created_at >= ? AND status = 'completed'
	`, startOfMonth).Scan(&netRevenueMonth)

	// Quarter net revenue
	db.Raw(`
		SELECT 
			 COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN COALESCE(usd_value, 0) * 165 ELSE 0 END), 0) AS gmv,
			 COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN COALESCE(usd_value, 0) * 165 * 0.25 ELSE 0 END), 0) AS platform_revenue,
			 COALESCE(SUM(CASE WHEN transaction_type IN ('ticket_purchase', 'donation') THEN amount * 0.01 * 165 * 0.75 ELSE 0 END), 0) AS reserve,
			 COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN amount ELSE 0 END), 0) AS token_minted,
			 COALESCE(SUM(CASE WHEN transaction_type IN ('ticket_purchase', 'donation') THEN amount ELSE 0 END), 0) AS token_spent,
			 0 AS donated_ticket_count,
			 0 AS ticket_count
		FROM token_transactions
		WHERE created_at >= ? AND status = 'completed'
	`, startOfQuarter).Scan(&netRevenueQuarter)

	// Year net revenue
	db.Raw(`
		SELECT 
			 COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN COALESCE(usd_value, 0) * 165 ELSE 0 END), 0) AS gmv,
			 COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN COALESCE(usd_value, 0) * 165 * 0.25 ELSE 0 END), 0) AS platform_revenue,
			 COALESCE(SUM(CASE WHEN transaction_type IN ('ticket_purchase', 'donation') THEN amount * 0.01 * 165 * 0.75 ELSE 0 END), 0) AS reserve,
			 COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN amount ELSE 0 END), 0) AS token_minted,
			 COALESCE(SUM(CASE WHEN transaction_type IN ('ticket_purchase', 'donation') THEN amount ELSE 0 END), 0) AS token_spent,
			 0 AS donated_ticket_count,
			 0 AS ticket_count
		FROM token_transactions
		WHERE created_at >= ? AND status = 'completed'
	`, startOfYear).Scan(&netRevenueYear)

	// ==== DONATION METRICS ====
	type DonationResult struct {
		TotalDonations float64
		DonationCount  int64
	}
	
	var donationsAll DonationResult
	var donationsWeek DonationResult
	var donationsMonth DonationResult
	
	db.Raw(`
		SELECT 
			COALESCE(SUM(amount_tokens), 0) AS total_donations,
			COUNT(*) AS donation_count
		FROM donations
	`).Scan(&donationsAll)
	
	db.Raw(`
		SELECT 
			COALESCE(SUM(amount_tokens), 0) AS total_donations,
			COUNT(*) AS donation_count
		FROM donations 
		WHERE created_at >= ?
	`, startOfWeek).Scan(&donationsWeek)
	
	db.Raw(`
		SELECT 
			COALESCE(SUM(amount_tokens), 0) AS total_donations,
			COUNT(*) AS donation_count
		FROM donations 
		WHERE created_at >= ?
	`, startOfMonth).Scan(&donationsMonth)

	// ==== TOKEN DONATION (GIFT) METRICS ====
	type TokenGiftResult struct {
		TotalGifts      int64
		TotalValueCents int64
	}
	
	var tokenGiftsAll TokenGiftResult
	
	// Count gift transactions (gift_sent) and sum amounts
	db.Raw(`
		SELECT 
			COALESCE(COUNT(*), 0) AS total_gifts,
			COALESCE(SUM(amount), 0) AS total_value_cents
		FROM token_transactions
		WHERE transaction_type = 'gift_sent' AND status = 'completed'
	`).Scan(&tokenGiftsAll)

	// ==== TOKEN METRICS ====
	type TokenResult struct {
		TotalPurchased float64
		TotalSpent     float64
		TransactionCount int64
	}
	
	var tokensAll TokenResult
	var tokensToday TokenResult
	var tokensWeek TokenResult
	var tokensMonth TokenResult
	
	db.Raw(`
		SELECT 
			COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN amount ELSE 0 END), 0) AS total_purchased,
			COALESCE(SUM(CASE WHEN transaction_type IN ('ticket_purchase', 'donation') THEN amount ELSE 0 END), 0) AS total_spent,
			COUNT(*) AS transaction_count
		FROM token_transactions 
		WHERE status = 'completed'
	`).Scan(&tokensAll)
	
	db.Raw(`
		SELECT 
			COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN amount ELSE 0 END), 0) AS total_purchased,
			COALESCE(SUM(CASE WHEN transaction_type IN ('ticket_purchase', 'donation') THEN amount ELSE 0 END), 0) AS total_spent,
			COUNT(*) AS transaction_count
		FROM token_transactions 
		WHERE status = 'completed' AND created_at >= ?
	`, startOfToday).Scan(&tokensToday)
	
	db.Raw(`
		SELECT 
			COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN amount ELSE 0 END), 0) AS total_purchased,
			COALESCE(SUM(CASE WHEN transaction_type IN ('ticket_purchase', 'donation') THEN amount ELSE 0 END), 0) AS total_spent,
			COUNT(*) AS transaction_count
		FROM token_transactions 
		WHERE status = 'completed' AND created_at >= ?
	`, startOfWeek).Scan(&tokensWeek)
	
	db.Raw(`
		SELECT 
			COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN amount ELSE 0 END), 0) AS total_purchased,
			COALESCE(SUM(CASE WHEN transaction_type IN ('ticket_purchase', 'donation') THEN amount ELSE 0 END), 0) AS total_spent,
			COUNT(*) AS transaction_count
		FROM token_transactions 
		WHERE status = 'completed' AND created_at >= ?
	`, startOfMonth).Scan(&tokensMonth)

	// ==== SCHEDULED EVENTS ====
	var totalEvents int64
	var upcomingEvents int64
	var pastEvents int64
	
	db.Model(&struct{ ID uint }{}).Table("scheduled_events").Where("deleted_at IS NULL").Count(&totalEvents)
	db.Model(&struct{ ID uint }{}).Table("scheduled_events").Where("start_time > ? AND deleted_at IS NULL", now).Count(&upcomingEvents)
	db.Model(&struct{ ID uint }{}).Table("scheduled_events").Where("start_time <= ? AND deleted_at IS NULL", now).Count(&pastEvents)

	// ==== TOP HOSTS (by revenue) ====
	type TopHost struct {
		UserID   uint    `json:"user_id"`
		Username string  `json:"username"`
		Revenue  float64 `json:"revenue"`
		Tickets  int64   `json:"tickets_sold"`
	}
	
	var topHosts []TopHost
	db.Raw(`
		SELECT 
			r.host_id AS user_id,
			u.username,
			COALESCE(SUM(st.ticket_price_amount), 0) AS revenue,
			COUNT(st.id) AS tickets
		FROM session_tickets st
		INNER JOIN watch_sessions ws ON ws.id = st.session_id
		INNER JOIN rooms r ON r.id = ws.room_id
		INNER JOIN users u ON u.id = r.host_id
		WHERE st.is_refunded = false
		GROUP BY r.host_id, u.username
		ORDER BY revenue DESC
		LIMIT 10
	`).Scan(&topHosts)

	// ==== PAYOUT/WITHDRAWAL METRICS ====
	var totalWithdrawn float64
	var pendingPayouts float64
	var completedPayoutsCount int64
	var pendingPayoutsCount int64
	
	// Sum amount_value (for fiat payouts) - convert tokens to fiat if needed
	db.Model(&struct{ ID uint }{}).Table("payouts").
		Where("status = ?", "completed").
		Select("COALESCE(SUM(COALESCE(amount_value, amount_tokens * 0.01)), 0)").
		Scan(&totalWithdrawn)
	
	db.Model(&struct{ ID uint }{}).Table("payouts").
		Where("status IN ?", []string{"pending", "processing"}).
		Select("COALESCE(SUM(COALESCE(amount_value, amount_tokens * 0.01)), 0)").
		Scan(&pendingPayouts)
	
	db.Model(&struct{ ID uint }{}).Table("payouts").
		Where("status = ?", "completed").
		Count(&completedPayoutsCount)
	
	db.Model(&struct{ ID uint }{}).Table("payouts").
		Where("status IN ?", []string{"pending", "processing"}).
		Count(&pendingPayoutsCount)
	
	// ==== PLATFORM ACCOUNTING ====
	accounting, err := models.GetPlatformAccounting(db)
	if err != nil {
		log.Printf("⚠️  Failed to fetch platform accounting: %v", err)
	}

	log.Printf("📊 [Analytics] Platform analytics requested by super admin")

	// Build platform accounting response with nil checks
	platformAccountingData := gin.H{
		"total_platform_revenue":    0.0,
		"platform_profit":           0.0,
		"reserve_balance":           0.0,
		"total_gateway_balance":     0.0,
		"lifetime_total_revenue":    0.0,
		"lifetime_platform_profit":  0.0,
		"lifetime_host_earnings":    0.0,
		"lifetime_payouts":          0.0,
		"pending_payouts":           0.0,
		"available_reserve":         0.0,
		"is_balanced":               true,
	}
	
	if accounting != nil {
		platformAccountingData = gin.H{
			"total_platform_revenue":    accounting.TotalPlatformRevenue,
			"platform_profit":           accounting.PlatformProfit,
			"reserve_balance":           accounting.HostReserveBalance,
			"total_gateway_balance":     accounting.TotalGatewayBalance,
			"lifetime_total_revenue":    accounting.LifetimeTotalRevenue,
			"lifetime_platform_profit":  accounting.LifetimePlatformProfit,
			"lifetime_host_earnings":    accounting.LifetimeHostEarnings,
			"lifetime_payouts":          accounting.LifetimePayouts,
			"pending_payouts":           accounting.PendingPayouts,
			"available_reserve":         accounting.GetAvailableReserve(),
			"is_balanced":               accounting.IsBalanced(),
			"token_donation_commission": accounting.TokenDonationCommission,
			"lifetime_token_donation_commission": accounting.LifetimeTokenDonationCommission,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"users": gin.H{
			"total":      totalUsers,
			"new_today":  newUsersToday,
			"new_week":   newUsersWeek,
			"new_month":  newUsersMonth,
		},
		"rooms": gin.H{
			"total":         totalRooms,
			"public":        publicRooms,
			"private":       privateRooms,
			"created_week":  roomsCreatedWeek,
			"created_month": roomsCreatedMonth,
		},
		"sessions": gin.H{
			"total":       totalSessions,
			"active":      activeSessions,
			"today":       sessionsToday,
			"week":        sessionsWeek,
			"month":       sessionsMonth,
			"quarter":     sessionsQuarter,
			"year":        sessionsYear,
		},
		   "revenue": gin.H{
			   "all_time": gin.H{
				   "gmv":                 netRevenueAll.GMV,
				   "platform_revenue":    netRevenueAll.PlatformRevenue,
				   "reserve":             netRevenueAll.Reserve,
				   "token_minted":        netRevenueAll.TokenMinted,
				   "token_spent":         netRevenueAll.TokenSpent,
				   "donated_ticket_count": netRevenueAll.DonatedTicketCount,
				   "tickets_sold":        netRevenueAll.TicketCount,
			   },
			   "today": gin.H{
				   "gmv":                 netRevenueToday.GMV,
				   "platform_revenue":    netRevenueToday.PlatformRevenue,
				   "reserve":             netRevenueToday.Reserve,
				   "token_minted":        netRevenueToday.TokenMinted,
				   "token_spent":         netRevenueToday.TokenSpent,
				   "donated_ticket_count": netRevenueToday.DonatedTicketCount,
				   "tickets_sold":        netRevenueToday.TicketCount,
			   },
			   "week": gin.H{
				   "gmv":                 netRevenueWeek.GMV,
				   "platform_revenue":    netRevenueWeek.PlatformRevenue,
				   "reserve":             netRevenueWeek.Reserve,
				   "token_minted":        netRevenueWeek.TokenMinted,
				   "token_spent":         netRevenueWeek.TokenSpent,
				   "donated_ticket_count": netRevenueWeek.DonatedTicketCount,
				   "tickets_sold":        netRevenueWeek.TicketCount,
			   },
			   "month": gin.H{
				   "gmv":                 netRevenueMonth.GMV,
				   "platform_revenue":    netRevenueMonth.PlatformRevenue,
				   "reserve":             netRevenueMonth.Reserve,
				   "token_minted":        netRevenueMonth.TokenMinted,
				   "token_spent":         netRevenueMonth.TokenSpent,
				   "donated_ticket_count": netRevenueMonth.DonatedTicketCount,
				   "tickets_sold":        netRevenueMonth.TicketCount,
			   },
			   "quarter": gin.H{
				   "gmv":                 netRevenueQuarter.GMV,
				   "platform_revenue":    netRevenueQuarter.PlatformRevenue,
				   "reserve":             netRevenueQuarter.Reserve,
				   "token_minted":        netRevenueQuarter.TokenMinted,
				   "token_spent":         netRevenueQuarter.TokenSpent,
				   "donated_ticket_count": netRevenueQuarter.DonatedTicketCount,
				   "tickets_sold":        netRevenueQuarter.TicketCount,
			   },
			   "year": gin.H{
				   "gmv":                 netRevenueYear.GMV,
				   "platform_revenue":    netRevenueYear.PlatformRevenue,
				   "reserve":             netRevenueYear.Reserve,
				   "token_minted":        netRevenueYear.TokenMinted,
				   "token_spent":         netRevenueYear.TokenSpent,
				   "donated_ticket_count": netRevenueYear.DonatedTicketCount,
				   "tickets_sold":        netRevenueYear.TicketCount,
			   },
		   },
		"donations": gin.H{
			"all_time": gin.H{
				"total": donationsAll.TotalDonations,
				"count": donationsAll.DonationCount,
			},
			"week": gin.H{
				"total": donationsWeek.TotalDonations,
				"count": donationsWeek.DonationCount,
			},
			"month": gin.H{
				"total": donationsMonth.TotalDonations,
				"count": donationsMonth.DonationCount,
			},
		},
		"token_donations": gin.H{
			"total_gifts_count": tokenGiftsAll.TotalGifts,
			"total_value_tokens": float64(tokenGiftsAll.TotalValueCents) / 100.0, // Convert cents to tokens
			"total_value_ngn": float64(tokenGiftsAll.TotalValueCents) * 140.25 / 100.0, // Token backing value
			"commission_earned_ngn": func() float64 {
				if accounting != nil {
					return accounting.LifetimeTokenDonationCommission
				}
				return 0.0
			}(),
			"available_to_transfer": func() float64 {
				if accounting != nil {
					return accounting.TokenDonationCommission
				}
				return 0.0
			}(),
		},
		"tokens": gin.H{
			"total_minted": tokensAll.TotalPurchased / 100.0, // Convert from cents to tokens (121 -> 1.21)
			"all_time": gin.H{
				"purchased":    tokensAll.TotalPurchased / 100.0,    // Convert from cents
				"spent":        tokensAll.TotalSpent / 100.0,        // Convert from cents
				"transactions": tokensAll.TransactionCount,
			},
			"today": gin.H{
				"purchased":    tokensToday.TotalPurchased / 100.0,  // Convert from cents
				"spent":        tokensToday.TotalSpent / 100.0,      // Convert from cents
				"transactions": tokensToday.TransactionCount,
			},
			"week": gin.H{
				"purchased":    tokensWeek.TotalPurchased / 100.0,   // Convert from cents
				"spent":        tokensWeek.TotalSpent / 100.0,       // Convert from cents
				"transactions": tokensWeek.TransactionCount,
			},
			"month": gin.H{
				"purchased":    tokensMonth.TotalPurchased / 100.0,  // Convert from cents
				"spent":        tokensMonth.TotalSpent / 100.0,      // Convert from cents
				"transactions": tokensMonth.TransactionCount,
			},
		},
		"events": gin.H{
			"total":    totalEvents,
			"upcoming": upcomingEvents,
			"past":     pastEvents,
		},
		"payouts": gin.H{
			"total_withdrawn":        totalWithdrawn,
			"pending_amount":         pendingPayouts,
			"completed_count":        completedPayoutsCount,
			"pending_count":          pendingPayoutsCount,
		},
		"platform_accounting": platformAccountingData,
		"top_hosts": topHosts,
		"currency":  "NGN",
		"generated_at": now.Format(time.RFC3339),
	})
}

// GetTokenSpendingAnalytics returns detailed token spending analytics for super admins
// GET /api/admin/token-spending-analytics
func GetTokenSpendingAnalytics(c *gin.Context) {
	db := c.MustGet("db").(*gorm.DB)

	// Top rooms by token spending (all time)
	type RoomSpending struct {
		RoomID      uint    `json:"room_id"`
		RoomName    string  `json:"room_name"`
		HostID      uint    `json:"host_id"`
		HostName    string  `json:"host_name"`
		TokensSpent int64   `json:"tokens_spent"`      // In cents (121 = 1.21 tokens)
		TokensFloat float64 `json:"tokens_display"`   // Human readable (1.21)
		TicketCount int64   `json:"ticket_count"`
		Revenue     float64 `json:"revenue_ngn"`      // In Naira
	}

	var topRooms []RoomSpending
	db.Raw(`
		SELECT 
			r.id as room_id,
			r.name as room_name,
			r.host_id,
			u.username as host_name,
			COALESCE(SUM(st.ticket_price_tokens), 0) as tokens_spent,
			COALESCE(SUM(st.ticket_price_tokens), 0) / 100.0 as tokens_float,
			COUNT(st.id) as ticket_count,
			COALESCE(SUM(st.ticket_price_tokens * 165.0 / 100.0), 0) as revenue
		FROM rooms r
		INNER JOIN users u ON u.id = r.host_id
		LEFT JOIN watch_sessions ws ON ws.room_id = r.id
		LEFT JOIN session_tickets st ON st.session_id = ws.id 
			AND st.payment_method = 'tokens' 
			AND st.is_refunded = false
		WHERE r.deleted_at IS NULL
		GROUP BY r.id, r.name, r.host_id, u.username
		HAVING COALESCE(SUM(st.ticket_price_tokens), 0) > 0
		ORDER BY tokens_spent DESC
		LIMIT 10
	`).Scan(&topRooms)

	// Top hosts by token earnings (all time)
	type HostEarnings struct {
		HostID      uint    `json:"host_id"`
		HostName    string  `json:"host_name"`
		TokensEarned int64   `json:"tokens_earned"`     // In cents
		TokensFloat float64 `json:"tokens_display"`    // Human readable
		TicketsSold int64   `json:"tickets_sold"`
		RoomCount   int64   `json:"room_count"`
		Revenue     float64 `json:"revenue_ngn"`       // In Naira
	}

	var topHosts []HostEarnings
	db.Raw(`
		SELECT 
			u.id as host_id,
			u.username as host_name,
			COALESCE(SUM(st.ticket_price_tokens * 0.85), 0) as tokens_earned,
			COALESCE(SUM(st.ticket_price_tokens * 0.85), 0) / 100.0 as tokens_float,
			COUNT(st.id) as tickets_sold,
			COUNT(DISTINCT ws.room_id) as room_count,
			COALESCE(SUM(st.ticket_price_tokens * 165.0 / 100.0 * 0.85), 0) as revenue
		FROM users u
		INNER JOIN watch_sessions ws ON ws.host_id = u.id
		INNER JOIN session_tickets st ON st.session_id = ws.id 
			AND st.payment_method = 'tokens' 
			AND st.is_refunded = false
		WHERE u.deleted_at IS NULL
		GROUP BY u.id, u.username
		HAVING COALESCE(SUM(st.ticket_price_tokens), 0) > 0
		ORDER BY tokens_earned DESC
		LIMIT 10
	`).Scan(&topHosts)

	// Token spending trends (last 30 days)
	type DailySpending struct {
		Date        string  `json:"date"`
		TokensSpent int64   `json:"tokens_spent"`
		TokensFloat float64 `json:"tokens_display"`
		TicketCount int64   `json:"ticket_count"`
		Revenue     float64 `json:"revenue_ngn"`
	}

	var dailyTrends []DailySpending
	db.Raw(`
		SELECT 
			DATE(st.created_at) as date,
			COALESCE(SUM(st.ticket_price_tokens), 0) as tokens_spent,
			COALESCE(SUM(st.ticket_price_tokens), 0) / 100.0 as tokens_float,
			COUNT(st.id) as ticket_count,
			COALESCE(SUM(st.ticket_price_tokens * 165.0 / 100.0), 0) as revenue
		FROM session_tickets st
		WHERE st.payment_method = 'tokens' 
			AND st.is_refunded = false
			AND st.created_at >= CURRENT_DATE - INTERVAL '30 days'
		GROUP BY DATE(st.created_at)
		ORDER BY date DESC
	`).Scan(&dailyTrends)

	// Overall token spending summary
	type SpendingSummary struct {
		TotalTokensSpent    int64   `json:"total_tokens_spent"`
		TotalTokensFloat    float64 `json:"total_tokens_display"`
		TotalTickets        int64   `json:"total_tickets"`
		TotalRevenue        float64 `json:"total_revenue_ngn"`
		AverageTicketPrice  float64 `json:"avg_ticket_price_tokens"`
		UniqueHosts         int64   `json:"unique_hosts"`
		UniqueRooms         int64   `json:"unique_rooms"`
	}

	var summary SpendingSummary
	db.Raw(`
		SELECT 
			COALESCE(SUM(st.ticket_price_tokens), 0) as total_tokens_spent,
			COALESCE(SUM(st.ticket_price_tokens), 0) / 100.0 as total_tokens_float,
			COUNT(st.id) as total_tickets,
			COALESCE(SUM(st.ticket_price_tokens * 165.0 / 100.0), 0) as total_revenue,
			CASE 
				WHEN COUNT(st.id) > 0 
				THEN COALESCE(AVG(st.ticket_price_tokens), 0) / 100.0
				ELSE 0 
			END as average_ticket_price,
			COUNT(DISTINCT st.host_id) as unique_hosts,
			COUNT(DISTINCT ws.room_id) as unique_rooms
		FROM session_tickets st
		INNER JOIN watch_sessions ws ON ws.id = st.session_id
		WHERE st.payment_method = 'tokens' AND st.is_refunded = false
	`).Scan(&summary)

	log.Printf("📊 [TokenSpendingAnalytics] Summary: %d tickets, %.2f tokens (%.2f NGN)", 
		summary.TotalTickets, summary.TotalTokensFloat, summary.TotalRevenue)

	c.JSON(http.StatusOK, gin.H{
		"summary":      summary,
		"top_rooms":    topRooms,
		"top_hosts":    topHosts,
		"daily_trends": dailyTrends,
		"generated_at": time.Now().Format(time.RFC3339),
	})
}
