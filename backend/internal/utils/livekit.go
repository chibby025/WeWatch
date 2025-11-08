// backend/internal/utils/livekit.go
package utils

import (
	"os"
	"time"

	"github.com/livekit/protocol/auth"
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
		CanPublish:      boolPtr(isHost),
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