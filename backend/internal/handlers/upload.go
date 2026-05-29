// WeWatch/backend/internal/handlers/upload.go
package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/services"
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
	
	// ✅ CHECK IF CHUNKED UPLOAD
	isChunked := c.Query("chunked") == "true"
	if isChunked {
		log.Println("🧩 [Router] Routing to ChunkUploadHandler")
		ChunkUploadHandler(c)
		return
	}

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

	// ✅ Get session_id from query parameter (for temporary uploads)
	sessionID := c.Query("session_id")
	if isTemporary && sessionID == "" {
		log.Printf("⚠️ UploadMediaHandler: Temporary upload without session_id")
		c.JSON(http.StatusBadRequest, gin.H{"error": "session_id is required for temporary uploads"})
		return
	}
	log.Printf("UploadMediaHandler: Session ID: %s", sessionID)

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

	// ✅ GET DURATION (fast operation, keep synchronous)
	log.Printf("⏱️ UploadMediaHandler: Extracting duration for '%s'", filePath)
	duration, err := utils.GetVideoDuration(filePath)
	if err != nil {
		log.Printf("❌ UploadMediaHandler: Failed to extract duration: %v", err)
		duration = "00:00:00"
	}
	log.Printf("✅ UploadMediaHandler: Duration extracted successfully: %s", duration)

	// ✅ USE PLACEHOLDER POSTER (will be replaced by async generation)
	posterFilename := fmt.Sprintf("%s_poster.jpg", strings.TrimSuffix(uniqueFilename, filepath.Ext(uniqueFilename)))
	var posterPath string
	posterURL := "/icons/placeholder-poster.jpg" // Start with placeholder
	
	if isTemporary {
		posterPath = filepath.Join(UploadDir, "temp", posterFilename)
	} else {
		posterPath = filepath.Join(UploadDir, posterFilename)
	}

	if isTemporary {
		newTempMediaItem := models.TemporaryMediaItem{
			FileName:     uniqueFilename,
			OriginalName: formFile.Filename,
			MimeType:     getMimeType(ext),
			FileSize:     formFile.Size,
			FilePath:     filePath,
			PosterURL:    posterURL,
			RoomID:       room.ID,
			UploaderID:   authenticatedUserID,
			Duration:     duration,
			OrderIndex:   0,
			SessionID:    sessionID, // ✅ Link to watch session
		}

		result = DB.Create(&newTempMediaItem)
		if result.Error != nil {
			log.Printf("UploadMediaHandler: Error creating TemporaryMediaItem record: %v", result.Error)
			os.Remove(filePath)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "File uploaded but failed to save temporary media information"})
			return
		}

		// ✅ ASYNC POSTER + CDN UPLOAD (don't block response)
		go func(itemID uint, videoPath, posterPath, mimeType, uniqueFilename string) {
			// 1. Generate poster
			posterCDNURL := fmt.Sprintf("/uploads/temp/%s", filepath.Base(posterPath))
			if err := utils.ExtractThumbnail(videoPath, posterPath); err != nil {
				log.Printf("⚠️ [Async] Poster generation failed for temp item %d: %v", itemID, err)
			} else {
				if cdnURL, err := utils.UploadLocalFileToBunnyCDN(posterPath, "temp-media/"+filepath.Base(posterPath), "image/jpeg"); err != nil {
					log.Printf("⚠️ [Async] Poster CDN upload failed for temp item %d: %v", itemID, err)
				} else {
					posterCDNURL = cdnURL
					os.Remove(posterPath)
				}
			}
			if err := DB.Model(&models.TemporaryMediaItem{}).Where("id = ?", itemID).Update("poster_url", posterCDNURL).Error; err != nil {
				log.Printf("❌ [Async] Failed to update poster_url for temp item %d: %v", itemID, err)
			} else {
				log.Printf("✅ [Async] Poster updated for temp item %d: %s", itemID, posterCDNURL)
			}

			// 2. Upload video to CDN; update file_path so cleanup targets CDN
			videoCDNURL, err := utils.UploadLocalFileToBunnyCDN(videoPath, "temp-media/"+uniqueFilename, mimeType)
			if err != nil {
				log.Printf("⚠️ [Async] Video CDN upload failed for temp item %d: %v", itemID, err)
				return
			}
			if err := DB.Model(&models.TemporaryMediaItem{}).Where("id = ?", itemID).Update("file_path", videoCDNURL).Error; err != nil {
				log.Printf("❌ [Async] Failed to update file_path for temp item %d: %v", itemID, err)
			} else {
				log.Printf("✅ [Async] CDN upload complete for temp item %d: %s", itemID, videoCDNURL)
				os.Remove(videoPath)
			}
		}(newTempMediaItem.ID, filePath, posterPath, getMimeType(ext), uniqueFilename)

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
			"poster_url":    newTempMediaItem.PosterURL,       // ✅ poster URL
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
			PosterURL:    posterURL,
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

		// ✅ ASYNC POSTER + CDN UPLOAD (don't block response)
		go func(itemID uint, videoPath, posterPath, mimeType, uniqueFilename string) {
			// 1. Generate poster
			posterCDNURL := fmt.Sprintf("/uploads/%s", filepath.Base(posterPath))
			if err := utils.ExtractThumbnail(videoPath, posterPath); err != nil {
				log.Printf("⚠️ [Async] Poster generation failed for item %d: %v", itemID, err)
			} else {
				if cdnURL, err := utils.UploadLocalFileToBunnyCDN(posterPath, "media/"+filepath.Base(posterPath), "image/jpeg"); err != nil {
					log.Printf("⚠️ [Async] Poster CDN upload failed for item %d: %v", itemID, err)
				} else {
					posterCDNURL = cdnURL
					os.Remove(posterPath)
				}
			}
			if err := DB.Model(&models.MediaItem{}).Where("id = ?", itemID).Update("poster_url", posterCDNURL).Error; err != nil {
				log.Printf("❌ [Async] Failed to update poster_url for item %d: %v", itemID, err)
			} else {
				log.Printf("✅ [Async] Poster updated for item %d: %s", itemID, posterCDNURL)
			}

			// 2. Upload video to CDN; update file_path so cleanup targets CDN
			videoCDNURL, err := utils.UploadLocalFileToBunnyCDN(videoPath, "media/"+uniqueFilename, mimeType)
			if err != nil {
				log.Printf("⚠️ [Async] Video CDN upload failed for item %d: %v", itemID, err)
				return
			}
			if err := DB.Model(&models.MediaItem{}).Where("id = ?", itemID).Update("file_path", videoCDNURL).Error; err != nil {
				log.Printf("❌ [Async] Failed to update file_path for item %d: %v", itemID, err)
			} else {
				log.Printf("✅ [Async] CDN upload complete for item %d: %s", itemID, videoCDNURL)
				os.Remove(videoPath)
			}
		}(newMediaItem.ID, filePath, posterPath, getMimeType(ext), uniqueFilename)

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
			"poster_url":    newMediaItem.PosterURL,
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

// ConfirmUploadInput is the JSON body for POST /api/rooms/:id/upload/confirm
type ConfirmUploadInput struct {
	CDNPath      string `json:"cdn_path" binding:"required"`
	CDNURL       string `json:"cdn_url" binding:"required"`
	OriginalName string `json:"original_name" binding:"required"`
	MimeType     string `json:"mime_type"`
	FileSize     int64  `json:"file_size"`
	SessionID    string `json:"session_id"`
	Duration     string `json:"duration"`
}

// ConfirmUploadHandler creates the DB record after a direct BunnyCDN upload.
// The file is already on BunnyCDN — this endpoint only stores metadata.
// POST /api/rooms/:id/upload/confirm
func ConfirmUploadHandler(c *gin.Context) {
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	authenticatedUserID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil || roomID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	roomIDUint := uint(roomID)

	var input ConfirmUploadInput
	if err := c.ShouldBindJSON(&input); err != nil {
		log.Printf("ConfirmUploadHandler: Invalid input: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var room models.Room
	if err := DB.First(&room, roomIDUint).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	ext := strings.ToLower(filepath.Ext(input.OriginalName))
	mimeType := input.MimeType
	if mimeType == "" {
		mimeType = getMimeType(ext)
	}

	isTemporary := input.SessionID != ""
	posterURL := "/icons/placeholder-poster.jpg"

	log.Printf("💾 [ConfirmUpload] roomID=%d userID=%d file=%s isTemp=%v", roomIDUint, authenticatedUserID, input.OriginalName, isTemporary)

	if isTemporary {
		newItem := models.TemporaryMediaItem{
			FileName:     filepath.Base(input.CDNPath),
			OriginalName: input.OriginalName,
			MimeType:     mimeType,
			FileSize:     input.FileSize,
			FilePath:     input.CDNURL,
			PosterURL:    posterURL,
			RoomID:       roomIDUint,
			UploaderID:   authenticatedUserID,
			Duration:     input.Duration,
			OrderIndex:   0,
			SessionID:    input.SessionID,
		}

		if err := DB.Create(&newItem).Error; err != nil {
			log.Printf("❌ [ConfirmUpload] DB create failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save media information"})
			return
		}
		log.Printf("✅ [ConfirmUpload] Created TemporaryMediaItem ID=%d", newItem.ID)

		if pq := services.GetPreviewQueue(); pq != nil {
			pq.QueuePreview(services.PreviewRequest{
				SessionID:        input.SessionID,
				MediaID:          newItem.ID,
				MediaPath:        input.CDNURL,
				IsTemporary:      true,
				CurrentTimestamp: 0,
				MediaType:        services.MediaTypeUpload,
			})
		}

		go func(itemID uint, roomID uint, cdnURL, cdnPath, sid, mimeType string) {
			posterFilename := strings.TrimSuffix(filepath.Base(cdnPath), filepath.Ext(cdnPath)) + "_poster.jpg"
			posterLocalPath := filepath.Join(UploadDir, "temp", posterFilename)
			posterCDNURL := "/icons/placeholder-poster.jpg"

			localVideoPath, err := utils.DownloadFileToTemp(cdnURL, filepath.Ext(cdnPath))
			if err != nil {
				log.Printf("⚠️ [ConfirmUpload Async] Download for poster failed: %v", err)
			} else {
				if err := utils.ExtractThumbnail(localVideoPath, posterLocalPath); err != nil {
					log.Printf("⚠️ [ConfirmUpload Async] Poster extraction failed item %d: %v", itemID, err)
				} else if pURL, err := utils.UploadLocalFileToBunnyCDN(posterLocalPath, "temp-media/"+posterFilename, "image/jpeg"); err != nil {
					log.Printf("⚠️ [ConfirmUpload Async] Poster CDN upload failed: %v", err)
				} else {
					posterCDNURL = pURL
					os.Remove(posterLocalPath)
				}
				os.Remove(localVideoPath)
			}

			if err := DB.Model(&models.TemporaryMediaItem{}).Where("id = ?", itemID).Update("poster_url", posterCDNURL).Error; err != nil {
				log.Printf("❌ [ConfirmUpload Async] poster_url update failed: %v", err)
				return
			}
			log.Printf("✅ [ConfirmUpload Async] Poster set for item %d: %s", itemID, posterCDNURL)

			if sid != "" {
				broadcastData := map[string]interface{}{
					"type": "session_preview_updated", "session_id": sid,
					"poster_url": posterCDNURL, "preview_url": "",
				}
				broadcastJSON, _ := json.Marshal(broadcastData)
				hub.BroadcastToLobby(OutgoingMessage{Data: broadcastJSON, IsBinary: false})
			}
			roomBroadcast := map[string]interface{}{
				"type": "playlist_poster_updated", "item_id": itemID, "poster_url": posterCDNURL,
			}
			roomJSON, _ := json.Marshal(roomBroadcast)
			hub.BroadcastToRoom(roomID, OutgoingMessage{Data: roomJSON, IsBinary: false}, nil)
		}(newItem.ID, roomIDUint, input.CDNURL, input.CDNPath, input.SessionID, mimeType)

		c.JSON(http.StatusCreated, gin.H{
			"message":       "Temporary media item uploaded successfully",
			"media_item_id": newItem.ID, "file_name": newItem.FileName,
			"original_name": newItem.OriginalName, "mime_type": newItem.MimeType,
			"file_size": newItem.FileSize, "file_path": newItem.FilePath,
			"file_url": input.CDNURL, "poster_url": newItem.PosterURL,
			"room_id": newItem.RoomID, "uploader_id": newItem.UploaderID,
			"duration": newItem.Duration, "is_temporary": true, "session_id": input.SessionID,
		})
	} else {
		newItem := models.MediaItem{
			FileName:     filepath.Base(input.CDNPath),
			OriginalName: input.OriginalName,
			MimeType:     mimeType,
			FileSize:     input.FileSize,
			FilePath:     input.CDNURL,
			PosterURL:    posterURL,
			RoomID:       roomIDUint,
			UploaderID:   authenticatedUserID,
			Duration:     input.Duration,
			OrderIndex:   0,
		}

		if err := DB.Create(&newItem).Error; err != nil {
			log.Printf("❌ [ConfirmUpload] DB create failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save media information"})
			return
		}
		log.Printf("✅ [ConfirmUpload] Created MediaItem ID=%d", newItem.ID)

		go func(itemID uint, cdnURL, cdnPath, mimeType string) {
			posterFilename := strings.TrimSuffix(filepath.Base(cdnPath), filepath.Ext(cdnPath)) + "_poster.jpg"
			posterLocalPath := filepath.Join(UploadDir, posterFilename)
			posterCDNURL := "/icons/placeholder-poster.jpg"

			localVideoPath, err := utils.DownloadFileToTemp(cdnURL, filepath.Ext(cdnPath))
			if err != nil {
				log.Printf("⚠️ [ConfirmUpload Async] Download for poster failed: %v", err)
			} else {
				if err := utils.ExtractThumbnail(localVideoPath, posterLocalPath); err != nil {
					log.Printf("⚠️ [ConfirmUpload Async] Poster extraction failed: %v", err)
				} else if pURL, err := utils.UploadLocalFileToBunnyCDN(posterLocalPath, "media/"+posterFilename, "image/jpeg"); err != nil {
					log.Printf("⚠️ [ConfirmUpload Async] Poster CDN upload failed: %v", err)
				} else {
					posterCDNURL = pURL
					os.Remove(posterLocalPath)
				}
				os.Remove(localVideoPath)
			}
			DB.Model(&models.MediaItem{}).Where("id = ?", itemID).Update("poster_url", posterCDNURL)
		}(newItem.ID, input.CDNURL, input.CDNPath, mimeType)

		c.JSON(http.StatusCreated, gin.H{
			"message":    "Media item uploaded successfully",
			"media_item": newItem, "file_name": newItem.FileName,
			"original_name": newItem.OriginalName, "mime_type": newItem.MimeType,
			"file_size": newItem.FileSize, "file_path": newItem.FilePath,
			"file_url": input.CDNURL, "poster_url": newItem.PosterURL,
			"room_id": newItem.RoomID, "uploader_id": newItem.UploaderID,
			"duration": newItem.Duration, "is_temporary": false,
		})
	}
}