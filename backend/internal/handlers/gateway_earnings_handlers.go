package handlers

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GetMyGatewayEarnings returns earnings from tickets and donations for the authenticated user
// GET /api/gateway-earnings/me
func GetMyGatewayEarnings(c *gin.Context) {
	// Get authenticated user ID from context
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDInterface.(uint)

	// Get database connection from context
	db := c.MustGet("db").(*gorm.DB)

	// Fetch ticket sales earnings (75% to host, from session_tickets table)
	var ticketEarnings []struct {
		SessionID       uint    `json:"session_id"`
		RoomID          uint    `json:"room_id"`
		RoomName        string  `json:"room_name"`
		EventTitle      string  `json:"event_title"`
		TicketsSold     int     `json:"tickets_sold"`
		TotalRevenue    float64 `json:"total_revenue"`    // Gross (before split)
		NetAmount       float64 `json:"net_amount"`       // 75% to host
		PlatformFee     float64 `json:"platform_fee"`     // 25% to platform
		Currency        string  `json:"currency"`
		IsWithdrawn     bool    `json:"is_withdrawn"`
		LastSaleAt      string  `json:"last_sale_at"`
	}

	err := db.Raw(`
		SELECT 
			ws.id AS session_id,
			ws.room_id,
			r.name AS room_name,
			'' AS event_title,
			COUNT(st.id) AS tickets_sold,
			SUM(st.ticket_price_amount) AS total_revenue,
			SUM(st.ticket_price_amount * 0.75) AS net_amount,
			SUM(st.ticket_price_amount * 0.25) AS platform_fee,
			st.ticket_price_currency AS currency,
			false AS is_withdrawn,
			MAX(st.created_at) AS last_sale_at
		FROM session_tickets st
		INNER JOIN watch_sessions ws ON ws.id = st.session_id
		INNER JOIN rooms r ON r.id = ws.room_id
		WHERE r.host_id = ? AND st.is_refunded = false
		GROUP BY ws.id, ws.room_id, r.name, st.ticket_price_currency
		ORDER BY last_sale_at DESC
	`, userID).Scan(&ticketEarnings).Error

	if err != nil {
		log.Printf("Error fetching ticket earnings for user %d: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch ticket earnings"})
		return
	}

	// Fetch donation earnings (100% to host, from donations table)
	var donationEarnings []struct {
		SessionID       uint    `json:"session_id"`
		RoomID          uint    `json:"room_id"`
		RoomName        string  `json:"room_name"`
		EventTitle      string  `json:"event_title"`
		DonationsCount  int     `json:"donations_count"`
		TotalAmount     float64 `json:"total_amount"`
		NetAmount       float64 `json:"net_amount"`       // 100% to host
		Currency        string  `json:"currency"`
		IsWithdrawn     bool    `json:"is_withdrawn"`
		LastDonationAt  string  `json:"last_donation_at"`
	}

	err = db.Raw(`
		SELECT 
			ws.id AS session_id,
			ws.room_id,
			r.name AS room_name,
			'' AS event_title,
			COUNT(d.id) AS donations_count,
			SUM(d.amount_tokens) AS total_amount,
			SUM(d.amount_tokens) AS net_amount,
			'NGN' AS currency,
			false AS is_withdrawn,
			MAX(d.created_at) AS last_donation_at
		FROM donations d
		INNER JOIN watch_sessions ws ON ws.id = d.session_id
		INNER JOIN rooms r ON r.id = ws.room_id
		WHERE d.host_id = ?
		GROUP BY ws.id, ws.room_id, r.name
		ORDER BY last_donation_at DESC
	`, userID).Scan(&donationEarnings).Error

	if err != nil {
		log.Printf("Error fetching donation earnings for user %d: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch donation earnings"})
		return
	}

	// Calculate totals
	totalTicketRevenue := 0.0
	totalTicketNet := 0.0
	totalDonations := 0.0
	
	for _, earning := range ticketEarnings {
		totalTicketRevenue += earning.TotalRevenue
		totalTicketNet += earning.NetAmount
	}
	
	for _, earning := range donationEarnings {
		totalDonations += earning.TotalAmount
	}

	totalAvailable := totalTicketNet + totalDonations

	c.JSON(http.StatusOK, gin.H{
		"earnings": gin.H{
			"tickets": ticketEarnings,
			"donations": donationEarnings,
		},
		"summary": gin.H{
			"total_ticket_revenue": totalTicketRevenue,
			"total_ticket_net":     totalTicketNet,  // 75% of tickets
			"total_donations":      totalDonations,  // 100% of donations
			"total_available":      totalAvailable,  // Total available to withdraw
			"currency":             "NGN",
		},
	})
}
