// backend/internal/handlers/lobby_calls.go
package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"wewatch/internal/models"
	"github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go"
)

// CallState tracks active 1-on-1 calls
type CallState struct {
	CallID       string
	CallerID     uint
	RecipientID  uint
	RoomName     string
	CreatedAt    time.Time
	Status       string // "ringing", "active", "ended"
}

var (
	activeCallsMutex sync.RWMutex
	activeCalls      = make(map[string]*CallState) // callID -> CallState
	userCalls        = make(map[uint]string)       // userID -> callID
)

// HandleCallMessage handles call-related WebSocket messages
func HandleCallMessage(client *Client, msg WebSocketMessage) {
	log.Printf("📞 [Call] Message type: %s from user %d", msg.Type, client.userID)

	switch msg.Type {
	case "call_initiate":
		handleCallInitiate(client, msg)
	case "call_accept":
		handleCallAccept(client, msg)
	case "call_decline":
		handleCallDecline(client, msg)
	case "call_cancel":
		handleCallCancel(client, msg)
	case "call_end":
		handleCallEnd(client, msg)
	}
}

func handleCallInitiate(client *Client, msg WebSocketMessage) {
	toUserID, ok := msg.Data["to_user_id"].(float64)
	if !ok {
		log.Printf("❌ [Call] Invalid to_user_id in call_initiate")
		return
	}

	recipientID := uint(toUserID)

	log.Printf("📞 [Call] User %d initiating call to user %d", client.userID, recipientID)

	// Check if caller is already in a call
	activeCallsMutex.RLock()
	if existingCallID, inCall := userCalls[client.userID]; inCall {
		activeCallsMutex.RUnlock()
		log.Printf("📞 [Call] User %d already in call %s", client.userID, existingCallID)
		return
	}

	// Check if recipient is already in a call
	if recipientCallID, inCall := userCalls[recipientID]; inCall {
		activeCallsMutex.RUnlock()
		log.Printf("📞 [Call] Recipient %d already in call %s", recipientID, recipientCallID)

		// Send busy message to caller
		sendCallMessage(client, "call_busy", map[string]interface{}{})
		return
	}
	activeCallsMutex.RUnlock()

	// Check if users are friends
	var friendship models.Friendship
	err := DB.Where(
		"((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)) AND status = ?",
		client.userID, recipientID, recipientID, client.userID, "accepted",
	).First(&friendship).Error
	
	if err != nil {
		log.Printf("❌ [Call] Users %d and %d are not friends", client.userID, recipientID)
		return
	}

	// Priority check: if both users initiate simultaneously, lower ID wins
	activeCallsMutex.Lock()
	
	// Check if recipient has pending outgoing call to caller
	if recipientCallID, exists := userCalls[recipientID]; exists {
		if call, ok := activeCalls[recipientCallID]; ok && call.RecipientID == client.userID && call.Status == "ringing" {
			// Simultaneous call detected
			if client.userID < recipientID {
				// Current caller has priority, cancel recipient's call
				log.Printf("📞 [Call] Priority conflict: User %d call has priority over user %d", client.userID, recipientID)
				
				// Cancel recipient's outgoing call
				delete(userCalls, recipientID)
				delete(activeCalls, recipientCallID)
				
				// Notify recipient their call was canceled
				sendCallMessageToUser(recipientID, "call_busy", map[string]interface{}{})
			} else {
				// Recipient's call has priority, decline current call
				log.Printf("📞 [Call] Priority conflict: User %d call has priority over user %d", recipientID, client.userID)
				activeCallsMutex.Unlock()
				
				sendCallMessage(client, "call_busy", map[string]interface{}{})
				return
			}
		}
	}

	// Create call state
	callID := fmt.Sprintf("call_%d_%d_%d", client.userID, recipientID, time.Now().Unix())
	callState := &CallState{
		CallID:      callID,
		CallerID:    client.userID,
		RecipientID: recipientID,
		Status:      "ringing",
		CreatedAt:   time.Now(),
	}

	activeCalls[callID] = callState
	userCalls[client.userID] = callID
	userCalls[recipientID] = callID

	activeCallsMutex.Unlock()

	log.Printf("📞 [Call] Created call %s: %d -> %d", callID, client.userID, recipientID)

	// Get caller info
	var caller models.User
	if err := DB.First(&caller, client.userID).Error; err != nil {
		log.Printf("❌ [Call] Failed to fetch caller info: %v", err)
		return
	}

	// Send incoming call to recipient
	sendCallMessageToUser(recipientID, "call_incoming", map[string]interface{}{
		"call_id":      callID,
		"from_user_id": client.userID,
		"from_user": map[string]interface{}{
			"id":         caller.ID,
			"username":   caller.Username,
			"avatar_url": caller.AvatarURL,
		},
	})

	// Set timeout for call (30 seconds)
	go func() {
		time.Sleep(30 * time.Second)

		activeCallsMutex.Lock()
		defer activeCallsMutex.Unlock()

		if call, exists := activeCalls[callID]; exists && call.Status == "ringing" {
			log.Printf("📞 [Call] Call %s timed out", callID)

			// Clean up
			delete(activeCalls, callID)
			delete(userCalls, client.userID)
			delete(userCalls, recipientID)

			// Notify caller of timeout (handled by frontend)
		}
	}()
}

func handleCallAccept(client *Client, msg WebSocketMessage) {
	toUserID, ok := msg.Data["to_user_id"].(float64)
	if !ok {
		log.Printf("❌ [Call] Invalid to_user_id in call_accept")
		return
	}

	callerID := uint(toUserID)

	activeCallsMutex.Lock()
	defer activeCallsMutex.Unlock()

	callID, exists := userCalls[client.userID]
	if !exists {
		log.Printf("❌ [Call] User %d not in any call", client.userID)
		return
	}

	call, ok := activeCalls[callID]
	if !ok || call.Status != "ringing" {
		log.Printf("❌ [Call] Invalid call state for %s", callID)
		return
	}

	log.Printf("📞 [Call] User %d accepted call %s", client.userID, callID)

	// Update call status
	call.Status = "active"

	// Create LiveKit room
	roomName := fmt.Sprintf("lobby_call_%d_%d_%d", call.CallerID, call.RecipientID, time.Now().Unix())
	call.RoomName = roomName

	// Generate LiveKit tokens
	callerToken, err := generateLiveKitToken(call.CallerID, roomName)
	if err != nil {
		log.Printf("❌ [Call] Failed to generate caller token: %v", err)
		return
	}

	recipientToken, err := generateLiveKitToken(call.RecipientID, roomName)
	if err != nil {
		log.Printf("❌ [Call] Failed to generate recipient token: %v", err)
		return
	}

	livekitURL := GetLiveKitURL()

	// Get recipient info for caller
	var recipient models.User
	if err := DB.First(&recipient, client.userID).Error; err != nil {
		log.Printf("❌ [Call] Failed to fetch recipient info: %v", err)
		return
	}

	// Get caller info for recipient
	var caller models.User
	if err := DB.First(&caller, callerID).Error; err != nil {
		log.Printf("❌ [Call] Failed to fetch caller info: %v", err)
		return
	}

	// Send call_accepted to both users
	sendCallMessageToUser(callerID, "call_accepted", map[string]interface{}{
		"call_id":      callID,
		"room_name":    roomName,
		"token":        callerToken,
		"livekit_url":  livekitURL,
		"other_user": map[string]interface{}{
			"id":         recipient.ID,
			"username":   recipient.Username,
			"avatar_url": recipient.AvatarURL,
		},
	})

	sendCallMessageToUser(client.userID, "call_accepted", map[string]interface{}{
		"call_id":      callID,
		"room_name":    roomName,
		"token":        recipientToken,
		"livekit_url":  livekitURL,
		"other_user": map[string]interface{}{
			"id":         caller.ID,
			"username":   caller.Username,
			"avatar_url": caller.AvatarURL,
		},
	})

	log.Printf("✅ [Call] Call %s active, LiveKit room: %s", callID, roomName)
}

func handleCallDecline(client *Client, msg WebSocketMessage) {
	toUserID, ok := msg.Data["to_user_id"].(float64)
	if !ok {
		log.Printf("❌ [Call] Invalid to_user_id in call_decline")
		return
	}

	callerID := uint(toUserID)

	activeCallsMutex.Lock()
	defer activeCallsMutex.Unlock()

	callID, exists := userCalls[client.userID]
	if !exists {
		log.Printf("❌ [Call] User %d not in any call", client.userID)
		return
	}

	call, ok := activeCalls[callID]
	if !ok {
		log.Printf("❌ [Call] Call %s not found", callID)
		return
	}

	log.Printf("📞 [Call] User %d declined call %s", client.userID, callID)

	// Clean up
	delete(activeCalls, callID)
	delete(userCalls, client.userID)
	delete(userCalls, callerID)

	// Notify caller
	sendCallMessageToUser(callerID, "call_declined", map[string]interface{}{
		"call_id": callID,
	})
}

func handleCallCancel(client *Client, msg WebSocketMessage) {
	toUserID, ok := msg.Data["to_user_id"].(float64)
	if !ok {
		log.Printf("❌ [Call] Invalid to_user_id in call_cancel")
		return
	}

	recipientID := uint(toUserID)

	activeCallsMutex.Lock()
	defer activeCallsMutex.Unlock()

	callID, exists := userCalls[client.userID]
	if !exists {
		log.Printf("❌ [Call] User %d not in any call to cancel", client.userID)
		return
	}

	call, ok := activeCalls[callID]
	if !ok {
		log.Printf("❌ [Call] Call %s not found", callID)
		return
	}

	log.Printf("📞 [Call] User %d canceled call %s", client.userID, callID)

	// Clean up
	delete(activeCalls, callID)
	delete(userCalls, client.userID)
	delete(userCalls, recipientID)

	// Notify recipient (if still connected)
	sendCallMessageToUser(recipientID, "call_ended", map[string]interface{}{
		"call_id": callID,
	})
}

func handleCallEnd(client *Client, msg WebSocketMessage) {
	activeCallsMutex.Lock()
	defer activeCallsMutex.Unlock()

	callID, exists := userCalls[client.userID]
	if !exists {
		log.Printf("❌ [Call] User %d not in any call to end", client.userID)
		return
	}

	call, ok := activeCalls[callID]
	if !ok {
		log.Printf("❌ [Call] Call %s not found", callID)
		return
	}

	log.Printf("📞 [Call] User %d ended call %s", client.userID, callID)

	// Determine other user
	otherUserID := call.CallerID
	if otherUserID == client.userID {
		otherUserID = call.RecipientID
	}

	// Clean up
	delete(activeCalls, callID)
	delete(userCalls, client.userID)
	delete(userCalls, otherUserID)

	// Notify other user
	sendCallMessageToUser(otherUserID, "call_ended", map[string]interface{}{
		"call_id": callID,
	})
}

// sendCallMessage sends a call message to a specific client
func sendCallMessage(client *Client, messageType string, data map[string]interface{}) {
	msg := WebSocketMessage{
		Type: messageType,
		Data: data,
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		log.Printf("❌ [Call] Failed to marshal message: %v", err)
		return
	}

	select {
	case client.send <- OutgoingMessage{Data: msgBytes, IsBinary: false}:
		log.Printf("📤 [Call] Sent %s to user %d", messageType, client.userID)
	default:
		log.Printf("❌ [Call] Failed to send %s to user %d (buffer full)", messageType, client.userID)
	}
}

// sendCallMessageToUser sends a call message to a user in the lobby
func sendCallMessageToUser(userID uint, messageType string, data map[string]interface{}) {
	msg := WebSocketMessage{
		Type: messageType,
		Data: data,
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		log.Printf("❌ [Call] Failed to marshal message: %v", err)
		return
	}

	// Send to user's lobby WebSocket (roomID = 0)
	hub.mutex.RLock()
	lobbyClients, exists := hub.rooms[0]
	hub.mutex.RUnlock()

	if !exists {
		log.Printf("❌ [Call] No lobby clients found")
		return
	}

	sent := false
	hub.mutex.RLock()
	for client := range lobbyClients {
		if client.userID == userID {
			select {
			case client.send <- OutgoingMessage{Data: msgBytes, IsBinary: false}:
				log.Printf("📤 [Call] Sent %s to user %d", messageType, userID)
				sent = true
			default:
				log.Printf("❌ [Call] Failed to send %s to user %d (buffer full)", messageType, userID)
			}
			break
		}
	}
	hub.mutex.RUnlock()

	if !sent {
		log.Printf("⚠️ [Call] User %d not found in lobby", userID)
	}
}

// generateLiveKitToken generates a LiveKit access token for a user
func generateLiveKitToken(userID uint, roomName string) (string, error) {
	// Fetch user info
	var user models.User
	if err := DB.First(&user, userID).Error; err != nil {
		return "", fmt.Errorf("failed to fetch user: %v", err)
	}

	apiKey := GetLiveKitAPIKey()
	apiSecret := GetLiveKitAPISecret()

	at := lksdk.NewAccessToken(apiKey, apiSecret)
	grant := &lksdk.VideoGrant{
		RoomJoin: true,
		Room:     roomName,
	}
	at.AddGrant(grant).
		SetIdentity(user.Username).
		SetName(user.Username).
		SetValidFor(24 * time.Hour).
		SetMetadata(fmt.Sprintf(`{"user_id":%d}`, userID))

	token, err := at.ToJWT()
	if err != nil {
		return "", fmt.Errorf("failed to generate token: %v", err)
	}

	return token, nil
}

// CleanupUserCalls removes a user from any active calls when they disconnect
func CleanupUserCalls(userID uint) {
	activeCallsMutex.Lock()
	defer activeCallsMutex.Unlock()

	callID, exists := userCalls[userID]
	if !exists {
		return
	}

	call, ok := activeCalls[callID]
	if !ok {
		delete(userCalls, userID)
		return
	}

	log.Printf("📞 [Call] Cleaning up user %d from call %s", userID, callID)

	// Determine other user
	otherUserID := call.CallerID
	if otherUserID == userID {
		otherUserID = call.RecipientID
	}

	// Clean up
	delete(activeCalls, callID)
	delete(userCalls, userID)
	delete(userCalls, otherUserID)

	// Notify other user
	sendCallMessageToUser(otherUserID, "call_ended", map[string]interface{}{
		"call_id": callID,
		"reason":  "disconnected",
	})
}
