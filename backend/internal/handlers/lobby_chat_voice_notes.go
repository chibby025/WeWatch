// backend/internal/handlers/lobby_chat_voice_notes.go
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
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
)

const (
	MaxVoiceNoteSize     = 2 * 1024 * 1024 // 2MB
	MaxVoiceNoteDuration = 60               // 60 seconds
)

// UploadLobbyChatVoiceNoteHandler handles voice note uploads
// POST /api/lobby-chats/voice-note
func UploadLobbyChatVoiceNoteHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		log.Println("UploadLobbyChatVoiceNoteHandler: Unauthorized - user_id not found")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	senderID, ok := userID.(uint)
	if !ok {
		log.Println("UploadLobbyChatVoiceNoteHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Get recipient ID from form
	recipientIDStr := c.PostForm("recipient_id")
	recipientID, err := strconv.ParseUint(recipientIDStr, 10, 32)
	if err != nil {
		log.Printf("UploadLobbyChatVoiceNoteHandler: Invalid recipient ID: %s", recipientIDStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid recipient ID"})
		return
	}

	// Get duration from form
	durationStr := c.PostForm("duration")
	duration, err := strconv.ParseFloat(durationStr, 64)
	if err != nil {
		log.Printf("UploadLobbyChatVoiceNoteHandler: Invalid duration: %s", durationStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid duration"})
		return
	}

	// Validate duration
	if duration > MaxVoiceNoteDuration {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Voice note too long (max %d seconds)", MaxVoiceNoteDuration),
		})
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
		log.Printf("UploadLobbyChatVoiceNoteHandler: Block exists between users %d and %d", senderID, recipientID)
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot send voice note - user blocked"})
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
			c.JSON(http.StatusForbidden, gin.H{"error": "You must be friends to send voice notes"})
			return
		}
		log.Printf("UploadLobbyChatVoiceNoteHandler: Database error checking friendship: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Get audio file
	file, err := c.FormFile("audio")
	if err != nil {
		log.Printf("UploadLobbyChatVoiceNoteHandler: No audio file: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "No audio file provided"})
		return
	}

	// Validate file size
	if file.Size > MaxVoiceNoteSize {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("File too large (max %dMB)", MaxVoiceNoteSize/(1024*1024)),
		})
		return
	}

	// Validate file type (webm, ogg)
	contentType := file.Header.Get("Content-Type")
	if contentType != "audio/webm" && contentType != "audio/ogg" && contentType != "audio/wav" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid file type (only webm, ogg, wav allowed)",
		})
		return
	}

	// Generate filename: timestamp.webm
	timestamp := time.Now().Unix()
	ext := filepath.Ext(file.Filename)
	if ext == "" {
		ext = ".webm"
	}
	filename := fmt.Sprintf("%d%s", timestamp, ext)

	// Create user-specific directory
	uploadDir := filepath.Join("uploads", "lobby-voice-notes", fmt.Sprintf("%d", senderID))
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		log.Printf("UploadLobbyChatVoiceNoteHandler: Failed to create directory: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	// Full file path
	filePath := filepath.Join(uploadDir, filename)

	// Save file
	if err := c.SaveUploadedFile(file, filePath); err != nil {
		log.Printf("UploadLobbyChatVoiceNoteHandler: Failed to save file: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	// Push to BunnyCDN in production — a bare relative URL here resolves against the
	// frontend's own origin in the browser (Vercel), not the backend's, breaking playback
	// there even though it works locally via Vite's dev proxy. UploadLocalFileToBunnyCDN
	// already does the right thing for local dev (returns the relative path unchanged).
	remotePath := fmt.Sprintf("lobby-voice-notes/%d/%s", senderID, filename)
	attachmentURL, err := utils.UploadLocalFileToBunnyCDN(filePath, remotePath, contentType)
	if err != nil {
		log.Printf("UploadLobbyChatVoiceNoteHandler: Failed to upload to BunnyCDN: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to store voice note"})
		os.Remove(filePath)
		return
	}
	if strings.HasPrefix(attachmentURL, "http") {
		os.Remove(filePath)
	}

	// Prepare metadata
	metadata := fmt.Sprintf(`{"duration": %.2f}`, duration)

	// Create lobby chat message
	chat := models.LobbyChat{
		SenderID:       senderID,
		RecipientID:    uint(recipientID),
		Message:        "🎤 Voice message",
		MessageType:    "voice_note",
		AttachmentURL:  &attachmentURL,
		AttachmentSize: &file.Size,
		Metadata:       &metadata,
	}

	if err := db.Create(&chat).Error; err != nil {
		log.Printf("UploadLobbyChatVoiceNoteHandler: Failed to create message: %v", err)
		// Try to delete uploaded file
		os.Remove(filePath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send voice note"})
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

	log.Printf("UploadLobbyChatVoiceNoteHandler: Voice note sent from user %d to user %d (%.2fs, %d bytes)",
		senderID, recipientID, duration, file.Size)

	// Broadcast via WebSocket
	BroadcastLobbyChatMessage(db, chat, sender)

	c.JSON(http.StatusOK, chatResponse)
}

// ServeLobbyChatVoiceNoteHandler serves voice note files
// This is handled by Gin's static file serving in main.go
// Just included here for documentation
func ServeLobbyChatVoiceNoteHandler(c *gin.Context) {
	userID := c.Param("userId")
	filename := c.Param("filename")

	filePath := filepath.Join("uploads", "lobby-voice-notes", userID, filename)

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Voice note not found"})
		return
	}

	// Open file
	file, err := os.Open(filePath)
	if err != nil {
		log.Printf("ServeLobbyChatVoiceNoteHandler: Failed to open file: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load voice note"})
		return
	}
	defer file.Close()

	// Get file info
	fileInfo, err := file.Stat()
	if err != nil {
		log.Printf("ServeLobbyChatVoiceNoteHandler: Failed to stat file: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load voice note"})
		return
	}

	// Set headers
	c.Header("Content-Type", "audio/webm")
	c.Header("Content-Length", fmt.Sprintf("%d", fileInfo.Size()))
	c.Header("Accept-Ranges", "bytes")

	// Stream file
	io.Copy(c.Writer, file)
}
