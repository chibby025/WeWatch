package handlers

import (
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
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

    // Assert the type of userID(should be uint)
    id, ok := userID.(uint)
    if !ok {
        log.Println("CreateRoomHandler: Error asserting user ID type")
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
        return
    }

    // Bind the incoming JSON request body to the CreateRoomInput struct.
    var input CreateRoomInput
    if err := c.ShouldBindJSON(&input); err != nil {
        log.Printf("CreateRoomHandler: Error binding input:  %v", err)
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // Create a new Room instance using the input data and the authenticated user's ID as HostID
    newRoom := models.Room {
        Name:        input.Name,
        Description: input.Description, // ✅ This will include the description
        HostID:      id, // Set HostID to the authenticated user's ID
        // MediaFileName, PlaybackState, PlaybackTime will use their default values from the model
        // (e.g., empty string, "paused", 0.0)
    }

    // Save the new room to the database FIRST
    result := DB.Create(&newRoom)
    if result.Error != nil {
        log.Printf("CreateRoomHandler: Error creating room in database: %v", result.Error)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create room"})
        return
    }

    // Now that the room exists, add the host as a member
    userRoom := models.UserRoom{
        UserID:   newRoom.HostID,  // ✅ Use newRoom.HostID, not room.HostID
        RoomID:   newRoom.ID,      // ✅ Use newRoom.ID, not room.ID
        UserRole: "host",          // Set host role
    }

    // Save the user-room relationship
    result = DB.Create(&userRoom)
    if result.Error != nil {
        log.Printf("CreateRoomHandler: Error adding host as member: %v", result.Error)
        // Don't fail the room creation, just log the error
        // The room still exists, it's just that the host won't show up in member list
    }

    // Room Created Successfully
    log.Printf("CreateRoomHandler: Room created successfully: ID=%d, Name=%s, HostID=%d", newRoom.ID, newRoom.Name, newRoom.HostID)

    // Respond with the created room details (excluding sensitive internal fields if any).
    c.JSON(http.StatusCreated, gin.H{
        "message": "Room created successfully",
        "room": gin.H{
            "id":              newRoom.ID,
            "name":            newRoom.Name,
            "description":     newRoom.Description, // ✅ This will now include the description
            "host_id":         newRoom.HostID,
            // You might not want to send these initial default values, or you can
            "media_file_name": newRoom.MediaFileName, // Will be ""
            "playback_state":  newRoom.PlaybackState,  // Will be "paused"
            "playback_time":   newRoom.PlaybackTime,   // Will be 0.0
            "created_at":      newRoom.CreatedAt,
        },
    })
}

// GetRoomsHandler handles the GET /api/rooms endpoint
// This could return a list of public rooms/rooms the user is a part of
// For MVP simplicity, lets return all rooms for now
// Will require authentication
func GetRoomsHandler(c *gin.Context) {
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

	// 3. Get the authenticated user's ID (optional, maybe for permission checks later)
	// userID, exists := c.Get("user_id")
	// if !exists {
	//	 log.Println("GetRoomHandler: Unauthorized access, user_id not found in context")
	//	 c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
	//	 return
	// }

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
			// Add host details or member list later if needed
		},
	})
}


// --- Placeholder for Future Handlers ---
// We will add more handlers as you build features:
// func UpdateRoomHandler(c *gin.Context) { ... } // PUT /api/rooms/:id
// func DeleteRoomHandler(c *gin.Context) { ... } // DELETE /api/rooms/:id
// func JoinRoomHandler(c *gin.Context) { ... }   // POST /api/rooms/:id/join
// func UploadMediaHandler(c *gin.Context) { ... } // POST /api/rooms/:id/upload (multipart/form-data)
// func UpdatePlaybackHandler(c *gin.Context) { ... } // POST /api/rooms/:id/playback (for sync commands)