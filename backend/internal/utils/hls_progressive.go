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

// hlsSegmentSeconds is the -hls_time value commitProgressiveMode passes to ffmpeg.
// Shared with GeneratePreviewMP4FromHLSSegmentsAtPosition so a playback-time-in-seconds
// can be mapped to a segment index without duplicating the literal in two places.
const hlsSegmentSeconds = 6

// ProgressiveUploadState tracks one in-flight chunked upload's progressive-HLS lifecycle.
type ProgressiveUploadState struct {
	mu          sync.Mutex
	mode        progressiveMode
	probing     bool
	prefixSeen  int // largest contiguous chunk prefix already considered by a probe attempt
	totalChunks int
	uploadDir   string

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
)

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
	}
	progressiveUploads[uploadID] = s
	return s
}

// ForgetProgressiveUpload removes an upload's state once it's fully done (progressive
// pipeline finished, or resolved to fallback) so the map doesn't grow unbounded.
func ForgetProgressiveUpload(uploadID string) {
	progressiveMu.Lock()
	defer progressiveMu.Unlock()
	delete(progressiveUploads, uploadID)
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

	log.Printf("✅ [Progressive] Fast-start confirmed for %s at prefix=%d chunks — committing progressive mode", uploadID, prefix)
	commitProgressiveMode(uploadID, state)
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
func commitProgressiveMode(uploadID string, state *ProgressiveUploadState) {
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
	ffmpegArgs := []string{"-y",
		"-i", fifoPath,
		"-c", "copy",
		"-sn", // drop subtitle streams — see hls.go's SegmentToHLS for why
		"-f", "hls",
		"-hls_time", fmt.Sprintf("%d", hlsSegmentSeconds),
		"-hls_list_size", "0",
		"-hls_flags", "append_list",
	}
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

	for i := 0; i < total; i++ {
		chunkPath := filepath.Join(state.uploadDir, fmt.Sprintf("chunk_%d", i))
		for {
			if _, statErr := os.Stat(chunkPath); statErr == nil {
				break
			}
			time.Sleep(150 * time.Millisecond)
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

	fifoFile.Close() // EOF for ffmpeg

	state.mu.Lock()
	cmd := state.ffmpegCmd
	uploadDir := state.uploadDir
	state.mu.Unlock()
	if cmd != nil {
		if waitErr := cmd.Wait(); waitErr != nil {
			log.Printf("⚠️ [Progressive] ffmpeg exited with error for %s: %v", uploadID, waitErr)
		}
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
	return generatePreviewMP4FromSegmentWindow(segmentDir, outputPath, maxSegments, false, positionSeconds/hlsSegmentSeconds)
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
		"-f", "mpegts",
		"-i", concatInput,
		"-t", "15",
		"-c:v", "libx264",
		"-crf", "28",
		"-preset", "veryfast",
		"-vf", fmt.Sprintf("fps=24,%s", scaleFilter),
		"-c:a", "aac",
		"-b:a", "96k",
		"-movflags", "+faststart",
		"-f", "mp4",
		outputPath,
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
