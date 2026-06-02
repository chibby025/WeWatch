package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
)

const (
	roomAttachMaxImageSize    = 5 * 1024 * 1024  // 5 MB
	roomAttachMaxDocumentSize = 10 * 1024 * 1024 // 10 MB
)

var (
	roomAttachAllowedImageTypes = map[string]bool{
		"image/jpeg": true,
		"image/png":  true,
		"image/gif":  true,
		"image/webp": true,
	}
	roomAttachAllowedDocumentTypes = map[string]bool{
		"application/pdf": true,
		"application/msword": true,
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
		"text/plain": true,
	}
)

// UploadRoomChatAttachmentHandler uploads an image or document to BunnyCDN and
// creates a RoomMessage row with the attachment URL.
// POST /api/rooms/:id/messages/attachment
func UploadRoomChatAttachmentHandler(c *gin.Context) {
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	currentUserID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	roomIDStr := c.Param("id")
	roomID64, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	roomID := uint(roomID64)

	// Caller must be a room member
	var userRoom models.UserRoom
	if err := DB.Where("room_id = ? AND user_id = ? AND deleted_at IS NULL", roomID, currentUserID).
		First(&userRoom).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusForbidden, gin.H{"error": "Not a room member"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// attachmentType: "image" | "document"
	attachmentType := c.PostForm("type")
	if attachmentType != "image" && attachmentType != "document" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type must be 'image' or 'document'"})
		return
	}

	var groupID *uint
	if gid := c.PostForm("room_group_id"); gid != "" {
		if parsed, err := strconv.ParseUint(gid, 10, 64); err == nil {
			v := uint(parsed)
			groupID = &v
		}
	}

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file provided"})
		return
	}

	// Validate size and MIME type
	contentType := file.Header.Get("Content-Type")
	switch attachmentType {
	case "image":
		if file.Size > roomAttachMaxImageSize {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Image too large (max 5 MB)"})
			return
		}
		if !roomAttachAllowedImageTypes[contentType] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid image type"})
			return
		}
	case "document":
		if file.Size > roomAttachMaxDocumentSize {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Document too large (max 10 MB)"})
			return
		}
		if !roomAttachAllowedDocumentTypes[contentType] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid document type (PDF, DOCX, TXT allowed)"})
			return
		}
	}

	// Read file bytes
	f, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read file"})
		return
	}
	defer f.Close()
	fileBytes, err := io.ReadAll(f)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read file"})
		return
	}

	// Build a unique BunnyCDN path under room-chat/{roomID}/
	ext := strings.ToLower(filepath.Ext(file.Filename))
	uniqueName := fmt.Sprintf("room-chat/%d/%d_%s%s",
		roomID, time.Now().UnixMilli(), uuid.New().String()[:8], ext)

	cdnURL, err := utils.UploadToBunnyCDN(fileBytes, uniqueName, contentType)
	if err != nil {
		log.Printf("UploadRoomChatAttachmentHandler: BunnyCDN upload failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Upload failed"})
		return
	}

	// Fetch the sender's username
	var sender models.User
	DB.Select("id, username").First(&sender, currentUserID)

	// Create the RoomMessage row
	origName := file.Filename
	msg := models.RoomMessage{
		RoomID:         roomID,
		UserID:         currentUserID,
		RoomGroupID:    groupID,
		Message:        "", // no text body for attachment-only messages
		MessageType:    attachmentType,
		AttachmentURL:  &cdnURL,
		AttachmentName: &origName,
	}
	if err := DB.Create(&msg).Error; err != nil {
		log.Printf("UploadRoomChatAttachmentHandler: DB create failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save message"})
		return
	}

	// Broadcast via WebSocket so other members see it in real-time
	hub := GetHub()
	if hub != nil {
		broadcastMsg := map[string]interface{}{
			"type": "room_chat",
			"data": map[string]interface{}{
				"id":              msg.ID,
				"room_id":         roomID,
				"user_id":         currentUserID,
				"username":        sender.Username,
				"message":         "",
				"message_type":    attachmentType,
				"attachment_url":  cdnURL,
				"attachment_name": origName,
				"room_group_id":   groupID,
				"created_at":      msg.CreatedAt,
			},
		}
		if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
			hub.BroadcastToRoom(roomID, OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
		}
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":              msg.ID,
		"room_id":         roomID,
		"user_id":         currentUserID,
		"username":        sender.Username,
		"message":         "",
		"message_type":    attachmentType,
		"attachment_url":  cdnURL,
		"attachment_name": origName,
		"room_group_id":   groupID,
		"created_at":      msg.CreatedAt,
	})
}

