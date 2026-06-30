package handlers

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
)

// TranscodeDemoMediaHandler transcodes incompatible demo media files (.rmvb, .avi, .mkv, .mov)
// to browser-compatible .mp4. Runs as a background job; responds with a job-accepted 202.
// Only super_admin can trigger this.
func TranscodeDemoMediaHandler(c *gin.Context) {
	// Package-level DB var (set from main.go), not c.MustGet("db") — no middleware in
	// this codebase ever injects a "db" key into the gin Context, so that call panicked
	// unconditionally every time this handler was hit, with Gin's recovery middleware
	// turning it into a bare 500 with no body and no useful log line. Every handler
	// elsewhere in this codebase already uses this same package-level DB directly.
	db := DB

	// c.Get("user_role") is never set by anything in this codebase — AuthMiddleware
	// only ever sets "user_id" (see auth.go). That made this check 403 unconditionally,
	// for every caller, regardless of their real role — the second of two independent
	// "this admin endpoint never actually worked" bugs found alongside the db-context
	// panic above. Every other super_admin check in this codebase (rooms.go, posts.go)
	// instead re-fetches the user by ID and calls IsSuperAdmin() — same fix here.
	userIDVal, ok := c.Get("user_id")
	userID, ok2 := userIDVal.(uint)
	if !ok || !ok2 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	var requestingUser models.User
	if err := db.First(&requestingUser, userID).Error; err != nil || !requestingUser.IsSuperAdmin() {
		c.JSON(http.StatusForbidden, gin.H{"error": "super_admin only"})
		return
	}

	// Find all items whose URL ends with an incompatible extension
	incompatibleExts := []string{".rmvb", ".avi", ".mkv", ".mov"}
	var items []models.DemoMediaItem
	if err := db.Where("is_active = true").Order("sort_order ASC, id ASC").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db error"})
		return
	}

	toTranscode := make([]models.DemoMediaItem, 0)
	for _, item := range items {
		ext := strings.ToLower(filepath.Ext(item.URL))
		for _, bad := range incompatibleExts {
			if ext == bad {
				toTranscode = append(toTranscode, item)
				break
			}
		}
	}

	if len(toTranscode) == 0 {
		c.JSON(http.StatusOK, gin.H{"message": "no incompatible files found"})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"message": fmt.Sprintf("transcoding %d file(s) in background", len(toTranscode)),
		"files":   len(toTranscode),
	})

	// Run in background — client gets 202 immediately
	go func() {
		for _, item := range toTranscode {
			if err := transcodeOneDemoItem(db, item); err != nil {
				log.Printf("❌ [DemoTranscode] item %d (%s): %v", item.ID, item.Title, err)
			} else {
				log.Printf("✅ [DemoTranscode] item %d (%s) done", item.ID, item.Title)
			}
		}
		log.Printf("✅ [DemoTranscode] all done")
	}()
}

// ExtractDemoPostersHandler extracts a thumbnail frame from each demo media item
// that has a video URL but no poster_url. Runs as a background job.
func ExtractDemoPostersHandler(c *gin.Context) {
	db := DB // see TranscodeDemoMediaHandler's comment above for why not c.MustGet("db")

	// See TranscodeDemoMediaHandler's comment above — c.Get("user_role") is never set
	// by anything in this codebase, same fix applies here.
	userIDVal, ok := c.Get("user_id")
	userID, ok2 := userIDVal.(uint)
	if !ok || !ok2 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	var requestingUser models.User
	if err := db.First(&requestingUser, userID).Error; err != nil || !requestingUser.IsSuperAdmin() {
		c.JSON(http.StatusForbidden, gin.H{"error": "super_admin only"})
		return
	}

	var items []models.DemoMediaItem
	if err := db.Where("is_active = true AND (poster_url IS NULL OR poster_url = '')").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db error"})
		return
	}

	if len(items) == 0 {
		c.JSON(http.StatusOK, gin.H{"message": "all items already have posters"})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"message": fmt.Sprintf("extracting posters for %d item(s) in background", len(items)),
		"files":   len(items),
	})

	go func() {
		for _, item := range items {
			if err := extractDemoPoster(db, item); err != nil {
				log.Printf("❌ [DemoPoster] item %d (%s): %v", item.ID, item.Title, err)
			} else {
				log.Printf("✅ [DemoPoster] item %d (%s) poster extracted", item.ID, item.Title)
			}
		}
		log.Printf("✅ [DemoPoster] all done")
	}()
}

// transcodeOneDemoItem downloads, transcodes, re-uploads, and updates the DB for one item.
func transcodeOneDemoItem(db *gorm.DB, item models.DemoMediaItem) error {
	ext := strings.ToLower(filepath.Ext(item.URL))

	// Download original from CDN
	tmpIn, err := utils.DownloadFileToTemp(item.URL, ext)
	if err != nil {
		return fmt.Errorf("download: %w", err)
	}
	defer os.Remove(tmpIn)

	// Transcode to MP4
	tmpOut := tmpIn + ".mp4"
	defer os.Remove(tmpOut)

	if err := utils.TranscodeToMp4(tmpIn, tmpOut, "", ""); err != nil {
		return fmt.Errorf("transcode: %w", err)
	}

	// Build remote path: keep same subfolder, replace extension
	// e.g. https://...b-cdn.net/demo_media_library/Anime/DBZ_ep1.rmvb
	//   → demo_media_library/Anime/DBZ_ep1.mp4
	remotePath := buildTranscodedRemotePath(item.URL)

	// Upload to CDN
	publicURL, err := utils.UploadLocalFileToBunnyCDN(tmpOut, remotePath, "video/mp4")
	if err != nil {
		return fmt.Errorf("upload: %w", err)
	}

	// Update DB
	if err := db.Model(&item).Updates(map[string]interface{}{
		"url":        publicURL,
		"updated_at": time.Now(),
	}).Error; err != nil {
		return fmt.Errorf("db update: %w", err)
	}

	// Also extract poster from the new MP4
	_ = extractDemoPoster(db, models.DemoMediaItem{
		ID:    item.ID,
		Title: item.Title,
		URL:   publicURL,
	})

	return nil
}

// extractDemoPoster uses ffmpeg to pull a single JPEG frame at 5 seconds,
// uploads it to CDN, and stores the URL on the item row.
func extractDemoPoster(db *gorm.DB, item models.DemoMediaItem) error {
	// Download video to temp file so ffmpeg can seek reliably
	ext := strings.ToLower(filepath.Ext(item.URL))
	if ext == "" {
		ext = ".mp4"
	}
	tmpVid, err := utils.DownloadFileToTemp(item.URL, ext)
	if err != nil {
		return fmt.Errorf("download for poster: %w", err)
	}
	defer os.Remove(tmpVid)

	// Extract frame at 5s
	tmpJpg := tmpVid + ".jpg"
	defer os.Remove(tmpJpg)

	cmd := exec.Command("ffmpeg", "-y",
		"-ss", "5",
		"-i", tmpVid,
		"-frames:v", "1",
		"-q:v", "3",
		tmpJpg,
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("ffmpeg frame extract: %w (output: %s)", err, string(out))
	}

	// Upload to CDN
	remotePath := fmt.Sprintf("demo_media_library/posters/%d.jpg", item.ID)
	posterURL, err := utils.UploadLocalFileToBunnyCDN(tmpJpg, remotePath, "image/jpeg")
	if err != nil {
		return fmt.Errorf("upload poster: %w", err)
	}

	// Update DB
	return db.Model(&models.DemoMediaItem{}).Where("id = ?", item.ID).
		Update("poster_url", posterURL).Error
}

// buildTranscodedRemotePath converts a CDN pull-zone URL to a storage path with .mp4 extension.
// "https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/DBZ.rmvb"
//   → "demo_media_library/Anime/DBZ.mp4"
func buildTranscodedRemotePath(cdnURL string) string {
	// Strip scheme + host (anything before the first path segment)
	idx := strings.Index(cdnURL, ".b-cdn.net/")
	if idx < 0 {
		// fallback: strip "https://" and take everything after first "/"
		idx = strings.Index(cdnURL, "//")
		if idx >= 0 {
			rest := cdnURL[idx+2:]
			slash := strings.Index(rest, "/")
			if slash >= 0 {
				cdnURL = rest[slash+1:]
			}
		}
	} else {
		cdnURL = cdnURL[idx+len(".b-cdn.net/"):]
	}

	ext := filepath.Ext(cdnURL)
	return strings.TrimSuffix(cdnURL, ext) + ".mp4"
}
