// backend/internal/handlers/lobby_chat_blocks.go
package handlers

import (
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// BlockUserHandler blocks a user from sending messages
// POST /api/lobby-chats/block/:userId
func BlockUserHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		log.Println("BlockUserHandler: Unauthorized - user_id not found")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	blockerID, ok := userID.(uint)
	if !ok {
		log.Println("BlockUserHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	blockedIDStr := c.Param("userId")
	blockedID, err := strconv.ParseUint(blockedIDStr, 10, 32)
	if err != nil {
		log.Printf("BlockUserHandler: Invalid user ID: %s", blockedIDStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	// Prevent blocking yourself
	if uint(blockedID) == blockerID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot block yourself"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	// Verify blocked user exists
	var blockedUser models.User
	if err := db.First(&blockedUser, blockedID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("BlockUserHandler: User not found: %d", blockedID)
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}
		log.Printf("BlockUserHandler: Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Check if already blocked
	var existingBlock models.UserBlock
	err = db.Where("blocker_id = ? AND blocked_id = ?", blockerID, uint(blockedID)).First(&existingBlock).Error
	if err == nil {
		// Already blocked
		c.JSON(http.StatusOK, gin.H{"message": "User already blocked"})
		return
	}

	// Create block
	block := models.UserBlock{
		BlockerID: blockerID,
		BlockedID: uint(blockedID),
	}

	if err := db.Create(&block).Error; err != nil {
		log.Printf("BlockUserHandler: Failed to create block: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to block user"})
		return
	}

	log.Printf("BlockUserHandler: User %d blocked user %d", blockerID, blockedID)
	c.JSON(http.StatusOK, gin.H{
		"message": "User blocked successfully",
		"block":   block,
	})
}

// UnblockUserHandler unblocks a user
// DELETE /api/lobby-chats/block/:userId
func UnblockUserHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		log.Println("UnblockUserHandler: Unauthorized - user_id not found")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	blockerID, ok := userID.(uint)
	if !ok {
		log.Println("UnblockUserHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	blockedIDStr := c.Param("userId")
	blockedID, err := strconv.ParseUint(blockedIDStr, 10, 32)
	if err != nil {
		log.Printf("UnblockUserHandler: Invalid user ID: %s", blockedIDStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	// Delete block
	result := db.Where("blocker_id = ? AND blocked_id = ?", blockerID, uint(blockedID)).Delete(&models.UserBlock{})
	if result.Error != nil {
		log.Printf("UnblockUserHandler: Database error: %v", result.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unblock user"})
		return
	}

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not blocked"})
		return
	}

	log.Printf("UnblockUserHandler: User %d unblocked user %d", blockerID, blockedID)
	c.JSON(http.StatusOK, gin.H{"message": "User unblocked successfully"})
}

// GetBlockedUsersHandler returns list of users blocked by current user
// GET /api/lobby-chats/blocked
func GetBlockedUsersHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		log.Println("GetBlockedUsersHandler: Unauthorized - user_id not found")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	blockerID, ok := userID.(uint)
	if !ok {
		log.Println("GetBlockedUsersHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	var blocks []models.UserBlock
	err := db.Where("blocker_id = ?", blockerID).Preload("Blocked").Find(&blocks).Error
	if err != nil {
		log.Printf("GetBlockedUsersHandler: Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch blocked users"})
		return
	}

	// Extract blocked users
	blockedUsers := make([]models.User, len(blocks))
	for i, block := range blocks {
		if block.Blocked != nil {
			blockedUsers[i] = *block.Blocked
		}
	}

	log.Printf("GetBlockedUsersHandler: Fetched %d blocked users for user %d", len(blockedUsers), blockerID)
	c.JSON(http.StatusOK, gin.H{"blocked_users": blockedUsers})
}

// CheckIfBlockedHandler checks if a specific user is blocked
// GET /api/lobby-chats/block-status/:userId
func CheckIfBlockedHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		log.Println("CheckIfBlockedHandler: Unauthorized - user_id not found")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	currentUserID, ok := userID.(uint)
	if !ok {
		log.Println("CheckIfBlockedHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	otherUserIDStr := c.Param("userId")
	otherUserID, err := strconv.ParseUint(otherUserIDStr, 10, 32)
	if err != nil {
		log.Printf("CheckIfBlockedHandler: Invalid user ID: %s", otherUserIDStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	// Check if current user blocked other user
	var blockByMe models.UserBlock
	errByMe := db.Where("blocker_id = ? AND blocked_id = ?", currentUserID, uint(otherUserID)).First(&blockByMe).Error
	blockedByMe := errByMe == nil

	// Check if other user blocked current user
	var blockByThem models.UserBlock
	errByThem := db.Where("blocker_id = ? AND blocked_id = ?", uint(otherUserID), currentUserID).First(&blockByThem).Error
	blockedByThem := errByThem == nil

	c.JSON(http.StatusOK, gin.H{
		"is_blocked":     blockedByMe || blockedByThem,
		"blocked_by_me":  blockedByMe,
		"blocked_by_them": blockedByThem,
	})
}
