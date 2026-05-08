// backend/internal/handlers/ad_upload.go
package handlers

import (
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"wewatch-backend/internal/utils"
)

// UploadAdMedia handles ad creative uploads (images/videos) to BunnyCDN
func UploadAdMedia(c *gin.Context) {
	userID, _ := c.Get("user_id")

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}
	defer file.Close()

	// Validate file type
	ext := strings.ToLower(filepath.Ext(header.Filename))
	validExtensions := map[string]bool{
		".jpg":  true,
		".jpeg": true,
		".png":  true,
		".gif":  true,
		".mp4":  true,
		".webm": true,
	}

	if !validExtensions[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file type. Allowed: JPG, PNG, GIF, MP4, WebM"})
		return
	}

	// Validate file size (50MB for video, 5MB for images)
	maxSize := int64(5 * 1024 * 1024) // 5MB default
	if ext == ".mp4" || ext == ".webm" {
		maxSize = 50 * 1024 * 1024 // 50MB for videos
	}

	if header.Size > maxSize {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("File too large. Max size: %dMB", maxSize/(1024*1024)),
		})
		return
	}

	// Create unique filename
	timestamp := time.Now().Unix()
	filename := fmt.Sprintf("ad_%d_%d%s", userID, timestamp, ext)

	log.Printf("📤 [UploadAdMedia] Uploading ad creative to BunnyCDN: %s (size: %d bytes)", filename, header.Size)

	// Upload to BunnyCDN
	cdnURL, err := utils.UploadMultipartFileToBunnyCDN(file, header)
	if err != nil {
		log.Printf("❌ [UploadAdMedia] BunnyCDN upload failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload file to CDN"})
		return
	}

	// For videos, we could generate thumbnails (TODO)
	// For now, return the same URL for both media and thumbnail
	thumbnailURL := cdnURL
	if ext == ".mp4" || ext == ".webm" {
		// TODO: Generate video thumbnail using FFmpeg
		thumbnailURL = cdnURL // Placeholder
	}

	log.Printf("✅ [UploadAdMedia] Ad media uploaded successfully: %s", cdnURL)

	c.JSON(http.StatusOK, gin.H{
		"message":       "File uploaded successfully to BunnyCDN",
		"media_url":     cdnURL,
		"thumbnail_url": thumbnailURL,
		"filename":      filename,
		"size":          header.Size,
		"cdn_provider":  "BunnyCDN",
	})
}
