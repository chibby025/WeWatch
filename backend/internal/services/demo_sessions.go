package services

import (
	"encoding/json"
	"log"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"wewatch-backend/internal/models"
)

// BroadcastRoomFunc sends JSON bytes to all WS clients in a room.
// Wired up from the hub in websocket.go so this package stays import-cycle free.
type BroadcastRoomFunc func(roomID uint, data []byte)

// BroadcastLobbyFunc sends JSON bytes to all lobby (non-room) WS clients.
type BroadcastLobbyFunc func(data []byte)

// demoTrack is a resolved playlist entry with detected duration.
type demoTrack struct {
	id              uint
	url             string
	title           string
	posterURL       string
	durationSeconds int
}

// roomDemoState tracks the live demo session for one always-on room.
type roomDemoState struct {
	sessionID      string
	sessionDBID    uint
	currentIdx     int
	mediaStartedAt time.Time
	playlist       []demoTrack
}

// DemoSessionManager keeps always-on rooms alive with looping media playlists.
type DemoSessionManager struct {
	db             *gorm.DB
	broadcast      BroadcastRoomFunc
	broadcastLobby BroadcastLobbyFunc
	mu             sync.Mutex
	states         map[uint]*roomDemoState
}

var demoMgr *DemoSessionManager

// InitDemoSessionManager wires the manager and starts the background goroutine.
// Call once from InitPreviewSystem (or equivalent hub init).
func InitDemoSessionManager(db *gorm.DB, broadcast BroadcastRoomFunc, broadcastLobby BroadcastLobbyFunc) {
	demoMgr = &DemoSessionManager{
		db:             db,
		broadcast:      broadcast,
		broadcastLobby: broadcastLobby,
		states:         make(map[uint]*roomDemoState),
	}
	go demoMgr.run()
}

func (m *DemoSessionManager) run() {
	m.tick() // immediate check on startup
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		m.tick()
	}
}

func (m *DemoSessionManager) tick() {
	var rooms []models.Room
	if err := m.db.Where("is_always_on = true AND deleted_at IS NULL").Find(&rooms).Error; err != nil {
		log.Printf("❌ [Demo] fetch always-on rooms: %v", err)
		return
	}
	for _, room := range rooms {
		m.manageRoom(room)
	}
}

func (m *DemoSessionManager) manageRoom(room models.Room) {
	m.mu.Lock()
	state := m.states[room.ID]
	m.mu.Unlock()

	// Check for existing active session
	var session models.WatchSession
	err := m.db.Where("room_id = ? AND ended_at IS NULL AND is_active = true", room.ID).
		First(&session).Error

	if err != nil {
		// No active session — create one
		newState := m.startSession(room)
		if newState != nil {
			m.mu.Lock()
			m.states[room.ID] = newState
			m.mu.Unlock()
		}
		return
	}

	// Freshen heartbeat so CleanupStaleSessions leaves this session alone
	now := time.Now()
	m.db.Model(&session).Update("last_heartbeat_at", now)

	// Rebuild state if lost (e.g. service restart)
	if state == nil {
		playlist := m.loadPlaylist(room.DemoWatchType)
		state = &roomDemoState{
			sessionID:      session.SessionID,
			sessionDBID:    session.ID,
			currentIdx:     0,
			mediaStartedAt: session.StartedAt,
			playlist:       playlist,
		}
		m.mu.Lock()
		m.states[room.ID] = state
		m.mu.Unlock()
		return
	}

	if len(state.playlist) == 0 {
		return
	}

	// Advance playlist when current track has ended
	current := state.playlist[state.currentIdx]
	elapsed := time.Since(state.mediaStartedAt)

	if current.durationSeconds > 0 && elapsed >= time.Duration(current.durationSeconds)*time.Second {
		nextIdx := (state.currentIdx + 1) % len(state.playlist)
		next := state.playlist[nextIdx]

		// Detect duration on first play of each track
		if next.durationSeconds == 0 {
			if dur := probeMediaDuration(next.url); dur > 0 {
				m.db.Exec("UPDATE demo_media_library SET duration_seconds = ? WHERE id = ?", dur, next.id)
				state.playlist[nextIdx].durationSeconds = dur
				next.durationSeconds = dur
			}
		}

		m.db.Model(&session).Updates(map[string]interface{}{
			"current_media_url": next.url,
			"session_title":     next.title,
			"poster_url":        next.posterURL,
		})
		m.broadcastPlay(room.ID, session.SessionID, next.url, next.title, next.posterURL, 0)
		m.broadcastSessionPreview(session.SessionID, next.posterURL)

		m.mu.Lock()
		state.currentIdx = nextIdx
		state.mediaStartedAt = time.Now()
		m.mu.Unlock()

		log.Printf("🎬 [Demo] Room %d (%s) → %s", room.ID, room.DemoWatchType, next.title)
	}
}

func (m *DemoSessionManager) startSession(room models.Room) *roomDemoState {
	if room.DemoHostUserID == 0 {
		log.Printf("⚠️ [Demo] Room %d has no demo_host_user_id — skipping", room.ID)
		return nil
	}

	playlist := m.loadPlaylist(room.DemoWatchType)
	if len(playlist) == 0 {
		log.Printf("⚠️ [Demo] No active media for room %d (type: %s) — skipping", room.ID, room.DemoWatchType)
		return nil
	}

	first := playlist[0]
	if first.durationSeconds == 0 {
		if dur := probeMediaDuration(first.url); dur > 0 {
			m.db.Exec("UPDATE demo_media_library SET duration_seconds = ? WHERE id = ?", dur, first.id)
			playlist[0].durationSeconds = dur
		}
	}

	sessionID := uuid.New().String()
	now := time.Now()
	session := models.WatchSession{
		SessionID:       sessionID,
		RoomID:          room.ID,
		HostID:          room.DemoHostUserID,
		WatchType:       room.DemoWatchType,
		StartedAt:       now,
		IsActive:        true,
		IsPrivate:       false,
		PreviewEnabled:  false, // no preview generation for demo sessions
		CurrentMediaURL: first.url,
		SessionTitle:    first.title,
		PosterURL:       first.posterURL,
		ContentRating:   "G",
		LastHeartbeatAt: &now,
	}

	if err := m.db.Create(&session).Error; err != nil {
		log.Printf("❌ [Demo] Create session for room %d: %v", room.ID, err)
		return nil
	}

	// Broadcast initial poster to lobby so the session card shows a thumbnail immediately
	m.broadcastSessionPreview(sessionID, first.posterURL)

	log.Printf("✅ [Demo] Room %d (%s) → session %s playing: %s", room.ID, room.DemoWatchType, sessionID, first.title)

	return &roomDemoState{
		sessionID:      sessionID,
		sessionDBID:    session.ID,
		currentIdx:     0,
		mediaStartedAt: now,
		playlist:       playlist,
	}
}

// loadPlaylist fetches media items for the given watch type (or items with no type restriction).
func (m *DemoSessionManager) loadPlaylist(watchType string) []demoTrack {
	type row struct {
		ID              uint
		URL             string
		Title           string
		PosterURL       string
		DurationSeconds int
	}
	var rows []row
	m.db.Raw(`
		SELECT id, url, title, poster_url, duration_seconds
		FROM demo_media_library
		WHERE is_active = true
		  AND (watch_types = '{}' OR watch_types @> ARRAY[?]::TEXT[])
		ORDER BY sort_order ASC, id ASC
	`, watchType).Scan(&rows)

	tracks := make([]demoTrack, len(rows))
	for i, r := range rows {
		tracks[i] = demoTrack{
			id:              r.ID,
			url:             r.URL,
			title:           r.Title,
			posterURL:       r.PosterURL,
			durationSeconds: r.DurationSeconds,
		}
	}
	return tracks
}

// broadcastPlay sends a playback_control WS message to all room clients.
// Includes media_title and poster_url so LeftSidebar can display track info.
func (m *DemoSessionManager) broadcastPlay(roomID uint, sessionID, mediaURL, mediaTitle, posterURL string, seekTime float64) {
	payload := map[string]interface{}{
		"type": "playback_control",
		"data": map[string]interface{}{
			"command":     "play",
			"media_url":   mediaURL,
			"media_title": mediaTitle,
			"poster_url":  posterURL,
			"seek_time":   seekTime,
			"timestamp":   time.Now().UnixMilli(),
			"session_id":  sessionID,
		},
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	m.broadcast(roomID, data)
}

// broadcastSessionPreview pushes a session_preview_updated event to all lobby clients
// so the LobbyPage session card shows the demo media thumbnail immediately.
func (m *DemoSessionManager) broadcastSessionPreview(sessionID, posterURL string) {
	if m.broadcastLobby == nil || posterURL == "" {
		return
	}
	payload := map[string]interface{}{
		"type":        "session_preview_updated",
		"session_id":  sessionID,
		"poster_url":  posterURL,
		"preview_url": "",
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	m.broadcastLobby(data)
}

// probeMediaDuration calls ffprobe to determine a media file's total duration in seconds.
// Returns 0 if ffprobe is unavailable or the URL fails.
func probeMediaDuration(url string) int {
	out, err := exec.Command("ffprobe",
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		url,
	).Output()
	if err != nil {
		log.Printf("⚠️ [Demo] ffprobe %s: %v", url, err)
		return 0
	}
	durStr := strings.TrimSpace(string(out))
	f, err := strconv.ParseFloat(durStr, 64)
	if err != nil || f <= 0 {
		return 0
	}
	return int(f)
}
