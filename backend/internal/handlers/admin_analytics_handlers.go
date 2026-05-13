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
		PlatformRevenue    float64 // Platform's 25% of net ticket sales + all net token purchases
		Reserve            float64 // Host 75% of net ticket sales
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

	// ==== POST DOWNLOAD METRICS ====
	var totalDownloads int64
	var downloadsToday int64
	var downloadsWeek int64
	var downloadsMonth int64
	
	db.Model(&struct{ ID uint }{}).Table("post_downloads").Count(&totalDownloads)
	db.Model(&struct{ ID uint }{}).Table("post_downloads").Where("downloaded_at >= ?", startOfToday).Count(&downloadsToday)
	db.Model(&struct{ ID uint }{}).Table("post_downloads").Where("downloaded_at >= ?", startOfWeek).Count(&downloadsWeek)
	db.Model(&struct{ ID uint }{}).Table("post_downloads").Where("downloaded_at >= ?", startOfMonth).Count(&downloadsMonth)

	// Top downloaded posts (all time)
	type TopDownloadedPost struct {
		PostID         uint   `json:"post_id"`
		Title          string `json:"title"`
		Username       string `json:"username"`
		DownloadsCount int    `json:"downloads_count"`
	}
	
	var topDownloadedPosts []TopDownloadedPost
	db.Raw(`
		SELECT 
			p.id AS post_id,
			p.title,
			u.username,
			p.downloads_count
		FROM posts p
		INNER JOIN users u ON u.id = p.user_id
		WHERE p.downloads_count > 0 AND p.deleted_at IS NULL
		ORDER BY p.downloads_count DESC
		LIMIT 10
	`).Scan(&topDownloadedPosts)

	// ==== RECORDING METRICS ====
	var totalRecordings int64
	var recordingsToday int64
	var recordingsWeek int64
	var recordingsMonth int64
	var recordingsQuarter int64
	var recordingsYear int64

	db.Model(&models.Post{}).Where("post_type = ? AND deleted_at IS NULL", "recording").Count(&totalRecordings)
	db.Model(&models.Post{}).Where("post_type = ? AND created_at >= ? AND deleted_at IS NULL", "recording", startOfToday).Count(&recordingsToday)
	db.Model(&models.Post{}).Where("post_type = ? AND created_at >= ? AND deleted_at IS NULL", "recording", startOfWeek).Count(&recordingsWeek)
	db.Model(&models.Post{}).Where("post_type = ? AND created_at >= ? AND deleted_at IS NULL", "recording", startOfMonth).Count(&recordingsMonth)
	db.Model(&models.Post{}).Where("post_type = ? AND created_at >= ? AND deleted_at IS NULL", "recording", startOfQuarter).Count(&recordingsQuarter)
	db.Model(&models.Post{}).Where("post_type = ? AND created_at >= ? AND deleted_at IS NULL", "recording", startOfYear).Count(&recordingsYear)

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
			"transfer_fee_revenue":         accounting.TransferFeeRevenue,
			"lifetime_transfer_fee_revenue": accounting.LifetimeTransferFeeRevenue,
			"total_early_bird_savings":     accounting.TotalEarlyBirdSavings,
		}
	}

	// ==== AD CAMPAIGN METRICS ====
	type AdMetrics struct {
		TotalCampaigns    int64
		ActiveCampaigns   int64
		TotalImpressions  int64
		TotalClicks       int64
		CTR               float64
		EstimatedRevenue  float64
		ImpressionsToday  int64
		ClicksToday       int64
		ImpressionsWeek   int64
		ClicksWeek        int64
		PendingInquiries  int64
		ApprovedInquiries int64
	}

	var adMetrics AdMetrics

	// Total and active campaigns
	db.Model(&struct{ ID uint }{}).Table("ad_campaigns").Count(&adMetrics.TotalCampaigns)
	db.Model(&struct{ ID uint }{}).Table("ad_campaigns").Where("status = ?", "active").Count(&adMetrics.ActiveCampaigns)

	// Total impressions and clicks
	db.Model(&struct{ ID uint }{}).Table("ad_impressions").Count(&adMetrics.TotalImpressions)
	db.Model(&struct{ ID uint }{}).Table("ad_impressions").Where("clicked = ?", true).Count(&adMetrics.TotalClicks)

	// Calculate CTR
	if adMetrics.TotalImpressions > 0 {
		adMetrics.CTR = (float64(adMetrics.TotalClicks) / float64(adMetrics.TotalImpressions)) * 100
	}

	// Impressions and clicks today
	db.Model(&struct{ ID uint }{}).Table("ad_impressions").Where("DATE(created_at) = CURRENT_DATE").Count(&adMetrics.ImpressionsToday)
	db.Model(&struct{ ID uint }{}).Table("ad_impressions").Where("DATE(created_at) = CURRENT_DATE AND clicked = ?", true).Count(&adMetrics.ClicksToday)

	// Impressions and clicks this week
	db.Model(&struct{ ID uint }{}).Table("ad_impressions").Where("created_at >= ?", startOfWeek).Count(&adMetrics.ImpressionsWeek)
	db.Model(&struct{ ID uint }{}).Table("ad_impressions").Where("created_at >= ? AND clicked = ?", startOfWeek, true).Count(&adMetrics.ClicksWeek)

	// Calculate estimated revenue (sum of spent_amount from campaigns)
	db.Raw("SELECT COALESCE(SUM(spent_amount), 0) FROM ad_campaigns").Scan(&adMetrics.EstimatedRevenue)

	// Inquiry metrics
	db.Model(&struct{ ID uint }{}).Table("ad_inquiries").Where("status = ?", "pending").Count(&adMetrics.PendingInquiries)
	db.Model(&struct{ ID uint }{}).Table("ad_inquiries").Where("status = ?", "approved").Count(&adMetrics.ApprovedInquiries)

	// Top campaigns by impressions
	type TopCampaign struct {
		ID            uint
		CampaignName  string
		Impressions   int64
		Clicks        int64
		CTR           float64
		SpentAmount   float64
		CPM           float64
	}

	var topCampaigns []TopCampaign
	db.Raw(`
		SELECT 
			c.id,
			c.campaign_name,
			c.impressions_count AS impressions,
			c.clicks_count AS clicks,
			CASE 
				WHEN c.impressions_count > 0 THEN (c.clicks_count::float / c.impressions_count::float * 100)
				ELSE 0 
			END AS ctr,
			c.spent_amount,
			c.cpm
		FROM ad_campaigns c
		WHERE c.status = 'active'
		ORDER BY c.impressions_count DESC
		LIMIT 5
	`).Scan(&topCampaigns)

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
			"total_value_ngn": float64(tokenGiftsAll.TotalValueCents) * 122.0 / 100.0, // Token withdrawal rate
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
		"downloads": gin.H{
			"total":             totalDownloads,
			"today":             downloadsToday,
			"week":              downloadsWeek,
			"month":             downloadsMonth,
			"top_posts":         topDownloadedPosts,
		},
		"recordings": gin.H{
			"total":    totalRecordings,
			"today":    recordingsToday,
			"week":     recordingsWeek,
			"month":    recordingsMonth,
			"quarter":  recordingsQuarter,
			"year":     recordingsYear,
		},
		"payouts": gin.H{
			"total_withdrawn":        totalWithdrawn,
			"pending_amount":         pendingPayouts,
			"completed_count":        completedPayoutsCount,
			"pending_count":          pendingPayoutsCount,
		},
		"ads": gin.H{
			"total_campaigns":     adMetrics.TotalCampaigns,
			"active_campaigns":    adMetrics.ActiveCampaigns,
			"total_impressions":   adMetrics.TotalImpressions,
			"total_clicks":        adMetrics.TotalClicks,
			"ctr":                 adMetrics.CTR,
			"estimated_revenue":   adMetrics.EstimatedRevenue,
			"impressions_today":   adMetrics.ImpressionsToday,
			"clicks_today":        adMetrics.ClicksToday,
			"impressions_week":    adMetrics.ImpressionsWeek,
			"clicks_week":         adMetrics.ClicksWeek,
			"pending_inquiries":   adMetrics.PendingInquiries,
			"approved_inquiries":  adMetrics.ApprovedInquiries,
			"top_campaigns":       topCampaigns,
		},
		"platform_accounting": platformAccountingData,
		"top_hosts": topHosts,
		"currency":  "NGN",
		"split_profit": gin.H{
			"available_tokens": 0, // Will be calculated when needed
			"transferred_tokens": 0,
			"pending_transfer": false,
		},
		"generated_at": now.Format(time.RFC3339),
	})
}

// TransferSplitProfit transfers accumulated platform profit from post/recording sales to super admin
// POST /api/admin/transfer-split-profit
func TransferSplitProfit(c *gin.Context) {
	db := c.MustGet("db").(*gorm.DB)

	// Get authenticated super admin
	authUser, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	user := authUser.(*models.User)

	// Verify super admin status
	if user.Role != "super_admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only super admins can transfer split profit"})
		return
	}

	// Query total accumulated split profit AND amount already transferred
	type SplitProfitData struct {
		TotalSalesTokens  int64
		TransferredTokens int64
	}

	var profitData SplitProfitData

	db.Raw(`
		SELECT
			COALESCE(SUM(pp.amount_tokens), 0) as total_sales_tokens,
			COALESCE((SELECT SUM(amount_tokens) FROM split_profit_transfers WHERE status = 'completed'), 0) as transferred_tokens
		FROM post_purchases pp
		WHERE pp.status = 'completed'
	`).Scan(&profitData)

	// 25% of total sales is the platform's lifetime entitlement.
	// Subtract what's already been transferred so repeated calls don't double-pay.
	totalProfit := int64(float64(profitData.TotalSalesTokens) * 0.25)
	availableProfit := totalProfit - profitData.TransferredTokens

	if availableProfit <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No profit available to transfer"})
		return
	}

	superAdminID := uint(7)

	// All three writes (transfer record, token transaction, wallet update) must
	// commit together or the books drift.
	tx := db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	transfer := map[string]interface{}{
		"admin_id":       user.ID,
		"amount_tokens":  availableProfit,
		"transferred_at": time.Now(),
		"status":         "completed",
	}

	if err := tx.Table("split_profit_transfers").Create(transfer).Error; err != nil {
		tx.Rollback()
		log.Printf("Error creating split_profit_transfers record: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create transfer record"})
		return
	}

	walletTxn := models.TokenTransaction{
		UserID:          superAdminID,
		TransactionType: models.TransactionType("admin_split_profit_transfer"),
		Amount:          int(availableProfit),
		Status:          models.TransactionStatusCompleted,
		Metadata: map[string]interface{}{
			"reference":   "split_profit_transfer_" + time.Now().Format("20060102150405"),
			"description": "Platform profit from post/recording sales (25% split)",
		},
	}

	if err := tx.Create(&walletTxn).Error; err != nil {
		tx.Rollback()
		log.Printf("Error creating token transaction: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create wallet transaction"})
		return
	}

	var wallet models.UserWallet
	if err := tx.Where("user_id = ?", superAdminID).First(&wallet).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			wallet = models.UserWallet{
				UserID:         superAdminID,
				TokenBalance:   int(availableProfit),
				LifetimeEarned: int(availableProfit),
				LifetimeSpent:  0,
			}
			if err := tx.Create(&wallet).Error; err != nil {
				tx.Rollback()
				log.Printf("Error creating wallet for super admin: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update wallet"})
				return
			}
		} else {
			tx.Rollback()
			log.Printf("Error fetching wallet: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch wallet"})
			return
		}
	} else {
		wallet.TokenBalance += int(availableProfit)
		wallet.LifetimeEarned += int(availableProfit)
		if err := tx.Save(&wallet).Error; err != nil {
			tx.Rollback()
			log.Printf("Error updating wallet: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update wallet"})
			return
		}
	}

	if err := tx.Commit().Error; err != nil {
		log.Printf("Error committing split profit transfer: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to complete transfer"})
		return
	}

	log.Printf("💰 Split profit transferred: %d tokens (%.2f NGN) to super admin (user_id=%d)",
		availableProfit, float64(availableProfit)*122.0/100.0, superAdminID)

	c.JSON(http.StatusOK, gin.H{
		"message": "✅ Split profit transferred to super admin wallet",
		"amount_tokens": availableProfit,
		"amount_ngn": float64(availableProfit) * 122.0 / 100.0,
		"recipient_user_id": superAdminID,
		"transferred_at": time.Now().Format(time.RFC3339),
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
			COALESCE(SUM(st.ticket_price_tokens * 1.0), 0) as tokens_earned,
			COALESCE(SUM(st.ticket_price_tokens * 1.0), 0) / 100.0 as tokens_float,
			COUNT(st.id) as tickets_sold,
			COUNT(DISTINCT ws.room_id) as room_count,
			COALESCE(SUM(st.ticket_price_tokens * 122.0 / 100.0 * 1.0), 0) as revenue
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

// GetEventAnalytics returns event ticketing analytics for super admins
// GET /api/admin/event-analytics
func GetEventAnalytics(c *gin.Context) {
	db := c.MustGet("db").(*gorm.DB)

	// ==== TOTAL METRICS ====
	var totalTicketsSold int64
	var totalRSVPs int64
	var totalGiftedTickets int64
	
	// Count paid tickets (not refunded, not cancelled)
	db.Model(&models.EventTicket{}).
		Where("payment_method = ? AND is_refunded = ? AND is_cancelled = ?", "tokens", false, false).
		Count(&totalTicketsSold)
	
	// Count free RSVPs (not cancelled)
	db.Model(&models.EventTicket{}).
		Where("payment_method = ? AND is_cancelled = ?", "free_rsvp", false).
		Count(&totalRSVPs)
	
	// Count gifted tickets
	db.Model(&models.EventTicket{}).
		Where("is_gift = ? AND is_refunded = ? AND is_cancelled = ?", true, false, false).
		Count(&totalGiftedTickets)

	// ==== REVENUE METRICS ====
	type RevenueResult struct {
		TotalRevenue    int // Total ticket revenue in tokens (cents)
		TransferFeeRevenue int // Total 5% transfer fees from gifts
	}
	
	var revenue RevenueResult
	
	// Sum ticket prices for all sold tickets
	db.Model(&models.EventTicket{}).
		Select("COALESCE(SUM(ticket_price_tokens), 0) as total_revenue").
		Where("payment_method = ? AND is_refunded = ? AND is_cancelled = ?", "tokens", false, false).
		Scan(&revenue)
	
	// Calculate transfer fee revenue (5% of gifted ticket prices)
	var giftRevenue struct {
		TotalGiftPrice int
	}
	db.Model(&models.EventTicket{}).
		Select("COALESCE(SUM(ticket_price_tokens), 0) as total_gift_price").
		Where("is_gift = ? AND payment_method = ? AND is_refunded = ? AND is_cancelled = ?", true, "tokens", false, false).
		Scan(&giftRevenue)
	
	revenue.TransferFeeRevenue = int(float64(giftRevenue.TotalGiftPrice) * 0.05)

	// ==== TOP EVENTS BY TICKET SALES ====
	type TopEvent struct {
		EventID       uint    `json:"event_id"`
		Title         string  `json:"title"`
		RoomID        string  `json:"room_id"`
		WatchType     string  `json:"watch_type"`
		TicketsSold   int64   `json:"tickets_sold"`
		Revenue       int     `json:"revenue"` // In tokens (cents)
	}
	
	var topEvents []TopEvent
	db.Raw(`
		SELECT 
			se.id as event_id,
			se.title,
			se.room_id,
			se.watch_type,
			COUNT(et.id) as tickets_sold,
			COALESCE(SUM(et.ticket_price_tokens), 0) as revenue
		FROM scheduled_events se
		INNER JOIN event_tickets et ON et.scheduled_event_id = se.id
		WHERE et.payment_method = 'tokens' 
			AND et.is_refunded = false 
			AND et.is_cancelled = false
		GROUP BY se.id, se.title, se.room_id, se.watch_type
		ORDER BY tickets_sold DESC, revenue DESC
		LIMIT 10
	`).Scan(&topEvents)

	// ==== REVENUE BY WATCH TYPE ====
	type WatchTypeRevenue struct {
		WatchType   string `json:"watch_type"`
		TicketsSold int64  `json:"tickets_sold"`
		Revenue     int    `json:"revenue"`
	}
	
	var watchTypeRevenues []WatchTypeRevenue
	db.Raw(`
		SELECT 
			se.watch_type,
			COUNT(et.id) as tickets_sold,
			COALESCE(SUM(et.ticket_price_tokens), 0) as revenue
		FROM scheduled_events se
		INNER JOIN event_tickets et ON et.scheduled_event_id = se.id
		WHERE et.payment_method = 'tokens' 
			AND et.is_refunded = false 
			AND et.is_cancelled = false
		GROUP BY se.watch_type
		ORDER BY revenue DESC
	`).Scan(&watchTypeRevenues)

	// ==== UPCOMING EVENTS WITH TICKETS ====
	var upcomingEventsCount int64
	db.Model(&models.ScheduledEvent{}).
		Where("start_time > ? AND is_paid = ?", time.Now(), true).
		Count(&upcomingEventsCount)

	// ==== EARLY BIRD STATISTICS ====
	var earlyBirdTickets int64
	var earlyBirdSavings int
	
	db.Model(&models.EventTicket{}).
		Where("is_early_bird = ? AND payment_method = ? AND is_refunded = ? AND is_cancelled = ?", 
			true, "tokens", false, false).
		Count(&earlyBirdTickets)
	
	// Calculate savings (difference between regular price and early bird price would be in transaction data)
	// For now, we'll estimate 20% average savings
	db.Raw(`
		SELECT 
			COALESCE(SUM(et.ticket_price_tokens * 0.25), 0) as total_savings
		FROM event_tickets et
		WHERE et.is_early_bird = true 
			AND et.payment_method = 'tokens'
			AND et.is_refunded = false 
			AND et.is_cancelled = false
	`).Scan(&earlyBirdSavings)

	// ==== RESPONSE ====
	c.JSON(http.StatusOK, gin.H{
		"total_tickets_sold":     totalTicketsSold,
		"total_rsvps":            totalRSVPs,
		"total_gifted_tickets":   totalGiftedTickets,
		"ticket_revenue":         revenue.TotalRevenue,        // In tokens (cents)
		"transfer_fee_revenue":   revenue.TransferFeeRevenue,  // 5% from gifts
		"total_revenue":          revenue.TotalRevenue + revenue.TransferFeeRevenue,
		"early_bird_tickets":     earlyBirdTickets,
		"early_bird_savings":     earlyBirdSavings,
		"upcoming_paid_events":   upcomingEventsCount,
		"top_events":             topEvents,
		"revenue_by_watch_type":  watchTypeRevenues,
		"generated_at":           time.Now().Format(time.RFC3339),
	})
}

// GetSplitProfitAnalytics returns platform profit from paid post/recording splits
// GET /api/admin/split-profit-analytics
func GetSplitProfitAnalytics(c *gin.Context) {
	db := c.MustGet("db").(*gorm.DB)

	// ==== POST PURCHASE METRICS BY CONTENT RATING ====
	type RatingMetrics struct {
		Rating         string  `json:"rating"`
		Sales          int64   `json:"sales"`
		RevenueTokens  int64   `json:"revenue_tokens"` // In cents
		RevenueNGN     float64 `json:"revenue_ngn"`    // Total revenue in Naira
		PlatformProfit int64   `json:"platform_profit_tokens"` // 25% platform share in cents
	}

	// All possible content ratings — must match Post.ContentRating values (case-sensitive)
	allRatings := []string{"G", "PG", "Educational", "Religious", "13+", "16+", "18+", "Mature"}
	ratingMetricsMap := make(map[string]RatingMetrics)

	// Initialize all ratings with zero values
	for _, rating := range allRatings {
		ratingMetricsMap[rating] = RatingMetrics{
			Rating:         rating,
			Sales:          0,
			RevenueTokens:  0,
			RevenueNGN:     0,
			PlatformProfit: 0,
		}
	}

	// Query actual post_purchases data grouped by content_rating
	type PostSalesByRating struct {
		ContentRating  string `json:"content_rating"`
		Sales          int64  `json:"sales"`
		RevenueTokens  int64  `json:"revenue_tokens"`
	}

	var actualSales []PostSalesByRating
	db.Raw(`
		SELECT 
			p.content_rating,
			COUNT(pp.id) as sales,
			COALESCE(SUM(pp.amount_tokens), 0) as revenue_tokens
		FROM posts p
		LEFT JOIN post_purchases pp ON pp.post_id = p.id AND pp.status = 'completed'
		WHERE p.deleted_at IS NULL
		GROUP BY p.content_rating
	`).Scan(&actualSales)

	// Merge actual data into map
	for _, sale := range actualSales {
		revenueNGN := float64(sale.RevenueTokens) * 165.0 / 100.0 // Convert cents to tokens, then tokens to NGN at purchase rate
		platformProfit := int64(float64(sale.RevenueTokens) * 0.25) // 25% platform share

		ratingMetricsMap[sale.ContentRating] = RatingMetrics{
			Rating:         sale.ContentRating,
			Sales:          sale.Sales,
			RevenueTokens:  sale.RevenueTokens,
			RevenueNGN:     revenueNGN,
			PlatformProfit: platformProfit,
		}
	}

	// Convert map to slice
	var ratingMetrics []RatingMetrics
	for _, rating := range allRatings {
		ratingMetrics = append(ratingMetrics, ratingMetricsMap[rating])
	}

	// ==== TOTAL SPLIT PROFIT CALCULATION ====
	type SplitProfitSummary struct {
		TotalSalesTokens       int64   `json:"total_sales_tokens"` // Total revenue in tokens (cents)
		TotalSalesNGN          float64 `json:"total_sales_ngn"`
		TotalPlatformProfit    int64   `json:"total_platform_profit_tokens"` // 25% share
		TotalPlatformProfitNGN float64 `json:"total_platform_profit_ngn"`
		TransferredTokens      int64   `json:"transferred_tokens"` // Already transferred
		AvailableTokens        int64   `json:"available_tokens"`   // Pending transfer
	}

	var summary SplitProfitSummary
	
	// Calculate total from all ratings
	for _, metric := range ratingMetrics {
		summary.TotalSalesTokens += metric.RevenueTokens
		summary.TotalSalesNGN += metric.RevenueNGN
		summary.TotalPlatformProfit += metric.PlatformProfit
	}

	// Convert profit tokens to NGN (using withdrawal rate ₦122)
	summary.TotalPlatformProfitNGN = float64(summary.TotalPlatformProfit) * 122.0 / 100.0

	// Query transferred amounts from split_profit_transfers table
	db.Raw(`
		SELECT 
			COALESCE(SUM(amount_tokens), 0) as transferred_tokens
		FROM split_profit_transfers
		WHERE status = 'completed'
	`).Scan(map[string]interface{}{"transferred_tokens": &summary.TransferredTokens})

	summary.AvailableTokens = summary.TotalPlatformProfit - summary.TransferredTokens

	// Top purchased posts
	type TopPost struct {
		PostID        uint    `json:"post_id"`
		Title         string  `json:"title"`
		Username      string  `json:"username"`
		ContentRating string  `json:"content_rating"`
		Sales         int64   `json:"sales"`
		RevenueTokens int64   `json:"revenue_tokens"`
		RevenueNGN    float64 `json:"revenue_ngn"`
	}

	var topPosts []TopPost
	db.Raw(`
		SELECT 
			p.id,
			p.title,
			u.username,
			p.content_rating,
			COUNT(pp.id) as sales,
			COALESCE(SUM(pp.amount_tokens), 0) as revenue_tokens,
			COALESCE(SUM(pp.amount_tokens), 0) * 165.0 / 100.0 as revenue_ngn
		FROM posts p
		INNER JOIN users u ON u.id = p.user_id
		LEFT JOIN post_purchases pp ON pp.post_id = p.id AND pp.status = 'completed'
		WHERE p.is_paid = true AND p.deleted_at IS NULL
		GROUP BY p.id, p.title, u.username, p.content_rating
		HAVING COUNT(pp.id) > 0
		ORDER BY COUNT(pp.id) DESC
		LIMIT 10
	`).Scan(&topPosts)

	c.JSON(http.StatusOK, gin.H{
		"summary":           summary,
		"sales_by_rating":   ratingMetrics,
		"top_posts":         topPosts,
		"generated_at":      time.Now().Format(time.RFC3339),
	})
}
