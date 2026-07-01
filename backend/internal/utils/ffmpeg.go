package utils

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)


// thumbnailSeek returns a seek position (as a decimal-seconds string) that skips
// over typical black intros: max(5s, min(30s, 10% of duration)).
// Returns "5" if the duration cannot be probed so the caller always gets a valid string.
func thumbnailSeek(inputPath string) string {
	out, err := exec.Command("ffprobe",
		"-v", "quiet",
		"-show_entries", "format=duration",
		"-of", "csv=p=0",
		inputPath,
	).Output()
	if err != nil {
		return "5"
	}
	dur, err := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	if err != nil || dur <= 0 {
		return "5"
	}
	seek := dur * 0.10 // 10 % of duration
	if seek < 5 {
		seek = 5
	}
	if seek > 30 {
		seek = 30
	}
	return fmt.Sprintf("%.1f", seek)
}

// ExtractThumbnail generates a representative poster from a video.
//
// Strategy:
//  1. Seek past any black intro (max 5 s, min 30 s, 10 % of duration), then let
//     ffmpeg's thumbnail filter pick the most visually interesting frame from the
//     next ~50 frames (~2 s at 24 fps).  Avoids black-leader / fade-in posters.
//  2. Plain frame grab at the same smart-seek position — fallback when the
//     thumbnail filter produces no output (e.g. very short clip).
//  3. Fixed seek fallback chain: 5 s → 3 s → 1 s → 0 s.
func ExtractThumbnail(inputPath, outputPath string) error {
	runCmd := func(args []string) bool {
		var stderr bytes.Buffer
		cmd := exec.Command("ffmpeg", args...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = &stderr
		if err := cmd.Run(); err != nil {
			return false
		}
		info, err := os.Stat(outputPath)
		return err == nil && info.Size() > 0
	}

	scaleFilter := "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease"
	seek := thumbnailSeek(inputPath)

	// Primary: seek past intro, then thumbnail filter picks best frame in next ~2 s
	if runCmd([]string{
		"-y", "-ss", seek, "-i", inputPath,
		"-vf", "thumbnail=n=50," + scaleFilter,
		"-frames:v", "1", "-q:v", "2", outputPath,
	}) {
		return nil
	}

	// Secondary: plain frame grab at the same seek point (short clips where
	// thumbnail filter produces no output because too few frames remain)
	if runCmd([]string{
		"-y", "-ss", seek, "-i", inputPath,
		"-vf", scaleFilter,
		"-frames:v", "1", "-q:v", "2", outputPath,
	}) {
		return nil
	}

	// Fallback chain: try progressively earlier positions
	for _, s := range []string{"00:00:05", "00:00:03", "00:00:01", "00:00:00"} {
		if runCmd([]string{
			"-y", "-ss", s, "-i", inputPath,
			"-vf", scaleFilter,
			"-vframes", "1", "-q:v", "2", outputPath,
		}) {
			return nil
		}
	}

	return fmt.Errorf("ExtractThumbnail: all strategies failed for %q", inputPath)
}


// GetVideoDuration returns video duration in HH:MM:SS format.
func GetVideoDuration(filePath string) (string, error) {
	cmd := exec.Command("ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", filePath)

	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to get video duration: %w", err)
	}

	durationFloat, err := strconv.ParseFloat(strings.TrimSpace(string(output)), 64)
	if err != nil {
		return "", fmt.Errorf("failed to parse duration: %w", err)
	}

	// Convert seconds to HH:MM:SS
	duration := time.Duration(durationFloat * float64(time.Second))
	hours := int(duration.Hours())
	minutes := int(duration.Minutes()) % 60
	seconds := int(duration.Seconds()) % 60

	return fmt.Sprintf("%02d:%02d:%02d", hours, minutes, seconds), nil
}

// GeneratePreviewGIF generates a 30-second preview GIF from video at specified time
// startTime: format "HH:MM:SS" or "SS" (e.g., "00:02:30" or "150")
// duration: how long the GIF should be in seconds (typically 30)
// Optimized for lobby previews: 640px width, 12fps, high-quality palette
func GeneratePreviewGIF(inputPath, outputPath, startTime string, duration int) error {
	// Generate optimized color palette for better GIF quality
	paletteFile := outputPath + "_palette.png"
	paletteCmd := exec.Command("ffmpeg", "-y",
		"-ss", startTime,
		"-i", inputPath,
		"-t", fmt.Sprintf("%d", duration),
		"-vf", "fps=12,scale=640:-1:flags=lanczos,palettegen=max_colors=256:stats_mode=single",
		"-frames:v", "1",
		paletteFile,
	)
	paletteCmd.Stdout = os.Stdout
	paletteCmd.Stderr = os.Stderr
	if err := paletteCmd.Run(); err != nil {
		return fmt.Errorf("palette generation failed: %w", err)
	}
	defer os.Remove(paletteFile) // Cleanup palette file

	// Generate GIF using palette for optimal quality
	cmd := exec.Command("ffmpeg", "-y",
		"-ss", startTime,
		"-i", inputPath,
		"-i", paletteFile,
		"-t", fmt.Sprintf("%d", duration),
		"-lavfi", "fps=12,scale=640:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5",
		"-loop", "0",
		outputPath,
	)

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	return cmd.Run()
}

// GetVideoResolution returns video width and height
func GetVideoResolution(filePath string) (width, height int, err error) {
	cmd := exec.Command("ffprobe", "-v", "error",
		"-select_streams", "v:0",
		"-show_entries", "stream=width,height",
		"-of", "csv=p=0",
		filePath,
	)

	output, err := cmd.Output()
	if err != nil {
		return 0, 0, fmt.Errorf("failed to get video resolution: %w", err)
	}

	// Raw .ts segment files (e.g. HLS output) can make ffprobe report the same
	// width,height pair on more than one line — transport streams periodically repeat
	// their PAT/PMT tables, which ffprobe's stream enumeration can pick up as what
	// looks like more than one entry for "stream=width,height" against a single
	// elementary stream. Taking only the first non-empty line is sufficient since every
	// repeated entry reports the identical resolution.
	firstLine := strings.TrimSpace(string(output))
	if idx := strings.IndexByte(firstLine, '\n'); idx != -1 {
		firstLine = firstLine[:idx]
	}

	parts := strings.Split(strings.TrimSpace(firstLine), ",")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("invalid resolution output: %s", output)
	}

	var parseErr error
	width, parseErr = strconv.Atoi(parts[0])
	if parseErr != nil {
		return 0, 0, fmt.Errorf("failed to parse width: %w", parseErr)
	}

	height, parseErr = strconv.Atoi(parts[1])
	if parseErr != nil {
		return 0, 0, fmt.Errorf("failed to parse height: %w", parseErr)
	}

	return width, height, nil
}

// GeneratePreviewMP4 generates a 30-second preview MP4 from video at specified time
// startTime: format "HH:MM:SS" or "SS" (e.g., "00:02:30" or "150")
// duration: how long the MP4 should be in seconds (typically 30)
// TikTok-quality specs: 720p max (or source resolution if lower), 24fps, H.264 + AAC audio
func GeneratePreviewMP4(inputPath, outputPath, startTime string, duration int) error {
	// Detect source resolution
	_, height, err := GetVideoResolution(inputPath)
	if err != nil {
		return fmt.Errorf("failed to detect source resolution: %w", err)
	}

	// Cap at 540p for lobby previews — sharp on retina screens, moderate file size
	targetHeight := 540
	if height < targetHeight {
		targetHeight = height // Never upscale
	}

	scaleFilter := fmt.Sprintf("scale=-2:%d:flags=lanczos", targetHeight)

	cmd := exec.Command("ffmpeg", "-y",
		"-ss", startTime,
		"-i", inputPath,
		"-t", fmt.Sprintf("%d", duration),
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

// DetectVideoCodec returns the primary video codec of a file (e.g. "h264", "vp8", "vp9")
func DetectVideoCodec(filePath string) (string, error) {
	cmd := exec.Command("ffprobe", "-v", "error",
		"-select_streams", "v:0",
		"-show_entries", "stream=codec_name",
		"-of", "csv=p=0",
		filePath,
	)
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("ffprobe codec detection failed: %w", err)
	}
	return strings.TrimSpace(string(output)), nil
}

// TranscodeToMp4 converts any video file to H.264 MP4.
// If the source already contains H.264 and no watermark is needed it remuxes
// (instant, no re-encode). VP8/VP9 or watermarked sources use libx264 veryfast.
//
// watermarkText: e.g. "@username" — empty string disables the text watermark.
// logoPath: absolute path to a PNG logo file — empty string disables logo overlay.
//
// Both invocations below pass -loglevel error and capture output into a bounded buffer
// instead of piping to the live process's os.Stdout/os.Stderr, and run under a 30-minute
// context timeout instead of exec.Command's unbounded Run(). Root-caused for real against
// a genuine production stall: this function (the only long-running ffmpeg call in this
// codebase that processes a full-length video rather than a short clip/frame) reliably
// got stuck mid-encode on Railway specifically — confirmed via the platform's own CPU
// graph showing a real spike that cuts to flat partway through, not sustained-high
// (ruling out "just slow") and not flat-from-the-start (ruling out an instant failure).
// Every other ffmpeg call in this codebase (preview clips, posters, thumbnails) uses the
// same os.Stdout/os.Stderr piping and never showed this symptom — the difference is
// runtime: ffmpeg's default progress meter writes continuously for the full encode
// duration, and a full-length transcode (here, ~25 minutes) generates vastly more of it
// than a 15-second clip ever does. The leading theory is a logging-pipeline backpressure
// stall (the write itself blocking once a buffer fills, freezing ffmpeg with it) — -loglevel
// error eliminates the volume outright regardless of whether that theory is exactly right,
// and the timeout means any future hang (this cause or another) fails loudly instead of
// silently running forever with no resume mechanism.
func TranscodeToMp4(inputPath, outputPath, watermarkText, logoPath string) error {
	codec, err := DetectVideoCodec(inputPath)
	if err != nil {
		codec = "unknown"
	}

	hasWatermark := watermarkText != "" || logoPath != ""

	if codec == "h264" && !hasWatermark {
		// Instant container remux — no re-encoding
		args := []string{"-y", "-loglevel", "error", "-i", inputPath, "-c", "copy", "-movflags", "+faststart", outputPath}
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
		defer cancel()
		cmd := exec.CommandContext(ctx, "ffmpeg", args...)
		var stderr bytes.Buffer
		cmd.Stderr = &stderr
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("ffmpeg remux failed: %w (stderr: %s)", err, stderr.String())
		}
		return nil
	}

	// Full transcode (VP8/VP9 or watermark required)
	var filterComplex string
	inputArgs := []string{"-y", "-loglevel", "error", "-i", inputPath}

	if logoPath != "" && watermarkText != "" {
		// Logo overlay bottom-right + text watermark above it
		inputArgs = append(inputArgs, "-i", logoPath)
		filterComplex = fmt.Sprintf(
			"[0:v][1:v]overlay=W-w-12:H-h-44[withlogo];"+
				"[withlogo]drawtext=text='%s':x=W-tw-12:y=H-th-16:fontsize=18:fontcolor=white@0.85:shadowcolor=black@0.6:shadowx=1:shadowy=1[out]",
			watermarkText,
		)
	} else if logoPath != "" {
		inputArgs = append(inputArgs, "-i", logoPath)
		filterComplex = "[0:v][1:v]overlay=W-w-12:H-h-12[out]"
	} else if watermarkText != "" {
		filterComplex = fmt.Sprintf(
			"[0:v]drawtext=text='%s':x=W-tw-12:y=H-th-16:fontsize=18:fontcolor=white@0.85:shadowcolor=black@0.6:shadowx=1:shadowy=1[out]",
			watermarkText,
		)
	}

	args := inputArgs
	if filterComplex != "" {
		args = append(args, "-filter_complex", filterComplex, "-map", "[out]", "-map", "0:a?")
	}
	args = append(args,
		"-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
		"-c:a", "aac", "-b:a", "128k",
		"-movflags", "+faststart",
		outputPath,
	)

	// 4 hours: generous enough for full-length episodes on Railway's shared CPU
	// (10-bit HEVC decode + H.264 encode can take 2-3x real-time on slow hardware).
	// The -loglevel error flag already prevents the logging-pipeline stall that was
	// the original cause of hangs, so this is purely a "fail loudly instead of
	// silently running forever" safety net.
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Hour)
	defer cancel()
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("ffmpeg transcode failed: %w (stderr: %s)", err, stderr.String())
	}
	return nil
}

// TranscodeMkvToMp4IfNeeded converts a Matroska (.mkv) file to MP4 immediately after upload.
// Browsers don't reliably play .mkv via <video> — Chrome's support is inconsistent and
// Firefox doesn't support it at all, regardless of the codec inside (even H.264/AAC).
// No-op for any other extension: returns the input unchanged with transcoded=false.
//
// On success the original .mkv file is deleted and the caller gets back the new .mp4
// path/ext/mimeType. On failure (ffmpeg error) the original file is left untouched and
// transcoded=false — caller falls back to serving the raw mkv as before.
func TranscodeMkvToMp4IfNeeded(localPath, ext, mimeType string) (newPath, newExt, newMimeType string, transcoded bool) {
	if ext != ".mkv" {
		return localPath, ext, mimeType, false
	}

	mp4Path := strings.TrimSuffix(localPath, ext) + ".mp4"
	if err := TranscodeToMp4(localPath, mp4Path, "", ""); err != nil {
		log.Printf("⚠️ [MKV Transcode] Failed for %s: %v — falling back to original mkv", localPath, err)
		return localPath, ext, mimeType, false
	}

	os.Remove(localPath)
	log.Printf("✅ [MKV Transcode] %s → %s", localPath, mp4Path)
	return mp4Path, ".mp4", "video/mp4", true
}

// GenerateMP4FromFrames creates an MP4 from a series of image frames (for WebRTC streams)
// framesPattern: path pattern like "/tmp/frame_%03d.jpg" (ffmpeg glob pattern)
// outputPath: where to save the final MP4
// fps: frames per second for the output MP4 (typically 24 for smooth previews)
func GenerateMP4FromFrames(framesPattern, outputPath string, fps int) error {
	cmd := exec.Command("ffmpeg", "-y",
		"-framerate", fmt.Sprintf("%d", fps),
		"-i", framesPattern,
		"-c:v", "libx264",
		"-crf", "26",
		"-preset", "fast",
		"-vf", fmt.Sprintf("fps=%d,scale=-2:540:flags=lanczos", fps), // 540p — sharp on retina, consistent with upload previews
		"-movflags", "+faststart",
		"-pix_fmt", "yuv420p", // Ensure compatibility
		outputPath,
	)

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	return cmd.Run()
}

// GenerateGIFFromFrames creates a GIF from a series of image frames (for WebRTC streams)
// framesPattern: path pattern like "/tmp/frame_%03d.jpg" (ffmpeg glob pattern)
// outputPath: where to save the final GIF
// fps: frames per second for the output GIF (typically 12 for smooth previews)
func GenerateGIFFromFrames(framesPattern, outputPath string, fps int) error {
	// Generate palette from frames for better quality
	paletteFile := outputPath + "_palette.png"
	paletteCmd := exec.Command("ffmpeg", "-y",
		"-framerate", fmt.Sprintf("%d", fps),
		"-i", framesPattern,
		"-vf", fmt.Sprintf("fps=%d,scale=640:-1:flags=lanczos,palettegen=max_colors=256", fps),
		"-frames:v", "1",
		paletteFile,
	)
	paletteCmd.Stdout = os.Stdout
	paletteCmd.Stderr = os.Stderr
	if err := paletteCmd.Run(); err != nil {
		return fmt.Errorf("frame palette generation failed: %w", err)
	}
	defer os.Remove(paletteFile)

	// Generate GIF with palette
	cmd := exec.Command("ffmpeg", "-y",
		"-framerate", fmt.Sprintf("%d", fps),
		"-i", framesPattern,
		"-i", paletteFile,
		"-lavfi", fmt.Sprintf("fps=%d,scale=640:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5", fps),
		"-loop", "0",
		outputPath,
	)

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	return cmd.Run()
}