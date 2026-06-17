package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/services"
	"wewatch-backend/internal/utils"
)

const ChunkUploadDir = "./uploads/chunks"

// bunnyConfigured returns true when the backend is deployed (not local dev) AND
// BunnyCDN credentials are configured.  Credential presence alone is NOT enough —
// on localhost we always serve from local disk even if the developer has CDN
// credentials in their .env.
func bunnyConfigured() bool {
	return !utils.IsLocalDev() && os.Getenv("BUNNY_ACCESS_KEY") != "" && os.Getenv("BUNNY_STORAGE_ZONE") != ""
}

func init() {
	err := os.MkdirAll(ChunkUploadDir, os.ModePerm)
	if err != nil {
		log.Fatalf("Failed to create chunk upload directory '%s': %v", ChunkUploadDir, err)
	}
	log.Printf("Chunk upload directory '%s' is ready.", ChunkUploadDir)
}

// ChunkUploadHandler handles chunked file uploads
// Route: POST /api/rooms/:id/upload?chunked=true
func ChunkUploadHandler(c *gin.Context) {
	log.Println("🧩 ChunkUploadHandler CALLED")

	// Authentication check
	userIDValue, exists := c.Get("user_id")
	if !exists {
		log.Println("ChunkUploadHandler: Unauthorized access")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	authenticatedUserID, ok := userIDValue.(uint)
	if !ok {
		log.Println("ChunkUploadHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Get room ID
	roomIDStr := c.Param("id")
	if roomIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Room ID is required"})
		return
	}
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil || roomID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	roomIDUint := uint(roomID)

	// Verify room exists
	var room models.Room
	result := DB.First(&room, roomIDUint)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	// Get chunk metadata from form
	chunkIndexStr := c.PostForm("chunk_index")
	totalChunksStr := c.PostForm("total_chunks")
	uploadID := c.PostForm("upload_id")
	fileName := c.PostForm("file_name")
	fileSizeStr := c.PostForm("file_size")

	if uploadID == "" || fileName == "" || chunkIndexStr == "" || totalChunksStr == "" {
		log.Printf("ChunkUploadHandler: Missing required fields")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing required chunk metadata"})
		return
	}

	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chunk index"})
		return
	}

	totalChunks, err := strconv.Atoi(totalChunksStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid total chunks"})
		return
	}

	fileSize, err := strconv.ParseInt(fileSizeStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file size"})
		return
	}

	log.Printf("🧩 [Chunk %d/%d] Received for upload_id: %s", chunkIndex+1, totalChunks, uploadID)

	// Get chunk file from form
	chunkFile, err := c.FormFile("chunk")
	if err != nil {
		log.Printf("ChunkUploadHandler: Error retrieving chunk: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "No chunk provided"})
		return
	}

	// Create upload directory for this upload_id
	uploadDir := filepath.Join(ChunkUploadDir, uploadID)
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		log.Printf("ChunkUploadHandler: Failed to create upload directory: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare storage"})
		return
	}

	// Save chunk with index in filename
	chunkPath := filepath.Join(uploadDir, fmt.Sprintf("chunk_%d", chunkIndex))
	if err := c.SaveUploadedFile(chunkFile, chunkPath); err != nil {
		log.Printf("ChunkUploadHandler: Failed to save chunk: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save chunk"})
		return
	}

	log.Printf("✅ [Chunk %d/%d] Saved successfully", chunkIndex+1, totalChunks)

	// Check if this is the last chunk
	if chunkIndex == totalChunks-1 {
		log.Printf("🎯 [Final Chunk] All chunks received, assembling file...")

		// Assemble chunks into final file
		sessionID := c.Query("session_id")
		finalFilePath, err := assembleChunks(uploadDir, fileName, totalChunks, authenticatedUserID, roomIDUint, sessionID, fileSize)
		if err != nil {
			log.Printf("❌ [Assembly] Failed to assemble chunks: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to assemble file: %v", err)})
			return
		}

		// Clean up chunk directory
		if err := os.RemoveAll(uploadDir); err != nil {
			log.Printf("⚠️ [Cleanup] Failed to remove chunk directory: %v", err)
		}

		log.Printf("🎉 [Assembly] File assembled successfully: %s", finalFilePath)
		
		// ✅ CREATE DATABASE ENTRY (CRITICAL FIX - was missing before!)
		log.Printf("💾 [ChunkUpload] Creating database entry...")
		ext := strings.ToLower(filepath.Ext(fileName))
		mimeType := getMimeType(ext)

		// Browsers don't reliably play .mkv via <video> — transcode to MP4 now so playback
		// never depends on container support. No-op (transcoded=false) for any other extension.
		if newPath, newExt, newMime, transcoded := utils.TranscodeMkvToMp4IfNeeded(finalFilePath, ext, mimeType); transcoded {
			finalFilePath = newPath
			ext = newExt
			mimeType = newMime
			if fi, statErr := os.Stat(finalFilePath); statErr == nil {
				fileSize = fi.Size()
			}
		}

		// Get video duration (if video)
		var duration string
		if strings.HasPrefix(mimeType, "video/") {
			if dur, err := utils.GetVideoDuration(finalFilePath); err == nil {
				duration = dur
				log.Printf("📹 [ChunkUpload] Video duration: %s", dur)
			}
		}
		
		// Determine if temporary based on sessionID
		isTemporary := sessionID != ""
		log.Printf("🏷️ [ChunkUpload] isTemporary=%v, sessionID=%s", isTemporary, sessionID)
		
		// Generate poster filename
		posterFilename := strings.TrimSuffix(filepath.Base(finalFilePath), ext) + "_poster.jpg"
		uniqueFilename := filepath.Base(finalFilePath) // ✅ Extract filename from full path
		var posterPath string
		var posterURL string = "/icons/placeholder-poster.jpg" // ✅ Placeholder until async generation completes
		
		if isTemporary {
			posterPath = filepath.Join(UploadDir, "temp", posterFilename)
		} else {
			posterPath = filepath.Join(UploadDir, posterFilename)
		}
		
		if isTemporary {
			// Create TemporaryMediaItem
			newTempMediaItem := models.TemporaryMediaItem{
				FileName:     filepath.Base(finalFilePath),
				OriginalName: fileName,
				MimeType:     mimeType,
				FileSize:     fileSize,
				FilePath:     finalFilePath,
				PosterURL:    posterURL,
				RoomID:       roomIDUint,
				UploaderID:   authenticatedUserID,
				Duration:     duration,
				OrderIndex:   0,
				SessionID:    sessionID,
			}
			
			log.Printf("📝 [ChunkUpload] Creating TemporaryMediaItem: fileName=%s, sessionID=%s", fileName, sessionID)
			result := DB.Create(&newTempMediaItem)
			if result.Error != nil {
				log.Printf("❌ [ChunkUpload] Error creating TemporaryMediaItem: %v", result.Error)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "File uploaded but failed to save temporary media information"})
				return
			}
			
			log.Printf("✅ [ChunkUpload] Created TemporaryMediaItem ID=%d for session %s", newTempMediaItem.ID, sessionID)

			// Queue a preview clip immediately after upload (timestamp 0).
			// This runs independently of the playback_control WS path, which may arrive
			// later or not at all depending on client WS state.
			if sessionID != "" {
				if pq := services.GetPreviewQueue(); pq != nil {
					pq.QueuePreview(services.PreviewRequest{
						SessionID:        sessionID,
						MediaID:          newTempMediaItem.ID,
						MediaPath:        finalFilePath,
						IsTemporary:      true,
						CurrentTimestamp: 0,
						MediaType:        services.MediaTypeUpload,
					})
				}
			}

			// ✅ ASYNC POSTER + CDN UPLOAD
			go func(itemID uint, roomID uint, videoPath, posterPath, sid, mimeType, uniqueFilename string) {
				// 1. Generate poster thumbnail.
				posterURL := "/icons/placeholder-poster.jpg"
				if err := utils.ExtractThumbnail(videoPath, posterPath); err != nil {
					log.Printf("⚠️ [Async] Poster generation failed for temp item %d: %v", itemID, err)
				} else if bunnyConfigured() {
					// Production: upload to CDN and remove local copy.
					if cdnURL, err := utils.UploadLocalFileToBunnyCDN(posterPath, "temp-media/"+filepath.Base(posterPath), "image/jpeg"); err != nil {
						log.Printf("⚠️ [Async] Poster CDN upload failed for temp item %d: %v", itemID, err)
						posterURL = fmt.Sprintf("/uploads/temp/%s", filepath.Base(posterPath))
					} else {
						posterURL = cdnURL
						os.Remove(posterPath)
					}
				} else {
					// Dev: no CDN — serve directly from the Go static handler.
					posterURL = fmt.Sprintf("/uploads/temp/%s", filepath.Base(posterPath))
					log.Printf("📂 [Async] Poster stored locally (no CDN) for temp item %d", itemID)
				}

				if err := DB.Model(&models.TemporaryMediaItem{}).Where("id = ?", itemID).Update("poster_url", posterURL).Error; err != nil {
					log.Printf("❌ [Async] Failed to update poster_url for temp item %d: %v", itemID, err)
				} else {
					log.Printf("✅ [Async] Poster updated for temp item %d: %s", itemID, posterURL)
					if sid != "" {
						broadcastData := map[string]interface{}{
							"type": "session_preview_updated", "session_id": sid,
							"poster_url": posterURL, "preview_url": "",
						}
						broadcastJSON, _ := json.Marshal(broadcastData)
						hub.BroadcastToLobby(OutgoingMessage{Data: broadcastJSON, IsBinary: false})
					}
					roomBroadcast := map[string]interface{}{
						"type": "playlist_poster_updated", "item_id": itemID, "poster_url": posterURL,
					}
					roomJSON, _ := json.Marshal(roomBroadcast)
					hub.BroadcastToRoom(roomID, OutgoingMessage{Data: roomJSON, IsBinary: false}, nil)
				}

				// 2. Upload video to CDN (production only).
				// In dev the video is already playable from the Go static handler.
				if !bunnyConfigured() {
					return
				}
				videoCDNURL, err := utils.UploadLocalFileToBunnyCDN(videoPath, "temp-media/"+uniqueFilename, mimeType)
				if err != nil {
					log.Printf("⚠️ [Async] Video CDN upload failed for temp item %d: %v", itemID, err)
					return
				}
				if err := DB.Model(&models.TemporaryMediaItem{}).Where("id = ?", itemID).Update("file_path", videoCDNURL).Error; err != nil {
					log.Printf("❌ [Async] Failed to update file_path for temp item %d: %v", itemID, err)
				} else {
					log.Printf("✅ [Async] CDN upload complete for temp item %d: %s", itemID, videoCDNURL)
					// Replace the temporary Railway path with the stable CDN URL on all clients.
					// This eliminates the window where clients would try to fetch a path that
					// no longer exists on Railway after the local file is deleted below.
					if cdnBroadcast, err := json.Marshal(map[string]interface{}{
						"type":      "playlist_file_updated",
						"item_id":   itemID,
						"file_path": videoCDNURL,
					}); err == nil {
						hub.BroadcastToRoom(roomID, OutgoingMessage{Data: cdnBroadcast, IsBinary: false}, nil)
					}
					os.Remove(videoPath)
				}
			}(newTempMediaItem.ID, roomIDUint, finalFilePath, posterPath, sessionID, mimeType, uniqueFilename)
			
			// ✅ Construct public URL for browser access
			publicURL := fmt.Sprintf("/uploads/temp/%s", uniqueFilename)

			// Broadcast to room so all connected members add this item to their playlist.
			if broadcastData, err := json.Marshal(map[string]interface{}{
				"type": "temporary_media_item_added",
				"data": map[string]interface{}{
					"id":            newTempMediaItem.ID,
					"file_name":     newTempMediaItem.FileName,
					"original_name": newTempMediaItem.OriginalName,
					"mime_type":     newTempMediaItem.MimeType,
					"file_size":     newTempMediaItem.FileSize,
					"file_path":     publicURL,
					"poster_url":    newTempMediaItem.PosterURL,
					"duration":      newTempMediaItem.Duration,
					"session_id":    sessionID,
					"room_id":       roomIDUint,
					"uploader_id":   newTempMediaItem.UploaderID,
					"is_temporary":  true,
				},
			}); err == nil {
				hub.BroadcastToRoom(roomIDUint, OutgoingMessage{Data: broadcastData, IsBinary: false}, nil)
			}

			log.Printf("🎉 [ChunkUpload] Temporary media item '%s' (ID: %d) uploaded successfully to room %d", newTempMediaItem.FileName, newTempMediaItem.ID, roomIDUint)
			c.JSON(http.StatusCreated, gin.H{
				"message":       "Temporary media item uploaded successfully",
				"media_item_id": newTempMediaItem.ID,
				"file_name":     newTempMediaItem.FileName,
				"original_name": newTempMediaItem.OriginalName,
				"mime_type":     newTempMediaItem.MimeType,
				"file_size":     newTempMediaItem.FileSize,
				"file_path":     newTempMediaItem.FilePath,
				"file_url":      publicURL,
				"poster_url":    newTempMediaItem.PosterURL,
				"room_id":       newTempMediaItem.RoomID,
				"uploader_id":   newTempMediaItem.UploaderID,
				"duration":      newTempMediaItem.Duration,
				"is_temporary":  true,
				"upload_id":     uploadID,
				"session_id":    sessionID,
			})
		} else {
			// Create permanent MediaItem
			newMediaItem := models.MediaItem{
				RoomID:       roomIDUint,
				OriginalName: fileName,
				MimeType:     mimeType,
				FileSize:     fileSize,
				FilePath:     finalFilePath,
				PosterURL:    posterURL,
				UploaderID:   authenticatedUserID,
				OrderIndex:   0,
				Duration:     duration,
			}
			
			log.Printf("📝 [ChunkUpload] Creating MediaItem: fileName=%s, roomID=%d", fileName, roomIDUint)
			result := DB.Create(&newMediaItem)
			if result.Error != nil {
				log.Printf("❌ [ChunkUpload] Error creating MediaItem: %v", result.Error)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "File uploaded but failed to save media information"})
				return
			}
			
			log.Printf("✅ [ChunkUpload] Created MediaItem ID=%d for room %d", newMediaItem.ID, roomIDUint)
			
			// ✅ ASYNC POSTER + CDN UPLOAD
			go func(itemID uint, videoPath, posterPath, mimeType, uniqueFilename string) {
				// 1. Generate poster thumbnail.
				posterURL := "/icons/placeholder-poster.jpg"
				if err := utils.ExtractThumbnail(videoPath, posterPath); err != nil {
					log.Printf("⚠️ [Async] Poster generation failed for item %d: %v", itemID, err)
				} else if bunnyConfigured() {
					if cdnURL, err := utils.UploadLocalFileToBunnyCDN(posterPath, "media/"+filepath.Base(posterPath), "image/jpeg"); err != nil {
						log.Printf("⚠️ [Async] Poster CDN upload failed for item %d: %v", itemID, err)
						posterURL = fmt.Sprintf("/uploads/%s", filepath.Base(posterPath))
					} else {
						posterURL = cdnURL
						os.Remove(posterPath)
					}
				} else {
					posterURL = fmt.Sprintf("/uploads/%s", filepath.Base(posterPath))
					log.Printf("📂 [Async] Poster stored locally (no CDN) for item %d", itemID)
				}
				if err := DB.Model(&models.MediaItem{}).Where("id = ?", itemID).Update("poster_url", posterURL).Error; err != nil {
					log.Printf("❌ [Async] Failed to update poster_url for item %d: %v", itemID, err)
				} else {
					log.Printf("✅ [Async] Poster updated for item %d: %s", itemID, posterURL)
				}

				// 2. Upload video to CDN (production only).
				if !bunnyConfigured() {
					return
				}
				videoCDNURL, err := utils.UploadLocalFileToBunnyCDN(videoPath, "media/"+uniqueFilename, mimeType)
				if err != nil {
					log.Printf("⚠️ [Async] Video CDN upload failed for item %d: %v", itemID, err)
					return
				}
				if err := DB.Model(&models.MediaItem{}).Where("id = ?", itemID).Update("file_path", videoCDNURL).Error; err != nil {
					log.Printf("❌ [Async] Failed to update file_path for item %d: %v", itemID, err)
				} else {
					log.Printf("✅ [Async] CDN upload complete for item %d: %s", itemID, videoCDNURL)
				}
			}(newMediaItem.ID, finalFilePath, posterPath, mimeType, uniqueFilename)
			
			// ✅ Construct public URL for browser access
			publicURL := fmt.Sprintf("/uploads/%s", uniqueFilename)
			
			log.Printf("🎉 [ChunkUpload] Media item '%s' (ID: %d) uploaded successfully to room %d", newMediaItem.FileName, newMediaItem.ID, roomIDUint)
			c.JSON(http.StatusCreated, gin.H{
				"message":       "Media item uploaded successfully",
				"media_item":    newMediaItem,
				"file_name":     newMediaItem.FileName,
				"original_name": newMediaItem.OriginalName,
				"mime_type":     newMediaItem.MimeType,
				"file_size":     newMediaItem.FileSize,
				"file_path":     newMediaItem.FilePath,
				"file_url":      publicURL,
				"poster_url":    newMediaItem.PosterURL,
				"room_id":       newMediaItem.RoomID,
				"uploader_id":   newMediaItem.UploaderID,
				"duration":      newMediaItem.Duration,
				"is_temporary":  false,
				"upload_id":     uploadID,
			})
		}
	} else {
		// Not the last chunk, return progress
		c.JSON(http.StatusOK, gin.H{
			"message":     "Chunk received",
			"upload_id":   uploadID,
			"chunk_index": chunkIndex,
			"total_chunks": totalChunks,
			"progress":    float64(chunkIndex+1) / float64(totalChunks) * 100,
		})
	}
}

// assembleChunks combines all chunks into final file
func assembleChunks(uploadDir, originalFileName string, totalChunks int, uploaderID, roomID uint, sessionID string, fileSize int64) (string, error) {
	// Determine if temporary based on sessionID
	isTemporary := sessionID != ""
	
	// Get file extension
	ext := strings.ToLower(filepath.Ext(originalFileName))
	
	// Use filepath.Base so the name is derived correctly regardless of whether
	// filepath.Join normalised the "./" prefix off ChunkUploadDir.
	uniqueFilename := fmt.Sprintf("%s%s", filepath.Base(uploadDir), ext)
	
	var finalPath string
	if isTemporary {
		tempUploadDir := filepath.Join(UploadDir, "temp")
		if err := os.MkdirAll(tempUploadDir, os.ModePerm); err != nil {
			return "", fmt.Errorf("failed to create temp directory: %v", err)
		}
		finalPath = filepath.Join(tempUploadDir, uniqueFilename)
	} else {
		finalPath = filepath.Join(UploadDir, uniqueFilename)
	}

	// Create final file
	finalFile, err := os.Create(finalPath)
	if err != nil {
		return "", fmt.Errorf("failed to create final file: %v", err)
	}
	defer finalFile.Close()

	// Append chunks in order
	for i := 0; i < totalChunks; i++ {
		chunkPath := filepath.Join(uploadDir, fmt.Sprintf("chunk_%d", i))
		
		chunkFile, err := os.Open(chunkPath)
		if err != nil {
			return "", fmt.Errorf("failed to open chunk %d: %v", i, err)
		}
		
		_, err = io.Copy(finalFile, chunkFile)
		chunkFile.Close()
		
		if err != nil {
			return "", fmt.Errorf("failed to copy chunk %d: %v", i, err)
		}
		
		log.Printf("📋 [Assembly] Chunk %d/%d appended", i+1, totalChunks)
	}

	log.Printf("✅ [Assembly] File assembled: %s (%d bytes)", finalPath, fileSize)

	return finalPath, nil
}

// CleanupOrphanedChunks removes abandoned chunk uploads older than 24 hours
func CleanupOrphanedChunks() {
	// TODO: Implement periodic cleanup of old chunk directories
	// This should be called by session end handler or periodic cron job
}
