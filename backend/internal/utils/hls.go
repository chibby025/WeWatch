package utils

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
)

// SegmentToHLS converts a complete local media file into an HLS asset (playlist.m3u8 +
// .ts segments) written into outputDir. Source already H.264/AAC is segmented with
// -c copy (instant remux, same fast-path as TranscodeToMp4); anything else is
// transcoded while segmenting. Returns the path to playlist.m3u8 relative to outputDir's
// parent (suitable for joining onto a public URL prefix).
//
// hlsBaseURL, when non-empty, is passed to ffmpeg's -hls_base_url so the manifest's
// segment lines point directly at a CDN prefix instead of a bare relative filename —
// the caller is responsible for actually uploading the segments there (see
// UploadHLSSegmentsToCDN) before exposing the manifest to any client, since this
// function only arranges for the manifest to *reference* that prefix.
func SegmentToHLS(inputPath, outputDir string, segmentSeconds int, hlsBaseURL string) (string, error) {
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create HLS output dir: %w", err)
	}

	manifestPath := filepath.Join(outputDir, "playlist.m3u8")
	segmentPattern := filepath.Join(outputDir, "seg_%03d.ts")

	codec, err := DetectVideoCodec(inputPath)
	if err != nil {
		codec = "unknown"
	}
	audioCodec, err := DetectAudioCodec(inputPath)
	if err != nil {
		audioCodec = "unknown"
	}

	var args []string
	if codec == "h264" {
		args = []string{
			"-y", "-i", inputPath,
			"-c:v", "copy",
		}
		if isCompatibleAudioCodec(audioCodec) {
			args = append(args, "-c:a", "copy")
		} else {
			// Source audio (e.g. EC-3/AC-3, common in movie/TV rips) can't be parsed by
			// hls.js's demuxer if stream-copied as-is — transcode to AAC instead. Cheap
			// relative to a full video transcode, so this doesn't lose the fast-path benefit.
			args = append(args, "-c:a", "aac", "-b:a", "128k")
		}
	} else {
		args = []string{
			"-y", "-i", inputPath,
			"-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
			"-c:a", "aac", "-b:a", "128k",
		}
	}

	args = append(args,
		"-sn", // drop subtitle streams — HLS muxer tries to convert mov_text to a WebVTT
		// sidecar via -c copy, which fails ("incorrect codec parameters") and aborts
		// the whole process for any source with embedded subtitles (common in rips).
		"-f", "hls",
		"-hls_time", fmt.Sprintf("%d", segmentSeconds),
		"-hls_list_size", "0", // VOD-style manifest — lists every segment, no sliding window (Phase 1)
	)
	if hlsBaseURL != "" {
		args = append(args, "-hls_base_url", hlsBaseURL)
	}
	args = append(args,
		"-hls_segment_filename", segmentPattern,
		manifestPath,
	)

	cmd := exec.Command("ffmpeg", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("ffmpeg HLS segmenting failed: %w", err)
	}

	return manifestPath, nil
}

// UploadHLSSegmentsToCDN uploads every .ts segment already sitting in outputDir to
// BunnyCDN under remotePrefix, deleting each local copy once its CDN upload is
// confirmed. Meant for the fallback (one-shot) HLS path: by the time SegmentToHLS
// returns, every segment already exists locally, so unlike the progressive pipeline's
// incremental uploader there's no manifest-freshness race to worry about — this just
// has to finish before the caller exposes the manifest to any client. Uses the same
// bounded-concurrency pattern as AssembleUploadHandler's parallel chunk downloads.
func UploadHLSSegmentsToCDN(outputDir, remotePrefix string) error {
	entries, err := os.ReadDir(outputDir)
	if err != nil {
		return fmt.Errorf("read HLS output dir: %w", err)
	}

	const concurrency = 8
	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup
	var mu sync.Mutex
	var firstErr error

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".ts") {
			continue
		}
		name := entry.Name()
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			localPath := filepath.Join(outputDir, name)
			cdnURL, uploadErr := UploadLocalFileToBunnyCDN(localPath, remotePrefix+name, "video/mp2t")
			if uploadErr != nil {
				mu.Lock()
				if firstErr == nil {
					firstErr = fmt.Errorf("upload segment %s: %w", name, uploadErr)
				}
				mu.Unlock()
				log.Printf("⚠️ [HLS CDN] Failed to upload segment %s: %v", name, uploadErr)
				return
			}
			if strings.HasPrefix(cdnURL, "http") {
				os.Remove(localPath)
			}
		}()
	}
	wg.Wait()
	return firstErr
}
