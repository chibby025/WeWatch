// WeWatch/backend/internal/services/media_switch_handler.go
package services

import (
	"log"
	"wewatch-backend/internal/models"
	"gorm.io/gorm"
)

// MediaSwitchHandler manages media type transitions and preview updates
type MediaSwitchHandler struct {
	db    *gorm.DB
	queue *PreviewQueue
}

// NewMediaSwitchHandler creates a new media switch handler
func NewMediaSwitchHandler(db *gorm.DB, queue *PreviewQueue) *MediaSwitchHandler {
	return &MediaSwitchHandler{
		db:    db,
		queue: queue,
	}
}

// ClearOldPreview clears the preview when switching media types
func (h *MediaSwitchHandler) ClearOldPreview(sessionID string, oldType string) {
	log.Printf("🧹 [MediaSwitch] Clearing old %s preview for session %s", oldType, sessionID)
	h.queue.ClearSessionPreview(sessionID)
	h.queue.StopRefreshTimer(sessionID)
}

// HandleMediaPlay handles uploaded media playback start
func (h *MediaSwitchHandler) HandleMediaPlay(sessionID string, mediaID uint, mediaPath string, fileURL string, isTemporary bool) {
	log.Printf("🎬 [MediaSwitch] Handling media_play for session %s", sessionID)
	
	var session models.WatchSession
	result := h.db.Where("session_id = ?", sessionID).First(&session)
	if result.Error != nil {
		log.Printf("❌ [MediaSwitch] Session not found: %s", sessionID)
		return
	}
	
	oldType := session.CurrentMediaType
	newType := string(MediaTypeUpload)
	
	// Detect type change
	if oldType != newType {
		log.Printf("🔄 [MediaSwitch] Type change detected: %s → %s", oldType, newType)
		
		// Clear old preview
		h.queue.ClearSessionPreview(sessionID)
		
		// Stop old refresh timer
		h.queue.StopRefreshTimer(sessionID)
	}
	
	// Update session state
	h.db.Model(&session).Updates(map[string]interface{}{
		"current_media_type":       newType,
		"current_media_id":         int(mediaID),
		"current_media_path":       mediaPath,
		"current_media_url":        fileURL,
		"current_playback_time":    0, // Reset to beginning
		"is_screen_sharing_active": false,
		"sharing_source":           "",
	})
	
	// Check if preview already exists in cache
	var cachedPreview string
	if isTemporary {
		var media models.TemporaryMediaItem
		if err := h.db.First(&media, mediaID).Error; err == nil && media.PreviewURL != "" {
			cachedPreview = media.PreviewURL
			log.Printf("✅ [MediaSwitch] Found cached preview for temp media %d", mediaID)
		}
	} else {
		var media models.MediaItem
		if err := h.db.First(&media, mediaID).Error; err == nil && media.PreviewURL != "" {
			cachedPreview = media.PreviewURL
			log.Printf("✅ [MediaSwitch] Found cached preview for media %d", mediaID)
		}
	}
	
	if cachedPreview != "" {
		// Broadcast cached preview immediately
		var posterURL string
		if isTemporary {
			var media models.TemporaryMediaItem
			h.db.First(&media, mediaID)
			posterURL = media.PosterURL
		} else {
			var media models.MediaItem
			h.db.First(&media, mediaID)
			posterURL = media.PosterURL
		}
		h.queue.broadcastPreviewToLobby(sessionID, posterURL, cachedPreview)
	} else {
		// Queue preview generation
		h.queue.QueuePreview(PreviewRequest{
			SessionID:        sessionID,
			MediaID:          mediaID,
			MediaPath:        mediaPath,
			IsTemporary:      isTemporary,
			CurrentTimestamp: 0, // Start from beginning
			MediaType:        MediaTypeUpload,
		})
	}
	
	// Start 5-minute refresh timer
	h.queue.StartRefreshTimer(sessionID)
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
		// Screen sharing stopped
		log.Printf("⏹️ [MediaSwitch] Screen sharing stopped for session %s", sessionID)
		h.HandleMediaStop(sessionID)
		return
	}
	
	// Determine media type
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
	
	// Detect type change
	if oldType != string(newType) {
		log.Printf("🔄 [MediaSwitch] Type change detected: %s → %s", oldType, newType)
		
		// Clear old upload preview
		h.queue.ClearSessionPreview(sessionID)
		
		// Stop refresh timer (WebRTC previews use frame capture system)
		h.queue.StopRefreshTimer(sessionID)
	}
	
	// Update session state
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
	// Update playback time (used for 5-minute preview refresh)
	h.db.Model(&models.WatchSession{}).
		Where("session_id = ?", sessionID).
		Update("current_playback_time", currentTime)
}

// HandleMediaStop handles media stopping (host switches away or stops playback)
func (h *MediaSwitchHandler) HandleMediaStop(sessionID string) {
	log.Printf("⏹️ [MediaSwitch] Handling media_stop for session %s", sessionID)
	
	var session models.WatchSession
	result := h.db.Where("session_id = ?", sessionID).First(&session)
	if result.Error != nil {
		log.Printf("❌ [MediaSwitch] Session not found: %s", sessionID)
		return
	}
	
	// Clear preview
	h.queue.ClearSessionPreview(sessionID)
	
	// Stop refresh timer
	h.queue.StopRefreshTimer(sessionID)
	
	// Update session state
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
	
	// Full cleanup
	h.queue.CleanupSession(sessionID)
	
	log.Printf("✅ [MediaSwitch] Session %s cleanup complete", sessionID)
}
