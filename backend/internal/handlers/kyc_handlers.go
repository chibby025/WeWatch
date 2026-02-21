// WeWatch/backend/internal/handlers/kyc_handlers.go
package handlers

import (
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// SubmitKYCRequest represents KYC submission data
type SubmitKYCRequest struct {
	IDType      string                 `form:"id_type" binding:"required,oneof=national_id passport drivers_license voters_card"`
	IDNumber    string                 `form:"id_number" binding:"required"`
	BankDetails map[string]interface{} `form:"bank_details"` // Will parse from JSON string
}

// SubmitKYCHandler handles KYC document submission
// POST /api/kyc/submit
func SubmitKYCHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get authenticated user
		authUser, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		user := authUser.(*models.User)

		// Parse form data
		var req SubmitKYCRequest
		if err := c.ShouldBind(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Get uploaded files
		idDocFile, err := c.FormFile("id_document")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "id_document file is required"})
			return
		}

		selfieFile, err := c.FormFile("selfie")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "selfie file is required"})
			return
		}

		// Validate file types
		allowedImageTypes := map[string]bool{
			".jpg": true, ".jpeg": true, ".png": true, ".pdf": true,
		}

		idDocExt := filepath.Ext(idDocFile.Filename)
		selfieExt := filepath.Ext(selfieFile.Filename)

		if !allowedImageTypes[idDocExt] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID document file type. Allowed: jpg, jpeg, png, pdf"})
			return
		}

		if !allowedImageTypes[selfieExt] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid selfie file type. Allowed: jpg, jpeg, png"})
			return
		}

		// Check file sizes (max 5MB each)
		maxFileSize := int64(5 * 1024 * 1024) // 5MB
		if idDocFile.Size > maxFileSize {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ID document file too large (max 5MB)"})
			return
		}
		if selfieFile.Size > maxFileSize {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Selfie file too large (max 5MB)"})
			return
		}

		// Check if user already has a KYC record
		var existingKYC models.KYCVerification
		result := db.Where("user_id = ?", user.ID).First(&existingKYC)

		// If approved KYC exists and not expired, reject
		if result.Error == nil && existingKYC.Status == string(models.KYCStatusApproved) {
			existingKYC.CheckExpiration()
			if existingKYC.Status == string(models.KYCStatusApproved) {
				c.JSON(http.StatusBadRequest, gin.H{
					"error":   "KYC already verified",
					"message": "Your KYC is already approved and valid",
					"kyc":     existingKYC,
				})
				return
			}
		}

		// Generate unique filenames
		idDocFilename := fmt.Sprintf("kyc_id_%d_%s%s", user.ID, uuid.New().String(), idDocExt)
		selfieFilename := fmt.Sprintf("kyc_selfie_%d_%s%s", user.ID, uuid.New().String(), selfieExt)

		// Save files to uploads/kyc directory
		idDocPath := filepath.Join("./uploads/kyc", idDocFilename)
		selfiePath := filepath.Join("./uploads/kyc", selfieFilename)

		if err := c.SaveUploadedFile(idDocFile, idDocPath); err != nil {
			log.Printf("❌ Error saving ID document: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save ID document"})
			return
		}

		if err := c.SaveUploadedFile(selfieFile, selfiePath); err != nil {
			log.Printf("❌ Error saving selfie: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save selfie"})
			return
		}

		// Parse bank details from JSON string if provided
		var bankDetails map[string]interface{}
		if bankDetailsJSON := c.PostForm("bank_details"); bankDetailsJSON != "" {
			// Parse JSON string into map
			// For now, we'll accept it as is and validate structure
			bankDetails = req.BankDetails
		}

		// Create or update KYC record
		kycData := models.KYCVerification{
			UserID:        user.ID,
			IDType:        req.IDType,
			IDNumber:      req.IDNumber,
			IDDocumentURL: fmt.Sprintf("/uploads/kyc/%s", idDocFilename),
			SelfieURL:     fmt.Sprintf("/uploads/kyc/%s", selfieFilename),
			BankDetails:   bankDetails,
			Status:        string(models.KYCStatusPending),
		}

		if result.Error == gorm.ErrRecordNotFound {
			// Create new KYC record
			if err := db.Create(&kycData).Error; err != nil {
				log.Printf("❌ Error creating KYC: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to submit KYC"})
				return
			}
		} else {
			// Update existing KYC record
			kycData.ID = existingKYC.ID
			if err := db.Model(&existingKYC).Updates(kycData).Error; err != nil {
				log.Printf("❌ Error updating KYC: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update KYC"})
				return
			}
		}

		log.Printf("✅ KYC submitted: User %d, ID Type %s", user.ID, req.IDType)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"kyc":     kycData,
			"message": "KYC documents submitted successfully. We'll review them within 24-48 hours.",
		})
	}
}

// GetUserKYCHandler retrieves KYC status for a user
// GET /api/kyc/:userId
func GetUserKYCHandler(db *gorm.DB) gin.HandlerFunc {
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

		// Users can only view their own KYC
		if uint(userID) != authenticatedUserID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Cannot view other users' KYC"})
			return
		}

		var kyc models.KYCVerification
		result := db.Where("user_id = ?", userID).First(&kyc)

		if result.Error == gorm.ErrRecordNotFound {
			c.JSON(http.StatusOK, gin.H{
				"has_kyc": false,
				"kyc":     nil,
			})
			return
		} else if result.Error != nil {
			log.Printf("❌ Error fetching KYC: %v", result.Error)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch KYC"})
			return
		}

		// Check expiration
		kyc.CheckExpiration()
		if kyc.Status == string(models.KYCStatusExpired) {
			db.Save(&kyc)
		}

		c.JSON(http.StatusOK, gin.H{
			"has_kyc": true,
			"kyc":     kyc,
		})
	}
}

// Admin-only KYC approval endpoints

// GetPendingKYCsHandler retrieves all pending KYC verifications (admin only)
// GET /api/admin/kyc/pending
func GetPendingKYCsHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// TODO: Add admin role check
		// Get authenticated user
		authUser, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		user := authUser.(*models.User)

		// Check if user is admin (you'll need to add an IsAdmin field to User model)
		// For now, we'll allow any authenticated user (remove this in production)
		_ = user

		var kycs []models.KYCVerification
		if err := db.Preload("User").Where("status = ?", "pending").Order("created_at ASC").Find(&kycs).Error; err != nil {
			log.Printf("❌ Error fetching pending KYCs: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch pending KYCs"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"kycs":  kycs,
			"count": len(kycs),
		})
	}
}

// ApproveKYCHandler approves a KYC verification (admin only)
// POST /api/admin/kyc/:id/approve
func ApproveKYCHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		kycIDStr := c.Param("id")
		kycID, err := strconv.ParseUint(kycIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid KYC ID"})
			return
		}

		// Get authenticated admin user
		authUser, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		admin := authUser.(*models.User)

		// TODO: Check admin role

		var kyc models.KYCVerification
		if err := db.First(&kyc, kycID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "KYC not found"})
			} else {
				log.Printf("❌ Error fetching KYC: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch KYC"})
			}
			return
		}

		if kyc.Status != string(models.KYCStatusPending) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "KYC not pending",
				"message": "Only pending KYC verifications can be approved",
				"status":  kyc.Status,
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

		// Approve KYC
		kyc.Approve(admin.ID)
		if err := tx.Save(&kyc).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ Error approving KYC: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to approve KYC"})
			return
		}

		// Update user's KYC status
		if err := tx.Model(&models.User{}).Where("id = ?", kyc.UserID).Updates(map[string]interface{}{
			"is_kyc_verified": true,
			"kyc_verified_at": time.Now(),
		}).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ Error updating user KYC status: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user status"})
			return
		}

		// Commit transaction
		if err := tx.Commit().Error; err != nil {
			log.Printf("❌ Error committing KYC approval: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to complete approval"})
			return
		}

		log.Printf("✅ KYC approved: ID %d, User %d, Admin %d", kycID, kyc.UserID, admin.ID)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"kyc":     kyc,
			"message": "KYC approved successfully",
		})
	}
}

// RejectKYCHandler rejects a KYC verification (admin only)
// POST /api/admin/kyc/:id/reject
func RejectKYCHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		kycIDStr := c.Param("id")
		kycID, err := strconv.ParseUint(kycIDStr, 10, 32)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid KYC ID"})
			return
		}

		// Get authenticated admin user
		authUser, exists := c.Get("user")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		admin := authUser.(*models.User)

		// Parse rejection reason
		var reqBody struct {
			Reason string `json:"reason" binding:"required"`
		}
		if err := c.ShouldBindJSON(&reqBody); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Rejection reason is required"})
			return
		}

		var kyc models.KYCVerification
		if err := db.First(&kyc, kycID).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				c.JSON(http.StatusNotFound, gin.H{"error": "KYC not found"})
			} else {
				log.Printf("❌ Error fetching KYC: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch KYC"})
			}
			return
		}

		if kyc.Status != string(models.KYCStatusPending) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "KYC not pending",
				"message": "Only pending KYC verifications can be rejected",
				"status":  kyc.Status,
			})
			return
		}

		// Reject KYC
		kyc.Reject(reqBody.Reason, admin.ID)
		if err := db.Save(&kyc).Error; err != nil {
			log.Printf("❌ Error rejecting KYC: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reject KYC"})
			return
		}

		log.Printf("✅ KYC rejected: ID %d, User %d, Admin %d, Reason: %s", kycID, kyc.UserID, admin.ID, reqBody.Reason)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"kyc":     kyc,
			"message": "KYC rejected",
		})
	}
}
