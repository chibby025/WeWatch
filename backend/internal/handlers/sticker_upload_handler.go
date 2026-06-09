package handlers

import (
	"fmt"
	"io"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"wewatch-backend/internal/utils"
)

// UploadCustomStickerHandler handles POST /api/stickers/upload
// Accepts a single image file (PNG/JPEG/GIF/WebP, max 2 MB),
// uploads it to BunnyCDN (or local storage on dev), and returns the URL.
func UploadCustomStickerHandler(c *gin.Context) {
	userIDValue, ok := c.Get("user_id")
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}
	userID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}

	file, header, err := c.Request.FormFile("image")
	if err != nil {
		c.JSON(400, gin.H{"error": "image field is required"})
		return
	}
	defer file.Close()

	if header.Size > 2*1024*1024 {
		c.JSON(400, gin.H{"error": "image must be under 2 MB"})
		return
	}

	ct := header.Header.Get("Content-Type")
	switch ct {
	case "image/png", "image/jpeg", "image/gif", "image/webp":
	default:
		c.JSON(400, gin.H{"error": "unsupported type; use PNG, JPEG, GIF, or WebP"})
		return
	}

	fileData, err := io.ReadAll(file)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to read file"})
		return
	}

	ext := filepath.Ext(header.Filename)
	if ext == "" {
		switch ct {
		case "image/png":
			ext = ".png"
		case "image/gif":
			ext = ".gif"
		case "image/webp":
			ext = ".webp"
		default:
			ext = ".jpg"
		}
	}

	filename := fmt.Sprintf("sticker_%d_%d%s", userID, time.Now().UnixMilli(), ext)

	cdnURL, err := utils.UploadToBunnyCDN(fileData, filename, ct)
	if err != nil {
		c.JSON(500, gin.H{"error": "upload failed"})
		return
	}

	c.JSON(200, gin.H{"url": cdnURL})
}
