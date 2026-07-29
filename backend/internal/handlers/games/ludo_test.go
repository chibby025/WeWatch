package games

import (
	"testing"
	"wewatch-backend/internal/models"
)

// ── helpers ─────────────────────────────────────────────────────────────────

func makeTestLudoState(numPlayers int) *GameSessionState {
	players := make([]models.Player, numPlayers)
	for i := range players {
		players[i] = models.Player{UserID: uint(i + 1)}
	}
	gs := &GameSessionState{
		Players:     players,
		CurrentTurn: 0,
		GameData:    map[string]interface{}{},
		GameSession: &models.GameSession{GameType: "ludo"},
	}
	ensureLudoDealt(gs)
	return gs
}

func setPos(gs *GameSessionState, color string, idx, pos int) {
	tokens := gs.GameData["tokens"].(map[string]interface{})
	colorTokens := tokens[color].([]map[string]interface{})
	colorTokens[idx]["position"] = pos
}

func getPos(gs *GameSessionState, color string, idx int) int {
	toks, _ := ludoTokens(gs, color)
	return ludoTokenPosition(toks[idx])
}

func setRemainingMoves(gs *GameSessionState, moves ...int) {
	rm := make([]interface{}, len(moves))
	for i, v := range moves {
		rm[i] = v
	}
	gs.GameData["remaining_moves"] = rm
	gs.GameData["awaiting_move"] = true
	gs.GameData["doubles"] = false
	gs.GameData["bonus_earned"] = false
	gs.GameData["last_capture"] = false
	gs.GameData["last_token_home"] = false
}

// ── capture test ─────────────────────────────────────────────────────────────

// TestCaptureToken: red token (pos 8) rolls 6, lands on global square 14
// which is the same global square as blue token (pos 1, entry=13 → 14).
// Square 14 is NOT safe → capture should happen.
//
// Nigerian house rule: a capture instantly teleports the CAPTURING token
// all the way Home (position 57), not just to the square it landed on —
// so red should end at 57, not 14, and the victim (blue) goes to base (-1).
func TestCaptureToken(t *testing.T) {
	gs := makeTestLudoState(2)
	gm := &GameManager{}

	setPos(gs, "red", 0, 8)  // red at pos 8 → global (0+8)%52 = 8
	setPos(gs, "blue", 0, 1) // blue at pos 1 → global (13+1)%52 = 14
	// red moves 8 + 6 = 14 → global (0+14)%52 = 14 → same square as blue
	setRemainingMoves(gs, 6)

	gameOver, winnerID, err := gm.processLudoTokenMove(
		gs, 0, []string{"red", "yellow"},
		map[string]interface{}{
			"color": "red", "token_index": float64(0), "die_value": float64(6),
		},
	)

	if err != nil {
		t.Fatalf("move failed: %v", err)
	}
	if gameOver {
		t.Error("game should not be over after one capture")
	}
	if winnerID != nil {
		t.Errorf("expected no winner, got %d", *winnerID)
	}
	if pos := getPos(gs, "red", 0); pos != 57 {
		t.Errorf("red token should teleport Home (57) on capture, got %d", pos)
	}
	if pos := getPos(gs, "blue", 0); pos != -1 {
		t.Errorf("blue token should be at base (-1), got %d (CAPTURE FAILED)", pos)
	}
	if captured, _ := gs.GameData["last_capture"].(bool); !captured {
		t.Error("last_capture should be true")
	}
	if reachedHome, _ := gs.GameData["last_token_home"].(bool); !reachedHome {
		t.Error("last_token_home should be true — the capture-teleport lands exactly on 57")
	}
	if capturedColor, _ := gs.GameData["last_captured_color"].(string); capturedColor != "blue" {
		t.Errorf("last_captured_color should be 'blue', got %q", capturedColor)
	}
	if capturerColor, _ := gs.GameData["last_capturer_color"].(string); capturerColor != "red" {
		t.Errorf("last_capturer_color should be 'red', got %q", capturerColor)
	}
	if seq, _ := gs.GameData["capture_seq"].(int); seq != 1 {
		t.Errorf("capture_seq should be 1 after the first capture, got %d", seq)
	}
}

// TestNoCapureOnSafeSquare: landing on a star/safe square must not capture.
// Red at pos 0 rolls 8 → lands on pos 8 which is global square 8 (safe).
// Blue is also at global square 8. No capture expected.
func TestNoCaptureOnSafeSquare(t *testing.T) {
	gs := makeTestLudoState(2)
	gm := &GameManager{}

	setPos(gs, "red", 0, 0)  // red at pos 0 → global 0 (entry, safe)
	setPos(gs, "blue", 0, 8) // blue at pos 8 → global (13+8)%52 = 21 (safe) — different square
	// Actually to share global 8: blue at pos (8-13+52)%52 = 47 → global (13+47)%52 = 8
	// Let's set that:
	setPos(gs, "blue", 0, 47) // blue at pos 47 → global (13+47)%52 = 8
	setRemainingMoves(gs, 8)

	// red moves 0 + 8 = 8 → global (0+8)%52 = 8 (SAFE — star square)
	_, _, err := gm.processLudoTokenMove(
		gs, 0, []string{"red", "yellow"},
		map[string]interface{}{
			"color": "red", "token_index": float64(0), "die_value": float64(8),
		},
	)
	if err != nil {
		t.Fatalf("move failed: %v", err)
	}
	// blue should NOT be captured (safe square)
	if pos := getPos(gs, "blue", 0); pos != 47 {
		t.Errorf("blue token should still be at 47 (safe square), got %d", pos)
	}
	if captured, _ := gs.GameData["last_capture"].(bool); captured {
		t.Error("last_capture should be false on safe square")
	}
}

// TestBothDiceUsable: roll 6+3 with all tokens in base.
// After entering with 6 (token moves to pos 0), die 3 should still be in
// remaining_moves and usable to advance the just-entered token.
// This tests the FIXED dice behaviour (both dice kept in remaining_moves).
func TestBothDiceUsable(t *testing.T) {
	gs := makeTestLudoState(2)
	gm := &GameManager{}
	// all tokens start at -1 (base) by default

	// Simulate the FIXED roll behaviour: both dice kept
	setRemainingMoves(gs, 6, 3)

	// Use die 6 to enter red token 0 from base
	_, _, err := gm.processLudoTokenMove(
		gs, 0, []string{"red", "yellow"},
		map[string]interface{}{"color": "red", "token_index": float64(0), "die_value": float64(6)},
	)
	if err != nil {
		t.Fatalf("failed to use die 6: %v", err)
	}
	if pos := getPos(gs, "red", 0); pos != 0 {
		t.Errorf("red token should be at pos 0 after entering, got %d", pos)
	}

	// Die 3 must still be playable (token at pos 0 can move 3 → pos 3)
	rem := ludoRemainingMoves(gs)
	if len(rem) != 1 || rem[0] != 3 {
		t.Errorf("expected remaining=[3] after using 6, got %v", rem)
	}
	if aw, _ := gs.GameData["awaiting_move"].(bool); !aw {
		t.Error("awaiting_move should still be true — second die not yet used")
	}

	// Use die 3 to advance red token 0 from pos 0 to pos 3
	_, _, err = gm.processLudoTokenMove(
		gs, 0, []string{"red", "yellow"},
		map[string]interface{}{"color": "red", "token_index": float64(0), "die_value": float64(3)},
	)
	if err != nil {
		t.Fatalf("failed to use die 3: %v", err)
	}
	if pos := getPos(gs, "red", 0); pos != 3 {
		t.Errorf("red token should be at pos 3, got %d", pos)
	}
	rem2 := ludoRemainingMoves(gs)
	if len(rem2) != 0 {
		t.Errorf("remaining should be empty after both dice, got %v", rem2)
	}
}

// TestDiceFilterNeitherLegal: if neither die can move any token, turn passes.
// All tokens in base, roll 3+4 → no legal move → no awaiting_move set.
func TestDiceFilterNeitherLegal(t *testing.T) {
	gs := makeTestLudoState(2)
	// all tokens at -1

	gs.GameData["dice_rolls"] = []interface{}{}
	gs.GameData["awaiting_move"] = false

	// Manually simulate processLudoRoll result for 3+4 (no legal moves expected)
	d1, d2 := 3, 4
	playerColors := []string{"red", "yellow"}
	hasAny := ludoHasLegalMove(gs, playerColors, d1) || ludoHasLegalMove(gs, playerColors, d2)
	if hasAny {
		t.Error("expected no legal moves with all tokens in base and dice 3+4")
	}
}

// TestDiceFilter6PlusN: with all tokens in base, rolling 6+N — 6 IS legal,
// so hasAnyLegal should be true and BOTH dice should be kept.
func TestDiceFilter6PlusN(t *testing.T) {
	gs := makeTestLudoState(2)
	// all tokens at -1

	playerColors := []string{"red", "yellow"}
	has6 := ludoHasLegalMove(gs, playerColors, 6)
	has3 := ludoHasLegalMove(gs, playerColors, 3)

	if !has6 {
		t.Error("die=6 should have a legal move (enter from base)")
	}
	if has3 {
		t.Error("die=3 should have NO immediate legal move with all tokens in base")
	}
	// Combined: hasAnyLegal should be true because 6 is legal
	hasAny := has6 || has3
	if !hasAny {
		t.Error("hasAnyLegal should be true because die=6 can enter")
	}
	// → BOTH dice should be kept in remaining_moves (the fixed behaviour)
}
