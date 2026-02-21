// WeWatch/backend/internal/services/preview_queue.go
package services

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
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
	queue   chan PreviewRequest
	db      *gorm.DB
	hub     WebSocketHub
	active  map[string]bool // Track active sessions to prevent duplicates
	timers  map[string]*time.Ticker // Track refresh timers per session
}

// WebSocketHub interface for broadcasting messages
type WebSocketHub interface {
	BroadcastToLobby(msg OutgoingMessage)
}

var globalPreviewQueue *PreviewQueue

// InitPreviewQueue initializes the preview queue worker
func InitPreviewQueue(db *gorm.DB, hub WebSocketHub) {
	globalPreviewQueue = &PreviewQueue{
		queue:   make(chan PreviewRequest, 100),
		db:      db,
		hub:     hub,
		active:  make(map[string]bool),
		timers:  make(map[string]*time.Ticker),
	}
	
	log.Println("✅ [PreviewQueue] Preview queue initialized")
	globalPreviewQueue.start()
}

// GetPreviewQueue returns the global preview queue instance
func GetPreviewQueue() *PreviewQueue {
	return globalPreviewQueue
}

// start begins the worker goroutine
func (pq *PreviewQueue) start() {
	go func() {
		log.Println("🚀 [PreviewQueue] Worker started")
		for req := range pq.queue {
			pq.processRequest(req)
		}
	}()
}

// QueuePreview adds a preview request to the queue
func (pq *PreviewQueue) QueuePreview(req PreviewRequest) {
	// Check if already in queue
	if pq.active[req.SessionID] {
		log.Printf("⏭️ [PreviewQueue] Session %s already has pending preview, skipping", req.SessionID)
		return
	}
	
	pq.active[req.SessionID] = true
	log.Printf("📥 [PreviewQueue] Queued preview request for session %s, type: %s", req.SessionID, req.MediaType)
	pq.queue <- req
}

// processRequest handles the actual preview generation
func (pq *PreviewQueue) processRequest(req PreviewRequest) {
	defer func() {
		delete(pq.active, req.SessionID)
	}()
	
	log.Printf("⚙️ [PreviewQueue] Processing preview for session %s", req.SessionID)
	
	switch req.MediaType {
	case MediaTypeUpload:
		pq.generateUploadPreview(req)
	case MediaTypeLiveShare, MediaTypeWatchFrom:
		// WebRTC previews are handled by existing frame capture system
		log.Printf("ℹ️ [PreviewQueue] WebRTC preview handled by frame capture system")
	default:
		log.Printf("⚠️ [PreviewQueue] Unknown media type: %s", req.MediaType)
	}
}

// generateUploadPreview generates preview for uploaded video
func (pq *PreviewQueue) generateUploadPreview(req PreviewRequest) {
	// Check if file exists
	if _, err := os.Stat(req.MediaPath); os.IsNotExist(err) {
		log.Printf("❌ [PreviewQueue] Media file not found: %s", req.MediaPath)
		return
	}
	
	// Generate preview filename
	baseName := filepath.Base(req.MediaPath)
	ext := filepath.Ext(baseName)
	nameWithoutExt := strings.TrimSuffix(baseName, ext)
	previewFilename := fmt.Sprintf("%s_preview_%d.gif", nameWithoutExt, time.Now().Unix())
	
	var previewPath string
	var previewURL string
	
	if req.IsTemporary {
		previewPath = filepath.Join("./uploads/temp", previewFilename)
		previewURL = fmt.Sprintf("/uploads/temp/%s", previewFilename)
	} else {
		previewPath = filepath.Join("./uploads", previewFilename)
		previewURL = fmt.Sprintf("/uploads/%s", previewFilename)
	}
	
	// Generate preview starting from current timestamp
	startTime := formatSeconds(req.CurrentTimestamp)
	log.Printf("🎬 [PreviewQueue] Generating preview from timestamp: %s (file: %s)", startTime, req.MediaPath)
	
	err := utils.GeneratePreviewGIF(req.MediaPath, previewPath, startTime, 30)
	if err != nil {
		log.Printf("❌ [PreviewQueue] Failed to generate preview GIF: %v", err)
		return
	}
	
	log.Printf("✅ [PreviewQueue] Preview GIF generated: %s", previewPath)
	
	// Update database
	if req.IsTemporary {
		pq.db.Model(&models.TemporaryMediaItem{}).
			Where("id = ?", req.MediaID).
			Updates(map[string]interface{}{
				"preview_url":         previewURL,
				"preview_generated_at": time.Now(),
			})
	} else {
		pq.db.Model(&models.MediaItem{}).
			Where("id = ?", req.MediaID).
			Updates(map[string]interface{}{
				"preview_url":         previewURL,
				"preview_generated_at": time.Now(),
			})
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
	
	// Broadcast to lobby
	pq.broadcastPreviewToLobby(req.SessionID, posterURL, previewURL)
}

// broadcastPreviewToLobby sends preview update to lobby WebSocket
func (pq *PreviewQueue) broadcastPreviewToLobby(sessionID, posterURL, previewURL string) {
	broadcastData := map[string]interface{}{
		"type":        "session_preview_updated",
		"session_id":  sessionID,
		"poster_url":  posterURL,
		"preview_url": previewURL,
	}
	
	broadcastJSON, err := json.Marshal(broadcastData)
	if err != nil {
		log.Printf("❌ [PreviewQueue] Failed to marshal broadcast: %v", err)
		return
	}
	
	pq.hub.BroadcastToLobby(OutgoingMessage{
		Data:     broadcastJSON,
		IsBinary: false,
	})
	
	log.Printf("📡 [PreviewQueue] Broadcast preview update for session %s", sessionID)
}

// StartRefreshTimer starts a 1-minute refresh timer for a session (⚡ TESTING MODE - change back to 5 minutes for production)
func (pq *PreviewQueue) StartRefreshTimer(sessionID string) {
	// Stop existing timer if any
	pq.StopRefreshTimer(sessionID)
	
	ticker := time.NewTicker(1 * time.Minute) // ⚡ TESTING: 1 minute (change to 5 * time.Minute for production)
	pq.timers[sessionID] = ticker
	
	go func() {
		for range ticker.C {
			log.Printf("⏰ [PreviewQueue] 1-minute refresh triggered for session %s (TESTING MODE)", sessionID)
			pq.refreshPreview(sessionID)
		}
	}()
	
	log.Printf("⏱️ [PreviewQueue] Started 1-minute refresh timer for session %s (TESTING MODE)", sessionID)
}

// StopRefreshTimer stops the refresh timer for a session
func (pq *PreviewQueue) StopRefreshTimer(sessionID string) {
	if ticker, exists := pq.timers[sessionID]; exists {
		ticker.Stop()
		delete(pq.timers, sessionID)
		log.Printf("⏹️ [PreviewQueue] Stopped refresh timer for session %s", sessionID)
	}
}

// refreshPreview generates a new preview based on current playback position
func (pq *PreviewQueue) refreshPreview(sessionID string) {
	var session models.WatchSession
	result := pq.db.Where("session_id = ?", sessionID).First(&session)
	if result.Error != nil {
		log.Printf("❌ [PreviewQueue] Session not found for refresh: %s", sessionID)
		return
	}
	
	// Only refresh if media is upload type
	if session.CurrentMediaType != string(MediaTypeUpload) {
		log.Printf("ℹ️ [PreviewQueue] Session %s is not upload type, skipping refresh", sessionID)
		return
	}
	
	// Queue new preview generation from current position
	pq.QueuePreview(PreviewRequest{
		SessionID:        sessionID,
		MediaID:          uint(session.CurrentMediaID),
		MediaPath:        session.CurrentMediaPath,
		IsTemporary:      false, // TODO: detect from path
		CurrentTimestamp: session.CurrentPlaybackTime,
		MediaType:        MediaType(session.CurrentMediaType),
	})
}

// ClearSessionPreview deletes preview files and clears database entries
func (pq *PreviewQueue) ClearSessionPreview(sessionID string) {
	// Query preview and poster URLs directly from database
	var result struct {
		PreviewURL string
		PosterURL  string
	}
	
	if err := pq.db.Table("watch_sessions").
		Select("preview_url, poster_url").
		Where("session_id = ?", sessionID).
		First(&result).Error; err != nil {
		log.Printf("❌ [PreviewQueue] Session not found for cleanup: %s", sessionID)
		return
	}
	
	// Delete preview file
	if result.PreviewURL != "" {
		previewPath := strings.TrimPrefix(result.PreviewURL, "/")
		if err := os.Remove(previewPath); err != nil && !os.IsNotExist(err) {
			log.Printf("⚠️ [PreviewQueue] Failed to delete preview file %s: %v", previewPath, err)
		} else {
			log.Printf("🗑️ [PreviewQueue] Deleted preview file: %s", previewPath)
		}
	}
	
	// Delete poster if it's a WebRTC poster (contains "webrtc" or "frame")
	if result.PosterURL != "" && (strings.Contains(result.PosterURL, "webrtc") || strings.Contains(result.PosterURL, "frame")) {
		posterPath := strings.TrimPrefix(result.PosterURL, "/")
		if err := os.Remove(posterPath); err != nil && !os.IsNotExist(err) {
			log.Printf("⚠️ [PreviewQueue] Failed to delete poster file %s: %v", posterPath, err)
		} else {
			log.Printf("🗑️ [PreviewQueue] Deleted poster file: %s", posterPath)
		}
	}
	
	// Clear URLs from database
	pq.db.Table("watch_sessions").
		Where("session_id = ?", sessionID).
		Updates(map[string]interface{}{
			"preview_url": nil,
			"poster_url":  nil,
		})
	
	// ✅ Broadcast preview cleared to lobby so frontend updates immediately
	pq.broadcastPreviewToLobby(sessionID, "", "")
	log.Printf("📡 [PreviewQueue] Broadcast preview cleared for session %s", sessionID)
	
	log.Printf("🧹 [PreviewQueue] Cleared preview for session %s", sessionID)
}

// CleanupSession stops timers and clears previews when session ends
func (pq *PreviewQueue) CleanupSession(sessionID string) {
	pq.StopRefreshTimer(sessionID)
	pq.ClearSessionPreview(sessionID)
	delete(pq.active, sessionID)
	log.Printf("🧹 [PreviewQueue] Full cleanup completed for session %s", sessionID)
}

// formatSeconds converts seconds to HH:MM:SS format for ffmpeg
func formatSeconds(seconds int) string {
	hours := seconds / 3600
	minutes := (seconds % 3600) / 60
	secs := seconds % 60
	return fmt.Sprintf("%02d:%02d:%02d", hours, minutes, secs)
}
