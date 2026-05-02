// backend/internal/handlers/ad_campaign.go
package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"wewatch-backend/internal/models"
)

// CreateAdCampaign creates a new ad campaign (authenticated users)
func CreateAdCampaign(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var input struct {
		CampaignName        string    `json:"campaign_name" binding:"required"`
		AdType              string    `json:"ad_type" binding:"required"`
		Budget              float64   `json:"budget" binding:"required,gt=0"`
		StartDate           time.Time `json:"start_date" binding:"required"`
		EndDate             time.Time `json:"end_date" binding:"required"`
		TargetAgeMin        int       `json:"target_age_min"`
		TargetAgeMax        int       `json:"target_age_max"`
		TargetContentRating string    `json:"target_content_rating"`
		MediaURL            string    `json:"media_url" binding:"required"`
		ThumbnailURL        string    `json:"thumbnail_url"`
		ClickURL            string    `json:"click_url" binding:"required"`
		AdDuration          int       `json:"ad_duration"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate budget (minimum $50)
	if input.Budget < 50 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Minimum budget is $50"})
		return
	}

	// Validate dates
	if input.EndDate.Before(input.StartDate) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "End date must be after start date"})
		return
	}

	// Calculate CPM (assuming $2 CPM for now)
	cpm := 2.0
	estimatedImpressions := int64((input.Budget / cpm) * 1000)

	campaign := models.AdCampaign{
		AdvertiserID:        uint(userID.(float64)),
		CampaignName:        input.CampaignName,
		Budget:              input.Budget,
		SpentAmount:         0,
		Status:              "pending_review",
		StartDate:           input.StartDate,
		EndDate:             input.EndDate,
		TargetAgeMin:        input.TargetAgeMin,
		TargetAgeMax:        input.TargetAgeMax,
		TargetContentRating: input.TargetContentRating,
		AdType:              input.AdType,
		MediaURL:            input.MediaURL,
		ThumbnailURL:        input.ThumbnailURL,
		ClickURL:            input.ClickURL,
		AdDuration:          input.AdDuration,
		CPM:                 cpm,
		Impressions:         0,
		Clicks:              0,
		CTR:                 0,
		CreatedAt:           time.Now(),
		UpdatedAt:           time.Now(),
	}

	if err := DB.Create(&campaign).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create campaign"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":              "Campaign created successfully",
		"campaign":             campaign,
		"estimated_impressions": estimatedImpressions,
	})
}

// GetUserCampaigns retrieves all campaigns for the current user
func GetUserCampaigns(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var campaigns []models.AdCampaign
	if err := DB.Where("advertiser_id = ?", userID).
		Order("created_at DESC").
		Preload("ApprovedBy").
		Find(&campaigns).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch campaigns"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"campaigns": campaigns})
}

// GetAllCampaigns retrieves all campaigns (super admin only)
func GetAllCampaigns(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var user models.User
	if err := DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}

	if !user.IsSuperAdmin() {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only super admins can view all campaigns"})
		return
	}

	status := c.Query("status")
	var campaigns []models.AdCampaign
	query := DB.Order("created_at DESC").Preload("Advertiser").Preload("ApprovedBy")

	if status != "" {
		query = query.Where("status = ?", status)
	}

	if err := query.Find(&campaigns).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch campaigns"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"campaigns": campaigns})
}

// UpdateCampaignStatus updates campaign status (super admin only)
func UpdateCampaignStatus(c *gin.Context) {
	userID, _ := c.Get("user_id")
	campaignID := c.Param("id")

	var user models.User
	if err := DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}

	if !user.IsSuperAdmin() {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only super admins can update campaign status"})
		return
	}

	var input struct {
		Status          string `json:"status" binding:"required"`
		RejectionReason string `json:"rejection_reason"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var campaign models.AdCampaign
	if err := DB.First(&campaign, campaignID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Campaign not found"})
		return
	}

	approvedByID := uint(userID.(float64))
	now := time.Now()
	
	campaign.Status = input.Status
	campaign.RejectionReason = input.RejectionReason
	campaign.ApprovedByID = &approvedByID
	campaign.ApprovedAt = &now
	campaign.UpdatedAt = now

	if err := DB.Save(&campaign).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update campaign"})
		return
	}

	// Log audit event
	LogAdminAction(DB, c, "update_campaign_status", "ad_campaign", campaign.ID, gin.H{
		"campaign_name": campaign.CampaignName,
		"new_status":    input.Status,
	}, true, "")

	c.JSON(http.StatusOK, gin.H{
		"message":  "Campaign updated successfully",
		"campaign": campaign,
	})
}

// TrackAdImpression records an ad impression
func TrackAdImpression(c *gin.Context) {
	campaignID := c.Param("id")

	var input struct {
		RoomID       *uint  `json:"room_id"`
		SessionID    string `json:"session_id"`
		Clicked      bool   `json:"clicked"`
		ViewDuration int    `json:"view_duration"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get campaign
	var campaign models.AdCampaign
	if err := DB.First(&campaign, campaignID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Campaign not found"})
		return
	}

	// Check if campaign is active
	if campaign.Status != "active" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Campaign is not active"})
		return
	}

	// Get user ID if authenticated
	var userID *uint
	if uid, exists := c.Get("user_id"); exists {
		id := uint(uid.(float64))
		userID = &id
	}

	// Create impression record
	impression := models.AdImpression{
		CampaignID:   campaign.ID,
		UserID:       userID,
		RoomID:       input.RoomID,
		SessionID:    input.SessionID,
		IPAddress:    c.ClientIP(),
		UserAgent:    c.GetHeader("User-Agent"),
		Clicked:      input.Clicked,
		ViewDuration: input.ViewDuration,
		CreatedAt:    time.Now(),
	}

	if err := DB.Create(&impression).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to track impression"})
		return
	}

	// Update campaign metrics
	if input.Clicked {
		campaign.Clicks++
	}
	campaign.Impressions++
	
	// Calculate CTR
	if campaign.Impressions > 0 {
		campaign.CTR = (float64(campaign.Clicks) / float64(campaign.Impressions)) * 100
	}

	// Calculate spent amount based on CPM
	campaign.SpentAmount = (float64(campaign.Impressions) / 1000) * campaign.CPM

	// Check if budget exceeded
	if campaign.SpentAmount >= campaign.Budget {
		campaign.Status = "completed"
	}

	DB.Save(&campaign)

	c.JSON(http.StatusOK, gin.H{
		"message":     "Impression tracked",
		"impressions": campaign.Impressions,
		"clicks":      campaign.Clicks,
		"ctr":         campaign.CTR,
	})
}

// GetActiveCampaigns retrieves active campaigns for ad display
func GetActiveCampaigns(c *gin.Context) {
	adType := c.Query("ad_type")     // 'banner', 'video_preroll', 'sponsored_room'
	_ = c.Query("room_id")           // Reserved for future room-specific targeting
	userAge := c.Query("user_age")
	contentRating := c.Query("content_rating")

	now := time.Now()
	query := DB.Where("status = ? AND start_date <= ? AND end_date >= ?", "active", now, now)

	if adType != "" {
		query = query.Where("ad_type = ?", adType)
	}

	// Age targeting
	if userAge != "" {
		age, _ := strconv.Atoi(userAge)
		query = query.Where("target_age_min <= ? AND target_age_max >= ?", age, age)
	}

	// Content rating targeting
	if contentRating != "" {
		query = query.Where("target_content_rating = ? OR target_content_rating = ''", contentRating)
	}

	// Check if budget not exceeded
	query = query.Where("spent_amount < budget")

	var campaigns []models.AdCampaign
	if err := query.Order("RANDOM()").Limit(5).Find(&campaigns).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch campaigns"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"campaigns": campaigns})
}

// CheckAdEligibility checks if a user is eligible to see an ad (frequency capping: 1 per hour)
func CheckAdEligibility(c *gin.Context) {
	userIDStr := c.Query("user_id")
	sessionID := c.Query("session_id")

	if userIDStr == "" || sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id and session_id required"})
		return
	}

	userID, err := strconv.ParseUint(userIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user_id"})
		return
	}

	// Find last ad impression for this user in this session
	var lastImpression models.AdImpression
	err = DB.Where("user_id = ? AND session_id = ?", uint(userID), sessionID).
		Order("created_at DESC").
		First(&lastImpression).Error

	if err != nil {
		// No previous impression found - eligible
		c.JSON(http.StatusOK, gin.H{
			"eligible":       true,
			"time_remaining": 0,
		})
		return
	}

	// Check if 1 hour has passed
	oneHour := time.Hour
	timeSinceLastAd := time.Since(lastImpression.CreatedAt)

	if timeSinceLastAd >= oneHour {
		// Eligible - more than 1 hour has passed
		c.JSON(http.StatusOK, gin.H{
			"eligible":       true,
			"time_remaining": 0,
		})
	} else {
		// Not eligible yet - calculate remaining time
		remaining := oneHour - timeSinceLastAd
		c.JSON(http.StatusOK, gin.H{
			"eligible":       false,
			"time_remaining": int(remaining.Seconds()),
		})
	}
}

// GetInSessionAd returns the highest CPM video ad for in-session 80-20 display
func GetInSessionAd(c *gin.Context) {
	userAge := c.Query("user_age")
	contentRating := c.Query("content_rating")
	userIDStr := c.Query("user_id")
	sessionID := c.Query("session_id")

	// Check frequency cap first
	if userIDStr != "" && sessionID != "" {
		userID, err := strconv.ParseUint(userIDStr, 10, 32)
		if err == nil {
			var lastImpression models.AdImpression
			err = DB.Where("user_id = ? AND session_id = ?", uint(userID), sessionID).
				Order("created_at DESC").
				First(&lastImpression).Error

			if err == nil {
				// Found previous impression - check if 1 hour has passed
				oneHour := time.Hour
				timeSinceLastAd := time.Since(lastImpression.CreatedAt)

				if timeSinceLastAd < oneHour {
					// Not eligible yet - return empty
					c.JSON(http.StatusOK, gin.H{
						"ad":          nil,
						"eligible":    false,
						"message":     "Frequency cap: 1 ad per hour",
						"retry_after": int((oneHour - timeSinceLastAd).Seconds()),
					})
					return
				}
			}
		}
	}

	// Build query for active video ads
	now := time.Now()
	query := DB.Where("status = ? AND start_date <= ? AND end_date >= ?", "active", now, now).
		Where("ad_type IN (?)", []string{"video_preroll", "video_inline"}) // Support both types

	// Age targeting
	if userAge != "" {
		age, _ := strconv.Atoi(userAge)
		query = query.Where("target_age_min <= ? AND target_age_max >= ?", age, age)
	}

	// Content rating targeting
	if contentRating != "" {
		query = query.Where("target_content_rating = ? OR target_content_rating = ''", contentRating)
	}

	// Check if budget not exceeded
	query = query.Where("spent_amount < budget")

	// Order by CPM (highest paying ads first)
	var campaign models.AdCampaign
	if err := query.Order("cpm DESC").First(&campaign).Error; err != nil {
		// No ads available
		c.JSON(http.StatusOK, gin.H{
			"ad":       nil,
			"eligible": true,
			"message":  "No ads available",
		})
		return
	}

	// Return ad with eligibility confirmed
	c.JSON(http.StatusOK, gin.H{
		"ad": gin.H{
			"id":           campaign.ID,
			"media_url":    campaign.MediaURL,
			"click_url":    campaign.ClickURL,
			"duration":     campaign.AdDuration,
			"thumbnail":    campaign.ThumbnailURL,
			"campaign_name": campaign.CampaignName,
		},
		"eligible": true,
		"message":  "Ad available",
	})
}

// GetRoomTVAd returns a text/banner/image ad for RoomTV display (GET /api/ads/roomtv)
func GetRoomTVAd(c *gin.Context) {
	roomIDStr := c.Query("room_id")
	userIDStr := c.Query("user_id")
	
	if roomIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "room_id required"})
		return
	}
	
	roomID, err := strconv.ParseUint(roomIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room_id"})
		return
	}
	
	// Check if ads are enabled globally and for RoomTV
	if !IsAdTypeEnabled(DB, models.AdSettingRoomTVAds) {
		c.JSON(http.StatusOK, gin.H{"ad": nil, "message": "RoomTV ads disabled"})
		return
	}
	
	// Get room to check last ad shown time
	var room models.Room
	if err := DB.First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}
	
	// Check 1-hour frequency cap for this room
	if room.LastAdShownAt != nil {
		timeSinceLastAd := time.Since(*room.LastAdShownAt)
		if timeSinceLastAd < time.Hour {
			remainingMinutes := int((time.Hour - timeSinceLastAd).Minutes())
			c.JSON(http.StatusOK, gin.H{
				"ad":      nil,
				"message": "Frequency cap not met",
				"remaining_minutes": remainingMinutes,
			})
			return
		}
	}
	
	// Get user age for targeting (if provided)
	var userAge int
	if userIDStr != "" {
		if uid, err := strconv.ParseUint(userIDStr, 10, 32); err == nil {
			var user models.User
			if err := DB.First(&user, uid).Error; err == nil {
				userAge = user.GetAge()
			}
		}
	}
	
	// Find active campaigns for RoomTV (text, banner, image ads only - NO videos)
	now := time.Now()
	query := DB.Where("status = ? AND start_date <= ? AND end_date >= ?", "active", now, now).
		Where("ad_type IN ?", []string{"banner", "text", "image"}).
		Where("spent_amount < budget") // Budget not exceeded
	
	// Age targeting (if user age available)
	if userAge > 0 {
		query = query.Where("(target_age_min = 0 OR target_age_min <= ?) AND (target_age_max = 0 OR target_age_max >= ?)", userAge, userAge)
	}
	
	// Content rating targeting (room content rating)
	query = query.Where("target_content_rating = ? OR target_content_rating = ''", room.ContentRating)
	
	// Order by highest CPM (most valuable ad first)
	query = query.Order("cpm DESC")
	
	var campaign models.AdCampaign
	if err := query.First(&campaign).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"ad": nil, "message": "No ads available"})
		return
	}
	
	// Update room's last ad shown time
	now = time.Now()
	room.LastAdShownAt = &now
	DB.Save(&room)
	
	// Return ad data
	c.JSON(http.StatusOK, gin.H{
		"ad": gin.H{
			"id":              campaign.ID,
			"advertiser_name": campaign.CampaignName,
			"title":           campaign.CampaignName,
			"media_url":       campaign.MediaURL,
			"thumbnail_url":   campaign.ThumbnailURL,
			"click_url":       campaign.ClickURL,
			"duration":        15, // Default 15 seconds for RoomTV display
			"animation":       "scrollLeft", // Default animation
			"ad_type":         campaign.AdType,
		},
		"message": "Ad available for RoomTV",
	})
}
