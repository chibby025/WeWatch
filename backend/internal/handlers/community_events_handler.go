package handlers

import (
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
)

// GET /api/community-events
// Returns public scheduled events + community requests for the feed.
// Query param: since=<RFC3339 timestamp> — used to compute has_new for the feed gate.
// Does NOT require authentication — guests see G/PG/Educational/Religious content by default.
func GetCommunityEventsHandler(c *gin.Context) {
	userIDValue, userExists := c.Get("user_id")
	var currentUserID uint
	if userExists {
		if id, ok := userIDValue.(uint); ok {
			currentUserID = id
		}
	}

	sinceStr := c.Query("since")
	var sinceTime time.Time
	if sinceStr != "" {
		if t, err := time.Parse(time.RFC3339, sinceStr); err == nil {
			sinceTime = t
		}
	}

	// Default guest-safe ratings; replaced by user prefs when authenticated.
	allowedRatings := []string{"G", "PG", "Educational", "Religious"}
	primaryRating := "G"

	if currentUserID > 0 {
		// Load viewer's age flags + preferences — same pattern as GetAllActiveSessionsHandler.
		var viewerSettings models.UserSettings
		DB.Where("user_id = ?", currentUserID).First(&viewerSettings)
		// Lazy yearly recompute if flags are stale.
		if viewerSettings.AgeFlagsYear != time.Now().Year() {
			var viewerUser models.User
			if err := DB.Select("id, date_of_birth").First(&viewerUser, currentUserID).Error; err == nil {
				saveAgeFlagsForUser(DB, currentUserID, viewerUser.GetAge())
				DB.Where("user_id = ?", currentUserID).First(&viewerSettings)
			}
		}

		// Build allowed ratings list using the same canViewContentRating gate as posts + sessions.
		allRatings := []string{"G", "PG", "Educational", "Religious", "13+", "16+", "18+", "Mature"}
		allowedRatings = nil
		for _, r := range allRatings {
			if canViewContentRating(r, viewerSettings) {
				allowedRatings = append(allowedRatings, r)
			}
		}
		if viewerSettings.PrimaryRating != "" {
			primaryRating = viewerSettings.PrimaryRating
		}

		// Preference filter — intersect the age-based allow-list with the
		// viewer's own "what do you want to see" set (getPreferredContentRatings,
		// posts.go). Same layer, same reasoning as posts.go/session_helpers.go:
		// a rating already allowed by age can still be excluded here if the
		// user simply didn't opt into it. Empty preference set = don't filter
		// (leave allowedRatings as the age-only list).
		if preferred := getPreferredContentRatings(DB, currentUserID); len(preferred) > 0 {
			preferredSet := make(map[string]bool, len(preferred))
			for _, r := range preferred {
				preferredSet[r] = true
			}
			intersected := allowedRatings[:0:0]
			for _, r := range allowedRatings {
				if preferredSet[r] {
					intersected = append(intersected, r)
				}
			}
			allowedRatings = intersected
		}
	}

	// Scheduled events: public, not yet started, within next 14 days, filtered by content rating
	now := time.Now()
	cutoff := now.Add(14 * 24 * time.Hour)

	type ScheduledEventItem struct {
		ID              uint       `json:"id"`
		RoomID          uint       `json:"room_id"`
		RoomName        string     `json:"room_name"`
		RoomImageURL    string     `json:"room_image_url"`
		Title           string     `json:"title"`
		Description     string     `json:"description"`
		StartTime       time.Time  `json:"start_time"`
		WatchType       string     `json:"watch_type"`
		ContentRating   string     `json:"content_rating"`
		IsPaid          bool       `json:"is_paid"`
		TicketPriceTokens int      `json:"ticket_price_tokens"`
		RSVPCount       int        `json:"rsvp_count"`
		TicketsSold     int        `json:"tickets_sold"`
		TrailerURL      string     `json:"trailer_url,omitempty"`
		HostUsername    string     `json:"host_username"`
		HostAvatarURL   string     `json:"host_avatar_url"`
		CreatedAt       time.Time  `json:"created_at"`
	}

	var scheduledEvents []ScheduledEventItem
	err := DB.Raw(`
		SELECT
			se.id,
			se.room_id,
			r.name AS room_name,
			COALESCE(r.image_url, '') AS room_image_url,
			se.title,
			COALESCE(se.description, '') AS description,
			se.start_time,
			se.watch_type,
			se.content_rating,
			se.is_paid,
			se.ticket_price_tokens,
			se.rsvp_count,
			se.tickets_sold,
			COALESCE(se.trailer_url, '') AS trailer_url,
			u.username AS host_username,
			COALESCE(u.avatar_url, '') AS host_avatar_url,
			se.created_at
		FROM scheduled_events se
		JOIN rooms r ON r.id = se.room_id AND r.deleted_at IS NULL AND r.is_public = true
		JOIN users u ON u.id = se.host_user_id AND u.deleted_at IS NULL
		WHERE se.deleted_at IS NULL
		  AND se.start_time > ?
		  AND se.start_time < ?
		  AND se.content_rating IN ?
		ORDER BY
			CASE WHEN se.content_rating = ? THEN 0 ELSE 1 END,
			se.start_time ASC
		LIMIT 50
	`, now, cutoff, allowedRatings, primaryRating).Scan(&scheduledEvents).Error

	if err != nil {
		log.Printf("GetCommunityEventsHandler: scheduled events query error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch events"})
		return
	}
	if scheduledEvents == nil {
		scheduledEvents = []ScheduledEventItem{}
	}

	// Community requests: open or claimed, filtered by content rating, sorted by upvotes desc
	type ClaimItem struct {
		HostUserID    uint   `json:"host_user_id"`
		HostUsername  string `json:"host_username"`
		HostAvatarURL string `json:"host_avatar_url"`
		RoomID        uint   `json:"room_id"`
		RoomName      string `json:"room_name"`
		RoomImageURL  string `json:"room_image_url"`
	}

	type RequestItem struct {
		ID                  uint        `json:"id"`
		UserID              uint        `json:"user_id"`
		RequesterName       string      `json:"requester_username"`
		RequesterAvatarURL  string      `json:"requester_avatar_url"`
		Title               string      `json:"title"`
		ContentRating       string      `json:"content_rating"`
		Description         string      `json:"description"`
		PreferredDate       *time.Time  `json:"preferred_date,omitempty"`
		Status              string      `json:"status"`
		UpvoteCount         int         `json:"upvote_count"`
		HasUpvoted          bool        `json:"has_upvoted"`
		ImageURL            string      `json:"image_url,omitempty"`
		Claims              []ClaimItem `json:"claims"`
		CreatedAt           time.Time   `json:"created_at"`
	}

	var rawRequests []models.CommunityRequest
	err = DB.
		Preload("User", func(db *gorm.DB) *gorm.DB {
			return db.Select("id, username, avatar_url")
		}).
		Preload("Claims", func(db *gorm.DB) *gorm.DB {
			return db.Where("community_request_claims.id IS NOT NULL")
		}).
		Preload("Claims.Host", func(db *gorm.DB) *gorm.DB {
			return db.Select("id, username, avatar_url")
		}).
		Preload("Claims.Room", func(db *gorm.DB) *gorm.DB {
			return db.Select("id, name, content_rating, image_url")
		}).
		Where("status IN ? AND content_rating IN ?", []string{"open", "claimed"}, allowedRatings).
		Order(gorm.Expr("CASE WHEN content_rating = ? THEN 0 ELSE 1 END, upvote_count DESC, created_at DESC", primaryRating)).
		Limit(50).
		Find(&rawRequests).Error

	if err != nil {
		log.Printf("GetCommunityEventsHandler: requests query error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch requests"})
		return
	}

	// Batch-load upvote status — only meaningful for authenticated users
	var requestIDs []uint
	for _, r := range rawRequests {
		requestIDs = append(requestIDs, r.ID)
	}
	upvotedSet := map[uint]bool{}
	if currentUserID > 0 && len(requestIDs) > 0 {
		var upvotedIDs []uint
		DB.Model(&models.CommunityRequestUpvote{}).
			Where("user_id = ? AND request_id IN ?", currentUserID, requestIDs).
			Pluck("request_id", &upvotedIDs)
		for _, rid := range upvotedIDs {
			upvotedSet[rid] = true
		}
	}

	requests := make([]RequestItem, 0, len(rawRequests))
	for _, r := range rawRequests {
		item := RequestItem{
			ID:            r.ID,
			UserID:        r.UserID,
			Title:         r.Title,
			ContentRating: r.ContentRating,
			Description:   r.Description,
			PreferredDate: r.PreferredDate,
			Status:        r.Status,
			UpvoteCount:   r.UpvoteCount,
			HasUpvoted:    upvotedSet[r.ID],
			ImageURL:      r.ImageURL,
			Claims:        []ClaimItem{},
			CreatedAt:     r.CreatedAt,
		}
		if r.User != nil {
			item.RequesterName = r.User.Username
			item.RequesterAvatarURL = r.User.AvatarURL
		}
		for _, cl := range r.Claims {
			ci := ClaimItem{HostUserID: cl.HostUserID}
			if cl.Host != nil {
				ci.HostUsername = cl.Host.Username
				ci.HostAvatarURL = cl.Host.AvatarURL
			}
			if cl.Room != nil {
				ci.RoomID = cl.Room.ID
				ci.RoomName = cl.Room.Name
				ci.RoomImageURL = cl.Room.ImageURL
			}
			item.Claims = append(item.Claims, ci)
		}
		requests = append(requests, item)
	}

	// has_new: true if any item was created after sinceTime
	hasNew := true
	if !sinceTime.IsZero() {
		hasNew = false
		for _, se := range scheduledEvents {
			if se.CreatedAt.After(sinceTime) {
				hasNew = true
				break
			}
		}
		if !hasNew {
			for _, req := range requests {
				if req.CreatedAt.After(sinceTime) {
					hasNew = true
					break
				}
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"scheduled_events": scheduledEvents,
		"requests":         requests,
		"has_new":          hasNew,
	})
}

// POST /api/community-requests
// Create a new community request.
type CreateCommunityRequestBody struct {
	Title         string  `json:"title" binding:"required,max=200"`
	ContentRating string  `json:"content_rating" binding:"required"`
	Description   string  `json:"description"`
	PreferredDate *string `json:"preferred_date"` // ISO date string YYYY-MM-DD
	ImageURL      string  `json:"image_url"`
}

func CreateCommunityRequestHandler(c *gin.Context) {
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	currentUserID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	var body CreateCommunityRequestBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	validRatings := map[string]bool{
		"G": true, "PG": true, "Educational": true, "Religious": true,
		"13+": true, "16+": true, "18+": true, "Mature": true,
	}
	if !validRatings[body.ContentRating] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid content_rating"})
		return
	}

	req := models.CommunityRequest{
		UserID:        currentUserID,
		Title:         body.Title,
		ContentRating: body.ContentRating,
		Description:   body.Description,
		Status:        "open",
		ImageURL:      body.ImageURL,
	}

	if body.PreferredDate != nil && *body.PreferredDate != "" {
		if t, err := time.Parse("2006-01-02", *body.PreferredDate); err == nil {
			req.PreferredDate = &t
		}
	}

	if err := DB.Create(&req).Error; err != nil {
		log.Printf("CreateCommunityRequestHandler: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"request": req})
}

// POST /api/community-requests/:id/upvote
// Toggle upvote on a community request.
func ToggleCommunityRequestUpvoteHandler(c *gin.Context) {
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	currentUserID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	reqID64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid id"})
		return
	}
	requestID := uint(reqID64)

	var communityReq models.CommunityRequest
	if err := DB.First(&communityReq, requestID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Request not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	var existing models.CommunityRequestUpvote
	err = DB.Where("request_id = ? AND user_id = ?", requestID, currentUserID).First(&existing).Error

	if err == nil {
		// Remove upvote
		DB.Delete(&existing)
		DB.Model(&communityReq).UpdateColumn("upvote_count", gorm.Expr("GREATEST(upvote_count - 1, 0)"))
		DB.First(&communityReq, requestID)
		c.JSON(http.StatusOK, gin.H{"has_upvoted": false, "upvote_count": communityReq.UpvoteCount})
		return
	}

	if err != gorm.ErrRecordNotFound {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Add upvote
	upvote := models.CommunityRequestUpvote{
		RequestID: requestID,
		UserID:    currentUserID,
		CreatedAt: time.Now(),
	}
	if err := DB.Create(&upvote).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upvote"})
		return
	}
	DB.Model(&communityReq).UpdateColumn("upvote_count", gorm.Expr("upvote_count + 1"))
	DB.First(&communityReq, requestID)
	c.JSON(http.StatusOK, gin.H{"has_upvoted": true, "upvote_count": communityReq.UpvoteCount})
}

// POST /api/community-requests/:id/claim
// Host claims a community request — returns pre-fill data for ScheduleEventModal.
// Creates a CommunityRequestClaim row; host is expected to then create a ScheduledEvent manually.
func ClaimCommunityRequestHandler(c *gin.Context) {
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	hostID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	reqID64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid id"})
		return
	}
	requestID := uint(reqID64)

	var communityReq models.CommunityRequest
	if err := DB.First(&communityReq, requestID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Request not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	if communityReq.Status == "closed" {
		c.JSON(http.StatusConflict, gin.H{"error": "This request has been closed"})
		return
	}

	// Host must own a room
	var hostRoom models.Room
	if err := DB.Where("host_id = ? AND deleted_at IS NULL AND is_temporary = false", hostID).
		First(&hostRoom).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusForbidden, gin.H{"error": "You must own a room to claim a request"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Check if already claimed by this host
	var existing models.CommunityRequestClaim
	err = DB.Where("request_id = ? AND host_user_id = ?", requestID, hostID).First(&existing).Error
	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "You have already claimed this request"})
		return
	}
	if err != gorm.ErrRecordNotFound {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	claim := models.CommunityRequestClaim{
		RequestID:  requestID,
		HostUserID: hostID,
		RoomID:     hostRoom.ID,
		ClaimedAt:  time.Now(),
	}
	if err := DB.Create(&claim).Error; err != nil {
		log.Printf("ClaimCommunityRequestHandler: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to claim request"})
		return
	}

	// Update request status to claimed if it was open
	if communityReq.Status == "open" {
		DB.Model(&communityReq).UpdateColumn("status", "claimed")
	}

	// Return pre-fill data for ScheduleEventModal
	prefill := gin.H{
		"title":                communityReq.Title,
		"description":          communityReq.Description,
		"content_rating":       communityReq.ContentRating,
		"preferred_date":       communityReq.PreferredDate,
		"room_id":              hostRoom.ID,
		"community_request_id": communityReq.ID,
		"claim_id":             claim.ID,
	}

	c.JSON(http.StatusCreated, gin.H{
		"claim":   claim,
		"prefill": prefill,
	})
}

// POST /api/community-requests/upload-image
// Eager image upload for MakeRequestSheet. Accepts image/* up to 5 MB.
// Returns { "image_url": "..." }.
func UploadCommunityRequestImageHandler(c *gin.Context) {
	if err := c.Request.ParseMultipartForm(5 << 20); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File too large or invalid form"})
		return
	}

	file, header, err := c.Request.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Image file required"})
		return
	}
	defer file.Close()

	if header.Size > 5<<20 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Image must be under 5 MB"})
		return
	}

	contentType := header.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "image/") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Only image files are accepted"})
		return
	}

	imageURL, err := utils.UploadMultipartFileToBunnyCDN(file, header)
	if err != nil {
		log.Printf("UploadCommunityRequestImageHandler: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Upload failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"image_url": imageURL})
}

// GET /api/admin/community-analytics — super-admin community request stats
func GetCommunityAnalyticsHandler(c *gin.Context) {
	type StatusRow struct {
		Status string `gorm:"column:status"`
		Count  int    `gorm:"column:count"`
	}
	var statusRows []StatusRow
	DB.Raw("SELECT status, COUNT(*) AS count FROM community_requests GROUP BY status").Scan(&statusRows)
	statusMap := map[string]int{}
	for _, r := range statusRows {
		statusMap[r.Status] = r.Count
	}

	var totalUpvotes int64
	DB.Model(&models.CommunityRequestUpvote{}).Count(&totalUpvotes)

	var totalClaims int64
	DB.Model(&models.CommunityRequestClaim{}).Count(&totalClaims)

	type TopRequest struct {
		ID            uint   `json:"id"             gorm:"column:id"`
		Title         string `json:"title"          gorm:"column:title"`
		ContentRating string `json:"content_rating" gorm:"column:content_rating"`
		UpvoteCount   int    `json:"upvote_count"   gorm:"column:upvote_count"`
		Status        string `json:"status"         gorm:"column:status"`
		ClaimCount    int    `json:"claim_count"    gorm:"column:claim_count"`
	}
	var topRequests []TopRequest
	DB.Raw(`
		SELECT cr.id, cr.title, cr.content_rating, cr.upvote_count, cr.status,
		       COUNT(crc.id) AS claim_count
		FROM community_requests cr
		LEFT JOIN community_request_claims crc ON crc.request_id = cr.id
		GROUP BY cr.id
		ORDER BY cr.upvote_count DESC
		LIMIT 10
	`).Scan(&topRequests)

	type RatingRow struct {
		Rating string `json:"content_rating" gorm:"column:content_rating"`
		Count  int    `json:"count"          gorm:"column:count"`
	}
	var byRating []RatingRow
	DB.Raw("SELECT content_rating, COUNT(*) AS count FROM community_requests GROUP BY content_rating ORDER BY count DESC").Scan(&byRating)

	c.JSON(http.StatusOK, gin.H{
		"totals": gin.H{
			"open":    statusMap["open"],
			"claimed": statusMap["claimed"],
			"closed":  statusMap["closed"],
			"total":   statusMap["open"] + statusMap["claimed"] + statusMap["closed"],
		},
		"total_upvotes": totalUpvotes,
		"total_claims":  totalClaims,
		"top_requests":  topRequests,
		"by_rating":     byRating,
	})
}
