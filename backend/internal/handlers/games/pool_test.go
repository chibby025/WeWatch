package games

import (
	"testing"
	"wewatch-backend/internal/models"
)

func makeTestPoolState(numPlayers int) *GameSessionState {
	players := make([]models.Player, numPlayers)
	for i := range players {
		players[i] = models.Player{UserID: uint(i + 1)}
	}
	return &GameSessionState{
		Players:     players,
		CurrentTurn: 0,
		GameData:    map[string]interface{}{},
		GameSession: &models.GameSession{GameType: "pool"},
	}
}

func baseShotMove() map[string]interface{} {
	return map[string]interface{}{
		"pocketed":       []interface{}{},
		"cue_scratched":  false,
		"cue_x":          0.5,
		"cue_y":          0.5,
		"first_contact":  float64(1),
		"ball_positions": map[string]interface{}{},
	}
}

// TestPoolBallPositionsStored is the regression test for the cross-client
// desync bug: previously only pocketed IDs and the cue ball position were
// ever synced, so every other ball silently kept whatever position it was at
// on each individual client. This confirms the shooter's reported resting
// positions for every other ball actually land in GameData for broadcast.
func TestPoolBallPositionsStored(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	move := baseShotMove()
	move["ball_positions"] = map[string]interface{}{
		"1": map[string]interface{}{"x": 0.6, "y": 0.3},
		"9": map[string]interface{}{"x": 0.7, "y": 0.42},
	}

	if _, _, err := gm.processPoolMove(gs, gs.Players[0].UserID, "shot", move); err != nil {
		t.Fatalf("shot: %v", err)
	}

	stored, ok := gs.GameData["ball_positions"].(map[string]interface{})
	if !ok {
		t.Fatal("expected ball_positions to be a map after a shot")
	}
	p1, ok := stored["1"].(map[string]interface{})
	if !ok || p1["x"] != 0.6 || p1["y"] != 0.3 {
		t.Errorf("expected ball 1 at (0.6, 0.3), got %v", stored["1"])
	}
	p9, ok := stored["9"].(map[string]interface{})
	if !ok || p9["x"] != 0.7 || p9["y"] != 0.42 {
		t.Errorf("expected ball 9 at (0.7, 0.42), got %v", stored["9"])
	}
}

func TestPoolBallPositionsClampedToTableBounds(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	move := baseShotMove()
	move["ball_positions"] = map[string]interface{}{
		"2": map[string]interface{}{"x": 1.8, "y": -0.4},
	}

	if _, _, err := gm.processPoolMove(gs, gs.Players[0].UserID, "shot", move); err != nil {
		t.Fatalf("shot: %v", err)
	}

	stored := gs.GameData["ball_positions"].(map[string]interface{})
	p2 := stored["2"].(map[string]interface{})
	if p2["x"] != 1.0 {
		t.Errorf("expected x clamped to 1.0, got %v", p2["x"])
	}
	if p2["y"] != 0.0 {
		t.Errorf("expected y clamped to 0.0, got %v", p2["y"])
	}
}

// TestPoolBallPositionsSkipsMalformedEntries confirms a malformed single
// entry (missing a coordinate, or not a map at all) never fails or drops the
// whole shot — the rest of the report is still applied. A misbehaving or
// out-of-date client shouldn't be able to break the game for everyone else.
func TestPoolBallPositionsSkipsMalformedEntries(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	move := baseShotMove()
	move["ball_positions"] = map[string]interface{}{
		"3": map[string]interface{}{"x": 0.4, "y": 0.5},
		"4": map[string]interface{}{"x": 0.4}, // missing y
		"5": "not a map at all",
	}

	if _, _, err := gm.processPoolMove(gs, gs.Players[0].UserID, "shot", move); err != nil {
		t.Fatalf("shot: %v", err)
	}

	stored := gs.GameData["ball_positions"].(map[string]interface{})
	if _, ok := stored["3"]; !ok {
		t.Error("expected the well-formed entry for ball 3 to still be stored")
	}
	if _, ok := stored["4"]; ok {
		t.Error("expected the malformed entry (missing y) for ball 4 to be skipped")
	}
	if _, ok := stored["5"]; ok {
		t.Error("expected the non-map entry for ball 5 to be skipped")
	}
}

// TestPoolLazyInitDefaultsToEmptyBallPositions confirms a freshly-initialized
// game (before ball_positions was added) doesn't panic on a type assertion
// anywhere reading GameData["ball_positions"] before the first shot report.
func TestPoolLazyInitDefaultsToEmptyBallPositions(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	move := baseShotMove() // reports no ball positions at all — e.g. every ball pocketed on the break somehow

	if _, _, err := gm.processPoolMove(gs, gs.Players[0].UserID, "shot", move); err != nil {
		t.Fatalf("shot: %v", err)
	}

	stored, ok := gs.GameData["ball_positions"].(map[string]interface{})
	if !ok {
		t.Fatal("expected ball_positions to still be a map even when the report is empty")
	}
	if len(stored) != 0 {
		t.Errorf("expected an empty map, got %v", stored)
	}
}

// TestPoolBallPositionsCarryAcrossShots confirms a second shot's report
// (e.g. after a different player's turn) correctly replaces the whole
// snapshot rather than merging with the previous one — every still-active
// ball's position must be re-reported every shot, since the server has no
// physics of its own to reconcile a partial update against.
func TestPoolBallPositionsCarryAcrossShots(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}

	first := baseShotMove()
	first["ball_positions"] = map[string]interface{}{
		"1": map[string]interface{}{"x": 0.3, "y": 0.3},
	}
	if _, _, err := gm.processPoolMove(gs, gs.Players[0].UserID, "shot", first); err != nil {
		t.Fatalf("first shot: %v", err)
	}
	// Foul, so it's still player 0's opponent's turn next — but for this test
	// we only care that the second report fully replaces the first snapshot.
	second := baseShotMove()
	second["ball_positions"] = map[string]interface{}{
		"2": map[string]interface{}{"x": 0.8, "y": 0.1},
	}
	gs.CurrentTurn = 0 // keep it simple: same player reports again
	if _, _, err := gm.processPoolMove(gs, gs.Players[0].UserID, "shot", second); err != nil {
		t.Fatalf("second shot: %v", err)
	}

	stored := gs.GameData["ball_positions"].(map[string]interface{})
	if _, ok := stored["1"]; ok {
		t.Error("expected ball 1's stale position from the first shot to be gone after the second report")
	}
	if _, ok := stored["2"]; !ok {
		t.Error("expected ball 2's position from the second report to be present")
	}
}
