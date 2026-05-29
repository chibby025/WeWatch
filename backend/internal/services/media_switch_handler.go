// WeWatch/backend/internal/services/media_switch_handler.go
package services

import (
	"log"
	"sync"
	"time"
	"wewatch-backend/internal/models"
	"gorm.io/gorm"
)

// MediaSwitchHandler manages media type transitions and preview scheduling.
type MediaSwitchHandler struct {
	db            *gorm.DB
	queue         *PreviewQueue
	pendingMu     sync.Mutex
	pendingTimers map[string]*time.Timer // sessionID → 30s initial-preview timer
}

// NewMediaSwitchHandler creates a new media switch handler
func NewMediaSwitchHandler(db *gorm.DB, queue *PreviewQueue) *MediaSwitchHandler {
	return &MediaSwitchHandler{
		db:            db,
		queue:         queue,
		pendingTimers: make(map[string]*time.Timer),
	}
}

// cancelPendingTimer stops and removes the 30s initial-preview timer for a session.
func (h *MediaSwitchHandler) cancelPendingTimer(sessionID string) {
	h.pendingMu.Lock()
	timer, exists := h.pendingTimers[sessionID]
	if exists {
		delete(h.pendingTimers, sessionID)
	}
	h.pendingMu.Unlock()
	if exists {
		timer.Stop()
	}
}

// ClearOldPreview clears the preview when switching media types
func (h *MediaSwitchHandler) ClearOldPreview(sessionID string, oldType string) {
	log.Printf("🧹 [MediaSwitch] Clearing old %s preview for session %s", oldType, sessionID)
	h.cancelPendingTimer(sessionID)
	h.queue.ClearSessionPreview(sessionID)
	h.queue.StopRefreshTimer(sessionID)
}

// HandleMediaPlay handles uploaded media playback start.
// Flow:
//  1. Cancel any pending 30s initial-preview timer (media may have changed).
//  2. Update session state in DB.
//  3. If a cached preview exists, broadcast it immediately as a placeholder.
//  4. After 30s, generate a fresh preview at the current playback position,
//     then start the N-minute refresh ticker.
func (h *MediaSwitchHandler) HandleMediaPlay(sessionID string, mediaID uint, mediaPath string, fileURL string, isTemporary bool) {
	log.Printf("🎬 [MediaSwitch] Handling media_play for session %s", sessionID)

	// Cancel any pending timer from a previous media load
	h.cancelPendingTimer(sessionID)

	var session models.WatchSession
	result := h.db.Where("session_id = ?", sessionID).First(&session)
	if result.Error != nil {
		log.Printf("❌ [MediaSwitch] Session not found: %s", sessionID)
		return
	}

	oldType := session.CurrentMediaType
	newType := string(MediaTypeUpload)

	if oldType != newType {
		log.Printf("🔄 [MediaSwitch] Type change detected: %s → %s", oldType, newType)
		h.queue.ClearSessionPreview(sessionID)
		h.queue.StopRefreshTimer(sessionID)
	}

	// Update session state
	h.db.Model(&session).Updates(map[string]interface{}{
		"current_media_type":       newType,
		"current_media_id":         int(mediaID),
		"current_media_path":       mediaPath,
		"current_media_url":        fileURL,
		"current_playback_time":    0,
		"is_screen_sharing_active": false,
		"sharing_source":           "",
	})

	// Broadcast immediately so lobby members see something before the 30s preview generates.
	// • Cached preview (poster + video) → broadcast both straight away.
	// • Poster only (no prior preview) → broadcast poster so the card shows an image
	//   rather than a spinner for 30 seconds while ffmpeg runs.
	var cachedPreviewURL, cachedPosterURL string
	if isTemporary {
		var media models.TemporaryMediaItem
		if err := h.db.First(&media, mediaID).Error; err == nil {
			cachedPreviewURL = media.PreviewURL
			cachedPosterURL = media.PosterURL
		}
	} else {
		var media models.MediaItem
		if err := h.db.First(&media, mediaID).Error; err == nil {
			cachedPreviewURL = media.PreviewURL
			cachedPosterURL = media.PosterURL
		}
	}
	if cachedPreviewURL != "" {
		log.Printf("✅ [MediaSwitch] Broadcasting cached preview for media %d", mediaID)
		h.queue.broadcastPreviewToLobby(sessionID, cachedPosterURL, cachedPreviewURL)
	} else if cachedPosterURL != "" && cachedPosterURL != "/icons/placeholder-poster.jpg" {
		log.Printf("🖼️ [MediaSwitch] No cached preview yet — broadcasting poster for media %d", mediaID)
		h.queue.broadcastPreviewToLobby(sessionID, cachedPosterURL, "")
	}

	// Schedule: wait 30s, generate a fresh preview at the current playback position,
	// then start the N-minute refresh ticker.
	timer := time.AfterFunc(30*time.Second, func() {
		h.pendingMu.Lock()
		delete(h.pendingTimers, sessionID)
		h.pendingMu.Unlock()

		// Re-read session — media may have changed during the 30s window
		var s models.WatchSession
		if err := h.db.Where("session_id = ?", sessionID).First(&s).Error; err != nil {
			return
		}
		if s.CurrentMediaType != string(MediaTypeUpload) || s.CurrentMediaPath == "" {
			return // Media changed or stopped; let the new handler deal with preview
		}

		// Detect temporary vs permanent at fire time (most accurate)
		isTmp := false
		var tmpItem models.TemporaryMediaItem
		if h.db.First(&tmpItem, s.CurrentMediaID).Error == nil {
			isTmp = true
		}

		h.queue.QueuePreview(PreviewRequest{
			SessionID:        sessionID,
			MediaID:          uint(s.CurrentMediaID),
			MediaPath:        s.CurrentMediaPath,
			IsTemporary:      isTmp,
			CurrentTimestamp: s.CurrentPlaybackTime,
			MediaType:        MediaTypeUpload,
		})

		// Start the N-minute refresh ticker AFTER the initial preview is queued
		h.queue.StartRefreshTimer(sessionID)
	})

	h.pendingMu.Lock()
	h.pendingTimers[sessionID] = timer
	h.pendingMu.Unlock()
}

// HandleMediaStateChanged handles LiveShare/WatchFrom screen sharing start
func (h *MediaSwitchHandler) HandleMediaStateChanged(sessionID string, sharingSource string, isActive bool) {
	log.Printf("📡 [MediaSwitch] Handling media_state_changed for session %s (source: %s, active: %v)", sessionID, sharingSource, isActive)

	var session models.WatchSession
	result := h.db.Where("session_id = ?", sessionID).First(&session)
	if result.Error != nil {
		log.Printf("❌ [MediaSwitch] Session not found: %s", sessionID)
		return
	}

	if !isActive {
		log.Printf("⏹️ [MediaSwitch] Screen sharing stopped for session %s", sessionID)
		h.HandleMediaStop(sessionID)
		return
	}

	var newType MediaType
	if sharingSource == "liveshare" {
		newType = MediaTypeLiveShare
	} else if sharingSource == "watchfrom" {
		newType = MediaTypeWatchFrom
	} else {
		log.Printf("⚠️ [MediaSwitch] Unknown sharing source: %s", sharingSource)
		return
	}

	oldType := session.CurrentMediaType
	if oldType != string(newType) {
		log.Printf("🔄 [MediaSwitch] Type change detected: %s → %s", oldType, newType)
		h.cancelPendingTimer(sessionID)
		h.queue.ClearSessionPreview(sessionID)
		h.queue.StopRefreshTimer(sessionID)
	}

	h.db.Model(&session).Updates(map[string]interface{}{
		"current_media_type":       string(newType),
		"is_screen_sharing_active": true,
		"sharing_source":           sharingSource,
		"current_media_id":         0,
		"current_media_path":       "",
		"current_playback_time":    0,
	})

	log.Printf("✅ [MediaSwitch] Session %s switched to %s (WebRTC frame capture will handle preview)", sessionID, newType)
}

// HandleVideoTimeUpdate updates the current playback timestamp
func (h *MediaSwitchHandler) HandleVideoTimeUpdate(sessionID string, currentTime int) {
	h.db.Model(&models.WatchSession{}).
		Where("session_id = ?", sessionID).
		Update("current_playback_time", currentTime)
}

// HandleMediaStop handles media stopping
func (h *MediaSwitchHandler) HandleMediaStop(sessionID string) {
	log.Printf("⏹️ [MediaSwitch] Handling media_stop for session %s", sessionID)

	h.cancelPendingTimer(sessionID)

	var session models.WatchSession
	result := h.db.Where("session_id = ?", sessionID).First(&session)
	if result.Error != nil {
		log.Printf("❌ [MediaSwitch] Session not found: %s", sessionID)
		return
	}

	h.queue.ClearSessionPreview(sessionID)
	h.queue.StopRefreshTimer(sessionID)

	h.db.Model(&session).Updates(map[string]interface{}{
		"current_media_type":       string(MediaTypeNone),
		"is_screen_sharing_active": false,
		"sharing_source":           "",
		"current_media_id":         0,
		"current_media_path":       "",
		"current_playback_time":    0,
	})

	log.Printf("✅ [MediaSwitch] Session %s media stopped, preview cleared", sessionID)
}

// HandleSessionEnd handles session cleanup when watch session ends
func (h *MediaSwitchHandler) HandleSessionEnd(sessionID string) {
	log.Printf("🛑 [MediaSwitch] Handling session_end for session %s", sessionID)
	h.cancelPendingTimer(sessionID)
	h.queue.CleanupSession(sessionID)
	log.Printf("✅ [MediaSwitch] Session %s cleanup complete", sessionID)
}
