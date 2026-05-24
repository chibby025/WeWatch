// backend/internal/handlers/report_handler.go
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
)

type Report struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	ReporterID  uint       `gorm:"not null;index" json:"reporter_id"`
	TargetType  string     `gorm:"type:varchar(20);not null" json:"target_type"` // "room", "post", "user"
	TargetID    uint       `gorm:"not null" json:"target_id"`
	Reason      string     `gorm:"type:varchar(50);not null" json:"reason"`
	Description string     `gorm:"type:text" json:"description"`
	Status      string     `gorm:"type:varchar(20);not null;default:'pending'" json:"status"` // "pending", "reviewed", "dismissed"
	ReviewedBy  *uint      `gorm:"index" json:"reviewed_by,omitempty"`
	ReviewedAt  *time.Time `json:"reviewed_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`

	Reporter models.User `gorm:"foreignKey:ReporterID" json:"reporter,omitempty"`
}

func (Report) TableName() string { return "reports" }

var reportReasons = map[string]bool{
	"spam":           true,
	"harassment":     true,
	"hate_speech":    true,
	"violence":       true,
	"nudity":         true,
	"misinformation": true,
	"copyright":      true,
	"other":          true,
}

// CreateReportHandler handles POST /api/reports
func CreateReportHandler(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req struct {
		TargetType  string `json:"target_type" binding:"required"`
		TargetID    uint   `json:"target_id" binding:"required"`
		Reason      string `json:"reason" binding:"required"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.TargetType != "room" && req.TargetType != "post" && req.TargetType != "user" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "target_type must be room, post, or user"})
		return
	}
	if !reportReasons[req.Reason] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid reason"})
		return
	}
	if req.TargetType == "user" && req.TargetID == uint(userID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot report yourself"})
		return
	}

	report := Report{
		ReporterID:  userID,
		TargetType:  req.TargetType,
		TargetID:    req.TargetID,
		Reason:      req.Reason,
		Description: req.Description,
		Status:      "pending",
	}

	if err := DB.Create(&report).Error; err != nil {
		if isUniqueConstraintError(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "You have already reported this"})
			return
		}
		log.Printf("❌ [CreateReport] DB error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create report"})
		return
	}

	log.Printf("🚨 [Report] User %d reported %s:%d — reason: %s", userID, req.TargetType, req.TargetID, req.Reason)
	c.JSON(http.StatusCreated, gin.H{"message": "Report submitted", "report_id": report.ID})
}

// CheckReportedHandler handles GET /api/reports/check?target_type=...&target_id=...
func CheckReportedHandler(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	targetType := c.Query("target_type")
	targetIDStr := c.Query("target_id")
	targetID, err := strconv.ParseUint(targetIDStr, 10, 64)
	if err != nil || targetType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "target_type and target_id required"})
		return
	}

	var count int64
	DB.Model(&Report{}).
		Where("reporter_id = ? AND target_type = ? AND target_id = ?", userID, targetType, targetID).
		Count(&count)

	c.JSON(http.StatusOK, gin.H{"reported": count > 0})
}

// GetAdminReportsHandler handles GET /api/admin/reports
func GetAdminReportsHandler(c *gin.Context) {
	db := c.MustGet("db").(*gorm.DB)

	status := c.DefaultQuery("status", "pending")
	targetType := c.Query("target_type")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit := 20
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * limit

	query := db.Model(&Report{}).Preload("Reporter")
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if targetType != "" {
		query = query.Where("target_type = ?", targetType)
	}

	var total int64
	query.Count(&total)

	var reports []Report
	if err := query.Order("created_at DESC").Limit(limit).Offset(offset).Find(&reports).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch reports"})
		return
	}

	// Count by status
	type StatusCount struct {
		Status string
		Count  int64
	}
	var counts []StatusCount
	db.Model(&Report{}).Select("status, count(*) as count").Group("status").Scan(&counts)
	statusMap := map[string]int64{}
	for _, sc := range counts {
		statusMap[sc.Status] = sc.Count
	}

	c.JSON(http.StatusOK, gin.H{
		"reports": reports,
		"total":   total,
		"page":    page,
		"counts": gin.H{
			"pending":   statusMap["pending"],
			"reviewed":  statusMap["reviewed"],
			"dismissed": statusMap["dismissed"],
		},
	})
}

// UpdateAdminReportHandler handles PATCH /api/admin/reports/:id
func UpdateAdminReportHandler(c *gin.Context) {
	db := c.MustGet("db").(*gorm.DB)

	authUser, _ := c.Get("user")
	admin := authUser.(*models.User)

	reportID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid report ID"})
		return
	}

	var req struct {
		Status string `json:"status" binding:"required,oneof=reviewed dismissed"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()
	adminID := admin.ID
	if err := db.Model(&Report{}).Where("id = ?", reportID).Updates(map[string]interface{}{
		"status":      req.Status,
		"reviewed_by": adminID,
		"reviewed_at": now,
		"updated_at":  now,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update report"})
		return
	}

	log.Printf("✅ [AdminReport] Report %d marked %s by admin %d", reportID, req.Status, admin.ID)
	c.JSON(http.StatusOK, gin.H{"message": "Report updated"})
}

// isUniqueConstraintError checks for PostgreSQL unique violation
func isUniqueConstraintError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "unique constraint") || strings.Contains(msg, "duplicate key")
}
