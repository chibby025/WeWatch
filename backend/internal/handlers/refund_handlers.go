// WeWatch/backend/internal/handlers/refund_handlers.go
package handlers

import (
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// RefundRequestBody represents a refund request payload
type RefundRequestBody struct {
	Reason string `json:"reason" binding:"required,min=10,max=500"`
}

// RequestRefundHandler handles refund requests from users
// POST /api/refunds/request
func RequestRefundHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get authenticated user
		authUser, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		user := authUser.(*models.User)

		var req RefundRequestBody
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Get ticket ID from query parameter
		ticketIDStr := c.Query("ticket_id")
		if ticketIDStr == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ticket_id query parameter is required"})
			return
		}

		ticketID, err := strconv.ParseUint(ticketIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ticket ID"})
			return
		}

		// Get ticket details
		var ticket models.SessionTicket
		if err := db.Preload("Session").First(&ticket, ticketID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "Ticket not found"})
			} else {
				log.Printf("❌ Error fetching ticket: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch ticket"})
			}
			return
		}

		// Verify user owns the ticket
		if ticket.UserID != user.ID {
			c.JSON(http.StatusForbidden, gin.H{"error": "You don't own this ticket"})
			return
		}

		// Check if already refunded
		if ticket.IsRefunded {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Ticket already refunded"})
			return
		}

		// Check if within 24-hour refund window
		if !ticket.CanRefund() {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   models.ErrRefundNotAllowed.Error(),
				"message": "Refund window has passed (24 hours from purchase)",
			})
			return
		}

		// Check if refund request already exists
		var existingRefund models.RefundRequest
		result := db.Where("ticket_id = ?", ticketID).First(&existingRefund)
		if result.Error == nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "Refund request already exists",
				"message": "A refund request for this ticket is already pending",
				"refund":  existingRefund,
			})
			return
		}

		// Create refund request
		refundRequest := models.RefundRequest{
			TicketID:  uint(ticketID),
			SessionID: ticket.SessionID,
			UserID:    user.ID,
			HostID:    ticket.HostID,
			Reason:    req.Reason,
			Status:    string(models.RefundStatusPending),
		}

		if err := db.Create(&refundRequest).Error; err != nil {
			log.Printf("❌ Error creating refund request: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create refund request"})
			return
		}

		log.Printf("✅ Refund requested: Ticket %d, User %d, Reason: %s", ticketID, user.ID, req.Reason)

		// TODO: Send notification to host

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"refund":  refundRequest,
			"message": "Refund request submitted successfully",
		})
	}
}

// GetUserRefundsHandler retrieves refund requests for a user
// GET /api/refunds/user/:userId
func GetUserRefundsHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDStr := c.Param("userId")
		userID, err := strconv.ParseUint(userIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
			return
		}

		// Get authenticated user
		authUser, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		authenticatedUserID := authUser.(*models.User).ID

		// Users can only view their own refunds
		if uint(userID) != authenticatedUserID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Cannot view other users' refunds"})
			return
		}

		var refunds []models.RefundRequest
		if err := db.Preload("Ticket").Preload("Session").
			Where("user_id = ?", userID).
			Order("created_at DESC").
			Find(&refunds).Error; err != nil {
			log.Printf("❌ Error fetching refunds: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch refunds"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"refunds": refunds,
			"count":   len(refunds),
		})
	}
}

// GetHostRefundsHandler retrieves refund requests for host's sessions
// GET /api/refunds/host/:userId
func GetHostRefundsHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		hostIDStr := c.Param("userId")
		hostID, err := strconv.ParseUint(hostIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid host ID"})
			return
		}

		// Get authenticated user
		authUser, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		authenticatedUserID := authUser.(*models.User).ID

		// Hosts can only view their own refunds
		if uint(hostID) != authenticatedUserID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Cannot view other hosts' refunds"})
			return
		}

		// Filter by status if provided
		query := db.Preload("Ticket").Preload("Session").Preload("User").
			Where("host_id = ?", hostID)

		if status := c.Query("status"); status != "" {
			query = query.Where("status = ?", status)
		}

		var refunds []models.RefundRequest
		if err := query.Order("created_at DESC").Find(&refunds).Error; err != nil {
			log.Printf("❌ Error fetching host refunds: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch refunds"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"refunds": refunds,
			"count":   len(refunds),
		})
	}
}

// ApproveRefundHandler approves a refund request (host only)
// POST /api/refunds/:id/approve
func ApproveRefundHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		refundIDStr := c.Param("id")
		refundID, err := strconv.ParseUint(refundIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid refund ID"})
			return
		}

		// Get authenticated user (host)
		authUser, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		host := authUser.(*models.User)

		var refund models.RefundRequest
		if err := db.Preload("Ticket").First(&refund, refundID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "Refund request not found"})
			} else {
				log.Printf("❌ Error fetching refund: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch refund"})
			}
			return
		}

		// Verify host owns the session
		if refund.HostID != host.ID {
			c.JSON(http.StatusForbidden, gin.H{"error": "You're not the host of this session"})
			return
		}

		// Check if refund is still pending
		if !refund.IsPending() {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "Refund not pending",
				"message": "Only pending refund requests can be approved",
				"status":  refund.Status,
			})
			return
		}

		// Start transaction
		tx := db.Begin()
		defer func() {
			if r := recover(); r != nil {
				tx.Rollback()
			}
		}()

		// Process refund based on payment method
		ticket := refund.Ticket
		if ticket.PaymentMethod == "tokens" {
			// Refund tokens to buyer
			var buyerWallet models.UserWallet
			result := tx.Where("user_id = ?", ticket.UserID).First(&buyerWallet)
			if result.Error == gorm.ErrRecordNotFound {
				buyerWallet = models.UserWallet{
					UserID:         ticket.UserID,
					TokenBalance:   0,
					LifetimeEarned: 0,
					LifetimeSpent:  0,
				}
				tx.Create(&buyerWallet)
			}

			buyerWallet.AddTokens(ticket.TicketPriceTokens)
			if err := tx.Save(&buyerWallet).Error; err != nil {
				tx.Rollback()
				log.Printf("❌ Error refunding buyer: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to refund buyer"})
				return
			}

			// Deduct tokens from host
			var hostWallet models.UserWallet
			if err := tx.Where("user_id = ?", ticket.HostID).First(&hostWallet).Error; err != nil {
				tx.Rollback()
				log.Printf("❌ Error fetching host wallet: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch host wallet"})
				return
			}

			if err := hostWallet.DeductTokens(ticket.TicketPriceTokens); err != nil {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{
					"error":   err.Error(),
					"message": "Host has insufficient balance for refund",
				})
				return
			}

			if err := tx.Save(&hostWallet).Error; err != nil {
				tx.Rollback()
				log.Printf("❌ Error updating host wallet: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update host wallet"})
				return
			}

			// Create refund transaction
			usdValue := float64(ticket.TicketPriceTokens) * 0.10
			transaction := models.TokenTransaction{
				UserID:          ticket.UserID,
				SessionID:       &ticket.SessionID,
				TransactionType: models.TransactionTypeRefund,
				Amount:          ticket.TicketPriceTokens,
				USDValue:        &usdValue,
				Status:          models.TransactionStatusCompleted,
			}
			if err := tx.Create(&transaction).Error; err != nil {
				tx.Rollback()
				log.Printf("❌ Error creating refund transaction: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create refund transaction"})
				return
			}

			log.Printf("✅ Token refund processed: %d tokens to user %d", ticket.TicketPriceTokens, ticket.UserID)

		} else {
			// Gateway refund - TODO: Initiate gateway refund API call
			log.Printf("💳 Gateway refund needed: %.2f %s to user %d", ticket.TicketPriceAmount, ticket.TicketPriceCurrency, ticket.UserID)
			// For now, just mark as refunded in database
		}

		// Mark ticket as refunded
		now := time.Now()
		ticket.IsRefunded = true
		ticket.RefundReason = &refund.Reason
		ticket.RefundedAt = &now
		if err := tx.Save(&ticket).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ Error marking ticket as refunded: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update ticket"})
			return
		}

		// Approve refund request
		refund.Approve()
		if err := tx.Save(&refund).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ Error approving refund: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to approve refund"})
			return
		}

		// Commit transaction
		if err := tx.Commit().Error; err != nil {
			log.Printf("❌ Error committing refund approval: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to complete refund"})
			return
		}

		log.Printf("✅ Refund approved: ID %d, Ticket %d, User %d", refundID, ticket.ID, ticket.UserID)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"refund":  refund,
			"message": "Refund approved and processed successfully",
		})
	}
}

// DenyRefundHandler denies a refund request (host only)
// POST /api/refunds/:id/deny
func DenyRefundHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		refundIDStr := c.Param("id")
		refundID, err := strconv.ParseUint(refundIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid refund ID"})
			return
		}

		// Get authenticated user (host)
		authUser, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		host := authUser.(*models.User)

		// Parse denial reason
		var reqBody struct {
			Reason string `json:"reason" binding:"required,min=10,max=500"`
		}
		if err := c.ShouldBindJSON(&reqBody); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Denial reason is required"})
			return
		}

		var refund models.RefundRequest
		if err := db.First(&refund, refundID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "Refund request not found"})
			} else {
				log.Printf("❌ Error fetching refund: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch refund"})
			}
			return
		}

		// Verify host owns the session
		if refund.HostID != host.ID {
			c.JSON(http.StatusForbidden, gin.H{"error": "You're not the host of this session"})
			return
		}

		// Check if refund is still pending
		if !refund.IsPending() {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "Refund not pending",
				"message": "Only pending refund requests can be denied",
				"status":  refund.Status,
			})
			return
		}

		// Deny refund request
		refund.Deny(reqBody.Reason)
		if err := db.Save(&refund).Error; err != nil {
			log.Printf("❌ Error denying refund: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to deny refund"})
			return
		}

		log.Printf("✅ Refund denied: ID %d, Host %d, Reason: %s", refundID, host.ID, reqBody.Reason)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"refund":  refund,
			"message": "Refund request denied",
		})
	}
}
