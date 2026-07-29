package games

import (
	"testing"
	"wewatch-backend/internal/models"
)

// makeTestUnoState builds a deterministic UNO state directly (bypassing the
// real shuffled deal) so tests can control hands/discard/color exactly.
func makeTestUnoState(numPlayers int) *GameSessionState {
	players := make([]models.Player, numPlayers)
	for i := range players {
		players[i] = models.Player{UserID: uint(i + 1)}
	}
	gs := &GameSessionState{
		Players:     players,
		CurrentTurn: 0,
		GameData:    map[string]interface{}{},
		GameSession: &models.GameSession{GameType: "uno"},
		Hands:       map[uint][]string{},
		DrawPile:    []string{"1H", "2H", "3H", "4H", "5H", "6H", "7H", "8H", "9H", "0D"},
		DiscardPile: []string{"5H"},
	}
	gs.GameData["discard_top"] = "5H"
	gs.GameData["current_color"] = "H"
	gs.GameData["direction"] = 1.0
	gs.GameData["pending_draw"] = 0.0
	gs.GameData["uno_declared"] = map[string]interface{}{}
	gs.GameData["event_seq"] = 0
	gs.GameData["last_event"] = ""
	gs.GameData["last_event_actor"] = nil
	gs.GameData["last_event_target"] = nil
	for _, p := range players {
		gs.Hands[p.UserID] = []string{}
	}
	syncUnoPublicState(gs)
	return gs
}

// TestUnoWildDrawFourRestricted: W4 must be rejected while the player still
// holds a card matching the current color, and allowed once they don't.
func TestUnoWildDrawFourRestricted(t *testing.T) {
	gs := makeTestUnoState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"3H", "W4C"} // 3H matches current_color "H"

	_, _, err := gm.processUnoMove(gs, 1, "play", map[string]interface{}{"card": "W4C", "next_color": "D"})
	if err == nil {
		t.Fatal("expected error playing W4 while holding a matching-color card")
	}

	gs.Hands[1] = []string{"2C", "W4C"} // no Hearts card left
	_, _, err = gm.processUnoMove(gs, 1, "play", map[string]interface{}{"card": "W4C", "next_color": "D"})
	if err != nil {
		t.Fatalf("expected W4 to be legal with no matching color, got: %v", err)
	}
}

// TestUnoStackingDefers: Draw 2 must accumulate in pending_draw instead of
// forcing the draw immediately — giving the next player a genuine chance to
// counter-stack before anyone actually draws.
func TestUnoStackingDefers(t *testing.T) {
	gs := makeTestUnoState(3)
	gm := &GameManager{}
	gs.Hands[1] = []string{"D2H"}
	gs.Hands[2] = []string{"D2H"}
	gs.Hands[3] = []string{"1H"}

	if _, _, err := gm.processUnoMove(gs, 1, "play", map[string]interface{}{"card": "D2H"}); err != nil {
		t.Fatalf("player 1 play: %v", err)
	}
	if pd := gbInt(gs.GameData["pending_draw"]); pd != 2 {
		t.Errorf("expected pending_draw=2, got %d", pd)
	}
	if len(gs.Hands[2]) != 1 {
		t.Errorf("player 2's hand should be untouched (deferred draw), got %d cards", len(gs.Hands[2]))
	}
	gs.CurrentTurn = (gs.CurrentTurn + 1) % len(gs.Players) // simulate ProcessMove's generic advance

	if _, _, err := gm.processUnoMove(gs, 2, "play", map[string]interface{}{"card": "D2H"}); err != nil {
		t.Fatalf("player 2 stack: %v", err)
	}
	if pd := gbInt(gs.GameData["pending_draw"]); pd != 4 {
		t.Errorf("expected pending_draw=4 after stacking, got %d", pd)
	}
	if len(gs.Hands[3]) != 1 {
		t.Errorf("player 3's hand should still be untouched, got %d cards", len(gs.Hands[3]))
	}
	gs.CurrentTurn = (gs.CurrentTurn + 1) % len(gs.Players)

	if _, _, err := gm.processUnoMove(gs, 3, "draw", map[string]interface{}{}); err != nil {
		t.Fatalf("player 3 draw: %v", err)
	}
	if len(gs.Hands[3]) != 5 { // 1 original + 4 stacked
		t.Errorf("player 3 should have drawn the full stack of 4, got %d cards", len(gs.Hands[3]))
	}
	if pd := gbInt(gs.GameData["pending_draw"]); pd != 0 {
		t.Errorf("pending_draw should reset to 0 after resolving, got %d", pd)
	}
}

// TestUnoDrawNormal: a plain draw (no pending stack) still just draws 1.
func TestUnoDrawNormal(t *testing.T) {
	gs := makeTestUnoState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"3H"}

	if _, _, err := gm.processUnoMove(gs, 1, "draw", map[string]interface{}{}); err != nil {
		t.Fatalf("draw: %v", err)
	}
	if len(gs.Hands[1]) != 2 {
		t.Errorf("expected 2 cards after a normal draw, got %d", len(gs.Hands[1]))
	}
}

// TestUnoCatchSuccess: any player can catch someone with 1 undeclared card.
func TestUnoCatchSuccess(t *testing.T) {
	gs := makeTestUnoState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"3H"} // 1 card, never declared

	// player 2 catches player 1, even though it's player 1's own turn (index 0).
	if _, _, err := gm.processUnoMove(gs, 2, "catch_uno", map[string]interface{}{"target_id": float64(1)}); err != nil {
		t.Fatalf("catch should succeed: %v", err)
	}
	if len(gs.Hands[1]) != 3 {
		t.Errorf("caught player should have 3 cards (1 + 2 penalty), got %d", len(gs.Hands[1]))
	}
	if ev, _ := gs.GameData["last_event"].(string); ev != "caught" {
		t.Errorf("last_event should be 'caught', got %q", ev)
	}
	if actor, _ := gs.GameData["last_event_actor"].(uint); actor != 2 {
		t.Errorf("last_event_actor should be 2, got %v", gs.GameData["last_event_actor"])
	}
	if target, _ := gs.GameData["last_event_target"].(uint); target != 1 {
		t.Errorf("last_event_target should be 1, got %v", gs.GameData["last_event_target"])
	}
}

// TestUnoCatchFailsIfDeclared: a player who already declared UNO can't be caught.
func TestUnoCatchFailsIfDeclared(t *testing.T) {
	gs := makeTestUnoState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"3H"}
	gs.GameData["uno_declared"] = map[string]interface{}{"1": true}

	_, _, err := gm.processUnoMove(gs, 2, "catch_uno", map[string]interface{}{"target_id": float64(1)})
	if err == nil {
		t.Fatal("expected catch to fail — player already declared")
	}
	if len(gs.Hands[1]) != 1 {
		t.Errorf("hand should be untouched on a failed catch, got %d", len(gs.Hands[1]))
	}
}

// TestUnoCatchFailsIfNotVulnerable: a player with more than 1 card can't be caught.
func TestUnoCatchFailsIfNotVulnerable(t *testing.T) {
	gs := makeTestUnoState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"3H", "4H"}

	if _, _, err := gm.processUnoMove(gs, 2, "catch_uno", map[string]interface{}{"target_id": float64(1)}); err == nil {
		t.Fatal("expected catch to fail — target has more than 1 card")
	}
}

// TestUnoSkipEvent: playing a Skip records the event with the correct actor/target.
func TestUnoSkipEvent(t *testing.T) {
	gs := makeTestUnoState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"SH"}

	if _, _, err := gm.processUnoMove(gs, 1, "play", map[string]interface{}{"card": "SH"}); err != nil {
		t.Fatalf("play: %v", err)
	}
	if ev, _ := gs.GameData["last_event"].(string); ev != "skip" {
		t.Errorf("expected last_event='skip', got %q", ev)
	}
	if seq := gbInt(gs.GameData["event_seq"]); seq != 1 {
		t.Errorf("expected event_seq=1, got %d", seq)
	}
	if actor, _ := gs.GameData["last_event_actor"].(uint); actor != 1 {
		t.Errorf("expected actor=1, got %v", gs.GameData["last_event_actor"])
	}
	if target, _ := gs.GameData["last_event_target"].(uint); target != 2 {
		t.Errorf("expected target=2, got %v", gs.GameData["last_event_target"])
	}
}

// TestUnoTurnCheckEnforced: play/draw still require it to be your turn.
// catch_uno and uno (declaring) are both exempt — see
// TestUnoDeclareAfterOwnTurnEnded for why "uno" specifically must be.
func TestUnoTurnCheckEnforced(t *testing.T) {
	gs := makeTestUnoState(2)
	gm := &GameManager{}
	gs.Hands[2] = []string{"3H"}

	if _, _, err := gm.processUnoMove(gs, 2, "play", map[string]interface{}{"card": "3H"}); err == nil {
		t.Fatal("expected 'not your turn' error for player 2 playing on player 1's turn")
	}
	if _, _, err := gm.processUnoMove(gs, 2, "draw", map[string]interface{}{}); err == nil {
		t.Fatal("expected 'not your turn' error for player 2 drawing on player 1's turn")
	}
}

// TestUnoDeclareAfterOwnTurnEnded: reproduces the realistic sequence — a
// player plays down to 1 card (which advances the turn to the next player as
// part of that same move, unchanged pre-existing behavior), then declares
// UNO for their own hand. This is exactly when the frontend's UNO! button
// appears, so declaring must work regardless of whose turn it now is.
// A real regression: an earlier version of the turn-check gated "uno" the
// same as "play"/"draw" and broke this exact sequence.
func TestUnoDeclareAfterOwnTurnEnded(t *testing.T) {
	gs := makeTestUnoState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"3H", "4H"}
	gs.Hands[2] = []string{"9C"}

	if _, _, err := gm.processUnoMove(gs, 1, "play", map[string]interface{}{"card": "3H"}); err != nil {
		t.Fatalf("play: %v", err)
	}
	gs.CurrentTurn = (gs.CurrentTurn + 1) % len(gs.Players) // simulate ProcessMove's generic advance
	if len(gs.Hands[1]) != 1 {
		t.Fatalf("expected player 1 to have 1 card, got %d", len(gs.Hands[1]))
	}

	if _, _, err := gm.processUnoMove(gs, 1, "uno", map[string]interface{}{}); err != nil {
		t.Fatalf("declaring UNO for your own hand right after your play must work, got: %v", err)
	}
	decls := unoDeclarations(gs)
	if declared, _ := decls["1"].(bool); !declared {
		t.Error("player 1 should now be declared")
	}
}
