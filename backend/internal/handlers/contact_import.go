// backend/internal/handlers/contact_import.go
package handlers

import (
	"log"
	"net/http"
	"strings"
	"wewatch-backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// CheckContactsRequest represents the request body for checking contacts
type CheckContactsRequest struct {
	Contacts []string `json:"contacts" binding:"required"` // Phone numbers or usernames
}

// CheckContactsResponse represents the response with found users
type CheckContactsResponse struct {
	FoundUsers []ContactUser `json:"found_users"`
}

// ContactUser represents a user found from contacts with friendship status
type ContactUser struct {
	ID             uint   `json:"id"`
	Username       string `json:"username"`
	DisplayName    string `json:"display_name,omitempty"`
	ProfilePicture string `json:"profile_picture,omitempty"`
	IsFriend       bool   `json:"is_friend"`
	RequestPending bool   `json:"request_pending"`
}

// CheckContactsHandler checks which imported contacts are on WeWatch
func CheckContactsHandler(c *gin.Context) {
	// Get current user from context
	userInterface, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization required"})
		return
	}
	currentUser := userInterface.(*models.User)

	// Get database from context
	dbInterface, dbExists := c.Get("db")
	if !dbExists {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database connection error"})
		return
	}
	db := dbInterface.(*gorm.DB)

	// Parse request body
	var req CheckContactsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("❌ [CheckContacts] Invalid request: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	if len(req.Contacts) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No contacts provided"})
		return
	}

	log.Printf("🔍 [CheckContacts] User %d checking %d contacts", currentUser.ID, len(req.Contacts))

	// Clean and prepare contacts for search
	var usernames []string

	for _, contact := range req.Contacts {
		contact = strings.TrimSpace(contact)
		if contact == "" {
			continue
		}

		// Assume all contacts are usernames (we don't have phone_number in User model)
		usernames = append(usernames, strings.ToLower(contact))
	}

	// Find users by username
	var foundUsers []models.User
	query := db

	if len(usernames) > 0 {
		query = query.Where("LOWER(username) IN ?", usernames)
	} else {
		c.JSON(http.StatusOK, CheckContactsResponse{FoundUsers: []ContactUser{}})
		return
	}

	// Exclude current user from results
	if err := query.Where("id != ?", currentUser.ID).Find(&foundUsers).Error; err != nil {
		log.Printf("❌ [CheckContacts] Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to search contacts"})
		return
	}

	log.Printf("✅ [CheckContacts] Found %d users on WeWatch", len(foundUsers))

	// Get existing friendships and pending requests
	var friendships []models.Friendship
	if len(foundUsers) > 0 {
		var userIDs []uint
		for _, user := range foundUsers {
			userIDs = append(userIDs, user.ID)
		}

		db.Where(
			"(requester_id = ? AND recipient_id IN ?) OR (requester_id IN ? AND recipient_id = ?)",
			currentUser.ID, userIDs, userIDs, currentUser.ID,
		).Find(&friendships)
	}

	// Build response with friendship status
	contactUsers := make([]ContactUser, 0, len(foundUsers))
	for _, user := range foundUsers {
		contactUser := ContactUser{
			ID:             user.ID,
			Username:       user.Username,
			DisplayName:    user.Username,
			ProfilePicture: user.AvatarURL,
			IsFriend:       false,
			RequestPending: false,
		}

		// Check friendship status
		for _, friendship := range friendships {
			if (friendship.RequesterID == currentUser.ID && friendship.RecipientID == user.ID) ||
				(friendship.RequesterID == user.ID && friendship.RecipientID == currentUser.ID) {
				if friendship.Status == models.FriendshipStatusAccepted {
					contactUser.IsFriend = true
				} else if friendship.Status == models.FriendshipStatusPending {
					contactUser.RequestPending = true
				}
				break
			}
		}

		contactUsers = append(contactUsers, contactUser)
	}

	c.JSON(http.StatusOK, CheckContactsResponse{FoundUsers: contactUsers})
}
