// backend/internal/handlers/lobby_chat_attachments.go
package handlers

import (
	"fmt"
	"io"
	"log"
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
	"wewatch-backend/internal/utils"
)

const (
	MaxImageSize    = 5 * 1024 * 1024  // 5MB
	MaxVideoSize    = 50 * 1024 * 1024 // 50MB
	MaxDocumentSize = 10 * 1024 * 1024 // 10MB
)

var (
	AllowedImageTypes = map[string]bool{
		"image/jpeg": true,
		"image/png":  true,
		"image/gif":  true,
		"image/webp": true,
	}

	AllowedVideoTypes = map[string]bool{
		"video/mp4":       true,
		"video/webm":      true,
		"video/quicktime": true,
	}

	AllowedDocumentTypes = map[string]bool{
		"application/pdf":    true,
		"application/msword": true,
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
		"text/plain": true,
	}
)

// UploadLobbyChatImageHandler handles image uploads
// POST /api/lobby-chats/image
func UploadLobbyChatImageHandler(c *gin.Context) {
	uploadAttachment(c, "image", "lobby-images", MaxImageSize, AllowedImageTypes)
}

// UploadLobbyChatVideoHandler handles video uploads
// POST /api/lobby-chats/video
func UploadLobbyChatVideoHandler(c *gin.Context) {
	uploadAttachment(c, "video", "lobby-videos", MaxVideoSize, AllowedVideoTypes)
}

// UploadLobbyChatDocumentHandler handles document uploads
// POST /api/lobby-chats/document
func UploadLobbyChatDocumentHandler(c *gin.Context) {
	uploadAttachment(c, "document", "lobby-documents", MaxDocumentSize, AllowedDocumentTypes)
}

// uploadAttachment is a generic handler for file uploads
func uploadAttachment(c *gin.Context, attachmentType, uploadFolder string, maxSize int64, allowedTypes map[string]bool) {
	userID, exists := c.Get("user_id")
	if !exists {
		log.Printf("uploadAttachment(%s): Unauthorized - user_id not found", attachmentType)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	senderID, ok := userID.(uint)
	if !ok {
		log.Printf("uploadAttachment(%s): Error asserting user ID type", attachmentType)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Get recipient ID from form
	recipientIDStr := c.PostForm("recipient_id")
	recipientID, err := strconv.ParseUint(recipientIDStr, 10, 32)
	if err != nil {
		log.Printf("uploadAttachment(%s): Invalid recipient ID: %s", attachmentType, recipientIDStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid recipient ID"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	// Check if users have blocked each other
	var blockCheck int64
	db.Model(&models.UserBlock{}).Where(
		"(blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)",
		senderID, uint(recipientID), uint(recipientID), senderID,
	).Count(&blockCheck)

	if blockCheck > 0 {
		log.Printf("uploadAttachment(%s): Block exists between users %d and %d", attachmentType, senderID, recipientID)
		c.JSON(http.StatusForbidden, gin.H{"error": fmt.Sprintf("Cannot send %s - user blocked", attachmentType)})
		return
	}

	// Check friendship
	var friendship models.Friendship
	err = db.Where(
		"((requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)) AND status = ?",
		senderID, uint(recipientID), uint(recipientID), senderID, models.FriendshipStatusAccepted,
	).First(&friendship).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusForbidden, gin.H{"error": fmt.Sprintf("You must be friends to send %ss", attachmentType)})
			return
		}
		log.Printf("uploadAttachment(%s): Database error checking friendship: %v", attachmentType, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Get file
	file, err := c.FormFile("file")
	if err != nil {
		log.Printf("uploadAttachment(%s): No file: %v", attachmentType, err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file provided"})
		return
	}

	// Validate file size
	if file.Size > maxSize {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("File too large (max %dMB)", maxSize/(1024*1024)),
		})
		return
	}

	// Validate file type
	contentType := file.Header.Get("Content-Type")
	if !allowedTypes[contentType] {
		allowedList := []string{}
		for t := range allowedTypes {
			allowedList = append(allowedList, t)
		}
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Invalid file type (allowed: %s)", strings.Join(allowedList, ", ")),
		})
		return
	}

	// Generate unique filename
	timestamp := time.Now().Unix()
	uniqueID := uuid.New().String()
	ext := filepath.Ext(file.Filename)

	// Create user-specific directory
	uploadDir := filepath.Join("uploads", uploadFolder, fmt.Sprintf("%d", senderID))
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		log.Printf("uploadAttachment(%s): Failed to create directory: %v", attachmentType, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	var newFilename, filePath string

	if attachmentType == "image" {
		// Compress before ever writing to disk (rather than saving the
		// original then overwriting) — one write instead of two, and the
		// file on disk always has the extension matching its real final
		// content-type. GIF/WebP and any decode failure pass through
		// unchanged (see CompressChatImage's own doc comment for why).
		src, err := file.Open()
		if err != nil {
			log.Printf("uploadAttachment(%s): Failed to open uploaded file: %v", attachmentType, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
			return
		}
		rawBytes, err := io.ReadAll(src)
		src.Close()
		if err != nil {
			log.Printf("uploadAttachment(%s): Failed to read uploaded file: %v", attachmentType, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
			return
		}
		var changed bool
		var outBytes []byte
		outBytes, contentType, changed = utils.CompressChatImage(rawBytes, contentType)
		if changed {
			log.Printf("uploadAttachment(%s): image compressed %d -> %d bytes (%s)", attachmentType, len(rawBytes), len(outBytes), contentType)
			ext = extensionForContentType(contentType, file.Filename)
			file.Size = int64(len(outBytes))
		} else {
			outBytes = rawBytes
		}
		newFilename = fmt.Sprintf("%d_%s%s", timestamp, uniqueID, ext)
		filePath = filepath.Join(uploadDir, newFilename)
		if err := os.WriteFile(filePath, outBytes, 0644); err != nil {
			log.Printf("uploadAttachment(%s): Failed to save file: %v", attachmentType, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
			return
		}
	} else {
		newFilename = fmt.Sprintf("%d_%s%s", timestamp, uniqueID, ext)
		filePath = filepath.Join(uploadDir, newFilename)
		if err := c.SaveUploadedFile(file, filePath); err != nil {
			log.Printf("uploadAttachment(%s): Failed to save file: %v", attachmentType, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
			return
		}
	}

	// Push to BunnyCDN in production — a bare relative URL here resolves against
	// the frontend's own origin in the browser (Vercel), not the backend's,
	// silently breaking display there even though it works locally via Vite's
	// dev proxy. Same fix already applied to lobby DM voice notes
	// (lobby_chat_voice_notes.go) and lobby group attachments (lobby_groups.go).
	remotePath := fmt.Sprintf("%s/%d/%s", uploadFolder, senderID, newFilename)
	attachmentURL, err := utils.UploadLocalFileToBunnyCDN(filePath, remotePath, contentType)
	if err != nil {
		log.Printf("uploadAttachment(%s): Failed to upload to BunnyCDN: %v", attachmentType, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to store file"})
		os.Remove(filePath)
		return
	}
	if strings.HasPrefix(attachmentURL, "http") {
		os.Remove(filePath)
	}
	originalFilename := file.Filename

	// Determine message text based on type
	messageText := ""
	switch attachmentType {
	case "image":
		messageText = "📷 Photo"
	case "video":
		messageText = "🎥 Video"
	case "document":
		messageText = fmt.Sprintf("📄 %s", originalFilename)
	}

	// Create lobby chat message
	chat := models.LobbyChat{
		SenderID:       senderID,
		RecipientID:    uint(recipientID),
		Message:        messageText,
		MessageType:    attachmentType,
		AttachmentURL:  &attachmentURL,
		AttachmentName: &originalFilename,
		AttachmentSize: &file.Size,
	}

	if err := db.Create(&chat).Error; err != nil {
		log.Printf("uploadAttachment(%s): Failed to create message: %v", attachmentType, err)
		// Try to delete uploaded file
		os.Remove(filePath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to send %s", attachmentType)})
		return
	}

	// Load sender info for WebSocket
	var sender models.User
	db.First(&sender, senderID)

	// Prepare response
	chatResponse := struct {
		models.LobbyChat
		SenderUsername string `json:"sender_username"`
	}{
		LobbyChat:      chat,
		SenderUsername: sender.Username,
	}

	log.Printf("uploadAttachment(%s): File sent from user %d to user %d (%s, %d bytes)",
		attachmentType, senderID, recipientID, originalFilename, file.Size)

	// Broadcast via WebSocket
	BroadcastLobbyChatMessage(db, chat, sender)

	c.JSON(http.StatusOK, chatResponse)
}
