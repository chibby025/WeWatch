// backend/internal/handlers/room_handlers.go
package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"wewatch-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CreateWatchSessionWithType is a helper function to create a watch session
// Returns the created session or an error
func CreateWatchSessionWithType(roomID uint, hostID uint, watchType string) (*models.WatchSession, error) {
	sessionID := uuid.New().String()
	session := models.WatchSession{
		SessionID: sessionID,
		RoomID:    roomID,
		HostID:    hostID,
		WatchType: watchType,
		StartedAt: time.Now(),
		IsActive:  true, // ✅ Explicitly set active flag
	}

	if err := DB.Create(&session).Error; err != nil {
		log.Printf("❌ CreateWatchSessionWithType: Failed to create session: %v", err)
		return nil, err
	}

	log.Printf("✅ CreateWatchSessionWithType: Created session %s for room %d (type: %s)", sessionID, roomID, watchType)
	return &session, nil
}

// CreateWatchSessionWithTypeAndTicketing creates a watch session with ticketing configuration
// Input struct should match the JSON binding in CreateWatchSession handler
func CreateWatchSessionWithTypeAndTicketing(roomID uint, hostID uint, watchType string, contentRating string, input interface{}) (*models.WatchSession, error) {
	sessionID := uuid.New().String()
	log.Printf("\n💾💾💾 [DB SAVE] CreateWatchSessionWithTypeAndTicketing called")
	log.Printf("💾 [DB SAVE] Room: %d, Host: %d", roomID, hostID)
	log.Printf("💾 [DB SAVE] Watch Type: '%s'", watchType)
	log.Printf("💾 [DB SAVE] 🎯🎯🎯 Content Rating RECEIVED: '%s'", contentRating)

	log.Printf("\n🏗️ [DB SAVE] Creating WatchSession struct...")
	log.Printf("🏗️ [DB SAVE] 🎯 Setting ContentRating field to: '%s'", contentRating)

	session := models.WatchSession{
		SessionID:     sessionID,
		RoomID:        roomID,
		HostID:        hostID,
		WatchType:     watchType,
		ContentRating: contentRating, // ✅ Set content rating
		StartedAt:     time.Now(),
		IsActive:      true, // ✅ Explicitly set active flag
	}

	// Extract ticketing configuration using type assertion
	if ticketingInput, ok := input.(struct {
		WatchType            string  `json:"watch_type" binding:"required"`
		ClassType            string  `json:"class_type"`
		ContentRating        string  `json:"content_rating"`
		TicketingEnabled     bool    `json:"ticketing_enabled"`
		TicketPriceTokens    int     `json:"ticket_price_tokens"`
		TicketPriceCurrency  string  `json:"ticket_price_currency"`
		TicketPriceAmount    float64 `json:"ticket_price_amount"`
		EarlyBirdEnabled     bool    `json:"early_bird_enabled"`
		EarlyBirdPriceTokens int     `json:"early_bird_price_tokens"`
		EarlyBirdEndTime     string  `json:"early_bird_end_time"`
	}); ok {
		session.ClassType = ticketingInput.ClassType
		session.TicketingEnabled = ticketingInput.TicketingEnabled
		session.TicketPriceTokens = ticketingInput.TicketPriceTokens
		session.TicketPriceCurrency = ticketingInput.TicketPriceCurrency
		session.TicketPriceAmount = ticketingInput.TicketPriceAmount
		session.EarlyBirdEnabled = ticketingInput.EarlyBirdEnabled
		session.EarlyBirdPriceTokens = ticketingInput.EarlyBirdPriceTokens
		
		// Set early bird as active if enabled (will be deactivated when end time passes)
		if ticketingInput.EarlyBirdEnabled {
			session.EarlyBirdActive = true
			// Note: Early bird end time tracking would be handled by a scheduled job
			// For now, early bird remains active until manually deactivated
			if ticketingInput.EarlyBirdEndTime != "" {
				log.Printf("ℹ️ Early bird end time provided: %s (stored for future scheduled deactivation)", ticketingInput.EarlyBirdEndTime)
			}
		}
	}

	if err := DB.Create(&session).Error; err != nil {
		log.Printf("❌ CreateWatchSessionWithTypeAndTicketing: Failed to create session: %v", err)
		return nil, err
	}

	log.Printf("\n✅✅✅ [DB SAVE] Session SAVED to database!")
	log.Printf("✅ [DB SAVE] Session ID: %s", sessionID)
	log.Printf("✅ [DB SAVE] 🎯 ContentRating field value: '%s'", session.ContentRating)
	
	// Verify what was actually saved
	log.Printf("\n🔎 [VERIFY] Reading back from database to verify...")
	var savedSession models.WatchSession
	if err := DB.Where("session_id = ?", sessionID).First(&savedSession).Error; err == nil {
		log.Printf("✅ [VERIFY] Successfully read from database:")
		log.Printf("✅ [VERIFY] Session ID: %s", savedSession.SessionID)
		log.Printf("✅ [VERIFY] 🎯🎯🎯 ContentRating in DB: '%s'", savedSession.ContentRating)
		if savedSession.ContentRating != contentRating {
			log.Printf("🚨🚨🚨 [VERIFY] MISMATCH DETECTED!")
			log.Printf("🚨 [VERIFY] Expected: '%s'", contentRating)
			log.Printf("🚨 [VERIFY] Got from DB: '%s'", savedSession.ContentRating)
		} else {
			log.Printf("✅ [VERIFY] ContentRating matches expected value")
		}
	} else {
		log.Printf("❌ [VERIFY] Could not read back: %v", err)
	}

	return &session, nil
}

// GetRoomMessages handles GET /api/rooms/:id/messages
func GetRoomMessages(c *gin.Context) {
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// Optional: Filter by room group (query parameter)
	roomGroupIDStr := c.Query("room_group_id")
	
	query := DB.Where("room_id = ?", uint(roomID))
	
	if roomGroupIDStr != "" {
		if roomGroupIDStr == "null" || roomGroupIDStr == "main" {
			// Main chat (no group) - only messages where room_group_id IS NULL
			query = query.Where("room_group_id IS NULL")
		} else {
			// Specific group
			roomGroupID, err := strconv.ParseUint(roomGroupIDStr, 10, 64)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room_group_id"})
				return
			}
			query = query.Where("room_group_id = ?", uint(roomGroupID))
		}
	}
	// If no room_group_id parameter, return ALL messages (backward compatibility)

	var messages []models.RoomMessage
	if err := query.
		Preload("ReplyTo").
		Preload("RoomGroup").
		Order("created_at ASC").
		Find(&messages).Error; err != nil {
		log.Printf("Error fetching room messages: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch messages"})
		return
	}

	// Populate usernames
	for i := range messages {
		var user models.User
		if err := DB.Select("username").Where("id = ?", messages[i].UserID).First(&user).Error; err == nil {
			messages[i].Username = user.Username
		}
		// Populate username for replied-to message
		if messages[i].ReplyTo != nil {
			var replyUser models.User
			if err := DB.Select("username").Where("id = ?", messages[i].ReplyTo.UserID).First(&replyUser).Error; err == nil {
				messages[i].ReplyTo.Username = replyUser.Username
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"messages": messages})
}

// CreateRoomMessage creates a new persistent message in a room
func CreateRoomMessage(c *gin.Context) {
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// Get authenticated user ID
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var input struct {
		Message     string `json:"message" binding:"required"`
		ReplyToID   *uint  `json:"reply_to_id"`   // Optional: ID of message being replied to
		RoomGroupID *uint  `json:"room_group_id"` // Optional: Group this message belongs to
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message is required"})
		return
	}

	// Get username
	var user models.User
	if err := DB.Select("username").Where("id = ?", userID).First(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user"})
		return
	}

	message := models.RoomMessage{
		RoomID:      uint(roomID),
		UserID:      userID.(uint),
		Username:    user.Username,
		Message:     input.Message,
		ReplyToID:   input.ReplyToID,   // Store reply reference
		RoomGroupID: input.RoomGroupID, // Store group reference
		CreatedAt:   time.Now(),
	}

	if err := DB.Create(&message).Error; err != nil {
		log.Printf("Error creating room message: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create message"})
		return
	}

	// Load reply_to data if exists
	if message.ReplyToID != nil {
		var replyToMsg models.RoomMessage
		if err := DB.Select("id, user_id, message").Where("id = ?", *message.ReplyToID).First(&replyToMsg).Error; err == nil {
			// Populate username for replied message
			var replyUser models.User
			if err := DB.Select("username").Where("id = ?", replyToMsg.UserID).First(&replyUser).Error; err == nil {
				replyToMsg.Username = replyUser.Username
			}
			message.ReplyTo = &replyToMsg
		}
	}

	// Broadcast message via WebSocket to all room members
	broadcastMsg := map[string]interface{}{
		"type": "room_chat",
		"data": map[string]interface{}{
			"id":            message.ID,
			"user_id":       message.UserID,
			"username":      message.Username,
			"message":       message.Message,
			"reply_to":      message.ReplyTo,      // Include reply context
			"room_group_id": message.RoomGroupID,  // Include group ID for filtering
			"created_at":    message.CreatedAt,
		},
	}
	if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
		hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
	} else {
		log.Printf("Failed to marshal room chat message: %v", err)
	}

	c.JSON(http.StatusCreated, gin.H{"message": message})
}

// UploadVoiceNote handles voice note uploads for room messages
func UploadVoiceNote(c *gin.Context) {
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// Get authenticated user ID
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Parse multipart form
	file, err := c.FormFile("audio")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Audio file is required"})
		return
	}

	// Check file size (5MB max)
	if file.Size > 5*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Audio file too large (max 5MB)"})
		return
	}

	// Get duration from form
	durationStr := c.PostForm("duration")
	duration, _ := strconv.Atoi(durationStr)

	// Create directory structure: uploads/room_media/voice_notes/room_{roomID}/
	uploadDir := fmt.Sprintf("uploads/room_media/voice_notes/room_%d", roomID)
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		log.Printf("Failed to create voice note directory: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create storage directory"})
		return
	}

	// Generate unique filename
	timestamp := time.Now().Unix()
	ext := ".webm"
	if strings.HasSuffix(file.Filename, ".mp4") {
		ext = ".mp4"
	}
	filename := fmt.Sprintf("vn_%d_%d%s", userID, timestamp, ext)
	filepath := fmt.Sprintf("%s/%s", uploadDir, filename)

	// Save file
	if err := c.SaveUploadedFile(file, filepath); err != nil {
		log.Printf("Failed to save voice note: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save audio file"})
		return
	}

	// Construct public URL
	audioURL := fmt.Sprintf("/%s", filepath)

	// Get username
	var user models.User
	if err := DB.Select("username").Where("id = ?", userID).First(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user"})
		return
	}

	// Create room message with voice note
	message := models.RoomMessage{
		RoomID:      uint(roomID),
		UserID:      userID.(uint),
		Username:    user.Username,
		Message:     "[Voice Note]",
		AudioURL:    &audioURL,
		Duration:    &duration,
		MessageType: "voice_note",
		CreatedAt:   time.Now(),
	}

	if err := DB.Create(&message).Error; err != nil {
		log.Printf("Error creating voice note message: %v", err)
		// Try to delete the uploaded file on database error
		os.Remove(filepath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create message"})
		return
	}

	// Broadcast voice note message via WebSocket
	broadcastMsg := map[string]interface{}{
		"type": "room_chat",
		"data": map[string]interface{}{
			"id":           message.ID,
			"user_id":      message.UserID,
			"username":     message.Username,
			"message":      message.Message,
			"audio_url":    message.AudioURL,
			"duration":     message.Duration,
			"message_type": message.MessageType,
			"created_at":   message.CreatedAt,
		},
	}
	if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
		hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
	} else {
		log.Printf("Failed to marshal voice note message: %v", err)
	}

	c.JSON(http.StatusCreated, gin.H{"message": message})
}

// CreateWatchSession creates a new watch session for a room
func CreateWatchSession(c *gin.Context) {
	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// Get authenticated user ID
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var input struct {
		WatchType     string `json:"watch_type" binding:"required"`
		ClassType     string `json:"class_type"`      // "classroom" or "lecture_hall" (for watch_type="classroom")
		ContentRating string `json:"content_rating"`  // "G", "PG", "13+", "16+", "18+", "Mature"
		
		// Ticketing fields
		TicketingEnabled     bool    `json:"ticketing_enabled"`
		TicketPriceTokens    int     `json:"ticket_price_tokens"`
		TicketPriceCurrency  string  `json:"ticket_price_currency"`
		TicketPriceAmount    float64 `json:"ticket_price_amount"`
		
		// Early bird fields
		EarlyBirdEnabled     bool   `json:"early_bird_enabled"`
		EarlyBirdPriceTokens int    `json:"early_bird_price_tokens"`
		EarlyBirdEndTime     string `json:"early_bird_end_time"` // ISO 8601 string
	}

	log.Printf("\n\n🎬🎬🎬 ========== CREATE WATCH SESSION CALLED ========== 🎬🎬🎬")
	log.Printf("📍 Room ID: %d", roomID)

	if err := c.ShouldBindJSON(&input); err != nil {
		log.Printf("❌❌❌ [CREATE] JSON BINDING FAILED: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "watch_type is required"})
		return
	}

	log.Printf("✅ [CREATE] JSON binding successful")
	log.Printf("📥 [CREATE] RAW INPUT IMMEDIATELY AFTER BINDING:")
	log.Printf("   🎯 content_rating: '%s'", input.ContentRating)
	log.Printf("   🎯 content_rating LENGTH: %d", len(input.ContentRating))
	log.Printf("   🎯 content_rating BYTES: %v", []byte(input.ContentRating))
	log.Printf("   📹 watch_type: '%s'", input.WatchType)
	log.Printf("   🏫 class_type: '%s'", input.ClassType)
	log.Printf("   🎫 ticketing_enabled: %v", input.TicketingEnabled)

	// Validate watch_type
	if input.WatchType != "video" && input.WatchType != "3d_cinema" && input.WatchType != "classroom" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "watch_type must be 'video', '3d_cinema', or 'classroom'"})
		return
	}

	// Validate content_rating
	log.Printf("\n🔍🔍🔍 [VALIDATION] Starting content_rating validation")
	log.Printf("🔍 [VALIDATION] Input: '%s' (length: %d, empty: %v)", input.ContentRating, len(input.ContentRating), input.ContentRating == "")
	contentRating := "G" // Default to 'G' if not provided or invalid
	validRatings := []string{"G", "PG", "Educational", "Religious", "13+", "16+", "18+", "Mature"}
	matched := false
	for i, rating := range validRatings {
		isMatch := input.ContentRating == rating
		log.Printf("🔍 [VALIDATION] Check %d: '%s' == '%s' → %v", i+1, input.ContentRating, rating, isMatch)
		if isMatch {
			contentRating = rating
			matched = true
			log.Printf("✅✅✅ [VALIDATION] MATCH FOUND! Using: '%s'", contentRating)
			break
		}
	}
	if !matched {
		log.Printf("⚠️⚠️⚠️ [VALIDATION] NO MATCH! Defaulting to 'G'")
		log.Printf("⚠️ [VALIDATION] Input was: '%s' (bytes: %v)", input.ContentRating, []byte(input.ContentRating))
	}

	// Validate ticketing configuration
	if input.TicketingEnabled {
		// Must have either token price or fiat price
		if input.TicketPriceTokens == 0 && input.TicketPriceAmount == 0 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Ticket price (tokens or fiat amount) required for paid sessions",
			})
			return
		}

		// If fiat amount set, currency is required
		if input.TicketPriceAmount > 0 && input.TicketPriceCurrency == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Currency required when setting fiat ticket price",
			})
			return
		}

		// Validate currency
		if input.TicketPriceCurrency != "" {
			validCurrencies := []string{"USD", "NGN", "GHS", "KES", "EUR", "GBP"}
			isValid := false
			for _, curr := range validCurrencies {
				if input.TicketPriceCurrency == curr {
					isValid = true
					break
				}
			}
			if !isValid {
				c.JSON(http.StatusBadRequest, gin.H{
					"error": "Invalid currency. Supported: USD, NGN, GHS, KES, EUR, GBP",
				})
				return
			}
		}

		// Validate early bird
		if input.EarlyBirdEnabled {
			if input.EarlyBirdPriceTokens == 0 {
				c.JSON(http.StatusBadRequest, gin.H{
					"error": "Early bird price required when early bird is enabled",
				})
				return
			}

			if input.EarlyBirdPriceTokens >= input.TicketPriceTokens {
				c.JSON(http.StatusBadRequest, gin.H{
					"error": "Early bird price must be less than regular price",
				})
				return
			}

			if input.EarlyBirdEndTime != "" {
				earlyBirdTime, parseErr := time.Parse(time.RFC3339, input.EarlyBirdEndTime)
				if parseErr != nil {
					c.JSON(http.StatusBadRequest, gin.H{
						"error": "Invalid early bird end time format (use ISO 8601/RFC3339)",
					})
					return
				}

				if earlyBirdTime.Before(time.Now()) {
					c.JSON(http.StatusBadRequest, gin.H{
						"error": "Early bird end time must be in the future",
					})
					return
				}
			}
		}
	}

	// Check if there's already an active session
	log.Printf("🔍 [CreateWatchSession] Checking for existing active session in room %d...", roomID)
	var existingSession models.WatchSession
	if err := DB.Where("room_id = ? AND ended_at IS NULL AND is_active = ?", uint(roomID), true).First(&existingSession).Error; err == nil {
		log.Printf("⚠️⚠️⚠️ EXISTING SESSION FOUND!")
		log.Printf("  ├─ Session ID: %s", existingSession.SessionID)
		log.Printf("  ├─ Watch Type: %s", existingSession.WatchType)
		log.Printf("  ├─ Content Rating: '%s'", existingSession.ContentRating)
		log.Printf("  └─ RETURNING 409 CONFLICT (session already exists)")
		c.JSON(http.StatusConflict, gin.H{
			"error":      "Active session already exists",
			"session_id": existingSession.SessionID,
		})
		return
	}
	log.Printf("✅ [CreateWatchSession] No existing session - creating NEW session")

	// Create new session with watch_type and ticketing config
	log.Printf("📝 [CreateWatchSession] Calling CreateWatchSessionWithTypeAndTicketing with content_rating: '%s'", contentRating)
	session, err := CreateWatchSessionWithTypeAndTicketing(uint(roomID), userID.(uint), input.WatchType, contentRating, input)
	if err != nil {
		log.Printf("❌ Error creating watch session: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	log.Printf("✅✅✅ [CreateWatchSession] Session CREATED!")
	log.Printf("  ├─ session_id: %s", session.SessionID)
	log.Printf("  ├─ content_rating: '%s'", session.ContentRating)
	log.Printf("  └─ ticketing_enabled: %v", session.TicketingEnabled)

	// Broadcast session started to all room members
	log.Printf("\n📡 [BROADCAST] Preparing session_started message...")
	log.Printf("📡 [BROADCAST] 🎯 content_rating being sent: '%s'", session.ContentRating)

	sessionMsg := map[string]interface{}{
		"type": "session_started",
		"data": map[string]interface{}{
			"session_id":        session.SessionID,
			"watch_type":        session.WatchType,
			"host_id":           session.HostID,
			"content_rating":    session.ContentRating, // ✅ Include content rating for button filtering
			"ticketing_enabled": session.TicketingEnabled,
			"ticket_price":      session.TicketPriceTokens,
		},
	}
	log.Printf("📡 [BROADCAST] Broadcasting session_started to room %d", roomID)
	if msgBytes, err := json.Marshal(sessionMsg); err == nil {
		hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
		log.Printf("✅ [BROADCAST] session_started broadcasted successfully")
	} else {
		log.Printf("❌ [BROADCAST] Failed to marshal session_started: %v", err)
	}

	log.Printf("\n📤 [CREATE] Sending response to frontend:")
	log.Printf("  ├─ content_rating: '%s'", session.ContentRating)
	log.Printf("  ├─ session_id: %s", session.SessionID)
	log.Printf("  └─ ticketing_enabled: %v\n", session.TicketingEnabled)

	c.JSON(http.StatusCreated, gin.H{
		"session_id":        session.SessionID,
		"watch_type":        session.WatchType,
		"class_type":        session.ClassType,
		"content_rating":    session.ContentRating,    // ✅ Include content rating
		"ticketing_enabled": session.TicketingEnabled,
		"ticket_price":      session.TicketPriceTokens,
	})
}

// DeleteRoomMessage deletes a room message (with host permissions)
func DeleteRoomMessage(c *gin.Context) {
	messageIDStr := c.Param("message_id")
	messageID, err := strconv.ParseUint(messageIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid message ID"})
		return
	}

	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDValue.(uint)

	var message models.RoomMessage
	if err := DB.Where("id = ?", messageID).First(&message).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Message not found"})
		} else {
			log.Printf("Database error finding message %d: %v", messageID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// Check if user is the sender or room host
	isOwner := message.UserID == userID
	isHost := false

	if !isOwner {
		var room models.Room
		if err := DB.First(&room, uint(roomID)).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch room"})
			return
		}
		if room.HostID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Cannot delete other users' messages"})
			return
		}
		isHost = true
	}

	// If host is deleting someone else's message, soft delete with flag
	if isHost && !isOwner {
		message.Message = "[Message deleted by host]"
		message.DeletedByHost = true
		if err := DB.Save(&message).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete message"})
			return
		}

		// Broadcast the update
		broadcastMsg := map[string]interface{}{
			"type": "room_message_deleted",
			"data": map[string]interface{}{
				"id":              message.ID,
				"message":         message.Message,
				"deleted_by_host": true,
			},
		}
		if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
			hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
		}

		c.JSON(http.StatusOK, gin.H{"message": "Message deleted", "deleted_by_host": true})
	} else {
		// Owner deleting their own message - hard delete
		if err := DB.Delete(&message).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete message"})
			return
		}

		// Broadcast the deletion
		broadcastMsg := map[string]interface{}{
			"type": "room_message_removed",
			"data": map[string]interface{}{
				"id": message.ID,
			},
		}
		if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
			hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
		}

		c.JSON(http.StatusOK, gin.H{"message": "Message deleted", "deleted_by_host": false})
	}
}

// EditRoomMessage edits a room message (owner only)
func EditRoomMessage(c *gin.Context) {
	messageIDStr := c.Param("message_id")
	messageID, err := strconv.ParseUint(messageIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid message ID"})
		return
	}

	roomIDStr := c.Param("id")
	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	userID := userIDValue.(uint)

	var input struct {
		Message string `json:"message" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message is required"})
		return
	}

	var message models.RoomMessage
	if err := DB.Where("id = ?", messageID).First(&message).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Message not found"})
		} else {
			log.Printf("Database error finding message %d: %v", messageID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	// Only owner can edit
	if message.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot edit other users' messages"})
		return
	}

	// Update message
	message.Message = input.Message
	if err := DB.Save(&message).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update message"})
		return
	}

	// Broadcast the update
	broadcastMsg := map[string]interface{}{
		"type": "room_message_edited",
		"data": map[string]interface{}{
			"id":      message.ID,
			"message": message.Message,
		},
	}
	if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
		hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
	}

	c.JSON(http.StatusOK, gin.H{"message": message.Message})
}

// ========================================
// POLL HANDLERS
// ========================================

// CreatePollInput defines the structure for creating a poll
type CreatePollInput struct {
	Question      string   `json:"question" binding:"required,min=1,max=200"`
	Options       []string `json:"options" binding:"required,min=2,max=10"`
	AllowMultiple bool     `json:"allow_multiple"`
}

// CreatePoll handles POST /api/rooms/:id/messages/poll
// Creates a new poll as a special message type
func CreatePoll(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	roomID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// Verify user is a member of the room
	var membership models.UserRoom
	if err := DB.Where("user_id = ? AND room_id = ?", userID, roomID).First(&membership).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "You must be a member of this room to create polls"})
		return
	}

	var input CreatePollInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate options
	if len(input.Options) < 2 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "At least 2 options required"})
		return
	}
	if len(input.Options) > 10 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Maximum 10 options allowed"})
		return
	}

	// Filter out empty options
	validOptions := []string{}
	for _, opt := range input.Options {
		trimmed := strings.TrimSpace(opt)
		if trimmed != "" {
			validOptions = append(validOptions, trimmed)
		}
	}

	if len(validOptions) < 2 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "At least 2 non-empty options required"})
		return
	}

	// Create poll data
	pollData := &models.PollData{
		Question:      strings.TrimSpace(input.Question),
		Options:       validOptions,
		AllowMultiple: input.AllowMultiple,
		Votes:         []models.PollVote{}, // Empty initially
		IsClosed:      false,
	}

	// Get username for broadcast
	var user models.User
	if err := DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get user info"})
		return
	}

	// Create room message with poll type
	message := models.RoomMessage{
		RoomID:      uint(roomID),
		UserID:      userID.(uint),
		Message:     input.Question, // Store question in message field for search/display
		MessageType: "poll",
		PollData:    pollData,
	}

	if err := DB.Create(&message).Error; err != nil {
		log.Printf("Error creating poll message: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create poll"})
		return
	}

	// Prepare response with username
	message.Username = user.Username

	// Broadcast poll via WebSocket
	broadcastMsg := map[string]interface{}{
		"type": "room_chat",
		"data": message,
	}
	if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
		hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
	}

	c.JSON(http.StatusCreated, gin.H{
		"poll":    message,
		"message": "Poll created successfully",
	})
}

// VotePollInput defines the structure for voting on a poll
type VotePollInput struct {
	OptionIndex int `json:"option_index" binding:"required,min=0"`
}

// VotePoll handles POST /api/rooms/:roomId/polls/:pollId/vote
// Adds a vote to a poll
func VotePoll(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	roomID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// Verify user is a member of the room
	var membership models.UserRoom
	if err := DB.Where("user_id = ? AND room_id = ?", userID, roomID).First(&membership).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "You must be a member of this room to vote"})
		return
	}

	pollID, err := strconv.Atoi(c.Param("pollId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid poll ID"})
		return
	}

	var input VotePollInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get the poll message
	var message models.RoomMessage
	if err := DB.Where("id = ? AND room_id = ? AND message_type = ?", pollID, roomID, "poll").First(&message).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found"})
		return
	}

	if message.PollData == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid poll data"})
		return
	}

	// Check if poll is closed
	if message.PollData.IsClosed {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Poll is closed"})
		return
	}

	// Validate option index
	if input.OptionIndex < 0 || input.OptionIndex >= len(message.PollData.Options) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid option index"})
		return
	}

	// Check if user already voted for this option
	uid := userID.(uint)
	for _, vote := range message.PollData.Votes {
		if vote.UserID == uid && vote.OptionIndex == input.OptionIndex {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Already voted for this option"})
			return
		}
	}

	// If not allow_multiple, remove any previous votes from this user
	if !message.PollData.AllowMultiple {
		newVotes := []models.PollVote{}
		for _, vote := range message.PollData.Votes {
			if vote.UserID != uid {
				newVotes = append(newVotes, vote)
			}
		}
		message.PollData.Votes = newVotes
	}

	// Add the new vote
	newVote := models.PollVote{
		UserID:      uid,
		OptionIndex: input.OptionIndex,
	}
	message.PollData.Votes = append(message.PollData.Votes, newVote)

	// Save updated poll
	if err := DB.Save(&message).Error; err != nil {
		log.Printf("Error saving vote: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save vote"})
		return
	}

	// Broadcast vote update via WebSocket
	broadcastMsg := map[string]interface{}{
		"type": "poll_vote_updated",
		"data": map[string]interface{}{
			"poll_id":   message.ID,
			"poll_data": message.PollData,
		},
	}
	if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
		hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
	}

	c.JSON(http.StatusOK, gin.H{
		"vote":    newVote,
		"message": "Vote recorded",
	})
}

// RemoveVoteInput defines the structure for removing a vote
type RemoveVoteInput struct {
	OptionIndex int `json:"option_index" binding:"required,min=0"`
}

// RemoveVote handles DELETE /api/rooms/:roomId/polls/:pollId/vote
// Removes a vote from a poll
func RemoveVote(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	roomID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// Verify user is a member of the room
	var membership models.UserRoom
	if err := DB.Where("user_id = ? AND room_id = ?", userID, roomID).First(&membership).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "You must be a member of this room to remove votes"})
		return
	}

	pollID, err := strconv.Atoi(c.Param("pollId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid poll ID"})
		return
	}

	var input RemoveVoteInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get the poll message
	var message models.RoomMessage
	if err := DB.Where("id = ? AND room_id = ? AND message_type = ?", pollID, roomID, "poll").First(&message).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found"})
		return
	}

	if message.PollData == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid poll data"})
		return
	}

	// Remove the vote
	uid := userID.(uint)
	newVotes := []models.PollVote{}
	voteRemoved := false
	for _, vote := range message.PollData.Votes {
		if vote.UserID == uid && vote.OptionIndex == input.OptionIndex {
			voteRemoved = true
			continue // Skip this vote
		}
		newVotes = append(newVotes, vote)
	}

	if !voteRemoved {
		c.JSON(http.StatusNotFound, gin.H{"error": "Vote not found"})
		return
	}

	message.PollData.Votes = newVotes

	// Save updated poll
	if err := DB.Save(&message).Error; err != nil {
		log.Printf("Error removing vote: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove vote"})
		return
	}

	// Broadcast vote update via WebSocket
	broadcastMsg := map[string]interface{}{
		"type": "poll_vote_updated",
		"data": map[string]interface{}{
			"poll_id":   message.ID,
			"poll_data": message.PollData,
		},
	}
	if msgBytes, err := json.Marshal(broadcastMsg); err == nil {
		hub.BroadcastToRoom(uint(roomID), OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Vote removed",
	})
}

// MarkRoomVisitedHandler handles POST /api/rooms/:id/visited
// Stamps last_visited_at on the membership row so unread-post counts work correctly.
func MarkRoomVisitedHandler(c *gin.Context) {
	userID := c.MustGet("user_id").(uint)
	roomID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	now := time.Now()
	DB.Model(&models.UserRoom{}).
		Where("user_id = ? AND room_id = ?", userID, uint(roomID)).
		Update("last_visited_at", now)

	c.JSON(http.StatusOK, gin.H{"last_visited_at": now})
}

// GetRoomUnreadPostsHandler handles GET /api/rooms/:id/unread-posts
// Returns count of posts created after the member's last_visited_at.
func GetRoomUnreadPostsHandler(c *gin.Context) {
	userID := c.MustGet("user_id").(uint)
	roomID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	var membership models.UserRoom
	if err := DB.Where("user_id = ? AND room_id = ?", userID, uint(roomID)).First(&membership).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"unread_count": 0})
		return
	}

	var room models.Room
	if err := DB.First(&room, uint(roomID)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	var count int64
	query := DB.Model(&models.Post{}).Where("user_id = ? AND is_public = ?", room.HostID, true)
	if membership.LastVisitedAt != nil {
		query = query.Where("created_at > ?", membership.LastVisitedAt)
	}
	query.Count(&count)

	c.JSON(http.StatusOK, gin.H{"unread_count": count})
}

