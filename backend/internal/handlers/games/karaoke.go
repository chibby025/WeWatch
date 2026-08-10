package games

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

// Karaoke Night is deliberately the simplest game in this package: no
// scoring, no turns, no hidden state. The host picks a song (lyrics fetched
// client-side straight from LRCLIB — a free, fully CORS-open, no-key-needed
// API, confirmed directly and reused the same way TriviaGame.jsx already
// calls OpenTDB's public API client-side rather than through a backend
// proxy) and a YouTube video for the instrumental/karaoke-version audio, and
// the whole room sings along together with synced lyrics. There is nothing
// here worth hiding server-side (unlike Rebus Round's puzzle answers) — the
// backend's only job is relaying the host's choice to the room and letting
// the existing GameManager/late-join machinery handle broadcast + rehydration
// for free.
var karaokeVideoIDRe = regexp.MustCompile(`^[a-zA-Z0-9_-]{11}$`)

func (gm *GameManager) processKaraokeMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	hostID := gameState.GameSession.HostID

	switch moveType {
	case "karaoke_start":
		if playerID != hostID {
			return false, nil, fmt.Errorf("only the host can start a song")
		}
		trackName, _ := moveData["track_name"].(string)
		videoID, _ := moveData["video_id"].(string)
		if strings.TrimSpace(trackName) == "" {
			return false, nil, fmt.Errorf("missing song title")
		}
		// Defense-in-depth: the frontend already validates this shape via
		// extractYouTubeVideoId before ever sending the move, but a crafted
		// WS message could bypass that — never trust the client alone.
		if !karaokeVideoIDRe.MatchString(videoID) {
			return false, nil, fmt.Errorf("invalid or missing YouTube video")
		}
		artistName, _ := moveData["artist_name"].(string)
		syncedLyrics, _ := moveData["synced_lyrics"].(string)
		plainLyrics, _ := moveData["plain_lyrics"].(string)

		gameState.GameData["phase"] = "playing"
		gameState.GameData["track_name"] = trackName
		gameState.GameData["artist_name"] = artistName
		gameState.GameData["video_id"] = videoID
		gameState.GameData["synced_lyrics"] = syncedLyrics
		gameState.GameData["plain_lyrics"] = plainLyrics
		gameState.GameData["started_at"] = float64(time.Now().UnixMilli())
		gameState.GameData["song_number"] = karaokeFloatField(gameState.GameData, "song_number") + 1
		return false, nil, nil

	case "karaoke_end":
		// Host-only, mirrors every other game's end-for-everyone convention —
		// but there's genuinely no winner concept here, so winnerID always
		// stays nil. The frontend's game-over branch treats this as "session
		// wrapped up," not a draw.
		if playerID != hostID {
			return false, nil, fmt.Errorf("only the host can end the session")
		}
		gameState.GameData["phase"] = "ended"
		return true, nil, nil

	default:
		return false, nil, fmt.Errorf("unknown karaoke move type: %s", moveType)
	}
}

func karaokeFloatField(m map[string]interface{}, key string) float64 {
	if f, ok := m[key].(float64); ok {
		return f
	}
	return 0
}
