
package handlers

import (
    "net/http"
    "strconv"
    
    "github.com/gin-gonic/gin"
    "gorm.io/gorm"
    "wewatch-backend/internal/models"
)

// SetUserRoleHandler handles PUT /api/rooms/:id/users/:user_id/role
// Allows room hosts to set user roles
func SetUserRoleHandler(c *gin.Context) {
    // Get room ID from URL
    roomIDStr := c.Param("id")
    if roomIDStr == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Room ID is required"})
        return
    }
    
    // Get user ID from URL
    userIDStr := c.Param("user_id")
    if userIDStr == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "User ID is required"})
        return
    }
    
    // Get role from request body
    var requestData struct {
        Role string `json:"role"`
    }
    if err := c.ShouldBindJSON(&requestData); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request data"})
        return
    }
    
    // Validate role
    validRoles := []string{"member", "admin", "host"}
    isValidRole := false
    for _, role := range validRoles {
        if role == requestData.Role {
            isValidRole = true
            break
        }
    }
    if !isValidRole {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid role. Must be 'member', 'admin', or 'host'"})
        return
    }
    
    // Convert IDs
    roomID, _ := strconv.ParseUint(roomIDStr, 10, 64)
    userID, _ := strconv.ParseUint(userIDStr, 10, 64)
    
    // Check if user is in room and is authorized to change roles
    // This is a simplified check - you'd want proper auth here
    var userRoom models.UserRoom
    result := DB.Where("room_id = ? AND user_id = ?", roomID, userID).First(&userRoom)
    if result.Error != nil {
        if result.Error == gorm.ErrRecordNotFound {
            c.JSON(http.StatusNotFound, gin.H{"error": "User is not in this room"})
            return
        } else {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
            return
        }
    }
    
    // Update user role
    userRoom.UserRole = requestData.Role
    result = DB.Save(&userRoom)
    if result.Error != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user role"})
        return
    }
    
    c.JSON(http.StatusOK, gin.H{
        "message": "User role updated successfully",
        "user_room": userRoom,
    })
}

// GetUserRoleHandler handles GET /api/rooms/:id/users/:user_id/role
// Gets a specific user's role in a room
func GetUserRoleHandler(c *gin.Context) {
    roomIDStr := c.Param("id")
    userIDStr := c.Param("user_id")
    
    if roomIDStr == "" || userIDStr == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Room ID and User ID are required"})
        return
    }
    
    roomID, _ := strconv.ParseUint(roomIDStr, 10, 64)
    userID, _ := strconv.ParseUint(userIDStr, 10, 64)
    
    var userRoom models.UserRoom
    result := DB.Where("room_id = ? AND user_id = ?", roomID, userID).First(&userRoom)
    if result.Error != nil {
        if result.Error == gorm.ErrRecordNotFound {
            c.JSON(http.StatusNotFound, gin.H{"error": "User is not in this room"})
            return
        } else {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
            return
        }
    }
    
    c.JSON(http.StatusOK, gin.H{
        "user_id":  userRoom.UserID,
        "room_id":  userRoom.RoomID,
        "user_role": userRoom.UserRole,
    })
}

// JoinRoomHandler handles POST /api/rooms/:id/join
// Allows users to join a room
func JoinRoomHandler(c *gin.Context) {
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
    
    // Check if user is already in room
    var existingUserRoom models.UserRoom
    result := DB.Where("user_id = ? AND room_id = ?", userID, roomID).First(&existingUserRoom)
    if result.Error == nil {
        // User already in room
        c.JSON(http.StatusOK, gin.H{
            "message": "User already in room",
            "user_room": existingUserRoom,
        })
        return
    }
    
    // Add user to room
    userRoom := models.UserRoom{
        UserID:   userID,
        RoomID:   uint(roomID),
        UserRole: "member", // Default role
    }
    
    result = DB.Create(&userRoom)
    if result.Error != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to join room"})
        return
    }
    
    c.JSON(http.StatusOK, gin.H{
        "message": "Successfully joined room",
        "user_room": userRoom,
    })
}

// LeaveRoomHandler handles POST /api/rooms/:id/leave
// Allows users to leave a room
func LeaveRoomHandler(c *gin.Context) {
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
    
    // Delete user from room
    result := DB.Where("user_id = ? AND room_id = ?", userID, roomID).Delete(&models.UserRoom{})
    if result.Error != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to leave room"})
        return
    }
    
    if result.RowsAffected == 0 {
        c.JSON(http.StatusNotFound, gin.H{"error": "User is not in this room"})
        return
    }
    
    c.JSON(http.StatusOK, gin.H{
        "message": "Successfully left room",
    })
}