// backend/internal/handlers/liveshare/liveshare_handler.go
package liveshare

import (
	"encoding/json"
	"fmt"
	"log"

	"gorm.io/gorm"
)

// LiveShareHandler handles LiveShare-related WebSocket messages
type LiveShareHandler struct {
	db  *gorm.DB
	hub WebSocketHub
}

// OutgoingMessage wraps websocket message with binary flag
// Note: This MUST match handlers.OutgoingMessage exactly
type OutgoingMessage struct {
	Data     []byte
	IsBinary bool
}

// WebSocketHub interface for broadcasting messages
// Note: These method signatures MUST match Hub's actual methods
type WebSocketHub interface {
	BroadcastToRoom(roomID uint, message OutgoingMessage, sender interface{})
	BroadcastToUser(userID uint, roomID uint, message OutgoingMessage)
}

// Client interface - minimal interface for what we need from websocket.Client
type Client interface {
	GetUserID() uint
	GetRoomID() uint
	GetSessionID() string
}

// NewLiveShareHandler creates a new LiveShare handler
func NewLiveShareHandler(db *gorm.DB, hub WebSocketHub) *LiveShareHandler {
	return &LiveShareHandler{
		db:  db,
		hub: hub,
	}
}

// HandleMessage routes LiveShare WebSocket messages to appropriate handlers
func (h *LiveShareHandler) HandleMessage(msgType string, data map[string]interface{}, client Client) error {
	log.Printf("🎬 [LiveShare] Handling message: %s from user %d", msgType, client.GetUserID())

	switch msgType {
	case "liveshare_mode_selected":
		return h.handleModeSelected(data, client)
	case "liveshare_type_selected":
		return h.handleTypeSelected(data, client)
	case "liveshare_grant_permission":
		return h.handleGrantPermission(data, client)
	case "liveshare_revoke_permission":
		return h.handleRevokePermission(data, client)
	case "liveshare_join":
		return h.handleJoin(data, client)
	case "liveshare_leave":
		return h.handleLeave(data, client)
	case "liveshare_kick_guest":
		return h.handleKickGuest(data, client)
	case "liveshare_graphics_update":
		return h.handleGraphicsUpdate(data, client)
	case "liveshare_break_started":
		return h.handleBreakStarted(data, client)
	case "liveshare_break_ended":
		return h.handleBreakEnded(data, client)
	case "liveshare_guest_joined":
		return h.handleGuestJoined(data, client)
	case "liveshare_layout_update":
		return h.handleLayoutUpdate(data, client)
	case "liveshare_guest_switched_type":
		return h.handleGuestSwitchedType(data, client)
	case "liveshare_guest_left":
		return h.handleGuestLeft(data, client)
	case "bible_verse_update":
		return h.handleBibleVerseUpdate(data, client)
	case "hymn_update":
		return h.handleHymnUpdate(data, client)
	case "sermon_update":
		return h.handleSermonUpdate(data, client)
	case "sermon_navigate":
		return h.handleSermonNavigate(data, client)
	default:
		return fmt.Errorf("unknown LiveShare message type: %s", msgType)
	}
}

// handleModeSelected - Host selects LiveShare mode (regular, podcast, interview, etc.)
func (h *LiveShareHandler) handleModeSelected(data map[string]interface{}, client Client) error {
	mode, ok := data["mode"].(string)
	if !ok {
		return fmt.Errorf("missing or invalid 'mode' field")
	}

	// Migration: Convert deprecated 'standup' mode to 'show'
	if mode == "standup" {
		log.Printf("⚠️ [LiveShare] Migrating deprecated 'standup' mode to 'show'")
		mode = "show"
	}

	sessionID := client.GetSessionID()
	if sessionID == "" {
		return fmt.Errorf("no active session")
	}

	log.Printf("🎬 [LiveShare] Mode selected: %s for session %s", mode, sessionID)

	// Extract layout if provided
	layout, layoutOk := data["layout"].(string)
	log.Printf("🔍 [LiveShare] Layout extraction: layout='%s', ok=%v, rawData=%+v", layout, layoutOk, data)
	if layout != "" {
		log.Printf("🎨 [LiveShare] Layout specified: %s", layout)
	} else {
		log.Printf("⚠️ [LiveShare] No layout in incoming data or layout is empty string")
	}

	// For podcast or church mode, extract additional config (both use same fields: title, logo, guest)
	if mode == "podcast" || mode == "church" {
		podcastTitle, _ := data["podcastTitle"].(string)
		podcastLogoURL, _ := data["podcastLogoURL"].(string)
		
		// Extract guest user ID
		var guestUserID *uint
		if guestIDFloat, ok := data["guestUserId"].(float64); ok {
			guestID := uint(guestIDFloat)
			guestUserID = &guestID
		}

		log.Printf("🎙️ [LiveShare] %s config - Title: %s, Logo: %s, Guest: %v", 
			mode, podcastTitle, podcastLogoURL, guestUserID)

		// Update watch_sessions with podcast config
		updateData := map[string]interface{}{
			"liveshare_mode":   mode,
			"podcast_title":    podcastTitle,
			"podcast_logo_url": podcastLogoURL,
		}
		
		if guestUserID != nil {
			updateData["podcast_guest_user_id"] = *guestUserID
		}
		
		// Include layout if provided
		if layout != "" {
			updateData["liveshare_layout"] = layout
		}

		result := h.db.Table("watch_sessions").
			Where("session_id = ?", sessionID).
			Updates(updateData)

		if result.Error != nil {
			return fmt.Errorf("failed to update podcast config: %w", result.Error)
		}

		// If guest is specified, grant them permission automatically
		if guestUserID != nil {
			result := h.db.Exec(`
				INSERT INTO liveshare_participants (session_id, user_id, role, status, position, granted_at)
				VALUES ($1, $2, 'guest', 'granted', 1, NOW())
				ON CONFLICT (session_id, user_id) 
				DO UPDATE SET status = 'granted', granted_at = NOW(), left_at = NULL
			`, sessionID, *guestUserID)

			if result.Error != nil {
				log.Printf("⚠️ [LiveShare] Failed to grant guest permission: %v", result.Error)
			} else {
				// Notify the guest they've been invited
				grantMsg := map[string]interface{}{
					"type": "liveshare_permission_granted",
					"data": map[string]interface{}{
						"hasPermission": true,
						"mode":          "podcast",
						"title":         podcastTitle,
					},
				}

				msgBytes, _ := json.Marshal(grantMsg)
				h.hub.BroadcastToUser(*guestUserID, client.GetRoomID(), OutgoingMessage{
					Data:     msgBytes,
					IsBinary: false,
				})
				log.Printf("✅ [LiveShare] Guest %d invited to podcast", *guestUserID)
			}
		}
	} else {
		// For non-podcast modes, just update the mode
		updateData := map[string]interface{}{
			"liveshare_mode": mode,
		}
		
		// Include layout if provided
		if layout != "" {
			updateData["liveshare_layout"] = layout
		}
		
		result := h.db.Table("watch_sessions").
			Where("session_id = ?", sessionID).
			Updates(updateData)
			
		if result.Error != nil {
			return fmt.Errorf("failed to update liveshare_mode: %w", result.Error)
		}
	}

	// Broadcast to all members in the room
	broadcastMsg := map[string]interface{}{
		"type": "liveshare_mode_selected",
		"data": map[string]interface{}{
			"mode": mode,
		},
	}

	// Include config in broadcast for podcast, show, news, and church modes (all support title + logo)
	if mode == "podcast" || mode == "show" || mode == "news" || mode == "church" {
		if podcastTitle, ok := data["podcastTitle"].(string); ok {
			broadcastMsg["data"].(map[string]interface{})["podcastTitle"] = podcastTitle
			log.Printf("📡 [LiveShare] Including title in %s broadcast: %s", mode, podcastTitle)
		}
		if podcastLogoURL, ok := data["podcastLogoURL"].(string); ok {
			broadcastMsg["data"].(map[string]interface{})["podcastLogoURL"] = podcastLogoURL
			log.Printf("📡 [LiveShare] Including logo in %s broadcast: %s", mode, podcastLogoURL)
		}
		if guestIDFloat, ok := data["guestUserId"].(float64); ok {
			broadcastMsg["data"].(map[string]interface{})["guestUserId"] = uint(guestIDFloat)
			log.Printf("📡 [LiveShare] Including guest in %s broadcast: %d", mode, uint(guestIDFloat))
		}
		if titleStyle, ok := data["titleStyle"]; ok && titleStyle != nil {
			broadcastMsg["data"].(map[string]interface{})["titleStyle"] = titleStyle
		}
		if logoStyle, ok := data["logoStyle"]; ok && logoStyle != nil {
			broadcastMsg["data"].(map[string]interface{})["logoStyle"] = logoStyle
		}

		// ✅ For church mode, include current Bible verse and hymn for late joiners
		if mode == "church" {
			var session struct {
				CurrentBibleVerse *string `gorm:"column:current_bible_verse"`
				CurrentHymn       *string `gorm:"column:current_hymn"`
				CurrentHymnVerse  *int    `gorm:"column:current_hymn_verse"`
			}
			
			if err := h.db.Table("watch_sessions").
				Select("current_bible_verse, current_hymn, current_hymn_verse").
				Where("session_id = ?", sessionID).
				Scan(&session).Error; err == nil {
				
				if session.CurrentBibleVerse != nil && *session.CurrentBibleVerse != "" {
					// Parse JSON string back to map
					var verseData map[string]interface{}
					if err := json.Unmarshal([]byte(*session.CurrentBibleVerse), &verseData); err == nil {
						broadcastMsg["data"].(map[string]interface{})["currentBibleVerse"] = verseData
						log.Printf("📖 [LiveShare] Including current Bible verse for late joiners")
					}
				}
				
				if session.CurrentHymn != nil && *session.CurrentHymn != "" {
					// Parse JSON string back to map
					var hymnData map[string]interface{}
					if err := json.Unmarshal([]byte(*session.CurrentHymn), &hymnData); err == nil {
						broadcastMsg["data"].(map[string]interface{})["currentHymn"] = hymnData
						verseNum := 1
						if session.CurrentHymnVerse != nil {
							verseNum = *session.CurrentHymnVerse
							broadcastMsg["data"].(map[string]interface{})["currentHymnVerse"] = verseNum
						}
						log.Printf("🎵 [LiveShare] Including current hymn for late joiners (verse %d)", verseNum)
					}
				}
			}
		}
	}
	
	// Include layout in broadcast if provided
	if layout != "" {
		broadcastMsg["data"].(map[string]interface{})["layout"] = layout
		log.Printf("📡 [LiveShare] Layout ADDED to broadcast message: %s", layout)
	} else {
		log.Printf("⚠️ [LiveShare] Layout NOT added to broadcast (empty or not provided)")
	}
	
	log.Printf("📡 [LiveShare] Final broadcast message data: %+v", broadcastMsg["data"])
	msgBytes, _ := json.Marshal(broadcastMsg)
	h.hub.BroadcastToRoom(client.GetRoomID(), OutgoingMessage{
		Data:     msgBytes,
		IsBinary: false,
	}, client)

	log.Printf("✅ [LiveShare] Mode %s set for session %s", mode, sessionID)
	return nil
}

// handleTypeSelected - Host selects their share type (camera, screen, both)
func (h *LiveShareHandler) handleTypeSelected(data map[string]interface{}, client Client) error {
	shareType, ok := data["shareType"].(string)
	if !ok {
		return fmt.Errorf("missing or invalid 'shareType' field")
	}

	sessionID := client.GetSessionID()
	if sessionID == "" {
		return fmt.Errorf("no active session")
	}

	log.Printf("🎬 [LiveShare] Type selected: %s for session %s", shareType, sessionID)

	// Insert or update host entry in liveshare_participants
	// PostgreSQL syntax with ON CONFLICT
	result := h.db.Exec(`
		INSERT INTO liveshare_participants (session_id, user_id, role, share_type, status, position, granted_at)
		VALUES ($1, $2, 'host', $3, 'active', 0, NOW())
		ON CONFLICT (session_id, user_id) 
		DO UPDATE SET share_type = EXCLUDED.share_type, status = 'active', joined_at = NOW()
	`, sessionID, client.GetUserID(), shareType)
	
	if result.Error != nil {
		return fmt.Errorf("failed to update liveshare_participants: %w", result.Error)
	}

	// Broadcast to all members
	broadcastMsg := map[string]interface{}{
		"type": "liveshare_type_selected",
		"data": map[string]interface{}{
			"userId":    client.GetUserID(),
			"shareType": shareType,
		},
	}

	msgBytes, _ := json.Marshal(broadcastMsg)
	h.hub.BroadcastToRoom(client.GetRoomID(), OutgoingMessage{
		Data:     msgBytes,
		IsBinary: false,
	}, client)

	log.Printf("✅ [LiveShare] Type %s set for host %d in session %s", shareType, client.GetUserID(), sessionID)
	return nil
}

// handleGrantPermission - Host grants permission to a member
func (h *LiveShareHandler) handleGrantPermission(data map[string]interface{}, client Client) error {
	targetUserIDFloat, ok := data["userId"].(float64)
	if !ok {
		return fmt.Errorf("missing or invalid 'userId' field")
	}
	targetUserID := uint(targetUserIDFloat)

	sessionID := client.GetSessionID()
	if sessionID == "" {
		return fmt.Errorf("no active session")
	}

	log.Printf("�️ [GRANT PERMISSION] Host %d granting permission to user %d in session %s", client.GetUserID(), targetUserID, sessionID)

	// Insert guest entry with 'granted' status
	result := h.db.Exec(`
		INSERT INTO liveshare_participants (session_id, user_id, role, status, position, granted_at)
		VALUES ($1, $2, 'guest', 'granted', 1, NOW())
		ON CONFLICT (session_id, user_id) 
		DO UPDATE SET status = 'granted', granted_at = NOW(), left_at = NULL
	`, sessionID, targetUserID)

	if result.Error != nil {
		log.Printf("❌ [GRANT PERMISSION] Database error: %v", result.Error)
		return fmt.Errorf("failed to grant permission: %w", result.Error)
	}

	log.Printf("💾 [GRANT PERMISSION] Database updated - rows affected: %d", result.RowsAffected)

	// Send permission_granted to the specific user
	grantMsg := map[string]interface{}{
		"type": "liveshare_permission_granted",
		"data": map[string]interface{}{
			"hasPermission": true,
		},
	}

	msgBytes, _ := json.Marshal(grantMsg)
	
	log.Printf("📤 [GRANT PERMISSION] Broadcasting to user %d in room %s", targetUserID, client.GetRoomID())
	
	h.hub.BroadcastToUser(targetUserID, client.GetRoomID(), OutgoingMessage{
		Data:     msgBytes,
		IsBinary: false,
	})

	log.Printf("✅ [GRANT PERMISSION] Permission granted successfully to user %d", targetUserID)
	return nil
}

// handleRevokePermission - Host revokes permission from a member
func (h *LiveShareHandler) handleRevokePermission(data map[string]interface{}, client Client) error {
	targetUserIDFloat, ok := data["userId"].(float64)
	if !ok {
		return fmt.Errorf("missing or invalid 'userId' field")
	}
	targetUserID := uint(targetUserIDFloat)

	sessionID := client.GetSessionID()
	if sessionID == "" {
		return fmt.Errorf("no active session")
	}

	log.Printf("🎬 [LiveShare] Revoking permission from user %d in session %s", targetUserID, sessionID)

	// Update status to 'revoked'
	result := h.db.Exec(`
		UPDATE liveshare_participants 
		SET status = 'revoked', left_at = NOW() 
		WHERE session_id = $1 AND user_id = $2
	`, sessionID, targetUserID)

	if result.Error != nil {
		return fmt.Errorf("failed to revoke permission: %w", result.Error)
	}

	// Send permission_revoked to the specific user
	revokeMsg := map[string]interface{}{
		"type": "liveshare_permission_revoked",
		"data": map[string]interface{}{
			"hasPermission": false,
		},
	}

	msgBytes, _ := json.Marshal(revokeMsg)
	h.hub.BroadcastToUser(targetUserID, client.GetRoomID(), OutgoingMessage{
		Data:     msgBytes,
		IsBinary: false,
	})

	log.Printf("✅ [LiveShare] Permission revoked from user %d", targetUserID)
	return nil
}

// handleJoin - Guest joins LiveShare with their share type
func (h *LiveShareHandler) handleJoin(data map[string]interface{}, client Client) error {
	shareType, ok := data["shareType"].(string)
	if !ok {
		return fmt.Errorf("missing or invalid 'shareType' field")
	}

	sessionID := client.GetSessionID()
	if sessionID == "" {
		return fmt.Errorf("no active session")
	}

	log.Printf("🎬 [LiveShare] User %d joining with type: %s", client.GetUserID(), shareType)

	// Update status to 'active' and set share_type
	result := h.db.Exec(`
		UPDATE liveshare_participants 
		SET status = 'active', share_type = $1, joined_at = NOW() 
		WHERE session_id = $2 AND user_id = $3 AND status = 'granted'
	`, shareType, sessionID, client.GetUserID())

	if result.Error != nil {
		return fmt.Errorf("failed to join: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("no permission granted or already active")
	}

	// Broadcast guest status to room
	broadcastMsg := map[string]interface{}{
		"type": "liveshare_guest_status",
		"data": map[string]interface{}{
			"userId":    client.GetUserID(),
			"status":    "active",
			"shareType": shareType,
		},
	}

	msgBytes, _ := json.Marshal(broadcastMsg)
	h.hub.BroadcastToRoom(client.GetRoomID(), OutgoingMessage{
		Data:     msgBytes,
		IsBinary: false,
	}, client)

	log.Printf("✅ [LiveShare] User %d joined successfully", client.GetUserID())
	return nil
}

// handleLeave - Guest leaves LiveShare voluntarily
func (h *LiveShareHandler) handleLeave(data map[string]interface{}, client Client) error {
	sessionID := client.GetSessionID()
	if sessionID == "" {
		return fmt.Errorf("no active session")
	}

	log.Printf("🎬 [LiveShare] User %d leaving session %s", client.GetUserID(), sessionID)

	// Update status to 'left'
	result := h.db.Exec(`
		UPDATE liveshare_participants 
		SET status = 'left', left_at = NOW() 
		WHERE session_id = $1 AND user_id = $2
	`, sessionID, client.GetUserID())

	if result.Error != nil {
		return fmt.Errorf("failed to leave: %w", result.Error)
	}

	// Broadcast guest left to room
	broadcastMsg := map[string]interface{}{
		"type": "liveshare_guest_status",
		"data": map[string]interface{}{
			"userId": client.GetUserID(),
			"status": "left",
		},
	}

	msgBytes, _ := json.Marshal(broadcastMsg)
	h.hub.BroadcastToRoom(client.GetRoomID(), OutgoingMessage{
		Data:     msgBytes,
		IsBinary: false,
	}, client)

	log.Printf("✅ [LiveShare] User %d left successfully", client.GetUserID())
	return nil
}

// handleKickGuest - Host kicks an active guest
func (h *LiveShareHandler) handleKickGuest(data map[string]interface{}, client Client) error {
	targetUserIDFloat, ok := data["userId"].(float64)
	if !ok {
		return fmt.Errorf("missing or invalid 'userId' field")
	}
	targetUserID := uint(targetUserIDFloat)

	sessionID := client.GetSessionID()
	if sessionID == "" {
		return fmt.Errorf("no active session")
	}

	log.Printf("🎬 [LiveShare] Host kicking user %d from session %s", targetUserID, sessionID)

	// Update status to 'left'
	result := h.db.Exec(`
		UPDATE liveshare_participants 
		SET status = 'left', left_at = NOW() 
		WHERE session_id = $1 AND user_id = $2
	`, sessionID, targetUserID)

	if result.Error != nil {
		return fmt.Errorf("failed to kick guest: %w", result.Error)
	}

	// Send kicked notification to the guest
	kickMsg := map[string]interface{}{
		"type": "liveshare_guest_kicked",
		"data": map[string]interface{}{
			"message": "You have been removed from LiveShare by the host",
		},
	}

	msgBytes, _ := json.Marshal(kickMsg)
	h.hub.BroadcastToUser(targetUserID, client.GetRoomID(), OutgoingMessage{
		Data:     msgBytes,
		IsBinary: false,
	})

	// Broadcast to everyone that guest left
	broadcastMsg := map[string]interface{}{
		"type": "liveshare_guest_status",
		"data": map[string]interface{}{
			"userId": targetUserID,
			"status": "left",
		},
	}

	broadcastBytes, _ := json.Marshal(broadcastMsg)
	h.hub.BroadcastToRoom(client.GetRoomID(), OutgoingMessage{
		Data:     broadcastBytes,
		IsBinary: false,
	}, client)

	log.Printf("✅ [LiveShare] User %d kicked successfully", targetUserID)
	return nil
}

// handleGraphicsUpdate - Broadcast graphics updates (lower third, banner, ticker, etc.)
func (h *LiveShareHandler) handleGraphicsUpdate(data map[string]interface{}, client Client) error {
	log.Printf("🎨 [LiveShare] Graphics update from user %d", client.GetUserID())
	
	// Extract graphic data
	graphic, ok := data["graphic"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("missing or invalid 'graphic' field")
	}
	
	// Validate required fields
	graphicType, ok := graphic["type"].(string)
	if !ok {
		return fmt.Errorf("missing or invalid graphic 'type'")
	}
	
	sessionID := client.GetSessionID()
	if sessionID == "" {
		return fmt.Errorf("no active session")
	}
	
	log.Printf("🎨 [LiveShare] Broadcasting %s graphic update to room %d", graphicType, client.GetRoomID())
	
	// ✅ PERSIST GRAPHICS STATE: Save to watch_sessions for late joiners
	// Convert graphic data to JSON string
	graphicJSON, err := json.Marshal(graphic)
	if err != nil {
		log.Printf("⚠️ [LiveShare] Failed to marshal graphic data: %v", err)
	} else {
		// Determine which column to update based on graphic type
		var updateQuery string
		switch graphicType {
		case "banner":
			updateQuery = "UPDATE watch_sessions SET liveshare_banner_text = $1 WHERE session_id = $2"
		case "ticker":
			updateQuery = "UPDATE watch_sessions SET liveshare_ticker_items = $1 WHERE session_id = $2"
		case "lower_third":
			updateQuery = "UPDATE watch_sessions SET liveshare_lower_third = $1 WHERE session_id = $2"
		case "logo_bug":
			updateQuery = "UPDATE watch_sessions SET liveshare_logo_bug = $1 WHERE session_id = $2"
		}
		
		if updateQuery != "" {
			// Check if graphic is active or being removed
			isActive, _ := graphic["active"].(bool)
			
			// If inactive (removed), clear the field
			var valueToSave interface{}
			if isActive {
				valueToSave = string(graphicJSON)
			} else {
				valueToSave = "" // Clear the field
			}
			
			result := h.db.Exec(updateQuery, valueToSave, sessionID)
			if result.Error != nil {
				log.Printf("⚠️ [LiveShare] Failed to persist %s graphic: %v", graphicType, result.Error)
			} else {
				log.Printf("💾 [LiveShare] Persisted %s graphic to database (active: %v)", graphicType, isActive)
			}
		}
	}
	
	// Broadcast to all room members
	broadcastMsg := map[string]interface{}{
		"type": "liveshare_graphics_update",
		"data": data,
	}
	
	broadcastBytes, err := json.Marshal(broadcastMsg)
	if err != nil {
		return fmt.Errorf("failed to marshal graphics update: %v", err)
	}
	
	h.hub.BroadcastToRoom(client.GetRoomID(), OutgoingMessage{
		Data:     broadcastBytes,
		IsBinary: false,
	}, client)
	
	log.Printf("✅ [LiveShare] Graphics update broadcast successfully")
	return nil
}

// handleBreakStarted - Host starts a break
func (h *LiveShareHandler) handleBreakStarted(data map[string]interface{}, client Client) error {
	log.Printf("⏸️ [LiveShare] Break started by user %d", client.GetUserID())
	
	sessionID := client.GetSessionID()
	if sessionID == "" {
		return fmt.Errorf("no active session")
	}
	
	// ✅ PERSIST BREAK STATE: Save to watch_sessions for late joiners
	breakDataJSON, err := json.Marshal(data)
	if err == nil {
		result := h.db.Exec("UPDATE watch_sessions SET liveshare_break_screen = $1 WHERE session_id = $2", 
			string(breakDataJSON), sessionID)
		if result.Error != nil {
			log.Printf("⚠️ [LiveShare] Failed to persist break screen: %v", result.Error)
		} else {
			log.Printf("💾 [LiveShare] Persisted break screen to database")
		}
	}
	
	// Broadcast to all room members
	broadcastMsg := map[string]interface{}{
		"type": "liveshare_break_started",
		"data": data,
	}
	
	broadcastBytes, err := json.Marshal(broadcastMsg)
	if err != nil {
		return fmt.Errorf("failed to marshal break started message: %v", err)
	}
	
	h.hub.BroadcastToRoom(client.GetRoomID(), OutgoingMessage{
		Data:     broadcastBytes,
		IsBinary: false,
	}, client)
	
	log.Printf("✅ [LiveShare] Break started broadcast successfully")
	return nil
}

// handleBreakEnded - Host ends a break
func (h *LiveShareHandler) handleBreakEnded(data map[string]interface{}, client Client) error {
	log.Printf("▶️ [LiveShare] Break ended by user %d", client.GetUserID())
	
	sessionID := client.GetSessionID()
	if sessionID == "" {
		return fmt.Errorf("no active session")
	}
	
	// ✅ CLEAR BREAK STATE: Remove from database
	result := h.db.Exec("UPDATE watch_sessions SET liveshare_break_screen = $1 WHERE session_id = $2", "", sessionID)
	if result.Error != nil {
		log.Printf("⚠️ [LiveShare] Failed to clear break screen: %v", result.Error)
	} else {
		log.Printf("💾 [LiveShare] Cleared break screen from database")
	}
	
	// Broadcast to all room members
	broadcastMsg := map[string]interface{}{
		"type": "liveshare_break_ended",
		"data": data,
	}
	
	broadcastBytes, err := json.Marshal(broadcastMsg)
	if err != nil {
		return fmt.Errorf("failed to marshal break ended message: %v", err)
	}
	
	h.hub.BroadcastToRoom(client.GetRoomID(), OutgoingMessage{
		Data:     broadcastBytes,
		IsBinary: false,
	}, client)
	
	log.Printf("✅ [LiveShare] Break ended broadcast successfully")
	return nil
}

// handleGuestJoined - Guest joined LiveShare, update database and broadcast to host
func (h *LiveShareHandler) handleGuestJoined(data map[string]interface{}, client Client) error {
	sessionID := client.GetSessionID()
	if sessionID == "" {
		return fmt.Errorf("no active session")
	}

	guestShareType, _ := data["guestShareType"].(string)
	suggestedLayout, _ := data["suggestedLayout"].(string)

	log.Printf("🎙️ [LiveShare] Guest %d joined with type: %s, suggested layout: %s", client.GetUserID(), guestShareType, suggestedLayout)

	// Update guest status to 'active' in database
	result := h.db.Exec(`
		UPDATE liveshare_participants 
		SET status = 'active', share_type = $1, joined_at = NOW() 
		WHERE session_id = $2 AND user_id = $3 AND status = 'granted'
	`, guestShareType, sessionID, client.GetUserID())

	if result.Error != nil {
		log.Printf("⚠️ [LiveShare] Failed to update guest status: %v", result.Error)
	}

	// Broadcast to all room members (especially host)
	broadcastMsg := map[string]interface{}{
		"type": "liveshare_guest_joined",
		"data": map[string]interface{}{
			"userId":          client.GetUserID(),
			"guestShareType":  guestShareType,
			"suggestedLayout": suggestedLayout,
		},
	}

	msgBytes, _ := json.Marshal(broadcastMsg)
	h.hub.BroadcastToRoom(client.GetRoomID(), OutgoingMessage{
		Data:     msgBytes,
		IsBinary: false,
	}, client)

	log.Printf("✅ [LiveShare] Guest joined broadcast sent")
	return nil
}

// handleLayoutUpdate - broadcast a layout change to all room viewers
func (h *LiveShareHandler) handleLayoutUpdate(data map[string]interface{}, client Client) error {
	layout, _ := data["layout"].(string)
	if layout == "" {
		return fmt.Errorf("missing layout field")
	}

	broadcastMsg := map[string]interface{}{
		"type": "liveshare_layout_update",
		"data": map[string]interface{}{
			"layout": layout,
		},
	}
	msgBytes, _ := json.Marshal(broadcastMsg)
	h.hub.BroadcastToRoom(client.GetRoomID(), OutgoingMessage{
		Data:     msgBytes,
		IsBinary: false,
	}, client)

	log.Printf("✅ [LiveShare] Layout update broadcast: %s", layout)
	return nil
}

// handleGuestSwitchedType - Guest switched share type mid-stream
func (h *LiveShareHandler) handleGuestSwitchedType(data map[string]interface{}, client Client) error {
	sessionID := client.GetSessionID()
	if sessionID == "" {
		return fmt.Errorf("no active session")
	}

	newShareType, _ := data["newShareType"].(string)
	suggestedLayout, _ := data["suggestedLayout"].(string)

	log.Printf("🔄 [LiveShare] Guest %d switched to: %s, suggested layout: %s", client.GetUserID(), newShareType, suggestedLayout)

	// Update guest share_type in database
	result := h.db.Exec(`
		UPDATE liveshare_participants 
		SET share_type = $1 
		WHERE session_id = $2 AND user_id = $3 AND status = 'active'
	`, newShareType, sessionID, client.GetUserID())

	if result.Error != nil {
		log.Printf("⚠️ [LiveShare] Failed to update guest share type: %v", result.Error)
	}

	// Broadcast to all room members (especially host)
	broadcastMsg := map[string]interface{}{
		"type": "liveshare_guest_switched_type",
		"data": map[string]interface{}{
			"userId":          client.GetUserID(),
			"newShareType":    newShareType,
			"suggestedLayout": suggestedLayout,
		},
	}

	msgBytes, _ := json.Marshal(broadcastMsg)
	h.hub.BroadcastToRoom(client.GetRoomID(), OutgoingMessage{
		Data:     msgBytes,
		IsBinary: false,
	}, client)

	log.Printf("✅ [LiveShare] Guest switch type broadcast sent")
	return nil
}

// handleGuestLeft - Guest left LiveShare, cleanup and broadcast to host
func (h *LiveShareHandler) handleGuestLeft(data map[string]interface{}, client Client) error {
	sessionID := client.GetSessionID()
	if sessionID == "" {
		return fmt.Errorf("no active session")
	}

	defaultLayout, _ := data["defaultLayout"].(string)

	log.Printf("👋 [LiveShare] Guest %d left, suggested default layout: %s", client.GetUserID(), defaultLayout)

	// Update guest status to 'left' and clear permission
	result := h.db.Exec(`
		UPDATE liveshare_participants 
		SET status = 'left', left_at = NOW() 
		WHERE session_id = $1 AND user_id = $2
	`, sessionID, client.GetUserID())

	if result.Error != nil {
		log.Printf("⚠️ [LiveShare] Failed to update guest status on leave: %v", result.Error)
	}

	// Broadcast to all room members (especially host)
	broadcastMsg := map[string]interface{}{
		"type": "liveshare_guest_left",
		"data": map[string]interface{}{
			"userId":        client.GetUserID(),
			"defaultLayout": defaultLayout,
		},
	}

	msgBytes, _ := json.Marshal(broadcastMsg)
	h.hub.BroadcastToRoom(client.GetRoomID(), OutgoingMessage{
		Data:     msgBytes,
		IsBinary: false,
	}, client)

	log.Printf("✅ [LiveShare] Guest left broadcast sent, database cleaned up")
	return nil
}

// handleBibleVerseUpdate - Host shows/hides Bible verse (Church mode)
func (h *LiveShareHandler) handleBibleVerseUpdate(data map[string]interface{}, client Client) error {
	sessionID := client.GetSessionID()
	if sessionID == "" {
		return fmt.Errorf("no active session")
	}

	verse, _ := data["verse"].(map[string]interface{})
	active, _ := data["active"].(bool)

	log.Printf("📖 [LiveShare] Bible verse update - Session: %s, Active: %v", sessionID, active)

	// Persist to database (for late joiners)
	if active && verse != nil {
		verseJSON, err := json.Marshal(verse)
		if err != nil {
			return fmt.Errorf("failed to marshal verse data: %w", err)
		}

		result := h.db.Table("watch_sessions").
			Where("session_id = ?", sessionID).
			Update("current_bible_verse", string(verseJSON))

		if result.Error != nil {
			return fmt.Errorf("failed to save Bible verse: %w", result.Error)
		}

		log.Printf("✅ [LiveShare] Bible verse saved to database")
	} else {
		// Clear verse from database
		result := h.db.Table("watch_sessions").
			Where("session_id = ?", sessionID).
			Update("current_bible_verse", nil)

		if result.Error != nil {
			log.Printf("⚠️ [LiveShare] Failed to clear Bible verse: %v", result.Error)
		}

		log.Printf("✅ [LiveShare] Bible verse cleared from database")
	}

	// Broadcast to all room members
	broadcastMsg := map[string]interface{}{
		"type": "bible_verse_update",
		"data": map[string]interface{}{
			"verse":  verse,
			"active": active,
		},
	}

	msgBytes, _ := json.Marshal(broadcastMsg)
	h.hub.BroadcastToRoom(client.GetRoomID(), OutgoingMessage{
		Data:     msgBytes,
		IsBinary: false,
	}, client)

	log.Printf("✅ [LiveShare] Bible verse update broadcast sent")
	return nil
}

// handleHymnUpdate - Host shows/hides hymn (Church mode)
func (h *LiveShareHandler) handleHymnUpdate(data map[string]interface{}, client Client) error {
	sessionID := client.GetSessionID()
	if sessionID == "" {
		return fmt.Errorf("no active session")
	}

	hymn, _ := data["hymn"].(map[string]interface{})
	active, _ := data["active"].(bool)
	verse, _ := data["verse"].(float64) // JavaScript sends numbers as float64
	verseInt := int(verse)
	if verseInt == 0 {
		verseInt = 1 // Default to verse 1
	}

	log.Printf("🎵 [LiveShare] Hymn update - Session: %s, Active: %v, Verse: %d", sessionID, active, verseInt)

	// Persist to database (for late joiners)
	if active && hymn != nil {
		hymnJSON, err := json.Marshal(hymn)
		if err != nil {
			return fmt.Errorf("failed to marshal hymn data: %w", err)
		}

		result := h.db.Table("watch_sessions").
			Where("session_id = ?", sessionID).
			Updates(map[string]interface{}{
				"current_hymn":       string(hymnJSON),
				"current_hymn_verse": verseInt,
			})

		if result.Error != nil {
			return fmt.Errorf("failed to save hymn: %w", result.Error)
		}

		log.Printf("✅ [LiveShare] Hymn saved to database (verse %d)", verseInt)
	} else {
		// Clear hymn from database
		result := h.db.Table("watch_sessions").
			Where("session_id = ?", sessionID).
			Updates(map[string]interface{}{
				"current_hymn":       nil,
				"current_hymn_verse": 1,
			})

		if result.Error != nil {
			log.Printf("⚠️ [LiveShare] Failed to clear hymn: %v", result.Error)
		}

		log.Printf("✅ [LiveShare] Hymn cleared from database")
	}

	// Broadcast to all room members
	broadcastMsg := map[string]interface{}{
		"type": "hymn_update",
		"data": map[string]interface{}{
			"hymn":   hymn,
			"active": active,
			"verse":  verseInt,
		},
	}

	msgBytes, _ := json.Marshal(broadcastMsg)
	h.hub.BroadcastToRoom(client.GetRoomID(), OutgoingMessage{
		Data:     msgBytes,
		IsBinary: false,
	}, client)

	log.Printf("✅ [LiveShare] Hymn update broadcast sent")
	return nil
}

// handleSermonUpdate - Host starts or stops sermon display
func (h *LiveShareHandler) handleSermonUpdate(data map[string]interface{}, client Client) error {
	sessionID := client.GetSessionID()
	if sessionID == "" {
		return fmt.Errorf("no active session")
	}

	active, _ := data["active"].(bool)

	if active {
		// Persist full sermon state for late joiners
		sermonJSON, err := json.Marshal(data)
		if err != nil {
			log.Printf("⚠️ [LiveShare] Failed to marshal sermon data: %v", err)
		} else {
			result := h.db.Table("watch_sessions").
				Where("session_id = ?", sessionID).
				Update("current_sermon", string(sermonJSON))
			if result.Error != nil {
				log.Printf("⚠️ [LiveShare] Failed to persist sermon: %v", result.Error)
			}
		}
	} else {
		h.db.Table("watch_sessions").
			Where("session_id = ?", sessionID).
			Update("current_sermon", nil)
	}

	broadcastMsg := map[string]interface{}{
		"type": "sermon_update",
		"data": data,
	}

	msgBytes, _ := json.Marshal(broadcastMsg)
	h.hub.BroadcastToRoom(client.GetRoomID(), OutgoingMessage{
		Data:     msgBytes,
		IsBinary: false,
	}, client)

	log.Printf("✅ [LiveShare] Sermon update broadcast sent (active: %v)", active)
	return nil
}

// handleSermonNavigate - Host changes the current sermon page for all members
func (h *LiveShareHandler) handleSermonNavigate(data map[string]interface{}, client Client) error {
	sessionID := client.GetSessionID()
	if sessionID == "" {
		return fmt.Errorf("no active session")
	}

	currentPage, ok := data["currentPage"].(float64)
	if !ok {
		return fmt.Errorf("missing or invalid 'currentPage' field")
	}

	// Update persisted sermon's currentPage
	var sermonRaw struct {
		CurrentSermon *string `gorm:"column:current_sermon"`
	}
	if err := h.db.Table("watch_sessions").
		Select("current_sermon").
		Where("session_id = ?", sessionID).
		Scan(&sermonRaw).Error; err == nil && sermonRaw.CurrentSermon != nil {

		var sermonData map[string]interface{}
		if err := json.Unmarshal([]byte(*sermonRaw.CurrentSermon), &sermonData); err == nil {
			sermonData["currentPage"] = int(currentPage)
			if updated, err := json.Marshal(sermonData); err == nil {
				h.db.Table("watch_sessions").
					Where("session_id = ?", sessionID).
					Update("current_sermon", string(updated))
			}
		}
	}

	broadcastMsg := map[string]interface{}{
		"type": "sermon_navigate",
		"data": data,
	}

	msgBytes, _ := json.Marshal(broadcastMsg)
	h.hub.BroadcastToRoom(client.GetRoomID(), OutgoingMessage{
		Data:     msgBytes,
		IsBinary: false,
	}, client)

	log.Printf("✅ [LiveShare] Sermon navigate broadcast sent (page: %d)", int(currentPage))
	return nil
}
