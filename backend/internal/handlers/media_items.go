// WeWatch/backend/internal/handlers/media_items.go
package handlers

import (
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// GetMediaItemsForRoomHandler handles the GET /api/rooms/:id/media endpoint.
// It requires authentication.
// It fetches the list of media items associated with a specific room.
func GetMediaItemsForRoomHandler(c *gin.Context) {
	// 1. Get the authenticated user's ID from the context (set by AuthMiddleware).
	// userIDInterface, exists := c.Get("user_id")
	userIDValue, exists := c.Get("user_id")
	if !exists {
		log.Println("GetMediaItemsForRoomHandler: Unauthorized access, user_id not found in context")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	_, ok := userIDValue.(uint)
	if !ok {
		log.Println("GetMediaItemsForRoomHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// 2. Get the room ID from the URL parameter (:id).
	roomIDStr := c.Param("id")
	if roomIDStr == "" {
		log.Println("GetMediaItemsForRoomHandler: Missing room ID parameter")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Room ID is required"})
		return
	}

	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil || roomID == 0 {
		log.Printf("GetMediaItemsForRoomHandler: Invalid room ID format: %s", roomIDStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	roomIDUint := uint(roomID)

	// 3. Fetch the room from the database to check existence (and potentially authorization later).
	// For MVP, we assume if the room exists and user is authenticated, they can see media.
	var room models.Room
	result := DB.First(&room, roomIDUint)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			log.Printf("GetMediaItemsForRoomHandler: Room with ID %d not found", roomIDUint)
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
			return
		} else {
			log.Printf("GetMediaItemsForRoomHandler: Database error fetching room %d: %v", roomIDUint, result.Error)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}
	}

	// 4. Authorization Check REMOVED/COMMENTED OUT for MVP.
	// To allow any authenticated user to see media items, we skip the check: room.HostID == authenticatedUserID.
	// If you want to restrict media list visibility to the host ONLY, uncomment the lines below:
	/*
		if room.HostID != authenticatedUserID {
			log.Printf("GetMediaItemsForRoomHandler: User %d is not the host (HostID: %d) of room %d", authenticatedUserID, room.HostID, roomIDUint)
			c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can view media items"})
			return
		}
	*/

	// --- FETCH MEDIA ITEMS LOGIC STARTS HERE (after successful room fetch) ---

	// 5. Query the database for media items associated with the room ID.
	var mediaItems []models.MediaItem
	// Use GORM's Find method with a condition to get media items for the specific room.
	// Example: Get all media items for the room, ordered by creation date (newest first).
	// You can add pagination, filters, limits later.
	result = DB.Where("room_id = ?", roomIDUint).Order("created_at DESC").Find(&mediaItems)
	if result.Error != nil {
		log.Printf("GetMediaItemsForRoomHandler: Database error fetching media items for room %d: %v", roomIDUint, result.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch media items"})
		return
	}

	// 6. Media items fetched successfully!
	log.Printf("GetMediaItemsForRoomHandler: Fetched %d media items for room %d", len(mediaItems), roomIDUint)
	// Respond with the list of media items.
	// Wrap the list in a JSON object for consistency and potential metadata.
	c.JSON(http.StatusOK, gin.H{
		"message":     "Media items fetched successfully",
		"count":       len(mediaItems),
		"media_items": mediaItems, // GORM models will be serialized to JSON
		"room_id":     roomIDUint,
	})
}

// --- Placeholder for Future Handlers ---
// func GetMediaItemHandler(c *gin.Context) { ... } // GET /api/rooms/:id/media/:media_item_id (get details of one item)
// func DeleteMediaItemHandler(c *gin.Context) { ... } // DELETE /api/rooms/:id/media/:media_item_id (delete an item)