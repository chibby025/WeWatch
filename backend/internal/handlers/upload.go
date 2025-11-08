// WeWatch/backend/internal/handlers/upload.go
package handlers

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	//"encoding/json"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
)

const UploadDir = "./uploads"

func init() {
	err := os.MkdirAll(UploadDir, os.ModePerm)
	if err != nil {
		log.Fatalf("Failed to create upload directory '%s': %v", UploadDir, err)
	}
	log.Printf("Upload directory '%s' is ready.", UploadDir)
}

func UploadMediaHandler(c *gin.Context) {
	log.Println("🚨🚨🚨 UploadMediaHandler CALLED 🚨🚨🚨")

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

	isTemporary := c.Query("temporary") == "true"
	log.Printf("UploadMediaHandler: Upload type - Temporary: %v", isTemporary)

	// ✅ INCREASED LIMITS FOR 1GB UPLOADS
	const maxMemory int64 = 256 << 20 // 256 MB memory buffer
	const maxSize int64 = 1 << 30     // 1 GB max file size

	// Parse multipart form with higher memory limit
	if err := c.Request.ParseMultipartForm(maxMemory); err != nil {
		log.Printf("UploadMediaHandler: Error parsing multipart form: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Error parsing upload data"})
		return
	}

	formFile, err := c.FormFile("mediaFile")
	if err != nil {
		log.Printf("UploadMediaHandler: Error retrieving file from form: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file provided or error reading file"})
		return
	}

	// Enforce 1GB limit
	if formFile.Size > maxSize {
		log.Printf("UploadMediaHandler: File too large (%d bytes). Max size: %d bytes.", formFile.Size, maxSize)
		c.JSON(http.StatusBadRequest, gin.H{"error": "File too large. Maximum size is 1 GB."})
		return
	}

	allowedExtensions := map[string]bool{
		".mp4": true, ".avi": true, ".mov": true, ".mkv": true, ".webm": true,
	}
	ext := strings.ToLower(filepath.Ext(formFile.Filename))
	if !allowedExtensions[ext] {
		log.Printf("UploadMediaHandler: Invalid file type: %s", ext)
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid file type '%s'. Allowed types: mp4, avi, mov, mkv, webm.", ext)})
		return
	}

	uniqueID := uuid.New()
	uniqueFilename := fmt.Sprintf("%s%s", uniqueID.String(), ext)

	var filePath string
	if isTemporary {
		tempUploadDir := filepath.Join(UploadDir, "temp")
		if err := os.MkdirAll(tempUploadDir, os.ModePerm); err != nil {
			log.Printf("UploadMediaHandler: Failed to create temp upload directory '%s': %v", tempUploadDir, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare temp storage"})
			return
		}
		filePath = filepath.Join(tempUploadDir, uniqueFilename)
		log.Printf("UploadMediaHandler: Saving temporary file to: %s", filePath)
	} else {
		filePath = filepath.Join(UploadDir, uniqueFilename)
		log.Printf("UploadMediaHandler: Saving permanent file to: %s", filePath)
	}

	if err := c.SaveUploadedFile(formFile, filePath); err != nil {
		log.Printf("UploadMediaHandler: Error saving file to '%s': %v", filePath, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save uploaded file"})
		return
	}
	log.Printf("✅ UploadMediaHandler: File saved successfully to '%s'", filePath)
	// ✅ OPTIMIZE MP4 FOR WEB STREAMING
	if ext == ".mp4" {
	log.Printf("🎥 Optimizing MP4 for web streaming: %s", filePath)
	tempOptimizedPath := filePath + ".optimized"
	cmd := exec.Command("ffmpeg",
		"-i", filePath,
		"-c", "copy",              // stream copy (fast, no re-encode)
		"-movflags", "+faststart", // move moov atom to front
		tempOptimizedPath,
	)
	if err := cmd.Run(); err != nil {
		log.Printf("⚠️ Failed to optimize MP4, using original: %v", err)
		// Keep original if optimization fails
	} else {
		// Replace original with optimized version
		os.Remove(filePath)
		os.Rename(tempOptimizedPath, filePath)
		log.Printf("✅ MP4 optimized successfully: %s", filePath)
		}
	} // ← THIS BRACE WAS MISSING!

	// ✅ GET DURATION
	log.Printf("⏱️ UploadMediaHandler: Extracting duration for '%s'", filePath)
	duration, err := utils.GetVideoDuration(filePath)
	if err != nil {
		log.Printf("❌ UploadMediaHandler: Failed to extract duration: %v", err)
		duration = "00:00:00"
	}
	log.Printf("✅ UploadMediaHandler: Duration extracted successfully: %s", duration)

	if isTemporary {
		newTempMediaItem := models.TemporaryMediaItem{
			FileName:     uniqueFilename,
			OriginalName: formFile.Filename,
			MimeType:     getMimeType(ext),
			FileSize:     formFile.Size,
			FilePath:     filePath,
			RoomID:       room.ID,
			UploaderID:   authenticatedUserID,
			Duration:     duration,
			OrderIndex:   0,
		}

		result = DB.Create(&newTempMediaItem)
		if result.Error != nil {
			log.Printf("UploadMediaHandler: Error creating TemporaryMediaItem record: %v", result.Error)
			os.Remove(filePath)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "File uploaded but failed to save temporary media information"})
			return
		}

		// ✅ BROADCAST TO ROOM — FIXED
		//message := map[string]interface{}{
		//	"type": "temporary_media_item_added",
		//	"data": newTempMediaItem,
		//}
		//messageBytes, err := json.Marshal(message)
		//if err != nil {
		//	log.Printf("UploadMediaHandler: Failed to marshal broadcast message: %v", err)
		//} else {
		//	hub.BroadcastToRoom(roomIDUint, messageBytes)
		//}

		// ✅ Construct public URL for browser access
		publicURL := fmt.Sprintf("/uploads/temp/%s", uniqueFilename)

		log.Printf("🎉 UploadMediaHandler: Temporary media item '%s' (ID: %d) uploaded successfully to room %d by user %d", newTempMediaItem.FileName, newTempMediaItem.ID, room.ID, authenticatedUserID)
		c.JSON(http.StatusCreated, gin.H{
			"message":       "Temporary media item uploaded successfully",
			"media_item_id": newTempMediaItem.ID,
			"file_name":     newTempMediaItem.FileName,
			"original_name": newTempMediaItem.OriginalName,
			"mime_type":     newTempMediaItem.MimeType,
			"file_size":     newTempMediaItem.FileSize,
			"file_path":     newTempMediaItem.FilePath,          // internal path (for cleanup)
			"file_url":      publicURL,                        // ✅ public URL for playback
			"room_id":       newTempMediaItem.RoomID,
			"uploader_id":   newTempMediaItem.UploaderID,
			"duration":      newTempMediaItem.Duration,
			"is_temporary":  true,
		})

	} else {
		newMediaItem := models.MediaItem{
			FileName:     uniqueFilename,
			OriginalName: formFile.Filename,
			MimeType:     getMimeType(ext),
			FileSize:     formFile.Size,
			FilePath:     filePath,
			RoomID:       room.ID,
			UploaderID:   authenticatedUserID,
			Duration:     duration,
			OrderIndex:   0,
		}

		result = DB.Create(&newMediaItem)
		if result.Error != nil {
			log.Printf("UploadMediaHandler: Error creating MediaItem record: %v", result.Error)
			os.Remove(filePath)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "File uploaded but failed to save media information"})
			return
		}

		// ✅ BROADCAST TO ROOM — FIXED
		//message := map[string]interface{}{
		//	"type": "media_item_added",
		//	"data": newMediaItem,
		//}
		//messageBytes, err := json.Marshal(message)
		//if err != nil {
		//	log.Printf("UploadMediaHandler: Failed to marshal broadcast message: %v", err)
		//} else {
		//	hub.BroadcastToRoom(roomIDUint, messageBytes)
		//}

		log.Printf("🎉 UploadMediaHandler: Media item '%s' (ID: %d) uploaded successfully to room %d by user %d", newMediaItem.FileName, newMediaItem.ID, room.ID, authenticatedUserID)
		c.JSON(http.StatusCreated, gin.H{
			"message":       "Media item uploaded successfully",
			"media_item":    newMediaItem,
			"file_name":     newMediaItem.FileName,
			"original_name": newMediaItem.OriginalName,
			"mime_type":     newMediaItem.MimeType,
			"file_size":     newMediaItem.FileSize,
			"file_path":     newMediaItem.FilePath,
			"room_id":       newMediaItem.RoomID,
			"uploader_id":   newMediaItem.UploaderID,
			"duration":      newMediaItem.Duration,
			"is_temporary":  false,
		})
	}
}

func getMimeType(ext string) string {
	switch ext {
	case ".mp4":
		return "video/mp4"
	case ".avi":
		return "video/x-msvideo"
	case ".mov":
		return "video/quicktime"
	case ".mkv":
		return "video/x-matroska"
	case ".webm":
		return "video/webm"
	default:
		return "application/octet-stream"
	}
}