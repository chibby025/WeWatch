package handlers

import (
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"wewatch-backend/internal/models"
	"wewatch-backend/internal/services"
)

// --- Data Export ---

// dataExportLimiter enforces one export per user per hour to prevent bulk harvesting.
var dataExportLimiter = &exportRateLimiter{requests: make(map[uint]time.Time)}

type exportRateLimiter struct {
	mu       sync.Mutex
	requests map[uint]time.Time
}

func (l *exportRateLimiter) allow(userID uint) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if last, ok := l.requests[userID]; ok && time.Since(last) < time.Hour {
		return false
	}
	l.requests[userID] = time.Now()
	return true
}

// DataExportHandler collects all personal data held about the authenticated user
// and returns it as a downloadable JSON file.
// GET /api/users/me/data-export
func DataExportHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDVal, _ := c.Get("user_id")
		userID := userIDVal.(uint)

		if !dataExportLimiter.allow(userID) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "Data export is limited to once per hour.",
				"retry_after": 3600,
			})
			return
		}

		export := buildDataExport(db, userID)

		filename := fmt.Sprintf("letswatchout-data-export-%d-%s.json", userID, time.Now().Format("2006-01-02"))
		c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
		c.Header("Content-Type", "application/json")
		c.JSON(http.StatusOK, export)
	}
}

type dataExport struct {
	ExportedAt      time.Time                `json:"exported_at"`
	Profile         interface{}              `json:"profile"`
	RoomMemberships interface{}              `json:"room_memberships"`
	Posts           interface{}              `json:"posts"`
	PostComments    interface{}              `json:"post_comments"`
	ScheduledEvents interface{}              `json:"scheduled_events"`
	Transactions    interface{}              `json:"token_transactions"`
	Payouts         interface{}              `json:"payouts"`
	PaymentAccounts interface{}              `json:"payment_accounts"`
	SessionHistory  interface{}              `json:"session_history"`
}

func buildDataExport(db *gorm.DB, userID uint) dataExport {
	exp := dataExport{ExportedAt: time.Now()}

	// Profile (no password hash, no 2FA secret)
	var user models.User
	db.Select("id, username, email, avatar_url, bio, role, country, email_verified, kyc_status, created_at, updated_at").
		First(&user, userID)
	exp.Profile = user

	// Room memberships
	var rooms []struct {
		RoomID    uint      `json:"room_id"`
		RoomName  string    `json:"room_name"`
		UserRole  string    `json:"user_role"`
		JoinedAt  time.Time `json:"joined_at"`
	}
	db.Table("user_rooms ur").
		Select("ur.room_id, r.name as room_name, ur.user_role, ur.created_at as joined_at").
		Joins("JOIN rooms r ON r.id = ur.room_id").
		Where("ur.user_id = ? AND ur.is_banned = false", userID).
		Scan(&rooms)
	exp.RoomMemberships = rooms

	// Posts
	var posts []struct {
		ID          uint      `json:"id"`
		Description string    `json:"description"`
		PostType    string    `json:"post_type"`
		MediaURL    string    `json:"media_url"`
		CreatedAt   time.Time `json:"created_at"`
	}
	db.Table("posts").
		Select("id, description, post_type, media_url, created_at").
		Where("user_id = ? AND deleted_at IS NULL", userID).
		Order("created_at DESC").
		Scan(&posts)
	exp.Posts = posts

	// Post comments
	var comments []struct {
		ID        uint      `json:"id"`
		PostID    uint      `json:"post_id"`
		Content   string    `json:"content"`
		CreatedAt time.Time `json:"created_at"`
	}
	db.Table("post_comments").
		Select("id, post_id, content, created_at").
		Where("user_id = ? AND deleted_at IS NULL", userID).
		Order("created_at DESC").
		Scan(&comments)
	exp.PostComments = comments

	// Scheduled events (created by user)
	var events []struct {
		ID        uint      `json:"id"`
		Title     string    `json:"title"`
		EventDate time.Time `json:"event_date"`
		RoomID    uint      `json:"room_id"`
		CreatedAt time.Time `json:"created_at"`
	}
	db.Table("scheduled_events").
		Select("id, title, event_date, room_id, created_at").
		Where("created_by = ?", userID).
		Order("event_date DESC").
		Scan(&events)
	exp.ScheduledEvents = events

	// Token transactions (financial record — kept even post-deletion)
	var txns []struct {
		ID              uint      `json:"id"`
		TransactionType string    `json:"transaction_type"`
		Amount          int       `json:"amount"`
		Status          string    `json:"status"`
		CreatedAt       time.Time `json:"created_at"`
	}
	db.Table("token_transactions").
		Select("id, transaction_type, amount, status, created_at").
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Scan(&txns)
	exp.Transactions = txns

	// Payouts
	var payouts []struct {
		ID           uint      `json:"id"`
		PayoutType   string    `json:"payout_type"`
		PayoutMethod string    `json:"payout_method"`
		AmountValue  *float64  `json:"amount_value,omitempty"`
		Status       string    `json:"status"`
		CreatedAt    time.Time `json:"created_at"`
	}
	db.Table("payouts").
		Select("id, payout_type, payout_method, amount_value, status, created_at").
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Scan(&payouts)
	exp.Payouts = payouts

	// Payment accounts — masked account numbers only
	var accounts []models.PaymentAccount
	db.Where("user_id = ?", userID).Find(&accounts)
	type maskedAccount struct {
		ID                  uint      `json:"id"`
		Gateway             string    `json:"gateway"`
		BankName            *string   `json:"bank_name,omitempty"`
		MaskedAccountNumber string    `json:"masked_account_number,omitempty"`
		AccountName         *string   `json:"account_name,omitempty"`
		Currency            string    `json:"currency"`
		IsPrimary           bool      `json:"is_primary"`
		CreatedAt           time.Time `json:"created_at"`
	}
	maskedAccounts := make([]maskedAccount, 0, len(accounts))
	for _, a := range accounts {
		ma := maskedAccount{
			ID:          a.ID,
			Gateway:     a.Gateway,
			BankName:    a.BankName,
			AccountName: a.AccountName,
			Currency:    a.Currency,
			IsPrimary:   a.IsPrimary,
			CreatedAt:   a.CreatedAt,
		}
		if a.AccountNumber != nil && len(*a.AccountNumber) >= 4 {
			n := *a.AccountNumber
			ma.MaskedAccountNumber = "****" + n[len(n)-4:]
		}
		maskedAccounts = append(maskedAccounts, ma)
	}
	exp.PaymentAccounts = maskedAccounts

	// Session attendance history
	var sessions []struct {
		SessionID    uint      `json:"session_id"`
		RoomName     string    `json:"room_name"`
		SessionTitle string    `json:"session_title"`
		JoinedAt     time.Time `json:"joined_at"`
	}
	db.Table("watch_session_members wsm").
		Select("wsm.watch_session_id as session_id, r.name as room_name, ws.title as session_title, wsm.joined_at").
		Joins("JOIN watch_sessions ws ON ws.id = wsm.watch_session_id").
		Joins("JOIN rooms r ON r.id = ws.room_id").
		Where("wsm.user_id = ?", userID).
		Order("wsm.joined_at DESC").
		Limit(500).
		Scan(&sessions)
	exp.SessionHistory = sessions

	return exp
}

// --- Account Deletion ---

// DeleteAccountHandler anonymises the authenticated user's account in compliance with NDPR.
// Financial records (transactions, payouts) are retained as required by CBN regulations.
// DELETE /api/users/me/account
func DeleteAccountHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDVal, _ := c.Get("user_id")
		userID := userIDVal.(uint)

		var req struct {
			Password string `json:"password"` // required for non-OAuth users
			Confirm  string `json:"confirm" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || req.Confirm != "DELETE MY ACCOUNT" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": `To confirm deletion, set "confirm" to "DELETE MY ACCOUNT"`,
			})
			return
		}

		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}

		// Block deletion if pending payouts exist (funds would be lost)
		var pendingPayouts int64
		db.Model(&models.Payout{}).
			Where("user_id = ? AND status IN ('pending','processing')", userID).
			Count(&pendingPayouts)
		if pendingPayouts > 0 {
			c.JSON(http.StatusConflict, gin.H{
				"error": "You have pending payouts. Please wait for them to complete before deleting your account.",
			})
			return
		}

		tx := db.Begin()
		defer func() {
			if r := recover(); r != nil {
				tx.Rollback()
			}
		}()

		// Anonymise PII — preserve the row for relational integrity of transaction history
		anonymisedEmail := fmt.Sprintf("deleted_%d@deleted.invalid", userID)
		anonymisedUsername := fmt.Sprintf("deleted_user_%d", userID)
		empty := ""

		updates := map[string]interface{}{
			"email":              anonymisedEmail,
			"username":           anonymisedUsername,
			"password_hash":      empty,
			"avatar_url":         empty,
			"bio":                empty,
			"date_of_birth":      nil,
			"oauth_provider":     nil,
			"oauth_provider_id":  nil,
			"two_factor_secret":  nil,
			"two_factor_enabled": false,
			"backup_codes":       nil,
			"last_login_ip":      nil,
			"country":            nil,
			"preferred_gateway":  nil,
			"main_room_id":       nil,
		}
		if err := tx.Model(&user).Updates(updates).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ DeleteAccount: failed to anonymise user %d: %v", userID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process account deletion"})
			return
		}

		// Delete payment accounts (no pending payouts, safe to remove)
		if err := tx.Where("user_id = ?", userID).Delete(&models.PaymentAccount{}).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ DeleteAccount: failed to delete payment accounts for user %d: %v", userID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process account deletion"})
			return
		}

		// Soft-delete the user record (sets deleted_at; GORM filters these from all future queries)
		if err := tx.Delete(&user).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ DeleteAccount: soft delete failed for user %d: %v", userID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process account deletion"})
			return
		}

		if err := tx.Commit().Error; err != nil {
			log.Printf("❌ DeleteAccount: commit failed for user %d: %v", userID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process account deletion"})
			return
		}

		// Blacklist the JWT so the current token stops working immediately
		tokenStr := extractBearerToken(c)
		if tokenStr != "" {
			_ = models.BlacklistToken(db, tokenStr, time.Now().Add(24*time.Hour))
		}

		log.Printf("✅ Account deleted (anonymised): user %d", userID)

		go func(email, username string) {
			emailSvc := services.NewEmailService()
			if err := emailSvc.SendAccountDeletionEmail(email, username); err != nil {
				log.Printf("⚠️ Account deletion email failed for user %d: %v", userID, err)
			}
		}(user.Email, user.Username)

		// Log the deletion for compliance audit trail
		LogAdminAction(db, c, "user_account_deletion", "user", userID, map[string]interface{}{
			"reason":     "user_requested_deletion",
			"ndpr_right": "right_to_erasure",
		}, true, "")

		c.JSON(http.StatusOK, gin.H{
			"message": "Your account has been deleted. Financial records are retained as required by CBN regulations.",
		})
	}
}

// extractBearerToken pulls the raw JWT from the Authorization header.
func extractBearerToken(c *gin.Context) string {
	auth := c.GetHeader("Authorization")
	if len(auth) > 7 && auth[:7] == "Bearer " {
		return auth[7:]
	}
	return ""
}
