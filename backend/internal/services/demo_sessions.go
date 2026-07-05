package services

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
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

	// Check for existing active session — omit is_active check intentionally.
	// CleanupStaleSessions can set is_active=false without setting ended_at when
	// it loses the heartbeat during a process restart; requiring is_active=true here
	// would cause the manager to create a second session on top of the still-open one.
	var session models.WatchSession
	err := m.db.Where("room_id = ? AND ended_at IS NULL", room.ID).
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

	// Freshen heartbeat and ensure is_active stays true so CleanupStaleSessions
	// leaves this session alone (it may have been flipped false during a restart).
	now := time.Now()
	m.db.Model(&session).Updates(map[string]interface{}{
		"last_heartbeat_at": now,
		"is_active":         true,
	})

	// Rebuild state if lost (e.g. service restart) and re-broadcast so
	// any clients already in the room resume playback.
	if state == nil {
		playlist := m.loadPlaylist(room.ID, room.DemoWatchType)
		if len(playlist) == 0 {
			return
		}
		// Find which track is currently loaded by matching current_media_url — avoids
		// always restarting at EP1 after a Railway process restart.
		currentIdx := 0
		for i, track := range playlist {
			if track.url == session.CurrentMediaURL {
				currentIdx = i
				break
			}
		}
		state = &roomDemoState{
			sessionID:      session.SessionID,
			sessionDBID:    session.ID,
			currentIdx:     currentIdx,
			mediaStartedAt: session.StartedAt,
			playlist:       playlist,
		}
		m.mu.Lock()
		m.states[room.ID] = state
		m.mu.Unlock()

		current := playlist[currentIdx]
		elapsed := time.Since(session.StartedAt).Seconds()
		seek := elapsed
		if dur := current.durationSeconds; dur > 0 && elapsed >= float64(dur) {
			seek = 0
		}
		m.broadcastPlay(room.ID, session.SessionID, current.url, current.title, current.posterURL, seek, current.durationSeconds)
		return
	}

	if len(state.playlist) == 0 {
		return
	}

	// Advance playlist when current track has ended
	current := state.playlist[state.currentIdx]
	elapsed := time.Since(state.mediaStartedAt)

	// If duration is still unknown, retry probing — this covers the case where the
	// initial background probe (from startSession) failed or hadn't completed yet.
	// A goroutine every 60s is cheap; on success it updates both DB and in-memory state.
	if current.durationSeconds == 0 {
		go func(item demoTrack, idx int, roomID uint) {
			if dur := probeMediaDuration(item.url); dur > 0 {
				m.db.Exec("UPDATE demo_media_library SET duration_seconds = ? WHERE id = ?", dur, item.id)
				m.mu.Lock()
				if s := m.states[roomID]; s != nil && idx < len(s.playlist) {
					s.playlist[idx].durationSeconds = dur
				}
				m.mu.Unlock()
				log.Printf("⏱️  [Demo] Room %d probed duration for track %d: %ds", roomID, item.id, dur)
			}
		}(current, state.currentIdx, room.ID)
	}

	// Always rebroadcast current position on every tick — acts as a sync heartbeat and
	// recovery signal for clients whose video ended/stalled while the manager was between
	// advancement ticks (e.g. track ended just after the previous tick, and the client's
	// handleVideoEnd cleared currentMedia before the new loop code deployed). Without this,
	// a client with a blank screen has no way to recover without a page refresh.
	// Only broadcast when the track hasn't ended yet; the advancement block below handles
	// the ended-track case with a seek_time of 0 for the next track.
	if current.durationSeconds == 0 || elapsed < time.Duration(current.durationSeconds)*time.Second {
		seekPos := elapsed.Seconds()
		m.broadcastPlay(room.ID, session.SessionID, current.url, current.title, current.posterURL, seekPos, current.durationSeconds)
	}

	if current.durationSeconds > 0 && elapsed >= time.Duration(current.durationSeconds)*time.Second {
		nextIdx := (state.currentIdx + 1) % len(state.playlist)
		next := state.playlist[nextIdx]

		// Detect duration for the next track in background if not yet known
		if next.durationSeconds == 0 {
			go func(item demoTrack, idx int) {
				if dur := probeMediaDuration(item.url); dur > 0 {
					m.db.Exec("UPDATE demo_media_library SET duration_seconds = ? WHERE id = ?", dur, item.id)
					m.mu.Lock()
					s := m.states[room.ID]
					if s != nil && idx < len(s.playlist) {
						s.playlist[idx].durationSeconds = dur
					}
					m.mu.Unlock()
				}
			}(next, nextIdx)
		}

		// started_at also refreshed here, not just current_media_url/title/poster — the
		// lobby ranking algorithm scores recency as 1/(1+hours_since_start) off this exact
		// field (session_helpers.go). A demo session that's been running continuously for
		// days would otherwise decay toward zero recency despite a brand new track just
		// starting, making genuinely-fresh content invisible in the feed. A new track
		// starting is a legitimate freshness event — and it doubles as defense-in-depth
		// against CleanupStaleSessions' 24h-age sweep, on top of that sweep's own explicit
		// always-on-room exclusion.
		now := time.Now()
		m.db.Model(&session).Updates(map[string]interface{}{
			"current_media_url": next.url,
			"session_title":     next.title,
			"poster_url":        next.posterURL,
			"started_at":        now,
		})
		m.broadcastPlay(room.ID, session.SessionID, next.url, next.title, next.posterURL, 0, next.durationSeconds)
		// Pass through the existing preview_url so the lobby card keeps the session-start clip
		// while the poster updates to the new track's thumbnail. No new clip is generated on
		// track advance — the one clip per session (generated in startSession) stays reused.
		m.broadcastSessionPreview(session.SessionID, next.posterURL, session.PreviewURL)

		m.mu.Lock()
		state.currentIdx = nextIdx
		state.mediaStartedAt = now
		m.mu.Unlock()

		log.Printf("🎬 [Demo] Room %d (%s) → %s", room.ID, room.DemoWatchType, next.title)
	}
}

func (m *DemoSessionManager) startSession(room models.Room) *roomDemoState {
	if room.DemoHostUserID == 0 {
		log.Printf("⚠️ [Demo] Room %d has no demo_host_user_id — skipping", room.ID)
		return nil
	}

	playlist := m.loadPlaylist(room.ID, room.DemoWatchType)
	if len(playlist) == 0 {
		log.Printf("⚠️ [Demo] No active media for room %d (type: %s) — skipping", room.ID, room.DemoWatchType)
		return nil
	}

	first := playlist[0]
	if first.durationSeconds == 0 {
		// Probe duration in background so we don't block the 60s tick.
		// The track will advance on the next tick once duration is known.
		go func(item demoTrack, idx int) {
			if dur := probeMediaDuration(item.url); dur > 0 {
				m.db.Exec("UPDATE demo_media_library SET duration_seconds = ? WHERE id = ?", dur, item.id)
				m.mu.Lock()
				s := m.states[room.ID]
				if s != nil && idx < len(s.playlist) {
					s.playlist[idx].durationSeconds = dur
				}
				m.mu.Unlock()
			}
		}(first, 0)
	}

	sessionID := uuid.New().String()
	now := time.Now()
	session := models.WatchSession{
		SessionID: sessionID,
		RoomID:    room.ID,
		HostID:    room.DemoHostUserID,
		WatchType: room.DemoWatchType,
		StartedAt: now,
		IsActive:  true,
		IsPrivate: false,
		// PreviewEnabled gates PreviewQueue's own pipeline (wall-clock refresh ticker +
		// local-file-based generation) — left false deliberately, not an oversight. That
		// pipeline assumes a local file path and a real TemporaryMediaItem/MediaItem row
		// backing CurrentMediaID, neither of which exists for demo sessions (the "media"
		// is a permanent CDN URL with no DB row of its own). generatePreviewClip below is
		// the dedicated, parallel path for these sessions instead.
		PreviewEnabled:  false,
		CurrentMediaURL: first.url,
		SessionTitle:    first.title,
		PosterURL:       first.posterURL,
		// Room's own ContentRating, not a hardcoded "G" — demo content (e.g. horror,
		// mature drama) needs the same age-gating real sessions get. Falls back to "G"
		// only if the room itself somehow has an empty rating.
		ContentRating:   contentRatingOrDefault(room.ContentRating),
		LastHeartbeatAt: &now,
	}

	if err := m.db.Create(&session).Error; err != nil {
		log.Printf("❌ [Demo] Create session for room %d: %v", room.ID, err)
		return nil
	}

	// Tell any clients already in the room to start playing
	m.broadcastPlay(room.ID, sessionID, first.url, first.title, first.posterURL, 0, first.durationSeconds)
	// Tell lobby so the session card thumbnail shows immediately
	m.broadcastSessionPreview(sessionID, first.posterURL, "")
	go m.generatePreviewClip(session.ID, sessionID, first.url)

	log.Printf("✅ [Demo] Room %d (%s) → session %s playing: %s", room.ID, room.DemoWatchType, sessionID, first.title)

	return &roomDemoState{
		sessionID:      sessionID,
		sessionDBID:    session.ID,
		currentIdx:     0,
		mediaStartedAt: now,
		playlist:       playlist,
	}
}

// loadPlaylist fetches media items for the given room, scoped by room_id (falling back
// to unscoped/legacy rows with room_id IS NULL) and filtered by watch type. room_id
// scoping is what lets two rooms share the same DemoWatchType (e.g. both "video") while
// each drawing from a completely separate content bucket — WatchTypes alone only
// controls rendering mode, not which room's content shows where.
func (m *DemoSessionManager) loadPlaylist(roomID uint, watchType string) []demoTrack {
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
		  AND (room_id = ? OR room_id IS NULL)
		ORDER BY sort_order ASC, id ASC
	`, watchType, roomID).Scan(&rows)

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
//
// Flat shape, no "data" wrapper — matches the convention every other playback_control
// broadcast in this codebase uses (see CLAUDE.md: "must be flat, no data wrapper") and,
// critically, matches how VideoWatch.jsx's WS switch actually reads this message
// (message.media_url / message.file_path directly). The previous nested-under-"data"
// shape meant every track-start and track-advance broadcast was silently dropped —
// VideoWatch.jsx's switch found both message.file_path and message.media_url undefined
// and fell through to a final else that just logs a warning. This was never caught
// because a fresh page load/late-join still picks up the *current* track via the
// separate REST-driven session_status path, which reads current_media_url directly off
// the session row (correctly updated in the DB) — masking that the live broadcast itself
// never worked for anyone already connected.
func (m *DemoSessionManager) broadcastPlay(roomID uint, sessionID, mediaURL, mediaTitle, posterURL string, seekTime float64, durationSeconds int) {
	payload := map[string]interface{}{
		"type":             "playback_control",
		"command":          "play",
		"media_url":        mediaURL,
		"media_title":      mediaTitle,
		"poster_url":       posterURL,
		"seek_time":        seekTime,
		"duration_seconds": durationSeconds,
		"timestamp":        time.Now().UnixMilli(),
		"session_id":       sessionID,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	m.broadcast(roomID, data)
}

// broadcastSessionPreview pushes a session_preview_updated event to all lobby clients
// so the LobbyPage session card shows the demo media thumbnail (and, once
// generatePreviewClip finishes, the looping clip) immediately. Called twice per track:
// once synchronously with just the static poster, once more from generatePreviewClip
// once the real clip is ready — SessionPreview.jsx's poster→video state machine handles
// the second update as a normal upgrade, same as any other session type.
func (m *DemoSessionManager) broadcastSessionPreview(sessionID, posterURL, previewURL string) {
	if m.broadcastLobby == nil || (posterURL == "" && previewURL == "") {
		return
	}
	payload := map[string]interface{}{
		"type":        "session_preview_updated",
		"session_id":  sessionID,
		"poster_url":  posterURL,
		"preview_url": previewURL,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	m.broadcastLobby(data)
}

// generatePreviewClip builds a real, short looping preview clip for the lobby feed by
// running GeneratePreviewMP4 directly against the remote CDN URL — ffmpeg reads HTTP(S)
// URLs natively, so no local download of the (often 100s of MB) source is needed. No
// MediaItem/TemporaryMediaItem row is involved either, unlike the normal upload preview
// pipeline (PreviewQueue) — none exists for demo content, since there was never an
// upload. This writes straight to watch_sessions.poster_url/preview_url instead, which
// is exactly why startSession sets PreviewEnabled: false — that flag exists specifically
// to keep PreviewQueue's own (local-file-path-assuming) machinery from ever touching
// these sessions. Runs in its own goroutine; called from both startSession and the
// track-advance branch in manageRoom.
func (m *DemoSessionManager) generatePreviewClip(sessionDBID uint, sessionID, mediaURL string) {
	tempPath := fmt.Sprintf("/tmp/demo_preview_%d.mp4", sessionDBID)
	defer os.Remove(tempPath)

	if err := utils.GeneratePreviewMP4(mediaURL, tempPath, "00:00:10", 15); err != nil {
		log.Printf("⚠️ [Demo] Preview clip generation failed for session %s: %v", sessionID, err)
		return
	}

	fileData, err := os.ReadFile(tempPath)
	if err != nil {
		log.Printf("⚠️ [Demo] Reading generated preview clip failed for session %s: %v", sessionID, err)
		return
	}

	// Deterministic filename — same path on every server restart so the CDN overwrites
	// cleanly rather than accumulating one file per call. No timestamp suffix needed since
	// this only fires once per session (in startSession), not on track advances.
	previewFilename := fmt.Sprintf("demo_%d_preview.mp4", sessionDBID)
	previewURL, err := utils.UploadPreviewToBunnyCDN(fileData, previewFilename)
	if err != nil {
		log.Printf("⚠️ [Demo] Uploading preview clip failed for session %s: %v", sessionID, err)
		return
	}

	// Guard against a race: a short track + a slow clip generation could mean the
	// playlist already advanced again before this finishes. Don't let a now-stale
	// clip overwrite whatever the (newer) current track's own preview already is.
	var current models.WatchSession
	if err := m.db.Select("current_media_url, poster_url").Where("id = ?", sessionDBID).First(&current).Error; err != nil {
		return
	}
	if current.CurrentMediaURL != mediaURL {
		log.Printf("ℹ️ [Demo] Track advanced before preview clip finished for session %s — discarding stale clip", sessionID)
		return
	}

	m.db.Model(&models.WatchSession{}).Where("id = ?", sessionDBID).Update("preview_url", previewURL)
	m.broadcastSessionPreview(sessionID, current.PosterURL, previewURL)
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

// contentRatingOrDefault falls back to "G" only when the room itself has no rating set
// at all — every real room already has ContentRating populated (not-null, defaulted at
// the DB level), so this is a defensive fallback, not the primary path.
func contentRatingOrDefault(rating string) string {
	if rating == "" {
		return "G"
	}
	return rating
}
