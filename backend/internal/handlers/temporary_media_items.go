// backend/internal/handlers/temporary_media_items.go
package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

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

	// Delete video file (local or CDN)
	if err := utils.DeleteMediaFile(item.FilePath); err != nil {
		log.Printf("Warning: failed to delete file %s: %v", item.FilePath, err)
	}
	// Delete poster (local or CDN)
	if item.PosterURL != "" && item.PosterURL != "/icons/placeholder-poster.jpg" {
		if err := utils.DeleteMediaFile(item.PosterURL); err != nil {
			log.Printf("Warning: failed to delete poster %s: %v", item.PosterURL, err)
		}
	}

	// Delete DB record
	if err := DB.Delete(&item).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete media item"})
		return
	}

	// Broadcast removal — flat shape (no "data" wrapper), matching playlist_poster_updated
	// and playlist_duration_updated's convention. Without this, only the deleting client's
	// own local playlist state updates; every other connected member keeps showing the
	// dead entry until their next full playlist refetch.
	if broadcastData, err := json.Marshal(map[string]interface{}{
		"type":    "playlist_item_removed",
		"item_id": item.ID,
		"room_id": uint(roomID),
	}); err == nil {
		hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: broadcastData, IsBinary: false}, nil)
	}

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

	// Get active session
	var activeSession models.WatchSession
	var temporaryMediaItems []models.TemporaryMediaItem
	if err := DB.Where("room_id = ? AND ended_at IS NULL", roomIDUint).First(&activeSession).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("GetTemporaryMediaItemsForRoomHandler: No active session for room %d", roomIDUint)
			c.JSON(http.StatusOK, gin.H{
				"room_id":                roomIDUint,
				"count":                  0,
				"temporary_media_items":  []interface{}{},
				"message":                "No active session",
			})
			return
		}
		log.Printf("GetTemporaryMediaItemsForRoomHandler: Database error fetching active session: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch session"})
		return
	}

	// Fetch temporary media items for this session
	result = DB.Where("session_id = ?", activeSession.SessionID).Order("created_at ASC").Find(&temporaryMediaItems)
	if result.Error != nil {
		log.Printf("GetTemporaryMediaItemsForRoomHandler: Database error fetching temporary media items for session %s: %v", activeSession.SessionID, result.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch temporary media items"})
		return
	}

	log.Printf("GetTemporaryMediaItemsForRoomHandler: Fetched %d temporary media items for room %d", len(temporaryMediaItems), roomIDUint)
	c.JSON(http.StatusOK, gin.H{
		"message":              "Temporary media items fetched successfully",
		"count":                len(temporaryMediaItems),
		"temporary_media_items": temporaryMediaItems,
		"room_id":              roomIDUint,
	})
}

// ✅ NEW: GetTemporaryMediaItemsForSessionHandler handles GET /api/sessions/:id/temporary-media
// Fetches temporary media items for a specific session (not room)
func GetTemporaryMediaItemsForSessionHandler(c *gin.Context) {
	log.Println("GetTemporaryMediaItemsForSessionHandler: Request received")

	// Check authentication
	userIDValue, exists := c.Get("user_id")
	if !exists {
		log.Println("GetTemporaryMediaItemsForSessionHandler: Unauthorized access")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	_, ok := userIDValue.(uint)
	if !ok {
		log.Println("GetTemporaryMediaItemsForSessionHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Get session_id from URL parameter
	sessionID := c.Param("id")
	if sessionID == "" {
		log.Println("GetTemporaryMediaItemsForSessionHandler: Missing session ID parameter")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Session ID is required"})
		return
	}

	// Verify session exists
	var session models.WatchSession
	result := DB.Where("session_id = ?", sessionID).First(&session)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			log.Printf("GetTemporaryMediaItemsForSessionHandler: Session %s not found", sessionID)
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}
		log.Printf("GetTemporaryMediaItemsForSessionHandler: Database error: %v", result.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Fetch temporary media items for this session
	var temporaryMediaItems []models.TemporaryMediaItem
	result = DB.Where("session_id = ?", sessionID).Order("created_at ASC").Find(&temporaryMediaItems)
	if result.Error != nil {
		log.Printf("GetTemporaryMediaItemsForSessionHandler: Error fetching items: %v", result.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch temporary media items"})
		return
	}

	// Ensure stream items always have a non-empty poster URL.
	// File-based poster generation is handled exclusively by the upload goroutine;
	// doing it here too caused a race where the goroutine's CDN upload deleted the
	// local file while this handler had already told the client to use the local path.
	for i := range temporaryMediaItems {
		item := &temporaryMediaItems[i]
		if item.IsStream && item.PosterURL == "" {
			item.PosterURL = "/icons/placeholder-poster.jpg"
			DB.Model(item).Update("poster_url", item.PosterURL)
		}
	}

	log.Printf("GetTemporaryMediaItemsForSessionHandler: Fetched %d items for session %s", len(temporaryMediaItems), sessionID)
	c.JSON(http.StatusOK, gin.H{
		"message":               "Temporary media items fetched successfully",
		"count":                 len(temporaryMediaItems),
		"temporary_media_items": temporaryMediaItems,
		"session_id":            sessionID,
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

	// If file is on CDN, redirect; otherwise serve local file
	if strings.HasPrefix(item.FilePath, "http://") || strings.HasPrefix(item.FilePath, "https://") {
		c.Redirect(http.StatusFound, item.FilePath)
		return
	}
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

	// ✅ ONLY return temporary media for the ACTIVE session
	var activeSession models.WatchSession
	if err := DB.Where("room_id = ? AND ended_at IS NULL", roomIDUint).First(&activeSession).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			// No active session = no temporary media to show
			log.Printf("GetTemporaryMediaItemsForRoomHandler: No active session for room %d", roomIDUint)
			c.JSON(http.StatusOK, gin.H{
				"message":              "No active session",
				"count":                0,
				"temporary_media_items": []models.TemporaryMediaItem{},
				"room_id":              roomIDUint,
			})
			return
		}
		log.Printf("GetTemporaryMediaItemsForRoomHandler: Database error fetching active session: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch session"})
		return
	}

	var temporaryMediaItems []models.TemporaryMediaItem
	result = DB.Where("session_id = ?", activeSession.SessionID).Order("created_at ASC").Find(&temporaryMediaItems)
	if result.Error != nil {
		log.Printf("DeleteTemporaryMediaItemsForRoomHandler: Database error fetching temporary media items for room %d: %v", roomIDUint, result.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch temporary media items for deletion"})
		return
	}

	log.Printf("DeleteTemporaryMediaItemsForRoomHandler: Found %d temporary media items to delete for room %d", len(temporaryMediaItems), roomIDUint)

	successCount := 0
	failureCount := 0
	for _, item := range temporaryMediaItems {
		// File-delete failure does NOT skip the DB row delete below — see
		// CleanupAllTemporaryMedia in rooms.go for why (an orphaned row pointing at a
		// dead file is a worse outcome than a leaked file).
		if err := utils.DeleteMediaFile(item.FilePath); err != nil {
			log.Printf("DeleteTemporaryMediaItemsForRoomHandler: Warning - Failed to delete file '%s': %v", item.FilePath, err)
			failureCount++
		} else {
			log.Printf("DeleteTemporaryMediaItemsForRoomHandler: Deleted file '%s'", item.FilePath)
		}

		if item.PosterURL != "" && item.PosterURL != "/icons/placeholder-poster.jpg" {
			if err := utils.DeleteMediaFile(item.PosterURL); err != nil {
				log.Printf("DeleteTemporaryMediaItemsForRoomHandler: Warning - Failed to delete poster '%s': %v", item.PosterURL, err)
			}
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