// WeWatch/backend/internal/services/preview_queue.go
package services

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"

	"gorm.io/gorm"
)

// MediaType represents the type of media being played
type MediaType string

const (
	MediaTypeNone      MediaType = "none"
	MediaTypeUpload    MediaType = "upload"
	MediaTypeLiveShare MediaType = "liveshare"
	MediaTypeWatchFrom MediaType = "watchfrom"
)

// PreviewRequest represents a request to generate a preview
type PreviewRequest struct {
	SessionID        string
	MediaID          uint
	MediaPath        string
	IsTemporary      bool
	CurrentTimestamp int // seconds
	MediaType        MediaType
}

// OutgoingMessage represents a WebSocket message
type OutgoingMessage struct {
	Data     []byte
	IsBinary bool
}

// PreviewQueue manages preview generation requests
type PreviewQueue struct {
	queue  chan PreviewRequest
	db     *gorm.DB
	hub    WebSocketHub
	mu     sync.Mutex
	active map[string]bool
	timers map[string]*time.Ticker
}

// WebSocketHub interface for broadcasting messages
type WebSocketHub interface {
	BroadcastToLobby(msg OutgoingMessage)
}

var globalPreviewQueue *PreviewQueue

// InitPreviewQueue initializes the preview queue worker
func InitPreviewQueue(db *gorm.DB, hub WebSocketHub) {
	globalPreviewQueue = &PreviewQueue{
		queue:  make(chan PreviewRequest, 100),
		db:     db,
		hub:    hub,
		active: make(map[string]bool),
		timers: make(map[string]*time.Ticker),
	}
	log.Println("✅ [PreviewQueue] Initialized")
	globalPreviewQueue.start()
}

// GetPreviewQueue returns the global preview queue instance
func GetPreviewQueue() *PreviewQueue {
	return globalPreviewQueue
}

func (pq *PreviewQueue) start() {
	go func() {
		for req := range pq.queue {
			pq.processRequest(req)
		}
	}()
}

// QueuePreview adds a preview request to the queue
func (pq *PreviewQueue) QueuePreview(req PreviewRequest) {
	var session models.WatchSession
	if err := pq.db.Where("session_id = ?", req.SessionID).First(&session).Error; err != nil {
		return
	}
	if !session.PreviewEnabled {
		return
	}

	pq.mu.Lock()
	if pq.active[req.SessionID] {
		pq.mu.Unlock()
		return
	}
	pq.active[req.SessionID] = true
	pq.mu.Unlock()

	pq.queue <- req
}

func (pq *PreviewQueue) processRequest(req PreviewRequest) {
	defer func() {
		pq.mu.Lock()
		delete(pq.active, req.SessionID)
		pq.mu.Unlock()
	}()

	switch req.MediaType {
	case MediaTypeUpload:
		pq.generateUploadPreview(req)
	case MediaTypeLiveShare, MediaTypeWatchFrom:
		// WebRTC previews handled by frame capture system
	}
}

func (pq *PreviewQueue) generateUploadPreview(req PreviewRequest) {
	if _, err := os.Stat(req.MediaPath); os.IsNotExist(err) {
		log.Printf("❌ [PreviewQueue] Media file not found: %s", req.MediaPath)
		return
	}

	// Deterministic filename — same path on every refresh so CDN overwrites cleanly
	baseName := filepath.Base(req.MediaPath)
	ext := filepath.Ext(baseName)
	nameWithoutExt := strings.TrimSuffix(baseName, ext)
	previewFilename := fmt.Sprintf("%s_preview.mp4", nameWithoutExt)

	localPreviewPath := filepath.Join("./uploads/previews", previewFilename)
	os.MkdirAll("./uploads/previews", os.ModePerm)

	// Generate to a temp path so the current preview stays accessible while ffmpeg runs.
	// A looping video element requests the file every 15s; deleting it before the new one
	// is ready causes a 404 → onError → broken preview card.
	tempPreviewPath := localPreviewPath + ".tmp"
	os.Remove(tempPreviewPath)

	startTime := formatSeconds(req.CurrentTimestamp)
	log.Printf("🎬 [PreviewQueue] Generating 15s/540p preview for session %s from %s", req.SessionID, startTime)

	if err := utils.GeneratePreviewMP4(req.MediaPath, tempPreviewPath, startTime, 15); err != nil {
		log.Printf("❌ [PreviewQueue] ffmpeg failed for session %s: %v", req.SessionID, err)
		os.Remove(tempPreviewPath)
		return
	}

	// Promote: CDN upload (prod) or atomic rename (dev).
	previewURL := "/uploads/previews/" + previewFilename
	if utils.BunnyCDNStorageZone != "" && utils.BunnyCDNAccessKey != "" {
		fileData, err := os.ReadFile(tempPreviewPath)
		if err == nil {
			if cdnURL, uploadErr := utils.UploadPreviewToBunnyCDN(fileData, previewFilename); uploadErr == nil {
				previewURL = cdnURL
				os.Remove(tempPreviewPath)
			} else {
				log.Printf("⚠️ [PreviewQueue] CDN upload failed, promoting temp to local: %v", uploadErr)
				if err := os.Rename(tempPreviewPath, localPreviewPath); err != nil {
					log.Printf("❌ [PreviewQueue] Failed to promote preview: %v", err)
					os.Remove(tempPreviewPath)
					return
				}
			}
		}
	} else {
		// Local dev: atomic rename — old file stays readable until the new one is fully written.
		if err := os.Rename(tempPreviewPath, localPreviewPath); err != nil {
			log.Printf("❌ [PreviewQueue] Failed to rename preview: %v", err)
			os.Remove(tempPreviewPath)
			return
		}
		absPath, _ := filepath.Abs(localPreviewPath)
		log.Printf("✅ [PreviewQueue] Preview file written to: %s (url: %s)", absPath, previewURL)
	}

	// Update preview_url on the media item so cached previews are served immediately next time
	if req.IsTemporary {
		pq.db.Model(&models.TemporaryMediaItem{}).Where("id = ?", req.MediaID).
			Updates(map[string]interface{}{"preview_url": previewURL, "preview_generated_at": time.Now()})
	} else {
		pq.db.Model(&models.MediaItem{}).Where("id = ?", req.MediaID).
			Updates(map[string]interface{}{"preview_url": previewURL, "preview_generated_at": time.Now()})
	}

	// Get poster URL
	var posterURL string
	if req.IsTemporary {
		var media models.TemporaryMediaItem
		pq.db.First(&media, req.MediaID)
		posterURL = media.PosterURL
	} else {
		var media models.MediaItem
		pq.db.First(&media, req.MediaID)
		posterURL = media.PosterURL
	}

	// Persist URLs on the session row so members joining mid-session get them immediately
	pq.db.Table("watch_sessions").
		Where("session_id = ?", req.SessionID).
		Updates(map[string]interface{}{"preview_url": previewURL, "poster_url": posterURL})

	pq.broadcastPreviewToLobby(req.SessionID, posterURL, previewURL)
}

func (pq *PreviewQueue) broadcastPreviewToLobby(sessionID, posterURL, previewURL string) {
	broadcastData := map[string]interface{}{
		"type":        "session_preview_updated",
		"session_id":  sessionID,
		"poster_url":  posterURL,
		"preview_url": previewURL,
	}
	broadcastJSON, err := json.Marshal(broadcastData)
	if err != nil {
		return
	}
	pq.hub.BroadcastToLobby(OutgoingMessage{Data: broadcastJSON, IsBinary: false})
}

// StartRefreshTimer starts a periodic preview refresh for a session.
// Interval: 1 min in local dev (no RAILWAY_ENVIRONMENT), 5 min in production.
func (pq *PreviewQueue) StartRefreshTimer(sessionID string) {
	pq.StopRefreshTimer(sessionID)

	interval := 5 * time.Minute
	if os.Getenv("RAILWAY_ENVIRONMENT") == "" {
		interval = 1 * time.Minute
	}

	ticker := time.NewTicker(interval)

	pq.mu.Lock()
	pq.timers[sessionID] = ticker
	pq.mu.Unlock()

	go func() {
		for range ticker.C {
			pq.refreshPreview(sessionID)
		}
	}()
}

func (pq *PreviewQueue) StopRefreshTimer(sessionID string) {
	pq.mu.Lock()
	ticker, exists := pq.timers[sessionID]
	if exists {
		delete(pq.timers, sessionID)
	}
	pq.mu.Unlock()

	if exists {
		ticker.Stop()
	}
}

func (pq *PreviewQueue) refreshPreview(sessionID string) {
	var session models.WatchSession
	if err := pq.db.Where("session_id = ?", sessionID).First(&session).Error; err != nil {
		return
	}
	if session.CurrentMediaType != string(MediaTypeUpload) || session.CurrentMediaID == 0 {
		return
	}

	// Detect whether the playing media is a temporary upload or a permanent media item
	isTemporary := false
	var tempItem models.TemporaryMediaItem
	if err := pq.db.First(&tempItem, session.CurrentMediaID).Error; err == nil {
		isTemporary = true
	}

	pq.QueuePreview(PreviewRequest{
		SessionID:        sessionID,
		MediaID:          uint(session.CurrentMediaID),
		MediaPath:        session.CurrentMediaPath,
		IsTemporary:      isTemporary,
		CurrentTimestamp: session.CurrentPlaybackTime,
		MediaType:        MediaType(session.CurrentMediaType),
	})
}

// ClearSessionPreview deletes preview files and clears database entries
func (pq *PreviewQueue) ClearSessionPreview(sessionID string) {
	var result struct {
		PreviewURL string
		PosterURL  string
	}
	if err := pq.db.Table("watch_sessions").
		Select("preview_url, poster_url").
		Where("session_id = ?", sessionID).
		First(&result).Error; err != nil {
		return
	}

	// Delete from CDN if it's a CDN URL; delete local file if it's a local path
	if result.PreviewURL != "" {
		if strings.Contains(result.PreviewURL, "b-cdn.net") {
			utils.DeleteFromBunnyCDN(result.PreviewURL)
		} else {
			os.Remove(strings.TrimPrefix(result.PreviewURL, "/"))
		}
	}
	if result.PosterURL != "" && (strings.Contains(result.PosterURL, "webrtc") || strings.Contains(result.PosterURL, "frame")) {
		os.Remove(strings.TrimPrefix(result.PosterURL, "/"))
	}

	pq.db.Table("watch_sessions").Where("session_id = ?", sessionID).
		Updates(map[string]interface{}{"preview_url": nil, "poster_url": nil})

	pq.broadcastPreviewToLobby(sessionID, "", "")
}

// CleanupSession stops timers and clears previews when session ends
func (pq *PreviewQueue) CleanupSession(sessionID string) {
	pq.StopRefreshTimer(sessionID)
	pq.ClearSessionPreview(sessionID)

	pq.mu.Lock()
	delete(pq.active, sessionID)
	pq.mu.Unlock()
}

func formatSeconds(seconds int) string {
	hours := seconds / 3600
	minutes := (seconds % 3600) / 60
	secs := seconds % 60
	return fmt.Sprintf("%02d:%02d:%02d", hours, minutes, secs)
}
