// backend/internal/handlers/post_download_handler.go
package handlers

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"

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

	// --- MP4 pipeline ---
	// If MP4 is ready, serve it directly
	if post.Mp4Ready && post.Mp4URL != "" {
		logAndCount(db, &post, userID, c.ClientIP(), c.GetHeader("User-Agent"))
		c.JSON(http.StatusOK, gin.H{
			"video_url": post.Mp4URL,
			"filename":  generateDownloadFilename(post),
			"message":   "Download ready",
		})
		return
	}

	// If already being transcoded, tell the client to wait
	if post.Mp4Processing {
		c.JSON(http.StatusAccepted, gin.H{
			"status":  "processing",
			"message": "Your download is being prepared. Please check back in a few minutes.",
		})
		return
	}

	// Kick off background transcoding (first download request triggers it)
	db.Model(&post).Update("mp4_processing", true)
	go transcodePostToMp4(db, post)

	c.JSON(http.StatusAccepted, gin.H{
		"status":  "processing",
		"message": "Your download is being prepared. Please check back in a few minutes.",
	})
}

// logAndCount records the download event and increments the counter
func logAndCount(db *gorm.DB, post *models.Post, userID *uint, ip, ua string) {
	download := models.PostDownload{
		PostID:       post.ID,
		UserID:       userID,
		IPAddress:    ip,
		UserAgent:    ua,
		DownloadedAt: time.Now(),
	}
	if err := db.Create(&download).Error; err != nil {
		log.Printf("⚠️ [DownloadPost] Failed to log download: %v", err)
	}
	if err := db.Model(post).Update("downloads_count", gorm.Expr("downloads_count + 1")).Error; err != nil {
		log.Printf("⚠️ [DownloadPost] Failed to increment download count: %v", err)
	}
}

// transcodePostToMp4 runs in a background goroutine.
// Downloads the source WebM, transcodes to H.264 MP4 with watermark, uploads to BunnyCDN.
func transcodePostToMp4(db *gorm.DB, post models.Post) {
	log.Printf("🎬 [Transcode] Starting MP4 conversion for post %d (source: %s)", post.ID, post.VideoURL)

	// Look up the post owner's username for the watermark text
	var owner models.User
	watermarkText := ""
	if err := db.Select("username").First(&owner, post.UserID).Error; err == nil && owner.Username != "" {
		watermarkText = "@" + owner.Username
	}

	// Logo watermark path — set WATERMARK_LOGO_PATH env var to enable
	logoPath := os.Getenv("WATERMARK_LOGO_PATH")

	// Step 1: download source to a temp file
	inputPath, err := utils.DownloadFileToTemp(post.VideoURL, ".webm")
	if err != nil {
		log.Printf("❌ [Transcode] Download failed for post %d: %v", post.ID, err)
		db.Model(&post).Update("mp4_processing", false)
		return
	}
	defer os.Remove(inputPath)

	// Step 2: transcode → temp MP4 (with watermark if configured)
	outputPath := inputPath + "_out.mp4"
	defer os.Remove(outputPath)

	if err := utils.TranscodeToMp4(inputPath, outputPath, watermarkText, logoPath); err != nil {
		log.Printf("❌ [Transcode] FFmpeg failed for post %d: %v", post.ID, err)
		db.Model(&post).Update("mp4_processing", false)
		return
	}

	// Step 3: read the MP4 and upload to BunnyCDN
	mp4Data, err := os.ReadFile(outputPath)
	if err != nil {
		log.Printf("❌ [Transcode] Failed to read output MP4 for post %d: %v", post.ID, err)
		db.Model(&post).Update("mp4_processing", false)
		return
	}

	mp4Filename := fmt.Sprintf("recording_%d_%d.mp4", post.ID, time.Now().Unix())
	mp4URL, err := utils.UploadToBunnyCDN(mp4Data, mp4Filename, "video/mp4")
	if err != nil {
		log.Printf("❌ [Transcode] BunnyCDN upload failed for post %d: %v", post.ID, err)
		db.Model(&post).Update("mp4_processing", false)
		return
	}

	// Step 4: update post record
	if err := db.Model(&post).Updates(map[string]interface{}{
		"mp4_url":        mp4URL,
		"mp4_ready":      true,
		"mp4_processing": false,
	}).Error; err != nil {
		log.Printf("❌ [Transcode] DB update failed for post %d: %v", post.ID, err)
		return
	}

	log.Printf("✅ [Transcode] Post %d MP4 ready: %s", post.ID, mp4URL)
}

// generateDownloadFilename creates a user-friendly filename for downloads
func generateDownloadFilename(post models.Post) string {
	// Use description preview as filename base
	title := post.Description
	if len(title) > 50 {
		title = title[:50]
	}
	if title == "" {
		title = fmt.Sprintf("post_%d", post.ID)
	}

	// Remove special characters
	for _, char := range []string{"/", "\\", ":", "*", "?", "\"", "<", ">", "|"} {
		title = replaceAll(title, char, "-")
	}

	// Format: WeWatch_Desc_PostID.mp4
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
