// backend/internal/handlers/temporary_media_items.go
package handlers

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	//"encoding/json"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
)

// DeleteSingleTemporaryMediaItemHandler handles DELETE /api/rooms/:id/temporary-media/:item_id
func DeleteSingleTemporaryMediaItemHandler(c *gin.Context) {
	log.Println("DeleteSingleTemporaryMediaItemHandler: Request received")

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
	itemIDStr := c.Param("item_id")

	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil || roomID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	itemID, err := strconv.ParseUint(itemIDStr, 10, 64)
	if err != nil || itemID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid media item ID"})
		return
	}

	// Fetch room to verify host
	var room models.Room
	if err := DB.First(&room, roomID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	if room.HostID != authenticatedUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the host can delete media items"})
		return
	}

	// Fetch the specific temporary media item
	var item models.TemporaryMediaItem
	if err := DB.Where("id = ? AND room_id = ?", itemID, roomID).First(&item).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Media item not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// Delete file
	if err := os.Remove(item.FilePath); err != nil && !os.IsNotExist(err) {
		log.Printf("Warning: failed to delete file %s: %v", item.FilePath, err)
	}
	// Delete thumbnail
	thumbPath := item.FilePath + ".jpg"
	os.Remove(thumbPath)

	// Delete DB record
	if err := DB.Delete(&item).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete media item"})
		return
	}

	// Broadcast deletion
	//message := map[string]interface{}{
	//	"type": "temporary_media_item_deleted",
	//	"data": map[string]interface{}{
	//		"id": item.ID,
	//	},
	//}
	//if msgBytes, err := json.Marshal(message); err == nil {
	//	hub.BroadcastToRoom(uint(roomID), msgBytes)
	//}

	c.JSON(http.StatusOK, gin.H{
		"message": "Temporary media item deleted successfully",
		"id":      item.ID,
	})
}

// GetTemporaryMediaItemsForRoomHandler handles the GET /api/rooms/:id/temporary-media endpoint.
func GetTemporaryMediaItemsForRoomHandler(c *gin.Context) {
	log.Println("GetTemporaryMediaItemsForRoomHandler: Request received")

	userIDValue, exists := c.Get("user_id")
	if !exists {
		log.Println("GetTemporaryMediaItemsForRoomHandler: Unauthorized access, user_id not found in context")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	_, ok := userIDValue.(uint)
	if !ok {
		log.Println("GetTemporaryMediaItemsForRoomHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	roomIDStr := c.Param("id")
	if roomIDStr == "" {
		log.Println("GetTemporaryMediaItemsForRoomHandler: Missing room ID parameter")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Room ID is required"})
		return
	}

	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil || roomID == 0 {
		log.Printf("GetTemporaryMediaItemsForRoomHandler: Invalid room ID format: %s", roomIDStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	roomIDUint := uint(roomID)

	var room models.Room
	result := DB.First(&room, roomIDUint)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			log.Printf("GetTemporaryMediaItemsForRoomHandler: Room with ID %d not found", roomIDUint)
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
			return
		} else {
			log.Printf("GetTemporaryMediaItemsForRoomHandler: Database error fetching room %d: %v", roomIDUint, result.Error)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}
	}

	var temporaryMediaItems []models.TemporaryMediaItem
	result = DB.Where("room_id = ?", roomIDUint).Order("created_at ASC").Find(&temporaryMediaItems)
	if result.Error != nil {
		log.Printf("GetTemporaryMediaItemsForRoomHandler: Database error fetching temporary media items for room %d: %v", roomIDUint, result.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch temporary media items"})
		return
	}

	// ✅ Generate missing posters for old uploads
	for i := range temporaryMediaItems {
		item := &temporaryMediaItems[i]
		
		// Skip if poster already exists and is not placeholder
		if item.PosterURL != "" && item.PosterURL != "/icons/placeholder-poster.jpg" {
			continue
		}
		
		// Generate poster for items without one
		if item.FilePath != "" {
			log.Printf("🎨 Generating missing poster for %s", item.FileName)
			
			posterFilename := fmt.Sprintf("%s_poster.jpg", strings.TrimSuffix(item.FileName, filepath.Ext(item.FileName)))
			posterPath := filepath.Join("./uploads/temp", posterFilename)
			posterURL := fmt.Sprintf("/uploads/temp/%s", posterFilename)
			
			// Check if poster file already exists on disk
			if _, err := os.Stat(posterPath); os.IsNotExist(err) {
				// Generate new poster
				err = utils.ExtractThumbnail(item.FilePath, posterPath)
				if err != nil {
					log.Printf("⚠️ Failed to generate poster for %s: %v", item.FileName, err)
					item.PosterURL = "/icons/placeholder-poster.jpg"
				} else {
					log.Printf("✅ Poster generated: %s", posterPath)
					item.PosterURL = posterURL
				}
			} else {
				// Poster file exists, just update the URL
				log.Printf("✅ Found existing poster on disk: %s", posterPath)
				item.PosterURL = posterURL
			}
			
			// Update database with new poster URL
			DB.Model(item).Update("poster_url", item.PosterURL)
		}
	}

	log.Printf("GetTemporaryMediaItemsForRoomHandler: Fetched %d temporary media items for room %d", len(temporaryMediaItems), roomIDUint)
	c.JSON(http.StatusOK, gin.H{
		"message":              "Temporary media items fetched successfully",
		"count":                len(temporaryMediaItems),
		"temporary_media_items": temporaryMediaItems,
		"room_id":              roomIDUint,
	})
}

// GetTemporaryMediaFileHandler serves the actual media file for a temporary media item.
// Route: GET /api/rooms/:id/temporary-media/:item_id/file
func GetTemporaryMediaFileHandler(c *gin.Context) {
	log.Println("GetTemporaryMediaFileHandler: Request received")

	// ✅ We require auth, but don't yet enforce room membership
	// Just ensure user is authenticated
	if _, exists := c.Get("user_id"); !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	roomIDStr := c.Param("id")
	itemIDStr := c.Param("item_id")

	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil || roomID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	itemID, err := strconv.ParseUint(itemIDStr, 10, 64)
	if err != nil || itemID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid media item ID"})
		return
	}

	// Ensure room exists
	var room models.Room
	if err := DB.First(&room, roomID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// Fetch the media item
	var item models.TemporaryMediaItem
	if err := DB.Where("id = ? AND room_id = ?", itemID, roomID).First(&item).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Media item not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// ✅ Serve the file
	c.Header("Content-Type", item.MimeType)
	c.Header("Accept-Ranges", "bytes")
	c.File(item.FilePath)
}


// DeleteTemporaryMediaItemsForRoomHandler handles the DELETE /api/rooms/:id/temporary-media endpoint.
func DeleteTemporaryMediaItemsForRoomHandler(c *gin.Context) {
	log.Println("DeleteTemporaryMediaItemsForRoomHandler: Request received")

	authenticatedUserIDValue, exists := c.Get("user_id")
	if !exists {
		log.Println("DeleteTemporaryMediaItemsForRoomHandler: Unauthorized access, user_id not found in context")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	authenticatedUserID, ok := authenticatedUserIDValue.(uint)
	if !ok {
		log.Println("DeleteTemporaryMediaItemsForRoomHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	roomIDStr := c.Param("id")
	if roomIDStr == "" {
		log.Println("DeleteTemporaryMediaItemsForRoomHandler: Missing room ID parameter")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Room ID is required"})
		return
	}

	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil || roomID == 0 {
		log.Printf("DeleteTemporaryMediaItemsForRoomHandler: Invalid room ID format: %s", roomIDStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	roomIDUint := uint(roomID)

	var room models.Room
	result := DB.First(&room, roomIDUint)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			log.Printf("DeleteTemporaryMediaItemsForRoomHandler: Room with ID %d not found", roomIDUint)
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
			return
		} else {
			log.Printf("DeleteTemporaryMediaItemsForRoomHandler: Database error fetching room %d: %v", roomIDUint, result.Error)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}
	}

	if room.HostID != authenticatedUserID {
		log.Printf("DeleteTemporaryMediaItemsForRoomHandler: User %d is not the host (HostID: %d) of room %d", authenticatedUserID, room.HostID, roomIDUint)
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can delete temporary media"})
		return
	}

	var temporaryMediaItems []models.TemporaryMediaItem
	result = DB.Where("room_id = ?", roomIDUint).Find(&temporaryMediaItems)
	if result.Error != nil {
		log.Printf("DeleteTemporaryMediaItemsForRoomHandler: Database error fetching temporary media items for room %d: %v", roomIDUint, result.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch temporary media items for deletion"})
		return
	}

	log.Printf("DeleteTemporaryMediaItemsForRoomHandler: Found %d temporary media items to delete for room %d", len(temporaryMediaItems), roomIDUint)

	successCount := 0
	failureCount := 0
	for _, item := range temporaryMediaItems {
		if err := os.Remove(item.FilePath); err != nil && !os.IsNotExist(err) {
			log.Printf("DeleteTemporaryMediaItemsForRoomHandler: Warning - Failed to delete file '%s': %v", item.FilePath, err)
			failureCount++
			continue
		}
		log.Printf("DeleteTemporaryMediaItemsForRoomHandler: Deleted file '%s'", item.FilePath)

		thumbnailPath := item.FilePath + ".jpg"
		if err := os.Remove(thumbnailPath); err != nil && !os.IsNotExist(err) {
			log.Printf("DeleteTemporaryMediaItemsForRoomHandler: Warning - Failed to delete thumbnail '%s': %v", thumbnailPath, err)
		} else {
			log.Printf("DeleteTemporaryMediaItemsForRoomHandler: Deleted thumbnail '%s'", thumbnailPath)
		}

		if result := DB.Delete(&item); result.Error != nil {
			log.Printf("DeleteTemporaryMediaItemsForRoomHandler: Error deleting DB record for item ID %d: %v", item.ID, result.Error)
			failureCount++
		} else {
			log.Printf("DeleteTemporaryMediaItemsForRoomHandler: Deleted DB record for item ID %d", item.ID)
			successCount++
		}
	}

	log.Printf("DeleteTemporaryMediaItemsForRoomHandler: Cleanup complete for room %d. Success: %d, Failures: %d", roomIDUint, successCount, failureCount)
	if failureCount > 0 {
		c.JSON(http.StatusInternalServerError, gin.H{
			"message":  "Temporary media cleanup completed with some errors",
			"success":  successCount,
			"failures": failureCount,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "All temporary media items deleted successfully",
		"count":   successCount,
	})
}