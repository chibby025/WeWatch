package utils

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)


// ExtractThumbnail generates a thumbnail at 5 seconds into the video
// ✅ Resizes to max 1280x720 for fast generation and small file sizes
func ExtractThumbnail(inputPath, outputPath string) error {
	cmd := exec.Command("ffmpeg", "-y",
		"-ss", "00:00:05",      // Seek BEFORE input (faster)
		"-i", inputPath,
		"-vf", "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease", // Resize intelligently
		"-vframes", "1",
		"-q:v", "2",            // High quality JPEG
		outputPath,
	)

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	return cmd.Run()
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

	parts := strings.Split(strings.TrimSpace(string(output)), ",")
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

	// Calculate target resolution: MIN(720p, source_height)
	targetHeight := 720
	if height < targetHeight {
		targetHeight = height // Never upscale
	}

	// Build scale filter: maintain aspect ratio, cap at target height
	scaleFilter := fmt.Sprintf("scale=-2:%d:flags=lanczos", targetHeight)

	// Generate MP4 with audio (if available)
	cmd := exec.Command("ffmpeg", "-y",
		"-ss", startTime,
		"-i", inputPath,
		"-t", fmt.Sprintf("%d", duration),
		"-c:v", "libx264",
		"-crf", "26",          // Quality factor (lower = better, 26 is good balance)
		"-preset", "fast",     // Encoding speed
		"-vf", fmt.Sprintf("fps=24,%s", scaleFilter), // 24fps + adaptive scale
		"-c:a", "aac",         // Audio codec (will be skipped if no audio)
		"-b:a", "96k",         // Audio bitrate
		"-movflags", "+faststart", // Enable fast web playback
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
func TranscodeToMp4(inputPath, outputPath, watermarkText, logoPath string) error {
	codec, err := DetectVideoCodec(inputPath)
	if err != nil {
		codec = "unknown"
	}

	hasWatermark := watermarkText != "" || logoPath != ""

	if codec == "h264" && !hasWatermark {
		// Instant container remux — no re-encoding
		args := []string{"-y", "-i", inputPath, "-c", "copy", "-movflags", "+faststart", outputPath}
		cmd := exec.Command("ffmpeg", args...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		return cmd.Run()
	}

	// Full transcode (VP8/VP9 or watermark required)
	var filterComplex string
	inputArgs := []string{"-y", "-i", inputPath}

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

	cmd := exec.Command("ffmpeg", args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
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
		"-vf", fmt.Sprintf("fps=%d,scale=-2:720:flags=lanczos", fps), // 24fps, 720p max
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