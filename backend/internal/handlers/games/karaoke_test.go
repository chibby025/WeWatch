package games

import (
	"testing"
	"wewatch-backend/internal/models"
)

const karaokeTestHostID = uint(1)

func makeTestKaraokeState(numPlayers int) *GameSessionState {
	players := make([]models.Player, numPlayers)
	for i := range players {
		players[i] = models.Player{UserID: uint(i + 1)}
	}
	return &GameSessionState{
		Players:     players,
		CurrentTurn: 0,
		GameData:    map[string]interface{}{"phase": "waiting"},
		GameSession: &models.GameSession{GameType: "karaoke", HostID: karaokeTestHostID},
	}
}

func TestKaraokeStartOnlyHost(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestKaraokeState(2)
	moveData := map[string]interface{}{"track_name": "Test Song", "video_id": "dQw4w9WgXcQ"}
	if _, _, err := gm.processKaraokeMove(gs, 2, "karaoke_start", moveData); err == nil {
		t.Fatal("expected non-host karaoke_start to be rejected")
	}
}

func TestKaraokeStartSetsState(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestKaraokeState(2)
	moveData := map[string]interface{}{
		"track_name":    "Bohemian Rhapsody",
		"artist_name":   "Queen",
		"video_id":      "dQw4w9WgXcQ",
		"synced_lyrics": "[00:00.15] Is this the real life?",
		"plain_lyrics":  "Is this the real life?",
	}
	gameOver, winnerID, err := gm.processKaraokeMove(gs, karaokeTestHostID, "karaoke_start", moveData)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatal("karaoke_start should never end the game or declare a winner")
	}
	if gs.GameData["phase"] != "playing" {
		t.Fatalf("expected phase=playing, got %v", gs.GameData["phase"])
	}
	if gs.GameData["track_name"] != "Bohemian Rhapsody" {
		t.Fatalf("expected track_name to be set, got %v", gs.GameData["track_name"])
	}
	if gs.GameData["video_id"] != "dQw4w9WgXcQ" {
		t.Fatalf("expected video_id to be set, got %v", gs.GameData["video_id"])
	}
	if gs.GameData["song_number"] != float64(1) {
		t.Fatalf("expected song_number=1 on first song, got %v", gs.GameData["song_number"])
	}
}

func TestKaraokeStartRejectsMissingTitle(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestKaraokeState(1)
	moveData := map[string]interface{}{"track_name": "  ", "video_id": "dQw4w9WgXcQ"}
	if _, _, err := gm.processKaraokeMove(gs, karaokeTestHostID, "karaoke_start", moveData); err == nil {
		t.Fatal("expected an empty/whitespace-only track_name to be rejected")
	}
}

func TestKaraokeStartRejectsInvalidVideoID(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestKaraokeState(1)
	cases := []string{"", "short", "waytoolongforavalidid", "has spaces!!"}
	for _, badID := range cases {
		moveData := map[string]interface{}{"track_name": "Some Song", "video_id": badID}
		if _, _, err := gm.processKaraokeMove(gs, karaokeTestHostID, "karaoke_start", moveData); err == nil {
			t.Errorf("expected video_id %q to be rejected as invalid", badID)
		}
	}
}

func TestKaraokeSecondSongIncrementsSongNumber(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestKaraokeState(1)
	first := map[string]interface{}{"track_name": "First Song", "video_id": "dQw4w9WgXcQ"}
	second := map[string]interface{}{"track_name": "Second Song", "video_id": "abcdefghijk"}
	if _, _, err := gm.processKaraokeMove(gs, karaokeTestHostID, "karaoke_start", first); err != nil {
		t.Fatalf("unexpected error on first song: %v", err)
	}
	if _, _, err := gm.processKaraokeMove(gs, karaokeTestHostID, "karaoke_start", second); err != nil {
		t.Fatalf("unexpected error on second song: %v", err)
	}
	if gs.GameData["song_number"] != float64(2) {
		t.Fatalf("expected song_number=2 after a second song, got %v", gs.GameData["song_number"])
	}
	if gs.GameData["track_name"] != "Second Song" {
		t.Fatalf("expected track_name to reflect the newest song, got %v", gs.GameData["track_name"])
	}
}

func TestKaraokeEndOnlyHost(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestKaraokeState(2)
	if _, _, err := gm.processKaraokeMove(gs, 2, "karaoke_end", nil); err == nil {
		t.Fatal("expected non-host karaoke_end to be rejected")
	}
}

func TestKaraokeEndHasNoWinner(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestKaraokeState(3)
	gameOver, winnerID, err := gm.processKaraokeMove(gs, karaokeTestHostID, "karaoke_end", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !gameOver {
		t.Fatal("expected karaoke_end to report gameOver=true")
	}
	if winnerID != nil {
		t.Fatalf("karaoke is non-competitive — expected a nil winnerID, got %v", *winnerID)
	}
	if gs.GameData["phase"] != "ended" {
		t.Fatalf("expected phase=ended, got %v", gs.GameData["phase"])
	}
}

func TestKaraokeSyncOnlyHost(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestKaraokeState(2)
	moveData := map[string]interface{}{"command": "play", "seek_time": float64(10), "timestamp": float64(1000)}
	if _, _, err := gm.processKaraokeMove(gs, 2, "karaoke_sync", moveData); err == nil {
		t.Fatal("expected non-host karaoke_sync to be rejected")
	}
}

func TestKaraokeSyncSetsPlaybackState(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestKaraokeState(2)
	moveData := map[string]interface{}{"command": "play", "seek_time": float64(42.5), "timestamp": float64(1700000000000)}
	gameOver, winnerID, err := gm.processKaraokeMove(gs, karaokeTestHostID, "karaoke_sync", moveData)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatal("karaoke_sync should never end the game or declare a winner")
	}
	if gs.GameData["playback_command"] != "play" {
		t.Fatalf("expected playback_command=play, got %v", gs.GameData["playback_command"])
	}
	if gs.GameData["playback_seek_time"] != 42.5 {
		t.Fatalf("expected playback_seek_time=42.5, got %v", gs.GameData["playback_seek_time"])
	}
	if gs.GameData["playback_timestamp"] != float64(1700000000000) {
		t.Fatalf("expected playback_timestamp to be set, got %v", gs.GameData["playback_timestamp"])
	}
}

func TestKaraokeSyncRejectsInvalidCommand(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestKaraokeState(1)
	moveData := map[string]interface{}{"command": "rewind", "seek_time": float64(0), "timestamp": float64(0)}
	if _, _, err := gm.processKaraokeMove(gs, karaokeTestHostID, "karaoke_sync", moveData); err == nil {
		t.Fatal("expected an invalid playback command to be rejected")
	}
}

func TestKaraokeSyncAcceptsPauseAndSeek(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestKaraokeState(1)
	for _, cmd := range []string{"pause", "seek"} {
		moveData := map[string]interface{}{"command": cmd, "seek_time": float64(5), "timestamp": float64(1000)}
		if _, _, err := gm.processKaraokeMove(gs, karaokeTestHostID, "karaoke_sync", moveData); err != nil {
			t.Fatalf("expected command %q to be accepted, got error: %v", cmd, err)
		}
		if gs.GameData["playback_command"] != cmd {
			t.Fatalf("expected playback_command=%s, got %v", cmd, gs.GameData["playback_command"])
		}
	}
}

func TestKaraokeStartResetsPlaybackStateForNewSong(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestKaraokeState(1)
	first := map[string]interface{}{"track_name": "First Song", "video_id": "dQw4w9WgXcQ"}
	if _, _, err := gm.processKaraokeMove(gs, karaokeTestHostID, "karaoke_start", first); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Simulate the host playing partway through the first song.
	sync := map[string]interface{}{"command": "play", "seek_time": float64(90), "timestamp": float64(1000)}
	if _, _, err := gm.processKaraokeMove(gs, karaokeTestHostID, "karaoke_sync", sync); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Starting a second song must clear that stale position — a late-joining
	// member rehydrating game_state right after this must never seek 90s into
	// the brand-new video.
	second := map[string]interface{}{"track_name": "Second Song", "video_id": "abcdefghijk"}
	if _, _, err := gm.processKaraokeMove(gs, karaokeTestHostID, "karaoke_start", second); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gs.GameData["playback_command"] != "" {
		t.Fatalf("expected playback_command to be cleared on a new song, got %v", gs.GameData["playback_command"])
	}
	if gs.GameData["playback_seek_time"] != float64(0) {
		t.Fatalf("expected playback_seek_time to be reset to 0, got %v", gs.GameData["playback_seek_time"])
	}
}

func TestKaraokeUnknownMoveType(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestKaraokeState(1)
	if _, _, err := gm.processKaraokeMove(gs, karaokeTestHostID, "bogus_move", nil); err == nil {
		t.Fatal("expected an unknown move type to be rejected")
	}
}
