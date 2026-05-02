// backend/internal/handlers/admin_audit.go
package handlers

import (
	"encoding/json"
	"log"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// LogAdminAction logs an administrative action to the audit trail
// This function should be called after every admin action for compliance and security
func LogAdminAction(db *gorm.DB, c *gin.Context, action, targetType string, targetID uint, details interface{}, success bool, errorMsg string) {
	// Get admin user ID from context
	adminID, exists := c.Get("user_id")
	if !exists {
		log.Printf("⚠️ [AdminAudit] Failed to log action: user_id not in context")
		return
	}

	// Convert details to JSON string
	var detailsJSON string
	if details != nil {
		jsonBytes, err := json.Marshal(details)
		if err != nil {
			log.Printf("⚠️ [AdminAudit] Failed to marshal details: %v", err)
			detailsJSON = "Error serializing details"
		} else {
			detailsJSON = string(jsonBytes)
		}
	}

	// Create audit log entry
	auditLog := models.AdminAuditLog{
		AdminID:    adminID.(uint),
		Action:     action,
		TargetType: targetType,
		TargetID:   targetID,
		Details:    detailsJSON,
		IPAddress:  c.ClientIP(),
		UserAgent:  c.Request.UserAgent(),
		Success:    success,
		ErrorMsg:   errorMsg,
		CreatedAt:  time.Now(),
	}

	// Save to database (async to not block request)
	go func() {
		if err := db.Create(&auditLog).Error; err != nil {
			log.Printf("❌ [AdminAudit] Failed to save audit log: %v", err)
		} else {
			log.Printf("📋 [AdminAudit] Logged: Admin %d performed '%s' on %s/%d (IP: %s)", 
				adminID, action, targetType, targetID, c.ClientIP())
		}
	}()
}

// GetAdminAuditLogsHandler returns paginated admin audit logs
// GET /api/admin/audit-logs?page=1&limit=50&admin_id=5&action=approve_kyc
func GetAdminAuditLogsHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Parse query parameters
		page := 1
		limit := 50
		if p := c.Query("page"); p != "" {
			if parsed, err := parseUint(p); err == nil && parsed > 0 {
				page = int(parsed)
			}
		}
		if l := c.Query("limit"); l != "" {
			if parsed, err := parseUint(l); err == nil && parsed > 0 && parsed <= 100 {
				limit = int(parsed)
			}
		}
		offset := (page - 1) * limit

		// Build query
		query := db.Model(&models.AdminAuditLog{}).Preload("Admin")

		// Filter by admin ID
		if adminIDStr := c.Query("admin_id"); adminIDStr != "" {
			if adminID, err := parseUint(adminIDStr); err == nil {
				query = query.Where("admin_id = ?", adminID)
			}
		}

		// Filter by action
		if action := c.Query("action"); action != "" {
			query = query.Where("action = ?", action)
		}

		// Filter by target type
		if targetType := c.Query("target_type"); targetType != "" {
			query = query.Where("target_type = ?", targetType)
		}

		// Filter by target ID
		if targetIDStr := c.Query("target_id"); targetIDStr != "" {
			if targetID, err := parseUint(targetIDStr); err == nil {
				query = query.Where("target_id = ?", targetID)
			}
		}

		// Filter by date range
		if startDate := c.Query("start_date"); startDate != "" {
			query = query.Where("created_at >= ?", startDate)
		}
		if endDate := c.Query("end_date"); endDate != "" {
			query = query.Where("created_at <= ?", endDate)
		}

		// Get total count
		var total int64
		query.Count(&total)

		// Get logs
		var logs []models.AdminAuditLog
		result := query.Order("created_at DESC").Limit(limit).Offset(offset).Find(&logs)
		if result.Error != nil {
			log.Printf("Error fetching audit logs: %v", result.Error)
			c.JSON(500, gin.H{"error": "Database error"})
			return
		}

		c.JSON(200, gin.H{
			"logs":        logs,
			"total":       total,
			"page":        page,
			"limit":       limit,
			"total_pages": (int(total) + limit - 1) / limit,
		})
	}
}

// Helper function to parse uint from string
func parseUint(s string) (uint, error) {
	result, err := strconv.ParseUint(s, 10, 32)
	return uint(result), err
}
