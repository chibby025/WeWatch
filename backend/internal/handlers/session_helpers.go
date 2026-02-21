package handlers

import (
	"log"
	"net/http"
	"strconv"
	"time"
	"wewatch-backend/internal/models"
	"gorm.io/gorm"
	"github.com/gin-gonic/gin"
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

	log.Printf("📊 [GetAllActiveSessionsHandler] Found %d sessions with ended_at IS NULL", len(sessions))

	// Build response with room and host details
	var response []SessionResponse
	for _, session := range sessions {
		log.Printf("🔍 [GetAllActiveSessionsHandler] Processing session %s (room %d)", session.SessionID, session.RoomID)
		
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
				log.Printf("  └─ 🔒 SKIPPING private session (user %d not a member)", userID)
				continue
			}
			log.Printf("  ├─ 🔓 User %d is member of private session", userID)
		}
		
		// Fetch room details
		var room models.Room
		if err := DB.First(&room, session.RoomID).Error; err != nil {
			log.Printf("⚠️ Warning: Room %d not found for session %s", session.RoomID, session.SessionID)
			continue // Skip this session if room not found
		}

		// Count active members
		activeMemberCount := len(session.Members)
		log.Printf("  ├─ Room: %s (is_temporary: %v, members: %d)", room.Name, room.IsTemporary, activeMemberCount)

		// If this is a temporary instant-watch room with no active members,
		// it's stale/orphaned — try to clean it up and skip returning it in the lobby.
		// ✅ GRACE PERIOD: Don't cleanup sessions created within last 10 seconds (give user time to join)
		if room.IsTemporary && activeMemberCount == 0 {
			timeSinceCreation := time.Since(session.StartedAt)
			if timeSinceCreation < 10*time.Second {
				log.Printf("  └─ ⏰ GRACE PERIOD: Session %s is only %.1f seconds old, skipping cleanup", 
					session.SessionID, timeSinceCreation.Seconds())
				// Don't add to response yet, but don't delete either
				continue
			}
			
			log.Printf("  └─ 🧹 ORPHANED! Cleaning up instant-watch session %s (room %d, age: %.1f seconds)", 
				session.SessionID, room.ID, timeSinceCreation.Seconds())

			tx := DB.Begin()
			if tx.Error == nil {
				// Delete temporary media items linked to the session
				if err := tx.Where("session_id = ?", session.SessionID).Delete(&models.TemporaryMediaItem{}).Error; err != nil {
					log.Printf("⚠️ Cleanup: Failed to delete temporary media for session %s: %v", session.SessionID, err)
				}

				// Delete watch session members
				if err := tx.Where("watch_session_id = ?", session.ID).Delete(&models.WatchSessionMember{}).Error; err != nil {
					log.Printf("⚠️ Cleanup: Failed to delete session members for session %s: %v", session.SessionID, err)
				}

				// Delete chat messages and reactions tied to this session
				var chatMessages []models.ChatMessage
				if err := tx.Where("session_id = ?", session.SessionID).Find(&chatMessages).Error; err == nil {
					if len(chatMessages) > 0 {
						ids := make([]uint, len(chatMessages))
						for i, m := range chatMessages {
							ids[i] = m.ID
						}
						if err := tx.Where("message_id IN ?", ids).Delete(&models.Reaction{}).Error; err != nil {
							log.Printf("⚠️ Cleanup: Failed to delete reactions for session %s: %v", session.SessionID, err)
						}
					}
				}
				if err := tx.Where("session_id = ?", session.SessionID).Delete(&models.ChatMessage{}).Error; err != nil {
					log.Printf("⚠️ Cleanup: Failed to delete chat messages for session %s: %v", session.SessionID, err)
				}

				// Delete the watch session record
				if err := tx.Delete(&models.WatchSession{}, session.ID).Error; err != nil {
					log.Printf("⚠️ Cleanup: Failed to delete watch session %s: %v", session.SessionID, err)
					tx.Rollback()
				} else {
					// Attempt to delete the room itself (temporary rooms should be removed)
					if err := tx.Delete(&models.Room{}, room.ID).Error; err != nil {
						log.Printf("⚠️ Cleanup: Failed to delete temporary room %d: %v", room.ID, err)
					} else {
						log.Printf("🗑️ Cleanup: Deleted orphaned instant-watch room %d and session %s", room.ID, session.SessionID)
					}
					tx.Commit()
				}
			} else {
				log.Printf("⚠️ Cleanup: Failed to begin transaction for session %s: %v", session.SessionID, tx.Error)
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

		// ✅ DEBUG: Log session media state fields
		log.Printf("  ├─ Media State: url=%v, type=%v, sharing=%v, source=%v",
			session.CurrentMediaURL, session.CurrentMediaType,
			session.IsScreenSharingActive, session.SharingSource)

		sessionResp := SessionResponse{
			SessionID:             session.SessionID,
			RoomID:                session.RoomID,
			RoomName:              room.Name,
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
			AverageRating:         room.AverageRating,  // ✅ Include room rating
			TotalRatings:          room.TotalRatings,   // ✅ Include rating count
		}
		log.Printf("  └─ ✅ ADDING to response: %s (temp: %v, members: %d)", room.Name, room.IsTemporary, activeMemberCount)
		response = append(response, sessionResp)
	}

	log.Printf("✅ [GetAllActiveSessionsHandler] Returning %d active sessions to client (total: %d, has_more: %v)", 
		len(response), totalCount, int64(offset + limit) < totalCount)
	c.JSON(http.StatusOK, gin.H{
		"sessions": response,
		"count":    len(response),
		"total":    totalCount,
		"limit":    limit,
		"offset":   offset,
		"has_more": int64(offset + limit) < totalCount,
	})
}
