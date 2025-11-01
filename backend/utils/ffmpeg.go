package utils

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)


// ExtractThumbnail generates a thumbnail at 10% into the video
func ExtractThumbnail(inputPath, outputPath string) error {
	cmd := exec.Command("ffmpeg", "-y", // <-- Corrected spelling
		"-i", inputPath,
		"-ss", "00:00:05",
		"-vframes", "1",
		"-q:v", "2",
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