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
