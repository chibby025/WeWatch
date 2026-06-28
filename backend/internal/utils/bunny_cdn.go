// backend/internal/utils/bunny_cdn.go
package utils

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// BunnyCDN configuration
var (
	BunnyCDNStorageZone   = os.Getenv("BUNNY_STORAGE_ZONE")   // e.g., "wewatch-posts"
	BunnyCDNAccessKey     = os.Getenv("BUNNY_ACCESS_KEY")     // Storage API key
	BunnyCDNStorageRegion = os.Getenv("BUNNY_STORAGE_REGION") // e.g., "ny" (New York), "la" (Los Angeles), "sg" (Singapore)
	BunnyCDNPullZoneURL   = os.Getenv("BUNNY_PULL_ZONE_URL")  // e.g., "https://wewatch-posts.b-cdn.net"
)

// IsLocalDev reports whether the backend is running on a local developer machine.
//
// Detection: Railway automatically sets RAILWAY_ENVIRONMENT in every deployed
// environment (production, staging, preview). Its absence means the server is
// running locally.
//
// CDN credentials may still be present in a developer's .env file, but on
// localhost we always skip CDN and serve files directly from the Go static
// handler (/uploads/*).  Environment determines behaviour — not credential presence.
func IsLocalDev() bool {
	return os.Getenv("RAILWAY_ENVIRONMENT") == ""
}

// BunnyCDN API endpoints by region.
// Frankfurt (DE) uses the base endpoint — no region prefix.
// Other regions: https://{region}.storage.bunnycdn.com/{zone}
//
// Reads os.Getenv directly rather than the package-level BunnyCDNStorageZone/
// BunnyCDNStorageRegion vars above — those are evaluated once, at package-init time,
// which on a local dev machine runs BEFORE jwt.go's init() loads .env (Go guarantees
// all package-level var initializers run before any init() in the same package), so
// they're permanently empty in local dev no matter what .env contains. In production
// Railway injects real OS env vars before the process even starts, so this timing gap
// never existed there — every existing BunnyCDN function happened to never notice
// because they all gate on IsLocalDev() first anyway. A fresh os.Getenv call here has
// no such ordering dependency and returns the correct value in both environments.
func getBunnyCDNStorageURL() string {
	region := os.Getenv("BUNNY_STORAGE_REGION")
	zone := os.Getenv("BUNNY_STORAGE_ZONE")
	if region == "" {
		return fmt.Sprintf("https://storage.bunnycdn.com/%s", zone)
	}
	return fmt.Sprintf("https://%s.storage.bunnycdn.com/%s", region, zone)
}

// UploadToBunnyCDN uploads a file to BunnyCDN storage
// Returns the CDN URL or an error
// Falls back to local storage if BunnyCDN is not configured
func UploadToBunnyCDN(fileData []byte, filename string, contentType string) (string, error) {
	if IsLocalDev() || BunnyCDNStorageZone == "" || BunnyCDNAccessKey == "" {
		log.Println("🏠 [CDN skip] Local dev or unconfigured — using local storage")
		return uploadToLocalStorage(fileData, filename)
	}

	// Sanitize filename (remove spaces, special chars)
	sanitizedFilename := sanitizeFilename(filename)

	// Generate unique filename with timestamp
	timestamp := time.Now().Unix()
	uniqueFilename := fmt.Sprintf("%d_%s", timestamp, sanitizedFilename)

	// Upload URL
	uploadURL := fmt.Sprintf("%s/%s", getBunnyCDNStorageURL(), uniqueFilename)

	log.Printf("📤 [BunnyCDN] Uploading file: %s (size: %d bytes)", uniqueFilename, len(fileData))

	// Create HTTP request
	req, err := http.NewRequest("PUT", uploadURL, bytes.NewReader(fileData))
	if err != nil {
		return "", fmt.Errorf("failed to create upload request: %w", err)
	}

	// Set headers
	req.Header.Set("AccessKey", BunnyCDNAccessKey)
	req.Header.Set("Content-Type", contentType)
	req.ContentLength = int64(len(fileData))

	// Execute request
	client := &http.Client{Timeout: 5 * time.Minute} // 5min timeout for large files
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("upload request failed: %w", err)
	}
	defer resp.Body.Close()

	// Check response
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("upload failed with status %d: %s", resp.StatusCode, string(body))
	}

	// Generate CDN URL
	cdnURL := fmt.Sprintf("%s/%s", BunnyCDNPullZoneURL, uniqueFilename)

	log.Printf("✅ [BunnyCDN] Upload successful: %s", cdnURL)
	return cdnURL, nil
}

// UploadMultipartFileToBunnyCDN uploads a multipart file to BunnyCDN
func UploadMultipartFileToBunnyCDN(file multipart.File, header *multipart.FileHeader) (string, error) {
	// Read file data
	fileData, err := io.ReadAll(file)
	if err != nil {
		return "", fmt.Errorf("failed to read file: %w", err)
	}

	// Detect content type
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	return UploadToBunnyCDN(fileData, header.Filename, contentType)
}

// DeleteFromBunnyCDN deletes a file from BunnyCDN storage
// Falls back to local storage deletion if BunnyCDN is not configured
func DeleteFromBunnyCDN(cdnURL string) error {
	if BunnyCDNStorageZone == "" || BunnyCDNAccessKey == "" {
		log.Println("⚠️  BunnyCDN not configured, using local storage deletion")
		return deleteFromLocalStorage(cdnURL)
	}

	// Extract filename from CDN URL
	filename := extractFilenameFromCDNURL(cdnURL)
	if filename == "" {
		return fmt.Errorf("invalid CDN URL: %s", cdnURL)
	}

	// Delete URL
	deleteURL := fmt.Sprintf("%s/%s", getBunnyCDNStorageURL(), filename)

	log.Printf("🗑️  [BunnyCDN] Deleting file: %s", filename)

	// Create HTTP request
	req, err := http.NewRequest("DELETE", deleteURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create delete request: %w", err)
	}

	// Set headers
	req.Header.Set("AccessKey", BunnyCDNAccessKey)

	// Execute request
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("delete request failed: %w", err)
	}
	defer resp.Body.Close()

	// Check response (200 OK or 404 Not Found are acceptable)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotFound {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("delete failed with status %d: %s", resp.StatusCode, string(body))
	}

	log.Printf("✅ [BunnyCDN] Delete successful: %s", filename)
	return nil
}

// UploadLocalFileToBunnyCDN streams a local file to BunnyCDN at the exact remotePath given
// (relative to the storage zone root, e.g. "temp-media/uuid.mp4").
// Unlike UploadToBunnyCDN it does NOT add a timestamp prefix — caller controls the remote name.
// Local dev fallback: if BunnyCDN is not configured, returns a /uploads/... URL derived from
// the local path and leaves the file on disk unchanged.
func UploadLocalFileToBunnyCDN(localPath, remotePath, contentType string) (string, error) {
	// On localhost: never touch CDN regardless of whether credentials are configured.
	// Files are served directly by the Go static handler at /uploads/*.
	if IsLocalDev() {
		// Only safe to return localPath's own (./-stripped) path unchanged when it's
		// already somewhere under ./uploads — the assumption every other caller of
		// this function satisfies by saving there in the first place. A caller whose
		// source file lives elsewhere (e.g. a /tmp download, as both
		// transcodeOneDemoItem and extractDemoPoster do) would otherwise get back a
		// bare filesystem path the Go static handler never serves — confirmed for real
		// while testing the demo-media admin endpoints, which silently stored exactly
		// that kind of unusable /tmp/... value as a "poster_url". Copy the bytes into
		// ./uploads/<remotePath> instead, so the returned URL always actually resolves.
		if !strings.Contains(filepath.ToSlash(localPath), "uploads/") {
			destPath := filepath.Join("./uploads", remotePath)
			if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
				return "", fmt.Errorf("failed to create local uploads dir: %w", err)
			}
			src, err := os.Open(localPath)
			if err != nil {
				return "", fmt.Errorf("failed to open local file: %w", err)
			}
			defer src.Close()
			dst, err := os.Create(destPath)
			if err != nil {
				return "", fmt.Errorf("failed to create local uploads file: %w", err)
			}
			defer dst.Close()
			if _, err := io.Copy(dst, src); err != nil {
				return "", fmt.Errorf("failed to copy file into uploads dir: %w", err)
			}
			rel := "/uploads/" + remotePath
			log.Printf("🏠 [CDN skip] Local dev — copied into uploads dir: %s", rel)
			return rel, nil
		}
		rel := strings.TrimPrefix(localPath, "./")
		if !strings.HasPrefix(rel, "/") {
			rel = "/" + rel
		}
		log.Printf("🏠 [CDN skip] Local dev — keeping file on disk: %s", rel)
		return rel, nil
	}

	if BunnyCDNStorageZone == "" || BunnyCDNAccessKey == "" {
		return "", fmt.Errorf("BunnyCDN not configured in production (BUNNY_STORAGE_ZONE or BUNNY_ACCESS_KEY missing)")
	}

	f, err := os.Open(localPath)
	if err != nil {
		return "", fmt.Errorf("failed to open local file: %w", err)
	}
	defer f.Close()

	fi, err := f.Stat()
	if err != nil {
		return "", fmt.Errorf("failed to stat local file: %w", err)
	}

	uploadURL := fmt.Sprintf("%s/%s", getBunnyCDNStorageURL(), remotePath)
	log.Printf("📤 [BunnyCDN] Streaming upload: %s → %s (%d bytes)", filepath.Base(localPath), remotePath, fi.Size())

	req, err := http.NewRequest("PUT", uploadURL, f)
	if err != nil {
		return "", fmt.Errorf("failed to create upload request: %w", err)
	}
	req.Header.Set("AccessKey", BunnyCDNAccessKey)
	req.Header.Set("Content-Type", contentType)
	req.ContentLength = fi.Size()
	// GetBody lets Go's HTTP/2 transport retry on GOAWAY by re-opening the file
	// instead of failing with "cannot retry after Request.Body was written".
	req.GetBody = func() (io.ReadCloser, error) { return os.Open(localPath) }

	client := &http.Client{Timeout: 15 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("upload request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("upload failed with status %d: %s", resp.StatusCode, string(body))
	}

	cdnURL := fmt.Sprintf("%s/%s", BunnyCDNPullZoneURL, remotePath)
	log.Printf("✅ [BunnyCDN] Stream upload successful: %s", cdnURL)
	return cdnURL, nil
}

// DeleteMediaFile deletes a media file whether it is a BunnyCDN URL (https://...) or a local
// filesystem path. Not-found errors are silently ignored in both cases.
// For CDN URLs it derives the storage path from BUNNY_PULL_ZONE_URL so the full folder
// prefix (e.g. "temp-media/") is preserved in the DELETE request.
func DeleteMediaFile(filePathOrURL string) error {
	if filePathOrURL == "" {
		return nil
	}
	if strings.HasPrefix(filePathOrURL, "http://") || strings.HasPrefix(filePathOrURL, "https://") {
		// Derive the storage-zone path from the pull-zone URL so folder prefixes are kept.
		// e.g. "https://letswatchout.b-cdn.net/temp-media/uuid.mp4" → "temp-media/uuid.mp4"
		if BunnyCDNPullZoneURL != "" {
			base := strings.TrimRight(BunnyCDNPullZoneURL, "/")
			if strings.HasPrefix(filePathOrURL, base+"/") {
				remotePath := strings.TrimPrefix(filePathOrURL, base+"/")
				return DeletePathFromBunnyCDNStorage(remotePath)
			}
		}
		// Fallback for URLs not matching the configured pull zone
		return DeleteFromBunnyCDN(filePathOrURL)
	}
	// A locally-produced HLS manifest (progressive or fallback device-stream) has
	// sibling seg_*.ts files that a single-file delete would otherwise orphan
	// forever. Externally-linked .m3u8 streams (pasted via HandleStreamURL) are
	// always real http(s) URLs and are handled by the branch above, so reaching
	// here with a .m3u8 suffix means this is unambiguously one of ours.
	//
	// The two HLS pipelines nest the manifest at different depths, so "how far up
	// is safe to remove" differs:
	//   - fallback (hls.go):      uploads/temp/hls/{name}/playlist.m3u8 — the manifest's
	//     immediate parent IS the per-item directory; its OWN parent ("hls/") is shared
	//     across every fallback upload, so removing two levels up would wipe out every
	//     other in-flight/completed fallback HLS item too.
	//   - progressive (hls_progressive.go): .../{uploadID}_progressive/output/playlist.m3u8 —
	//     the per-upload directory is one level further up than the manifest's immediate
	//     parent ("output/"), which is what the "_progressive" suffix check below detects.
	if strings.HasSuffix(filePathOrURL, ".m3u8") {
		manifestFSPath := strings.TrimPrefix(filePathOrURL, "/")
		itemDir := filepath.Dir(manifestFSPath)
		removeDir := itemDir
		if grandparent := filepath.Dir(itemDir); strings.HasSuffix(grandparent, "_progressive") {
			removeDir = grandparent
		}
		if err := os.RemoveAll(removeDir); err != nil {
			log.Printf("⚠️ [DeleteMediaFile] Failed to remove HLS output dir %s: %v", removeDir, err)
			return err
		}
		return nil
	}
	if err := os.Remove(filePathOrURL); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// downloadHTTPClient has a generous but bounded timeout — http.Get's default client has
// none at all, so a connection that stalls mid-download (rather than erroring outright)
// hangs the calling goroutine forever with no log line and no way to tell "still working"
// apart from "silently dead". Confirmed as the likely cause of a real production stall:
// two separate attempts at transcoding 4 ~130-325MB source files each ran 15-45+ minutes
// with zero of the 4 completing and the server otherwise healthy — consistent with a
// hung download, not a crash (which would at least free up to retry the next item) or a
// slow-but-working transcode (which completed a single similarly-sized file in ~12 min
// in local testing). 20 minutes comfortably covers even a slow download of the largest
// file in this codebase's current use cases; a genuinely hung connection now fails
// loudly and gets logged instead of hanging forever.
var downloadHTTPClient = &http.Client{Timeout: 20 * time.Minute}

// DownloadFileToTemp downloads a remote URL (CDN or any HTTPS) to a temporary local file.
// Returns the temp file path. Caller is responsible for deleting it.
func DownloadFileToTemp(remoteURL string, suffix string) (string, error) {
	resp, err := downloadHTTPClient.Get(remoteURL)
	if err != nil {
		return "", fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download returned status %d", resp.StatusCode)
	}

	tmpFile, err := os.CreateTemp("", "ww_transcode_*"+suffix)
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %w", err)
	}
	defer tmpFile.Close()

	if _, err := io.Copy(tmpFile, resp.Body); err != nil {
		os.Remove(tmpFile.Name())
		return "", fmt.Errorf("failed to write temp file: %w", err)
	}
	return tmpFile.Name(), nil
}

// UploadPreviewToBunnyCDN uploads a session preview file to BunnyCDN under previews/.
// The filename is used as-is (no timestamp added) so repeated calls overwrite the same CDN path —
// this is intentional: each preview refresh replaces the previous clip without accumulating files.
// Falls back to ./uploads/previews/ if BunnyCDN is not configured (local dev).
func UploadPreviewToBunnyCDN(fileData []byte, filename string) (string, error) {
	if BunnyCDNStorageZone == "" || BunnyCDNAccessKey == "" {
		previewDir := "./uploads/previews"
		if err := os.MkdirAll(previewDir, 0755); err != nil {
			return "", fmt.Errorf("failed to create previews dir: %w", err)
		}
		localPath := filepath.Join(previewDir, filename)
		if err := os.WriteFile(localPath, fileData, 0644); err != nil {
			return "", fmt.Errorf("failed to write local preview: %w", err)
		}
		return "/uploads/previews/" + filename, nil
	}

	cdnPath := "previews/" + sanitizeFilename(filename)
	uploadURL := fmt.Sprintf("%s/%s", getBunnyCDNStorageURL(), cdnPath)

	req, err := http.NewRequest("PUT", uploadURL, bytes.NewReader(fileData))
	if err != nil {
		return "", fmt.Errorf("failed to create upload request: %w", err)
	}
	ct := "video/mp4"
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".webm":
		ct = "video/webm"
	case ".jpg", ".jpeg":
		ct = "image/jpeg"
	case ".png":
		ct = "image/png"
	}
	req.Header.Set("AccessKey", BunnyCDNAccessKey)
	req.Header.Set("Content-Type", ct)
	req.ContentLength = int64(len(fileData))

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("preview upload request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("preview upload failed with status %d: %s", resp.StatusCode, string(body))
	}

	cdnURL := fmt.Sprintf("%s/%s", BunnyCDNPullZoneURL, cdnPath)
	log.Printf("✅ [BunnyCDN] Preview uploaded: %s", cdnURL)
	return cdnURL, nil
}

// GenerateThumbnailURL generates a thumbnail URL using BunnyCDN's image processing
// Example: ?width=320&height=240&aspect_ratio=16:9
func GenerateThumbnailURL(cdnURL string, width int, height int) string {
	return fmt.Sprintf("%s?width=%d&height=%d&quality=85", cdnURL, width, height)
}

// Helper: Sanitize filename for BunnyCDN
func sanitizeFilename(filename string) string {
	// Remove path components (security)
	filename = filepath.Base(filename)

	// Replace spaces with underscores
	filename = strings.ReplaceAll(filename, " ", "_")

	// Remove potentially problematic characters
	replacer := strings.NewReplacer(
		"(", "", ")", "",
		"[", "", "]", "",
		"{", "", "}", "",
		"#", "", "&", "",
		"?", "", "=", "",
	)
	filename = replacer.Replace(filename)

	return filename
}

// Helper: Extract filename from CDN URL
func extractFilenameFromCDNURL(cdnURL string) string {
	// Remove query parameters
	if idx := strings.Index(cdnURL, "?"); idx != -1 {
		cdnURL = cdnURL[:idx]
	}

	// Extract last path component
	parts := strings.Split(cdnURL, "/")
	if len(parts) == 0 {
		return ""
	}

	return parts[len(parts)-1]
}

// ValidateBunnyCDNConfig checks if BunnyCDN is properly configured
func ValidateBunnyCDNConfig() error {
	if BunnyCDNStorageZone == "" {
		log.Println("⚠️  [BunnyCDN] Not configured - using local storage fallback for development")
		return nil // Don't fail, just warn
	}
	if BunnyCDNAccessKey == "" {
		return fmt.Errorf("BUNNY_ACCESS_KEY environment variable not set")
	}
	if BunnyCDNPullZoneURL == "" {
		return fmt.Errorf("BUNNY_PULL_ZONE_URL environment variable not set")
	}

	log.Printf("✅ [BunnyCDN] Configuration validated")
	log.Printf("   ├─ Storage Zone: %s", BunnyCDNStorageZone)
	log.Printf("   ├─ Region: %s", BunnyCDNStorageRegion)
	log.Printf("   └─ Pull Zone: %s", BunnyCDNPullZoneURL)

	return nil
}

// UploadAvatarToBunnyCDN uploads a user avatar to BunnyCDN under the avatars/ subdirectory.
// In local dev it falls back to ./uploads/avatars/ (served by the Go static handler).
func UploadAvatarToBunnyCDN(fileData []byte, filename string, contentType string) (string, error) {
	sanitizedFilename := sanitizeFilename(filename)
	timestamp := time.Now().Unix()
	localFilename := fmt.Sprintf("%d_%s", timestamp, sanitizedFilename)
	cdnPath := "avatars/" + localFilename

	if IsLocalDev() || BunnyCDNStorageZone == "" || BunnyCDNAccessKey == "" {
		dir := "./uploads/avatars"
		if err := os.MkdirAll(dir, 0755); err != nil {
			return "", fmt.Errorf("failed to create avatars dir: %w", err)
		}
		localPath := filepath.Join(dir, localFilename)
		if err := os.WriteFile(localPath, fileData, 0644); err != nil {
			return "", fmt.Errorf("failed to write avatar: %w", err)
		}
		url := "/uploads/avatars/" + localFilename
		log.Printf("🏠 [Local] Avatar saved: %s", url)
		return url, nil
	}

	uploadURL := fmt.Sprintf("%s/%s", getBunnyCDNStorageURL(), cdnPath)
	log.Printf("📤 [BunnyCDN] Uploading avatar: %s (%d bytes)", cdnPath, len(fileData))

	req, err := http.NewRequest("PUT", uploadURL, bytes.NewReader(fileData))
	if err != nil {
		return "", fmt.Errorf("failed to create upload request: %w", err)
	}
	req.Header.Set("AccessKey", BunnyCDNAccessKey)
	req.Header.Set("Content-Type", contentType)
	req.ContentLength = int64(len(fileData))

	client := &http.Client{Timeout: 2 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("upload request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("upload failed with status %d: %s", resp.StatusCode, string(body))
	}

	cdnURL := fmt.Sprintf("%s/%s", BunnyCDNPullZoneURL, cdnPath)
	log.Printf("✅ [BunnyCDN] Avatar uploaded: %s", cdnURL)
	return cdnURL, nil
}

// UploadTrailerToBunnyCDN uploads a trailer video to BunnyCDN under the trailers/ subdirectory
func UploadTrailerToBunnyCDN(fileData []byte, filename string, contentType string) (string, error) {
	if BunnyCDNStorageZone == "" || BunnyCDNAccessKey == "" {
		log.Println("⚠️  BunnyCDN not configured, using local storage fallback")
		return uploadTrailerToLocalStorage(fileData, filename)
	}

	sanitizedFilename := sanitizeFilename(filename)
	timestamp := time.Now().Unix()
	uniqueFilename := fmt.Sprintf("trailers/%d_%s", timestamp, sanitizedFilename)

	uploadURL := fmt.Sprintf("%s/%s", getBunnyCDNStorageURL(), uniqueFilename)

	log.Printf("📤 [BunnyCDN] Uploading trailer: %s (%d bytes)", uniqueFilename, len(fileData))

	req, err := http.NewRequest("PUT", uploadURL, bytes.NewReader(fileData))
	if err != nil {
		return "", fmt.Errorf("failed to create upload request: %w", err)
	}
	req.Header.Set("AccessKey", BunnyCDNAccessKey)
	req.Header.Set("Content-Type", contentType)
	req.ContentLength = int64(len(fileData))

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("upload request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("upload failed with status %d: %s", resp.StatusCode, string(body))
	}

	cdnURL := fmt.Sprintf("%s/%s", BunnyCDNPullZoneURL, uniqueFilename)
	log.Printf("✅ [BunnyCDN] Trailer upload successful: %s", cdnURL)
	return cdnURL, nil
}

// DownloadChunkFromBunnyCDNStorage downloads a chunk file from the BunnyCDN Storage Zone
// using the AccessKey (server-to-server, no CORS). Returns the raw bytes.
func DownloadChunkFromBunnyCDNStorage(chunkPath string) ([]byte, error) {
	downloadURL := fmt.Sprintf("%s/%s", getBunnyCDNStorageURL(), chunkPath)
	req, err := http.NewRequest("GET", downloadURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create download request: %w", err)
	}
	req.Header.Set("AccessKey", BunnyCDNAccessKey)

	client := &http.Client{Timeout: 2 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download returned status %d for %s", resp.StatusCode, chunkPath)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read chunk body: %w", err)
	}
	return data, nil
}

// BunnyCDNFileEntry is one entry returned by BunnyCDN's Storage API directory listing.
// Field names match the Storage API's JSON response (PascalCase) — only the few fields
// this codebase actually needs are declared; the API returns more (Guid, LastChanged,
// etc.) which json.Unmarshal silently ignores.
type BunnyCDNFileEntry struct {
	ObjectName  string `json:"ObjectName"`
	IsDirectory bool   `json:"IsDirectory"`
	Length      int64  `json:"Length"`
}

// ListBunnyCDNFolderRaw lists everything in a BunnyCDN Storage Zone folder
// (non-recursive), including subdirectories, unfiltered and unsorted — exactly what
// the Storage API returned. ListBunnyCDNFolder (below) is what callers normally want;
// this exists for inspecting folder structure (e.g. confirming whether a folder's
// contents are nested in subdirectories rather than flat files).
func ListBunnyCDNFolderRaw(folderPath string) ([]BunnyCDNFileEntry, error) {
	accessKey := os.Getenv("BUNNY_ACCESS_KEY")
	if os.Getenv("BUNNY_STORAGE_ZONE") == "" || accessKey == "" {
		return nil, fmt.Errorf("BunnyCDN not configured (BUNNY_STORAGE_ZONE or BUNNY_ACCESS_KEY missing)")
	}
	trimmed := strings.Trim(folderPath, "/")
	listURL := fmt.Sprintf("%s/%s/", getBunnyCDNStorageURL(), trimmed)

	req, err := http.NewRequest("GET", listURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create list request: %w", err)
	}
	req.Header.Set("AccessKey", accessKey)
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("list request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read list response body: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("BunnyCDN list failed: %d %s", resp.StatusCode, string(body))
	}

	var entries []BunnyCDNFileEntry
	if err := json.Unmarshal(body, &entries); err != nil {
		return nil, fmt.Errorf("failed to parse list response: %w (body: %s)", err, string(body))
	}
	return entries, nil
}

// ListBunnyCDNFolder lists the files in a BunnyCDN Storage Zone folder (non-recursive).
// folderPath is storage-relative, e.g. "demo_vids/horror" (leading/trailing slashes
// optional — normalized below). Returns only files (directories filtered out), sorted
// by ObjectName so a caller can rely on filename-prefix ordering (e.g. "01_x.mp4",
// "02_y.mp4") for explicit rotation order.
func ListBunnyCDNFolder(folderPath string) ([]BunnyCDNFileEntry, error) {
	entries, err := ListBunnyCDNFolderRaw(folderPath)
	if err != nil {
		return nil, err
	}
	files := make([]BunnyCDNFileEntry, 0, len(entries))
	for _, e := range entries {
		if !e.IsDirectory {
			files = append(files, e)
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].ObjectName < files[j].ObjectName })
	return files, nil
}

// DeletePathFromBunnyCDNStorage deletes a file or prefix from BunnyCDN Storage Zone.
func DeletePathFromBunnyCDNStorage(remotePath string) error {
	deleteURL := fmt.Sprintf("%s/%s", getBunnyCDNStorageURL(), remotePath)
	req, err := http.NewRequest("DELETE", deleteURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create delete request: %w", err)
	}
	// Fresh read, not the package-level BunnyCDNAccessKey var — see getBunnyCDNStorageURL's
	// comment for why the var is unreliable specifically in local dev.
	req.Header.Set("AccessKey", os.Getenv("BUNNY_ACCESS_KEY"))

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("delete request failed: %w", err)
	}
	defer resp.Body.Close()
	return nil
}

// --- LOCAL STORAGE FALLBACK (Development Only) ---

// uploadToLocalStorage saves file to ./uploads/posts/ directory
func uploadToLocalStorage(fileData []byte, filename string) (string, error) {
	// Create posts directory if it doesn't exist
	postsDir := "./uploads/posts"
	if err := os.MkdirAll(postsDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create posts directory: %w", err)
	}

	// Sanitize filename
	sanitizedFilename := sanitizeFilename(filename)

	// Generate unique filename with timestamp
	timestamp := time.Now().Unix()
	uniqueFilename := fmt.Sprintf("%d_%s", timestamp, sanitizedFilename)

	// Full file path
	filePath := filepath.Join(postsDir, uniqueFilename)

	// Write file
	if err := os.WriteFile(filePath, fileData, 0644); err != nil {
		return "", fmt.Errorf("failed to write file: %w", err)
	}

	// Return local URL
	localURL := fmt.Sprintf("/uploads/posts/%s", uniqueFilename)
	log.Printf("✅ [Local Storage] File saved: %s", localURL)

	return localURL, nil
}

// deleteFromLocalStorage deletes file from local storage
func deleteFromLocalStorage(localURL string) error {
	// Extract filename from URL (e.g., /uploads/posts/123456_video.mp4)
	parts := strings.Split(localURL, "/")
	if len(parts) < 3 {
		return fmt.Errorf("invalid local URL: %s", localURL)
	}

	filename := parts[len(parts)-1]
	filePath := filepath.Join("./uploads/posts", filename)

	// Delete file
	if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete file: %w", err)
	}

	log.Printf("✅ [Local Storage] File deleted: %s", filePath)
	return nil
}

// uploadTrailerToLocalStorage saves trailer to ./uploads/trailers/ (dev fallback)
func uploadTrailerToLocalStorage(fileData []byte, filename string) (string, error) {
	dir := "./uploads/trailers"
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("failed to create trailers directory: %w", err)
	}

	sanitizedFilename := sanitizeFilename(filename)
	timestamp := time.Now().Unix()
	uniqueFilename := fmt.Sprintf("%d_%s", timestamp, sanitizedFilename)
	filePath := filepath.Join(dir, uniqueFilename)

	if err := os.WriteFile(filePath, fileData, 0644); err != nil {
		return "", fmt.Errorf("failed to write file: %w", err)
	}

	localURL := fmt.Sprintf("/uploads/trailers/%s", uniqueFilename)
	log.Printf("✅ [Local Storage] Trailer saved: %s", localURL)
	return localURL, nil
}

// UploadBytesWithPath uploads raw bytes to BunnyCDN at the exact remotePath given
// (relative to the storage zone root, e.g. "stickers/packs/42/sticker_123.webp").
// On local dev, saves to ./uploads/{remotePath} and returns /uploads/{remotePath}.
func UploadBytesWithPath(data []byte, remotePath, contentType string) (string, error) {
	if IsLocalDev() || BunnyCDNStorageZone == "" || BunnyCDNAccessKey == "" {
		localPath := filepath.Join("./uploads", remotePath)
		if err := os.MkdirAll(filepath.Dir(localPath), 0755); err != nil {
			return "", fmt.Errorf("failed to create local dir: %w", err)
		}
		if err := os.WriteFile(localPath, data, 0644); err != nil {
			return "", fmt.Errorf("failed to write local file: %w", err)
		}
		url := "/uploads/" + remotePath
		log.Printf("🏠 [Local] Saved: %s", url)
		return url, nil
	}

	uploadURL := fmt.Sprintf("%s/%s", getBunnyCDNStorageURL(), remotePath)
	req, err := http.NewRequest("PUT", uploadURL, bytes.NewReader(data))
	if err != nil {
		return "", fmt.Errorf("failed to create upload request: %w", err)
	}
	req.Header.Set("AccessKey", BunnyCDNAccessKey)
	req.Header.Set("Content-Type", contentType)
	req.ContentLength = int64(len(data))

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("upload request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("upload failed with status %d: %s", resp.StatusCode, string(body))
	}

	cdnURL := fmt.Sprintf("%s/%s", BunnyCDNPullZoneURL, remotePath)
	log.Printf("✅ [BunnyCDN] Uploaded: %s", cdnURL)
	return cdnURL, nil
}
