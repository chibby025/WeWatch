// backend/internal/utils/livekit.go
package utils

import (
	"log"
	"os"
	"time"

	"github.com/livekit/protocol/auth"
	// lksdk "github.com/livekit/server-sdk-go" // Temporarily disabled due to version conflict
)

// Helper to create *bool from bool
func boolPtr(b bool) *bool {
	return &b
}

// GenerateLiveKitToken generates a LiveKit access token for a user in a room
func GenerateLiveKitToken(roomName string, identity string, isHost bool) (string, error) {
	apiKey := os.Getenv("LIVEKIT_API_KEY")
	apiSecret := os.Getenv("LIVEKIT_API_SECRET")

	if apiKey == "" || apiSecret == "" {
		return "", ErrMissingLiveKitConfig
	}

	grant := &auth.VideoGrant{
		Room:            roomName,
		RoomJoin:        true,
		CanPublish:      boolPtr(true), // ✅ Everyone can publish audio/video
		CanSubscribe:    boolPtr(true),
		CanPublishData:  boolPtr(true),
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