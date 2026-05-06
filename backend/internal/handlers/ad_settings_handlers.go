// backend/internal/handlers/ad_settings_handlers.go
package handlers

import (
	"log"
	"net/http"
	"time"
	
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// GetAdSettingsHandler returns all ad settings (GET /api/ads/settings)
func GetAdSettingsHandler(c *gin.Context) {
	db := c.MustGet("db").(*gorm.DB)
	
	var settings []models.AdSettings
	if err := db.Find(&settings).Error; err != nil {
		log.Printf("❌ [GetAdSettings] Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch ad settings"})
		return
	}
	
	// Convert to map for easier frontend consumption
	settingsMap := make(map[string]bool)
	for _, setting := range settings {
		settingsMap[setting.SettingKey] = setting.Enabled
	}
	
	// Ensure all keys exist (default to true if not in DB)
	if _, exists := settingsMap[models.AdSettingGlobalEnabled]; !exists {
		settingsMap[models.AdSettingGlobalEnabled] = true
	}
	if _, exists := settingsMap[models.AdSettingFeedAds]; !exists {
		settingsMap[models.AdSettingFeedAds] = true
	}
	if _, exists := settingsMap[models.AdSettingSessionAds]; !exists {
		settingsMap[models.AdSettingSessionAds] = true
	}
	if _, exists := settingsMap[models.AdSettingRoomTVAds]; !exists {
		settingsMap[models.AdSettingRoomTVAds] = true
	}
	if _, exists := settingsMap[models.AdSettingDiscoverAds]; !exists {
		settingsMap[models.AdSettingDiscoverAds] = true
	}
	
	c.JSON(http.StatusOK, gin.H{
		"global_enabled":  settingsMap[models.AdSettingGlobalEnabled],
		"feed_ads":        settingsMap[models.AdSettingFeedAds],
		"session_ads":     settingsMap[models.AdSettingSessionAds],
		"roomtv_ads":      settingsMap[models.AdSettingRoomTVAds],
		"discover_ads":    settingsMap[models.AdSettingDiscoverAds],
	})
}

// UpdateAdSettingsRequest represents the request body
type UpdateAdSettingsRequest struct {
	SettingKey string `json:"setting_key" binding:"required,oneof=global_enabled feed_ads session_ads roomtv_ads discover_ads"`
	Enabled    bool   `json:"enabled"`
}

// UpdateAdSettingsHandler updates ad settings (PUT /api/ads/settings) - SUPER ADMIN ONLY
func UpdateAdSettingsHandler(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	
	db := c.MustGet("db").(*gorm.DB)
	
	// Verify user is super admin
	var user models.User
	if err := db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}
	
	if !user.IsSuperAdmin() {
		log.Printf("⛔ [UpdateAdSettings] Non-super-admin user %d attempted to modify ad settings", userID)
		c.JSON(http.StatusForbidden, gin.H{"error": "Only super admins can modify ad settings"})
		return
	}
	
	var req UpdateAdSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Find or create setting
	var setting models.AdSettings
	err := db.Where("setting_key = ?", req.SettingKey).First(&setting).Error
	
	if err == gorm.ErrRecordNotFound {
		// Create new setting
		setting = models.AdSettings{
			SettingKey:      req.SettingKey,
			Enabled:         req.Enabled,
			UpdatedByUserID: userID,
		}
		if err := db.Create(&setting).Error; err != nil {
			log.Printf("❌ [UpdateAdSettings] Failed to create setting: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create setting"})
			return
		}
	} else if err != nil {
		log.Printf("❌ [UpdateAdSettings] Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	} else {
		// Update existing setting
		setting.Enabled = req.Enabled
		setting.UpdatedAt = time.Now()
		setting.UpdatedByUserID = userID
		if err := db.Save(&setting).Error; err != nil {
			log.Printf("❌ [UpdateAdSettings] Failed to update setting: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update setting"})
			return
		}
	}
	
	log.Printf("✅ [UpdateAdSettings] Super admin %d set %s to %v", userID, req.SettingKey, req.Enabled)
	
	c.JSON(http.StatusOK, gin.H{
		"message": "Ad settings updated successfully",
		"setting": setting,
	})
}

// Helper: Check if ads are globally enabled
func AreAdsEnabled(db *gorm.DB) bool {
	var setting models.AdSettings
	err := db.Where("setting_key = ?", models.AdSettingGlobalEnabled).First(&setting).Error
	
	if err == gorm.ErrRecordNotFound {
		return true // Default to enabled if not set
	}
	
	if err != nil {
		log.Printf("⚠️ [AreAdsEnabled] Database error: %v", err)
		return true // Fail open (show ads by default)
	}
	
	return setting.Enabled
}

// Helper: Check if specific ad type is enabled
func IsAdTypeEnabled(db *gorm.DB, adType string) bool {
	// First check global switch
	if !AreAdsEnabled(db) {
		return false
	}
	
	// Then check specific type
	var setting models.AdSettings
	err := db.Where("setting_key = ?", adType).First(&setting).Error
	
	if err == gorm.ErrRecordNotFound {
		return true // Default to enabled if not set
	}
	
	if err != nil {
		log.Printf("⚠️ [IsAdTypeEnabled] Database error: %v", err)
		return true // Fail open
	}
	
	return setting.Enabled
}
