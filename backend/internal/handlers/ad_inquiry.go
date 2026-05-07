// backend/internal/handlers/ad_inquiry.go
package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// SubmitAdInquiry handles public ad inquiry submissions
func SubmitAdInquiry(c *gin.Context) {
	var input struct {
		CompanyName    string `json:"company_name" binding:"required"`
		ContactName    string `json:"contact_name" binding:"required"`
		Email          string `json:"email" binding:"required,email"`
		Phone          string `json:"phone"`
		Budget         string `json:"budget" binding:"required"`
		CampaignGoals  string `json:"campaign_goals" binding:"required"`
		TargetAudience string `json:"target_audience"`
		Message        string `json:"message"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	inquiry := models.AdInquiry{
		CompanyName:    input.CompanyName,
		ContactName:    input.ContactName,
		Email:          input.Email,
		Phone:          input.Phone,
		Budget:         input.Budget,
		CampaignGoals:  input.CampaignGoals,
		TargetAudience: input.TargetAudience,
		Message:        input.Message,
		Status:         "pending",
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}

	if err := DB.Create(&inquiry).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to submit inquiry"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Ad inquiry submitted successfully",
		"inquiry_id": inquiry.ID,
	})
}

// GetAdInquiries retrieves all ad inquiries (super admin only)
func GetAdInquiries(c *gin.Context) {
	userID, _ := c.Get("user_id")
	db := c.MustGet("db").(*gorm.DB)
	
	// Check if user is super admin
	var user models.User
	if err := db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}

	if !user.IsSuperAdmin() {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only super admins can access ad inquiries"})
		return
	}

	var inquiries []models.AdInquiry
	if err := db.Order("created_at DESC").Preload("ReviewedBy").Find(&inquiries).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch inquiries"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"inquiries": inquiries})
}

// UpdateAdInquiryStatus updates the status of an ad inquiry (super admin only)
func UpdateAdInquiryStatus(c *gin.Context) {
	userID, _ := c.Get("user_id")
	inquiryID := c.Param("id")

	// Check if user is super admin
	var user models.User
	if err := DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}

	if !user.IsSuperAdmin() {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only super admins can update ad inquiries"})
		return
	}

	var input struct {
		Status     string `json:"status" binding:"required"`
		AdminNotes string `json:"admin_notes"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var inquiry models.AdInquiry
	if err := DB.First(&inquiry, inquiryID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Inquiry not found"})
		return
	}

	// Update inquiry
	reviewedByID := uint(userID.(float64))
	inquiry.Status = input.Status
	inquiry.AdminNotes = input.AdminNotes
	inquiry.ReviewedByID = &reviewedByID
	inquiry.UpdatedAt = time.Now()

	if err := DB.Save(&inquiry).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update inquiry"})
		return
	}

	// Log audit event
	LogAdminAction(DB, c, "update_ad_inquiry_status", "ad_inquiry", inquiry.ID, gin.H{
		"company": inquiry.CompanyName,
		"old_status": inquiry.Status,
		"new_status": input.Status,
	}, true, "")

	c.JSON(http.StatusOK, gin.H{
		"message": "Inquiry updated successfully",
		"inquiry": inquiry,
	})
}

// DeleteAdInquiry deletes an ad inquiry (super admin only)
func DeleteAdInquiry(c *gin.Context) {
	userID, _ := c.Get("user_id")
	inquiryID := c.Param("id")

	// Check if user is super admin
	var user models.User
	if err := DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}

	if !user.IsSuperAdmin() {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only super admins can delete ad inquiries"})
		return
	}

	var inquiry models.AdInquiry
	if err := DB.First(&inquiry, inquiryID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Inquiry not found"})
		return
	}

	if err := DB.Delete(&inquiry).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete inquiry"})
		return
	}

	// Log audit event
	LogAdminAction(DB, c, "delete_ad_inquiry", "ad_inquiry", inquiry.ID, gin.H{
		"company": inquiry.CompanyName,
	}, true, "")

	c.JSON(http.StatusOK, gin.H{"message": "Inquiry deleted successfully"})
}
