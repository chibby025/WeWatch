package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// AdminMiddleware ensures user is an admin or super admin
func AdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get user ID from context (set by AuthMiddleware)
		userIDInterface, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			c.Abort()
			return
		}
		userID := userIDInterface.(uint)

		// Get database connection
		db := c.MustGet("db").(*gorm.DB)

		// Fetch user from database
		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
			c.Abort()
			return
		}

		// Check if user is admin or super admin
		if !user.IsAdmin() {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied. Admin privileges required."})
			c.Abort()
			return
		}

		// Set user object in context for handlers to use
		c.Set("admin_user", user)
		c.Next()
	}
}

// SuperAdminMiddleware ensures user is a super admin
func SuperAdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get user ID from context (set by AuthMiddleware)
		userIDInterface, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			c.Abort()
			return
		}
		userID := userIDInterface.(uint)

		// Get database connection
		db := c.MustGet("db").(*gorm.DB)

		// Fetch user from database
		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
			c.Abort()
			return
		}

		// Check if user is super admin
		if !user.IsSuperAdmin() {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied. Super admin privileges required."})
			c.Abort()
			return
		}

		// Set user object in context for handlers to use
		c.Set("super_admin_user", user)
		c.Next()
	}
}

// RequireAdmin is an alias for AdminMiddleware for consistency with main.go
func RequireAdmin() gin.HandlerFunc {
	return AdminMiddleware()
}

// RequireSuperAdmin is an alias for SuperAdminMiddleware for consistency with main.go
func RequireSuperAdmin() gin.HandlerFunc {
	return SuperAdminMiddleware()
}
