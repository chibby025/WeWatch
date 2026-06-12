package handlers

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
)

// statusCleanupTimers holds the pending AfterFunc timers keyed by status ID.
// On server restart these are lost — CleanupExpiredStatusMedia (called from the
// existing cleanup goroutine) acts as the fallback sweep.
var statusCleanupTimers sync.Map // key: uint → *time.Timer

// ── Response types ────────────────────────────────────────────────────────────

type StatusFeedUser struct {
	UserID    uint             `json:"user_id"`
	Username  string           `json:"username"`
	AvatarURL string           `json:"avatar_url"`
	HasUnseen bool             `json:"has_unseen"`
	Statuses  []StatusFeedItem `json:"statuses"`
}

type StatusFeedItem struct {
	ID           uint      `json:"id"`
	StatusType   string    `json:"status_type"`
	TextContent  string    `json:"text_content,omitempty"`
	MediaURL     string    `json:"media_url,omitempty"`
	BgColor      string    `json:"bg_color"`
	Visibility   string    `json:"visibility"`
	RoomID       *uint     `json:"room_id,omitempty"`
	RoomName     string    `json:"room_name,omitempty"`
	SessionID    *uint     `json:"session_id,omitempty"`
	SessionTitle string    `json:"session_title,omitempty"`
	ExpiresAt    time.Time `json:"expires_at"`
	ViewCount    int       `json:"view_count"`
	LikeCount    int       `json:"like_count"`
	HasViewed    bool      `json:"has_viewed"`
	HasLiked     bool      `json:"has_liked"`
	CreatedAt    time.Time `json:"created_at"`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func buildStatusFeedItem(s models.UserStatus, hasViewed bool, likeCount int, hasLiked bool) StatusFeedItem {
	return StatusFeedItem{
		ID: s.ID, StatusType: s.StatusType, TextContent: s.TextContent,
		MediaURL: s.MediaURL, BgColor: s.BgColor, Visibility: s.Visibility,
		RoomID: s.RoomID, RoomName: s.RoomName,
		SessionID: s.SessionID, SessionTitle: s.SessionTitle,
		ExpiresAt: s.ExpiresAt, ViewCount: s.ViewCount,
		LikeCount: likeCount, HasViewed: hasViewed, HasLiked: hasLiked,
		CreatedAt: s.CreatedAt,
	}
}

// scheduleStatusCleanup fires a one-shot timer to delete the BunnyCDN file
// exactly when the status expires. If delay ≤ 0 the cleanup runs immediately.
func scheduleStatusCleanup(statusID uint, mediaURL string, expiresAt time.Time) {
	delay := time.Until(expiresAt)
	run := func() {
		deleteStatusMedia(statusID, mediaURL)
		statusCleanupTimers.Delete(statusID)
	}
	if delay <= 0 {
		go run()
		return
	}
	t := time.AfterFunc(delay, run)
	statusCleanupTimers.Store(statusID, t)
}

// deleteStatusMedia removes the BunnyCDN file and nullifies media_url in the DB.
func deleteStatusMedia(statusID uint, mediaURL string) {
	if mediaURL == "" {
		return
	}
	parts := strings.Split(mediaURL, "/")
	if len(parts) > 0 {
		filename := parts[len(parts)-1]
		if err := utils.DeleteFromBunnyCDN(filename); err != nil {
			log.Printf("[StatusCleanup] BunnyCDN delete failed for status %d: %v", statusID, err)
		}
	}
	DB.Model(&models.UserStatus{}).Where("id = ?", statusID).Update("media_url", "")
}

// CleanupExpiredStatusMedia is called by the existing 5-minute cleanup goroutine
// as a fallback for timers that were lost during a server restart.
func CleanupExpiredStatusMedia() {
	var expired []models.UserStatus
	DB.Where("expires_at < ? AND media_url != ''", time.Now()).Find(&expired)
	for _, s := range expired {
		deleteStatusMedia(s.ID, s.MediaURL)
	}
	// Hard-delete fully expired rows (DB keeps them 1h past expiry as safety margin)
	DB.Where("expires_at < ?", time.Now().Add(-1*time.Hour)).Delete(&models.UserStatus{})
}

// ── Handlers ─────────────────────────────────────────────────────────────────

// POST /api/statuses
func CreateStatusHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID, ok := userIDVal.(uint)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// Enforce 5 active statuses per user
	var activeCount int64
	DB.Model(&models.UserStatus{}).
		Where("user_id = ? AND expires_at > ?", userID, time.Now()).
		Count(&activeCount)
	if activeCount >= 5 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "You already have 5 active statuses. Delete one before posting another."})
		return
	}

	statusType := c.PostForm("status_type")
	if statusType == "" {
		statusType = "text"
	}

	visibility := c.PostForm("visibility")
	if visibility != "public" {
		visibility = "friends"
	}

	bgColor := c.PostForm("bg_color")
	if bgColor == "" {
		bgColor = "#7c3aed"
	}

	expiresAt := time.Now().Add(24 * time.Hour)

	status := models.UserStatus{
		UserID:     userID,
		StatusType: statusType,
		BgColor:    bgColor,
		Visibility: visibility,
		ExpiresAt:  expiresAt,
	}

	switch statusType {
	case "text":
		text := c.PostForm("text_content")
		if text == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "text_content required"})
			return
		}
		status.TextContent = text

	case "image":
		file, fileHeader, err := c.Request.FormFile("media")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "media file required"})
			return
		}

		ct := fileHeader.Header.Get("Content-Type")
		isGIF := ct == "image/gif"

		if isGIF {
			// GIFs: upload raw to preserve animation — hard cap at 3 MB
			if fileHeader.Size > 3*1024*1024 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "GIF must be under 3 MB"})
				return
			}
			raw, err := io.ReadAll(file)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
				return
			}
			filename := fmt.Sprintf("status_%d_%d.gif", userID, time.Now().Unix())
			mediaURL, err := utils.UploadToBunnyCDN(raw, filename, "image/gif")
			if err != nil {
				log.Printf("[CreateStatus] BunnyCDN GIF upload failed: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "upload failed"})
				return
			}
			status.MediaURL = mediaURL
		} else {
			// Static images: accept up to 20 MB raw, compress to JPEG ≤ 450 KB
			if fileHeader.Size > 20*1024*1024 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "image must be under 20 MB"})
				return
			}
			raw, err := io.ReadAll(file)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
				return
			}
			compressed, compCT := utils.CompressStatusImage(raw)
			log.Printf("[CreateStatus] image compressed: %d bytes → %d bytes", len(raw), len(compressed))
			filename := fmt.Sprintf("status_%d_%d.jpg", userID, time.Now().Unix())
			mediaURL, err := utils.UploadToBunnyCDN(compressed, filename, compCT)
			if err != nil {
				log.Printf("[CreateStatus] BunnyCDN upload failed: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "upload failed"})
				return
			}
			status.MediaURL = mediaURL
		}
		status.TextContent = c.PostForm("text_content") // optional caption

	case "session":
		if roomIDStr := c.PostForm("room_id"); roomIDStr != "" {
			if v, err := strconv.ParseUint(roomIDStr, 10, 64); err == nil {
				rid := uint(v)
				status.RoomID = &rid
			}
		}
		if sessionIDStr := c.PostForm("session_id"); sessionIDStr != "" {
			if v, err := strconv.ParseUint(sessionIDStr, 10, 64); err == nil {
				sid := uint(v)
				status.SessionID = &sid
			}
		}
		status.RoomName = c.PostForm("room_name")
		status.SessionTitle = c.PostForm("session_title")
		status.TextContent = c.PostForm("text_content")

	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status_type"})
		return
	}

	if err := DB.Create(&status).Error; err != nil {
		log.Printf("[CreateStatus] DB error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create status"})
		return
	}

	// Schedule event-driven BunnyCDN cleanup for image statuses
	if status.MediaURL != "" {
		scheduleStatusCleanup(status.ID, status.MediaURL, status.ExpiresAt)
	}

	c.JSON(http.StatusCreated, gin.H{"status": buildStatusFeedItem(status, false, 0, false)})
}

// GET /api/statuses/feed
func GetStatusFeedHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID, ok := userIDVal.(uint)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	now := time.Now()

	var friendIDs []uint
	type row struct{ ID uint }
	DB.Raw(`
		SELECT CASE WHEN requester_id = ? THEN recipient_id ELSE requester_id END AS id
		FROM friendships
		WHERE status = 'accepted' AND (requester_id = ? OR recipient_id = ?)
	`, userID, userID, userID).Scan(&friendIDs)

	allIDs := append([]uint{userID}, friendIDs...)

	// Fetch non-expired statuses from friends+self, excluding any where the
	// current user has been blocked by the owner's exclusion list.
	var statuses []models.UserStatus
	DB.Where(`
		user_id IN ? AND expires_at > ?
		AND NOT EXISTS (
			SELECT 1 FROM user_status_exclusions
			WHERE owner_user_id = user_statuses.user_id
			  AND excluded_user_id = ?
		)`, allIDs, now, userID).
		Order("user_id, created_at ASC").
		Find(&statuses)

	if len(statuses) == 0 {
		c.JSON(http.StatusOK, gin.H{"feed": []StatusFeedUser{}})
		return
	}

	statusIDs := make([]uint, len(statuses))
	for i, s := range statuses {
		statusIDs[i] = s.ID
	}
	var viewedIDs []uint
	DB.Model(&models.UserStatusView{}).
		Where("viewer_id = ? AND status_id IN ?", userID, statusIDs).
		Pluck("status_id", &viewedIDs)
	viewedSet := make(map[uint]bool, len(viewedIDs))
	for _, id := range viewedIDs {
		viewedSet[id] = true
	}

	// Batch-load like counts and whether current user liked each status
	type likeRow struct {
		StatusID uint
		Cnt      int
	}
	var likeCounts []likeRow
	DB.Model(&models.UserStatusLike{}).
		Select("status_id, COUNT(*) as cnt").
		Where("status_id IN ?", statusIDs).
		Group("status_id").
		Scan(&likeCounts)
	likeCountMap := make(map[uint]int, len(likeCounts))
	for _, r := range likeCounts {
		likeCountMap[r.StatusID] = r.Cnt
	}
	var myLikedIDs []uint
	DB.Model(&models.UserStatusLike{}).
		Where("user_id = ? AND status_id IN ?", userID, statusIDs).
		Pluck("status_id", &myLikedIDs)
	myLikedSet := make(map[uint]bool, len(myLikedIDs))
	for _, id := range myLikedIDs {
		myLikedSet[id] = true
	}

	authorIDSet := make(map[uint]bool)
	for _, s := range statuses {
		authorIDSet[s.UserID] = true
	}
	authorIDs := make([]uint, 0, len(authorIDSet))
	for id := range authorIDSet {
		authorIDs = append(authorIDs, id)
	}
	var users []models.User
	DB.Select("id, username, avatar_url").Where("id IN ?", authorIDs).Find(&users)
	userMap := make(map[uint]models.User, len(users))
	for _, u := range users {
		userMap[u.ID] = u
	}

	byUser := make(map[uint]*StatusFeedUser)
	for _, s := range statuses {
		u := userMap[s.UserID]
		entry, exists := byUser[s.UserID]
		if !exists {
			entry = &StatusFeedUser{
				UserID:    s.UserID,
				Username:  u.Username,
				AvatarURL: u.AvatarURL,
			}
			byUser[s.UserID] = entry
		}
		item := buildStatusFeedItem(s, viewedSet[s.ID], likeCountMap[s.ID], myLikedSet[s.ID])
		entry.Statuses = append(entry.Statuses, item)
		if !viewedSet[s.ID] {
			entry.HasUnseen = true
		}
	}

	// Own entry first, then unseen-first ordering for friends
	result := make([]StatusFeedUser, 0, len(byUser))
	if own, ok := byUser[userID]; ok {
		result = append(result, *own)
	}
	for uid, entry := range byUser {
		if uid == userID {
			continue
		}
		if entry.HasUnseen {
			result = append([]StatusFeedUser{*entry}, result...)
		} else {
			result = append(result, *entry)
		}
	}
	// Re-pin own to front if unseen-first reordering displaced it
	if len(result) > 1 && result[0].UserID != userID {
		for i, r := range result {
			if r.UserID == userID {
				result = append([]StatusFeedUser{r}, append(result[:i], result[i+1:]...)...)
				break
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"feed": result})
}

// DELETE /api/statuses/:id
func DeleteStatusHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID, ok := userIDVal.(uint)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	statusID := uint(id)

	var s models.UserStatus
	if err := DB.Where("id = ? AND user_id = ?", statusID, userID).First(&s).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "status not found"})
		return
	}

	// Cancel the scheduled cleanup timer and delete BunnyCDN file immediately
	if v, loaded := statusCleanupTimers.LoadAndDelete(statusID); loaded {
		v.(*time.Timer).Stop()
	}
	if s.MediaURL != "" {
		go deleteStatusMedia(statusID, s.MediaURL)
	}

	DB.Where("status_id = ?", statusID).Delete(&models.UserStatusView{})
	DB.Delete(&s)

	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// POST /api/statuses/:id/view
func MarkStatusViewedHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID, ok := userIDVal.(uint)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	statusID := uint(id)

	view := models.UserStatusView{StatusID: statusID, ViewerID: userID}
	result := DB.Where(models.UserStatusView{StatusID: statusID, ViewerID: userID}).FirstOrCreate(&view)
	if result.RowsAffected > 0 {
		DB.Model(&models.UserStatus{}).Where("id = ?", statusID).
			UpdateColumn("view_count", DB.Raw("view_count + 1"))
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GET /api/statuses/privacy
// Returns the list of friend IDs the current user has excluded from their statuses.
func GetStatusPrivacyHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID, ok := userIDVal.(uint)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	var excludedIDs []uint
	DB.Model(&models.UserStatusExclusion{}).
		Where("owner_user_id = ?", userID).
		Pluck("excluded_user_id", &excludedIDs)
	c.JSON(http.StatusOK, gin.H{"excluded_ids": excludedIDs})
}

// PUT /api/statuses/privacy
// Replaces the caller's exclusion list with the provided friend IDs.
// Body: { "excluded_ids": [1, 2, 3] }
func UpdateStatusPrivacyHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID, ok := userIDVal.(uint)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var body struct {
		ExcludedIDs []uint `json:"excluded_ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	// Replace atomically in a transaction
	tx := DB.Begin()
	if err := tx.Where("owner_user_id = ?", userID).Delete(&models.UserStatusExclusion{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update privacy"})
		return
	}
	for _, excludedID := range body.ExcludedIDs {
		if excludedID == userID {
			continue // never exclude yourself
		}
		if err := tx.Create(&models.UserStatusExclusion{
			OwnerUserID:    userID,
			ExcludedUserID: excludedID,
		}).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update privacy"})
			return
		}
	}
	tx.Commit()
	c.JSON(http.StatusOK, gin.H{"excluded_ids": body.ExcludedIDs})
}

// POST /api/statuses/:id/like — toggle like, returns {has_liked, like_count}
func LikeStatusHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID, ok := userIDVal.(uint)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	statusID := uint(id)

	// Verify the status exists and is not expired
	var s models.UserStatus
	if err := DB.Where("id = ? AND expires_at > ?", statusID, time.Now()).First(&s).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "status not found"})
		return
	}

	var existing models.UserStatusLike
	err = DB.Where("status_id = ? AND user_id = ?", statusID, userID).First(&existing).Error
	hasLiked := false
	if err == nil {
		// Already liked — remove it
		DB.Delete(&existing)
	} else {
		// Not liked yet — add it
		DB.Create(&models.UserStatusLike{StatusID: statusID, UserID: userID})
		hasLiked = true
	}

	var likeCount int64
	DB.Model(&models.UserStatusLike{}).Where("status_id = ?", statusID).Count(&likeCount)
	c.JSON(http.StatusOK, gin.H{"has_liked": hasLiked, "like_count": int(likeCount)})
}
