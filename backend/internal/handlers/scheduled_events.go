package handlers

import (
	"log"
	"net/http"
	"time"
	"strconv"
	//"encoding/json"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// ScheduledEventInput defines the expected structure for creating a scheduled event
type ScheduledEventInput struct {
	MediaItemID uint   `json:"media_item_id" binding:"required"`
	StartTime   string `json:"start_time" binding:"required"` // ISO 8601 string (e.g., "2025-09-15T20:00:00Z")
	Title       string `json:"title" binding:"required"`
	Description string `json:"description"`
}

// CreateScheduledEventHandler handles POST /api/rooms/:id/scheduled-events
func CreateScheduledEventHandler(c *gin.Context) {
	// 1. Get authenticated user ID
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	authenticatedUserID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// 2. Get room ID
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// 3. Check if user is host of the room
	var room models.Room
	if err := DB.First(&room, uint(roomID)).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}
	if room.HostID != authenticatedUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can schedule events"})
		return
	}

	// 4. Bind input
	var input ScheduledEventInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 5. Parse StartTime
	startTime, err := time.Parse(time.RFC3339, input.StartTime)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid start_time format. Use ISO 8601 (e.g., 2025-09-15T20:00:00Z)"})
		return
	}

	// 6. Validate MediaItem exists and belongs to this room
	var mediaItem models.MediaItem
	if err := DB.First(&mediaItem, input.MediaItemID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Media item not found"})
		return
	}
	if mediaItem.RoomID != uint(roomID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Media item does not belong to this room"})
		return
	}

	// 7. Create ScheduledEvent
	event := models.ScheduledEvent{
		RoomID:      uint(roomID),
		MediaItemID: input.MediaItemID,
		StartTime:   startTime,
		Title:       input.Title,
		Description: input.Description,
		HostUserID:  authenticatedUserID,
	}

	// 8. Save to DB
	if err := DB.Create(&event).Error; err != nil {
		log.Printf("Error creating scheduled event: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create scheduled event"})
		return
	}

	// 9. Return success
	c.JSON(http.StatusCreated, gin.H{
		"message": "Scheduled event created successfully",
		"event":   event,
	})
}

// GetScheduledEventsHandler handles GET /api/rooms/:id/scheduled-events
func GetScheduledEventsHandler(c *gin.Context) {
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// Fetch all scheduled events for this room (future events only)
	var events []models.ScheduledEvent
	if err := DB.Where("room_id = ?", uint(roomID)).
		Order("start_time ASC").
		Find(&events).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch scheduled events"})
		return
}

	c.JSON(http.StatusOK, gin.H{
		"events": events,
	})
}

// DeleteScheduledEventHandler handles DELETE /api/scheduled-events/:id
func DeleteScheduledEventHandler(c *gin.Context) {
	// 1. Get authenticated user ID
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	authenticatedUserID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// 2. Get event ID
	eventIDStr := c.Param("id")
	eventID, err := strconv.ParseUint(eventIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event ID"})
		return
	}

	// 3. Fetch the event
	var event models.ScheduledEvent
	if err := DB.First(&event, uint(eventID)).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Event not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// 4. Check if user is host of the room
	var room models.Room
	if err := DB.First(&room, event.RoomID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch room"})
		return
	}
	if room.HostID != authenticatedUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can delete events"})
		return
	}

	// 5. Delete the event
	if err := DB.Delete(&event).Error; err != nil {
		log.Printf("Error deleting scheduled event: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete event"})
		return
	}

	// 6. Return success
	c.JSON(http.StatusOK, gin.H{
		"message": "Event deleted successfully",
	})
}

// UpdateScheduledEventHandler handles PUT /api/scheduled-events/:id
func UpdateScheduledEventHandler(c *gin.Context) {
	// 1. Get authenticated user ID
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	authenticatedUserID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// 2. Get event ID
	eventIDStr := c.Param("id")
	eventID, err := strconv.ParseUint(eventIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event ID"})
		return
	}

	// 3. Bind input
	var input ScheduledEventInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 4. Fetch the event
	var event models.ScheduledEvent
	if err := DB.First(&event, uint(eventID)).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Event not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// 5. Check if user is host
	var room models.Room
	if err := DB.First(&room, event.RoomID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch room"})
		return
	}
	if room.HostID != authenticatedUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can edit events"})
		return
	}

	// 6. Validate MediaItem belongs to room
	var mediaItem models.MediaItem
	if err := DB.First(&mediaItem, input.MediaItemID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Media item not found"})
		return
	}
	if mediaItem.RoomID != event.RoomID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Media item does not belong to this room"})
		return
	}

	// 7. Update event
	event.MediaItemID = input.MediaItemID
	event.StartTime, _ = time.Parse(time.RFC3339, input.StartTime)
	event.Title = input.Title
	event.Description = input.Description

	if err := DB.Save(&event).Error; err != nil {
		log.Printf("Error updating scheduled event: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update event"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Event updated successfully",
		"event":   event,
	})
}

// DownloadICalHandler handles GET /api/scheduled-events/:id/ical
func DownloadICalHandler(c *gin.Context) {
	eventIDStr := c.Param("id")
	eventID, err := strconv.ParseUint(eventIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid event ID"})
		return
	}

	// Fetch the event
	var event models.ScheduledEvent
	if err := DB.First(&event, uint(eventID)).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Event not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// Fetch the room and media item for details
	var room models.Room
	var mediaItem models.MediaItem
	DB.First(&room, event.RoomID)
	DB.First(&mediaItem, event.MediaItemID)

	// Generate iCal content
	icalContent := generateICal(event, room, mediaItem)

	// Set headers for file download
	c.Header("Content-Type", "text/calendar")
	c.Header("Content-Disposition", "attachment; filename=event.ics")

	// Send iCal content
	c.String(http.StatusOK, icalContent)
}

// Helper function to generate iCal content
func generateICal(event models.ScheduledEvent, room models.Room, mediaItem models.MediaItem) string {
	// Format times for iCal (YYYYMMDDTHHMMSSZ)
	startTime := event.StartTime.UTC().Format("20060102T150405Z")
	endTime := event.StartTime.Add(time.Hour * 2).UTC().Format("20060102T150405Z") // Assume 2-hour event

	// Escape special characters for iCal
	escapeICal := func(s string) string {
		s = strings.ReplaceAll(s, "\\", "\\\\")
		s = strings.ReplaceAll(s, ";", "\\;")
		s = strings.ReplaceAll(s, ",", "\\,")
		s = strings.ReplaceAll(s, "\n", "\\n")
		return s
	}

	summary := escapeICal(event.Title)
	description := escapeICal(event.Description + "\n\nJoin the room: http://localhost:5173/rooms/" + strconv.FormatUint(uint64(room.ID), 10))
	location := escapeICal("WeWatch Room: " + room.Name)

	return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//WeWatch//EN
BEGIN:VEVENT
UID:` + strconv.FormatUint(uint64(event.ID), 10) + `@wewatch.com
DTSTAMP:` + time.Now().UTC().Format("20060102T150405Z") + `
DTSTART:` + startTime + `
DTEND:` + endTime + `
SUMMARY:` + summary + `
DESCRIPTION:` + description + `
LOCATION:` + location + `
END:VEVENT
END:VCALENDAR`
}