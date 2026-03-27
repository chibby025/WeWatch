package handlers

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	
	"wewatch-backend/internal/models"
)

// JSONB is a custom type that handles PostgreSQL JSONB scanning
type JSONB map[string]interface{}

// Scan implements sql.Scanner interface for reading from database
func (j *JSONB) Scan(value interface{}) error {
	if value == nil {
		*j = nil
		return nil
	}
	
	bytes, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("failed to unmarshal JSONB value: %v", value)
	}
	
	result := make(map[string]interface{})
	if err := json.Unmarshal(bytes, &result); err != nil {
		return err
	}
	
	*j = result
	return nil
}

// Value implements driver.Valuer interface for writing to database
func (j JSONB) Value() (driver.Value, error) {
	if j == nil {
		return nil, nil
	}
	return json.Marshal(j)
}

// LiveShareGraphic represents a graphics overlay
type LiveShareGraphic struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	SessionID uint      `json:"session_id" gorm:"not null"`
	Type      string    `json:"type" gorm:"not null"` // lower_third, logo_bug, ticker, banner
	Content   JSONB     `json:"content" gorm:"type:jsonb"`
	Position  string    `json:"position"`
	Active    bool      `json:"active" gorm:"default:false"`
	ZIndex    int       `json:"z_index" gorm:"default:1"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// LiveShareMediaQueueItem represents a queued media item
type LiveShareMediaQueueItem struct {
	ID        uint       `json:"id" gorm:"primaryKey"`
	SessionID uint       `json:"session_id" gorm:"not null"`
	MediaType string     `json:"media_type" gorm:"not null"` // image, video
	MediaURL  string     `json:"media_url" gorm:"not null"`
	FileName  string     `json:"file_name"`
	FileSize  int64      `json:"file_size"`
	Position  int        `json:"position" gorm:"default:0"`
	Status    string     `json:"status" gorm:"default:queued"` // queued, playing, played
	CreatedAt time.Time  `json:"created_at"`
	PlayedAt  *time.Time `json:"played_at"`
}

func (LiveShareGraphic) TableName() string {
	return "liveshare_graphics"
}

func (LiveShareMediaQueueItem) TableName() string {
	return "liveshare_media_queue"
}

// UploadLogoBug handles logo bug upload for LiveShare
func UploadLogoBug(c *gin.Context) {
	sessionIDStr := c.Param("id")
	sessionID, err := strconv.ParseUint(sessionIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
		return
	}

	// Verify user is host
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var session models.WatchSession
	if err := DB.First(&session, sessionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	var room models.Room
	if err := DB.First(&room, session.RoomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	if room.HostID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only host can upload logo"})
		return
	}

	// Parse multipart form
	file, header, err := c.Request.FormFile("logo")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Logo file required"})
		return
	}
	defer file.Close()

	// Validate file size (500KB max)
	if header.Size > 500*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Logo must be less than 500KB"})
		return
	}

	// Validate file type
	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowedExts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true}
	if !allowedExts[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file type. Allowed: JPG, PNG, GIF, WebP"})
		return
	}

	// Generate unique filename
	filename := fmt.Sprintf("logo_bug_%d_%s%s", sessionID, uuid.New().String(), ext)
	uploadDir := filepath.Join("uploads", "liveshare")
	uploadPath := filepath.Join(uploadDir, filename)

	// Ensure directory exists
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create upload directory"})
		return
	}

	// Save file
	out, err := os.Create(uploadPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}
	defer out.Close()

	if _, err := io.Copy(out, file); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	// Construct public URL
	logoURL := fmt.Sprintf("/uploads/liveshare/%s", filename)

	c.JSON(http.StatusOK, gin.H{
		"logo_url": logoURL,
		"message":  "Logo uploaded successfully",
	})
}

// UploadMediaQueue handles media queue item upload
func UploadMediaQueue(c *gin.Context) {
	sessionIDStr := c.Param("id")
	sessionID, err := strconv.ParseUint(sessionIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid session ID"})
		return
	}

	// Verify user is host
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var session models.WatchSession
	if err := DB.First(&session, sessionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	var room models.Room
	if err := DB.First(&room, session.RoomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	if room.HostID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only host can upload media"})
		return
	}

	// Check queue limit
	var count int64
	DB.Model(&LiveShareMediaQueueItem{}).Where("session_id = ?", sessionID).Count(&count)
	if count >= 5 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Maximum 5 media items allowed"})
		return
	}

	// Parse multipart form
	file, header, err := c.Request.FormFile("media")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Media file required"})
		return
	}
	defer file.Close()

	// Determine media type
	ext := strings.ToLower(filepath.Ext(header.Filename))
	var mediaType string
	var maxSize int64

	imageExts := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true}
	videoExts := map[string]bool{".mp4": true, ".webm": true, ".mov": true}

	if imageExts[ext] {
		mediaType = "image"
		maxSize = 5 * 1024 * 1024 // 5MB
	} else if videoExts[ext] {
		mediaType = "video"
		maxSize = 20 * 1024 * 1024 // 20MB
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file type"})
		return
	}

	// Validate file size
	if header.Size > maxSize {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("%s must be less than %dMB", mediaType, maxSize/(1024*1024)),
		})
		return
	}

	// Generate unique filename
	filename := fmt.Sprintf("media_%d_%s%s", sessionID, uuid.New().String(), ext)
	uploadDir := filepath.Join("uploads", "liveshare")
	uploadPath := filepath.Join(uploadDir, filename)

	// Ensure directory exists
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create upload directory"})
		return
	}

	// Save file
	out, err := os.Create(uploadPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}
	defer out.Close()

	if _, err := io.Copy(out, file); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	// Construct public URL
	mediaURL := fmt.Sprintf("/uploads/liveshare/%s", filename)

	// Get next position in queue
	var maxPosition int
	DB.Model(&LiveShareMediaQueueItem{}).
		Where("session_id = ?", sessionID).
		Select("COALESCE(MAX(position), -1) + 1").
		Scan(&maxPosition)

	// Save to database
	queueItem := LiveShareMediaQueueItem{
		SessionID: uint(sessionID),
		MediaType: mediaType,
		MediaURL:  mediaURL,
		FileName:  header.Filename,
		FileSize:  header.Size,
		Position:  maxPosition,
		Status:    "queued",
	}

	if err := DB.Create(&queueItem).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save media"})
		return
	}

	c.JSON(http.StatusOK, queueItem)
}

// UpdateGraphics handles graphics state update
func UpdateGraphics(c *gin.Context) {
	sessionIDStr := c.Param("id")
	
	// Try parsing as integer first, then fallback to UUID lookup
	var sessionID uint
	if parsedID, err := strconv.ParseUint(sessionIDStr, 10, 32); err == nil {
		sessionID = uint(parsedID)
	} else {
		// Assume UUID format, look up session
		var session models.WatchSession
		if err := DB.Where("session_id = ?", sessionIDStr).First(&session).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}
		sessionID = session.ID
	}

	// Verify user is host
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var session models.WatchSession
	if err := DB.First(&session, sessionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	var room models.Room
	if err := DB.First(&room, session.RoomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	if room.HostID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only host can update graphics"})
		return
	}

	// Parse request body
	var req struct {
		Type     string         `json:"type" binding:"required"`
		Content  map[string]any `json:"content"`
		Position string         `json:"position"`
		Active   bool           `json:"active"`
		ZIndex   int            `json:"z_index"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Upsert graphic
	var graphic LiveShareGraphic
	result := DB.Where("session_id = ? AND type = ?", sessionID, req.Type).First(&graphic)

	if result.Error == gorm.ErrRecordNotFound {
		// Create new
		graphic = LiveShareGraphic{
			SessionID: uint(sessionID),
			Type:      req.Type,
			Content:   req.Content,
			Position:  req.Position,
			Active:    req.Active,
			ZIndex:    req.ZIndex,
		}
		if err := DB.Create(&graphic).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create graphic"})
			return
		}
	} else {
		// Update existing
		graphic.Content = req.Content
		graphic.Position = req.Position
		graphic.Active = req.Active
		graphic.ZIndex = req.ZIndex

		if err := DB.Save(&graphic).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update graphic"})
			return
		}
	}

	// Broadcast update via WebSocket
	broadcastGraphicsUpdate(uint(sessionID), graphic)

	c.JSON(http.StatusOK, graphic)
}

// GetGraphics retrieves all graphics for a session
func GetGraphics(c *gin.Context) {
	sessionIDStr := c.Param("id")
	
	// Try parsing as integer first (watch_sessions.id)
	var sessionID uint
	if parsedID, err := strconv.ParseUint(sessionIDStr, 10, 32); err == nil {
		// Successfully parsed as integer - use directly
		sessionID = uint(parsedID)
	} else {
		// Assume it's a UUID (watch_sessions.session_id) - look up the integer ID
		var session models.WatchSession
		if err := DB.Where("session_id = ?", sessionIDStr).First(&session).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}
		sessionID = session.ID
	}

	var graphics []LiveShareGraphic
	if err := DB.Where("session_id = ?", sessionID).Find(&graphics).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch graphics"})
		return
	}

	c.JSON(http.StatusOK, graphics)
}

// GetMediaQueue retrieves media queue for a session
func GetMediaQueue(c *gin.Context) {
	sessionIDStr := c.Param("id")
	
	// Try parsing as integer first (watch_sessions.id)
	var sessionID uint
	if parsedID, err := strconv.ParseUint(sessionIDStr, 10, 32); err == nil {
		// Successfully parsed as integer - use directly
		sessionID = uint(parsedID)
	} else {
		// Assume it's a UUID (watch_sessions.session_id) - look up the integer ID
		var session models.WatchSession
		if err := DB.Where("session_id = ?", sessionIDStr).First(&session).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}
		sessionID = session.ID
	}

	var queue []LiveShareMediaQueueItem
	if err := DB.Where("session_id = ?", sessionID).Order("position ASC").Find(&queue).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch queue"})
		return
	}

	c.JSON(http.StatusOK, queue)
}

// DeleteMediaQueueItem removes item from queue
func DeleteMediaQueueItem(c *gin.Context) {
	itemIDStr := c.Param("itemId")
	itemID, err := strconv.ParseUint(itemIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid item ID"})
		return
	}

	// Verify user is host
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var item LiveShareMediaQueueItem
	if err := DB.First(&item, itemID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Item not found"})
		return
	}

	var session models.WatchSession
	if err := DB.First(&session, item.SessionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	var room models.Room
	if err := DB.First(&room, session.RoomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	if room.HostID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only host can delete media"})
		return
	}

	// Delete item
	if err := DB.Delete(&item).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete item"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Media deleted successfully"})
}

// broadcastGraphicsUpdate sends graphics update to all viewers
func broadcastGraphicsUpdate(sessionID uint, graphic LiveShareGraphic) {
	message := map[string]interface{}{
		"type": "liveshare_graphics_update",
		"data": map[string]interface{}{
			"session_id": sessionID,
			"graphic":    graphic,
		},
	}

	messageJSON, err := json.Marshal(message)
	if err != nil {
		return
	}

	// Get the hub and broadcast to session
	hub := GetHub()
	if hub != nil {
		// Broadcast to all connections in the room associated with this session
		// First get the room ID from session
		var session models.WatchSession
		if err := DB.First(&session, sessionID).Error; err == nil {
			hub.BroadcastToRoom(session.RoomID, OutgoingMessage{Data: messageJSON, IsBinary: false}, nil)
		}
	}
}
