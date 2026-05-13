package handlers

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"wewatch-backend/internal/models"
	"gorm.io/gorm"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// GetSessionMembers fetches all active members for a given watch session.
func GetSessionMembers(DB *gorm.DB, sessionID uint) ([]models.WatchSessionMember, error) {
	var members []models.WatchSessionMember
	err := DB.Where("watch_session_id = ? AND is_active = ?", sessionID, true).Find(&members).Error
	return members, err
}

// GetAllActiveSessionsHandler handles GET /api/sessions/active?limit=10&offset=0
// Returns all active watch sessions with room and member details for lobby display
// Supports pagination for infinite scroll
func GetAllActiveSessionsHandler(c *gin.Context) {
	type SessionResponse struct {
		SessionID             string  `json:"session_id"`
		RoomID                uint    `json:"room_id"`
		RoomName              string  `json:"room_name"`
		RoomAvatarURL         string  `json:"room_avatar_url,omitempty"` // ✅ Room avatar image
		HostID                uint    `json:"host_id"`
		HostUsername          string  `json:"host_username"`
		WatchType             string  `json:"watch_type"`
		ClassType             string  `json:"class_type,omitempty"`
		IsTemporary           bool    `json:"is_temporary"`
		IsPublic              bool    `json:"is_public"`
		MemberCount           int     `json:"member_count"`
		CurrentlyPlaying      string  `json:"currently_playing,omitempty"`
		SessionTitle          string  `json:"session_title,omitempty"`
		StartedAt             string  `json:"started_at"`
		CurrentMediaURL       string  `json:"current_media_url,omitempty"`
		CurrentMediaType      string  `json:"current_media_type,omitempty"`
		IsScreenSharingActive bool    `json:"is_screen_sharing_active"`
		SharingSource         string  `json:"sharing_source,omitempty"`
		ContentRating         string  `json:"content_rating"`     // ✅ Age-based content rating
		AverageRating         float64 `json:"average_rating"`     // ✅ Room's average rating
		TotalRatings          int     `json:"total_ratings"`      // ✅ Number of ratings
	}

	// ✅ Get current user ID for privacy filtering
	currentUserID, exists := c.Get("user_id")
	var userID uint
	if exists {
		if uid, ok := currentUserID.(uint); ok {
			userID = uid
		}
	}

	// ✅ Parse pagination parameters
	limit := 10 // Default
	if l := c.Query("limit"); l != "" {
		if parsedLimit, err := strconv.Atoi(l); err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}
	
	offset := 0
	if o := c.Query("offset"); o != "" {
		if parsedOffset, err := strconv.Atoi(o); err == nil && parsedOffset >= 0 {
			offset = parsedOffset
		}
	}

	log.Printf("🔍 [GetAllActiveSessionsHandler] Fetching active sessions for user %d (limit: %d, offset: %d)...", userID, limit, offset)
	
	// Get total count for pagination
	var totalCount int64
	if err := DB.Model(&models.WatchSession{}).Where("ended_at IS NULL").Count(&totalCount).Error; err != nil {
		log.Printf("❌ Error counting active sessions: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count active sessions"})
		return
	}
	
	// Query active sessions with pagination (EndedAt is NULL)
	var sessions []models.WatchSession
	if err := DB.Where("ended_at IS NULL").
		Preload("Members", "is_active = ?", true).
		Order("started_at DESC"). // Most recent first
		Limit(limit).
		Offset(offset).
		Find(&sessions).Error; err != nil {
		log.Printf("❌ Error fetching active sessions: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch active sessions"})
		return
	}

	// Reduced logging - Found %d active sessions

	// Load viewer's age flags once before the loop (zero-value = all flags false = conservative default).
	var viewerSettings models.UserSettings
	if userID > 0 {
		DB.Where("user_id = ?", userID).First(&viewerSettings)
		// Lazy yearly recompute — same as GetDiscoverFeed.
		if viewerSettings.AgeFlagsYear != time.Now().Year() {
			var viewerUser models.User
			if err := DB.Select("id, date_of_birth").First(&viewerUser, userID).Error; err == nil {
				saveAgeFlagsForUser(DB, userID, viewerUser.GetAge())
				DB.Where("user_id = ?", userID).First(&viewerSettings)
			}
		}
	}

	// Build response with room and host details
	var response []SessionResponse
	for _, session := range sessions {
		// AGE-BASED CONTENT FILTER: one settings read above replaces per-session user fetch.
		if !canViewContentRating(session.ContentRating, viewerSettings) {
			log.Printf("🔒 [ContentFilter] Hiding %s session %s from user %d",
				session.ContentRating, session.SessionID, userID)
			continue
		}
		
		// ✅ PRIVACY FILTER: Skip private sessions unless user is a member
		if session.IsPrivate && userID > 0 {
			// Check if user is a member of this private session
			isMember := false
			for _, member := range session.Members {
				if member.UserID == userID {
					isMember = true
					break
				}
			}
			if !isMember {
				continue // Skip private sessions where user is not a member
			}
		}
		
		// Fetch room details
		var room models.Room
		if err := DB.First(&room, session.RoomID).Error; err != nil {
			continue // Skip this session if room not found
		}

		// Count active members
		activeMemberCount := len(session.Members)

		// If this is a temporary instant-watch room with no active members,
		// it's stale/orphaned — try to clean it up and skip returning it in the lobby.
		// ✅ GRACE PERIOD: Don't cleanup sessions created within last 10 seconds (give user time to join)
		if room.IsTemporary && activeMemberCount == 0 {
			timeSinceCreation := time.Since(session.StartedAt)
			if timeSinceCreation < 10*time.Second {
				continue // Grace period - don't add to response yet
			}
			
			// Cleanup orphaned instant-watch session (reduced logging)
			tx := DB.Begin()
			if tx.Error == nil {
				// Delete temporary media items linked to the session
				tx.Where("session_id = ?", session.SessionID).Delete(&models.TemporaryMediaItem{})
				
				// Clean up LiveShare graphics and media queue
				CleanupLiveShareAssetsInTransaction(tx, session.ID)

				// Delete watch session members
				tx.Where("watch_session_id = ?", session.ID).Delete(&models.WatchSessionMember{})

				// Delete chat messages and reactions tied to this session
				var chatMessages []models.ChatMessage
				if err := tx.Where("session_id = ?", session.SessionID).Find(&chatMessages).Error; err == nil {
					if len(chatMessages) > 0 {
						ids := make([]uint, len(chatMessages))
						for i, m := range chatMessages {
							ids[i] = m.ID
						}
						tx.Where("message_id IN ?", ids).Delete(&models.Reaction{})
					}
				}
				tx.Where("session_id = ?", session.SessionID).Delete(&models.ChatMessage{})

				// Delete the watch session record
				if err := tx.Delete(&models.WatchSession{}, session.ID).Error; err != nil {
					tx.Rollback()
				} else {
					// Attempt to delete the room itself (temporary rooms should be removed)
					tx.Delete(&models.Room{}, room.ID)
					tx.Commit()
				}
			}

			// Skip adding this session to the response
			continue
		}

		// Fetch host username
		var user models.User
		hostUsername := "Unknown"
		if err := DB.First(&user, room.HostID).Error; err == nil {
			hostUsername = user.Username
		}

		// Build response (reduced logging)
		sessionResp := SessionResponse{
			SessionID:             session.SessionID,
			RoomID:                session.RoomID,
			RoomName:              room.Name,
			RoomAvatarURL:         room.ImageURL,           // ✅ Include room avatar (using ImageURL field)
			HostID:                room.HostID,
			HostUsername:          hostUsername,
			WatchType:             session.WatchType,
			ClassType:             session.ClassType,
			IsTemporary:           room.IsTemporary,
			IsPublic:              room.IsPublic,
			MemberCount:           activeMemberCount,
			CurrentlyPlaying:      room.CurrentlyPlaying,
			SessionTitle:          session.SessionTitle,
			StartedAt:             session.StartedAt.Format("2006-01-02T15:04:05Z07:00"),
			CurrentMediaURL:       session.CurrentMediaURL,
			CurrentMediaType:      session.CurrentMediaType,
			IsScreenSharingActive: session.IsScreenSharingActive,
			SharingSource:         session.SharingSource,
			ContentRating:         session.ContentRating,  // ✅ Include content rating
			AverageRating:         room.AverageRating,     // ✅ Include room rating
			TotalRatings:          room.TotalRatings,      // ✅ Include rating count
		}
		response = append(response, sessionResp)
	}

	// Reduced logging - returning %d active sessions
	c.JSON(http.StatusOK, gin.H{
		"sessions": response,
		"count":    len(response),
		"total":    totalCount,
		"limit":    limit,
		"offset":   offset,
		"has_more": int64(offset + limit) < totalCount,
	})
}

// GetLiveShareStateHandler handles GET /api/sessions/:sessionId/liveshare-state
// Returns current LiveShare mode and guest status for a watch session
func GetLiveShareStateHandler(c *gin.Context) {
	sessionID := c.Param("id")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing session_id"})
		return
	}

	log.Printf("🎬 [GetLiveShareStateHandler] Fetching LiveShare state for session: %s", sessionID)

	// Get mode from watch_sessions
	var mode string
	err := DB.Raw(`
		SELECT liveshare_mode FROM watch_sessions WHERE session_id = ?
	`, sessionID).Scan(&mode).Error

	if err != nil {
		log.Printf("❌ [GetLiveShareStateHandler] Session not found: %s", sessionID)
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	// Get active or granted guest
	type GuestInfo struct {
		UserID    uint       `json:"userId"`
		Username  string     `json:"username"`
		Status    string     `json:"status"`
		ShareType *string    `json:"shareType"`
		Position  int        `json:"position"`
		GrantedAt time.Time  `json:"grantedAt"`
		JoinedAt  *time.Time `json:"joinedAt"`
	}

	var guest *GuestInfo
	err = DB.Raw(`
		SELECT 
			lp.user_id,
			u.username,
			lp.status,
			lp.share_type,
			lp.position,
			lp.granted_at,
			lp.joined_at
		FROM liveshare_participants lp
		JOIN users u ON u.id = lp.user_id
		WHERE lp.session_id = ? AND lp.status IN ('granted', 'active')
		ORDER BY lp.granted_at DESC
		LIMIT 1
	`, sessionID).Scan(&guest).Error

	if err != nil && err.Error() != "record not found" {
		log.Printf("❌ [GetLiveShareStateHandler] Error querying guest: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Build response
	response := gin.H{
		"mode":  mode,
		"guest": guest,
	}

	if guest != nil {
		log.Printf("✅ [GetLiveShareStateHandler] Found guest: %s (status: %s)", guest.Username, guest.Status)
	} else {
		log.Printf("✅ [GetLiveShareStateHandler] No active guest")
	}

	c.JSON(http.StatusOK, response)
}

// UploadPodcastLogoHandler handles POST /api/sessions/:id/podcast-logo
// Uploads podcast logo for a session (2MB max)
func UploadPodcastLogoHandler(c *gin.Context) {
	log.Println("🎙️ [UploadPodcastLogoHandler] Podcast logo upload started")

	// Get authenticated user
	userIDValue, exists := c.Get("user_id")
	if !exists {
		log.Println("❌ [UploadPodcastLogoHandler] Unauthorized - user_id not found")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	authenticatedUserID, ok := userIDValue.(uint)
	if !ok {
		log.Println("❌ [UploadPodcastLogoHandler] Invalid user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Get session ID from URL
	sessionID := c.Param("id")
	if sessionID == "" {
		log.Println("❌ [UploadPodcastLogoHandler] Missing session ID")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Session ID is required"})
		return
	}

	// Verify session exists and user is the host
	var session models.WatchSession
	result := DB.Where("session_id = ? AND is_active = ?", sessionID, true).First(&session)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			log.Printf("❌ [UploadPodcastLogoHandler] Session %s not found", sessionID)
			c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
			return
		}
		log.Printf("❌ [UploadPodcastLogoHandler] Database error: %v", result.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Verify user is the host
	if session.HostID != authenticatedUserID {
		log.Printf("❌ [UploadPodcastLogoHandler] User %d is not host of session %s", authenticatedUserID, sessionID)
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the host can upload podcast logo"})
		return
	}

	// Parse multipart form (2MB max)
	const maxLogoSize int64 = 2 << 20 // 2 MB
	if err := c.Request.ParseMultipartForm(maxLogoSize); err != nil {
		log.Printf("❌ [UploadPodcastLogoHandler] Error parsing form: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Error parsing upload data"})
		return
	}

	// Get logo file
	formFile, err := c.FormFile("logo")
	if err != nil {
		log.Printf("❌ [UploadPodcastLogoHandler] No logo file provided: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "No logo file provided"})
		return
	}

	// Validate file size
	if formFile.Size > maxLogoSize {
		log.Printf("❌ [UploadPodcastLogoHandler] File too large: %d bytes (max 2MB)", formFile.Size)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Logo file too large. Maximum size is 2 MB."})
		return
	}

	// Validate file type (images only)
	allowedExtensions := map[string]bool{
		".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true,
	}
	ext := strings.ToLower(filepath.Ext(formFile.Filename))
	if !allowedExtensions[ext] {
		log.Printf("❌ [UploadPodcastLogoHandler] Invalid file type: %s", ext)
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid file type '%s'. Allowed: jpg, jpeg, png, webp, gif", ext)})
		return
	}

	// Create podcast-logos directory if not exists
	logoDir := filepath.Join(UploadDir, "podcast-logos")
	if err := os.MkdirAll(logoDir, os.ModePerm); err != nil {
		log.Printf("❌ [UploadPodcastLogoHandler] Failed to create logo directory: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare storage"})
		return
	}

	// Generate unique filename
	uniqueID := uuid.New()
	uniqueFilename := fmt.Sprintf("%s%s", uniqueID.String(), ext)
	filePath := filepath.Join(logoDir, uniqueFilename)

	// Save file
	if err := c.SaveUploadedFile(formFile, filePath); err != nil {
		log.Printf("❌ [UploadPodcastLogoHandler] Failed to save file: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save logo"})
		return
	}

	// Generate URL (relative path for client)
	logoURL := fmt.Sprintf("/uploads/podcast-logos/%s", uniqueFilename)
	log.Printf("✅ [UploadPodcastLogoHandler] Logo saved: %s", logoURL)

	// Return logo URL
	c.JSON(http.StatusOK, gin.H{
		"logo_url": logoURL,
		"message":  "Podcast logo uploaded successfully",
	})
}
