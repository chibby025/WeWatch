// WeWatch/backend/internal/handlers/upload.go
package handlers

import (
	"fmt"
	"log"
	//"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// Define a directory for temporary local storage.
// In production, use a dedicated storage service (S3, GCS) or a robust file system.
const UploadDir = "./uploads" // Relative to where the backend binary runs

// init function runs automatically when the package is imported.
func init() {
	// Ensure the upload directory exists.
	err := os.MkdirAll(UploadDir, os.ModePerm)
	if err != nil {
		log.Fatalf("Failed to create upload directory '%s': %v", UploadDir, err)
	}
	log.Printf("Upload directory '%s' is ready.", UploadDir)
}

// UploadMediaHandler handles the POST /api/rooms/:id/upload endpoint.
// It requires authentication (any user can upload).
// It expects multipart/form-data (standard for file uploads).
func UploadMediaHandler(c *gin.Context) {

	log.Println("UploadMediaHandler: Request received")
	// 1. Get the authenticated user's ID from the context (set by AuthMiddleware).
	// userIDInterface, exists := c.Get("user_id")
	userIDValue, exists := c.Get("user_id")
	if !exists {
		log.Println("UploadMediaHandler: Unauthorized access, user_id not found in context")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	authenticatedUserID, ok := userIDValue.(uint)
	if !ok {
		log.Println("UploadMediaHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// 2. Get the room ID from the URL parameter (:id).
	roomIDStr := c.Param("id")
	if roomIDStr == "" {
		log.Println("UploadMediaHandler: Missing room ID parameter")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Room ID is required"})
		return
	}

	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil || roomID == 0 {
		log.Printf("UploadMediaHandler: Invalid room ID format: %s", roomIDStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	roomIDUint := uint(roomID)

	// 3. Fetch the room from the database to check existence.
	var room models.Room
	result := DB.First(&room, roomIDUint)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			log.Printf("UploadMediaHandler: Room with ID %d not found", roomIDUint)
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
			return
		} else {
			log.Printf("UploadMediaHandler: Database error fetching room %d: %v", roomIDUint, result.Error)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}
	}

	// 4. Authorization Check REMOVED/COMMENTED OUT.
	// To allow any user to upload, we skip the check: room.HostID == authenticatedUserID.
	// If you want to restrict uploads to the host ONLY, uncomment the lines below:
	/*
		if room.HostID != authenticatedUserID {
			log.Printf("UploadMediaHandler: User %d is not the host (HostID: %d) of room %d", authenticatedUserID, room.HostID, roomIDUint)
			c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can upload media"})
			return
		}
	*/

	// --- ADD DETAILED LOGGING BEFORE PARSING ---
    log.Printf("UploadMediaHandler: About to parse multipart form. Content-Type: %s", c.Request.Header.Get("Content-Type"))


	// --- FILE UPLOAD LOGIC STARTS HERE (after successful room fetch) ---

	// 5. Parse the multipart form, allocating up to 32 MiB of memory.
	// Increase this limit if needed for larger files, but be cautious of memory usage.
	// Files larger than this will be stored in temporary files on disk by Gin.
	const maxMemory int64 = 32 << 20 // 32 MiB
	if err := c.Request.ParseMultipartForm(maxMemory); err != nil {
		log.Printf("UploadMediaHandler: Error parsing multipart form: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Error parsing upload data"})
		return
	}
	log.Println("UploadMediaHandler: Multipart form parsed successfully")

	// --- ADD DETAILED LOGGING BEFORE FETCHING FILE ---
    log.Println("UploadMediaHandler: Attempting to retrieve file from form using key 'mediaFile'")
    

	// 6. Retrieve the file from the form data.
	// The form field name for the file is expected to be "mediaFile".
	formFile, err := c.FormFile("mediaFile")
	if err != nil {
		log.Printf("UploadMediaHandler: Error retrieving file from form: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file provided or error reading file"})
		return
	}
	log.Printf("UploadMediaHandler: File retrieved successfully. Name: %s, Size: %d", formFile.Filename, formFile.Size)

	// 7. Validate the file (basic checks).
	// a. Check file size (example: limit to 100MB).
	const maxSize int64 = 100 << 20 // 100 MiB
	if formFile.Size > maxSize {
		log.Printf("UploadMediaHandler: File too large (%d bytes). Max size: %d bytes.", formFile.Size, maxSize)
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("File too large. Maximum size is %d MB.", maxSize>>20)}) // Convert bytes to MB for user
		return
	}

	// b. Check file extension (basic whitelist).
	allowedExtensions := map[string]bool{
		".mp4": true, ".avi": true, ".mov": true, ".mkv": true, ".webm": true,
		// Add more video extensions as needed
	}
	ext := strings.ToLower(filepath.Ext(formFile.Filename))
	if !allowedExtensions[ext] {
		log.Printf("UploadMediaHandler: Invalid file type: %s", ext)
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid file type '%s'. Allowed types: mp4, avi, mov, mkv, webm.", ext)})
		return
	}



	// 8.  --- ADAPTED LOGIC FOR MEDIA_ITEMS TABLE ---

	// a. Determine MIME type (basic guess based on extension)
	mimeType := "application/octet-stream"  // Default binary
	switch ext {
	case ".mp4":
		mimeType = "video/mp4"
	case ".avi":
		mimeType = "video/x-msvideo"
	case ".mov":
		mimeType = "video/quicktime"
	case ".mkv":
		mimeType = "video/x-matroska"
	case ".webm":
		mimeType = "video/webm"
	}
	
	// b. Generate a unique filename using UUID to prevent conflicts and security issues
	uniqueID := uuid.New()
	uniqueFilename := fmt.Sprintf("%s%s", uniqueID.String(), ext)
	filePath := filepath.Join(UploadDir, uniqueFilename)

	// c. Save the uploaded file to the local filesystem
	if err := c.SaveUploadedFile(formFile, filePath); err != nil {
		log.Printf("UploadMediaHandler: Error saving file to '%s':%v", filePath, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save uploaded file"})
		return
	}

	// d. Create a new MediaItem record in the database
	newMediaItem := models.MediaItem {
		FileName:     uniqueFilename,
        OriginalName: formFile.Filename,
        MimeType:     mimeType,
        FileSize:     formFile.Size,
        FilePath:     filePath, // Store the relative path for MVP
        RoomID:       room.ID,  // Link to the room
        UploaderID:   authenticatedUserID, // Link to the uploading user
	}

	result = DB.Create(&newMediaItem)
	if result.Error != nil {
		log.Printf("UploadMediaHandler: Error creating MediaItem record in database: %v", result.Error)
		// Attempt to clean up the uploaded file if DB creation fails
		os.Remove(filePath) // Cleanup uploaded file
		c.JSON(http.StatusInternalServerError, gin.H{"error": "File uploaded but failed to save media information"})
		return
	}


	// Success! File Uploaded and MediaItem record created.
	log.Printf("UploadMediaHandler: Media item '%s' (ID: %d) uploaded successfully to room %d by user %d", newMediaItem.FileName, newMediaItem.ID, room.ID, authenticatedUserID)
	c.JSON(http.StatusCreated, gin.H {
		"message":       "Media item uploaded successfully",
        "media_item_id": newMediaItem.ID,
        "file_name":     newMediaItem.FileName,
        "original_name": newMediaItem.OriginalName,
        "mime_type":     newMediaItem.MimeType,
        "file_size":     newMediaItem.FileSize,
        "file_path":     newMediaItem.FilePath, // Might not expose this directly in production API
        "room_id":       newMediaItem.RoomID,
        "uploader_id":   newMediaItem.UploaderID,
	})

}

// --- Placeholder for Future Handlers ---
// func DeleteMediaHandler(c *gin.Context) { ... } // DELETE /api/rooms/:id/media (if users/host can delete)