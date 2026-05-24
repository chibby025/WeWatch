
package handlers

import (
    "encoding/json"
    "net/http"
    "strconv"
    "log"
    "time"

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

// internal/handlers/room_membership.go (or wherever JoinRoomHandler is defined)

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
    
    // Fetch room to check privacy
    var room models.Room
    if err := DB.First(&room, roomID).Error; err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
        return
    }

    // Check if user is already in room (any status)
    var existingUserRoom models.UserRoom
    result := DB.Where("user_id = ? AND room_id = ?", userID, roomID).First(&existingUserRoom)
    if result.Error == nil {
        if existingUserRoom.IsBanned || existingUserRoom.Status == "banned" {
            c.JSON(http.StatusForbidden, gin.H{"error": "You have been banned from this room"})
            return
        }
        msg := "User already in room"
        if existingUserRoom.Status == "pending" {
            msg = "Join request already pending"
        }
        c.JSON(http.StatusOK, gin.H{
            "message":   msg,
            "user_room": existingUserRoom,
            "status":    existingUserRoom.Status,
        })
        return
    }

    // Private rooms: create a pending request and notify the host
    joinStatus := "active"
    if !room.IsPublic && room.HostID != userID {
        joinStatus = "pending"
    }

    userRoom := models.UserRoom{
        UserID:   userID,
        RoomID:   uint(roomID),
        UserRole: "member",
        Status:   joinStatus,
    }

    result = DB.Create(&userRoom)
    if result.Error != nil {
        log.Printf("Database error joining room %d for user %d: %v", roomID, userID, result.Error)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to join room"})
        return
    }

    // Notify host of pending join request for private rooms
    if joinStatus == "pending" {
        hub := GetWebSocketManager()
        if hub != nil {
            var joiningUser models.User
            DB.First(&joiningUser, userID)
            wsPayload := map[string]interface{}{
                "type":       "room_join_request",
                "room_id":    room.ID,
                "room_name":  room.Name,
                "user_id":    userID,
                "username":   joiningUser.Username,
                "avatar_url": joiningUser.AvatarURL,
                "timestamp":  time.Now().Unix(),
            }
            data, _ := json.Marshal(wsPayload)
            hub.BroadcastToUsers([]uint{room.HostID}, OutgoingMessage{Data: data})
        }

        c.JSON(http.StatusOK, gin.H{
            "message":   "Join request sent — awaiting host approval",
            "user_room": userRoom,
            "status":    "pending",
        })
        return
    }

    c.JSON(http.StatusOK, gin.H{
        "message":   "Successfully joined room",
        "user_room": userRoom,
        "status":    "active",
    })
}

// KickMemberHandler handles DELETE /api/rooms/:id/members/:user_id
// Host-only: removes a member from the room immediately (they can rejoin)
func KickMemberHandler(c *gin.Context) {
    callerIDVal, exists := c.Get("user_id")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }
    callerID := callerIDVal.(uint)

    roomID, err := strconv.ParseUint(c.Param("id"), 10, 64)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
        return
    }
    targetID, err := strconv.ParseUint(c.Param("user_id"), 10, 64)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
        return
    }

    // Only host of the room may kick
    var room models.Room
    if err := DB.First(&room, roomID).Error; err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
        return
    }
    if room.HostID != callerID {
        c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can kick members"})
        return
    }
    if uint(targetID) == callerID {
        c.JSON(http.StatusBadRequest, gin.H{"error": "You cannot kick yourself"})
        return
    }

    result := DB.Where("room_id = ? AND user_id = ?", roomID, targetID).Delete(&models.UserRoom{})
    if result.Error != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to kick member"})
        return
    }
    if result.RowsAffected == 0 {
        c.JSON(http.StatusNotFound, gin.H{"error": "Member not found in room"})
        return
    }

    // Notify the kicked user via WebSocket
    hub := GetWebSocketManager()
    if hub != nil {
        payload := map[string]interface{}{
            "type":    "kicked_from_room",
            "room_id": roomID,
            "reason":  "kicked",
        }
        data, _ := json.Marshal(payload)
        hub.BroadcastToUsers([]uint{uint(targetID)}, OutgoingMessage{Data: data})
    }

    log.Printf("👢 [KickMember] Host %d kicked user %d from room %d", callerID, targetID, roomID)
    c.JSON(http.StatusOK, gin.H{"message": "Member kicked"})
}

// BanMemberHandler handles POST /api/rooms/:id/members/:user_id/ban
// Host-only: marks member as banned so they cannot rejoin
func BanMemberHandler(c *gin.Context) {
    callerIDVal, exists := c.Get("user_id")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }
    callerID := callerIDVal.(uint)

    roomID, err := strconv.ParseUint(c.Param("id"), 10, 64)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
        return
    }
    targetID, err := strconv.ParseUint(c.Param("user_id"), 10, 64)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
        return
    }

    var room models.Room
    if err := DB.First(&room, roomID).Error; err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
        return
    }
    if room.HostID != callerID {
        c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can ban members"})
        return
    }
    if uint(targetID) == callerID {
        c.JSON(http.StatusBadRequest, gin.H{"error": "You cannot ban yourself"})
        return
    }

    now := time.Now()
    // Upsert: mark as banned (keep record so JoinRoom can check it)
    var userRoom models.UserRoom
    dbErr := DB.Where("room_id = ? AND user_id = ?", roomID, targetID).First(&userRoom).Error
    if dbErr == gorm.ErrRecordNotFound {
        // Not a member — create a banned record to block future joins
        userRoom = models.UserRoom{
            RoomID:   uint(roomID),
            UserID:   uint(targetID),
            UserRole: "member",
            Status:   "banned",
            IsBanned: true,
            BannedAt: &now,
        }
        DB.Create(&userRoom)
    } else if dbErr == nil {
        userRoom.IsBanned = true
        userRoom.BannedAt = &now
        userRoom.Status = "banned"
        DB.Save(&userRoom)
    } else {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }

    // Notify the banned user via WebSocket
    hub := GetWebSocketManager()
    if hub != nil {
        payload := map[string]interface{}{
            "type":    "kicked_from_room",
            "room_id": roomID,
            "reason":  "banned",
        }
        data, _ := json.Marshal(payload)
        hub.BroadcastToUsers([]uint{uint(targetID)}, OutgoingMessage{Data: data})
    }

    log.Printf("🚫 [BanMember] Host %d banned user %d from room %d", callerID, targetID, roomID)
    c.JSON(http.StatusOK, gin.H{"message": "Member banned"})
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