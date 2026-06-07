package utils

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// EmbedPlatformResult holds the result of embed platform detection.
type EmbedPlatformResult struct {
	IsEmbed  bool
	Platform string // "google_drive" | "youtube" | "twitch"
	EmbedURL string // The iframe-ready URL
}

// DetectEmbedPlatform checks if the URL is a supported embed platform and returns
// the iframe-ready URL. Supported platforms: Google Drive, YouTube, Twitch.
func DetectEmbedPlatform(originalURL string) EmbedPlatformResult {
	urlLower := strings.ToLower(originalURL)

	// Google Drive — convert share link to preview embed
	if strings.Contains(urlLower, "drive.google.com") {
		fileID := extractGoogleDriveFileID(originalURL)
		if fileID != "" {
			embedURL := fmt.Sprintf("https://drive.google.com/file/d/%s/preview", fileID)
			fmt.Printf("✅ [DetectEmbedPlatform] Google Drive → %s\n", embedURL)
			return EmbedPlatformResult{IsEmbed: true, Platform: "google_drive", EmbedURL: embedURL}
		}
		fmt.Printf("⚠️ [DetectEmbedPlatform] Google Drive URL but could not extract file ID\n")
		return EmbedPlatformResult{}
	}

	// YouTube — convert watch/short links to embed
	if strings.Contains(urlLower, "youtube.com/watch") || strings.Contains(urlLower, "youtu.be/") {
		videoID := extractYouTubeVideoID(originalURL)
		if videoID != "" {
			embedURL := fmt.Sprintf("https://www.youtube.com/embed/%s?autoplay=1&mute=1&rel=0", videoID)
			fmt.Printf("✅ [DetectEmbedPlatform] YouTube → %s\n", embedURL)
			return EmbedPlatformResult{IsEmbed: true, Platform: "youtube", EmbedURL: embedURL}
		}
	}

	// Twitch channel — convert to player embed
	if strings.Contains(urlLower, "twitch.tv/") && !strings.Contains(urlLower, "clips.twitch.tv") {
		channelName := extractTwitchChannel(originalURL)
		if channelName != "" {
			embedURL := fmt.Sprintf("https://player.twitch.tv/?channel=%s&parent=letswatchout.com&autoplay=true&muted=false", channelName)
			fmt.Printf("✅ [DetectEmbedPlatform] Twitch → %s\n", embedURL)
			return EmbedPlatformResult{IsEmbed: true, Platform: "twitch", EmbedURL: embedURL}
		}
	}

	return EmbedPlatformResult{}
}

// extractYouTubeVideoID extracts the video ID from YouTube URLs.
func extractYouTubeVideoID(url string) string {
	// youtu.be/{ID}
	shortPattern := regexp.MustCompile(`youtu\.be/([^?&/]+)`)
	if m := shortPattern.FindStringSubmatch(url); len(m) > 1 {
		return m[1]
	}
	// youtube.com/watch?v={ID}
	watchPattern := regexp.MustCompile(`[?&]v=([^&]+)`)
	if m := watchPattern.FindStringSubmatch(url); len(m) > 1 {
		return m[1]
	}
	return ""
}

// extractTwitchChannel extracts the channel name from a Twitch URL.
func extractTwitchChannel(url string) string {
	// twitch.tv/{channel}
	pattern := regexp.MustCompile(`twitch\.tv/([^/?&#]+)`)
	if m := pattern.FindStringSubmatch(url); len(m) > 1 {
		return m[1]
	}
	return ""
}

// ConvertToDirectStreamURL converts cloud storage share links to direct streaming URLs
func ConvertToDirectStreamURL(originalURL string) string {
	fmt.Printf("🔗 [ConvertToDirectStreamURL] Input: %s\n", originalURL)
	
	// Google Drive
	if strings.Contains(originalURL, "drive.google.com") {
		fileID := extractGoogleDriveFileID(originalURL)
		if fileID != "" {
			directURL := fmt.Sprintf("https://drive.google.com/uc?export=download&id=%s", fileID)
			fmt.Printf("✅ [ConvertToDirectStreamURL] Google Drive conversion: %s\n", directURL)
			return directURL
		}
		fmt.Printf("⚠️ [ConvertToDirectStreamURL] Could not extract Google Drive file ID\n")
	}

	// Dropbox
	if strings.Contains(originalURL, "dropbox.com") {
		// Replace dl=0 with dl=1 to force direct download
		if strings.Contains(originalURL, "dl=0") {
			directURL := strings.Replace(originalURL, "dl=0", "dl=1", 1)
			fmt.Printf("✅ [ConvertToDirectStreamURL] Dropbox conversion (replaced dl=0): %s\n", directURL)
			return directURL
		}
		// If no dl parameter, add it
		if !strings.Contains(originalURL, "dl=") {
			separator := "?"
			if strings.Contains(originalURL, "?") {
				separator = "&"
			}
			directURL := originalURL + separator + "dl=1"
			fmt.Printf("✅ [ConvertToDirectStreamURL] Dropbox conversion (added dl=1): %s\n", directURL)
			return directURL
		}
	}

	// OneDrive
	if strings.Contains(originalURL, "onedrive.live.com") || strings.Contains(originalURL, "1drv.ms") {
		// OneDrive embed URLs work directly, no conversion needed
		fmt.Printf("✅ [ConvertToDirectStreamURL] OneDrive URL (no conversion needed)\n")
		return originalURL
	}

	// For direct URLs or unsupported providers, return as-is
	fmt.Printf("ℹ️ [ConvertToDirectStreamURL] Direct URL (no conversion)\n")
	return originalURL
}

// extractGoogleDriveFileID extracts the file ID from various Google Drive URL formats
func extractGoogleDriveFileID(url string) string {
	// Pattern 1: https://drive.google.com/file/d/{FILE_ID}/view
	pattern1 := regexp.MustCompile(`/file/d/([^/]+)`)
	if matches := pattern1.FindStringSubmatch(url); len(matches) > 1 {
		return matches[1]
	}

	// Pattern 2: https://drive.google.com/open?id={FILE_ID}
	pattern2 := regexp.MustCompile(`[?&]id=([^&]+)`)
	if matches := pattern2.FindStringSubmatch(url); len(matches) > 1 {
		return matches[1]
	}

	// Pattern 3: https://drive.google.com/uc?id={FILE_ID}
	pattern3 := regexp.MustCompile(`/uc\?.*id=([^&]+)`)
	if matches := pattern3.FindStringSubmatch(url); len(matches) > 1 {
		return matches[1]
	}

	// Pattern 4: https://drive.google.com/d/{FILE_ID}
	pattern4 := regexp.MustCompile(`/d/([^/]+)`)
	if matches := pattern4.FindStringSubmatch(url); len(matches) > 1 {
		return matches[1]
	}

	return ""
}

// IsValidVideoURL checks if the URL points to a video file based on extension
// Cloud storage URLs (Google Drive, Dropbox, OneDrive) are REJECTED
// due to CORS and authentication issues that prevent browser playback
func IsValidVideoURL(url string) bool {
	urlLower := strings.ToLower(url)
	
	fmt.Printf("🔍 [IsValidVideoURL] Checking: %s\n", url)
	
	// ❌ Reject known cloud storage providers (CORS/403 errors in browser)
	// Users should use "Watch From" tab to screen share these instead
	cloudProviders := []string{
		"drive.google.com",
		"dropbox.com",
		"onedrive.live.com",
		"1drv.ms",
	}
	
	for _, provider := range cloudProviders {
		if strings.Contains(urlLower, provider) {
			fmt.Printf("❌ [IsValidVideoURL] Rejected (cloud storage not supported: %s)\n", provider)
			return false
		}
	}
	
	// For direct URLs, check for video file extensions
	videoExtensions := []string{
		".mp4", ".webm", ".ogg", ".mov", ".m3u8",
		".avi", ".mkv", ".flv", ".wmv", ".m4v",
	}

	for _, ext := range videoExtensions {
		if strings.Contains(urlLower, ext) {
			fmt.Printf("✅ [IsValidVideoURL] Accepted (video extension: %s)\n", ext)
			return true
		}
	}

	fmt.Printf("❌ [IsValidVideoURL] Rejected (no cloud provider or video extension found)\n")
	return false
}

// IsURLAccessible tests if a URL is accessible by making a HEAD request
func IsURLAccessible(url string) bool {
	client := &http.Client{
		Timeout: 10 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			// Allow up to 5 redirects
			if len(via) >= 5 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}

	// Try HEAD request first (lightweight)
	resp, err := client.Head(url)
	if err == nil {
		defer resp.Body.Close()
		// Accept 2xx, 3xx, and 206 (Partial Content) status codes
		if resp.StatusCode >= 200 && resp.StatusCode < 400 {
			return true
		}
	}

	// If HEAD fails, try GET with Range header (some servers don't support HEAD)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return false
	}
	req.Header.Set("Range", "bytes=0-0") // Request only first byte

	resp, err = client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	// Accept 2xx, 3xx, and 206 (Partial Content) status codes
	return resp.StatusCode >= 200 && resp.StatusCode < 400
}
