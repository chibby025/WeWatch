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

	sessionID := client.GetSessionID()
	if sessionID == "" {
		return fmt.Errorf("no active session")
	}

	log.Printf("🎬 [LiveShare] Mode selected: %s for session %s", mode, sessionID)

	// For podcast mode, extract additional config
	if mode == "podcast" {
		podcastTitle, _ := data["podcastTitle"].(string)
		podcastLogoURL, _ := data["podcastLogoURL"].(string)
		
		// Extract guest user ID
		var guestUserID *uint
		if guestIDFloat, ok := data["guestUserId"].(float64); ok {
			guestID := uint(guestIDFloat)
			guestUserID = &guestID
		}

		log.Printf("🎙️ [LiveShare] Podcast config - Title: %s, Logo: %s, Guest: %v", 
			podcastTitle, podcastLogoURL, guestUserID)

		// Update watch_sessions with podcast config
		updateData := map[string]interface{}{
			"liveshare_mode":   mode,
			"podcast_title":    podcastTitle,
			"podcast_logo_url": podcastLogoURL,
		}
		
		if guestUserID != nil {
			updateData["podcast_guest_user_id"] = *guestUserID
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
		result := h.db.Exec("UPDATE watch_sessions SET liveshare_mode = ? WHERE session_id = ?", mode, sessionID)
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

	// Include podcast config in broadcast if it's a podcast
	if mode == "podcast" {
		if podcastTitle, ok := data["podcastTitle"].(string); ok {
			broadcastMsg["data"].(map[string]interface{})["podcastTitle"] = podcastTitle
		}
		if podcastLogoURL, ok := data["podcastLogoURL"].(string); ok {
			broadcastMsg["data"].(map[string]interface{})["podcastLogoURL"] = podcastLogoURL
		}
		if guestIDFloat, ok := data["guestUserId"].(float64); ok {
			broadcastMsg["data"].(map[string]interface{})["guestUserId"] = uint(guestIDFloat)
		}
	}

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

	log.Printf("🎬 [LiveShare] Granting permission to user %d in session %s", targetUserID, sessionID)

	// Insert guest entry with 'granted' status
	result := h.db.Exec(`
		INSERT INTO liveshare_participants (session_id, user_id, role, status, position, granted_at)
		VALUES ($1, $2, 'guest', 'granted', 1, NOW())
		ON CONFLICT (session_id, user_id) 
		DO UPDATE SET status = 'granted', granted_at = NOW(), left_at = NULL
	`, sessionID, targetUserID)

	if result.Error != nil {
		return fmt.Errorf("failed to grant permission: %w", result.Error)
	}

	// Send permission_granted to the specific user
	grantMsg := map[string]interface{}{
		"type": "liveshare_permission_granted",
		"data": map[string]interface{}{
			"hasPermission": true,
		},
	}

	msgBytes, _ := json.Marshal(grantMsg)
	h.hub.BroadcastToUser(targetUserID, client.GetRoomID(), OutgoingMessage{
		Data:     msgBytes,
		IsBinary: false,
	})

	log.Printf("✅ [LiveShare] Permission granted to user %d", targetUserID)
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
