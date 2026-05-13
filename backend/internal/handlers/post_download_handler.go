// backend/internal/handlers/post_download_handler.go
package handlers

import (
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"wewatch-backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// DownloadPost handles GET /api/posts/:id/download
// Tracks download analytics and returns the video file URL for download
func DownloadPost(c *gin.Context) {
	// Get authenticated user ID (optional - guests can download if allowed)
	var userID *uint
	if id, exists := c.Get("user_id"); exists && id.(uint) != 0 {
		uid := id.(uint)
		userID = &uid
	}

	// Get post ID from URL
	postIDStr := c.Param("id")
	postID, err := strconv.ParseUint(postIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	// Get database connection
	db := c.MustGet("db").(*gorm.DB)

	// Fetch post with user info
	var post models.Post
	if err := db.Preload("User").First(&post, postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
			return
		}
		log.Printf("❌ [DownloadPost] Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch post"})
		return
	}

	isOwner := userID != nil && *userID == post.UserID

	// Privacy gate: private posts → owner only
	if !post.IsPublic && !isOwner {
		if userID == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required to download private posts"})
			return
		}
		c.JSON(http.StatusForbidden, gin.H{"error": "You don't have access to download this post"})
		return
	}

	// Access gate:
	//   Paid posts  → owner OR purchaser (purchase grants permanent download right;
	//                 AllowDownloads is bypassed once paid)
	//   Free posts  → respect AllowDownloads (owner always allowed)
	if post.IsPaid {
		if !isOwner {
			if userID == nil {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required to download paid posts"})
				return
			}
			var purchase models.PostPurchase
			if err := db.Where("post_id = ? AND user_id = ? AND status = ?", postID, *userID, "completed").
				First(&purchase).Error; err != nil {
				c.JSON(http.StatusForbidden, gin.H{"error": "Purchase required to download this post"})
				return
			}
		}
	} else {
		if !post.AllowDownloads && !isOwner {
			c.JSON(http.StatusForbidden, gin.H{"error": "Downloads are disabled for this post"})
			return
		}
	}

	// Check if post has a video URL
	if post.VideoURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No video available for download"})
		return
	}

	// Get client info for analytics
	ipAddress := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")

	// Track download in post_downloads table
	download := models.PostDownload{
		PostID:       uint(postID),
		UserID:       userID,
		IPAddress:    ipAddress,
		UserAgent:    userAgent,
		DownloadedAt: time.Now(),
	}

	if err := db.Create(&download).Error; err != nil {
		log.Printf("⚠️ [DownloadPost] Failed to log download: %v", err)
		// Continue even if logging fails
	}

	// Increment downloads_count
	if err := db.Model(&post).Update("downloads_count", gorm.Expr("downloads_count + 1")).Error; err != nil {
		log.Printf("⚠️ [DownloadPost] Failed to increment download count: %v", err)
		// Continue even if count increment fails
	}

	log.Printf("📥 [DownloadPost] Post %d downloaded by user %v (IP: %s)", postID, userID, ipAddress)

	// Return video URL for frontend to trigger download
	// Frontend will use this URL with download attribute
	c.JSON(http.StatusOK, gin.H{
		"video_url": post.VideoURL,
		"filename":  generateDownloadFilename(post),
		"message":   "Download started",
	})
}

// generateDownloadFilename creates a user-friendly filename for downloads
func generateDownloadFilename(post models.Post) string {
	// Sanitize title for filename
	title := post.Title
	if len(title) > 50 {
		title = title[:50]
	}
	
	// Remove special characters
	for _, char := range []string{"/", "\\", ":", "*", "?", "\"", "<", ">", "|"} {
		title = replaceAll(title, char, "-")
	}
	
	// Format: WeWatch_Title_PostID.mp4
	return fmt.Sprintf("WeWatch_%s_%d.mp4", title, post.ID)
}

// Helper function to replace all occurrences
func replaceAll(str, old, new string) string {
	result := ""
	for _, char := range str {
		if string(char) == old {
			result += new
		} else {
			result += string(char)
		}
	}
	return result
}
