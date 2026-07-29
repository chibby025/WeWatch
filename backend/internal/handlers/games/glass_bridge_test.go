package games

import (
	"testing"
	"wewatch-backend/internal/models"
)

// TestGlassBridgeSlotScaling: 10 slots for 2 players, +3 per player beyond
// that, clamped to [10, 22] so a large group doesn't get an unreasonably long
// bridge.
func TestGlassBridgeSlotScaling(t *testing.T) {
	cases := []struct {
		players int
		want    int
	}{
		{1, 10}, // below floor, clamped up
		{2, 10},
		{3, 13},
		{4, 16},
		{5, 19},
		{6, 22},
		{7, 22}, // above ceiling, clamped down
		{8, 22},
	}
	for _, c := range cases {
		state := glassBridgeInitialState(c.players)
		got := gbInt(state["slots"])
		if got != c.want {
			t.Errorf("%d players: expected %d slots, got %d", c.players, c.want, got)
		}
	}
}

func makeTestGlassBridgeState(numPlayers int) *GameSessionState {
	players := make([]models.Player, numPlayers)
	for i := range players {
		players[i] = models.Player{UserID: uint(i + 1)}
	}
	return &GameSessionState{
		Players:     players,
		CurrentTurn: 0,
		GameData:    map[string]interface{}{},
		GameSession: &models.GameSession{GameType: "glass_bridge"},
	}
}

// forceSolution overwrites the hidden solution for a slot after lazy-init,
// so a test can deterministically pick "correct" or "wrong" for player 1.
func forceSolution(gs *GameSessionState, slot int, side string) {
	ensureGlassBridgeState(gs)
	sol := gbStringSlice(gs.GameData["solutions"])
	sol[slot] = side
	gs.GameData["solutions"] = sol
}

// TestGlassBridgeAdvance: correct step increments move_seq and records
// last_result="advanced" with the actual actor/slot/side — this is the exact
// data the frontend uses to trigger the "walking" sprite animation for
// EVERY connected client, not just the mover.
func TestGlassBridgeAdvance(t *testing.T) {
	gs := makeTestGlassBridgeState(2)
	gm := &GameManager{}
	forceSolution(gs, 0, "left")

	gameOver, winnerID, err := gm.processGlassBridgeMove(gs, 1, map[string]interface{}{"side": "left"})
	if err != nil {
		t.Fatalf("move failed: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Errorf("game should not be over after one correct step")
	}
	if seq := gbInt(gs.GameData["move_seq"]); seq != 1 {
		t.Errorf("move_seq should be 1, got %d", seq)
	}
	if actor, _ := gs.GameData["last_actor_id"].(uint); actor != 1 {
		t.Errorf("last_actor_id should be 1, got %v", gs.GameData["last_actor_id"])
	}
	if result, _ := gs.GameData["last_result"].(string); result != "advanced" {
		t.Errorf("last_result should be 'advanced', got %q", result)
	}
	if slot := gbInt(gs.GameData["last_slot"]); slot != 0 {
		t.Errorf("last_slot should be 0, got %d", slot)
	}
	if side, _ := gs.GameData["last_side"].(string); side != "left" {
		t.Errorf("last_side should be 'left', got %q", side)
	}
	pos := gbPositions(gs.GameData)
	if p := gbInt(pos["1"]); p != 0 {
		t.Errorf("player should be at slot 0, got %d", p)
	}
	// The real ProcessMove wrapper unconditionally advances CurrentTurn+1 after
	// every non-gameOver move (glass_bridge is not in selfManagedTurn) — the -1
	// inside processGlassBridgeMove exists specifically to cancel that out on a
	// correct step. Simulate the wrapper's own advance here, since this test
	// calls processGlassBridgeMove directly and bypasses it.
	gs.CurrentTurn = (gs.CurrentTurn + 1) % len(gs.Players)
	if gs.CurrentTurn != 0 {
		t.Errorf("turn should not have advanced past player 1, got %d", gs.CurrentTurn)
	}
}

// TestGlassBridgeFall: wrong step records last_result="fell" with the
// attempted slot/side BEFORE the reset, and resets the player's position —
// the frontend needs both pieces to show "stepped here, then fell back."
func TestGlassBridgeFall(t *testing.T) {
	gs := makeTestGlassBridgeState(2)
	gm := &GameManager{}
	forceSolution(gs, 0, "left")

	gameOver, winnerID, err := gm.processGlassBridgeMove(gs, 1, map[string]interface{}{"side": "right"})
	if err != nil {
		t.Fatalf("move failed: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Errorf("game should not be over after a fall")
	}
	if result, _ := gs.GameData["last_result"].(string); result != "fell" {
		t.Errorf("last_result should be 'fell', got %q", result)
	}
	if slot := gbInt(gs.GameData["last_slot"]); slot != 0 {
		t.Errorf("last_slot should record the attempted slot (0), got %d", slot)
	}
	if side, _ := gs.GameData["last_side"].(string); side != "right" {
		t.Errorf("last_side should record the attempted side ('right'), got %q", side)
	}
	pos := gbPositions(gs.GameData)
	if p := gbInt(pos["1"]); p != -1 {
		t.Errorf("player should be reset to start (-1), got %d", p)
	}
	attempts := gbAttempts(gs.GameData)
	if a := gbInt(attempts["1"]); a != 1 {
		t.Errorf("attempts should be 1, got %d", a)
	}
	// Turn passes to the next player on a fall — simulate the ProcessMove
	// wrapper's own advance (see the comment in TestGlassBridgeAdvance).
	gs.CurrentTurn = (gs.CurrentTurn + 1) % len(gs.Players)
	if gs.CurrentTurn != 1 {
		t.Errorf("turn should have advanced to player 2, got %d", gs.CurrentTurn)
	}
}

// TestGlassBridgeCross: the final correct step across the last slot ends the
// game and reports last_result="crossed" (distinct from a mid-bridge advance)
// so the frontend fires the "crossed the bridge" banner instead of a plain walk.
func TestGlassBridgeCross(t *testing.T) {
	gs := makeTestGlassBridgeState(2)
	gm := &GameManager{}
	ensureGlassBridgeState(gs)
	// Put player 1 one step away from the final slot (slots=10 → last index 9).
	pos := gbPositions(gs.GameData)
	pos["1"] = 8
	gs.GameData["positions"] = pos
	forceSolution(gs, 9, "left")

	gameOver, winnerID, err := gm.processGlassBridgeMove(gs, 1, map[string]interface{}{"side": "left"})
	if err != nil {
		t.Fatalf("move failed: %v", err)
	}
	if !gameOver {
		t.Error("game should be over after crossing the final slot")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Errorf("winner should be player 1, got %v", winnerID)
	}
	if result, _ := gs.GameData["last_result"].(string); result != "crossed" {
		t.Errorf("last_result should be 'crossed', got %q", result)
	}
	if phase, _ := gs.GameData["phase"].(string); phase != "ended" {
		t.Errorf("phase should be 'ended', got %q", phase)
	}
}

// TestGlassBridgeFrontierPosition: frontier_position tracks the furthest ANY
// player has ever successfully reached — it must survive a later fall by a
// different player (never decrease) and must not move on a fall at all.
func TestGlassBridgeFrontierPosition(t *testing.T) {
	gs := makeTestGlassBridgeState(2)
	gm := &GameManager{}

	forceSolution(gs, 0, "left")
	if _, _, err := gm.processGlassBridgeMove(gs, 1, map[string]interface{}{"side": "left"}); err != nil { // advance to 0
		t.Fatalf("move 1 failed: %v", err)
	}
	if f := gbInt(gs.GameData["frontier_position"]); f != 0 {
		t.Errorf("frontier_position should be 0 after reaching slot 0, got %d", f)
	}

	forceSolution(gs, 1, "left")
	if _, _, err := gm.processGlassBridgeMove(gs, 1, map[string]interface{}{"side": "left"}); err != nil { // advance to 1
		t.Fatalf("move 2 failed: %v", err)
	}
	if f := gbInt(gs.GameData["frontier_position"]); f != 1 {
		t.Errorf("frontier_position should be 1 after reaching slot 1, got %d", f)
	}

	// Player 1 now falls on slot 2 — frontier must NOT move backward.
	forceSolution(gs, 2, "left")
	if _, _, err := gm.processGlassBridgeMove(gs, 1, map[string]interface{}{"side": "right"}); err != nil { // fall
		t.Fatalf("move 3 failed: %v", err)
	}
	if f := gbInt(gs.GameData["frontier_position"]); f != 1 {
		t.Errorf("frontier_position should still be 1 after a fall, got %d", f)
	}
	pos := gbPositions(gs.GameData)
	if p := gbInt(pos["1"]); p != -1 {
		t.Errorf("player 1 should be back at start, got %d", p)
	}

	// Player 2 (still at start) only reaches slot 0 — below player 1's earlier
	// peak of 1 — so frontier_position must stay at 1, not drop to 0.
	if _, _, err := gm.processGlassBridgeMove(gs, 2, map[string]interface{}{"side": "left"}); err != nil { // player2 -> slot0
		t.Fatalf("move 4 failed: %v", err)
	}
	if f := gbInt(gs.GameData["frontier_position"]); f != 1 {
		t.Errorf("frontier_position should still be 1 (player 2 only reached slot 0), got %d", f)
	}
}

// TestGlassBridgeMoveSeqMonotonic: move_seq must strictly increase across
// consecutive moves, including a fall immediately followed by another
// player's move — this is what lets the frontend edge-detect two events in a
// row instead of missing the second one because a boolean flag got reused.
func TestGlassBridgeMoveSeqMonotonic(t *testing.T) {
	gs := makeTestGlassBridgeState(2)
	gm := &GameManager{}
	forceSolution(gs, 0, "left")

	if _, _, err := gm.processGlassBridgeMove(gs, 1, map[string]interface{}{"side": "right"}); err != nil { // fall
		t.Fatalf("move 1 failed: %v", err)
	}
	seq1 := gbInt(gs.GameData["move_seq"])

	forceSolution(gs, 0, "right")
	if _, _, err := gm.processGlassBridgeMove(gs, 2, map[string]interface{}{"side": "right"}); err != nil { // advance
		t.Fatalf("move 2 failed: %v", err)
	}
	seq2 := gbInt(gs.GameData["move_seq"])

	if seq1 != 1 {
		t.Errorf("expected move_seq=1 after first move, got %d", seq1)
	}
	if seq2 != 2 {
		t.Errorf("expected move_seq=2 after second move, got %d", seq2)
	}
	if actor, _ := gs.GameData["last_actor_id"].(uint); actor != 2 {
		t.Errorf("last_actor_id should now be player 2, got %v", gs.GameData["last_actor_id"])
	}
}
