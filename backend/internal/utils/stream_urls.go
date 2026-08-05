package utils

import (
	"fmt"
	"net/http"
	neturl "net/url"
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

// videoFileExtensions are checked against the URL's PATH ONLY, as a true suffix —
// never against the raw query string or the full URL. Matching anywhere in the full
// string (the old behavior) let a link like ".../Movie.mkv.html" — an HTML landing
// page whose filename merely CONTAINS ".mkv" before the real ".html" extension —
// pass as if it were a genuine .mkv file.
var videoFileExtensions = []string{
	".mp4", ".webm", ".ogg", ".mov", ".m3u8",
	".avi", ".mkv", ".flv", ".wmv", ".m4v",
}

// hasVideoFileExtension checks the URL path's actual suffix, not a substring match
// anywhere in the URL (which query params or a ".mkv.html"-style filename can fool).
func hasVideoFileExtension(rawURL string) bool {
	path := rawURL
	if parsed, err := neturl.Parse(rawURL); err == nil && parsed.Path != "" {
		path = parsed.Path
	}
	pathLower := strings.ToLower(path)
	for _, ext := range videoFileExtensions {
		if strings.HasSuffix(pathLower, ext) {
			return true
		}
	}
	return false
}

// knownFileLockerHosts are domains well known (from real user reports) to gate video
// behind an HTML landing page — ads, a wait-timer, a CAPTCHA, a JS-driven "download"
// button — rather than exposing a single stable, hotlink-able file URL. Even a link
// from one of these sites that happens to end in a video extension is usually still
// just that HTML page (see hasVideoFileExtension's doc comment for a concrete
// example). Keep this in sync with KNOWN_FILE_LOCKER_HOSTS in
// frontend/src/components/cinema/ui/LeftSidebar.jsx.
var knownFileLockerHosts = []string{
	"downloadwella.com", "nkiri.com", "waploaded.com",
	"dood.to", "dood.so", "dood.ws", "doodstream.com",
	"mixdrop.co", "mixdrop.to", "mixdrop.sx",
	"streamtape.com", "streamsb.net", "sbembed.com", "sbembed1.com",
	"uptobox.com", "gofile.io", "send.cm",
	"vidcloud9.com", "vidcloud.co", "fembed.com", "feurl.com",
	"upstream.to", "voe.sx", "streamwish.to", "streamhub.to",
	"netnaija.com", "fzmovies.net", "o2tvseries.com",
}

// matchedFileLockerHost returns the matched host fragment, or "" if none matched.
func matchedFileLockerHost(rawURL string) string {
	lower := strings.ToLower(rawURL)
	for _, host := range knownFileLockerHosts {
		if strings.Contains(lower, host) {
			return host
		}
	}
	return ""
}

func fileLockerMessage(host string) string {
	return fmt.Sprintf(
		"%s is a file-locker/download-portal site — it serves an HTML page with ads, a wait-timer, or a \"download\" button rather than the video file itself, so it can't be streamed directly here (even a link ending in a video extension from this site is usually still that HTML page).\n\nTry: Google Drive (upload the file, then paste the share link), or download the file and use \"Browse Files\" to upload it to the room.",
		host,
	)
}

// DirectURLCheckResult reports why a candidate "direct video file" URL was accepted
// or rejected, so the caller can surface a specific, actionable message instead of a
// generic "invalid URL" — distinguishing "wrong syntax" from "this is a webpage" from
// "this host never serves direct files" is the whole point of this type.
type DirectURLCheckResult struct {
	Valid   bool
	Reason  string // "unsupported_host" | "bad_extension" | "ok"
	Message string
}

// ClassifyDirectVideoURL performs the (network-free) syntactic checks on a candidate
// direct-file URL: known-unsupported cloud providers, known file-locker/download
// portals, and a real video file extension. Network-based checks (reachability +
// actual Content-Type) are a separate step — see CheckURLAccessibility.
func ClassifyDirectVideoURL(originalURL string) DirectURLCheckResult {
	lower := strings.ToLower(originalURL)

	// Cloud-storage providers we explicitly don't support as direct <video> links
	// (browser CORS/authentication restrictions) — checked first since this gives a
	// more specific, more helpful message than the generic ones below.
	cloudProviders := []struct{ domain, name string }{
		{"dropbox.com", "Dropbox"},
		{"onedrive.live.com", "OneDrive"},
		{"1drv.ms", "OneDrive"},
	}
	for _, provider := range cloudProviders {
		if strings.Contains(lower, provider.domain) {
			return DirectURLCheckResult{
				Valid:  false,
				Reason: "unsupported_host",
				Message: fmt.Sprintf(
					"%s links aren't supported directly (browser CORS/authentication restrictions). Use Google Drive instead — it works as an embed.",
					provider.name,
				),
			}
		}
	}

	if host := matchedFileLockerHost(originalURL); host != "" {
		return DirectURLCheckResult{Valid: false, Reason: "unsupported_host", Message: fileLockerMessage(host)}
	}

	if !hasVideoFileExtension(originalURL) {
		return DirectURLCheckResult{
			Valid:  false,
			Reason: "bad_extension",
			Message: "This doesn't look like a direct video file link — it looks like a webpage (an article, listing, or download portal) rather than a raw video.\n\n" +
				"What works: a Google Drive share link, a Twitch channel link, or a direct file URL ending in .mp4/.webm/.mkv/.m3u8 etc. For YouTube, use the YouTube Co-Watch box in Watch From. Otherwise, download the file and use \"Browse Files\" to upload it.",
		}
	}

	return DirectURLCheckResult{Valid: true, Reason: "ok"}
}

// looksLikeVideoContentType inspects a real HTTP response Content-Type header — the
// actual proof a URL serves video bytes, since a URL merely ENDING in ".mp4" can
// still resolve to an HTML interstitial (a wait-timer page, a login wall, an
// expired-link error page) that no amount of extension/status-code checking alone
// can catch.
func looksLikeVideoContentType(contentType string) bool {
	ct := strings.ToLower(strings.TrimSpace(contentType))
	if idx := strings.Index(ct, ";"); idx != -1 {
		ct = ct[:idx]
	}
	if strings.HasPrefix(ct, "video/") {
		return true
	}
	switch ct {
	case "application/vnd.apple.mpegurl", "application/x-mpegurl", "application/octet-stream", "binary/octet-stream", "":
		// octet-stream / no Content-Type at all is common on plain file servers that
		// don't bother setting a specific video type — treated as inconclusive rather
		// than rejected, to avoid false negatives on legitimate direct-file hosts.
		return true
	}
	return false
}

// DescribeContentType turns a raw HTTP Content-Type header into a short, human label
// for building a specific "this isn't actually a video" error message — "a webpage
// (HTML)" is far more actionable than a bare 400 with no explanation.
func DescribeContentType(contentType string) string {
	lower := strings.ToLower(contentType)
	switch {
	case strings.Contains(lower, "text/html"):
		return "webpage (HTML)"
	case strings.Contains(lower, "application/json"):
		return "JSON/API response"
	case strings.TrimSpace(contentType) == "":
		return "unknown, non-video content"
	default:
		return contentType
	}
}

// NotVideoContentMessage builds the user-facing explanation for a URL that resolved
// successfully (HTTP 2xx/3xx) but whose Content-Type doesn't look like video — the
// single most common real-world failure for "paste a movie site link" attempts,
// since a download-portal page returns 200 for its own landing page, not the file.
func NotVideoContentMessage(contentType string) string {
	return fmt.Sprintf(
		"This link is reachable, but it returns a %s, not a video file — probably a landing or wait-timer page rather than the actual file. Download the file yourself and use \"Browse Files\" to upload it, or find the real direct-download link on the page (right-click the video/download button → Copy Link).",
		DescribeContentType(contentType),
	)
}

// CheckURLAccessibility performs a HEAD request (falling back to a ranged GET, since
// some servers don't support HEAD) and reports both reachability and whether the
// response actually looks like video content. A 2xx/3xx status code alone (the old
// behavior) is just as true for an HTML landing page as for a real video file — the
// Content-Type check is what tells the two apart.
func CheckURLAccessibility(rawURL string) (accessible bool, isVideoContent bool, contentType string) {
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
	resp, err := client.Head(rawURL)
	if err == nil {
		defer resp.Body.Close()
		if resp.StatusCode >= 200 && resp.StatusCode < 400 {
			ct := resp.Header.Get("Content-Type")
			return true, looksLikeVideoContentType(ct), ct
		}
	}

	// If HEAD fails, try GET with Range header (some servers don't support HEAD)
	req, err := http.NewRequest("GET", rawURL, nil)
	if err != nil {
		return false, false, ""
	}
	req.Header.Set("Range", "bytes=0-0") // Request only first byte

	resp, err = client.Do(req)
	if err != nil {
		return false, false, ""
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 400 {
		ct := resp.Header.Get("Content-Type")
		return true, looksLikeVideoContentType(ct), ct
	}
	return false, false, ""
}
