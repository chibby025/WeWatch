package utils

import (
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/sys/unix"
)

type progressiveMode string

const (
	modeProbing     progressiveMode = "probing"
	modeProgressive progressiveMode = "progressive"
	modeFallback    progressiveMode = "fallback"
	modeComplete    progressiveMode = "complete"
)

// HlsSegmentSeconds is the -hls_time value commitProgressiveMode passes to ffmpeg.
// Exported so websocket.go can compute current_segment_index for late-joiner positioning,
// and shared with GeneratePreviewMP4FromHLSSegmentsAtPosition so a playback-time-in-seconds
// can be mapped to a segment index without duplicating the literal in two places.
// Reduced from 6 to 2: max organic drift drops from 6s to 2s, and late-joiner segment
// positioning becomes accurate to within 2s instead of 6s.
const HlsSegmentSeconds = 2

// ProgressiveUploadState tracks one in-flight chunked upload's progressive-HLS lifecycle.
type ProgressiveUploadState struct {
	mu          sync.Mutex
	mode        progressiveMode
	probing     bool
	prefixSeen  int // largest contiguous chunk prefix already considered by a probe attempt
	totalChunks int
	uploadDir   string

	// Set by AbortProgressiveUpload (host switched media away from this upload, or its
	// session ended while it was still in flight). drainChunksToFIFO polls this on every
	// busy-wait tick (≤150ms) and unwinds cleanly — closing the FIFO the same way it does
	// on normal completion (ffmpeg sees EOF and exits) rather than being force-killed.
	aborted bool

	// Updated on every chunk write (see TouchProgressiveUpload). Lets
	// CleanupAbandonedProgressiveUploads tell "still actively uploading, just slow" apart
	// from "genuinely abandoned — tab closed, network died for good, host walked away
	// mid-upload with no Cancel/switch ever reaching the backend" without needing any
	// other signal.
	lastChunkAt time.Time

	// Carried through to the ready-callback once the first segment exists.
	roomID          uint
	sessionID       string
	fileName        string
	uploaderID      uint
	mimeType        string // original source mime type (video/* or audio/*) — preserved through to the TemporaryMediaItem row
	hlsBaseURL      string // full public CDN URL prefix written into the manifest by ffmpeg's -hls_base_url, e.g. "https://x.b-cdn.net/device_streams/{uploadID}/"
	cdnRemotePrefix string // storage-relative prefix used for the actual upload calls, e.g. "device_streams/{uploadID}/" — UploadLocalFileToBunnyCDN combines this with the storage zone itself, so it must NOT include the pull-zone host

	outputDir    string
	fifoPath     string
	manifestPath string
	ffmpegCmd    *exec.Cmd
	drainedUpTo  int

	// Set by the handlers-side ready-callback after it creates the TemporaryMediaItem
	// row, so the later duration-callback knows which row to patch.
	mediaItemID uint

	// Client-supplied duration/poster, read from chunk 0's form data when present (see
	// SetClientUploadMetadata). Lets the ready-callback skip its own ffmpeg-based
	// extraction entirely when the browser already supplied an equivalent value.
	clientDuration   string
	clientPosterPath string
}

var (
	progressiveMu      sync.Mutex
	progressiveUploads = make(map[string]*ProgressiveUploadState)
	// Secondary index so a session-end handler can find "is there an upload still in
	// flight for this session" in O(1) instead of scanning every upload ever started
	// since the process booted. Kept in sync with progressiveUploads by the same
	// mutex — populated in GetOrCreateProgressiveUpload, removed in
	// removeProgressiveUploadLocked (the shared tail both ForgetProgressiveUpload and
	// AbortProgressiveUpload call into).
	sessionToUploadID = make(map[string]string)
)

// removeProgressiveUploadLocked deletes uploadID from both progressiveUploads and the
// sessionToUploadID index. Caller must hold progressiveMu.
func removeProgressiveUploadLocked(uploadID string) {
	if s, ok := progressiveUploads[uploadID]; ok {
		s.mu.Lock()
		sid := s.sessionID
		s.mu.Unlock()
		// Only clear the index entry if it still points at *this* uploadID — a session
		// can have at most one progressive upload at a time in practice, but this guard
		// costs nothing and avoids a theoretical stale-pointer if that were ever not true.
		if sessionToUploadID[sid] == uploadID {
			delete(sessionToUploadID, sid)
		}
	}
	delete(progressiveUploads, uploadID)
}

// ProgressiveReadyInfo is handed to the registered callback once an upload's first HLS
// segment exists and it's safe to let playback start.
type ProgressiveReadyInfo struct {
	UploadID         string
	ManifestPath     string // local filesystem path, relative to the server's working dir
	RoomID           uint
	SessionID        string
	FileName         string
	UploaderID       uint
	MediaItemID      uint   // only populated for the later duration-callback, not the ready-callback
	OriginalMimeType string // source mime type (e.g. "video/mp4", "audio/mpeg") — the manifest itself is always application/vnd.apple.mpegurl, but nothing actually depends on that being stored literally, so the original is preserved instead to keep the audio/video distinction
	ClientDuration   string // non-empty when the browser supplied its own duration on chunk 0
	ClientPosterPath string // non-empty when the browser supplied its own poster frame on chunk 0
	CDNRemotePrefix  string // e.g. "device_streams/{uploadID}/" — where this upload's segments were (or are about to be) uploaded on BunnyCDN, empty if CDN mode wasn't configured for this upload. Persisted onto the TemporaryMediaItem row so delete-time cleanup knows what to remove.
}

// SetProgressiveMediaItemID records the TemporaryMediaItem row created by the
// ready-callback, so the later duration-callback knows which row to patch.
func SetProgressiveMediaItemID(uploadID string, mediaItemID uint) {
	progressiveMu.Lock()
	state, ok := progressiveUploads[uploadID]
	progressiveMu.Unlock()
	if !ok {
		return
	}
	state.mu.Lock()
	state.mediaItemID = mediaItemID
	state.mu.Unlock()
}

// SetClientUploadMetadata records the browser-supplied duration/poster path read from
// chunk 0's form data, if either was present. Read back by the ready-callback (via the
// ProgressiveReadyInfo it's handed) and by the fallback path's final-chunk handling
// (via GetClientUploadMetadata, which only has the uploadID in scope) so both can skip
// their own ffmpeg-based extraction when the browser already supplied an equivalent
// value. Empty strings are valid no-ops — both callers already treat "" as "no client
// value, fall back to today's server-side behavior".
func SetClientUploadMetadata(uploadID, duration, posterPath string) {
	progressiveMu.Lock()
	state, ok := progressiveUploads[uploadID]
	progressiveMu.Unlock()
	if !ok {
		return
	}
	state.mu.Lock()
	state.clientDuration = duration
	state.clientPosterPath = posterPath
	state.mu.Unlock()
}

// GetClientUploadMetadata returns whatever SetClientUploadMetadata recorded for this
// upload (empty strings if nothing was recorded, or the upload's state has already been
// forgotten). Used by the fallback path, which doesn't get a ProgressiveReadyInfo.
func GetClientUploadMetadata(uploadID string) (duration, posterPath string) {
	progressiveMu.Lock()
	state, ok := progressiveUploads[uploadID]
	progressiveMu.Unlock()
	if !ok {
		return "", ""
	}
	state.mu.Lock()
	defer state.mu.Unlock()
	return state.clientDuration, state.clientPosterPath
}

// progressiveReadyCallback is set by the handlers package (which owns DB + WS access).
// utils can't import handlers directly — handlers already imports utils, and Go
// disallows import cycles — so this mirrors the BroadcastRoomFunc injection idiom
// already used between services and handlers elsewhere in this codebase.
var progressiveReadyCallback func(ProgressiveReadyInfo)

// SetProgressiveReadyCallback registers the function invoked when a progressive
// upload's first segment is ready. Call once at startup.
func SetProgressiveReadyCallback(cb func(ProgressiveReadyInfo)) {
	progressiveReadyCallback = cb
}

// progressiveDurationCallback is invoked once ffmpeg finishes and the total duration
// is known (it isn't, until the whole source has been processed — see ResolveFinalMode
// and drainChunksToFIFO). durationSeconds is the sum of every segment's #EXTINF value.
var progressiveDurationCallback func(info ProgressiveReadyInfo, durationSeconds float64)

// SetProgressiveDurationCallback registers the function invoked once an upload's final
// duration becomes known, after ffmpeg has processed the entire source.
func SetProgressiveDurationCallback(cb func(info ProgressiveReadyInfo, durationSeconds float64)) {
	progressiveDurationCallback = cb
}

// progressiveSegmentMilestoneCallback is invoked periodically while a progressive
// upload is still producing new segments — see watchManifestForPreviewRefresh.
// segmentCount is the total number of segments that exist at the time of the call.
var progressiveSegmentMilestoneCallback func(info ProgressiveReadyInfo, segmentCount int)

// SetProgressiveSegmentMilestoneCallback registers the function invoked every time the
// segment count crosses a new previewRefreshSegmentInterval milestone.
func SetProgressiveSegmentMilestoneCallback(cb func(info ProgressiveReadyInfo, segmentCount int)) {
	progressiveSegmentMilestoneCallback = cb
}

// previewRefreshSegmentInterval is how many new segments must land before another
// session-preview clip refresh fires — 5 segments * 6s/segment (-hls_time 6, see
// commitProgressiveMode) ≈ 30s of fresh content per refresh, a reasonable cadence
// against the ffmpeg cost of each regeneration.
const previewRefreshSegmentInterval = 5

// GetOrCreateProgressiveUpload returns the shared state for an upload_id, creating it
// idempotently on first call (safe against the same upload_id's parallel/retried chunk 0).
func GetOrCreateProgressiveUpload(uploadID string, totalChunks int, uploadDir string, roomID uint, sessionID, fileName string, uploaderID uint, mimeType string, hlsBaseURL string, cdnRemotePrefix string) *ProgressiveUploadState {
	progressiveMu.Lock()
	defer progressiveMu.Unlock()
	if s, ok := progressiveUploads[uploadID]; ok {
		return s
	}
	s := &ProgressiveUploadState{
		mode:            modeProbing,
		totalChunks:     totalChunks,
		uploadDir:       uploadDir,
		roomID:          roomID,
		sessionID:       sessionID,
		fileName:        fileName,
		uploaderID:      uploaderID,
		mimeType:        mimeType,
		hlsBaseURL:      hlsBaseURL,
		cdnRemotePrefix: cdnRemotePrefix,
		lastChunkAt:     time.Now(),
	}
	progressiveUploads[uploadID] = s
	if sessionID != "" {
		sessionToUploadID[sessionID] = uploadID
	}
	return s
}

// TouchProgressiveUpload records that a chunk just landed for this upload. Called once
// per chunk write from ChunkUploadHandler — cheap (a mutex already held by this state
// struct specifically, not the package-level progressiveMu), and is the only signal
// CleanupAbandonedProgressiveUploads needs to tell "still actively uploading, just slow"
// apart from "genuinely abandoned".
func TouchProgressiveUpload(state *ProgressiveUploadState) {
	state.mu.Lock()
	state.lastChunkAt = time.Now()
	state.mu.Unlock()
}

// ForgetProgressiveUpload removes an upload's state once it's fully done (progressive
// pipeline finished, or resolved to fallback) so the map doesn't grow unbounded.
func ForgetProgressiveUpload(uploadID string) {
	progressiveMu.Lock()
	defer progressiveMu.Unlock()
	removeProgressiveUploadLocked(uploadID)
}

// AbortProgressiveUploadForSession looks up whatever upload is currently in flight for
// a given session (via the sessionToUploadID index) and aborts it, if one exists. Called
// from EndWatchSessionHandler's background cleanup — without this, an upload that's
// still mid-flight at the exact moment its session ends has no TemporaryMediaItem row
// yet, so the existing "delete temp media for this session" cleanup never finds it: it
// just keeps running, unaware its session is gone, and eventually broadcasts
// device_stream_ready (or persists a poster/duration) referencing a session that no
// longer exists. A no-op if no upload is in flight for this session.
func AbortProgressiveUploadForSession(sessionID string) {
	progressiveMu.Lock()
	uploadID, ok := sessionToUploadID[sessionID]
	progressiveMu.Unlock()
	if !ok {
		return
	}
	log.Printf("🚫 [Progressive] Session %s ended with upload %s still in flight — aborting it", sessionID, uploadID)
	AbortProgressiveUpload(uploadID)
}

// CleanupAbandonedProgressiveUploads is the safety net for everything Fix 1/Fix 2's
// real-time paths might miss — a crash, a force-quit, a bug in either of those paths
// themselves. Two independent passes:
//
//  1. In-memory: any progressiveUploads entry whose lastChunkAt is older than maxAge
//     gets aborted the normal way (AbortProgressiveUpload) — catches an upload nobody
//     ever explicitly cancelled or superseded, that simply stopped receiving chunks
//     (tab closed, network died for good) without any of the real-time paths firing.
//  2. On-disk: uploads/chunks/* directories older than maxAge with no corresponding
//     live entry in progressiveUploads catches the case where the *map* entry is gone
//     (e.g. the server process restarted, wiping all in-memory state) but the directory
//     — and its sibling "<uploadID>_progressive" output directory, if the upload had
//     reached that stage — survived on disk.
//
// maxAge should be generous: long enough that a real, still-legitimately-slow upload is
// never mistaken for abandoned. Intended to run hourly, alongside the other safety-net
// sweeps already on that cadence (CleanupStaleSessions et al.) — this is deliberately
// not its own ticker. chunkUploadDir is passed in rather than duplicated as a constant
// here — utils can't import the handlers package (handlers already imports utils) to
// reference its ChunkUploadDir constant directly, and duplicating the literal would risk
// silently drifting out of sync with it.
func CleanupAbandonedProgressiveUploads(maxAge time.Duration, chunkUploadDir string) {
	cutoff := time.Now().Add(-maxAge)

	progressiveMu.Lock()
	var staleUploadIDs []string
	for id, s := range progressiveUploads {
		s.mu.Lock()
		stale := s.lastChunkAt.Before(cutoff)
		s.mu.Unlock()
		if stale {
			staleUploadIDs = append(staleUploadIDs, id)
		}
	}
	progressiveMu.Unlock()

	for _, id := range staleUploadIDs {
		log.Printf("🧹 [CleanupAbandonedProgressiveUploads] Upload %s had no chunk activity in over %s — aborting", id, maxAge)
		AbortProgressiveUpload(id)
	}

	// Disk pass: anything left in chunkUploadDir that's old and has no live map entry.
	entries, err := os.ReadDir(chunkUploadDir)
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("⚠️ [CleanupAbandonedProgressiveUploads] Failed to read %s: %v", chunkUploadDir, err)
		}
		return
	}

	progressiveMu.Lock()
	liveIDs := make(map[string]bool, len(progressiveUploads))
	for id := range progressiveUploads {
		liveIDs[id] = true
	}
	progressiveMu.Unlock()

	seen := make(map[string]bool)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		baseID := strings.TrimSuffix(entry.Name(), "_progressive")
		if liveIDs[baseID] || seen[baseID] {
			continue
		}
		info, err := entry.Info()
		if err != nil || info.ModTime().After(cutoff) {
			continue
		}
		seen[baseID] = true
		fullPath := filepath.Join(chunkUploadDir, baseID)
		progressivePath := filepath.Join(chunkUploadDir, baseID+"_progressive")
		log.Printf("🧹 [CleanupAbandonedProgressiveUploads] Removing orphaned on-disk upload %s (no live state, older than %s)", baseID, maxAge)
		os.RemoveAll(fullPath)
		os.RemoveAll(progressivePath)
	}
}

// AbortProgressiveUpload cancels an in-flight upload — the host switched to different
// media mid-upload, explicitly hit "Cancel Upload", or the upload's own session ended
// while it was still running. Removes the upload from the map immediately (so nothing
// new can reference it — e.g. a chunk arriving a moment later via GetOrCreateProgressiveUpload
// would otherwise resurrect a fresh state object for an uploadID the caller just asked to
// kill), then either cleans up directly (mode hasn't reached the ffmpeg/FIFO stage yet)
// or sets the aborted flag for drainChunksToFIFO to notice and clean up itself (mode
// progressive — the drainer owns those files while it's running; deleting them out from
// under it here would race).
func AbortProgressiveUpload(uploadID string) {
	progressiveMu.Lock()
	state, ok := progressiveUploads[uploadID]
	if ok {
		removeProgressiveUploadLocked(uploadID)
	}
	progressiveMu.Unlock()
	if !ok {
		return
	}

	state.mu.Lock()
	state.aborted = true
	mode := state.mode
	uploadDir := state.uploadDir
	state.mu.Unlock()

	if mode != modeProgressive {
		// Probing (no ffmpeg/FIFO started yet) or already-resolved-to-fallback — nothing
		// is listening for the aborted flag, so clean up the chunk directory directly.
		log.Printf("🚫 [Progressive] Aborted upload %s (mode=%s, no drainer running) — removing %s", uploadID, mode, uploadDir)
		os.RemoveAll(uploadDir)
		return
	}
	// modeProgressive: drainChunksToFIFO will see state.aborted on its next loop tick
	// (at most ~150ms) and perform its own cleanup of uploadDir/outputDir/fifoPath.
	log.Printf("🚫 [Progressive] Signalled abort to running drainer for upload %s", uploadID)
}

// MaybeStartProgressiveProbe is called after every chunk save. It is cheap to call
// repeatedly: it no-ops unless the contiguous prefix has grown since the last attempt
// and no probe is currently in flight.
func MaybeStartProgressiveProbe(uploadID string, state *ProgressiveUploadState) {
	state.mu.Lock()
	if state.totalChunks <= 2 {
		// Too short to benefit from progressive mode — go straight to the fallback path.
		state.mode = modeFallback
		state.mu.Unlock()
		return
	}
	if state.mode != modeProbing || state.probing {
		state.mu.Unlock()
		return
	}

	prefix := contiguousPrefixLength(state.uploadDir)
	// Never probe the complete file — a complete file is always probe-able regardless
	// of where its structural index sits, because regular files support seeking. That
	// would "succeed" even for files whose index is near the end and incorrectly commit
	// them to the FIFO pipeline, where ffmpeg reads from a non-seekable pipe and can't
	// recover the same way. Only a genuine partial-prefix success is a valid signal that
	// this source is safe to feed progressively. (Chunks can all land while an earlier,
	// smaller-prefix probe is still in flight on a fast/local upload — without this
	// check, the next call here would otherwise test the now-complete file.)
	if prefix == 0 || prefix <= state.prefixSeen || prefix >= state.totalChunks {
		state.mu.Unlock()
		return
	}
	state.prefixSeen = prefix
	state.probing = true
	state.mu.Unlock()

	go runProgressiveProbe(uploadID, state, prefix)
}

// ResolveFinalMode is called when the last chunk has been saved. It briefly waits out
// any in-flight probe so it doesn't race a concurrent commit, then returns whatever mode
// was decided. Deliberately does NOT attempt a fresh probe against the now-complete file:
// a complete file is always probe-able regardless of where its structural index sits,
// because regular files support seeking — so that would "succeed" even for files whose
// index is right at the end, and incorrectly commit them to the FIFO pipeline, where
// ffmpeg reads from a non-seekable pipe and can't recover the same way. The only valid
// signal for FIFO-safety is whether a *partial prefix* probe ever succeeded; if it never
// did, this upload genuinely needs the fallback path. Returns true if the caller should
// leave this upload to the progressive pipeline (drainer + manifest watcher finish it
// asynchronously); false means the caller should run its own one-shot assembly path.
func ResolveFinalMode(uploadID string, state *ProgressiveUploadState) bool {
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		state.mu.Lock()
		mode := state.mode
		probing := state.probing
		state.mu.Unlock()
		if mode != modeProbing {
			return mode == modeProgressive
		}
		if !probing {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}

	state.mu.Lock()
	defer state.mu.Unlock()
	if state.mode == modeProbing {
		state.mode = modeFallback
	}
	return state.mode == modeProgressive
}

// contiguousPrefixLength returns how many chunk_0..chunk_N-1 files currently exist on disk.
func contiguousPrefixLength(uploadDir string) int {
	n := 0
	for {
		p := filepath.Join(uploadDir, fmt.Sprintf("chunk_%d", n))
		if _, err := os.Stat(p); err != nil {
			return n
		}
		n++
	}
}

// runProgressiveProbe concatenates the first `prefix` chunks into a temp file and asks
// ffprobe whether it can already determine the format/duration. Success means the
// source's structural index (e.g. MP4 moov atom) is within this prefix — safe to feed
// progressively. Failure just means "not yet" — the next chunk arrival will retry with
// a larger prefix, up to the natural fallback when the upload completes without ever
// succeeding (e.g. a non-fast-start file with moov near the end).
func runProgressiveProbe(uploadID string, state *ProgressiveUploadState, prefix int) {
	defer func() {
		state.mu.Lock()
		state.probing = false
		state.mu.Unlock()
	}()

	tmpPath := filepath.Join(state.uploadDir, "probe_prefix.tmp")
	if err := concatChunks(state.uploadDir, prefix, tmpPath); err != nil {
		log.Printf("⚠️ [Progressive] Could not build probe prefix for %s: %v", uploadID, err)
		os.Remove(tmpPath)
		return
	}
	defer os.Remove(tmpPath)

	cmd := exec.Command("ffprobe", "-v", "error",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		tmpPath,
	)
	if err := cmd.Run(); err != nil {
		log.Printf("🔍 [Progressive] Probe not ready yet for %s (prefix=%d chunks): %v", uploadID, prefix, err)
		return
	}

	// tmpPath is still on disk here (its removal is deferred to function return), and is a
	// real, seekable prefix of the source — the only point in the progressive pipeline
	// where codec detection is possible at all, since ffmpeg reads the FIFO itself as a
	// non-seekable stream. Feeds commitProgressiveMode's -c:v/-c:a branching below.
	videoCodec, err := DetectVideoCodec(tmpPath)
	if err != nil {
		videoCodec = "unknown"
	}
	audioCodec, err := DetectAudioCodec(tmpPath)
	if err != nil {
		audioCodec = "unknown"
	}

	log.Printf("✅ [Progressive] Fast-start confirmed for %s at prefix=%d chunks (video=%s, audio=%s) — committing progressive mode", uploadID, prefix, videoCodec, audioCodec)
	commitProgressiveMode(uploadID, state, videoCodec, audioCodec)
}

func concatChunks(uploadDir string, count int, destPath string) error {
	f, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("create dest: %w", err)
	}
	defer f.Close()

	for i := 0; i < count; i++ {
		chunkPath := filepath.Join(uploadDir, fmt.Sprintf("chunk_%d", i))
		cf, err := os.Open(chunkPath)
		if err != nil {
			return fmt.Errorf("open chunk %d: %w", i, err)
		}
		_, copyErr := io.Copy(f, cf)
		cf.Close()
		if copyErr != nil {
			return fmt.Errorf("copy chunk %d: %w", i, copyErr)
		}
	}
	return nil
}

// commitProgressiveMode creates the FIFO, starts the long-running ffmpeg process reading
// from it, and launches the drainer + manifest-watcher goroutines. Any failure here
// degrades to the fallback path rather than leaving the upload stuck.
//
// videoCodec/audioCodec (from runProgressiveProbe's one-time prefix probe, "unknown" if
// detection failed) decide whether ffmpeg can stream-copy each track or must transcode —
// see hls.go's SegmentToHLS for why blind -c copy on audio breaks hls.js for codecs like
// EC-3/AC-3.
func commitProgressiveMode(uploadID string, state *ProgressiveUploadState, videoCodec, audioCodec string) {
	state.mu.Lock()
	if state.mode != modeProbing {
		state.mu.Unlock() // already transitioned by a concurrent attempt — no-op
		return
	}
	state.mode = modeProgressive
	// Sibling of uploadDir, not a child — Phase 1's fallback cleanup does an
	// os.RemoveAll(uploadDir) right after assembly, which would otherwise delete the
	// FIFO and output directory (and any not-yet-drained chunk files) out from under
	// this pipeline. Keeping them as siblings means the fallback path's cleanup can
	// never reach them.
	progressiveBaseDir := state.uploadDir + "_progressive"
	outputDir := filepath.Join(progressiveBaseDir, "output")
	fifoPath := filepath.Join(progressiveBaseDir, "stream.fifo")
	manifestPath := filepath.Join(outputDir, "playlist.m3u8")
	state.outputDir = outputDir
	state.fifoPath = fifoPath
	state.manifestPath = manifestPath
	state.mu.Unlock()

	if err := os.MkdirAll(outputDir, 0755); err != nil {
		log.Printf("❌ [Progressive] Failed to create output dir for %s: %v", uploadID, err)
		markFallback(state)
		return
	}
	if err := unix.Mkfifo(fifoPath, 0600); err != nil {
		log.Printf("❌ [Progressive] Failed to create FIFO for %s: %v", uploadID, err)
		markFallback(state)
		return
	}

	segPattern := filepath.Join(outputDir, "seg_%03d.ts")
	ffmpegArgs := []string{"-y", "-i", fifoPath}
	if videoCodec == "h264" {
		ffmpegArgs = append(ffmpegArgs, "-c:v", "copy")
	} else {
		// Full transcode from a FIFO is fine — this only ever needs a forward-only encode,
		// never a seek, so the non-seekable pipe isn't a problem here.
		ffmpegArgs = append(ffmpegArgs, "-c:v", "libx264", "-preset", "veryfast", "-crf", "26")
	}
	if isCompatibleAudioCodec(audioCodec) {
		ffmpegArgs = append(ffmpegArgs, "-c:a", "copy")
	} else {
		// "-ac 2" downmixes multi-channel audio (AC3 5.1 etc.) to stereo before AAC encoding.
		// Without it, ffmpeg emits AAC PCE for 5.1 channel layouts, which hls.js/browsers cannot decode.
		ffmpegArgs = append(ffmpegArgs, "-c:a", "aac", "-b:a", "128k", "-ac", "2")
	}
	ffmpegArgs = append(ffmpegArgs,
		"-sn", // drop subtitle streams — see hls.go's SegmentToHLS for why
		"-f", "hls",
		"-hls_time", fmt.Sprintf("%d", HlsSegmentSeconds),
		"-hls_list_size", "0",
		// append_list intentionally omitted: -hls_list_size 0 already keeps all segments in the
		// manifest, and append_list adds a spurious #EXT-X-DISCONTINUITY before the first segment
		// which confuses hls.js's PTS tracking and causes playback to start at the wrong position.
	)
	if state.hlsBaseURL != "" {
		// Manifest segment lines point straight at the CDN prefix — uploadProgressiveSegmentsToCDN
		// (started below) is responsible for actually getting each segment there before any
		// client reads far enough into the manifest to request it.
		ffmpegArgs = append(ffmpegArgs, "-hls_base_url", state.hlsBaseURL)
	}
	ffmpegArgs = append(ffmpegArgs, "-hls_segment_filename", segPattern, manifestPath)
	cmd := exec.Command("ffmpeg", ffmpegArgs...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	// ffmpeg must open the FIFO's read end (as part of opening -i) before the drainer
	// opens the write end — os.OpenFile on a FIFO with O_WRONLY blocks until a reader
	// exists, so starting ffmpeg first is what makes that block resolve instead of hang.
	if err := cmd.Start(); err != nil {
		log.Printf("❌ [Progressive] Failed to start ffmpeg for %s: %v", uploadID, err)
		markFallback(state)
		return
	}

	state.mu.Lock()
	state.ffmpegCmd = cmd
	state.mu.Unlock()

	go drainChunksToFIFO(uploadID, state)
	go watchManifestForFirstSegment(uploadID, state)
	go watchManifestForPreviewRefresh(uploadID, state)
	if state.hlsBaseURL != "" {
		go uploadProgressiveSegmentsToCDN(uploadID, state)
	}
}

func markFallback(state *ProgressiveUploadState) {
	state.mu.Lock()
	state.mode = modeFallback
	state.mu.Unlock()
}

// drainChunksToFIFO copies chunk files into the FIFO strictly in index order, catching
// up on whatever already landed before commit and continuing as new chunks arrive.
// Closes the write end once the last chunk has been drained, which signals EOF to
// ffmpeg so it finalizes the manifest with #EXT-X-ENDLIST and exits.
func drainChunksToFIFO(uploadID string, state *ProgressiveUploadState) {
	fifoFile, err := openFIFOWriteEnd(state.fifoPath, 15*time.Second)
	if err != nil {
		log.Printf("❌ [Progressive] %v (upload %s)", err, uploadID)
		markFallback(state)
		return
	}

	state.mu.Lock()
	total := state.totalChunks
	state.mu.Unlock()

	aborted := false
	for i := 0; i < total; i++ {
		chunkPath := filepath.Join(state.uploadDir, fmt.Sprintf("chunk_%d", i))
		for {
			state.mu.Lock()
			a := state.aborted
			state.mu.Unlock()
			if a {
				aborted = true
				break
			}
			if _, statErr := os.Stat(chunkPath); statErr == nil {
				break
			}
			time.Sleep(150 * time.Millisecond)
		}
		if aborted {
			break
		}

		cf, openErr := os.Open(chunkPath)
		if openErr != nil {
			log.Printf("❌ [Progressive] Drainer failed to open chunk %d for %s: %v", i, uploadID, openErr)
			fifoFile.Close()
			return
		}
		_, copyErr := io.Copy(fifoFile, cf)
		cf.Close()
		if copyErr != nil {
			log.Printf("❌ [Progressive] Drainer failed writing chunk %d to FIFO for %s: %v", i, uploadID, copyErr)
			fifoFile.Close()
			return
		}
		os.Remove(chunkPath)

		state.mu.Lock()
		state.drainedUpTo = i + 1
		state.mu.Unlock()
	}

	fifoFile.Close() // EOF for ffmpeg either way — aborted or genuinely finished

	state.mu.Lock()
	cmd := state.ffmpegCmd
	uploadDir := state.uploadDir
	outputDir := state.outputDir
	fifoPath := state.fifoPath
	state.mu.Unlock()
	if cmd != nil {
		if waitErr := cmd.Wait(); waitErr != nil {
			log.Printf("⚠️ [Progressive] ffmpeg exited with error for %s: %v", uploadID, waitErr)
		}
	}

	if aborted {
		log.Printf("🚫 [Progressive] Drainer for %s saw abort flag — tearing down (no broadcast, no callbacks)", uploadID)
		os.RemoveAll(uploadDir)
		os.RemoveAll(outputDir)
		os.Remove(fifoPath)
		return
	}

	log.Printf("✅ [Progressive] ffmpeg finished for %s — manifest finalized at %s", uploadID, state.manifestPath)
	os.Remove(state.fifoPath)
	os.RemoveAll(uploadDir) // chunks are fully drained — safe to clean up now

	if duration, err := sumManifestDuration(state.manifestPath); err != nil {
		log.Printf("⚠️ [Progressive] Could not compute final duration for %s: %v", uploadID, err)
	} else if progressiveDurationCallback != nil {
		state.mu.Lock()
		info := ProgressiveReadyInfo{
			UploadID:       uploadID,
			RoomID:         state.roomID,
			SessionID:      state.sessionID,
			MediaItemID:    state.mediaItemID,
			ClientDuration: state.clientDuration,
		}
		state.mu.Unlock()
		if info.MediaItemID != 0 {
			progressiveDurationCallback(info, duration)
		}
	}

	state.mu.Lock()
	state.mode = modeComplete
	state.mu.Unlock()
	ForgetProgressiveUpload(uploadID)
}

// sumManifestDuration adds up every #EXTINF value in a finalized HLS manifest to get
// the source's total duration. ffprobe can't determine this upfront for a progressive
// upload (there's no complete file to probe until the last chunk lands), so this is
// the only point at which the real duration becomes knowable.
func sumManifestDuration(manifestPath string) (float64, error) {
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return 0, fmt.Errorf("read manifest: %w", err)
	}
	var total float64
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "#EXTINF:") {
			continue
		}
		val := strings.TrimPrefix(line, "#EXTINF:")
		val = strings.TrimSuffix(val, ",")
		var seconds float64
		if _, err := fmt.Sscanf(val, "%f", &seconds); err == nil {
			total += seconds
		}
	}
	if total == 0 {
		return 0, fmt.Errorf("no #EXTINF entries found in %s", manifestPath)
	}
	return total, nil
}

// openFIFOWriteEnd opens the write end of a FIFO, bounded by a timeout in case ffmpeg
// never opens the read end (e.g. it crashed immediately after Start()). The open call
// itself blocks at the OS level, so it has to run on its own goroutine to be cancellable.
func openFIFOWriteEnd(fifoPath string, timeout time.Duration) (*os.File, error) {
	type result struct {
		f   *os.File
		err error
	}
	ch := make(chan result, 1)
	go func() {
		f, err := os.OpenFile(fifoPath, os.O_WRONLY, 0)
		ch <- result{f, err}
	}()
	select {
	case r := <-ch:
		if r.err != nil {
			return nil, fmt.Errorf("failed to open FIFO write end: %w", r.err)
		}
		return r.f, nil
	case <-time.After(timeout):
		return nil, fmt.Errorf("timed out opening FIFO write end (ffmpeg never read it)")
	}
}

// watchManifestForFirstSegment polls until 2 segments exist (not just 1) and, once
// they do, invokes the registered ready-callback so the handlers package can create the
// DB row and broadcast the early "ready" signal that lets playback start before upload
// finishes. Requiring a 1-segment cushion ahead of the segment about to play gives
// playback somewhere to draw from if the host's upload has a brief rough patch right at
// the start, instead of announcing ready the instant the very first segment lands.
func watchManifestForFirstSegment(uploadID string, state *ProgressiveUploadState) {
	for i := 0; i < 600; i++ { // ~5 minutes at 500ms
		time.Sleep(500 * time.Millisecond)
		state.mu.Lock()
		aborted := state.aborted
		state.mu.Unlock()
		if aborted {
			log.Printf("🚫 [Progressive] First-segment watcher for %s stopping — upload was aborted", uploadID)
			return
		}
		data, err := os.ReadFile(state.manifestPath)
		if err != nil {
			continue
		}
		// Tolerate a manifest read landing mid-write (ffmpeg doesn't write it
		// atomically) by counting complete #EXTINF lines rather than requiring a
		// perfectly terminated file.
		if strings.Count(string(data), "#EXTINF") >= 2 {
			state.mu.Lock()
			info := ProgressiveReadyInfo{
				UploadID:         uploadID,
				ManifestPath:     state.manifestPath,
				RoomID:           state.roomID,
				SessionID:        state.sessionID,
				FileName:         state.fileName,
				UploaderID:       state.uploaderID,
				OriginalMimeType: state.mimeType,
				ClientDuration:   state.clientDuration,
				ClientPosterPath: state.clientPosterPath,
				CDNRemotePrefix:  state.cdnRemotePrefix,
			}
			state.mu.Unlock()

			log.Printf("🟢 [Progressive] First segment ready for %s", uploadID)
			if progressiveReadyCallback != nil {
				progressiveReadyCallback(info)
			}
			return
		}
	}
	log.Printf("⚠️ [Progressive] Manifest watcher gave up waiting for first segment for %s", uploadID)
}

// watchManifestForPreviewRefresh polls the manifest on the same cadence as the other
// progressive watchers and fires progressiveSegmentMilestoneCallback every time the
// segment count crosses a new multiple of previewRefreshSegmentInterval, so the lobby
// session-preview clip tracks actual upload progress instead of PreviewQueue's
// wall-clock ticker (1 min dev / 5 min prod) — frequently longer than a typical
// upload's entire lifetime, so that ticker often never fires even once. Stops once
// #EXT-X-ENDLIST appears: no further new segments will ever arrive, so there's nothing
// left for this watcher to chase (the ticker remains the mechanism for any preview
// refresh requested after the stream is already complete).
func watchManifestForPreviewRefresh(uploadID string, state *ProgressiveUploadState) {
	lastMilestone := 0
	for i := 0; i < 1200; i++ { // ~10 minutes at 500ms, same budget as the CDN uploader
		time.Sleep(500 * time.Millisecond)
		state.mu.Lock()
		aborted := state.aborted
		state.mu.Unlock()
		if aborted {
			log.Printf("🚫 [Progressive] Preview-refresh watcher for %s stopping — upload was aborted", uploadID)
			return
		}
		data, err := os.ReadFile(state.manifestPath)
		if err != nil {
			continue
		}
		content := string(data)
		segmentCount := strings.Count(content, "#EXTINF")
		milestone := (segmentCount / previewRefreshSegmentInterval) * previewRefreshSegmentInterval

		if milestone > lastMilestone {
			state.mu.Lock()
			mediaItemID := state.mediaItemID
			info := ProgressiveReadyInfo{
				UploadID:         uploadID,
				ManifestPath:     state.manifestPath,
				RoomID:           state.roomID,
				SessionID:        state.sessionID,
				FileName:         state.fileName,
				UploaderID:       state.uploaderID,
				MediaItemID:      mediaItemID,
				OriginalMimeType: state.mimeType,
			}
			state.mu.Unlock()

			// The TemporaryMediaItem row is only created once 2 segments exist (see
			// watchManifestForFirstSegment) — by the time 5+ segments exist it always
			// will be, but don't advance lastMilestone on the off chance this poll
			// landed in that narrow window, so the same milestone retries next tick
			// instead of being skipped forever.
			if mediaItemID != 0 {
				lastMilestone = milestone
				if progressiveSegmentMilestoneCallback != nil {
					progressiveSegmentMilestoneCallback(info, segmentCount)
				}
			}
		}

		if strings.Contains(content, "#EXT-X-ENDLIST") {
			return
		}
	}
}

// extractHLSSegmentNames returns the segment filenames listed in an HLS manifest, in
// order. A manifest line is a segment reference if it's non-empty and not a "#"
// directive — this is true whether ffmpeg wrote a bare relative filename or (when
// -hls_base_url is set) a full CDN URL, so the caller doesn't need to know which.
func extractHLSSegmentNames(manifestContent string) []string {
	var names []string
	for _, line := range strings.Split(manifestContent, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		names = append(names, filepath.Base(line))
	}
	return names
}

// uploadProgressiveSegmentsToCDN runs alongside the drainer + manifest watcher whenever
// BunnyCDN distribution is active for this upload (state.hlsBaseURL != ""). It uploads
// each segment to BunnyCDN as soon as the manifest mentions it, sequentially — not the
// AssembleUploadHandler-style concurrent batch the fallback path uses — because ffmpeg
// only writes a segment's line once that segment file is completely written, and
// processing one at a time keeps every upload's completion ordered before the loop even
// looks for the next one. That ordering is what keeps the very first segment's CDN
// upload finished before watchManifestForFirstSegment's ready-callback can fire shortly
// after (both watchers poll the same manifest on the same cadence): in practice the
// upload of a single ~6s segment finishes well within the time it takes the WS broadcast
// to reach a client and hls.js to request it, so this isn't airtight-by-construction,
// just airtight in the timings that actually occur — a genuinely slow first-segment
// upload could still lose this race, and hls.js's own segment-load retry is what
// absorbs that if it ever happens.
func uploadProgressiveSegmentsToCDN(uploadID string, state *ProgressiveUploadState) {
	uploaded := make(map[string]bool)
	for i := 0; i < 1200; i++ { // ~10 minutes at 500ms — generous since this outlives watchManifestForFirstSegment
		time.Sleep(500 * time.Millisecond)
		state.mu.Lock()
		aborted := state.aborted
		state.mu.Unlock()
		if aborted {
			// Unlike the two manifest-watchers above, this one can leave real artifacts
			// behind on BunnyCDN — any segment already pushed before the abort fired
			// would otherwise sit there forever, since the local cleanup in
			// AbortProgressiveUpload only ever touches local disk. Delete whatever this
			// goroutine itself already confirmed uploaded.
			for name := range uploaded {
				if delErr := DeletePathFromBunnyCDNStorage(state.cdnRemotePrefix + name); delErr != nil {
					log.Printf("⚠️ [Progressive] Failed to delete orphaned CDN segment %s for aborted upload %s: %v", name, uploadID, delErr)
				}
			}
			log.Printf("🚫 [Progressive] CDN segment uploader for %s stopping — upload was aborted (%d uploaded segment(s) cleaned up)", uploadID, len(uploaded))
			return
		}
		data, err := os.ReadFile(state.manifestPath)
		if err != nil {
			continue
		}
		content := string(data)
		ended := strings.Contains(content, "#EXT-X-ENDLIST")

		for _, name := range extractHLSSegmentNames(content) {
			if uploaded[name] {
				continue
			}
			localPath := filepath.Join(state.outputDir, name)
			cdnURL, uploadErr := UploadLocalFileToBunnyCDN(localPath, state.cdnRemotePrefix+name, "video/mp2t")
			if uploadErr != nil {
				// Leave it unmarked — retried on the next pass. Most likely cause is the
				// segment file not being fully flushed to disk yet despite appearing in
				// the manifest read; a transient network error self-heals the same way.
				log.Printf("⚠️ [Progressive] CDN upload failed for segment %s (upload %s), will retry: %v", name, uploadID, uploadErr)
				continue
			}
			uploaded[name] = true
			if strings.HasPrefix(cdnURL, "http") {
				os.Remove(localPath)
			}
		}

		if ended && len(uploaded) == len(extractHLSSegmentNames(content)) {
			log.Printf("✅ [Progressive] All %d segments uploaded to CDN for %s", len(uploaded), uploadID)
			return
		}
	}
	log.Printf("⚠️ [Progressive] CDN segment uploader gave up for %s (timed out)", uploadID)
}

// GeneratePreviewMP4FromHLSSegments builds a short looping preview clip (matching
// PreviewQueue.generateUploadPreview's fallback-path target: ~540p, H.264+AAC) from a
// window of already-completed HLS segments — by the time this is ever called (after
// device_stream_ready, which itself requires 2+ segments per Phase 6's buffer), every
// segment named here is a fully-written, valid standalone .ts file. MPEG-TS segments
// from one continuous encode concatenate cleanly at the byte level, so ffmpeg's concat
// protocol (not the concat demuxer — no list file needed) treats them as one input.
//
// fromLatest selects which end of the segment list to take maxSegments from: false (the
// very first device_stream_ready call) takes the earliest segments, since at that point
// they're the only ones that exist yet; true (a refresh while the upload is still
// actively producing new segments) takes the most recently completed ones instead, so
// the refreshed clip shows different, fresher content rather than replaying the same
// opening few seconds every cycle. Once the stream is complete (no more new segments
// will ever appear), "latest" stops meaning anything useful — see
// GeneratePreviewMP4FromHLSSegmentsAtPosition for that case.
//
// Known, accepted race (same shape as the one already documented for CDN segment
// upload vs the ready-callback): when BunnyCDN is configured, uploadProgressiveSegmentsToCDN
// deletes each segment's local copy once uploaded. The initial (fromLatest=false) call
// runs in the same early window as the poster extraction beside it, which reads
// seg_000.ts under identical timing — not airtight by construction, but borne out in
// practice the same way. The fromLatest=true refresh call has the same exposure against
// whichever segments are newest at refresh time.
func GeneratePreviewMP4FromHLSSegments(segmentDir, outputPath string, maxSegments int, fromLatest bool) error {
	return generatePreviewMP4FromSegmentWindow(segmentDir, outputPath, maxSegments, fromLatest, -1)
}

// GeneratePreviewMP4FromHLSSegmentsAtPosition builds the preview clip from a window of
// segments centered on whichever segment covers positionSeconds — used once a stream is
// complete (#EXT-X-ENDLIST present), when "latest segments" would otherwise permanently
// mean "the last few seconds of the whole file" regardless of where anyone is actually
// watching. positionSeconds is session.CurrentPlaybackTime, which is already kept fresh
// every 30s by VideoWatch.jsx's periodic playback_control "seek" heartbeat — the same
// field the flat-file preview path already uses for this exact purpose.
func GeneratePreviewMP4FromHLSSegmentsAtPosition(segmentDir, outputPath string, maxSegments, positionSeconds int) error {
	return generatePreviewMP4FromSegmentWindow(segmentDir, outputPath, maxSegments, false, positionSeconds/HlsSegmentSeconds)
}

// generatePreviewMP4FromSegmentWindow is the shared implementation behind both exported
// entry points above. centerIndex < 0 means "no specific position" — fall back to the
// fromLatest/fromStart selection; centerIndex >= 0 takes a maxSegments-wide window
// centered on that segment index instead (clamped to the available range).
func generatePreviewMP4FromSegmentWindow(segmentDir, outputPath string, maxSegments int, fromLatest bool, centerIndex int) error {
	entries, err := os.ReadDir(segmentDir)
	if err != nil {
		return fmt.Errorf("failed to read segment dir: %w", err)
	}

	var segments []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasPrefix(e.Name(), "seg_") && strings.HasSuffix(e.Name(), ".ts") {
			segments = append(segments, e.Name())
		}
	}
	if len(segments) == 0 {
		return fmt.Errorf("no segments found in %s", segmentDir)
	}
	sort.Strings(segments) // seg_000.ts, seg_001.ts, ... — zero-padded, sorts correctly as strings

	if centerIndex >= 0 {
		start := centerIndex - maxSegments/2
		if start < 0 {
			start = 0
		}
		end := start + maxSegments
		if end > len(segments) {
			end = len(segments)
			start = end - maxSegments
			if start < 0 {
				start = 0
			}
		}
		segments = segments[start:end]
	} else if len(segments) > maxSegments {
		if fromLatest {
			segments = segments[len(segments)-maxSegments:]
		} else {
			segments = segments[:maxSegments]
		}
	}

	concatParts := make([]string, len(segments))
	for i, name := range segments {
		concatParts[i] = filepath.Join(segmentDir, name)
	}
	concatInput := "concat:" + strings.Join(concatParts, "|")

	// Resolution probed off the first segment alone — every segment shares the source's
	// resolution, so there's no need to probe the concatenated input.
	_, height, err := GetVideoResolution(concatParts[0])
	if err != nil {
		return fmt.Errorf("failed to detect segment resolution: %w", err)
	}
	targetHeight := 540
	if height < targetHeight {
		targetHeight = height // never upscale
	}
	scaleFilter := fmt.Sprintf("scale=-2:%d:flags=lanczos", targetHeight)

	cmd := exec.Command("ffmpeg", "-y",
		"-analyzeduration", "10000000",
		"-probesize", "50000000",
		"-f", "mpegts",
		"-i", concatInput,
		"-t", "15",
		"-c:v", "libx264",
		"-crf", "28",
		"-preset", "veryfast",
		"-vf", fmt.Sprintf("fps=24,%s", scaleFilter),
		"-an",
		"-movflags", "+faststart",
		"-f", "mp4",
		outputPath,
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
