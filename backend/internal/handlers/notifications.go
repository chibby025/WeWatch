package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"wewatch-backend/internal/models"
)

// CreateNotification inserts a notification row and pushes a real-time WS event to the user.
// Call this from goroutines — it does not return an error to callers.
func CreateNotification(userID uint, notifType, title, body, entityType string, entityID uint) {
	notif := models.Notification{
		UserID:     userID,
		Type:       notifType,
		Title:      title,
		Body:       body,
		EntityType: entityType,
		EntityID:   entityID,
	}
	if err := DB.Create(&notif).Error; err != nil {
		return
	}

	// Push live update to the user's lobby WS connection
	hub := GetHub()
	if hub == nil {
		return
	}
	payload, err := json.Marshal(map[string]interface{}{
		"type": "notification_new",
		"data": map[string]interface{}{
			"id":          notif.ID,
			"notif_type":  notif.Type,
			"title":       notif.Title,
			"body":        notif.Body,
			"entity_type": notif.EntityType,
			"entity_id":   notif.EntityID,
			"created_at":  notif.CreatedAt,
		},
	})
	if err != nil {
		return
	}
	hub.BroadcastToUsers([]uint{userID}, OutgoingMessage{Data: payload, IsBinary: false})
}

// UpsertDMNotification creates or updates a batched "dm_received" notification for a recipient.
// If an unread dm_received notification from the same sender already exists, its title count is
// incremented instead of inserting a new row.
func UpsertDMNotification(recipientID uint, senderID uint, senderUsername string, messagePreview string) {
	body := messagePreview
	if len(body) > 80 {
		body = body[:80] + "…"
	}

	var existing models.Notification
	err := DB.Where(
		"user_id = ? AND type = ? AND entity_id = ? AND is_read = false",
		recipientID, "dm_received", senderID,
	).First(&existing).Error

	if err == nil {
		count := 2
		var n int
		if _, scanErr := fmt.Sscanf(existing.Title, "%d unread", &n); scanErr == nil {
			count = n + 1
		}
		newTitle := fmt.Sprintf("%d unread messages from @%s", count, senderUsername)
		DB.Model(&existing).Updates(map[string]interface{}{
			"title":      newTitle,
			"body":       body,
			"created_at": time.Now(),
		})

		hub := GetHub()
		if hub == nil {
			return
		}
		payload, marshalErr := json.Marshal(map[string]interface{}{
			"type": "notification_new",
			"data": map[string]interface{}{
				"id":          existing.ID,
				"notif_type":  "dm_received",
				"title":       newTitle,
				"body":        body,
				"entity_type": "user",
				"entity_id":   senderID,
				"created_at":  time.Now(),
			},
		})
		if marshalErr == nil {
			hub.BroadcastToUsers([]uint{recipientID}, OutgoingMessage{Data: payload, IsBinary: false})
		}
	} else {
		CreateNotification(recipientID, "dm_received", "New message from @"+senderUsername, body, "user", senderID)
	}
}

// GetMyNotificationsHandler handles GET /api/notifications
// Query params: unread_only=true, limit=20, offset=0
func GetMyNotificationsHandler(c *gin.Context) {
	userID := c.MustGet("user_id").(uint)

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "30"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	unreadOnly := c.Query("unread_only") == "true"

	if limit > 100 {
		limit = 100
	}

	query := DB.Where("user_id = ?", userID).Order("created_at DESC").Limit(limit).Offset(offset)
	if unreadOnly {
		query = query.Where("is_read = ?", false)
	}

	var notifications []models.Notification
	if err := query.Find(&notifications).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch notifications"})
		return
	}

	var unreadCount int64
	DB.Model(&models.Notification{}).Where("user_id = ? AND is_read = ?", userID, false).Count(&unreadCount)

	c.JSON(http.StatusOK, gin.H{
		"notifications": notifications,
		"unread_count":  unreadCount,
	})
}

// MarkNotificationReadHandler handles PATCH /api/notifications/:id/read
func MarkNotificationReadHandler(c *gin.Context) {
	userID := c.MustGet("user_id").(uint)
	notifID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid notification ID"})
		return
	}

	result := DB.Model(&models.Notification{}).
		Where("id = ? AND user_id = ?", notifID, userID).
		Update("is_read", true)
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Notification not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Marked as read"})
}

// MarkAllNotificationsReadHandler handles PATCH /api/notifications/read-all
func MarkAllNotificationsReadHandler(c *gin.Context) {
	userID := c.MustGet("user_id").(uint)

	DB.Model(&models.Notification{}).
		Where("user_id = ? AND is_read = ?", userID, false).
		Updates(map[string]interface{}{"is_read": true, "updated_at": time.Now()})

	c.JSON(http.StatusOK, gin.H{"message": "All notifications marked as read"})
}

// ClearAllNotificationsHandler handles DELETE /api/notifications — hard-deletes all notifications for the user
func ClearAllNotificationsHandler(c *gin.Context) {
	userID := c.MustGet("user_id").(uint)

	DB.Unscoped().Where("user_id = ?", userID).Delete(&models.Notification{})

	c.JSON(http.StatusOK, gin.H{"message": "Notifications cleared"})
}
