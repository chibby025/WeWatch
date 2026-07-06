package handlers

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"wewatch-backend/internal/utils"

	"github.com/gin-gonic/gin"
)

// UploadGameAssetHandler handles image/GIF uploads during the VS Battle character
// building phase. Assets are scoped per-session so cleanup is easy (just delete
// the folder when the game ends — same pattern as HLS device-stream segments).
//
// POST /api/rooms/:id/game-assets
//
// Form fields:
//   file        — the image/GIF binary
//   session_id  — the active watch session ID (for scoped storage path)
//   asset_type  — "character_image" | "move_gif"
//
// Returns: { url: "<absolute or relative URL>" }
func UploadGameAssetHandler(c *gin.Context) {
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	userID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user"})
		return
	}

	roomID := c.Param("id")
	sessionID := c.PostForm("session_id")
	assetType := c.PostForm("asset_type")

	if roomID == "" || sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "room_id and session_id are required"})
		return
	}
	if assetType != "character_image" && assetType != "move_gif" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "asset_type must be character_image or move_gif"})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no file provided"})
		return
	}
	defer file.Close()

	// Validate content type
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/jpeg"
	}
	allowed := map[string]bool{
		"image/jpeg": true, "image/jpg": true, "image/png": true,
		"image/gif": true, "image/webp": true,
	}
	// Accept by extension if content-type is generic
	ext := strings.ToLower(filepath.Ext(header.Filename))
	extToMime := map[string]string{
		".jpg": "image/jpeg", ".jpeg": "image/jpeg",
		".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
	}
	if !allowed[contentType] {
		if m, ok := extToMime[ext]; ok {
			contentType = m
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported file type"})
			return
		}
	}

	// Max 5 MB
	const maxSize = 5 * 1024 * 1024
	limitedReader := io.LimitReader(file, maxSize+1)
	data, err := io.ReadAll(limitedReader)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
		return
	}
	if len(data) > maxSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file too large (max 5 MB)"})
		return
	}

	ts := time.Now().UnixMilli()
	filename := fmt.Sprintf("%d_%d_%s%s", userID, ts, assetType, ext)

	if !utils.IsLocalDev() {
		// Production: upload to BunnyCDN under game_assets/sessions/{sessionID}/
		remotePath := fmt.Sprintf("game_assets/sessions/%s/%s", sessionID, filename)
		cdnURL, err := utils.UploadBytesWithPath(data, remotePath, contentType)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "upload failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"url": cdnURL})
		return
	}

	// Local dev: save to uploads/game_assets/sessions/{sessionID}/
	dir := filepath.Join("uploads", "game_assets", "sessions", sessionID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create directory"})
		return
	}
	localPath := filepath.Join(dir, filename)
	if err := os.WriteFile(localPath, data, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save file"})
		return
	}
	// Return a relative URL served by the static handler
	c.JSON(http.StatusOK, gin.H{"url": "/" + strings.ReplaceAll(localPath, string(os.PathSeparator), "/")})
}
