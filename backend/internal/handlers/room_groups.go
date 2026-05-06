// WeWatch/backend/internal/handlers/room_groups.go
package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// CreateRoomGroupInput defines the structure for creating a room group
type CreateRoomGroupInput struct {
	Name        string `json:"name" binding:"required,min=1,max=100"`
	Description string `json:"description" binding:"max=500"`
	Icon        string `json:"icon" binding:"max=50"` // Emoji or icon identifier
	IsPublic    *bool  `json:"is_public"`            // Default to true
}

// CreateRoomGroupHandler creates a new group within a room (host only)
func CreateRoomGroupHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	currentUserID := userID.(uint)

	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// Verify user is the room host
	var room models.Room
	if err := DB.First(&room, roomID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
			return
		}
		log.Printf("Error fetching room: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch room"})
		return
	}

	if room.HostID != currentUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can create groups"})
		return
	}

	// Bind input
	var input CreateRoomGroupInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Default isPublic to true if not provided
	isPublic := true
	if input.IsPublic != nil {
		isPublic = *input.IsPublic
	}

	// Get current group count for display order
	var groupCount int64
	DB.Model(&models.RoomGroup{}).Where("room_id = ?", roomID).Count(&groupCount)

	// Create room group
	roomGroup := models.RoomGroup{
		RoomID:       uint(roomID),
		Name:         input.Name,
		Description:  input.Description,
		Icon:         input.Icon,
		CreatedBy:    currentUserID,
		IsPublic:     isPublic,
		DisplayOrder: int(groupCount), // Append to end
	}

	if err := DB.Create(&roomGroup).Error; err != nil {
		log.Printf("Error creating room group: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create room group"})
		return
	}

	// Preload creator info
	DB.Preload("Creator").First(&roomGroup, roomGroup.ID)

	// Broadcast to room via WebSocket
	hub := GetWebSocketManager()
	if hub != nil {
		broadcastMsg := map[string]interface{}{
			"type": "room_group_created",
			"data": map[string]interface{}{
				"room_group": roomGroup,
			},
		}
		if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
			hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
		}
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":    "Room group created successfully",
		"room_group": roomGroup,
	})
}

// GetRoomGroupsHandler returns all groups in a room
func GetRoomGroupsHandler(c *gin.Context) {
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// Verify room exists
	var room models.Room
	if err := DB.First(&room, roomID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch room"})
		return
	}

	// Get all groups for this room (ordered by display_order)
	var groups []models.RoomGroup
	if err := DB.Where("room_id = ?", roomID).
		Preload("Creator").
		Order("display_order ASC, created_at ASC").
		Find(&groups).Error; err != nil {
		log.Printf("Error fetching room groups: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch room groups"})
		return
	}

	// Get member counts for each group
	type GroupWithCount struct {
		models.RoomGroup
		MemberCount int64 `json:"member_count"`
	}

	groupsWithCounts := make([]GroupWithCount, len(groups))
	for i, group := range groups {
		var memberCount int64
		DB.Model(&models.UserRoomGroup{}).Where("room_group_id = ?", group.ID).Count(&memberCount)
		
		groupsWithCounts[i] = GroupWithCount{
			RoomGroup:   group,
			MemberCount: memberCount,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"groups": groupsWithCounts,
		"count":  len(groupsWithCounts),
	})
}

// UpdateRoomGroupHandler updates a room group (host only)
func UpdateRoomGroupHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	currentUserID := userID.(uint)

	roomIDStr := c.Param("id")
	groupIDStr := c.Param("groupId")
	
	roomID, err := strconv.ParseUint(roomIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	
	groupID, err := strconv.ParseUint(groupIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	// Verify user is the room host
	var room models.Room
	if err := DB.First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	if room.HostID != currentUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can update groups"})
		return
	}

	// Fetch the group
	var group models.RoomGroup
	if err := DB.Where("id = ? AND room_id = ?", groupID, roomID).First(&group).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch group"})
		return
	}

	// Bind update data
	var input CreateRoomGroupInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Update fields
	group.Name = input.Name
	group.Description = input.Description
	group.Icon = input.Icon
	if input.IsPublic != nil {
		group.IsPublic = *input.IsPublic
	}

	if err := DB.Save(&group).Error; err != nil {
		log.Printf("Error updating room group: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update room group"})
		return
	}

	// Broadcast to room via WebSocket
	hub := GetWebSocketManager()
	if hub != nil {
		broadcastMsg := map[string]interface{}{
			"type": "room_group_updated",
			"data": map[string]interface{}{
				"room_group": group,
			},
		}
		if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
			hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    "Room group updated successfully",
		"room_group": group,
	})
}

// DeleteRoomGroupHandler deletes a room group (host only)
func DeleteRoomGroupHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	currentUserID := userID.(uint)

	roomIDStr := c.Param("id")
	groupIDStr := c.Param("groupId")
	
	roomID, err := strconv.ParseUint(roomIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	
	groupID, err := strconv.ParseUint(groupIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	// Verify user is the room host
	var room models.Room
	if err := DB.First(&room, roomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	if room.HostID != currentUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can delete groups"})
		return
	}

	// Fetch the group
	var group models.RoomGroup
	if err := DB.Where("id = ? AND room_id = ?", groupID, roomID).First(&group).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch group"})
		return
	}

	// Delete group (cascades to user_room_groups and sets room_group_id to NULL in messages)
	if err := DB.Delete(&group).Error; err != nil {
		log.Printf("Error deleting room group: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete room group"})
		return
	}

	// Broadcast to room via WebSocket
	hub := GetWebSocketManager()
	if hub != nil {
		broadcastMsg := map[string]interface{}{
			"type": "room_group_deleted",
			"data": map[string]interface{}{
				"room_group_id": groupID,
			},
		}
		if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
			hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Room group deleted successfully",
	})
}

// JoinRoomGroupHandler allows a user to join a room group
func JoinRoomGroupHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	currentUserID := userID.(uint)

	roomIDStr := c.Param("id")
	groupIDStr := c.Param("groupId")
	
	roomID, err := strconv.ParseUint(roomIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	
	groupID, err := strconv.ParseUint(groupIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	// Verify user is a member of the room
	var userRoom models.UserRoom
	if err := DB.Where("user_id = ? AND room_id = ?", currentUserID, roomID).First(&userRoom).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "You must be a room member to join groups"})
		return
	}

	// Verify group exists and belongs to this room
	var group models.RoomGroup
	if err := DB.Where("id = ? AND room_id = ?", groupID, roomID).First(&group).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch group"})
		return
	}

	// Check if already a member
	var existingMembership models.UserRoomGroup
	err = DB.Where("user_id = ? AND room_group_id = ?", currentUserID, groupID).First(&existingMembership).Error
	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Already a member of this group"})
		return
	}

	// Create membership
	membership := models.UserRoomGroup{
		UserID:      currentUserID,
		RoomGroupID: uint(groupID),
	}

	if err := DB.Create(&membership).Error; err != nil {
		log.Printf("Error joining room group: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to join room group"})
		return
	}

	// Broadcast to room via WebSocket
	hub := GetWebSocketManager()
	if hub != nil {
		broadcastMsg := map[string]interface{}{
			"type": "user_joined_group",
			"data": map[string]interface{}{
				"group_id": groupID,
				"user_id":  currentUserID,
			},
		}
		if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
			hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Joined room group successfully",
	})
}

// LeaveRoomGroupHandler allows a user to leave a room group
func LeaveRoomGroupHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	currentUserID := userID.(uint)

	roomIDStr := c.Param("id")
	groupIDStr := c.Param("groupId")
	
	roomID, err := strconv.ParseUint(roomIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	
	groupID, err := strconv.ParseUint(groupIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	// Delete membership
	result := DB.Where("user_id = ? AND room_group_id = ?", currentUserID, groupID).
		Delete(&models.UserRoomGroup{})

	if result.Error != nil {
		log.Printf("Error leaving room group: %v", result.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to leave room group"})
		return
	}

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Not a member of this group"})
		return
	}

	// Broadcast to room via WebSocket
	hub := GetWebSocketManager()
	if hub != nil {
		broadcastMsg := map[string]interface{}{
			"type": "user_left_group",
			"data": map[string]interface{}{
				"group_id": groupID,
				"user_id":  currentUserID,
			},
		}
		if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
			hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Left room group successfully",
	})
}

// GetRoomGroupMembersHandler returns all members of a room group
func GetRoomGroupMembersHandler(c *gin.Context) {
	roomIDStr := c.Param("id")
	groupIDStr := c.Param("groupId")
	
	roomID, err := strconv.ParseUint(roomIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	
	groupID, err := strconv.ParseUint(groupIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}

	// Verify group exists and belongs to this room
	var group models.RoomGroup
	if err := DB.Where("id = ? AND room_id = ?", groupID, roomID).First(&group).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch group"})
		return
	}

	// Get all members
	var memberships []models.UserRoomGroup
	if err := DB.Where("room_group_id = ?", groupID).
		Preload("User").
		Find(&memberships).Error; err != nil {
		log.Printf("Error fetching group members: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch group members"})
		return
	}

	// Extract users
	members := make([]models.User, len(memberships))
	for i, membership := range memberships {
		members[i] = membership.User
	}

	c.JSON(http.StatusOK, gin.H{
		"members": members,
		"count":   len(members),
	})
}
