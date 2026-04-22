// backend/internal/utils/livekit.go
package utils

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/livekit/protocol/auth"
	// lksdk "github.com/livekit/server-sdk-go" // Temporarily disabled due to version conflict
)

// Helper to create *bool from bool
func boolPtr(b bool) *bool {
	return &b
}

// GetLiveKitURL returns the appropriate LiveKit URL based on the request environment
// For localhost requests, returns localhost URL; for production, returns env variable URL
func GetLiveKitURL(r *http.Request) string {
	// Check request origin and host headers
	origin := r.Header.Get("Origin")
	host := r.Host
	referer := r.Header.Get("Referer")
	
	// Determine if request is from localhost environment
	isLocalhost := strings.Contains(origin, "localhost") || 
		strings.Contains(host, "localhost") || 
		strings.Contains(referer, "localhost") ||
		strings.Contains(origin, "127.0.0.1") || 
		strings.Contains(host, "127.0.0.1") || 
		strings.Contains(referer, "127.0.0.1")
	
	if isLocalhost {
		// Return localhost LiveKit URL for local development
		log.Printf("🏠 [LiveKit] Localhost environment detected, using http://localhost:7880")
		return "http://localhost:7880"
	}
	
	// Return production LiveKit URL from environment variable
	livekitURL := os.Getenv("LIVEKIT_URL")
	if livekitURL == "" {
		// Fallback to WSL IP if no env variable set (safety - for local dev)
		log.Printf("⚠️ [LiveKit] No LIVEKIT_URL env variable, defaulting to WSL IP")
		return "http://172.24.217.44:7880"
	}
	
	log.Printf("🌐 [LiveKit] Production environment detected, using %s", livekitURL)
	return livekitURL
}

// GenerateLiveKitToken generates a LiveKit access token for a user in a room
func GenerateLiveKitToken(roomName string, identity string, isHost bool) (string, error) {
	apiKey := os.Getenv("LIVEKIT_API_KEY")
	apiSecret := os.Getenv("LIVEKIT_API_SECRET")

	if apiKey == "" || apiSecret == "" {
		return "", ErrMissingLiveKitConfig
	}

	grant := &auth.VideoGrant{
		Room:         roomName,
		RoomJoin:     true,
		CanPublish:   boolPtr(true),      // ✅ Everyone can publish audio/video/screen
		CanSubscribe: boolPtr(true),      // ✅ Everyone can subscribe to tracks
		CanPublishData: boolPtr(true),    // ✅ Can send data messages
		// ✅ CRITICAL: Grant screen share permissions explicitly
		CanPublishSources: []string{"camera", "microphone", "screen_share", "screen_share_audio"},
	}

	at := auth.NewAccessToken(apiKey, apiSecret).
		AddGrant(grant).
		SetIdentity(identity).
		SetValidFor(24 * time.Hour)

	token, err := at.ToJWT()
	return token, err
}

// DeleteLiveKitRoom deletes a LiveKit room and disconnects all participants
// TODO: Re-enable when LiveKit SDK version conflict is resolved
// Current issue: github.com/livekit/server-sdk-go v1.1.8 has SIP method conflicts
func DeleteLiveKitRoom(roomName string) error {
	// Temporarily disabled - LiveKit rooms will expire naturally after inactivity
	log.Printf("⚠️ DeleteLiveKitRoom: Feature temporarily disabled due to SDK version conflict")
	log.Printf("   Room '%s' will be cleaned up by LiveKit server after participants disconnect", roomName)
	
	// Return nil to not block session ending
	// The LiveKit server will clean up empty rooms automatically
	return nil
	
	/* 
	// Original implementation - to be restored after SDK update:
	apiKey := os.Getenv("LIVEKIT_API_KEY")
	apiSecret := os.Getenv("LIVEKIT_API_SECRET")
	livekitURL := os.Getenv("LIVEKIT_URL")

	if apiKey == "" || apiSecret == "" || livekitURL == "" {
		log.Printf("⚠️ DeleteLiveKitRoom: Missing LiveKit config, skipping room deletion for %s", roomName)
		return ErrMissingLiveKitConfig
	}

	// Create LiveKit room client
	roomClient := lksdk.NewRoomServiceClient(livekitURL, apiKey, apiSecret)

	// Delete the room (this will disconnect all participants)
	_, err := roomClient.DeleteRoom(roomName)
	if err != nil {
		log.Printf("⚠️ DeleteLiveKitRoom: Failed to delete room %s: %v", roomName, err)
		return fmt.Errorf("failed to delete LiveKit room: %w", err)
	}

	log.Printf("✅ DeleteLiveKitRoom: Successfully deleted LiveKit room %s", roomName)
	return nil
	*/
}

// IsHostActiveInLiveKit checks if a user is currently connected to a LiveKit room
// Returns true if the user has an active connection (publishing or subscribed)
func IsHostActiveInLiveKit(roomName string, userIdentity string) bool {
	apiKey := os.Getenv("LIVEKIT_API_KEY")
	apiSecret := os.Getenv("LIVEKIT_API_SECRET")
	livekitURL := os.Getenv("LIVEKIT_URL")

	if apiKey == "" || apiSecret == "" || livekitURL == "" {
		log.Printf("⚠️ IsHostActiveInLiveKit: Missing LiveKit config")
		return false
	}

	// Create a token to authenticate API requests
	at := auth.NewAccessToken(apiKey, apiSecret).
		SetValidFor(5 * time.Minute)
	
	token, err := at.ToJWT()
	if err != nil {
		log.Printf("⚠️ IsHostActiveInLiveKit: Failed to create auth token: %v", err)
		return false
	}

	// Make HTTP request to LiveKit API to list participants
	// Format: POST /twirp/livekit.RoomService/ListParticipants
	requestBody := fmt.Sprintf(`{"room":"%s"}`, roomName)
	req, err := http.NewRequest("POST", livekitURL+"/twirp/livekit.RoomService/ListParticipants", 
		strings.NewReader(requestBody))
	if err != nil {
		log.Printf("⚠️ IsHostActiveInLiveKit: Failed to create request: %v", err)
		return false
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("⚠️ IsHostActiveInLiveKit: HTTP request failed: %v", err)
		return false
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("⚠️ IsHostActiveInLiveKit: API returned status %d: %s", resp.StatusCode, string(body))
		return false
	}

	// Parse response
	var result struct {
		Participants []struct {
			Identity string `json:"identity"`
			State    string `json:"state"`
		} `json:"participants"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		log.Printf("⚠️ IsHostActiveInLiveKit: Failed to parse response: %v", err)
		return false
	}

	// Check if user is in the participants list and is active
	for _, p := range result.Participants {
		if p.Identity == userIdentity && p.State == "ACTIVE" {
			log.Printf("✅ IsHostActiveInLiveKit: User %s is ACTIVE in room %s", userIdentity, roomName)
			return true
		}
	}

	log.Printf("❌ IsHostActiveInLiveKit: User %s NOT found or not active in room %s", userIdentity, roomName)
	return false
}

// Custom error
var ErrMissingLiveKitConfig = NewError("LIVEKIT_API_KEY or LIVEKIT_API_SECRET missing in .env")

type appError struct {
	msg string
}

func (e *appError) Error() string {
	return e.msg
}

func NewError(msg string) error {
	return &appError{msg: msg}
}