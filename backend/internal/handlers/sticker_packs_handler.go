package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
)

// GetUserStickerPacksHandler — GET /api/stickers/packs
// Returns all packs the user owns or has added, with their sticker items.
func GetUserStickerPacksHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(uint)
	db := c.MustGet("db").(*gorm.DB)

	// Collect pack IDs from both user_sticker_packs (added/imported) and creator
	var addedIDs []uint
	db.Model(&models.UserStickerPack{}).Where("user_id = ?", userID).Pluck("pack_id", &addedIDs)

	var createdIDs []uint
	db.Model(&models.StickerPack{}).Where("creator_user_id = ?", userID).Pluck("id", &createdIDs)

	idSet := make(map[uint]struct{})
	for _, id := range append(addedIDs, createdIDs...) {
		idSet[id] = struct{}{}
	}
	if len(idSet) == 0 {
		c.JSON(200, gin.H{"packs": []interface{}{}})
		return
	}

	mergedIDs := make([]uint, 0, len(idSet))
	for id := range idSet {
		mergedIDs = append(mergedIDs, id)
	}

	var packs []models.StickerPack
	db.Preload("Items", func(tx *gorm.DB) *gorm.DB {
		return tx.Order("sort_order ASC, id ASC")
	}).Where("id IN ?", mergedIDs).Order("created_at DESC").Find(&packs)

	c.JSON(200, gin.H{"packs": packs})
}

// CreateStickerPackHandler — POST /api/stickers/packs
func CreateStickerPackHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(uint)
	db := c.MustGet("db").(*gorm.DB)

	var req struct {
		Name string `json:"name" binding:"required,max=100"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	pack := models.StickerPack{
		Name:          req.Name,
		Source:        "user",
		CreatorUserID: &userID,
	}
	if err := db.Create(&pack).Error; err != nil {
		c.JSON(500, gin.H{"error": "failed to create pack"})
		return
	}
	db.FirstOrCreate(&models.UserStickerPack{UserID: userID, PackID: pack.ID},
		models.UserStickerPack{UserID: userID, PackID: pack.ID})

	c.JSON(201, gin.H{"pack": pack})
}

// AddStickerToPackHandler — POST /api/stickers/packs/:pack_id/stickers
func AddStickerToPackHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(uint)
	db := c.MustGet("db").(*gorm.DB)

	packIDU, err := strconv.ParseUint(c.Param("pack_id"), 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid pack id"})
		return
	}
	packID := uint(packIDU)

	var pack models.StickerPack
	if err := db.First(&pack, packID).Error; err != nil {
		c.JSON(404, gin.H{"error": "pack not found"})
		return
	}
	if pack.CreatorUserID == nil || *pack.CreatorUserID != userID {
		c.JSON(403, gin.H{"error": "you don't own this pack"})
		return
	}

	file, header, err := c.Request.FormFile("image")
	if err != nil {
		c.JSON(400, gin.H{"error": "image field required"})
		return
	}
	defer file.Close()

	if header.Size > 2*1024*1024 {
		c.JSON(400, gin.H{"error": "image must be under 2 MB"})
		return
	}

	ct := header.Header.Get("Content-Type")
	ext := "webp"
	switch ct {
	case "image/png":
		ext = "png"
	case "image/jpeg":
		ext = "jpg"
	case "image/gif":
		ext = "gif"
	default:
		ct = "image/webp"
	}

	data, err := io.ReadAll(file)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to read file"})
		return
	}

	remotePath := fmt.Sprintf("stickers/packs/%d/sticker_%d.%s", packID, time.Now().UnixMilli(), ext)
	cdnURL, err := utils.UploadBytesWithPath(data, remotePath, ct)
	if err != nil {
		c.JSON(500, gin.H{"error": "upload failed"})
		return
	}

	item := models.StickerItem{
		PackID:    packID,
		URL:       cdnURL,
		SortOrder: pack.StickerCount,
	}
	if err := db.Create(&item).Error; err != nil {
		c.JSON(500, gin.H{"error": "failed to save sticker"})
		return
	}

	updates := map[string]interface{}{"sticker_count": gorm.Expr("sticker_count + 1")}
	if pack.ThumbnailURL == "" {
		updates["thumbnail_url"] = cdnURL
	}
	db.Model(&pack).Updates(updates)

	c.JSON(201, gin.H{"item": item})
}

// RemoveStickerFromPackHandler — DELETE /api/stickers/packs/:pack_id/stickers/:sticker_id
func RemoveStickerFromPackHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(uint)
	db := c.MustGet("db").(*gorm.DB)

	packIDU, _ := strconv.ParseUint(c.Param("pack_id"), 10, 64)
	stickerIDU, _ := strconv.ParseUint(c.Param("sticker_id"), 10, 64)

	var pack models.StickerPack
	if err := db.First(&pack, packIDU).Error; err != nil {
		c.JSON(404, gin.H{"error": "pack not found"})
		return
	}
	if pack.CreatorUserID == nil || *pack.CreatorUserID != userID {
		c.JSON(403, gin.H{"error": "you don't own this pack"})
		return
	}

	db.Delete(&models.StickerItem{}, stickerIDU)
	db.Model(&pack).Update("sticker_count", gorm.Expr("GREATEST(0, sticker_count - 1)"))

	c.JSON(200, gin.H{"ok": true})
}

// PublishStickerPackHandler — POST /api/stickers/packs/:pack_id/publish  (toggles is_public)
func PublishStickerPackHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(uint)
	db := c.MustGet("db").(*gorm.DB)

	packIDU, _ := strconv.ParseUint(c.Param("pack_id"), 10, 64)

	var pack models.StickerPack
	if err := db.First(&pack, packIDU).Error; err != nil {
		c.JSON(404, gin.H{"error": "pack not found"})
		return
	}
	if pack.CreatorUserID == nil || *pack.CreatorUserID != userID {
		c.JSON(403, gin.H{"error": "you don't own this pack"})
		return
	}

	newVal := !pack.IsPublic
	db.Model(&pack).Update("is_public", newVal)
	c.JSON(200, gin.H{"is_public": newVal})
}

// AddCommunityPackHandler — POST /api/stickers/packs/:pack_id/add
func AddCommunityPackHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(uint)
	db := c.MustGet("db").(*gorm.DB)

	packIDU, _ := strconv.ParseUint(c.Param("pack_id"), 10, 64)
	packID := uint(packIDU)

	var pack models.StickerPack
	if err := db.First(&pack, packID).Error; err != nil {
		c.JSON(404, gin.H{"error": "pack not found"})
		return
	}
	if !pack.IsPublic {
		c.JSON(403, gin.H{"error": "pack is not public"})
		return
	}

	link := models.UserStickerPack{UserID: userID, PackID: packID}
	db.Where("user_id = ? AND pack_id = ?", userID, packID).FirstOrCreate(&link)
	c.JSON(200, gin.H{"ok": true})
}

// GetCommunityPacksHandler — GET /api/stickers/community
func GetCommunityPacksHandler(c *gin.Context) {
	db := c.MustGet("db").(*gorm.DB)

	var packs []models.StickerPack
	db.Where("is_public = true AND sticker_count > 0").
		Order("sticker_count DESC, created_at DESC").
		Limit(50).
		Find(&packs)

	c.JSON(200, gin.H{"packs": packs})
}

// ImportTelegramPackHandler — POST /api/stickers/import/telegram
// Fetches a Telegram sticker pack by name/URL, downloads each .webp sticker to BunnyCDN,
// and adds the pack to the requesting user's collection.
func ImportTelegramPackHandler(c *gin.Context) {
	botToken := os.Getenv("TELEGRAM_BOT_TOKEN")
	if botToken == "" {
		c.JSON(503, gin.H{"error": "Telegram import not configured — add TELEGRAM_BOT_TOKEN to Railway vars"})
		return
	}

	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(uint)
	db := c.MustGet("db").(*gorm.DB)

	var req struct {
		URL string `json:"url" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	// Extract pack slug from t.me/addstickers/PackName URL or use as-is
	packSlug := strings.TrimSpace(req.URL)
	if idx := strings.LastIndex(packSlug, "addstickers/"); idx >= 0 {
		packSlug = strings.TrimRight(packSlug[idx+len("addstickers/"):], "/")
	}
	packSlug = strings.Trim(packSlug, "/")
	if packSlug == "" {
		c.JSON(400, gin.H{"error": "invalid pack URL or name"})
		return
	}

	// Return cached pack if already imported
	var existing models.StickerPack
	if err := db.Where("telegram_slug = ?", packSlug).First(&existing).Error; err == nil {
		db.Where("user_id = ? AND pack_id = ?", userID, existing.ID).
			FirstOrCreate(&models.UserStickerPack{UserID: userID, PackID: existing.ID})
		db.Preload("Items", func(tx *gorm.DB) *gorm.DB { return tx.Order("sort_order ASC") }).
			First(&existing, existing.ID)
		c.JSON(200, gin.H{"pack": existing, "cached": true})
		return
	}

	// Telegram API types
	type tgSticker struct {
		FileID     string `json:"file_id"`
		IsAnimated bool   `json:"is_animated"`
		IsVideo    bool   `json:"is_video"`
		Emoji      string `json:"emoji"`
	}
	type tgSet struct {
		Title    string      `json:"title"`
		Stickers []tgSticker `json:"stickers"`
	}
	type tgSetResp struct {
		OK     bool  `json:"ok"`
		Result tgSet `json:"result"`
	}
	type tgFileResult struct {
		FilePath string `json:"file_path"`
	}
	type tgFileResp struct {
		OK     bool          `json:"ok"`
		Result tgFileResult  `json:"result"`
	}

	// getStickerSet
	setResp, err := http.Get(fmt.Sprintf(
		"https://api.telegram.org/bot%s/getStickerSet?name=%s", botToken, packSlug,
	))
	if err != nil || setResp.StatusCode != 200 {
		c.JSON(400, gin.H{"error": "sticker pack not found — check the name"})
		return
	}
	defer setResp.Body.Close()

	var tgResp tgSetResp
	if err := json.NewDecoder(setResp.Body).Decode(&tgResp); err != nil || !tgResp.OK {
		c.JSON(400, gin.H{"error": "invalid response from Telegram"})
		return
	}

	// Create pack record first so we have an ID for BunnyCDN paths
	pack := models.StickerPack{
		Name:         tgResp.Result.Title,
		Source:       "telegram",
		TelegramSlug: packSlug,
	}
	if err := db.Create(&pack).Error; err != nil {
		c.JSON(500, gin.H{"error": "failed to create pack"})
		return
	}

	// Download + upload at most 50 static (.webp) stickers concurrently
	stickers := tgResp.Result.Stickers
	if len(stickers) > 50 {
		stickers = stickers[:50]
	}

	type result struct {
		item models.StickerItem
		err  error
	}
	sem := make(chan struct{}, 5)
	results := make([]result, len(stickers))
	var wg sync.WaitGroup

	for i, s := range stickers {
		if s.IsAnimated || s.IsVideo {
			continue // skip Lottie / WebM stickers
		}
		wg.Add(1)
		go func(idx int, stk tgSticker) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			// getFile
			fr, err := http.Get(fmt.Sprintf(
				"https://api.telegram.org/bot%s/getFile?file_id=%s", botToken, stk.FileID,
			))
			if err != nil {
				results[idx] = result{err: err}
				return
			}
			defer fr.Body.Close()

			var fResp tgFileResp
			if err := json.NewDecoder(fr.Body).Decode(&fResp); err != nil || !fResp.OK {
				results[idx] = result{err: fmt.Errorf("getFile failed")}
				return
			}

			// Download the WebP
			dr, err := http.Get(fmt.Sprintf(
				"https://api.telegram.org/file/bot%s/%s", botToken, fResp.Result.FilePath,
			))
			if err != nil {
				results[idx] = result{err: err}
				return
			}
			defer dr.Body.Close()

			data, err := io.ReadAll(dr.Body)
			if err != nil {
				results[idx] = result{err: err}
				return
			}

			remotePath := fmt.Sprintf("stickers/packs/%d/%d_%d.webp", pack.ID, idx, time.Now().UnixMilli())
			cdnURL, err := utils.UploadBytesWithPath(data, remotePath, "image/webp")
			if err != nil {
				results[idx] = result{err: err}
				return
			}

			results[idx] = result{item: models.StickerItem{
				PackID:    pack.ID,
				URL:       cdnURL,
				Emoji:     stk.Emoji,
				SortOrder: idx,
			}}
		}(i, s)
	}
	wg.Wait()

	var items []models.StickerItem
	for _, r := range results {
		if r.err == nil && r.item.URL != "" {
			items = append(items, r.item)
		}
	}

	if len(items) > 0 {
		db.Create(&items)
		db.Model(&pack).Updates(map[string]interface{}{
			"sticker_count": len(items),
			"thumbnail_url": items[0].URL,
		})
	}

	// Add to user's collection
	db.FirstOrCreate(&models.UserStickerPack{UserID: userID, PackID: pack.ID},
		models.UserStickerPack{UserID: userID, PackID: pack.ID})

	pack.Items = items
	log.Printf("✅ [Stickers] Imported Telegram pack '%s' — %d stickers", packSlug, len(items))
	c.JSON(201, gin.H{"pack": pack, "stickers_imported": len(items)})
}
