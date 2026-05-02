// backend/internal/handlers/ad_upload.go
package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// UploadAdMedia handles ad creative uploads (images/videos)
func UploadAdMedia(c *gin.Context) {
	userID, _ := c.Get("user_id")

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}

	// Validate file type
	ext := strings.ToLower(filepath.Ext(file.Filename))
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

	if file.Size > maxSize {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("File too large. Max size: %dMB", maxSize/(1024*1024)),
		})
		return
	}

	// Create unique filename
	timestamp := time.Now().Unix()
	filename := fmt.Sprintf("ad_%d_%d%s", userID, timestamp, ext)

	// Create ad media directory if it doesn't exist
	uploadDir := "./uploads/ads"
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create upload directory"})
		return
	}

	// Save file
	filepath := filepath.Join(uploadDir, filename)
	if err := c.SaveUploadedFile(file, filepath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	// Generate URLs
	mediaURL := fmt.Sprintf("/uploads/ads/%s", filename)
	thumbnailURL := mediaURL // For now, use same URL. TODO: Generate video thumbnails

	// If it's a video, we could generate a thumbnail here
	// For now, we'll just return the video URL as both

	c.JSON(http.StatusOK, gin.H{
		"message":       "File uploaded successfully",
		"media_url":     mediaURL,
		"thumbnail_url": thumbnailURL,
		"filename":      filename,
		"size":          file.Size,
	})
}
