package handlers

import (
	"log"
	"net/http"
	"strconv"
    "os"
    "fmt"
    "time"
    "github.com/google/uuid"
    //"encoding/json"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
)

// CreateRoomInput defines the expected structure for creating a room.
type CreateRoomInput struct {
	Name string `json:"name" binding:"required,min=1,max=100"`
	Description	string	`json:"description" binding:"max=500"`
	// MediaFileName is set later when a file is uploaded not during the initial creation in this MVP step.
	// HostID will be determined from the authenticated user (JWT)
}

// CreateRoomHandler handles the POST /api/rooms endpoint
// It requires authentication (the user ID comes from the JWT context).
func CreateRoomHandler(c *gin.Context) {
    userID, exists := c.Get("user_id")
    if !exists {
        log.Println("CreateRoomHandler: Unauthorized access, user_id not found in context")
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }

    id, ok := userID.(uint)
    if !ok {
        log.Println("CreateRoomHandler: Error asserting user ID type")
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
        return
    }

    var input CreateRoomInput
    if err := c.ShouldBindJSON(&input); err != nil {
        log.Printf("CreateRoomHandler: Error binding input: %v", err)
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // 🔁 BEGIN TRANSACTION
    tx := DB.Begin()
    if tx.Error != nil {
        log.Printf("CreateRoomHandler: Failed to begin transaction: %v", tx.Error)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create room"})
        return
    }

    // Create the room
    newRoom := models.Room{
        Name:        input.Name,
        Description: input.Description,
        HostID:      id,
    }

    if err := tx.Create(&newRoom).Error; err != nil {
        tx.Rollback()
        log.Printf("CreateRoomHandler: Error creating room: %v", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create room"})
        return
    }

    // Create the UserRoom membership
    userRoom := models.UserRoom{
        UserID:   newRoom.HostID,
        RoomID:   newRoom.ID,
        UserRole: "host",
    }

    if err := tx.Create(&userRoom).Error; err != nil {
        tx.Rollback()
        log.Printf("CreateRoomHandler: Error adding host as member: %v", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create room"})
        return
    }

    // ✅ COMMIT TRANSACTION
    if err := tx.Commit().Error; err != nil {
        log.Printf("CreateRoomHandler: Failed to commit transaction: %v", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to finalize room creation"})
        return
    }

    // Success
    log.Printf("CreateRoomHandler: Room created successfully: ID=%d, Name=%s, HostID=%d", newRoom.ID, newRoom.Name, newRoom.HostID)

    c.JSON(http.StatusCreated, gin.H{
        "message": "Room created successfully",
        "room": gin.H{
            "id":              newRoom.ID,
            "name":            newRoom.Name,
            "description":     newRoom.Description,
            "host_id":         newRoom.HostID,
            "media_file_name": newRoom.MediaFileName,
            "playback_state":  newRoom.PlaybackState,
            "playback_time":   newRoom.PlaybackTime,
            "created_at":      newRoom.CreatedAt,
        },
    })
}

// Handle Ending the watch session
func EndWatchSessionHandler(c *gin.Context) {
	// ✅ FIX: Use "session_id" to match route :session_id
	sessionID := c.Param("session_id")
	if sessionID == "" {
		log.Println("EndWatchSessionHandler: Missing session_id in URL")
		c.JSON(http.StatusBadRequest, gin.H{"error": "session_id is required"})
		return
	}

	userID := c.MustGet("user_id").(uint)

	var session models.WatchSession
	if err := DB.Where("session_id = ? AND host_id = ?", sessionID, userID).First(&session).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("EndWatchSessionHandler: Session %s not found or user %d is not host", sessionID, userID)
		} else {
			log.Printf("EndWatchSessionHandler: DB error: %v", err)
		}
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the host can end this session"})
		return
	}

	// 🔁 Use transaction for data consistency
	tx := DB.Begin()
	if tx.Error != nil {
		log.Printf("EndWatchSessionHandler: Failed to start transaction: %v", tx.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to end session"})
		return
	}

	// Mark session as ended
	now := time.Now()
	session.EndedAt = &now
	if err := tx.Save(&session).Error; err != nil {
		tx.Rollback()
		log.Printf("EndWatchSessionHandler: Failed to update session: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to end session"})
		return
	}

	// Delete temporary media files and records
	var tempItems []models.TemporaryMediaItem
	if err := tx.Where("session_id = ?", sessionID).Find(&tempItems).Error; err != nil {
		tx.Rollback()
		log.Printf("EndWatchSessionHandler: Failed to fetch temp media: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clean up media"})
		return
	}

	for _, item := range tempItems {
		if err := os.Remove(item.FilePath); err != nil && !os.IsNotExist(err) {
			log.Printf("⚠️ EndWatchSessionHandler: Failed to delete file %s: %v", item.FilePath, err)
		}
		if err := tx.Delete(&item).Error; err != nil {
			log.Printf("⚠️ EndWatchSessionHandler: Failed to delete DB record for %s: %v", item.FilePath, err)
			// Continue cleanup even if one delete fails
		}
	}
	// Delete room if it's temporary
	var room models.Room
	if err := tx.First(&room, session.RoomID).Error; err != nil {
		if err != gorm.ErrRecordNotFound {
			log.Printf("EndWatchSessionHandler: DB error fetching room %d: %v", session.RoomID, err)
		}
		// Don't rollback — room may have been deleted already
	} else if room.IsTemporary {
		if err := tx.Delete(&models.Room{}, room.ID).Error; err != nil {
			log.Printf("⚠️ EndWatchSessionHandler: Failed to delete temporary room %d: %v", room.ID, err)
			// Still commit — session cleanup is more important
		} else {
			log.Printf("🗑️ Deleted temporary room %d after session end", room.ID)
		}
	}
	if err := tx.Commit().Error; err != nil {
		log.Printf("EndWatchSessionHandler: Transaction commit failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Session ended but cleanup incomplete"})
		return
	}

	log.Printf("✅ Session %s ended successfully by host %d", sessionID, userID)
	c.JSON(http.StatusOK, gin.H{"message": "Session ended"})
}

// Cleanup Session
// Cleanup Session (called on host disconnect)
func cleanupSession(sessionID string, roomID uint) {
	if sessionID == "" {
		log.Println("cleanupSession: Called with empty sessionID — skipping")
		return
	}

	log.Printf("🧹 Starting cleanup for session: %s", sessionID)

    // 🔒 Only clean up if room is temporary
    var room models.Room
    if DB.First(&room, roomID).Error != nil || !room.IsTemporary {
        log.Printf("cleanupSession: Skipping cleanup for non-temporary room %d", roomID)
        return
    }

    // ✅ ONLY clean up temporary rooms
    if !room.IsTemporary {
        log.Printf("cleanupSession: Skipping cleanup for REGULAR room %d (session %s) — not temporary", roomID, sessionID)
        return
    }

    log.Printf("🧹 CLEANING UP TEMPORARY session: %s (room %d)", sessionID, roomID)


	tx := DB.Begin()
	if tx.Error != nil {
		log.Printf("cleanupSession: Failed to start transaction: %v", tx.Error)
		return
	}

	// Delete temporary media
	var tempItems []models.TemporaryMediaItem
	tx.Where("session_id = ?", sessionID).Find(&tempItems)
	for _, item := range tempItems {
		if err := os.Remove(item.FilePath); err != nil && !os.IsNotExist(err) {
			log.Printf("⚠️ cleanupSession: Failed to delete temp file: %s", item.FilePath)
		}
		tx.Delete(&item)
	}

	// Mark session as ended
	var session models.WatchSession
	if tx.Where("session_id = ?", sessionID).First(&session).Error == nil {
		now := time.Now()
		session.EndedAt = &now
		tx.Save(&session)
	}

	

	if err := tx.Commit().Error; err != nil {
		log.Printf("cleanupSession: Transaction commit failed: %v", err)
	}
}

// CleanupExpiredSessions removes watch sessions and temp media older than 30 minutes.
// It does NOT require hub.IsHostActive() unless you've implemented session tracking.
// CleanupExpiredSessions removes watch sessions and temp media older than 30 minutes.
func CleanupExpiredSessions() {
	var sessions []models.WatchSession
	cutoff := time.Now().Add(-30 * time.Minute)

	DB.Joins("JOIN rooms ON watch_sessions.room_id = rooms.id").
        Where("watch_sessions.ended_at IS NULL AND watch_sessions.started_at < ? AND rooms.is_temporary = ?", cutoff, true).
        Find(&sessions)

	for _, s := range sessions {
		log.Printf("🧹 Cleaning up expired session: %s", s.SessionID)

		tx := DB.Begin()
		if tx.Error != nil {
			log.Printf("CleanupExpiredSessions: Failed to start transaction for session %s", s.SessionID)
			continue
		}
		// Delete temp media
		var items []models.TemporaryMediaItem
		tx.Where("session_id = ?", s.SessionID).Find(&items)
		for _, item := range items {
			if err := os.Remove(item.FilePath); err != nil && !os.IsNotExist(err) {
				log.Printf("⚠️ CleanupExpiredSessions: Failed to delete file: %s", item.FilePath)
			}
			tx.Delete(&item)
		}
		// Mark session as ended
		now := time.Now()
		s.EndedAt = &now
		tx.Save(&s)

		// Delete room if temporary
		var room models.Room
		if tx.First(&room, s.RoomID).Error == nil && room.IsTemporary {
			tx.Delete(&models.Room{}, s.RoomID)
			log.Printf("🗑️ Deleted temporary room %d", s.RoomID)
		}
		if err := tx.Commit().Error; err != nil {
			log.Printf("CleanupExpiredSessions: Failed to commit cleanup for session %s: %v", s.SessionID, err)
		}
	}
}

// GenerateLiveKitTokenHandler returns a LiveKit access token for the room
func GenerateLiveKitTokenHandler(c *gin.Context) {
	log.Printf("🎫 [LiveKit] GenerateLiveKitTokenHandler called for room %s", c.Param("id"))
	
	userIDVal, exists := c.Get("user_id")
	log.Printf("🔍 [LiveKit] user_id exists=%v, value=%v", exists, userIDVal)
	if !exists {
		log.Printf("❌ [LiveKit] Unauthorized: no user_id in context")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID, ok := userIDVal.(uint)
	if !ok {
		log.Printf("❌ [LiveKit] Invalid user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user ID"})
		return
	}

	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		log.Printf("❌ [LiveKit] Invalid room ID: %s", roomIDStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	log.Printf("🔑 [LiveKit] User %d requesting token for room %d", userID, roomID)

	// Verify user is a member of the room
	var userRoom models.UserRoom
	if err := DB.Where("user_id = ? AND room_id = ?", userID, roomID).First(&userRoom).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not a member of this room"})
		return
	}

	// Get room to check if user is host
	var room models.Room
	if err := DB.First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	isHost := room.HostID == userID
	identity := "user-" + strconv.FormatUint(uint64(userID), 10)
	roomName := "room-" + roomIDStr

	log.Printf("🎬 [LiveKit] Generating token: room=%s, identity=%s, isHost=%v", roomName, identity, isHost)

	token, err := utils.GenerateLiveKitToken(roomName, identity, isHost)
	if err != nil {
		log.Printf("❌ [LiveKit] Failed to generate token: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	livekitURL := os.Getenv("LIVEKIT_URL")
	log.Printf("✅ [LiveKit] Token generated successfully. URL=%s", livekitURL)

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"url":   livekitURL,
	})
}

// For Instant Watch Parties
// CreateInstantWatchHandler handles POST /api/instant-watch
func CreateInstantWatchHandler(c *gin.Context) {
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// 🔁 BEGIN TRANSACTION
	tx := DB.Begin()
	if tx.Error != nil {
		log.Printf("CreateInstantWatchHandler: Failed to begin transaction: %v", tx.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	// Create temporary room
	roomName := fmt.Sprintf("Instant Watch – %s", time.Now().Format("15:04"))
	newRoom := models.Room{
		Name:        roomName,
		Description: "Temporary session – auto-deleted after use",
		HostID:      userID,
		IsTemporary: true,
	}

	if err := tx.Create(&newRoom).Error; err != nil {
		tx.Rollback()
		log.Printf("CreateInstantWatchHandler: Error creating room: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	// Add user as member
	userRoom := models.UserRoom{
		UserID:   userID,
		RoomID:   newRoom.ID,
		UserRole: "host",
	}

	if err := tx.Create(&userRoom).Error; err != nil {
		tx.Rollback()
		log.Printf("CreateInstantWatchHandler: Error creating UserRoom: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	// Create watch session
	sessionUUID := uuid.New().String()
	watchSession := models.WatchSession{
		SessionID: sessionUUID,
		RoomID:    newRoom.ID,
		HostID:    userID,
		StartedAt: time.Now(),
	}

	if err := tx.Create(&watchSession).Error; err != nil {
		tx.Rollback()
		log.Printf("CreateInstantWatchHandler: Error creating WatchSession: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	// ✅ COMMIT TRANSACTION
	if err := tx.Commit().Error; err != nil {
		log.Printf("CreateInstantWatchHandler: Failed to commit transaction: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to finalize session"})
		return
	}

	// Success
	c.JSON(http.StatusCreated, gin.H{
		"room_id":    newRoom.ID,
		"session":    watchSession,
		"message":    "Instant watch session created",
	})
}



// GetRoomsHandler handles the GET /api/rooms endpoint
// This could return a list of public rooms/rooms the user is a part of
// For MVP simplicity, lets return all rooms for now
// Will require authentication
func GetRoomsHandler(c *gin.Context) {
    log.Println("🚨🚨🚨 GetRoomsHandler CALLED 🚨🚨🚨")
	// 1. Get the authenticated user's ID (optional for listing, but good to know who is asking)
	// _, exists := c.Get("user_id")
	// if !exists {
	//	 log.Println("GetRoomsHandler: Unauthorized access, user_id not found in context")
	//	 c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
	//	 return
	// }
	// For now, we'll allow listing even without strict user context for simplicity.

	// Query the database for rooms
	// Use GORM's find method to get all rooms
	var rooms []models.Room
	// Example: Get all rooms. You can add conditions, limits, offsets for pagination.
	// result := DB.Find(&rooms)
	// Example: Get first 10 rooms ordered by creation date (newest first)
	result := DB.Order("created_at DESC").Limit(10).Find(&rooms)
	if result.Error != nil {
		log.Printf("GetRoomsHandler: Error fetching rooms from the database: %v", result.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error":"Failed to fetch rooms"})
		return
	}

	// Create a slice of simplified room data to return
	roomsResponse := make([]gin.H, len(rooms))
	for i, room := range rooms {
		roomsResponse[i] = gin.H{
			"id":              room.ID,
			"name":            room.Name,
			"description":     room.Description,
			"host_id":         room.HostID,
			"media_file_name": room.MediaFileName, // Show if a file is associated
			"playback_state":  room.PlaybackState,
			"playback_time":   room.PlaybackTime,
			"created_at":      room.CreatedAt,
			"currently_playing": room.CurrentlyPlaying,
			"coming_next": room.ComingNext,
			"is_screen_sharing": room.IsScreenSharing,
		}
	}

	// Respond with the list of rooms.
	log.Printf("GetRoomsHandler: Fetched %d rooms", len(rooms))
	c.JSON(http.StatusOK, gin.H {
		"message": "Rooms fetched successfully",
		"count":   len(rooms),
		"rooms":   roomsResponse,
	})
}

// WeWatch/backend/internal/handlers/rooms.go

// GetRoomMembersHandler handles the GET /api/rooms/:id/members endpoint
func GetRoomMembersHandler(c *gin.Context) {
    // 1. Get RoomID from the URL Parameter
    roomIDStr := c.Param("id")
    if roomIDStr == "" {
        log.Println("GetRoomMembersHandler: Missing room ID parameter")
        c.JSON(http.StatusBadRequest, gin.H{"error": "Room ID is required"})
        return
    }

    // 2. Convert room ID to uint
    roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
    if err != nil || roomID == 0 {
        log.Printf("GetRoomMembersHandler: Invalid room ID format: %s", roomIDStr)
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
        return
    }
    roomIDUint := uint(roomID)

    // 3. Check if the room exists
    var room models.Room
    result := DB.First(&room, roomIDUint)
    if result.Error != nil {
        if result.Error == gorm.ErrRecordNotFound {
            log.Printf("GetRoomMembersHandler: Room with ID %d not found", roomIDUint)
            c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
            return
        } else {
            log.Printf("GetRoomMembersHandler: Database error fetching room %d: %v", roomIDUint, result.Error)
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
            return
        }
    }

    // 4. NEW APPROACH: Count all users who have a UserRoom entry for this room
    // This is the proper way to get room members
    var userRooms []models.UserRoom
    result = DB.Where("room_id = ?", roomIDUint).Preload("User").Find(&userRooms)
    if result.Error != nil {
        log.Printf("GetRoomMembersHandler: Error fetching user rooms for room %d: %v", roomIDUint, result.Error)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error fetching members"})
        return
    }

    // 5. Prepare response with proper member information
    memberList := make([]map[string]interface{}, len(userRooms))
    for i, userRoom := range userRooms {
        // Check if this is the host user
        isHost := userRoom.UserID == room.HostID
        
        memberList[i] = map[string]interface{}{
            "id":        userRoom.UserID,
            "username":  userRoom.User.Username, // This should work now with Preload
            "is_host":   isHost,
            "user_role": userRoom.UserRole,      // Now we can access the role!
        }
    }

    // 6. Return response
    c.JSON(http.StatusOK, gin.H{
        "members": memberList,
        "count":   len(memberList),
    })
}


// Add this handler to update media item order
// UpdateMediaOrderHandler handles PUT /api/rooms/:id/media/order
func UpdateMediaOrderHandler(c *gin.Context) {
    roomIDStr := c.Param("id")
    if roomIDStr == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Room ID is required"})
        return
    }
    
    // Get authenticated user ID
    userIDValue, exists := c.Get("user_id")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }
    
    // Convert user ID to uint
    userID, ok := userIDValue.(uint)
    if !ok {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
        return
    }
    
    // Convert room ID to uint
    roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
    if err != nil || roomID == 0 {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
        return
    }
    
    // Check if user is the host
    var room models.Room
    result := DB.First(&room, uint(roomID))
    if result.Error != nil {
        if result.Error == gorm.ErrRecordNotFound {
            c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
            return
        } else {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
            return
        }
    }
    
    if room.HostID != userID {
        c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can reorder media"})
        return
    }
    
    // Parse the order updates
    var orderUpdates []struct {
        ID        uint `json:"id"`
        OrderIndex int `json:"order_index"`
    }
    
    if err := c.ShouldBindJSON(&orderUpdates); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid order data"})
        return
    }
    
    // Update each media item's order index
    for _, update := range orderUpdates {
        var mediaItem models.MediaItem
        result := DB.First(&mediaItem, update.ID)
        if result.Error == nil {
            mediaItem.OrderIndex = update.OrderIndex
            DB.Save(&mediaItem)
        }
    }
    
    c.JSON(http.StatusOK, gin.H{
        "message": "Media order updated successfully",
    })
}



// UpdateRoomLoopModeHandler handles PUT /api/rooms/:id/loop-mode
func UpdateRoomLoopModeHandler(c *gin.Context) {
    roomIDStr := c.Param("id")
    if roomIDStr == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Room ID is required"})
        return
    }
    
    // Get authenticated user ID
    userIDValue, exists := c.Get("user_id")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }
    
    // Convert user ID to uint
    userID, ok := userIDValue.(uint)
    if !ok {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
        return
    }
    
    // Convert room ID to uint
    roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
    if err != nil || roomID == 0 {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
        return
    }
    
    // Check if user is the host
    var room models.Room
    result := DB.First(&room, uint(roomID))
    if result.Error != nil {
        if result.Error == gorm.ErrRecordNotFound {
            c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
            return
        } else {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
            return
        }
    }
    
    if room.HostID != userID {
        c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can change loop mode"})
        return
    }
    
    // Parse the loop mode
    var loopData struct {
        LoopMode string `json:"loop_mode"`
    }
    
    if err := c.ShouldBindJSON(&loopData); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid loop mode data"})
        return
    }
    
    // Validate loop mode
    validModes := map[string]bool{
        "none": true, "playlist-once": true, "playlist-infinite": true,
    }
    
    if !validModes[loopData.LoopMode] {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid loop mode"})
        return
    }
    
    // Update room loop mode
    room.LoopMode = loopData.LoopMode
    result = DB.Save(&room)
    if result.Error != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update loop mode"})
        return
    }
    
    c.JSON(http.StatusOK, gin.H{
        "message": "Loop mode updated successfully",
        "loop_mode": room.LoopMode,
    })
}




// DeleteRoomHandler handles DELETE /api/rooms/:id
func DeleteRoomHandler(c *gin.Context) {
    // Get room ID from URL parameter
    roomIDStr := c.Param("id")
    if roomIDStr == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Room ID is required"})
        return
    }
    
    // Get authenticated user ID from context (set by AuthMiddleware)
    userIDValue, exists := c.Get("user_id")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }
    
    // Convert user ID to uint
    userID, ok := userIDValue.(uint)
    if !ok {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
        return
    }
    
    // Convert room ID to uint
    roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
    if err != nil || roomID == 0 {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
        return
    }
    
    // Check if user is the host of this room
    var room models.Room
    result := DB.First(&room, uint(roomID))
    if result.Error != nil {
        if result.Error == gorm.ErrRecordNotFound {
            c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
            return
        } else {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
            return
        }
    }
    
    // Verify user is the host
    if room.HostID != userID {
        c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can delete the room"})
        return
    }
    
    // Delete the room
    result = DB.Delete(&room, uint(roomID))
    if result.Error != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete room"})
        return
    }
    
    // Also delete related records (optional but recommended)
    // Delete all media items in the room
    DB.Where("room_id = ?", uint(roomID)).Delete(&models.MediaItem{})
    
    // Delete all user room relationships
    DB.Where("room_id = ?", uint(roomID)).Delete(&models.UserRoom{})
    
    c.JSON(http.StatusOK, gin.H{
        "message": "Room deleted successfully",
    })
}


// UpdateRoomStatusHandler handles PUT /api/rooms/:id/status
// UpdateRoomStatusHandler updates room status including screen sharing state
func UpdateRoomStatusHandler(c *gin.Context) {
	// Get room ID from URL parameter
	roomIDStr := c.Param("id")
	if roomIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Room ID is required"})
		return
	}

	// Get authenticated user ID from context
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	// Convert user ID to uint
	userID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Convert room ID to uint
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil || roomID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	roomIDUint := uint(roomID)

	// Check if user is the host of this room
	var room models.Room
	result := DB.First(&room, roomIDUint)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
			return
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}
	}

	// Verify user is the host
	if room.HostID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can update room status"})
		return
	}

	// Parse the status update data
	var statusData struct {
		CurrentlyPlaying     string `json:"currently_playing"`
		ComingNext           string `json:"coming_next"`
		IsScreenSharing      bool   `json:"is_screen_sharing"`           // ✅ bool, not string
		ScreenSharingUserID  uint   `json:"screen_sharing_user_id"`      // ✅ include user ID
	}

	if err := c.ShouldBindJSON(&statusData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid status data"})
		return
	}

	// Update the room with new status
	room.CurrentlyPlaying = statusData.CurrentlyPlaying
	room.ComingNext = statusData.ComingNext
	room.IsScreenSharing = statusData.IsScreenSharing
	room.ScreenSharingUserID = statusData.ScreenSharingUserID

	// Save the updated room
	result = DB.Save(&room)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update room status"})
		return
	}

	

	//if hub != nil {
	//	if broadcastBytes, err := json.Marshal(broadcastMsg); err == nil {
	//		hub.BroadcastToRoom(roomIDUint, broadcastBytes)
	//	}
	//}

	c.JSON(http.StatusOK, gin.H{
		"message": "Room status updated successfully",
		"room": gin.H{
			"id":                    room.ID,
			"currently_playing":     room.CurrentlyPlaying,
			"coming_next":           room.ComingNext,
			"is_screen_sharing":     room.IsScreenSharing,
			"screen_sharing_user_id": room.ScreenSharingUserID,
		},
	})
}

// This handles overriding the default settings in a room
// UpdateRoomOverridesHandler handles PUT /api/rooms/:id/overrides
func UpdateRoomOverridesHandler(c *gin.Context) {
    // Get room ID from URL parameter
    roomIDStr := c.Param("id")
    if roomIDStr == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Room ID is required"})
        return
    }
    
    // Get authenticated user ID from context
    userIDValue, exists := c.Get("user_id")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }
    
    // Convert user ID to uint
    userID, ok := userIDValue.(uint)
    if !ok {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
        return
    }
    
    // Convert room ID to uint
    roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
    if err != nil || roomID == 0 {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
        return
    }
    
    // Check if user is the host of this room
    var room models.Room
    result := DB.First(&room, uint(roomID))
    if result.Error != nil {
        if result.Error == gorm.ErrRecordNotFound {
            c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
            return
        } else {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
            return
        }
    }
    
    // Verify user is the host
    if room.HostID != userID {
        c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can update overrides"})
        return
    }
    
    // Parse the override data
    var overrideData struct {
        CurrentlyPlaying string `json:"currently_playing"`
        ComingNext       string `json:"coming_next"`
    }
    
    if err := c.ShouldBindJSON(&overrideData); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid override data"})
        return
    }
    
    // Update the room with override values
    room.CurrentlyPlaying = overrideData.CurrentlyPlaying
    room.ComingNext = overrideData.ComingNext
    
    // Save the updated room
    result = DB.Save(&room)
    if result.Error != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update room overrides"})
        return
    }
    
    // Broadcast the update to all room members
    // This would be handled by your WebSocket system
    
    c.JSON(http.StatusOK, gin.H{
        "message": "Room overrides updated successfully",
        "room": gin.H{
            "id":                  room.ID,
            "currently_playing":   room.CurrentlyPlaying,
            "coming_next":         room.ComingNext,
        },
    })
}

// GetActiveSessionHandler returns active session_id if one exists
func GetActiveSessionHandler(c *gin.Context) {
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	var session models.WatchSession
	// Find active (not ended) session for this room
	err = DB.Where("room_id = ? AND ended_at IS NULL", roomID).
		Order("started_at DESC").
		First(&session).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusOK, gin.H{"session_id": nil})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"session_id": session.SessionID})
}

// CreateWatchSessionForRoomHandler creates a WatchSession for a persistent room
func CreateWatchSessionForRoomHandler(c *gin.Context) {
	userID := c.MustGet("user_id").(uint)
	roomID, _ := strconv.ParseUint(c.Param("id"), 10, 64)

	// Verify user is host
	var room models.Room
	if err := DB.First(&room, roomID).Error; err != nil {
		c.JSON(404, gin.H{"error": "Room not found"})
		return
	}
	if room.HostID != userID {
		c.JSON(403, gin.H{"error": "Only host can start session"})
		return
	}

	// Create session
	sessionID := uuid.New().String()
	session := models.WatchSession{
		SessionID: sessionID,
		RoomID:    uint(roomID),
		HostID:    userID,
		StartedAt: time.Now(),
	}
	DB.Create(&session)

	c.JSON(201, gin.H{"session_id": sessionID})
}

// GetRoomHandler handles the GET /api/rooms/:id endpoint
//Fetches details for a specific room by its ID
// This requires authentication
func GetRoomHandler(c *gin.Context) {
	// Get the room id from the URL parameter
	// c.Param("id") returns a string
	roomIDStr := c.Param("id")
	if roomIDStr 	== ""{
		log.Println("GetRoomHandler: Missing room ID parameter")
		c.JSON(http.StatusBadRequest, gin.H{"error":"Room ID is required"})
		return
	}

	// Convert the string id to a uint
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64) //Parse as uint64 first
	if err != nil || roomID == 0 {                      // Check for conversion error or invalid ID (0)
		log.Printf("GetRoomHandler: Invalid room ID format: %s", roomIDStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
}

	// Convert the uint64 to uint
	roomIDUint := uint(roomID)


	// Query the database for the specific room by ID
	var room models.Room
	result := DB.First(&room, roomIDUint) // Find by primary key
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			log.Printf("GetRoomHandler: Room with ID %d not found", roomIDUint)
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
			return
		} else {
			log.Printf("GetRoomHandler: Database error fetching room %d: %v", roomIDUint, result.Error)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}
	}

	// 5. Room found. Prepare the response.
	log.Printf("GetRoomHandler: Fetched room: ID=%d, Name=%s", room.ID, room.Name)
	c.JSON(http.StatusOK, gin.H{
		"message": "Room fetched successfully",
		"room": gin.H{
			"id":              room.ID,
			"name":            room.Name,
			"description":     room.Description,
			"host_id":         room.HostID,
			"media_file_name": room.MediaFileName,
			"playback_state":  room.PlaybackState,
			"playback_time":   room.PlaybackTime,
			"created_at":      room.CreatedAt,
            "loop_mode":       room.LoopMode,
            "currently_playing":  room.CurrentlyPlaying, // ✅ Cinema field
            "coming_next":        room.ComingNext,       // ✅ Cinema field
            "is_screen_sharing":  room.IsScreenSharing,  // ✅ Cinema field
			// Add host details or member list later if needed
		},
	})
}
