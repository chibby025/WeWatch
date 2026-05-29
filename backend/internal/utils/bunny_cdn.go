// backend/internal/utils/bunny_cdn.go
package utils

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// BunnyCDN configuration
var (
	BunnyCDNStorageZone   = os.Getenv("BUNNY_STORAGE_ZONE")       // e.g., "wewatch-posts"
	BunnyCDNAccessKey     = os.Getenv("BUNNY_ACCESS_KEY")         // Storage API key
	BunnyCDNStorageRegion = os.Getenv("BUNNY_STORAGE_REGION")     // e.g., "ny" (New York), "la" (Los Angeles), "sg" (Singapore)
	BunnyCDNPullZoneURL   = os.Getenv("BUNNY_PULL_ZONE_URL")      // e.g., "https://wewatch-posts.b-cdn.net"
)

// BunnyCDN API endpoints by region
func getBunnyCDNStorageURL() string {
	region := BunnyCDNStorageRegion
	if region == "" {
		region = "ny" // Default to New York
	}
	return fmt.Sprintf("https://%s.storage.bunnycdn.com/%s", region, BunnyCDNStorageZone)
}

// UploadToBunnyCDN uploads a file to BunnyCDN storage
// Returns the CDN URL or an error
// Falls back to local storage if BunnyCDN is not configured
func UploadToBunnyCDN(fileData []byte, filename string, contentType string) (string, error) {
	if BunnyCDNStorageZone == "" || BunnyCDNAccessKey == "" {
		log.Println("⚠️  BunnyCDN not configured, using local storage fallback")
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
	if BunnyCDNStorageZone == "" || BunnyCDNAccessKey == "" {
		rel := strings.TrimPrefix(localPath, "./")
		return "/" + rel, nil
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
func DeleteMediaFile(filePathOrURL string) error {
	if filePathOrURL == "" {
		return nil
	}
	if strings.HasPrefix(filePathOrURL, "http://") || strings.HasPrefix(filePathOrURL, "https://") {
		return DeleteFromBunnyCDN(filePathOrURL)
	}
	if err := os.Remove(filePathOrURL); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// DownloadFileToTemp downloads a remote URL (CDN or any HTTPS) to a temporary local file.
// Returns the temp file path. Caller is responsible for deleting it.
func DownloadFileToTemp(remoteURL string, suffix string) (string, error) {
	resp, err := http.Get(remoteURL)
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

// DeletePathFromBunnyCDNStorage deletes a file or prefix from BunnyCDN Storage Zone.
func DeletePathFromBunnyCDNStorage(remotePath string) error {
	deleteURL := fmt.Sprintf("%s/%s", getBunnyCDNStorageURL(), remotePath)
	req, err := http.NewRequest("DELETE", deleteURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create delete request: %w", err)
	}
	req.Header.Set("AccessKey", BunnyCDNAccessKey)

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
