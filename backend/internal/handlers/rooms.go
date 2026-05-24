package handlers

import (
	"log"
	"net/http"
	"strconv"
    "os"
    "fmt"
    "time"
    "encoding/json"
    "strings"
    "path/filepath"
    "io"
    "github.com/google/uuid"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/services"
	"wewatch-backend/internal/utils"
)

// CreateRoomInput defines the expected structure for creating a room.
type CreateRoomInput struct {
	Name          string `json:"name" binding:"required,min=1,max=100"`
	Description   string `json:"description" binding:"max=500"`
	IsPublic      *bool  `json:"is_public"`
	ContentRating string `json:"content_rating"`
	RoomType      string `json:"room_type"`
	OtherRoomType string `json:"other_room_type"` // Only used when room_type = "other"
	Handle        string `json:"handle"`
}

// generateRoomHandle slugifies a room name and appends the room ID for uniqueness.
func generateRoomHandle(name string, roomID uint) string {
	slug := ""
	for _, r := range strings.ToLower(name) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			slug += string(r)
		}
	}
	if len(slug) > 16 {
		slug = slug[:16]
	}
	if slug == "" {
		slug = "room"
	}
	return fmt.Sprintf("%s_%d", slug, roomID)
}

// sanitizeHandle lowercases and strips characters that are not alphanumeric or underscore.
func sanitizeHandle(h string) string {
	out := ""
	for _, r := range strings.ToLower(h) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' {
			out += string(r)
		}
	}
	if len(out) > 50 {
		out = out[:50]
	}
	return out
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

    // Fetch the requesting user to check role and existing room ownership
    var requestingUser models.User
    if err := DB.Select("id, role, main_room_id").First(&requestingUser, id).Error; err != nil {
        log.Printf("CreateRoomHandler: Failed to fetch user %d: %v", id, err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
        return
    }

    // Enforce 1-room limit: non-super-admins may only own one permanent room
    if requestingUser.Role != "super_admin" {
        var ownedCount int64
        DB.Model(&models.Room{}).Where("host_id = ? AND is_temporary = false AND deleted_at IS NULL", id).Count(&ownedCount)
        if ownedCount >= 1 {
            log.Printf("CreateRoomHandler: User %d already owns %d room(s) — blocked", id, ownedCount)
            c.JSON(http.StatusForbidden, gin.H{"error": "You already have a room. Build your audience there using room groups and sessions."})
            return
        }
    }

    // 🔁 BEGIN TRANSACTION
    tx := DB.Begin()
    if tx.Error != nil {
        log.Printf("CreateRoomHandler: Failed to begin transaction: %v", tx.Error)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create room"})
        return
    }

    // Create the room
    isPublic := true // Default to public
    if input.IsPublic != nil {
        isPublic = *input.IsPublic
    }
    
    // Validate room type (default to 'general')
    roomType := "general"
    validRoomTypes := []string{"general", "church", "education", "other"}
    if input.RoomType != "" {
        isValidType := false
        for _, rt := range validRoomTypes {
            if input.RoomType == rt {
                isValidType = true
                roomType = rt
                break
            }
        }
        if !isValidType {
            tx.Rollback()
            log.Printf("CreateRoomHandler: Invalid room type: %s", input.RoomType)
            c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room type. Must be one of: general, church, education, other"})
            return
        }
    }

    // Validate and set content rating (default to 'G')
    contentRating := "G"
    if input.ContentRating != "" {
        validRatings := []string{"G", "PG", "Educational", "Religious", "13+", "16+", "18+", "Mature"}
        isValid := false
        for _, rating := range validRatings {
            if input.ContentRating == rating {
                isValid = true
                contentRating = rating
                break
            }
        }
        if !isValid {
            tx.Rollback()
            log.Printf("CreateRoomHandler: Invalid content rating: %s", input.ContentRating)
            c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid content rating. Must be one of: G, PG, Educational, Religious, 13+, 16+, 18+, Mature"})
            return
        }
    }

    // Auto-lock content rating based on room type (overrides any user input)
    if roomType == "church" {
        contentRating = "Religious"
    } else if roomType == "education" {
        contentRating = "Educational"
    }

    otherRoomType := ""
    if roomType == "other" && input.OtherRoomType != "" {
        if len(input.OtherRoomType) > 100 {
            otherRoomType = input.OtherRoomType[:100]
        } else {
            otherRoomType = input.OtherRoomType
        }
    }

    newRoom := models.Room{
        Name:          input.Name,
        Description:   input.Description,
        HostID:        id,
        IsPublic:      isPublic,
        ContentRating: contentRating,
        RoomType:      roomType,
        OtherRoomType: otherRoomType,
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

    // Set main_room_id on the user if not already set
    if requestingUser.MainRoomID == nil {
        if err := DB.Model(&models.User{}).Where("id = ?", id).Update("main_room_id", newRoom.ID).Error; err != nil {
            log.Printf("CreateRoomHandler: Failed to set main_room_id for user %d: %v", id, err)
        } else {
            log.Printf("CreateRoomHandler: Set main_room_id=%d for user %d", newRoom.ID, id)
        }
    }

    // Assign handle: use provided (sanitized) or auto-generate from name + room ID
    handle := sanitizeHandle(input.Handle)
    if handle == "" {
        handle = generateRoomHandle(input.Name, newRoom.ID)
    }
    // Ensure uniqueness — append room ID if collision
    var handleConflict int64
    DB.Model(&models.Room{}).Where("handle = ? AND id != ?", handle, newRoom.ID).Count(&handleConflict)
    if handleConflict > 0 {
        handle = fmt.Sprintf("%s_%d", handle, newRoom.ID)
    }
    if err := DB.Model(&models.Room{}).Where("id = ?", newRoom.ID).Update("handle", handle).Error; err != nil {
        log.Printf("CreateRoomHandler: Failed to set handle for room %d: %v", newRoom.ID, err)
    } else {
        newRoom.Handle = handle
        log.Printf("CreateRoomHandler: Set handle=%s for room %d", handle, newRoom.ID)
    }

    // Broadcast to lobby for real-time room list updates
    lobbyBroadcastData := map[string]interface{}{
        "type":    "room_created",
        "room_id": newRoom.ID,
    }
    lobbyJsonData, _ := json.Marshal(lobbyBroadcastData)
    hub := GetHub()
    if hub != nil {
        hub.BroadcastToLobby(OutgoingMessage{
            Data:     lobbyJsonData,
            IsBinary: false,
        })
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
            "handle":          newRoom.Handle,
            "room_type":       newRoom.RoomType,
            "other_room_type": newRoom.OtherRoomType,
            "media_file_name": newRoom.MediaFileName,
            "playback_state":  newRoom.PlaybackState,
            "playback_time":   newRoom.PlaybackTime,
            "created_at":      newRoom.CreatedAt,
        },
    })
}

// UpdateRoomHandler handles PUT /api/rooms/:id
func UpdateRoomHandler(c *gin.Context) {
	roomID := c.Param("id")
	userID := c.MustGet("user_id").(uint)
	log.Printf("UpdateRoomHandler: User %d attempting to update room %s", userID, roomID)

	var room models.Room
	if err := DB.First(&room, roomID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("UpdateRoomHandler: Room %s not found", roomID)
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		} else {
			log.Printf("UpdateRoomHandler: Database error finding room: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// Check if user is host or super_admin
	var requestingUser models.User
	if err := DB.Select("id, role").First(&requestingUser, userID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}
	if room.HostID != userID && requestingUser.Role != "super_admin" {
		log.Printf("UpdateRoomHandler: User %d is not host of room %d (host is %d)", userID, room.ID, room.HostID)
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can update room settings"})
		return
	}

	// Bind update data
	var input struct {
		Name            string `json:"name"`
		Description     string `json:"description"`
		ShowHost        *bool  `json:"show_host"`
		ShowDescription *bool  `json:"show_description"`
		Handle          string `json:"handle"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		log.Printf("UpdateRoomHandler: Error binding JSON: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	log.Printf("UpdateRoomHandler: Input data: Name=%s, ShowHost=%v, ShowDescription=%v", input.Name, input.ShowHost, input.ShowDescription)

	// Update fields
	if input.Name != "" {
		room.Name = input.Name
	}
	if input.Description != "" {
		room.Description = input.Description
	}
	if input.ShowHost != nil {
		room.ShowHost = *input.ShowHost
		log.Printf("UpdateRoomHandler: Setting ShowHost to %v", *input.ShowHost)
	}
	if input.ShowDescription != nil {
		room.ShowDescription = *input.ShowDescription
	}
	if input.Handle != "" {
		newHandle := sanitizeHandle(input.Handle)
		if newHandle != "" && newHandle != room.Handle {
			var conflict int64
			DB.Model(&models.Room{}).Where("handle = ? AND id != ?", newHandle, room.ID).Count(&conflict)
			if conflict > 0 {
				c.JSON(http.StatusConflict, gin.H{"error": "That handle is already taken"})
				return
			}
			room.Handle = newHandle
		}
	}

	// Save updates
	if err := DB.Save(&room).Error; err != nil {
		log.Printf("UpdateRoomHandler: Failed to save room to database: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to update room: %v", err)})
		return
	}

	log.Printf("UpdateRoomHandler: Room %d updated successfully by user %d", room.ID, userID)
	c.JSON(http.StatusOK, room)
}

// UpdateRoomImageHandler handles PUT /api/rooms/:id/image
// Uploads and updates room profile image (circular avatar)
func UpdateRoomImageHandler(c *gin.Context) {
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		log.Printf("UpdateRoomImageHandler: Invalid room ID: %s", roomIDStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	roomIDUint := uint(roomID)

	// Get authenticated user
	userID, exists := c.Get("user_id")
	if !exists {
		log.Println("UpdateRoomImageHandler: Unauthorized access")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	id := userID.(uint)

	// Fetch room and verify ownership
	var room models.Room
	if err := DB.First(&room, roomIDUint).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("UpdateRoomImageHandler: Room %d not found", roomIDUint)
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		} else {
			log.Printf("UpdateRoomImageHandler: Database error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// Check if user is room host
	if room.HostID != id {
		log.Printf("UpdateRoomImageHandler: User %d is not host of room %d", id, roomIDUint)
		c.JSON(http.StatusForbidden, gin.H{"error": "Only room host can update image"})
		return
	}

	// Get uploaded file
	file, err := c.FormFile("image")
	if err != nil {
		log.Printf("UpdateRoomImageHandler: Error reading file: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Image file is required"})
		return
	}

	// Validate file type (images only)
	ext := ""
	switch file.Header.Get("Content-Type") {
	case "image/jpeg", "image/jpg":
		ext = ".jpg"
	case "image/png":
		ext = ".png"
	case "image/gif":
		ext = ".gif"
	case "image/webp":
		ext = ".webp"
	default:
		log.Printf("UpdateRoomImageHandler: Invalid file type: %s", file.Header.Get("Content-Type"))
		c.JSON(http.StatusBadRequest, gin.H{"error": "Only image files (jpg, png, gif, webp) are allowed"})
		return
	}

	// Validate file size (max 5MB)
	if file.Size > 5*1024*1024 {
		log.Printf("UpdateRoomImageHandler: File too large: %d bytes", file.Size)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Image size must be less than 5MB"})
		return
	}

	// Read file data into memory
	fileReader, err := file.Open()
	if err != nil {
		log.Printf("UpdateRoomImageHandler: Failed to open file: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read image"})
		return
	}
	defer fileReader.Close()

	fileData, err := io.ReadAll(fileReader)
	if err != nil {
		log.Printf("UpdateRoomImageHandler: Failed to read file data: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read image"})
		return
	}

	// Generate unique filename for BunnyCDN
	filename := fmt.Sprintf("room_%d_%d%s", roomIDUint, time.Now().Unix(), ext)
	contentType := file.Header.Get("Content-Type")

	// Upload to BunnyCDN (or fallback to local storage)
	imageURL, err := utils.UploadToBunnyCDN(fileData, filename, contentType)
	if err != nil {
		log.Printf("UpdateRoomImageHandler: Failed to upload to BunnyCDN: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload image"})
		return
	}

	// Delete old image if exists (only if it's a BunnyCDN URL)
	if room.ImageURL != "" && strings.Contains(room.ImageURL, ".b-cdn.net") {
		// Extract filename from BunnyCDN URL
		parts := strings.Split(room.ImageURL, "/")
		if len(parts) > 0 {
			oldFilename := parts[len(parts)-1]
			if err := utils.DeleteFromBunnyCDN(oldFilename); err != nil {
				log.Printf("UpdateRoomImageHandler: Failed to delete old image from BunnyCDN: %v", err)
				// Continue anyway - not critical
			}
		}
	}

	// Update database with new image URL (full CDN URL)
	if err := DB.Model(&room).Update("image_url", imageURL).Error; err != nil {
		log.Printf("UpdateRoomImageHandler: Failed to update database: %v", err)
		// Try to clean up uploaded file from BunnyCDN
		if strings.Contains(imageURL, ".b-cdn.net") {
			utils.DeleteFromBunnyCDN(filename)
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update image"})
		return
	}

	log.Printf("UpdateRoomImageHandler: Room %d image updated successfully: %s", roomIDUint, imageURL)
	c.JSON(http.StatusOK, gin.H{
		"message":   "Room image updated successfully",
		"image_url": imageURL,
	})
}

// DeleteRoomImageHandler handles DELETE /api/rooms/:id/image
// Removes room profile image
func DeleteRoomImageHandler(c *gin.Context) {
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		log.Printf("DeleteRoomImageHandler: Invalid room ID: %s", roomIDStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	roomIDUint := uint(roomID)

	// Get authenticated user
	userID, exists := c.Get("user_id")
	if !exists {
		log.Println("DeleteRoomImageHandler: Unauthorized access")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	id := userID.(uint)

	// Fetch room and verify ownership
	var room models.Room
	if err := DB.First(&room, roomIDUint).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("DeleteRoomImageHandler: Room %d not found", roomIDUint)
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		} else {
			log.Printf("DeleteRoomImageHandler: Database error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// Check if user is room host
	if room.HostID != id {
		log.Printf("DeleteRoomImageHandler: User %d is not host of room %d", id, roomIDUint)
		c.JSON(http.StatusForbidden, gin.H{"error": "Only room host can delete image"})
		return
	}

	// Check if image exists
	if room.ImageURL == "" {
		c.JSON(http.StatusOK, gin.H{"message": "No image to delete"})
		return
	}

	// Delete file from disk
	oldPath := room.ImageURL
	if oldPath[0] == '/' {
		oldPath = oldPath[1:] // Remove leading slash
	}
	if _, err := os.Stat(oldPath); err == nil {
		if err := os.Remove(oldPath); err != nil {
			log.Printf("DeleteRoomImageHandler: Failed to delete file: %v", err)
		} else {
			log.Printf("DeleteRoomImageHandler: Deleted file: %s", oldPath)
		}
	}

	// Update database to remove image URL
	if err := DB.Model(&room).Update("image_url", nil).Error; err != nil {
		log.Printf("DeleteRoomImageHandler: Failed to update database: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete image"})
		return
	}

	log.Printf("DeleteRoomImageHandler: Room %d image deleted successfully", roomIDUint)
	c.JSON(http.StatusOK, gin.H{"message": "Room image deleted successfully"})
}

// Handle Ending the watch session
func EndWatchSessionHandler(c *gin.Context) {
	log.Println("🔴🔴🔴 [EndWatchSessionHandler] ===== API CALLED =====")
	
	// ✅ FIX: Use "session_id" to match route :session_id
	sessionID := c.Param("session_id")
	log.Printf("🔍 [EndWatchSessionHandler] Extracted session_id from URL: %s", sessionID)
	
	if sessionID == "" {
		log.Println("❌ [EndWatchSessionHandler] Missing session_id in URL")
		c.JSON(http.StatusBadRequest, gin.H{"error": "session_id is required"})
		return
	}

	userID := c.MustGet("user_id").(uint)
	log.Printf("🔍 [EndWatchSessionHandler] Request from user_id: %d", userID)

	// Fetch session
	var session models.WatchSession
	if err := DB.Where("session_id = ?", sessionID).First(&session).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("EndWatchSessionHandler: Session %s not found", sessionID)
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		} else {
			log.Printf("EndWatchSessionHandler: DB error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// ✅ Check if user is the ROOM host (not just session host)
	var room models.Room
	if err := DB.First(&room, session.RoomID).Error; err != nil {
		log.Printf("EndWatchSessionHandler: Room %d not found: %v", session.RoomID, err)
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	if room.HostID != userID {
		log.Printf("EndWatchSessionHandler: User %d is not the room host (host is %d)", userID, room.HostID)
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can end this session"})
		return
	}

	log.Printf("✅ EndWatchSessionHandler: User %d (room host) ending session %s", userID, sessionID)

	isInstantWatch := room.IsTemporary
	now := time.Now()

	// Mark session ended immediately — the only blocking DB write before broadcasting.
	// All cleanup runs in a background goroutine so clients receive session_ended without delay.
	if err := DB.Model(&session).Updates(map[string]interface{}{
		"ended_at":  now,
		"is_active": false,
	}).Error; err != nil {
		log.Printf("EndWatchSessionHandler: Failed to mark session as ended: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to end session"})
		return
	}
	session.EndedAt = &now
	session.IsActive = false
	log.Printf("✅ EndWatchSessionHandler: Session %s marked as ended in DB", sessionID)

	// Fetch host info for the rating modal payload
	var hostUser models.User
	hostName := "Unknown Host"
	if err := DB.First(&hostUser, room.HostID).Error; err == nil {
		hostName = hostUser.Username
	} else {
		log.Printf("⚠️ [EndWatchSessionHandler] Failed to load host user: %v", err)
	}

	// Broadcast session_ended immediately — clients start navigating away now
	log.Printf("📡 [EndWatchSessionHandler] Broadcasting session_ended to room %d", session.RoomID)
	sessionEndedData := map[string]interface{}{
		"type": "session_ended",
		"data": map[string]interface{}{
			"session_id":       sessionID,
			"room_id":          session.RoomID,
			"was_paid_session": session.TicketingEnabled,
			"session_title":    session.SessionTitle,
			"host_id":          room.HostID,
			"host_name":        hostName,
			"watch_type":       session.WatchType,
			"is_temporary":     room.IsTemporary,
		},
	}
	sessionEndedBytes, _ := json.Marshal(sessionEndedData)
	hub.BroadcastToRoom(session.RoomID, OutgoingMessage{Data: sessionEndedBytes, IsBinary: false}, nil)
	log.Printf("✅ [EndWatchSessionHandler] session_ended message broadcasted")

	// Lobby broadcast for real-time session list updates
	lobbyBroadcastData := map[string]interface{}{
		"type":       "session_ended",
		"session_id": sessionID,
		"room_id":    session.RoomID,
	}
	if lobbyJsonData, err := json.Marshal(lobbyBroadcastData); err == nil {
		hub.BroadcastToLobby(OutgoingMessage{Data: lobbyJsonData, IsBinary: false})
		log.Printf("📡 [EndWatchSessionHandler] Lobby broadcast sent with session_id: %s", sessionID)
	}

	// All remaining cleanup runs in the background — no longer blocks the response path
	go func() {
		log.Printf("🧹 [EndWatchSession cleanup] Starting background cleanup for session %s", sessionID)

		tx := DB.Begin()
		if tx.Error != nil {
			log.Printf("⚠️ [EndWatchSession cleanup] Failed to start transaction: %v", tx.Error)
			return
		}

		// Delete temporary media files and DB records
		var tempItems []models.TemporaryMediaItem
		if err := tx.Where("session_id = ?", sessionID).Find(&tempItems).Error; err != nil {
			tx.Rollback()
			log.Printf("⚠️ [EndWatchSession cleanup] Failed to fetch temp media: %v", err)
			return
		}
		for _, item := range tempItems {
			if err := os.Remove(item.FilePath); err != nil && !os.IsNotExist(err) {
				log.Printf("⚠️ [EndWatchSession cleanup] Failed to delete file %s: %v", item.FilePath, err)
			}
			if err := tx.Delete(&item).Error; err != nil {
				log.Printf("⚠️ [EndWatchSession cleanup] Failed to delete temp media record: %v", err)
			}
		}
		log.Printf("🗑️ [EndWatchSession cleanup] Deleted %d temporary media items", len(tempItems))

		// Delete preview files from upload directories
		for _, dir := range []string{"./uploads/temp", "./uploads"} {
			if entries, err := os.ReadDir(dir); err == nil {
				for _, entry := range entries {
					if strings.Contains(entry.Name(), "_preview") {
						os.Remove(filepath.Join(dir, entry.Name()))
					}
				}
			}
		}

		// Snapshot active member IDs before marking inactive (for session_ended notifications)
		var activeMemberIDs []uint
		DB.Table("watch_session_members").
			Select("user_id").
			Where("watch_session_id = ? AND is_active = true", session.ID).
			Pluck("user_id", &activeMemberIDs)

		// Mark all session members as inactive
		memberResult := tx.Model(&models.WatchSessionMember{}).
			Where("watch_session_id = ? AND is_active = ?", session.ID, true).
			Updates(map[string]interface{}{"is_active": false, "left_at": now})
		if memberResult.Error != nil {
			log.Printf("⚠️ [EndWatchSession cleanup] Failed to mark members inactive: %v", memberResult.Error)
		} else {
			log.Printf("✅ [EndWatchSession cleanup] Marked %d members as inactive", memberResult.RowsAffected)
		}

		// Delete session chat messages and reactions
		var chatMessages []models.ChatMessage
		if err := tx.Where("session_id = ?", sessionID).Find(&chatMessages).Error; err == nil {
			messageIDs := make([]uint, len(chatMessages))
			for i, msg := range chatMessages {
				messageIDs[i] = msg.ID
			}
			if len(messageIDs) > 0 {
				if err := tx.Where("message_id IN ?", messageIDs).Delete(&models.Reaction{}).Error; err != nil {
					log.Printf("⚠️ [EndWatchSession cleanup] Failed to delete reactions: %v", err)
				}
			}
			if err := tx.Where("session_id = ?", sessionID).Delete(&models.ChatMessage{}).Error; err != nil {
				log.Printf("⚠️ [EndWatchSession cleanup] Failed to delete chat messages: %v", err)
			} else {
				log.Printf("✅ [EndWatchSession cleanup] Deleted %d chat messages", len(chatMessages))
			}
		}

		// Delete ephemeral private messages
		tx.Where("session_id = ?", sessionID).Delete(&models.PrivateMessage{})

		// For instant watch: delete room and all related records
		if isInstantWatch {
			tx.Where("room_id = ?", room.ID).Delete(&models.UserRoom{})
			tx.Where("room_id = ?", room.ID).Delete(&models.RoomInvitation{})
			tx.Where("room_id = ?", room.ID).Delete(&models.MediaItem{})
			tx.Where("room_id = ?", room.ID).Delete(&models.ScheduledEvent{})
			tx.Where("room_id = ?", room.ID).Delete(&models.RoomTVContent{})
			tx.Delete(&models.WatchSession{}, session.ID)
			if err := tx.Delete(&models.Room{}, room.ID).Error; err != nil {
				log.Printf("⚠️ [EndWatchSession cleanup] Failed to delete temporary room %d: %v", room.ID, err)
			} else {
				log.Printf("🗑️ [EndWatchSession cleanup] Deleted temporary room %d", room.ID)
			}
		}

		if err := tx.Commit().Error; err != nil {
			log.Printf("⚠️ [EndWatchSession cleanup] Transaction commit failed: %v", err)
			return
		}

		// Notify session members that session ended (skip host; skip instant watch rooms as they're deleted)
		if !isInstantWatch {
			sessionTitle := session.SessionTitle
			if sessionTitle == "" {
				sessionTitle = "Watch Session"
			}
			for _, mID := range activeMemberIDs {
				if mID != session.HostID {
					memberID := mID
					go CreateNotification(memberID, "session_ended", sessionTitle+" ended", "The watch session has ended", "room", session.RoomID)
				}
			}
		}

		// Delete quizzes (uses a separate DB connection — must run after tx commit)
		quizService := services.NewQuizService(DB)
		if err := quizService.DeleteQuizzesBySession(session.SessionID); err != nil {
			log.Printf("⚠️ [EndWatchSession cleanup] Failed to delete quizzes: %v", err)
		}

		// Delete session-specific RoomTV content
		var sessionTVContent []models.RoomTVContent
		if err := DB.Where("session_id = ?", session.ID).Find(&sessionTVContent).Error; err == nil && len(sessionTVContent) > 0 {
			for _, content := range sessionTVContent {
				if content.IsUploaded && content.FilePath != "" {
					os.Remove(content.FilePath)
				}
			}
			if err := DB.Where("session_id = ?", session.ID).Delete(&models.RoomTVContent{}).Error; err != nil {
				log.Printf("⚠️ [EndWatchSession cleanup] Failed to delete RoomTV content: %v", err)
			} else {
				for _, content := range sessionTVContent {
					broadcastMsg := map[string]interface{}{"type": "room_tv_content_removed", "content_id": content.ID}
					if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
						hub.BroadcastToRoom(session.RoomID, OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
					}
				}
			}
		}

		// Delete LiveKit room
		livekitRoomName := fmt.Sprintf("room-%d", session.RoomID)
		if err := utils.DeleteLiveKitRoom(livekitRoomName); err != nil {
			log.Printf("⚠️ [EndWatchSession cleanup] Failed to delete LiveKit room %s: %v", livekitRoomName, err)
		}

		// Cleanup session preview files
		if err := CleanupSessionPreviews(sessionID); err != nil {
			log.Printf("⚠️ [EndWatchSession cleanup] Failed to cleanup preview files: %v", err)
		}

		// Cleanup media switch handler state
		if mediaSwitchHandler != nil {
			mediaSwitchHandler.HandleSessionEnd(sessionID)
		}

		// Cleanup LiveShare assets
		CleanupLiveShareAssets(session.ID)

		// Clear seating assignments
		if hub != nil {
			hub.seatingMutex.Lock()
			delete(hub.seatingAssignments, session.RoomID)
			hub.seatingMutex.Unlock()
		}

		// Delete podcast logo
		if session.PodcastLogoURL != "" {
			logoFilename := filepath.Base(session.PodcastLogoURL)
			logoPath := filepath.Join("./uploads/podcast-logos", logoFilename)
			if err := os.Remove(logoPath); err != nil && !os.IsNotExist(err) {
				log.Printf("⚠️ [EndWatchSession cleanup] Failed to delete podcast logo: %v", err)
			}
		}

		log.Printf("✅ [EndWatchSession cleanup] Background cleanup complete for session %s", sessionID)
	}()

	// Give clients a moment to receive session_ended before disconnecting
	log.Printf("⏳ [EndWatchSessionHandler] Waiting 500ms before disconnecting clients...")
	time.Sleep(500 * time.Millisecond)
	log.Printf("🔌 [EndWatchSessionHandler] Disconnecting all WebSocket clients in room %d", session.RoomID)
	hub.DisconnectRoomClients(session.RoomID)

	log.Printf("✅✅✅ [EndWatchSessionHandler] Session %s ended successfully by host %d", sessionID, userID)

	c.JSON(http.StatusOK, gin.H{
		"message": "Session ended",
		"session": gin.H{
			"session_id":           session.SessionID,
			"ticketing_enabled":    session.TicketingEnabled,
			"total_tickets_sold":   session.TotalTicketsSold,
			"total_ticket_revenue": session.TotalTicketRevenue,
		},
	})
}

// ✅ AutoEndSession ends a session automatically (e.g., when host is gone > 10 minutes)
// This is the internal version without HTTP context
func AutoEndSession(sessionID string) error {
	log.Printf("🤖 AutoEndSession called for session %s", sessionID)
	
	// Fetch session
	var session models.WatchSession
	if err := DB.Where("session_id = ?", sessionID).First(&session).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("AutoEndSession: Session %s not found (may have been manually ended)", sessionID)
			return nil // Not an error - session already gone
		}
		return fmt.Errorf("database error: %v", err)
	}
	
	// Check if already ended
	if session.EndedAt != nil {
		log.Printf("AutoEndSession: Session %s already ended at %v", sessionID, session.EndedAt)
		return nil
	}
	
	log.Printf("✅ AutoEndSession: Auto-ending session %s (room %d)", sessionID, session.RoomID)
	
	// ✅ Check if this is an instant watch (temporary room) FIRST
	var room models.Room
	if err := DB.First(&room, session.RoomID).Error; err != nil {
		log.Printf("AutoEndSession: Failed to fetch room %d: %v", session.RoomID, err)
		return fmt.Errorf("failed to fetch room: %v", err)
	}
	
	isInstantWatch := room.IsTemporary
	
	// 🔁 Use transaction for data consistency
	tx := DB.Begin()
	if tx.Error != nil {
		return fmt.Errorf("failed to start transaction: %v", tx.Error)
	}
	
	// Declare now for use in marking members as inactive
	now := time.Now()

	// ✅ For regular rooms: Mark session as ended
	// ✅ For instant watch: We'll delete the session later (skip marking as ended)
	if !isInstantWatch {
		session.EndedAt = &now
		if err := tx.Save(&session).Error; err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to update session: %v", err)
		}
		log.Printf("⏰ Marked regular session %s as ended", sessionID)
	} else {
		log.Printf("🗑️ Instant watch session %s - will be deleted entirely", sessionID)
	}
	
	// ✅ Delete temporary media files and records
	var tempItems []models.TemporaryMediaItem
	if err := tx.Where("session_id = ?", sessionID).Find(&tempItems).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to fetch temp media: %v", err)
	}
	
	log.Printf("🗑️ AutoEndSession: Found %d temporary media items to delete for session %s", len(tempItems), sessionID)
	for _, item := range tempItems {
		log.Printf("🗑️ Deleting temporary media: ID=%d, File=%s, SessionID=%s", item.ID, item.FileName, item.SessionID)
		if err := os.Remove(item.FilePath); err != nil && !os.IsNotExist(err) {
			log.Printf("⚠️ AutoEndSession: Failed to delete file %s: %v", item.FilePath, err)
		} else {
			log.Printf("✅ Deleted file: %s", item.FilePath)
		}
		if err := tx.Delete(&item).Error; err != nil {
			log.Printf("⚠️ AutoEndSession: Failed to delete DB record for %s: %v", item.FilePath, err)
		} else {
			log.Printf("✅ Deleted DB record: ID=%d", item.ID)
		}
	}
	
	// ✅ Mark all session members as inactive
	result := tx.Model(&models.WatchSessionMember{}).
		Where("watch_session_id = ? AND is_active = ?", session.ID, true).
		Updates(map[string]interface{}{
			"is_active": false,
			"left_at":   now,
		})
	if result.Error != nil {
		log.Printf("⚠️ AutoEndSession: Failed to mark members as inactive: %v", result.Error)
	} else {
		log.Printf("✅ AutoEndSession: Marked %d members as inactive for session %s", result.RowsAffected, sessionID)
	}
	
	// ✅ Delete session chat messages and reactions
	var chatMessages []models.ChatMessage
	if err := tx.Where("session_id = ?", sessionID).Find(&chatMessages).Error; err != nil {
		log.Printf("⚠️ AutoEndSession: Failed to fetch chat messages: %v", err)
	} else {
		log.Printf("🗑️ AutoEndSession: Found %d chat messages to delete for session %s", len(chatMessages), sessionID)
		
		messageIDs := make([]uint, len(chatMessages))
		for i, msg := range chatMessages {
			messageIDs[i] = msg.ID
		}
		
		if len(messageIDs) > 0 {
			var reactions []models.Reaction
			if err := tx.Where("message_id IN ?", messageIDs).Find(&reactions).Error; err != nil {
				log.Printf("⚠️ AutoEndSession: Failed to fetch reactions: %v", err)
			} else {
				log.Printf("🗑️ AutoEndSession: Found %d reactions to delete", len(reactions))
				if err := tx.Where("message_id IN ?", messageIDs).Delete(&models.Reaction{}).Error; err != nil {
					log.Printf("⚠️ AutoEndSession: Failed to delete reactions: %v", err)
				} else {
					log.Printf("✅ Deleted %d reactions", len(reactions))
				}
			}
		}
		
		if err := tx.Where("session_id = ?", sessionID).Delete(&models.ChatMessage{}).Error; err != nil {
			log.Printf("⚠️ AutoEndSession: Failed to delete chat messages: %v", err)
		} else {
			log.Printf("✅ Deleted %d chat messages", len(chatMessages))
		}
	}
	
	// ✅ DELETE SESSION-SPECIFIC ROOMTV CONTENT (before room deletion check)
	var sessionTVContent []models.RoomTVContent
	if err := tx.Where("session_id = ?", session.ID).Find(&sessionTVContent).Error; err != nil {
		log.Printf("⚠️ AutoEndSession: Failed to fetch session TV content: %v", err)
	} else if len(sessionTVContent) > 0 {
		log.Printf("🗑️ AutoEndSession: Found %d RoomTV items linked to session %s", len(sessionTVContent), sessionID)
		
		// Delete video files if uploaded
		for _, content := range sessionTVContent {
			if content.IsUploaded && content.FilePath != "" {
				if err := os.Remove(content.FilePath); err != nil {
					log.Printf("⚠️ Failed to delete video file %s: %v", content.FilePath, err)
				} else {
					log.Printf("✅ Deleted video file: %s", content.FilePath)
				}
			}
		}
		
		// Delete database records
		if err := tx.Where("session_id = ?", session.ID).Delete(&models.RoomTVContent{}).Error; err != nil {
			log.Printf("⚠️ AutoEndSession: Failed to delete RoomTV content: %v", err)
		} else {
			log.Printf("✅ Deleted %d RoomTV items for session %s", len(sessionTVContent), sessionID)
			
			// Note: Broadcasting will happen after transaction commits (in session_ended broadcast)
		}
	}

	// ✅ DELETE ALL QUIZZES AND RESPONSES FOR THIS SESSION
	log.Printf("🗑️ [AutoEndSession] Deleting quizzes for session %s", sessionID)
	quizService := services.NewQuizService(DB)
	if err := quizService.DeleteQuizzesBySession(session.SessionID); err != nil {
		log.Printf("⚠️ AutoEndSession: Failed to delete quizzes: %v", err)
	} else {
		log.Printf("✅ AutoEndSession: Deleted all quizzes and responses for session %s", sessionID)
	}
	
	// ✅ Delete room if it's temporary (instant watch)
	if isInstantWatch {
		// Delete all related data for temporary room
		// Delete UserRoom memberships
		if err := tx.Where("room_id = ?", room.ID).Delete(&models.UserRoom{}).Error; err != nil {
			log.Printf("⚠️ AutoEndSession: Failed to delete UserRoom memberships for room %d: %v", room.ID, err)
		}
		
		// Delete room invitations (if any)
		if err := tx.Where("room_id = ?", room.ID).Delete(&models.RoomInvitation{}).Error; err != nil {
			log.Printf("⚠️ AutoEndSession: Failed to delete room invitations for room %d: %v", room.ID, err)
		}
		
		// Delete media items
		if err := tx.Where("room_id = ?", room.ID).Delete(&models.MediaItem{}).Error; err != nil {
			log.Printf("⚠️ AutoEndSession: Failed to delete media items for room %d: %v", room.ID, err)
		}
		
		// Delete scheduled events
		if err := tx.Where("room_id = ?", room.ID).Delete(&models.ScheduledEvent{}).Error; err != nil {
			log.Printf("⚠️ AutoEndSession: Failed to delete scheduled events for room %d: %v", room.ID, err)
		}
		
		// Delete RoomTV content
		if err := tx.Where("room_id = ?", room.ID).Delete(&models.RoomTVContent{}).Error; err != nil {
			log.Printf("⚠️ AutoEndSession: Failed to delete RoomTV content for room %d: %v", room.ID, err)
		}
		
		// ✅ DELETE THE SESSION ITSELF for instant watch (before deleting room)
		if err := tx.Delete(&models.WatchSession{}, session.ID).Error; err != nil {
			log.Printf("⚠️ AutoEndSession: Failed to delete session %s: %v", sessionID, err)
		} else {
			log.Printf("🗑️ Deleted instant watch session: %s", sessionID)
		}
		
		// Finally, delete the room itself
		if err := tx.Delete(&models.Room{}, room.ID).Error; err != nil {
			log.Printf("⚠️ AutoEndSession: Failed to delete temporary room %d: %v", room.ID, err)
		} else {
			log.Printf("🗑️ Deleted temporary room %d and all related data after session auto-end", room.ID)
		}
	}
	
	if err := tx.Commit().Error; err != nil {
		return fmt.Errorf("transaction commit failed: %v", err)
	}
	
	// ✅ DELETE LIVEKIT ROOM (after successful DB commit)
	livekitRoomName := fmt.Sprintf("room-%d", session.RoomID)
	if err := utils.DeleteLiveKitRoom(livekitRoomName); err != nil {
		log.Printf("⚠️ AutoEndSession: Failed to delete LiveKit room %s: %v", livekitRoomName, err)
	}
	
	// ✅ CLEANUP SESSION PREVIEW FILES
	if err := CleanupSessionPreviews(sessionID); err != nil {
		log.Printf("⚠️ AutoEndSession: Failed to cleanup preview files for session %s: %v", sessionID, err)
	}
	
	// ✅ CLEANUP MEDIA SWITCH HANDLER STATE (timers, queue, etc.)
	if mediaSwitchHandler != nil {
		mediaSwitchHandler.HandleSessionEnd(sessionID)
	}
	
	// ✅ CLEAR SEATING ASSIGNMENTS for this room (prevent stale seat data in new sessions)
	if hub != nil {
		hub.seatingMutex.Lock()
		if _, exists := hub.seatingAssignments[session.RoomID]; exists {
			delete(hub.seatingAssignments, session.RoomID)
			log.Printf("🪑 [AutoEndSession] Cleared seating assignments for room %d", session.RoomID)
		}
		hub.seatingMutex.Unlock()
	}
	
	// ✅ BROADCAST SESSION_ENDED TO ALL PARTICIPANTS
	if hub != nil {
		broadcastMsg := OutgoingMessage{
			Data:     []byte(fmt.Sprintf(`{"type":"session_ended","data":{"session_id":"%s","room_id":%d,"reason":"host_timeout","is_temporary":%t}}`, sessionID, session.RoomID, room.IsTemporary)),
			IsBinary: false,
		}
		hub.BroadcastToRoom(session.RoomID, broadcastMsg, nil)
		log.Printf("📡 Broadcast session_ended (host timeout) to room %d", session.RoomID)
		
		// Disconnect all WebSocket clients
		time.Sleep(500 * time.Millisecond)
		hub.DisconnectRoomClients(session.RoomID)
	}
	
	log.Printf("✅ Session %s auto-ended successfully after host timeout", sessionID)
	return nil
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

// CleanupOrphanedPodcastLogos deletes podcast logos from ended sessions
// Safety net for logos missed during session end (crashes, errors, etc.)
func CleanupOrphanedPodcastLogos() {
	log.Println("🧹 [CleanupPodcastLogos] Starting cleanup of orphaned podcast logos...")
	
	// Find all ended sessions with podcast logos
	var endedPodcastSessions []models.WatchSession
	result := DB.Where("ended_at IS NOT NULL AND podcast_logo_url != '' AND podcast_logo_url IS NOT NULL").
		Find(&endedPodcastSessions)
	
	if result.Error != nil {
		log.Printf("❌ [CleanupPodcastLogos] Database query failed: %v", result.Error)
		return
	}
	
	if len(endedPodcastSessions) == 0 {
		log.Println("✅ [CleanupPodcastLogos] No orphaned podcast logos found")
		return
	}
	
	log.Printf("🗑️ [CleanupPodcastLogos] Found %d ended sessions with podcast logos to clean", len(endedPodcastSessions))
	
	deletedLogos := 0
	for _, session := range endedPodcastSessions {
		// Extract filename from URL
		logoFilename := filepath.Base(session.PodcastLogoURL)
		logoPath := filepath.Join("./uploads/podcast-logos", logoFilename)
		
		// Delete physical file
		if err := os.Remove(logoPath); err != nil {
			if os.IsNotExist(err) {
				log.Printf("ℹ️ [CleanupPodcastLogos] Logo already deleted: %s", logoPath)
			} else {
				log.Printf("⚠️ [CleanupPodcastLogos] Failed to delete %s: %v", logoPath, err)
				continue
			}
		} else {
			deletedLogos++
			log.Printf("✅ [CleanupPodcastLogos] Deleted: %s (session %s ended)", logoPath, session.SessionID)
		}
		
		// Clear logo URL in database (prevent re-scanning)
		DB.Model(&session).Update("podcast_logo_url", "")
	}
	
	log.Printf("✅ [CleanupPodcastLogos] Cleanup complete: %d logos deleted", deletedLogos)
}

// CleanupAllTemporaryMedia deletes temp files from ALL ended sessions (instant + regular)
// This is the safety net that catches files missed by immediate cleanup
func CleanupAllTemporaryMedia() {
	log.Println("🧹 [CleanupTempMedia] Starting cleanup of temporary media from ALL ended sessions...")
	
	// Find all temporary media items where session has ended
	var orphanedMedia []models.TemporaryMediaItem
	result := DB.
		Joins("JOIN watch_sessions ON watch_sessions.session_id = temporary_media_items.session_id").
		Where("watch_sessions.ended_at IS NOT NULL").
		Find(&orphanedMedia)
	
	if result.Error != nil {
		log.Printf("❌ [CleanupTempMedia] Database query failed: %v", result.Error)
		return
	}
	
	if len(orphanedMedia) == 0 {
		log.Println("✅ [CleanupTempMedia] No orphaned temporary media found")
		return
	}
	
	log.Printf("🗑️ [CleanupTempMedia] Found %d orphaned temporary media items to delete", len(orphanedMedia))
	
	// Delete files and database records
	deletedFiles := 0
	deletedRecords := 0
	failedFiles := 0
	
	for _, item := range orphanedMedia {
		// Delete physical file
		if err := os.Remove(item.FilePath); err != nil {
			if os.IsNotExist(err) {
				log.Printf("ℹ️ [CleanupTempMedia] File already deleted: %s", item.FilePath)
			} else {
				log.Printf("⚠️ [CleanupTempMedia] Failed to delete file %s: %v", item.FilePath, err)
				failedFiles++
				continue
			}
		} else {
			deletedFiles++
			log.Printf("✅ [CleanupTempMedia] Deleted file: %s", item.FilePath)
		}
		
		// Delete database record
		if err := DB.Delete(&item).Error; err != nil {
			log.Printf("⚠️ [CleanupTempMedia] Failed to delete DB record for %s: %v", item.FilePath, err)
		} else {
			deletedRecords++
		}
	}
	
	log.Printf("✅ [CleanupTempMedia] Cleanup complete: %d files deleted, %d DB records removed, %d failures", 
		deletedFiles, deletedRecords, failedFiles)
}

// CleanupOrphanedPreviews deletes preview files that are no longer referenced
// Handles both temp and permanent previews in uploads/temp/ and uploads/ folders
func CleanupOrphanedPreviews() {
	log.Println("🧹 [CleanupPreviews] Starting cleanup of orphaned preview files...")
	
	// Check temp folder for orphaned previews
	tempPreviewsPath := "./uploads/temp"
	if entries, err := os.ReadDir(tempPreviewsPath); err == nil {
		orphanedCount := 0
		for _, entry := range entries {
			if entry.IsDir() || !strings.Contains(entry.Name(), "_preview") {
				continue
			}
			
			// Check if this preview is still referenced in temporary_media_items
			filePath := filepath.Join(tempPreviewsPath, entry.Name())
			var count int64
			DB.Model(&models.TemporaryMediaItem{}).
				Where("preview_url LIKE ?", "%"+entry.Name()+"%").
				Count(&count)
			
			if count == 0 {
				// Preview not referenced, delete it
				if err := os.Remove(filePath); err != nil {
					log.Printf("⚠️ [CleanupPreviews] Failed to delete %s: %v", filePath, err)
				} else {
					orphanedCount++
					log.Printf("🗑️ [CleanupPreviews] Deleted orphaned preview: %s", entry.Name())
				}
			}
		}
		if orphanedCount > 0 {
			log.Printf("✅ [CleanupPreviews] Deleted %d orphaned temp previews", orphanedCount)
		}
	}
	
	// Check uploads folder for orphaned previews
	uploadsPath := "./uploads"
	if entries, err := os.ReadDir(uploadsPath); err == nil {
		orphanedCount := 0
		for _, entry := range entries {
			if entry.IsDir() || !strings.Contains(entry.Name(), "_preview") {
				continue
			}
			
			// Check if this preview is still referenced in media_items
			filePath := filepath.Join(uploadsPath, entry.Name())
			var count int64
			DB.Model(&models.MediaItem{}).
				Where("preview_url LIKE ?", "%"+entry.Name()+"%").
				Count(&count)
			
			if count == 0 {
				// Preview not referenced, delete it
				if err := os.Remove(filePath); err != nil {
					log.Printf("⚠️ [CleanupPreviews] Failed to delete %s: %v", filePath, err)
				} else {
					orphanedCount++
					log.Printf("🗑️ [CleanupPreviews] Deleted orphaned preview: %s", entry.Name())
				}
			}
		}
		if orphanedCount > 0 {
			log.Printf("✅ [CleanupPreviews] Deleted %d orphaned permanent previews", orphanedCount)
		}
	}
	
	log.Println("✅ [CleanupPreviews] Preview cleanup complete")
}

// CleanupExpiredSessions removes watch sessions and temp media older than 5 minutes.
// Reduced grace period for tighter memory management.
func CleanupExpiredSessions() {
	var sessions []models.WatchSession
	cutoff := time.Now().Add(-5 * time.Minute) // ✅ Reduced from 30 to 5 minutes

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

// ✅ CleanupOrphanedInstantWatchRooms deletes temporary rooms where the session has ended OR no session exists
// This catches rooms that weren't properly deleted during session end
func CleanupOrphanedInstantWatchRooms() {
	log.Println("🧹 [CleanupOrphanedInstantWatchRooms] Checking for orphaned instant watch rooms...")
	
	// Find all temporary rooms (including soft-deleted ones)
	var allTempRooms []models.Room
	result := DB.Unscoped().Where("is_temporary = ?", true).Find(&allTempRooms)
	if result.Error != nil {
		log.Printf("❌ [CleanupOrphanedInstantWatchRooms] Failed to query temporary rooms: %v", result.Error)
		return
	}
	
	log.Printf("📊 [CleanupOrphanedInstantWatchRooms] Query executed: is_temporary = true")
	log.Printf("📊 [CleanupOrphanedInstantWatchRooms] Rows affected: %d", result.RowsAffected)
	log.Printf("📊 [CleanupOrphanedInstantWatchRooms] Found %d temporary rooms in database", len(allTempRooms))
	
	// Debug: Print first few room IDs
	if len(allTempRooms) > 0 {
		log.Printf("🔍 [CleanupOrphanedInstantWatchRooms] First 5 room IDs: ")
		for i := 0; i < len(allTempRooms) && i < 5; i++ {
			log.Printf("  - Room ID %d: %s (is_temporary=%v)", allTempRooms[i].ID, allTempRooms[i].Name, allTempRooms[i].IsTemporary)
		}
	}
	
	// Filter to only orphaned rooms (where session has ended or doesn't exist or has no active members)
	var orphanedRooms []models.Room
	for _, room := range allTempRooms {
		var session models.WatchSession
		err := DB.Where("room_id = ?", room.ID).First(&session).Error
		
		if err == gorm.ErrRecordNotFound {
			// No session found - orphaned room
			log.Printf("🗑️ [CleanupOrphanedInstantWatchRooms] Room %d has no watch session - marking for deletion", room.ID)
			orphanedRooms = append(orphanedRooms, room)
		} else if err == nil && session.EndedAt != nil {
			// Session ended - orphaned room
			log.Printf("🗑️ [CleanupOrphanedInstantWatchRooms] Room %d has ended session - marking for deletion", room.ID)
			orphanedRooms = append(orphanedRooms, room)
		} else if err == nil && session.EndedAt == nil {
			// Session exists but not marked as ended - check if it has any active members
			var activeCount int64
			if err := DB.Model(&models.WatchSessionMember{}).
				Where("watch_session_id = ? AND is_active = ?", session.ID, true).
				Count(&activeCount).Error; err != nil {
				log.Printf("⚠️ [CleanupOrphanedInstantWatchRooms] Error counting active members for room %d: %v", room.ID, err)
			} else if activeCount == 0 {
				// No active members - session is orphaned
				log.Printf("🗑️ [CleanupOrphanedInstantWatchRooms] Room %d has 0 active members - marking for deletion", room.ID)
				orphanedRooms = append(orphanedRooms, room)
			} else {
				log.Printf("✅ [CleanupOrphanedInstantWatchRooms] Room %d has %d active members - keeping", room.ID, activeCount)
			}
		} else if err != nil {
			log.Printf("⚠️ [CleanupOrphanedInstantWatchRooms] Error checking session for room %d: %v", room.ID, err)
		}
	}
	
	if len(orphanedRooms) == 0 {
		log.Println("✅ [CleanupOrphanedInstantWatchRooms] No orphaned instant watch rooms found")
		return
	}
	
	log.Printf("🗑️ [CleanupOrphanedInstantWatchRooms] Found %d orphaned instant watch rooms to delete", len(orphanedRooms))
	
	for _, room := range orphanedRooms {
		log.Printf("🗑️ [CleanupOrphanedInstantWatchRooms] Deleting room %d (%s)", room.ID, room.Name)
		
		tx := DB.Begin()
		if tx.Error != nil {
			log.Printf("❌ Failed to start transaction for room %d", room.ID)
			continue
		}
		
		// Delete all related data (hard delete with Unscoped)
		// Order matters: delete children before parents to avoid foreign key violations
		
		// First, delete deepest children
		tx.Exec("DELETE FROM watch_session_members WHERE watch_session_id IN (SELECT id FROM watch_sessions WHERE room_id = ?)", room.ID)
		tx.Exec("DELETE FROM user_theater_assignments WHERE theater_id IN (SELECT id FROM theaters WHERE watch_session_id IN (SELECT id FROM watch_sessions WHERE room_id = ?))", room.ID)
		tx.Exec("DELETE FROM theaters WHERE watch_session_id IN (SELECT id FROM watch_sessions WHERE room_id = ?)", room.ID)
		
		// Then delete other related data
		tx.Unscoped().Where("room_id = ?", room.ID).Delete(&models.UserRoom{})
		// Note: room_invitations table doesn't exist yet - skip for now
		// tx.Unscoped().Where("room_id = ?", room.ID).Delete(&models.RoomInvitation{})
		tx.Unscoped().Where("room_id = ?", room.ID).Delete(&models.MediaItem{})
		tx.Unscoped().Where("room_id = ?", room.ID).Delete(&models.ScheduledEvent{})
		tx.Unscoped().Where("room_id = ?", room.ID).Delete(&models.RoomTVContent{})
		tx.Unscoped().Where("room_id = ?", room.ID).Delete(&models.WatchSession{})
		tx.Unscoped().Where("room_id = ?", room.ID).Delete(&models.RoomMessage{})
		
		// Delete the room itself (hard delete)
		if err := tx.Unscoped().Delete(&room).Error; err != nil {
			tx.Rollback()
			log.Printf("❌ Failed to delete room %d: %v", room.ID, err)
			continue
		}
		
		if err := tx.Commit().Error; err != nil {
			log.Printf("❌ Failed to commit deletion for room %d: %v", room.ID, err)
			continue
		}
		
		log.Printf("✅ Successfully deleted orphaned instant watch room %d", room.ID)
	}
	
	log.Printf("✅ [CleanupOrphanedInstantWatchRooms] Cleanup complete - deleted %d orphaned rooms", len(orphanedRooms))
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

	// Verify user has access: either permanent room member OR active session participant
	var userRoom models.UserRoom
	isPermanentMember := DB.Where("user_id = ? AND room_id = ?", userID, roomID).First(&userRoom).Error == nil
	
	// Check if user is in an active session for this room
	var activeSession models.WatchSession
	var sessionMember models.WatchSessionMember
	isSessionParticipant := false
	
	if err := DB.Where("room_id = ? AND ended_at IS NULL", roomID).First(&activeSession).Error; err == nil {
		// Found active session, check if user is a member
		if err := DB.Where("watch_session_id = ? AND user_id = ? AND is_active = ?", 
			activeSession.ID, userID, true).First(&sessionMember).Error; err == nil {
			isSessionParticipant = true
			log.Printf("✅ [LiveKit] User %d is active session participant (session: %s)", userID, activeSession.SessionID)
		}
	}
	
	if !isPermanentMember && !isSessionParticipant {
		log.Printf("❌ [LiveKit] User %d denied: not a room member and not in active session", userID)
		c.JSON(http.StatusForbidden, gin.H{"error": "Not a member of this room"})
		return
	}
	
	log.Printf("✅ [LiveKit] User %d authorized: permanent=%v, session=%v", userID, isPermanentMember, isSessionParticipant)

	// Get room to check if user is host
	var room models.Room
	if err := DB.First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	isHost := room.HostID == userID
	
	// ✅ Use tab_id from query params to make identity unique per browser tab
	tabID := c.Query("tab_id")
	identity := "user-" + strconv.FormatUint(uint64(userID), 10)
	if tabID != "" {
		identity = identity + "-" + tabID
		log.Printf("🆔 [LiveKit] Using tab-unique identity: %s", identity)
	}
	
	roomName := "room-" + roomIDStr

	log.Printf("🎬 [LiveKit] Generating token: room=%s, identity=%s, isHost=%v", roomName, identity, isHost)

	token, err := utils.GenerateLiveKitToken(roomName, identity, isHost)
	if err != nil {
		log.Printf("❌ [LiveKit] Failed to generate token: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	// ✅ Environment-aware LiveKit URL (localhost for dev, production URL for deployed)
	livekitURL := utils.GetLiveKitURL(c.Request)
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

	// Parse watch_type from request body
	var input struct {
		WatchType     string  `json:"watch_type"` // "video", "3d_cinema", or "classroom"
		ClassType     *string `json:"class_type"` // "classroom" (25 seats) or "lecture_hall" (145 seats) - only for classroom watch_type
		IsPublic      *bool   `json:"is_public"`  // Pointer to allow nil (defaults to true)
		IsPrivate     *bool   `json:"is_private"` // If true, session hidden from lobby unless user is member
		ContentRating string  `json:"content_rating"` // Optional: 'G', 'PG', '13+', '16+', '18+', 'Mature' (defaults to 'G')
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		// Default to "video" if not specified
		input.WatchType = "video"
	}
	
	// Validate watch_type
	if input.WatchType != "video" && input.WatchType != "3d_cinema" && input.WatchType != "classroom" {
		input.WatchType = "video"
	}

	// Validate class_type if watch_type is classroom
	var classType string
	if input.WatchType == "classroom" {
		if input.ClassType != nil && (*input.ClassType == "classroom" || *input.ClassType == "lecture_hall") {
			classType = *input.ClassType
		} else {
			// Default to lecture_hall if not specified or invalid
			classType = "lecture_hall"
		}
	}

	// Default to public if not specified
	isPublic := true
	if input.IsPublic != nil {
		isPublic = *input.IsPublic
	}

	// Default to not private (public in lobby)
	isPrivate := false
	if input.IsPrivate != nil {
		isPrivate = *input.IsPrivate
	}

	// 🔁 BEGIN TRANSACTION
	tx := DB.Begin()
	if tx.Error != nil {
		log.Printf("CreateInstantWatchHandler: Failed to begin transaction: %v", tx.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	// Create temporary room with watch type indicator
	roomName := fmt.Sprintf("Instant Watch – %s", time.Now().Format("15:04"))
	
	// Validate and set content rating (default to 'G')
	contentRatingForRoom := "G"
	if input.ContentRating != "" {
		validRatings := []string{"G", "PG", "Educational", "Religious", "13+", "16+", "18+", "Mature"}
		for _, rating := range validRatings {
			if input.ContentRating == rating {
				contentRatingForRoom = rating
				break
			}
		}
	}
	
	newRoom := models.Room{
		Name:          roomName,
		Description:   "Temporary session – auto-deleted after use",
		HostID:        userID,
		IsTemporary:   true,
		IsPublic:      isPublic,
		ContentRating: contentRatingForRoom,
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

	// Create watch session with watch_type and optional class_type
	sessionUUID := uuid.New().String()
	
	// Validate and set content rating (default to 'G')
	log.Printf("🎬 [CreateInstantWatch] Received content_rating: '%s'", input.ContentRating)
	contentRating := "G"
	if input.ContentRating != "" {
		validRatings := []string{"G", "PG", "Educational", "Religious", "13+", "16+", "18+", "Mature"}
		for _, rating := range validRatings {
			if input.ContentRating == rating {
				contentRating = rating
				log.Printf("✅ [CreateInstantWatch] Valid content_rating matched: '%s'", contentRating)
				break
			}
		}
	} else {
		log.Printf("⚠️ [CreateInstantWatch] No content_rating received, defaulting to 'G'")
	}
	
	watchSession := models.WatchSession{
		SessionID:     sessionUUID,
		RoomID:        newRoom.ID,
		HostID:        userID,
		WatchType:     input.WatchType,
		ClassType:     classType,  // ✅ Set class_type for classroom sessions
		IsPrivate:     isPrivate,  // ✅ Hide from lobby if private
		ContentRating: contentRating, // ✅ Set content rating
		StartedAt:     time.Now(),
	}

	if err := tx.Create(&watchSession).Error; err != nil {
		tx.Rollback()
		log.Printf("CreateInstantWatchHandler: Error creating WatchSession: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}
	log.Printf("✅ [CreateInstantWatch] Session created with content_rating: '%s' (session_id: %s)", watchSession.ContentRating, sessionUUID)

	// ✅ COMMIT TRANSACTION
	if err := tx.Commit().Error; err != nil {
		log.Printf("CreateInstantWatchHandler: Failed to commit transaction: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to finalize session"})
		return
	}

	// Broadcast to lobby for real-time session list updates
	go func() {
		hub := GetHub()
		if hub == nil {
			return
		}
		var host models.User
		DB.Select("username").First(&host, userID)
		lobbyBroadcastData := map[string]interface{}{
			"type":          "session_started",
			"session_id":    watchSession.SessionID,
			"room_id":       newRoom.ID,
			"room_name":     newRoom.Name,
			"host_username": host.Username,
			"watch_type":    input.WatchType,
		}
		if lobbyJsonData, err := json.Marshal(lobbyBroadcastData); err == nil {
			hub.BroadcastToLobby(OutgoingMessage{Data: lobbyJsonData, IsBinary: false})
		}
	}()

	// Success
	if input.WatchType == "classroom" {
		log.Printf("✅ Created instant watch session: room=%d, session=%s, type=%s, class_type=%s", newRoom.ID, sessionUUID, input.WatchType, classType)
	} else {
		log.Printf("✅ Created instant watch session: room=%d, session=%s, type=%s", newRoom.ID, sessionUUID, input.WatchType)
	}
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

	// Get authenticated user ID (optional - for filtering private rooms)
	userIDValue, userExists := c.Get("user_id")
	var userID uint
	if userExists {
		userID, _ = userIDValue.(uint)
	}

	// ✅ Parse pagination parameters
	limit := 20 // Default limit
	offset := 0 // Default offset
	
	if limitParam := c.Query("limit"); limitParam != "" {
		if parsedLimit, err := strconv.Atoi(limitParam); err == nil && parsedLimit > 0 && parsedLimit <= 100 {
			limit = parsedLimit
		}
	}
	
	if offsetParam := c.Query("offset"); offsetParam != "" {
		if parsedOffset, err := strconv.Atoi(offsetParam); err == nil && parsedOffset >= 0 {
			offset = parsedOffset
		}
	}

	// Query the database for rooms with host username, active session status, and membership status
	// Use LEFT JOIN to include username even if user is deleted
	// Use LEFT JOIN to check if room has an active watch session
	// Use LEFT JOIN to check if user is a member
	type RoomWithUsername struct {
		models.Room
		HostUsername    string `gorm:"column:host_username"`
		IsActiveSession bool   `gorm:"column:is_active_session"`
		IsMember        bool   `gorm:"column:is_member"`
	}
	
	var roomsWithUsername []RoomWithUsername
	
	// Build query based on authentication
	var query *gorm.DB
	if userExists && userID > 0 {
		// Authenticated user: Include membership status in query
		query = DB.Table("rooms").
			Select(`
				rooms.*, 
				users.username as host_username,
				CASE 
					WHEN watch_sessions.id IS NOT NULL 
						AND watch_sessions.ended_at IS NULL 
					THEN true 
					ELSE false 
				END AS is_active_session,
				CASE 
					WHEN user_rooms.user_id IS NOT NULL 
					THEN true 
					ELSE false 
				END AS is_member
			`).
			Joins("LEFT JOIN users ON rooms.host_id = users.id").
			Joins(`LEFT JOIN watch_sessions ON rooms.id = watch_sessions.room_id 
				   AND watch_sessions.ended_at IS NULL`).
			Joins(fmt.Sprintf("LEFT JOIN user_rooms ON user_rooms.room_id = rooms.id AND user_rooms.user_id = %d", userID)).
			Where("rooms.deleted_at IS NULL"). // ✅ Exclude soft-deleted rooms
			Where(
				"rooms.is_public = ? OR rooms.id IN (SELECT room_id FROM user_rooms WHERE user_id = ?)",
				true, userID,
			)
	} else {
		// Unauthenticated user: No membership status
		query = DB.Table("rooms").
			Select(`
				rooms.*, 
				users.username as host_username,
				CASE 
					WHEN watch_sessions.id IS NOT NULL 
						AND watch_sessions.ended_at IS NULL 
					THEN true 
					ELSE false 
				END AS is_active_session,
				false AS is_member
			`).
			Joins("LEFT JOIN users ON rooms.host_id = users.id").
			Joins(`LEFT JOIN watch_sessions ON rooms.id = watch_sessions.room_id 
				   AND watch_sessions.ended_at IS NULL`).
			Where("rooms.deleted_at IS NULL"). // ✅ Exclude soft-deleted rooms
			Where("rooms.is_public = ?", true)
	}
	
	// ✅ Get total count before pagination
	var totalCount int64
	countQuery := query
	if err := countQuery.Count(&totalCount).Error; err != nil {
		log.Printf("GetRoomsHandler: Error counting rooms: %v", err)
		totalCount = 0
	}

	// ✅ Sort: User's owned rooms first (0), then member rooms (1), then other rooms (2)
	var result *gorm.DB
	if userExists && userID > 0 {
		result = query.
			Order(fmt.Sprintf(`
				CASE 
					WHEN rooms.host_id = %d THEN 0 
					WHEN user_rooms.user_id IS NOT NULL THEN 1 
					ELSE 2 
				END`, userID)).
			Order("rooms.created_at DESC").
			Limit(limit).
			Offset(offset).
			Scan(&roomsWithUsername)
	} else {
		result = query.Order("rooms.created_at DESC").
			Limit(limit).
			Offset(offset).
			Scan(&roomsWithUsername)
	}
	
	if result.Error != nil {
		log.Printf("GetRoomsHandler: Error fetching rooms from the database: %v", result.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error":"Failed to fetch rooms"})
		return
	}

	// Create a slice of simplified room data to return
	roomsResponse := make([]gin.H, len(roomsWithUsername))
	for i, roomData := range roomsWithUsername {
		// Use username if available, fallback to "User {id}"
		hostDisplay := roomData.HostUsername
		if hostDisplay == "" {
			hostDisplay = fmt.Sprintf("User %d", roomData.Room.HostID)
		}
		
		// Check if room has upcoming events
		var upcomingCount int64
		DB.Model(&models.ScheduledEvent{}).
			Where("room_id = ? AND start_time > ?", roomData.Room.ID, time.Now()).
			Count(&upcomingCount)
		
		// Count room members
		var memberCount int64
		DB.Model(&models.UserRoom{}).
			Where("room_id = ?", roomData.Room.ID).
			Count(&memberCount)
		
		roomsResponse[i] = gin.H{
			"id":                  roomData.Room.ID,
			"name":                roomData.Room.Name,
			"description":         roomData.Room.Description,
			"host_id":             roomData.Room.HostID,
			"host_username":       hostDisplay,
			"handle":              roomData.Room.Handle,
			"room_type":           roomData.Room.RoomType,
			"other_room_type":     roomData.Room.OtherRoomType,
			"is_public":           roomData.Room.IsPublic,
			"is_temporary":        roomData.Room.IsTemporary,
			"media_file_name":     roomData.Room.MediaFileName,
			"playback_state":      roomData.Room.PlaybackState,
			"playback_time":       roomData.Room.PlaybackTime,
			"created_at":          roomData.Room.CreatedAt,
			"currently_playing":   roomData.Room.CurrentlyPlaying,
			"coming_next":         roomData.Room.ComingNext,
			"is_screen_sharing":   roomData.Room.IsScreenSharing,
			"image_url":           roomData.Room.ImageURL,
			"has_upcoming_events": upcomingCount > 0,
			"upcoming_events_count": upcomingCount,
			"average_rating":      roomData.Room.AverageRating,
			"total_ratings":       roomData.Room.TotalRatings,
			"member_count":        memberCount,
			"is_active_session":   roomData.IsActiveSession,
			"is_member":           roomData.IsMember,
		}
	}

	// Respond with the list of rooms and pagination info.
	log.Printf("GetRoomsHandler: Fetched %d rooms (offset: %d, limit: %d, total: %d)", len(roomsWithUsername), offset, limit, totalCount)
	c.JSON(http.StatusOK, gin.H {
		"message":     "Rooms fetched successfully",
		"count":       len(roomsWithUsername),
		"total_count": totalCount,
		"offset":      offset,
		"limit":       limit,
		"has_more":    offset + len(roomsWithUsername) < int(totalCount),
		"rooms":       roomsResponse,
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
            "id":         userRoom.UserID,
            "username":   userRoom.User.Username,
            "avatar_url": userRoom.User.AvatarURL, // ✅ Include avatar URL
            "is_host":    isHost,
            "user_role":  userRoom.UserRole,
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
    
    // Cascade delete all related records in a transaction
    err = DB.Transaction(func(tx *gorm.DB) error {
        roomIDUint := uint(roomID)
        
        // 1. Delete media items
        if err := tx.Where("room_id = ?", roomIDUint).Delete(&models.MediaItem{}).Error; err != nil {
            return err
        }
        
        // 2. Delete temporary media items
        if err := tx.Where("room_id = ?", roomIDUint).Delete(&models.TemporaryMediaItem{}).Error; err != nil {
            return err
        }
        
        // 3. Delete scheduled events
        if err := tx.Where("room_id = ?", roomIDUint).Delete(&models.ScheduledEvent{}).Error; err != nil {
            return err
        }
        
        // 4. Delete room TV content
        if err := tx.Where("room_id = ?", roomIDUint).Delete(&models.RoomTVContent{}).Error; err != nil {
            return err
        }
        
        // 5. Delete room messages (chat)
        if err := tx.Where("room_id = ?", roomIDUint).Delete(&models.RoomMessage{}).Error; err != nil {
            return err
        }
        
        // 6. Delete watch sessions
        // Get all session IDs for this room (needed for broadcast request cleanup)
        var sessionIDs []string
        if err := tx.Model(&models.WatchSession{}).Where("room_id = ?", roomIDUint).Pluck("session_id", &sessionIDs).Error; err != nil {
            return err
        }
        
        // Delete watch sessions
        if err := tx.Where("room_id = ?", roomIDUint).Delete(&models.WatchSession{}).Error; err != nil {
            return err
        }
        
        // 7. Delete broadcast requests and permissions (both linked via watch_session_id, not room_id)
        if len(sessionIDs) > 0 {
            // First, get the numeric IDs of sessions (both models use uint watch_session_id)
            var sessionNumericIDs []uint
            if err := tx.Model(&models.WatchSession{}).Where("session_id IN ?", sessionIDs).Pluck("id", &sessionNumericIDs).Error; err != nil {
                log.Printf("Warning: Failed to get session IDs for broadcast cleanup: %v", err)
            } else if len(sessionNumericIDs) > 0 {
                // Delete broadcast requests
                if err := tx.Where("watch_session_id IN ?", sessionNumericIDs).Delete(&models.BroadcastRequest{}).Error; err != nil {
                    log.Printf("Warning: Failed to delete broadcast requests: %v", err)
                }
                // Delete broadcast permissions
                if err := tx.Where("watch_session_id IN ?", sessionNumericIDs).Delete(&models.BroadcastPermission{}).Error; err != nil {
                    log.Printf("Warning: Failed to delete broadcast permissions: %v", err)
                }
            }
        }
        
        // 9. Delete user room memberships
        if err := tx.Where("room_id = ?", roomIDUint).Delete(&models.UserRoom{}).Error; err != nil {
            return err
        }
        
        // 10. Finally, delete the room itself
        if err := tx.Delete(&room, roomIDUint).Error; err != nil {
            return err
        }
        
        return nil
    })
    
    if err != nil {
        log.Printf("Error deleting room %d: %v", roomID, err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete room and related data"})
        return
    }
    
    // Queue file deletion in background (non-blocking)
    go func() {
        roomIDUint := uint(roomID)
        
        // Delete uploaded media files
        var mediaItems []models.MediaItem
        if err := DB.Unscoped().Where("room_id = ?", roomIDUint).Find(&mediaItems).Error; err == nil {
            for _, item := range mediaItems {
                if item.FilePath != "" {
                    os.Remove(item.FilePath)
                    log.Printf("Deleted file: %s", item.FilePath)
                }
                // Also delete poster if exists
                if item.PosterURL != "" {
                    os.Remove(item.PosterURL)
                    log.Printf("Deleted poster: %s", item.PosterURL)
                }
            }
        }
        
        // Delete temporary media files
        var tempItems []models.TemporaryMediaItem
        if err := DB.Unscoped().Where("room_id = ?", roomIDUint).Find(&tempItems).Error; err == nil {
            for _, item := range tempItems {
                if item.FilePath != "" {
                    os.Remove(item.FilePath)
                    log.Printf("Deleted temp file: %s", item.FilePath)
                }
            }
        }
        
        log.Printf("Room %d and all related files deleted successfully", roomID)
    }()
    
    // Broadcast room deletion via WebSocket to room members
    broadcastMsg := map[string]interface{}{
        "type":    "room_deleted",
        "room_id": uint(roomID),
        "message": "This room has been deleted by the host",
    }
    if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
        hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
    }
    
    // Broadcast to lobby for real-time room list updates
    lobbyBroadcastData := map[string]interface{}{
        "type":    "room_deleted",
        "room_id": uint(roomID),
    }
    if lobbyJsonData, err := json.Marshal(lobbyBroadcastData); err == nil {
        hub.BroadcastToLobby(OutgoingMessage{
            Data:     lobbyJsonData,
            IsBinary: false,
        })
    }
    
    // Clear main_room_id on the host if it pointed to this room
    DB.Model(&models.User{}).
        Where("id = ? AND main_room_id = ?", userID, uint(roomID)).
        Update("main_room_id", nil)

    c.JSON(http.StatusOK, gin.H{
        "message": "Room and all related data deleted successfully",
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
	err = DB.Where("room_id = ? AND ended_at IS NULL AND is_active = ?", roomID, true).
		Order("started_at DESC").
		First(&session).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusOK, gin.H{
				"session_id":   nil,
				"is_existing":  false,
				"started_at":   nil,
				"member_count": 0,
			})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "DB error"})
		}
		return
	}

	// ✅ Count active members
	var memberCount int64
	DB.Model(&models.WatchSessionMember{}).
		Where("watch_session_id = ? AND is_active = ?", session.ID, true).
		Count(&memberCount)

	// ✅ Fetch active members with user details
	type MemberResponse struct {
		UserID    uint   `json:"user_id"`
		Username  string `json:"username"`
		AvatarURL string `json:"avatar_url"`
		IsActive  bool   `json:"is_active"`
		UserRole  string `json:"user_role"`
	}
	
	var members []MemberResponse
	DB.Table("watch_session_members").
		Select("watch_session_members.user_id, users.username, users.avatar_url, watch_session_members.is_active, user_rooms.user_role").
		Joins("JOIN users ON users.id = watch_session_members.user_id").
		Joins("JOIN user_rooms ON user_rooms.user_id = watch_session_members.user_id AND user_rooms.room_id = ?", roomID).
		Where("watch_session_members.watch_session_id = ? AND watch_session_members.is_active = ?", session.ID, true).
		Scan(&members)
	
	// Reduced logging - content_rating: %s (found %d members)
	
	// ✅ Fetch host username for ticket purchase modal
	var hostUser models.User
	hostName := "Unknown Host"
	if err := DB.First(&hostUser, session.HostID).Error; err == nil {
		hostName = hostUser.Username
	} else {
		log.Printf("⚠️ [GetActiveSessionHandler] Failed to load host user: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{
		"id":                     session.ID,  // Numeric DB ID for API calls
		"session_id":            session.SessionID,  // UUID string for WebSocket
		"watch_type":            session.WatchType,
		"class_type":            session.ClassType,
		"session_title":         session.SessionTitle,
		"content_rating":        session.ContentRating,  // ✅ Include content rating
		"host_id":               session.HostID,
		"host_name":             hostName,  // ✅ Add host name for ticket purchase modal
		"is_existing":           true,
		"started_at":            session.StartedAt,
		"member_count":          memberCount,
		"members":               members,
		// ✅ TICKET ENFORCEMENT: Include ticketing fields for frontend validation
		"ticketing_enabled":      session.TicketingEnabled,
		"ticket_price_tokens":    session.TicketPriceTokens,
		"ticket_price_currency":  session.TicketPriceCurrency,
		"ticket_price_amount":    session.TicketPriceAmount,
		// ✅ Early bird pricing fields
		"early_bird_enabled":     session.EarlyBirdEnabled,
		"early_bird_price_tokens": session.EarlyBirdPriceTokens,
		"early_bird_price_amount": session.EarlyBirdPriceAmount,
		"early_bird_active":      session.EarlyBirdActive,
		// ✅ LIVESHARE STATE: Include for late joiners to restore graphics
		"liveshare_mode":         session.LiveshareMode,
		"podcast_title":          session.PodcastTitle,
		"podcast_logo_url":       session.PodcastLogoURL,
		"podcast_guest_user_id":  session.PodcastGuestUserID,
		// Canvas graphics state (JSON strings)
		"liveshare_banner_text":  session.LiveShareBannerText,
		"liveshare_ticker_items": session.LiveShareTickerItems,
		"liveshare_lower_third":  session.LiveShareLowerThird,
		"liveshare_logo_bug":     session.LiveShareLogoBug,
		"liveshare_break_screen": session.LiveShareBreakScreen,
		"liveshare_layout":       session.LiveShareLayout, // Layout selection for display
	})
}

// CreateWatchSessionForRoomHandler creates a WatchSession for a persistent room
func CreateWatchSessionForRoomHandler(c *gin.Context) {
	log.Println("\n🎬🎬🎬 ===== CREATE WATCH SESSION API CALLED =====")
	userID := c.MustGet("user_id").(uint)
	roomID, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	log.Printf("🔍 [CreateWatchSession] User %d creating session for room %d", userID, roomID)

	// Parse watch_type, class_type, ticketing, and content_rating from request body
	var input struct {
		WatchType            string  `json:"watch_type"`              // "video", "3d_cinema", or "classroom"
		ClassType            *string `json:"class_type"`              // "classroom" or "lecture_hall" (for classroom watch_type)
		ContentRating        string  `json:"content_rating"`          // "G", "PG", "13+", "16+", "18+", "Mature"
		TicketingEnabled     bool    `json:"ticketing_enabled"`       // Whether entry requires ticket purchase
		TicketPriceTokens    int     `json:"ticket_price_tokens"`     // Price in tokens
		TicketPriceCurrency  string  `json:"ticket_price_currency"`   // Currency symbol (₦, $, etc.)
		TicketPriceAmount    float64 `json:"ticket_price_amount"`     // Price in local currency
		EarlyBirdEnabled     bool    `json:"early_bird_enabled"`      // Early bird pricing active
		EarlyBirdPriceTokens int     `json:"early_bird_price_tokens"` // Early bird price in tokens
		EarlyBirdPriceAmount float64 `json:"early_bird_price_amount"` // Early bird price in local currency
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		log.Printf("⚠️ [CreateWatchSession] JSON bind error: %v - using defaults", err)
		// Default to "video" if not specified
		input.WatchType = "video"
	}
	
	log.Printf("📥 [CreateWatchSession] RAW INPUT RECEIVED:")
	log.Printf("  ├─ content_rating: '%s'", input.ContentRating)
	log.Printf("  ├─ watch_type: '%s'", input.WatchType)
	log.Printf("  ├─ class_type: %v", input.ClassType)
	log.Printf("  ├─ ticketing_enabled: %v", input.TicketingEnabled)
	log.Printf("🎬 [CreateWatchSession] Received ticketing_enabled: %v", input.TicketingEnabled)
	log.Printf("🎬 [CreateWatchSession] Received watch_type: '%s', class_type: %v", input.WatchType, input.ClassType)
	
	// Validate watch_type
	if input.WatchType != "video" && input.WatchType != "3d_cinema" && input.WatchType != "classroom" {
		input.WatchType = "video"
	}
	
	// Handle class_type for classroom watch_type
	var classType string
	if input.WatchType == "classroom" {
		if input.ClassType != nil && (*input.ClassType == "classroom" || *input.ClassType == "lecture_hall") {
			classType = *input.ClassType
		} else {
			classType = "lecture_hall" // Default
		}
	}
	
	// Validate content_rating
	log.Printf("🔍 [CreateWatchSession] Starting content_rating validation...")
	log.Printf("  ├─ Input value: '%s' (length: %d)", input.ContentRating, len(input.ContentRating))
	contentRating := "G" // Default to 'G' if not provided or invalid
	validRatings := []string{"G", "PG", "Educational", "Religious", "13+", "16+", "18+", "Mature"}
	matched := false
	for _, rating := range validRatings {
		log.Printf("  ├─ Comparing '%s' == '%s' ? %v", input.ContentRating, rating, input.ContentRating == rating)
		if input.ContentRating == rating {
			contentRating = rating
			matched = true
			log.Printf("✅ [CreateWatchSession] Valid content_rating matched: '%s'", contentRating)
			break
		}
	}
	if !matched {
		log.Printf("⚠️ [CreateWatchSession] NO MATCH FOUND! Defaulting to 'G'. Input was: '%s'", input.ContentRating)
	}
	
	// Early bird pricing is managed by the utils.StartEarlyBirdScheduler
	// It auto-deactivates 1 hour before scheduled events

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

	// ✅ Check for existing active session before creating new one
	log.Printf("🔍 [CreateWatchSession] Checking for existing active session in room %d...", roomID)
	var existingSession models.WatchSession
	result := DB.Where("room_id = ? AND ended_at IS NULL AND is_active = ?", roomID, true).First(&existingSession)
	if result.Error == nil {
		// Active session already exists - return it
		log.Printf("⚠️⚠️⚠️ EXISTING SESSION FOUND!")
		log.Printf("  ├─ Session ID: %s", existingSession.SessionID)
		log.Printf("  ├─ Watch Type: %s", existingSession.WatchType)
		log.Printf("  ├─ Content Rating: '%s'", existingSession.ContentRating)
		log.Printf("  ├─ Started At: %v", existingSession.StartedAt)
		log.Printf("  ├─ Is Active: %v", existingSession.IsActive)
		log.Printf("  └─ RETURNING EXISTING SESSION (not creating new one)")
		
		// Count active members
		var memberCount int64
		DB.Model(&models.WatchSessionMember{}).Where("watch_session_id = ? AND is_active = ?", existingSession.ID, true).Count(&memberCount)
		
		c.JSON(200, gin.H{
			"session_id":   existingSession.SessionID,
			"watch_type":   existingSession.WatchType,
			"is_existing":  true,
			"started_at":   existingSession.StartedAt,
			"member_count": memberCount,
			"message":      "Active session already exists",
		})
		return
	}

	// No active session found - create new session
	log.Printf("✅ [CreateWatchSession] No existing session - creating NEW session")
	sessionID := uuid.New().String()
	log.Printf("🆕 [CreateWatchSession] Generated session_id: %s", sessionID)
	log.Printf("📝 [CreateWatchSession] Session struct being created with:")
	log.Printf("  ├─ content_rating: '%s'", contentRating)
	log.Printf("  ├─ watch_type: '%s'", input.WatchType)
	log.Printf("  ├─ class_type: '%s'", classType)
	log.Printf("  └─ is_active: true")
	session := models.WatchSession{
		SessionID:         sessionID,
		RoomID:            uint(roomID),
		HostID:            userID,
		WatchType:         input.WatchType,
		ClassType:         classType,         // ✅ Set class_type for classroom sessions
		ContentRating:     contentRating,     // ✅ Set content rating
		StartedAt:         time.Now(),
		IsActive:          true,
	}
	
	// Only populate ticketing fields if ticketing is enabled
	if input.TicketingEnabled {
		session.TicketingEnabled = true
		session.TicketPriceTokens = input.TicketPriceTokens
		session.TicketPriceCurrency = input.TicketPriceCurrency
		session.TicketPriceAmount = input.TicketPriceAmount
		
		// Only populate early bird fields if early bird is also enabled
		if input.EarlyBirdEnabled {
			session.EarlyBirdEnabled = true
			session.EarlyBirdPriceTokens = input.EarlyBirdPriceTokens
			session.EarlyBirdPriceAmount = input.EarlyBirdPriceAmount
			session.EarlyBirdActive = true // Default to active, scheduler will deactivate later
		}
	}
	
	if err := DB.Create(&session).Error; err != nil {
		log.Printf("❌ Failed to create watch session: %v", err)
		c.JSON(500, gin.H{"error": "Failed to create session"})
		return
	}

	// Broadcast session_started to lobby (updates session list) + targeted alert to room members
	go func(sid string, rid uint, wt string, hostID uint, roomName string) {
		hub := GetHub()
		if hub == nil {
			return
		}
		var host models.User
		DB.Select("username").First(&host, hostID)

		// Lobby-wide broadcast so the Live tab refreshes for everyone
		lobbyMsg, _ := json.Marshal(map[string]interface{}{
			"type":          "session_started",
			"session_id":    sid,
			"room_id":       rid,
			"room_name":     roomName,
			"host_username": host.Username,
			"watch_type":    wt,
		})
		hub.BroadcastToLobby(OutgoingMessage{Data: lobbyMsg, IsBinary: false})

		// Targeted notification to room members who are in the lobby (not the host)
		var userRooms []models.UserRoom
		DB.Where("room_id = ?", rid).Find(&userRooms)
		var memberIDs []uint
		for _, ur := range userRooms {
			if ur.UserID != hostID {
				memberIDs = append(memberIDs, ur.UserID)
			}
		}
		if len(memberIDs) > 0 {
			memberMsg, _ := json.Marshal(map[string]interface{}{
				"type":          "room_session_started",
				"session_id":    sid,
				"room_id":       rid,
				"room_name":     roomName,
				"host_username": host.Username,
				"watch_type":    wt,
			})
			hub.BroadcastToUsers(memberIDs, OutgoingMessage{Data: memberMsg, IsBinary: false})

			// Persist a notification for each member
			for _, uid := range memberIDs {
				CreateNotification(
					uid,
					"session_started",
					roomName+" is now live!",
					host.Username+" started a watch session",
					"session",
					0, // session DB id not easily available here; entity_id optional
				)
			}
		}
		log.Printf("📢 [CreateWatchSession] Broadcasted session_started for room %d (%s) to lobby + %d members", rid, roomName, len(memberIDs))
	}(sessionID, uint(roomID), input.WatchType, userID, room.Name)

	log.Printf("✅✅✅ [CreateWatchSession] Session SAVED to database!")
	log.Printf("  ├─ session_id: %s", sessionID)
	log.Printf("  ├─ content_rating in struct: '%s'", session.ContentRating)
	log.Printf("  ├─ ticketing_enabled: %v", input.TicketingEnabled)
	
	// Verify what was actually saved
	var savedSession models.WatchSession
	if err := DB.Where("session_id = ?", sessionID).First(&savedSession).Error; err == nil {
		log.Printf("🔍 [CreateWatchSession] VERIFICATION - Reading back from database:")
		log.Printf("  ├─ content_rating from DB: '%s'", savedSession.ContentRating)
		log.Printf("  ├─ watch_type from DB: '%s'", savedSession.WatchType)
		log.Printf("  └─ is_active from DB: %v", savedSession.IsActive)
	} else {
		log.Printf("⚠️ [CreateWatchSession] Could not verify saved session: %v", err)
	}
	log.Printf("📤 [CreateWatchSession] Sending response to frontend:")
	log.Printf("  ├─ content_rating: '%s'", contentRating)
	log.Printf("  ├─ session_id: %s", sessionID)
	log.Printf("  └─ is_existing: false")
	c.JSON(201, gin.H{
		"session_id":             sessionID,
		"watch_type":             input.WatchType,
		"class_type":             classType,
		"content_rating":         contentRating,             // ✅ Return content rating to frontend
		"ticketing_enabled":      input.TicketingEnabled,    // ✅ Return ticketing status
		"ticket_price_tokens":    input.TicketPriceTokens,   // ✅ Return ticket price
		"ticket_price_currency":  input.TicketPriceCurrency, // ✅ Return currency
		"ticket_price_amount":    input.TicketPriceAmount,   // ✅ Return local price
		"early_bird_enabled":     input.EarlyBirdEnabled,    // ✅ Return early bird status
		"early_bird_price_tokens": input.EarlyBirdPriceTokens,
		"early_bird_price_amount": input.EarlyBirdPriceAmount,
		"early_bird_active":      session.EarlyBirdActive,   // ✅ Return active status from session
		"is_existing":            false,
		"started_at":             session.StartedAt,
		"member_count":           0,
	})
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


	// Query the database for the specific room by ID with host username and avatar
	type RoomWithUsername struct {
		models.Room
		HostUsername  string `gorm:"column:host_username"`
		HostAvatarURL string `gorm:"column:host_avatar_url"`
	}
	
	var roomData RoomWithUsername
	result := DB.Table("rooms").
		Select("rooms.*, users.username as host_username, users.avatar_url as host_avatar_url").
		Joins("LEFT JOIN users ON rooms.host_id = users.id").
		Where("rooms.id = ? AND rooms.deleted_at IS NULL", roomIDUint).
		Scan(&roomData)
	
	if result.Error != nil {
		log.Printf("GetRoomHandler: Database error fetching room %d: %v", roomIDUint, result.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	
	if roomData.Room.ID == 0 {
		log.Printf("GetRoomHandler: Room with ID %d not found", roomIDUint)
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	// Use username if available, fallback to "User {id}"
	hostDisplay := roomData.HostUsername
	if hostDisplay == "" {
		hostDisplay = fmt.Sprintf("User %d", roomData.Room.HostID)
	}

	// 5. Room found. Prepare the response.
	log.Printf("GetRoomHandler: Fetched room: ID=%d, Name=%s, Host=%s", roomData.Room.ID, roomData.Room.Name, hostDisplay)
	c.JSON(http.StatusOK, gin.H{
		"message": "Room fetched successfully",
		"room": gin.H{
			"id":              roomData.Room.ID,
			"name":            roomData.Room.Name,
			"description":     roomData.Room.Description,
			"host_id":         roomData.Room.HostID,
			"host_username":   hostDisplay,
			"host_avatar_url": roomData.HostAvatarURL,
			"handle":          roomData.Room.Handle,
			"room_type":       roomData.Room.RoomType,
			"other_room_type": roomData.Room.OtherRoomType,
			"media_file_name": roomData.Room.MediaFileName,
			"playback_state":  roomData.Room.PlaybackState,
			"playback_time":   roomData.Room.PlaybackTime,
			"created_at":      roomData.Room.CreatedAt,
			"image_url":       roomData.Room.ImageURL,
			"loop_mode":       roomData.Room.LoopMode,
			"currently_playing":  roomData.Room.CurrentlyPlaying,
			"coming_next":        roomData.Room.ComingNext,
			"is_screen_sharing":  roomData.Room.IsScreenSharing,
		},
	})
}
