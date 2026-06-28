package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/services"
	"wewatch-backend/internal/utils"
)

const ChunkUploadDir = "./uploads/chunks"

// bunnyConfigured returns true when the backend is deployed (not local dev) AND
// BunnyCDN credentials are configured.  Credential presence alone is NOT enough —
// on localhost we always serve from local disk even if the developer has CDN
// credentials in their .env.
func bunnyConfigured() bool {
	return !utils.IsLocalDev() && os.Getenv("BUNNY_ACCESS_KEY") != "" && os.Getenv("BUNNY_STORAGE_ZONE") != ""
}

// progressiveCDNPaths returns the two distinct values an HLS segment-distribution
// pipeline needs when BunnyCDN is configured: hlsBaseURL is the full public CDN URL
// prefix ffmpeg writes into the manifest via -hls_base_url, and cdnRemotePrefix is the
// storage-relative prefix UploadLocalFileToBunnyCDN needs for the actual PUT requests
// (it combines this with the storage zone itself — passing the public URL there would
// double up the host). Both are empty strings on local dev or without credentials,
// which every caller treats as "skip CDN distribution, keep today's local-disk-only
// behavior" — see hls.go's SegmentToHLS and hls_progressive.go's commitProgressiveMode.
func progressiveCDNPaths(uploadID string) (hlsBaseURL, cdnRemotePrefix string) {
	if !bunnyConfigured() {
		return "", ""
	}
	cdnRemotePrefix = fmt.Sprintf("device_streams/%s/", uploadID)
	hlsBaseURL = fmt.Sprintf("%s/%s", strings.TrimRight(utils.BunnyCDNPullZoneURL, "/"), cdnRemotePrefix)
	return hlsBaseURL, cdnRemotePrefix
}

// resolvePosterURL takes a local poster JPEG and returns its public URL — uploading to
// BunnyCDN (and removing the local copy) when configured, else a local /uploads/temp/...
// URL served directly by the static handler. Shared by every poster-resolution call
// site (progressive extraction, fallback extraction, and the client-supplied-poster
// path) so the CDN-vs-local decision lives in exactly one place.
func resolvePosterURL(posterPath string) string {
	if bunnyConfigured() {
		if cdnURL, err := utils.UploadLocalFileToBunnyCDN(posterPath, "temp-media/"+filepath.Base(posterPath), "image/jpeg"); err == nil {
			os.Remove(posterPath)
			return cdnURL
		}
		log.Printf("⚠️ [ChunkUpload] Poster CDN upload failed for %s, serving locally instead", posterPath)
	}
	return fmt.Sprintf("/uploads/temp/%s", filepath.Base(posterPath))
}

func init() {
	err := os.MkdirAll(ChunkUploadDir, os.ModePerm)
	if err != nil {
		log.Fatalf("Failed to create chunk upload directory '%s': %v", ChunkUploadDir, err)
	}
	log.Printf("Chunk upload directory '%s' is ready.", ChunkUploadDir)

	// utils can't import handlers (handlers already imports utils — that would be a
	// cycle), so the progressive-HLS pipeline hands back just the data it gathered and
	// this package does the DB + WS work, same as the rest of chunk_upload.go already does
	// for the non-progressive path. DB is a package-level var set later in main() — safe
	// to reference here since this closure only runs once a real upload completes.
	utils.SetProgressiveReadyCallback(onProgressiveStreamReady)
	utils.SetProgressiveDurationCallback(onProgressiveDurationKnown)
	utils.SetProgressiveSegmentMilestoneCallback(onProgressiveSegmentMilestone)

	// Same cross-package constraint as above, mirrored the other direction: services
	// can't import handlers either (handlers already imports services for
	// GetPreviewQueue()), so PreviewQueue's periodic refresh hands stream items back
	// here instead of regenerating them itself.
	services.SetStreamPreviewRefreshCallback(refreshStreamSessionPreview)
}

// onProgressiveStreamReady creates the TemporaryMediaItem row for a progressive upload's
// manifest and broadcasts device_stream_ready so the host's auto-play (and every other
// room member) can start playing before the rest of the file finishes uploading.
func onProgressiveStreamReady(info utils.ProgressiveReadyInfo) {
	rel, err := filepath.Rel(UploadDir, info.ManifestPath)
	if err != nil {
		log.Printf("❌ [Progressive] Could not compute manifest URL for %s: %v", info.UploadID, err)
		return
	}
	manifestURL := "/uploads/" + filepath.ToSlash(rel)

	// Browser-supplied poster/duration (see SetClientUploadMetadata) skip the
	// placeholder + later ffmpeg extraction entirely — the real CPU saving this
	// feature is for. Either being absent falls back to exactly today's behavior.
	posterURL := "/icons/placeholder-poster.jpg"
	if info.ClientPosterPath != "" {
		posterURL = resolvePosterURL(info.ClientPosterPath)
	}

	item := models.TemporaryMediaItem{
		FileName:     filepath.Base(info.FileName),
		OriginalName: info.FileName,
		MimeType:     info.OriginalMimeType,
		FilePath:     manifestURL,
		PosterURL:    posterURL,
		Duration:     info.ClientDuration,
		RoomID:       info.RoomID,
		UploaderID:   info.UploaderID,
		OrderIndex:   0,
		SessionID:    info.SessionID,
		IsStream:     true,
	}
	if err := DB.Create(&item).Error; err != nil {
		log.Printf("❌ [Progressive] Failed to create TemporaryMediaItem for %s: %v", info.UploadID, err)
		return
	}
	utils.SetProgressiveMediaItemID(info.UploadID, item.ID)
	log.Printf("✅ [Progressive] Created TemporaryMediaItem ID=%d for %s (early-ready, manifest=%s)", item.ID, info.UploadID, manifestURL)

	// Session-level lobby preview (the WatchOuts feed card) — only worth doing once we
	// have a real frame, not the placeholder; SessionPreview.jsx's animated emoji
	// fallback looks better than a generic placeholder image while waiting for one.
	// Skipped here when there's no client poster — generateAndBroadcastProgressivePoster
	// (below) handles that case once its own ffmpeg extraction finishes.
	if info.ClientPosterPath != "" {
		persistAndBroadcastSessionPoster(info.SessionID, posterURL)
	}

	// Cinema/video-watch rooms never send media_play (only classroom/lecture-hall do),
	// so without this the lobby's session preview would be generated exactly once at
	// upload time and never refreshed again for the entire life of the session.
	startSessionPreviewRefresh(info.SessionID, item.ID, manifestURL, manifestURL)

	// Flat shape (no "data" wrapper) — matches playback_control's convention, since
	// VideoWatch.jsx's device_stream_ready handler reads fields the same way.
	broadcastData, err := json.Marshal(map[string]interface{}{
		"type":          "device_stream_ready",
		"media_item_id": item.ID,
		"upload_id":     info.UploadID,
		"file_path":     manifestURL,
		"file_url":      manifestURL,
		"original_name": info.FileName,
		"mime_type":     item.MimeType,
		"session_id":    info.SessionID,
		"room_id":       info.RoomID,
		"uploader_id":   info.UploaderID,
		"is_stream":     true,
	})
	if err != nil {
		log.Printf("❌ [Progressive] Failed to marshal device_stream_ready for %s: %v", info.UploadID, err)
		return
	}
	hub.BroadcastToRoom(info.RoomID, OutgoingMessage{Data: broadcastData, IsBinary: false}, nil)

	// Deferred to its own goroutine so it never delays the device_stream_ready broadcast
	// just sent (the whole point of progressive streaming is playback starting as fast
	// as possible). Always runs — generates the animated session-preview clip regardless
	// of whether the poster itself came from the client; only the poster-extraction half
	// (inside the callee) is skipped in that case, since it's the real ffmpeg CPU saving.
	existingPosterURL := ""
	if info.ClientPosterPath != "" {
		existingPosterURL = posterURL
	}
	go generateAndBroadcastProgressivePoster(info, item.ID, existingPosterURL)
}

// generateAndBroadcastProgressivePoster grabs a real frame from the first HLS segment
// (already fully written to disk by the time device_stream_ready fires — ffmpeg only
// appends a segment's #EXTINF line once that segment file is closed) and replaces the
// placeholder poster set in onProgressiveStreamReady, then generates the short animated
// preview clip the lobby's WatchOuts feed needs to advance past the static-poster state.
// existingPosterURL is non-empty when the browser already supplied a poster (Phase 9) —
// in that case the ffmpeg extraction below is skipped entirely (the real CPU saving),
// and the already-resolved URL is reused for the lobby broadcast at the bottom instead
// of calling resolvePosterURL a second time, which is not safe to do (it deletes the
// local file after a successful CDN upload).
func generateAndBroadcastProgressivePoster(info utils.ProgressiveReadyInfo, mediaItemID uint, existingPosterURL string) {
	posterURL := existingPosterURL
	if posterURL == "" {
		segPath := filepath.Join(filepath.Dir(info.ManifestPath), "seg_000.ts")
		posterPath := filepath.Join(UploadDir, "temp", info.UploadID+"_poster.jpg")

		if err := utils.ExtractThumbnail(segPath, posterPath); err != nil {
			// Expected for audio-only progressive streams (no video frame to grab) as
			// well as genuine failures — placeholder stays either way, same as the
			// fallback path. Still fall through to the preview-clip attempt below;
			// audio sources won't have a video stream to clip either, but a video
			// source that merely failed poster extraction might still clip fine.
			log.Printf("⚠️ [Progressive] Poster generation failed for temp item %d: %v", mediaItemID, err)
		} else {
			posterURL = resolvePosterURL(posterPath)

			if err := DB.Model(&models.TemporaryMediaItem{}).Where("id = ?", mediaItemID).Update("poster_url", posterURL).Error; err != nil {
				log.Printf("❌ [Progressive] Failed to update poster_url for temp item %d: %v", mediaItemID, err)
			} else {
				log.Printf("✅ [Progressive] Poster updated for temp item %d: %s", mediaItemID, posterURL)
			}

			persistAndBroadcastSessionPoster(info.SessionID, posterURL)

			roomBroadcast := map[string]interface{}{
				"type": "playlist_poster_updated", "item_id": mediaItemID, "poster_url": posterURL,
			}
			roomJSON, _ := json.Marshal(roomBroadcast)
			hub.BroadcastToRoom(info.RoomID, OutgoingMessage{Data: roomJSON, IsBinary: false}, nil)
		}
	}

	// Animated session-preview clip — independent of the poster path above. Video
	// sources only: an audio-only progressive stream has nothing visual to loop beyond
	// the static poster the player already shows via VinylPlayer.
	if !strings.HasPrefix(info.OriginalMimeType, "video/") {
		return
	}
	segDir := filepath.Dir(info.ManifestPath)
	// Same item-ID-keyed filename refreshStreamSessionPreview uses for its later refreshes
	// (not info.UploadID — that's only known here, at upload time) — so the periodic
	// refresh overwrites this exact file in place instead of leaving it orphaned the
	// moment the first refresh cycle creates a separately-named one.
	previewPath := filepath.Join(UploadDir, "temp", fmt.Sprintf("temp_item_%d_preview.mp4", mediaItemID))
	if err := utils.GeneratePreviewMP4FromHLSSegments(segDir, previewPath, 3, false); err != nil {
		log.Printf("⚠️ [Progressive] Preview clip generation failed for temp item %d: %v", mediaItemID, err)
		return
	}
	previewURL := resolvePreviewURL(previewPath)
	log.Printf("✅ [Progressive] Preview clip generated for temp item %d: %s", mediaItemID, previewURL)

	if info.SessionID == "" {
		return
	}
	if err := DB.Table("watch_sessions").Where("session_id = ?", info.SessionID).
		Update("preview_url", previewURL).Error; err != nil {
		log.Printf("❌ [Progressive] Failed to persist session preview_url for %s: %v", info.SessionID, err)
	}
	lobbyBroadcast := map[string]interface{}{
		"type": "session_preview_updated", "session_id": info.SessionID,
		"poster_url": posterURL, "preview_url": previewURL,
	}
	lobbyJSON, _ := json.Marshal(lobbyBroadcast)
	hub.BroadcastToLobby(OutgoingMessage{Data: lobbyJSON, IsBinary: false})
}

// resolvePreviewURL mirrors resolvePosterURL but for the short MP4 preview clip — CDN
// upload when configured (reusing the same helper the fallback upload path's
// PreviewQueue already uses for its own preview clips), else a local /uploads/temp URL.
func resolvePreviewURL(previewPath string) string {
	if bunnyConfigured() {
		if fileData, err := os.ReadFile(previewPath); err == nil {
			if cdnURL, uploadErr := utils.UploadPreviewToBunnyCDN(fileData, filepath.Base(previewPath)); uploadErr == nil {
				os.Remove(previewPath)
				return cdnURL
			}
		}
		log.Printf("⚠️ [ChunkUpload] Preview CDN upload failed for %s, serving locally instead", previewPath)
	}
	return fmt.Sprintf("/uploads/temp/%s", filepath.Base(previewPath))
}

// persistAndBroadcastSessionPoster writes the lobby-facing poster onto the session's own
// row (so a client fetching the session list via REST — not just one already connected
// to the lobby WS at broadcast time — sees it too) and broadcasts the update for anyone
// already watching. The progressive upload path was missing the DB write entirely before
// this — it only ever broadcast, so the poster vanished on any reconnect/refresh. Mirrors
// what PreviewQueue.generateUploadPreview already does for the fallback upload path.
func persistAndBroadcastSessionPoster(sessionID, posterURL string) {
	if sessionID == "" {
		return
	}
	if err := DB.Table("watch_sessions").Where("session_id = ?", sessionID).
		Update("poster_url", posterURL).Error; err != nil {
		log.Printf("❌ [Progressive] Failed to persist session poster_url for %s: %v", sessionID, err)
	}
	lobbyBroadcast := map[string]interface{}{
		"type": "session_preview_updated", "session_id": sessionID,
		"poster_url": posterURL, "preview_url": "",
	}
	lobbyJSON, _ := json.Marshal(lobbyBroadcast)
	hub.BroadcastToLobby(OutgoingMessage{Data: lobbyJSON, IsBinary: false})
}

// startSessionPreviewRefresh persists the now-playing item's identity onto the session
// row (the same current_media_type/id/path/url fields MediaSwitchHandler.HandleMediaPlay
// already writes for classroom/lecture-hall rooms) and starts PreviewQueue's periodic
// refresh ticker (1 min in local dev, 5 min in production). Without this, only
// classroom/lecture-hall sessions ever got an ongoing refresh — media_play (the only
// thing that starts the ticker via HandleMediaPlay) is only ever sent from
// LectureHallPage.jsx/PositionCalculatorPage.jsx and a classroom-gated branch in
// LeftSidebar.jsx, so cinema/video-watch rooms never reached this path despite getting
// the same one-shot initial preview every other upload already gets. Session-end
// cleanup (StopRefreshTimer/ClearSessionPreview) is already generic — wired into
// EndWatchSessionHandler's background cleanup for every room type — so only the START
// side needed extending here.
func startSessionPreviewRefresh(sessionID string, mediaID uint, mediaPath, mediaURL string) {
	if sessionID == "" {
		return
	}
	if err := DB.Model(&models.WatchSession{}).Where("session_id = ?", sessionID).Updates(map[string]interface{}{
		"current_media_type": "upload",
		"current_media_id":   mediaID,
		"current_media_path": mediaPath,
		"current_media_url":  mediaURL,
	}).Error; err != nil {
		log.Printf("❌ [PreviewRefresh] Failed to persist current_media fields for %s: %v", sessionID, err)
		return
	}
	if pq := services.GetPreviewQueue(); pq != nil {
		pq.StartRefreshTimer(sessionID)
	}
}

// refreshStreamSessionPreview is PreviewQueue's registered callback for IsStream items
// (services.SetStreamPreviewRefreshCallback). While the upload is still actively
// producing new segments, it regenerates from whichever segments are newest
// (fromLatest=true) so each refresh shows different, fresher content. Once the manifest
// is complete (#EXT-X-ENDLIST present — no more new segments will ever arrive), "latest"
// would otherwise permanently mean "the last few seconds of the whole file," frozen
// forever regardless of where anyone is actually watching — so this branches to
// generating from a window centered on the session's actual current playback position
// instead (current_playback_time, already kept fresh every 30s by VideoWatch.jsx's
// periodic playback_control "seek" heartbeat, the same field the flat-file preview path
// already relies on for this exact purpose). Deterministic output filename, keyed by the
// item's own ID (the only stable identifier available here — the original upload ID
// string isn't stored on the model), means each refresh overwrites the previous
// refresh's file in place, same "replaces older previews" semantics the fallback path
// already has via its own deterministic filename + atomic rename.
func refreshStreamSessionPreview(sessionID string, mediaItem *models.TemporaryMediaItem) {
	manifestFSPath := strings.TrimPrefix(mediaItem.FilePath, "/")
	segDir := filepath.Dir(manifestFSPath)
	previewPath := filepath.Join(UploadDir, "temp", fmt.Sprintf("temp_item_%d_preview.mp4", mediaItem.ID))

	manifestData, manifestErr := os.ReadFile(manifestFSPath)
	streamComplete := manifestErr == nil && strings.Contains(string(manifestData), "#EXT-X-ENDLIST")

	var genErr error
	if streamComplete {
		var session models.WatchSession
		DB.Where("session_id = ?", sessionID).First(&session)
		genErr = utils.GeneratePreviewMP4FromHLSSegmentsAtPosition(segDir, previewPath, 3, session.CurrentPlaybackTime)
	} else {
		genErr = utils.GeneratePreviewMP4FromHLSSegments(segDir, previewPath, 3, true)
	}
	if genErr != nil {
		log.Printf("⚠️ [PreviewRefresh] Stream preview refresh failed for item %d: %v", mediaItem.ID, genErr)
		return
	}
	previewURL := resolvePreviewURL(previewPath)
	log.Printf("✅ [PreviewRefresh] Stream preview refreshed for item %d: %s", mediaItem.ID, previewURL)

	if err := DB.Table("watch_sessions").Where("session_id = ?", sessionID).
		Update("preview_url", previewURL).Error; err != nil {
		log.Printf("❌ [PreviewRefresh] Failed to persist refreshed preview_url for %s: %v", sessionID, err)
	}
	lobbyBroadcast := map[string]interface{}{
		"type": "session_preview_updated", "session_id": sessionID,
		"poster_url": mediaItem.PosterURL, "preview_url": previewURL,
	}
	lobbyJSON, _ := json.Marshal(lobbyBroadcast)
	hub.BroadcastToLobby(OutgoingMessage{Data: lobbyJSON, IsBinary: false})
}

// onProgressiveSegmentMilestone is utils.SetProgressiveSegmentMilestoneCallback's
// registered handler — fires every ~5 new segments (utils.previewRefreshSegmentInterval)
// while a progressive upload is still in flight, well before PreviewQueue's wall-clock
// ticker (1 min dev / 5 min prod) would otherwise ever get a chance to fire during a
// typical upload's lifetime. Reuses refreshStreamSessionPreview — the exact same
// regeneration the ticker itself calls — so this is purely a faster, progress-driven
// trigger, not a second code path.
func onProgressiveSegmentMilestone(info utils.ProgressiveReadyInfo, segmentCount int) {
	if info.MediaItemID == 0 || info.SessionID == "" {
		return
	}
	var tempItem models.TemporaryMediaItem
	if err := DB.First(&tempItem, info.MediaItemID).Error; err != nil {
		log.Printf("⚠️ [PreviewRefresh] Segment-milestone lookup failed for item %d (%d segments): %v", info.MediaItemID, segmentCount, err)
		return
	}
	log.Printf("🔄 [PreviewRefresh] Segment milestone reached for item %d: %d segments", info.MediaItemID, segmentCount)
	refreshStreamSessionPreview(info.SessionID, &tempItem)
}

// onProgressiveDurationKnown patches the TemporaryMediaItem's duration once ffmpeg has
// processed the entire source — unknowable any earlier, since there's no complete file
// to probe until the last chunk lands. Broadcasts the update so the UI's duration
// display catches up without needing a page reload.
func onProgressiveDurationKnown(info utils.ProgressiveReadyInfo, durationSeconds float64) {
	// The browser's own duration was already used at item-creation time and already
	// shown — patching it again here would just be a redundant DB write + broadcast
	// for a value the UI already has.
	if info.ClientDuration != "" {
		log.Printf("⏭️ [Progressive] Skipping duration patch for item %d — client already supplied %s", info.MediaItemID, info.ClientDuration)
		return
	}
	duration := formatDurationHHMMSS(durationSeconds)
	if err := DB.Model(&models.TemporaryMediaItem{}).Where("id = ?", info.MediaItemID).Update("duration", duration).Error; err != nil {
		log.Printf("❌ [Progressive] Failed to patch duration for item %d: %v", info.MediaItemID, err)
		return
	}
	log.Printf("✅ [Progressive] Duration patched for item %d: %s", info.MediaItemID, duration)

	broadcastData, err := json.Marshal(map[string]interface{}{
		"type":       "playlist_duration_updated",
		"item_id":    info.MediaItemID,
		"duration":   duration,
		"session_id": info.SessionID,
	})
	if err != nil {
		return
	}
	hub.BroadcastToRoom(info.RoomID, OutgoingMessage{Data: broadcastData, IsBinary: false}, nil)
}

func formatDurationHHMMSS(totalSeconds float64) string {
	total := int(totalSeconds)
	hours := total / 3600
	minutes := (total % 3600) / 60
	secs := total % 60
	return fmt.Sprintf("%02d:%02d:%02d", hours, minutes, secs)
}

// AbortUploadHandler cancels an in-flight progressive/chunked upload server-side — the
// host switched media away from it, or explicitly hit "Cancel Upload" (the frontend's
// own AbortController only stops the browser from sending more chunks; without this,
// the backend's drainer goroutine keeps waiting on chunks that will never arrive, and
// the eventual completion would still broadcast device_stream_ready for media nobody
// asked for anymore). Host-only, same authorization pattern as
// DeleteSingleTemporaryMediaItemHandler. Idempotent — aborting an already-finished or
// already-aborted upload_id is a silent no-op (AbortProgressiveUpload's own map lookup
// just finds nothing).
// Route: DELETE /api/rooms/:id/upload/:upload_id
func AbortUploadHandler(c *gin.Context) {
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	authenticatedUserID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil || roomID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	uploadID := c.Param("upload_id")
	if uploadID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "upload_id is required"})
		return
	}

	var room models.Room
	if err := DB.First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}
	if room.HostID != authenticatedUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the host can abort an upload"})
		return
	}

	log.Printf("🚫 [AbortUpload] Host %d aborting upload %s in room %d", authenticatedUserID, uploadID, roomID)
	utils.AbortProgressiveUpload(uploadID)
	c.JSON(http.StatusOK, gin.H{"aborted": true})
}

// ChunkUploadHandler handles chunked file uploads
// Route: POST /api/rooms/:id/upload?chunked=true
func ChunkUploadHandler(c *gin.Context) {
	log.Println("🧩 ChunkUploadHandler CALLED")

	// Authentication check
	userIDValue, exists := c.Get("user_id")
	if !exists {
		log.Println("ChunkUploadHandler: Unauthorized access")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	authenticatedUserID, ok := userIDValue.(uint)
	if !ok {
		log.Println("ChunkUploadHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Get room ID
	roomIDStr := c.Param("id")
	if roomIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Room ID is required"})
		return
	}
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil || roomID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	roomIDUint := uint(roomID)

	// Verify room exists
	var room models.Room
	result := DB.First(&room, roomIDUint)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	// Get chunk metadata from form
	chunkIndexStr := c.PostForm("chunk_index")
	totalChunksStr := c.PostForm("total_chunks")
	uploadID := c.PostForm("upload_id")
	fileName := c.PostForm("file_name")
	fileSizeStr := c.PostForm("file_size")

	if uploadID == "" || fileName == "" || chunkIndexStr == "" || totalChunksStr == "" {
		log.Printf("ChunkUploadHandler: Missing required fields")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing required chunk metadata"})
		return
	}

	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chunk index"})
		return
	}

	totalChunks, err := strconv.Atoi(totalChunksStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid total chunks"})
		return
	}

	fileSize, err := strconv.ParseInt(fileSizeStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file size"})
		return
	}

	log.Printf("🧩 [Chunk %d/%d] Received for upload_id: %s", chunkIndex+1, totalChunks, uploadID)

	// Get chunk file from form
	chunkFile, err := c.FormFile("chunk")
	if err != nil {
		log.Printf("ChunkUploadHandler: Error retrieving chunk: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "No chunk provided"})
		return
	}

	// Create upload directory for this upload_id
	uploadDir := filepath.Join(ChunkUploadDir, uploadID)
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		log.Printf("ChunkUploadHandler: Failed to create upload directory: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare storage"})
		return
	}

	// Save chunk with index in filename. Written to a temp name first and atomically
	// renamed into place — a reader (the Phase 2 progressive drainer) racing a retry-POST
	// that rewrites the same chunk_index would otherwise risk reading a truncated/partial
	// file mid-write. Rename is atomic on the same filesystem, so readers only ever see
	// either the old complete file or the new complete file, never a half-written one.
	chunkPath := filepath.Join(uploadDir, fmt.Sprintf("chunk_%d", chunkIndex))
	tmpChunkPath := chunkPath + ".tmp"
	if err := c.SaveUploadedFile(chunkFile, tmpChunkPath); err != nil {
		log.Printf("ChunkUploadHandler: Failed to save chunk: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save chunk"})
		return
	}
	if err := os.Rename(tmpChunkPath, chunkPath); err != nil {
		log.Printf("ChunkUploadHandler: Failed to finalize chunk: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save chunk"})
		return
	}

	log.Printf("✅ [Chunk %d/%d] Saved successfully", chunkIndex+1, totalChunks)

	// Progressive HLS (Phase 2): for temporary video uploads, try to start segmenting
	// from whatever has landed so far instead of waiting for the last chunk. Scoped to
	// isTemporary (session uploads) + video, matching Phase 1's existing scoping.
	sessionIDEarly := c.Query("session_id")
	earlyMimeType := getMimeType(strings.ToLower(filepath.Ext(fileName)))
	isProgressiveCandidate := sessionIDEarly != "" && (strings.HasPrefix(earlyMimeType, "video/") || strings.HasPrefix(earlyMimeType, "audio/"))
	var progressiveState *utils.ProgressiveUploadState
	if isProgressiveCandidate {
		hlsBaseURL, cdnRemotePrefix := progressiveCDNPaths(uploadID)
		progressiveState = utils.GetOrCreateProgressiveUpload(uploadID, totalChunks, uploadDir, roomIDUint, sessionIDEarly, fileName, authenticatedUserID, earlyMimeType, hlsBaseURL, cdnRemotePrefix)
		utils.TouchProgressiveUpload(progressiveState)
		utils.MaybeStartProgressiveProbe(uploadID, progressiveState)

		// Tell the room a stream is on its way, the moment the first chunk lands — long
		// before any segment exists. At this point we don't yet know if this upload will
		// end up progressive or fallback, so this fires for both; whichever "ready" signal
		// arrives later (device_stream_ready, in both cases after the broadcast unification
		// above) clears it client-side. chunkIndex==0 keeps this to a single broadcast per
		// upload rather than once per chunk.
		if chunkIndex == 0 {
			if preparingData, err := json.Marshal(map[string]interface{}{
				"type":        "device_stream_preparing",
				"session_id":  sessionIDEarly,
				"room_id":     roomIDUint,
				"uploader_id": authenticatedUserID,
			}); err == nil {
				hub.BroadcastToRoom(roomIDUint, OutgoingMessage{Data: preparingData, IsBinary: false}, nil)
			}

			// Browser-supplied duration/poster — read straight from the file's own
			// container metadata and a canvas frame grab, both essentially free
			// client-side. When present, this lets the ready-callback (and the fallback
			// path's final-chunk handling) skip their own ffmpeg-based extraction
			// entirely — the real CPU saving at scale this was built for. Either field
			// being absent just falls back to today's server-side behavior, unchanged.
			clientDuration := c.PostForm("client_duration")
			var clientPosterPath string
			posterFile, posterErr := c.FormFile("client_poster")
			if posterErr == nil {
				candidatePath := filepath.Join(UploadDir, "temp", uploadID+"_poster.jpg")
				if err := c.SaveUploadedFile(posterFile, candidatePath); err != nil {
					log.Printf("⚠️ [ChunkUpload] Failed to save client-supplied poster for %s: %v", uploadID, err)
				} else {
					clientPosterPath = candidatePath
				}
			}
			if clientDuration != "" || clientPosterPath != "" {
				utils.SetClientUploadMetadata(uploadID, clientDuration, clientPosterPath)
			}
		}
	}

	// Check if this is the last chunk
	if chunkIndex == totalChunks-1 {
		// If progressive mode committed (or commits in these last few ms), the drainer +
		// manifest watcher finish segmenting and create the DB row asynchronously — skip
		// the one-shot assembly entirely. Crucially, do NOT delete uploadDir here either:
		// the drainer is still reading chunk files out of it.
		if isProgressiveCandidate && utils.ResolveFinalMode(uploadID, progressiveState) {
			log.Printf("🎯 [Final Chunk] Progressive mode active for %s — draining finishes asynchronously", uploadID)
			c.JSON(http.StatusAccepted, gin.H{
				"message":     "Upload received — finishing HLS segmenting in background",
				"upload_id":   uploadID,
				"progressive": true,
			})
			return
		}

		log.Printf("🎯 [Final Chunk] All chunks received, assembling file...")

		// Assemble chunks into final file
		sessionID := c.Query("session_id")
		finalFilePath, err := assembleChunks(uploadDir, fileName, totalChunks, authenticatedUserID, roomIDUint, sessionID, fileSize)
		if err != nil {
			log.Printf("❌ [Assembly] Failed to assemble chunks: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to assemble file: %v", err)})
			return
		}

		// Clean up chunk directory
		if err := os.RemoveAll(uploadDir); err != nil {
			log.Printf("⚠️ [Cleanup] Failed to remove chunk directory: %v", err)
		}
		// Must read before ForgetProgressiveUpload removes the state this comes from.
		var clientDuration, clientPosterPath string
		if isProgressiveCandidate {
			clientDuration, clientPosterPath = utils.GetClientUploadMetadata(uploadID)
			utils.ForgetProgressiveUpload(uploadID)
		}

		log.Printf("🎉 [Assembly] File assembled successfully: %s", finalFilePath)

		// ✅ CREATE DATABASE ENTRY (CRITICAL FIX - was missing before!)
		log.Printf("💾 [ChunkUpload] Creating database entry...")
		ext := strings.ToLower(filepath.Ext(fileName))
		mimeType := getMimeType(ext)

		// Browsers don't reliably play .mkv via <video> — transcode to MP4 now so playback
		// never depends on container support. No-op (transcoded=false) for any other extension.
		if newPath, newExt, newMime, transcoded := utils.TranscodeMkvToMp4IfNeeded(finalFilePath, ext, mimeType); transcoded {
			finalFilePath = newPath
			ext = newExt
			mimeType = newMime
			if fi, statErr := os.Stat(finalFilePath); statErr == nil {
				fileSize = fi.Size()
			}
		}

		// Get media duration (video or audio — ffprobe-backed, format-agnostic). Skip the
		// ffprobe call entirely when the browser already supplied one on chunk 0.
		var duration string
		if clientDuration != "" {
			duration = clientDuration
			log.Printf("📹 [ChunkUpload] Using client-supplied duration: %s", duration)
		} else if strings.HasPrefix(mimeType, "video/") || strings.HasPrefix(mimeType, "audio/") {
			if dur, err := utils.GetVideoDuration(finalFilePath); err == nil {
				duration = dur
				log.Printf("📹 [ChunkUpload] Video duration: %s", dur)
			}
		}

		// Determine if temporary based on sessionID
		isTemporary := sessionID != ""
		log.Printf("🏷️ [ChunkUpload] isTemporary=%v, sessionID=%s", isTemporary, sessionID)

		// Generate poster filename
		posterFilename := strings.TrimSuffix(filepath.Base(finalFilePath), ext) + "_poster.jpg"
		uniqueFilename := filepath.Base(finalFilePath) // ✅ Extract filename from full path
		var posterPath string
		var posterURL string = "/icons/placeholder-poster.jpg" // ✅ Placeholder until async generation completes
		hasClientPoster := clientPosterPath != ""

		if isTemporary {
			posterPath = filepath.Join(UploadDir, "temp", posterFilename)
		} else {
			posterPath = filepath.Join(UploadDir, posterFilename)
		}

		// Browser already supplied a poster on chunk 0 — resolve it now (small, fast
		// CDN-or-local decision) instead of the placeholder, and skip the async
		// ffmpeg-based extraction below entirely. The real CPU saving this is for.
		if hasClientPoster {
			posterURL = resolvePosterURL(clientPosterPath)
		}

		if isTemporary {
			// Device-streamed media is delivered as HLS rather than a single direct file —
			// segment the assembled video now (fast: ffmpeg -c copy when source is already H.264)
			// so the host starts watching from the manifest instead of waiting on a CDN round-trip.
			streamFilePath := finalFilePath
			streamMimeType := mimeType
			isStream := false
			if strings.HasPrefix(mimeType, "video/") || strings.HasPrefix(mimeType, "audio/") {
				hlsDirName := strings.TrimSuffix(uniqueFilename, ext)
				hlsOutputDir := filepath.Join(UploadDir, "temp", "hls", hlsDirName)
				hlsBaseURL, cdnRemotePrefix := progressiveCDNPaths(uploadID)
				if manifestPath, err := utils.SegmentToHLS(finalFilePath, hlsOutputDir, 6, hlsBaseURL); err != nil {
					log.Printf("⚠️ [ChunkUpload] HLS segmenting failed, falling back to direct file: %v", err)
				} else {
					// Every segment already exists locally at this point (SegmentToHLS ran to
					// completion) — get them all onto the CDN before this item is ever exposed
					// to a client, so there's no manifest-freshness race to worry about here
					// the way the progressive pipeline's incremental uploader has to.
					if cdnRemotePrefix != "" {
						if uploadErr := utils.UploadHLSSegmentsToCDN(hlsOutputDir, cdnRemotePrefix); uploadErr != nil {
							log.Printf("⚠️ [ChunkUpload] CDN segment upload failed, serving from local disk instead: %v", uploadErr)
						}
					}
					rel, _ := filepath.Rel(UploadDir, manifestPath)
					streamFilePath = "/uploads/" + filepath.ToSlash(rel)
					// streamMimeType stays as the original source mime type (set above) —
					// nothing depends on it literally being application/vnd.apple.mpegurl
					// (CinemaVideoPlayer's hls.js decision is purely URL-suffix-based), and
					// preserving it keeps the audio/video distinction for VinylPlayer.
					isStream = true
					log.Printf("📺 [ChunkUpload] HLS manifest ready: %s", streamFilePath)
				}
			}

			// Create TemporaryMediaItem
			newTempMediaItem := models.TemporaryMediaItem{
				FileName:     filepath.Base(finalFilePath),
				OriginalName: fileName,
				MimeType:     streamMimeType,
				FileSize:     fileSize,
				FilePath:     streamFilePath,
				PosterURL:    posterURL,
				RoomID:       roomIDUint,
				UploaderID:   authenticatedUserID,
				Duration:     duration,
				OrderIndex:   0,
				SessionID:    sessionID,
				IsStream:     isStream,
			}

			log.Printf("📝 [ChunkUpload] Creating TemporaryMediaItem: fileName=%s, sessionID=%s", fileName, sessionID)
			result := DB.Create(&newTempMediaItem)
			if result.Error != nil {
				log.Printf("❌ [ChunkUpload] Error creating TemporaryMediaItem: %v", result.Error)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "File uploaded but failed to save temporary media information"})
				return
			}

			log.Printf("✅ [ChunkUpload] Created TemporaryMediaItem ID=%d for session %s", newTempMediaItem.ID, sessionID)

			// Queue a preview clip immediately after upload (timestamp 0).
			// This runs independently of the playback_control WS path, which may arrive
			// later or not at all depending on client WS state.
			if sessionID != "" {
				if pq := services.GetPreviewQueue(); pq != nil {
					pq.QueuePreview(services.PreviewRequest{
						SessionID:        sessionID,
						MediaID:          newTempMediaItem.ID,
						MediaPath:        finalFilePath,
						IsTemporary:      true,
						CurrentTimestamp: 0,
						MediaType:        services.MediaTypeUpload,
					})
				}
				// Cinema/video-watch rooms never send media_play (only classroom/lecture-hall
				// do), so without this the lobby preview generated above would never refresh
				// again for the entire life of the session. current_media_path intentionally
				// stays the flat assembled file (matching what the IsStream==false refresh
				// branch's generateUploadPreview expects) regardless of whether this item also
				// got HLS-ified — the IsStream==true refresh branch re-derives its own segment
				// directory straight from the item's FilePath instead of this field.
				startSessionPreviewRefresh(sessionID, newTempMediaItem.ID, finalFilePath, newTempMediaItem.FilePath)
			}

			// ✅ ASYNC POSTER + CDN UPLOAD
			go func(itemID uint, roomID uint, videoPath, posterPath, sid, mimeType, uniqueFilename string, isStream, skipPoster bool) {
				// 1. Generate poster thumbnail — skipped entirely when the browser already
				// supplied one (already resolved and saved on the item at creation time).
				if !skipPoster {
					posterURL := "/icons/placeholder-poster.jpg"
					if err := utils.ExtractThumbnail(videoPath, posterPath); err != nil {
						log.Printf("⚠️ [Async] Poster generation failed for temp item %d: %v", itemID, err)
					} else {
						posterURL = resolvePosterURL(posterPath)
					}

					if err := DB.Model(&models.TemporaryMediaItem{}).Where("id = ?", itemID).Update("poster_url", posterURL).Error; err != nil {
						log.Printf("❌ [Async] Failed to update poster_url for temp item %d: %v", itemID, err)
					} else {
						log.Printf("✅ [Async] Poster updated for temp item %d: %s", itemID, posterURL)
						if sid != "" {
							broadcastData := map[string]interface{}{
								"type": "session_preview_updated", "session_id": sid,
								"poster_url": posterURL, "preview_url": "",
							}
							broadcastJSON, _ := json.Marshal(broadcastData)
							hub.BroadcastToLobby(OutgoingMessage{Data: broadcastJSON, IsBinary: false})
						}
						roomBroadcast := map[string]interface{}{
							"type": "playlist_poster_updated", "item_id": itemID, "poster_url": posterURL,
						}
						roomJSON, _ := json.Marshal(roomBroadcast)
						hub.BroadcastToRoom(roomID, OutgoingMessage{Data: roomJSON, IsBinary: false}, nil)
					}
				}

				// 2. Upload video to CDN (production only).
				// In dev the video is already playable from the Go static handler.
				// HLS streams are skipped here — distributing segments to a CDN is a
				// separate follow-up; the manifest path set at creation stays authoritative.
				if !bunnyConfigured() || isStream {
					return
				}
				videoCDNURL, err := utils.UploadLocalFileToBunnyCDN(videoPath, "temp-media/"+uniqueFilename, mimeType)
				if err != nil {
					log.Printf("⚠️ [Async] Video CDN upload failed for temp item %d: %v", itemID, err)
					return
				}
				if err := DB.Model(&models.TemporaryMediaItem{}).Where("id = ?", itemID).Update("file_path", videoCDNURL).Error; err != nil {
					log.Printf("❌ [Async] Failed to update file_path for temp item %d: %v", itemID, err)
				} else {
					log.Printf("✅ [Async] CDN upload complete for temp item %d: %s", itemID, videoCDNURL)
					// Replace the temporary Railway path with the stable CDN URL on all clients.
					// This eliminates the window where clients would try to fetch a path that
					// no longer exists on Railway after the local file is deleted below.
					if cdnBroadcast, err := json.Marshal(map[string]interface{}{
						"type":      "playlist_file_updated",
						"item_id":   itemID,
						"file_path": videoCDNURL,
					}); err == nil {
						hub.BroadcastToRoom(roomID, OutgoingMessage{Data: cdnBroadcast, IsBinary: false}, nil)
					}
					os.Remove(videoPath)
				}
			}(newTempMediaItem.ID, roomIDUint, finalFilePath, posterPath, sessionID, mimeType, uniqueFilename, isStream, hasClientPoster)

			// ✅ Public URL for browser access — the HLS manifest when segmented, else the direct file
			publicURL := streamFilePath

			// Broadcast to room so all connected members add this item to their playlist.
			// Stream items (isStream) use the same flat "device_stream_ready" shape the
			// progressive path already broadcasts — VideoWatch.jsx's handler for that type
			// auto-plays for every client, host and members alike, and nothing in the
			// frontend listens for "temporary_media_item_added" at all. Unifying the two
			// means fallback-path uploads (slower codecs, or too few chunks to ever attempt
			// progressive) get the same reliable "it's ready" signal progressive ones do,
			// instead of only the uploading host's own (less reliable) local auto-play.
			// Non-stream uploads (documents/images) are untouched below.
			if isStream {
				if broadcastData, err := json.Marshal(map[string]interface{}{
					"type":          "device_stream_ready",
					"media_item_id": newTempMediaItem.ID,
					"upload_id":     uploadID,
					"file_path":     publicURL,
					"file_url":      publicURL,
					"original_name": newTempMediaItem.OriginalName,
					"mime_type":     newTempMediaItem.MimeType,
					"session_id":    sessionID,
					"room_id":       roomIDUint,
					"uploader_id":   newTempMediaItem.UploaderID,
					"is_stream":     true,
				}); err == nil {
					hub.BroadcastToRoom(roomIDUint, OutgoingMessage{Data: broadcastData, IsBinary: false}, nil)
				}
			} else if broadcastData, err := json.Marshal(map[string]interface{}{
				"type": "temporary_media_item_added",
				"data": map[string]interface{}{
					"id":            newTempMediaItem.ID,
					"file_name":     newTempMediaItem.FileName,
					"original_name": newTempMediaItem.OriginalName,
					"mime_type":     newTempMediaItem.MimeType,
					"file_size":     newTempMediaItem.FileSize,
					"file_path":     publicURL,
					"poster_url":    newTempMediaItem.PosterURL,
					"duration":      newTempMediaItem.Duration,
					"session_id":    sessionID,
					"room_id":       roomIDUint,
					"uploader_id":   newTempMediaItem.UploaderID,
					"is_temporary":  true,
				},
			}); err == nil {
				hub.BroadcastToRoom(roomIDUint, OutgoingMessage{Data: broadcastData, IsBinary: false}, nil)
			}

			log.Printf("🎉 [ChunkUpload] Temporary media item '%s' (ID: %d) uploaded successfully to room %d", newTempMediaItem.FileName, newTempMediaItem.ID, roomIDUint)
			c.JSON(http.StatusCreated, gin.H{
				"message":       "Temporary media item uploaded successfully",
				"media_item_id": newTempMediaItem.ID,
				"file_name":     newTempMediaItem.FileName,
				"original_name": newTempMediaItem.OriginalName,
				"mime_type":     newTempMediaItem.MimeType,
				"file_size":     newTempMediaItem.FileSize,
				"file_path":     newTempMediaItem.FilePath,
				"file_url":      publicURL,
				"poster_url":    newTempMediaItem.PosterURL,
				"room_id":       newTempMediaItem.RoomID,
				"uploader_id":   newTempMediaItem.UploaderID,
				"duration":      newTempMediaItem.Duration,
				"is_temporary":  true,
				"upload_id":     uploadID,
				"session_id":    sessionID,
			})
		} else {
			// Create permanent MediaItem
			newMediaItem := models.MediaItem{
				RoomID:       roomIDUint,
				OriginalName: fileName,
				MimeType:     mimeType,
				FileSize:     fileSize,
				FilePath:     finalFilePath,
				PosterURL:    posterURL,
				UploaderID:   authenticatedUserID,
				OrderIndex:   0,
				Duration:     duration,
			}

			log.Printf("📝 [ChunkUpload] Creating MediaItem: fileName=%s, roomID=%d", fileName, roomIDUint)
			result := DB.Create(&newMediaItem)
			if result.Error != nil {
				log.Printf("❌ [ChunkUpload] Error creating MediaItem: %v", result.Error)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "File uploaded but failed to save media information"})
				return
			}

			log.Printf("✅ [ChunkUpload] Created MediaItem ID=%d for room %d", newMediaItem.ID, roomIDUint)

			// ✅ ASYNC POSTER + CDN UPLOAD
			go func(itemID uint, videoPath, posterPath, mimeType, uniqueFilename string) {
				// 1. Generate poster thumbnail.
				posterURL := "/icons/placeholder-poster.jpg"
				if err := utils.ExtractThumbnail(videoPath, posterPath); err != nil {
					log.Printf("⚠️ [Async] Poster generation failed for item %d: %v", itemID, err)
				} else if bunnyConfigured() {
					if cdnURL, err := utils.UploadLocalFileToBunnyCDN(posterPath, "media/"+filepath.Base(posterPath), "image/jpeg"); err != nil {
						log.Printf("⚠️ [Async] Poster CDN upload failed for item %d: %v", itemID, err)
						posterURL = fmt.Sprintf("/uploads/%s", filepath.Base(posterPath))
					} else {
						posterURL = cdnURL
						os.Remove(posterPath)
					}
				} else {
					posterURL = fmt.Sprintf("/uploads/%s", filepath.Base(posterPath))
					log.Printf("📂 [Async] Poster stored locally (no CDN) for item %d", itemID)
				}
				if err := DB.Model(&models.MediaItem{}).Where("id = ?", itemID).Update("poster_url", posterURL).Error; err != nil {
					log.Printf("❌ [Async] Failed to update poster_url for item %d: %v", itemID, err)
				} else {
					log.Printf("✅ [Async] Poster updated for item %d: %s", itemID, posterURL)
				}

				// 2. Upload video to CDN (production only).
				if !bunnyConfigured() {
					return
				}
				videoCDNURL, err := utils.UploadLocalFileToBunnyCDN(videoPath, "media/"+uniqueFilename, mimeType)
				if err != nil {
					log.Printf("⚠️ [Async] Video CDN upload failed for item %d: %v", itemID, err)
					return
				}
				if err := DB.Model(&models.MediaItem{}).Where("id = ?", itemID).Update("file_path", videoCDNURL).Error; err != nil {
					log.Printf("❌ [Async] Failed to update file_path for item %d: %v", itemID, err)
				} else {
					log.Printf("✅ [Async] CDN upload complete for item %d: %s", itemID, videoCDNURL)
				}
			}(newMediaItem.ID, finalFilePath, posterPath, mimeType, uniqueFilename)

			// ✅ Construct public URL for browser access
			publicURL := fmt.Sprintf("/uploads/%s", uniqueFilename)

			log.Printf("🎉 [ChunkUpload] Media item '%s' (ID: %d) uploaded successfully to room %d", newMediaItem.FileName, newMediaItem.ID, roomIDUint)
			c.JSON(http.StatusCreated, gin.H{
				"message":       "Media item uploaded successfully",
				"media_item":    newMediaItem,
				"file_name":     newMediaItem.FileName,
				"original_name": newMediaItem.OriginalName,
				"mime_type":     newMediaItem.MimeType,
				"file_size":     newMediaItem.FileSize,
				"file_path":     newMediaItem.FilePath,
				"file_url":      publicURL,
				"poster_url":    newMediaItem.PosterURL,
				"room_id":       newMediaItem.RoomID,
				"uploader_id":   newMediaItem.UploaderID,
				"duration":      newMediaItem.Duration,
				"is_temporary":  false,
				"upload_id":     uploadID,
			})
		}
	} else {
		// Not the last chunk, return progress
		c.JSON(http.StatusOK, gin.H{
			"message":      "Chunk received",
			"upload_id":    uploadID,
			"chunk_index":  chunkIndex,
			"total_chunks": totalChunks,
			"progress":     float64(chunkIndex+1) / float64(totalChunks) * 100,
		})
	}
}

// assembleChunks combines all chunks into final file
func assembleChunks(uploadDir, originalFileName string, totalChunks int, uploaderID, roomID uint, sessionID string, fileSize int64) (string, error) {
	// Determine if temporary based on sessionID
	isTemporary := sessionID != ""

	// Get file extension
	ext := strings.ToLower(filepath.Ext(originalFileName))

	// Use filepath.Base so the name is derived correctly regardless of whether
	// filepath.Join normalised the "./" prefix off ChunkUploadDir.
	uniqueFilename := fmt.Sprintf("%s%s", filepath.Base(uploadDir), ext)

	var finalPath string
	if isTemporary {
		tempUploadDir := filepath.Join(UploadDir, "temp")
		if err := os.MkdirAll(tempUploadDir, os.ModePerm); err != nil {
			return "", fmt.Errorf("failed to create temp directory: %v", err)
		}
		finalPath = filepath.Join(tempUploadDir, uniqueFilename)
	} else {
		finalPath = filepath.Join(UploadDir, uniqueFilename)
	}

	// Create final file
	finalFile, err := os.Create(finalPath)
	if err != nil {
		return "", fmt.Errorf("failed to create final file: %v", err)
	}
	defer finalFile.Close()

	// Append chunks in order
	for i := 0; i < totalChunks; i++ {
		chunkPath := filepath.Join(uploadDir, fmt.Sprintf("chunk_%d", i))

		chunkFile, err := os.Open(chunkPath)
		if err != nil {
			return "", fmt.Errorf("failed to open chunk %d: %v", i, err)
		}

		_, err = io.Copy(finalFile, chunkFile)
		chunkFile.Close()

		if err != nil {
			return "", fmt.Errorf("failed to copy chunk %d: %v", i, err)
		}

		log.Printf("📋 [Assembly] Chunk %d/%d appended", i+1, totalChunks)
	}

	log.Printf("✅ [Assembly] File assembled: %s (%d bytes)", finalPath, fileSize)

	return finalPath, nil
}

// CleanupOrphanedChunks removes abandoned chunk uploads older than 24 hours
func CleanupOrphanedChunks() {
	// TODO: Implement periodic cleanup of old chunk directories
	// This should be called by session end handler or periodic cron job
}
