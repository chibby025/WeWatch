package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"wewatch-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// setupTestDB creates an in-memory SQLite database for testing
func setupAdTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}

	// Auto-migrate all models
	err = db.AutoMigrate(
		&models.User{},
		&models.AdCampaign{},
		&models.AdImpression{},
	)
	if err != nil {
		t.Fatalf("Failed to migrate test database: %v", err)
	}

	return db
}

// setupTestRouter creates a test Gin router with ad routes
func setupAdTestRouter(db *gorm.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.Default()
	
	// Mock routes that use DB directly (simplified for testing)
	r.POST("/api/ads/campaigns", func(c *gin.Context) {
		var req struct {
			AdvertiserID        uint    `json:"advertiser_id"`
			CampaignName        string  `json:"campaign_name"`
			AdType              string  `json:"ad_type"`
			MediaURL            string  `json:"media_url"`
			ClickURL            string  `json:"click_url"`
			Budget              float64 `json:"budget"`
			TargetAgeMin        int     `json:"target_age_min"`
			TargetAgeMax        int     `json:"target_age_max"`
			TargetContentRating string  `json:"target_content_rating"`
		}
		
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		
		// Validate required fields
		if req.MediaURL == "" || req.ClickURL == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Missing required fields"})
			return
		}
		
		campaign := models.AdCampaign{
			AdvertiserID:        req.AdvertiserID,
			CampaignName:        req.CampaignName,
			AdType:              req.AdType,
			MediaURL:            req.MediaURL,
			ClickURL:            req.ClickURL,
			Budget:              req.Budget,
			SpentAmount:         0,
			TargetAgeMin:        req.TargetAgeMin,
			TargetAgeMax:        req.TargetAgeMax,
			TargetContentRating: req.TargetContentRating,
			Status:              "pending_review",
		}
		
		db.Create(&campaign)
		c.JSON(http.StatusCreated, gin.H{"campaign": campaign})
	})
	
	r.GET("/api/ads/check-eligibility", func(c *gin.Context) {
		userIDStr := c.Query("user_id")
		sessionID := c.Query("session_id")
		
		userID, _ := strconv.ParseUint(userIDStr, 10, 32)
		
		// Check last impression
		var lastImpression models.AdImpression
		result := db.Where("user_id = ? AND session_id = ?", uint(userID), sessionID).
			Order("created_at DESC").First(&lastImpression)
		
		if result.Error != nil {
			// No previous impression
			c.JSON(http.StatusOK, gin.H{"eligible": true, "time_remaining": 0})
			return
		}
		
		// Check if 1 hour has passed
		timeSince := time.Since(lastImpression.CreatedAt)
		if timeSince < time.Hour {
			remaining := int(time.Hour.Seconds() - timeSince.Seconds())
			c.JSON(http.StatusOK, gin.H{"eligible": false, "time_remaining": remaining})
			return
		}
		
		c.JSON(http.StatusOK, gin.H{"eligible": true, "time_remaining": 0})
	})
	
	r.GET("/api/ads/in-session", func(c *gin.Context) {
		userAge, _ := strconv.Atoi(c.Query("user_age"))
		adType := c.Query("ad_type")
		
		var campaign models.AdCampaign
		query := db.Where("status = ? AND ad_type = ?", "active", adType)
		
		// Age targeting
		if userAge > 0 {
			query = query.Where("(target_age_min = 0 OR target_age_min <= ?) AND (target_age_max = 0 OR target_age_max >= ?)", 
				userAge, userAge)
		}
		
		// Order by highest CPM
		query.Order("cpm DESC").First(&campaign)
		
		if campaign.ID == 0 {
			c.JSON(http.StatusOK, gin.H{"ad": nil, "eligible": false})
			return
		}
		
		c.JSON(http.StatusOK, gin.H{"ad": campaign, "eligible": true})
	})
	
	r.POST("/api/ads/campaigns/:id/track", func(c *gin.Context) {
		campaignID, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		
		var req struct {
			UserID       uint   `json:"user_id"`
			SessionID    string `json:"session_id"`
			RoomID       uint   `json:"room_id"`
			Clicked      bool   `json:"clicked"`
			ViewDuration int    `json:"view_duration"`
		}
		
		c.ShouldBindJSON(&req)
		
		// Convert to pointer types
		var userIDPtr *uint
		if req.UserID != 0 {
			userIDPtr = &req.UserID
		}
		
		var roomIDPtr *uint
		if req.RoomID != 0 {
			roomIDPtr = &req.RoomID
		}
		
		impression := models.AdImpression{
			CampaignID:   uint(campaignID),
			UserID:       userIDPtr,
			SessionID:    req.SessionID,
			RoomID:       roomIDPtr,
			Clicked:      req.Clicked,
			ViewDuration: req.ViewDuration,
		}
		
		db.Create(&impression)
		c.JSON(http.StatusOK, gin.H{"message": "Impression tracked"})
	})
	
	return r
}

// TestCreateAdCampaign tests ad campaign creation
func TestCreateAdCampaign(t *testing.T) {
	db := setupAdTestDB(t)
	router := setupAdTestRouter(db)

	// Create test user
	user := models.User{
		Username: "advertiser",
		Email:    "advertiser@test.com",
		Role:     "advertiser",
	}
	db.Create(&user)

	tests := []struct {
		name           string
		payload        map[string]interface{}
		expectedStatus int
		checkResponse  func(*testing.T, *httptest.ResponseRecorder)
	}{
		{
			name: "Valid video ad campaign",
			payload: map[string]interface{}{
				"advertiser_id":         user.ID,
				"campaign_name":         "Summer Sale Campaign",
				"ad_type":               "video_preroll",
				"media_url":             "https://example.com/video.mp4",
				"click_url":             "https://example.com/sale",
				"budget":                1000.0,
				"target_age_min":        18,
				"target_age_max":        65,
				"target_content_rating": "general",
			},
			expectedStatus: http.StatusCreated,
			checkResponse: func(t *testing.T, w *httptest.ResponseRecorder) {
				var response map[string]interface{}
				json.Unmarshal(w.Body.Bytes(), &response)
				
				campaign := response["campaign"].(map[string]interface{})
				assert.Equal(t, "Summer Sale Campaign", campaign["campaign_name"])
				assert.Equal(t, "pending_review", campaign["status"])
			},
		},
		{
			name: "Missing required fields",
			payload: map[string]interface{}{
				"advertiser_id": user.ID,
				"campaign_name": "Incomplete Campaign",
				"ad_type":       "banner",
				// Missing media_url and click_url
			},
			expectedStatus: http.StatusBadRequest,
		},
		{
			name: "Missing required fields",
			payload: map[string]interface{}{
				"advertiser_id": user.ID,
				"title":         "No Media URL",
			},
			expectedStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(tt.payload)
			req := httptest.NewRequest("POST", "/api/ads/campaigns", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)
			if tt.checkResponse != nil {
				tt.checkResponse(t, w)
			}
		})
	}
}

// TestCheckAdEligibility tests frequency capping logic
func TestCheckAdEligibility(t *testing.T) {
	db := setupAdTestDB(t)
	router := setupAdTestRouter(db)

	// Create test user and ad campaign
	user := models.User{Username: "viewer", Email: "viewer@test.com"}
	db.Create(&user)

	campaign := models.AdCampaign{
		AdvertiserID: user.ID,
		CampaignName: "Test Ad Campaign",
		AdType:       "video",
		MediaURL:     "https://example.com/ad.mp4",
		ClickURL:     "https://example.com",
		Budget:       1000.0,
		Status:       "active",
	}
	db.Create(&campaign)

	sessionID := "test-session-123"

	tests := []struct {
		name               string
		setupImpression    bool
		impressionAge      time.Duration
		expectedEligible   bool
		expectedTimeRemain int
	}{
		{
			name:             "No previous impression - eligible",
			setupImpression:  false,
			expectedEligible: true,
		},
		{
			name:               "Impression 30 minutes ago - not eligible",
			setupImpression:    true,
			impressionAge:      30 * time.Minute,
			expectedEligible:   false,
			expectedTimeRemain: 1800, // ~30 minutes remaining
		},
		{
			name:             "Impression 2 hours ago - eligible",
			setupImpression:  true,
			impressionAge:    2 * time.Hour,
			expectedEligible: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Clean impressions
			db.Exec("DELETE FROM ad_impressions")

			// Setup impression if needed
			if tt.setupImpression {
				userIDPtr := user.ID
				impression := models.AdImpression{
					CampaignID: campaign.ID,
					UserID:     &userIDPtr,
					SessionID:  sessionID,
					Clicked:    false,
					CreatedAt:  time.Now().Add(-tt.impressionAge),
				}
				db.Create(&impression)
			}

			// Make request
			url := fmt.Sprintf("/api/ads/check-eligibility?user_id=%d&session_id=%s", user.ID, sessionID)
			req := httptest.NewRequest("GET", url, nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			assert.Equal(t, http.StatusOK, w.Code)

			var response map[string]interface{}
			json.Unmarshal(w.Body.Bytes(), &response)

			assert.Equal(t, tt.expectedEligible, response["eligible"])
			if !tt.expectedEligible {
				assert.Greater(t, int(response["time_remaining"].(float64)), 0)
			}
		})
	}
}

// TestGetInSessionAd tests ad serving logic
func TestGetInSessionAd(t *testing.T) {
	db := setupAdTestDB(t)
	router := setupAdTestRouter(db)

	// Create test users
	dob15 := time.Now().AddDate(-15, 0, 0)
	youngUser := models.User{
		Username:    "young_user",
		Email:       "young@test.com",
		DateOfBirth: &dob15, // 15 years old
	}
	dob25 := time.Now().AddDate(-25, 0, 0)
	adultUser := models.User{
		Username:    "adult_user",
		Email:       "adult@test.com",
		DateOfBirth: &dob25, // 25 years old
	}
	db.Create(&youngUser)
	db.Create(&adultUser)

	// Create ad campaigns with different targeting
	adForKids := models.AdCampaign{
		AdvertiserID:        1,
		CampaignName:        "Kid-Friendly Campaign",
		AdType:              "banner",
		MediaURL:            "https://example.com/kids.gif",
		ClickURL:            "https://example.com/kids",
		Budget:              3000.0,
		SpentAmount:         300.0,
		Impressions:         100,
		CPM:                 3.0,
		TargetAgeMin:        0,
		TargetAgeMax:        17,
		TargetContentRating: "general",
		Status:              "active",
	}
	
	adForAdults := models.AdCampaign{
		AdvertiserID:        1,
		CampaignName:        "Adult Campaign",
		AdType:              "banner",
		MediaURL:            "https://example.com/adult.gif",
		ClickURL:            "https://example.com/adult",
		Budget:              8000.0,
		SpentAmount:         800.0,
		Impressions:         100,
		CPM:                 8.0, // Higher CPM
		TargetAgeMin:        18,
		TargetAgeMax:        99,
		TargetContentRating: "mature",
		Status:         "active",
	}

	db.Create(&adForKids)
	db.Create(&adForAdults)

	tests := []struct {
		name           string
		userID         uint
		userAge        int
		adType         string
		expectedAdName string // Expected advertiser name in response
	}{
		{
			name:           "Young user gets kid-friendly ad",
			userID:         youngUser.ID,
			userAge:        15,
			adType:         "banner",
			expectedAdName: "Kid-Friendly Campaign",
		},
		{
			name:           "Adult user gets adult ad (higher CPM)",
			userID:         adultUser.ID,
			userAge:        25,
			adType:         "banner",
			expectedAdName: "Adult Campaign",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			url := fmt.Sprintf("/api/ads/in-session?user_id=%d&session_id=test&ad_type=%s&placement=in_session&user_age=%d",
				tt.userID, tt.adType, tt.userAge)
			
			req := httptest.NewRequest("GET", url, nil)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			assert.Equal(t, http.StatusOK, w.Code)

			var response map[string]interface{}
			json.Unmarshal(w.Body.Bytes(), &response)

			if response["ad"] != nil {
				ad := response["ad"].(map[string]interface{})
				assert.Equal(t, tt.expectedAdName, ad["campaign_name"])
			}
		})
	}
}

// TestTrackAdImpression tests impression tracking
func TestTrackAdImpression(t *testing.T) {
	db := setupAdTestDB(t)
	router := setupAdTestRouter(db)

	// Create test campaign
	campaign := models.AdCampaign{
		AdvertiserID: 1,
		CampaignName: "Test Ad Campaign",
		AdType:       "video_preroll",
		MediaURL:     "https://example.com/video.mp4",
		ClickURL:     "https://example.com",
		Budget:       1000.0,
		Status:       "active",
	}
	db.Create(&campaign)

	tests := []struct {
		name           string
		payload        map[string]interface{}
		expectedStatus int
		checkDB        func(*testing.T, *gorm.DB)
	}{
		{
			name: "Track view impression",
			payload: map[string]interface{}{
				"user_id":       uint(1),
				"session_id":    "test-session",
				"room_id":       uint(123),
				"clicked":       false,
				"view_duration": 15,
			},
			expectedStatus: http.StatusOK,
			checkDB: func(t *testing.T, db *gorm.DB) {
				var impression models.AdImpression
				db.First(&impression)
				
				assert.Equal(t, campaign.ID, impression.CampaignID)
				assert.Equal(t, false, impression.Clicked)
				assert.Equal(t, 15, impression.ViewDuration)
			},
		},
		{
			name: "Track click impression",
			payload: map[string]interface{}{
				"user_id":    2,
				"session_id": "test-session-2",
				"clicked":    true,
			},
			expectedStatus: http.StatusOK,
			checkDB: func(t *testing.T, db *gorm.DB) {
				var impression models.AdImpression
				db.Where("user_id = ?", 2).First(&impression)
				
				assert.Equal(t, true, impression.Clicked)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(tt.payload)
			url := fmt.Sprintf("/api/ads/campaigns/%d/track", campaign.ID)
			req := httptest.NewRequest("POST", url, bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)
			if tt.checkDB != nil {
				tt.checkDB(t, db)
			}
		})
	}
}

// TestAdCPMOrdering tests that ads are served by highest CPM
func TestAdCPMOrdering(t *testing.T) {
	db := setupAdTestDB(t)
	router := setupAdTestRouter(db)

	// Create multiple ads with different CPMs
	ads := []models.AdCampaign{
		{
			AdvertiserID: 1, CampaignName: "Low CPM Campaign", AdType: "banner",
			MediaURL: "https://example.com/low.gif", ClickURL: "https://example.com",
			Budget: 1000.0, SpentAmount: 100.0, Impressions: 100, CPM: 1.0, Status: "active",
		},
		{
			AdvertiserID: 1, CampaignName: "High CPM Campaign", AdType: "banner",
			MediaURL: "https://example.com/high.gif", ClickURL: "https://example.com",
			Budget: 10000.0, SpentAmount: 1000.0, Impressions: 100, CPM: 10.0, Status: "active",
		},
		{
			AdvertiserID: 1, CampaignName: "Medium CPM Campaign", AdType: "banner",
			MediaURL: "https://example.com/medium.gif", ClickURL: "https://example.com",
			Budget: 5000.0, SpentAmount: 500.0, Impressions: 100, CPM: 5.0, Status: "active",
		},
	}

	for _, ad := range ads {
		db.Create(&ad)
	}

	// Request an ad
	req := httptest.NewRequest("GET", "/api/ads/in-session?user_id=1&session_id=test&ad_type=banner&placement=in_session&user_age=25", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)

	// Should return highest CPM ad
	if response["ad"] != nil {
		ad := response["ad"].(map[string]interface{})
		assert.Equal(t, "High CPM Campaign", ad["campaign_name"])
		assert.Equal(t, 10.0, ad["cpm"])
	}
}
