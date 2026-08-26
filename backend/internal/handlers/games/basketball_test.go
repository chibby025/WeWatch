package games

import (
	"testing"

	"wewatch-backend/internal/models"
)

func makeTestBasketballState(userIDs ...uint) *GameSessionState {
	var players []models.Player
	for i, id := range userIDs {
		players = append(players, models.Player{UserID: id, Username: "p", Position: i})
	}
	return &GameSessionState{
		GameSession: &models.GameSession{GameType: "basketball"},
		Players:     players,
		CurrentTurn: 0,
		GameData:    map[string]interface{}{},
	}
}

func TestBasketballShotMadeFormula(t *testing.T) {
	// Close shot (distance=0): ideal=0.3, tolerance=0.15 -> made range [0.15, 0.45]
	if !basketballShotMade(0, 0.3) {
		t.Error("expected exact ideal power to be made at distance=0")
	}
	// Just inside the tolerance window (avoids floating-point boundary
	// equality flakiness right at the exact 0.15/0.45 edges).
	if !basketballShotMade(0, 0.16) || !basketballShotMade(0, 0.44) {
		t.Error("expected values comfortably inside the tolerance window to be made at distance=0")
	}
	if basketballShotMade(0, 0.10) || basketballShotMade(0, 0.50) {
		t.Error("expected values comfortably outside the tolerance window to be missed at distance=0")
	}
	// Far shot (distance=1): ideal=0.9, tolerance=0.07 -> made range [0.83, 0.97]
	if !basketballShotMade(1, 0.9) {
		t.Error("expected exact ideal power to be made at distance=1")
	}
	if basketballShotMade(1, 0.5) {
		t.Error("expected a badly undershot far shot to miss")
	}
}

func TestBasketballRejectsUnknownMoveType(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestBasketballState(1, 2)
	_, _, err := gm.processBasketballMove(gs, 1, "dunk", map[string]interface{}{"power": 0.3})
	if err == nil {
		t.Fatal("expected an error for an unknown move type")
	}
}

func TestBasketballRejectsMissingPower(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestBasketballState(1, 2)
	_, _, err := gm.processBasketballMove(gs, 1, "shoot", map[string]interface{}{"distance": 0.5})
	if err == nil {
		t.Fatal("expected an error for missing power")
	}
}

func TestBasketballRejectsOutOfRangePower(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestBasketballState(1, 2)
	_, _, err := gm.processBasketballMove(gs, 1, "shoot", map[string]interface{}{"power": 1.5, "distance": 0.5})
	if err == nil {
		t.Fatal("expected an error for power > 1")
	}
}

func TestBasketballRejectsMissingDistanceOnFreeShot(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestBasketballState(1, 2)
	_, _, err := gm.processBasketballMove(gs, 1, "shoot", map[string]interface{}{"power": 0.5})
	if err == nil {
		t.Fatal("expected an error for a free shot missing distance")
	}
}

func TestBasketballRejectsOutOfRangeDistance(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestBasketballState(1, 2)
	_, _, err := gm.processBasketballMove(gs, 1, "shoot", map[string]interface{}{"power": 0.5, "distance": 1.2})
	if err == nil {
		t.Fatal("expected an error for distance > 1")
	}
}

func TestBasketballFreeShotMissPassesTurnNoChallenge(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestBasketballState(1, 2)
	// distance=0.5 -> ideal=0.6, tolerance=0.11 -> power=0.1 is a clean miss
	gameOver, winnerID, err := gm.processBasketballMove(gs, 1, "shoot", map[string]interface{}{"power": 0.1, "distance": 0.5})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatal("a missed free shot should never end the game")
	}
	if gs.CurrentTurn != 1 {
		t.Errorf("expected turn to pass to player 2 (index 1), got %d", gs.CurrentTurn)
	}
	hasPending, _ := gs.GameData["has_pending_shot"].(bool)
	if hasPending {
		t.Error("a missed free shot should not set a pending challenge")
	}
	if basketballLettersFor(gs, 1) != "" {
		t.Error("a missed FREE shot should never award a letter")
	}
}

func TestBasketballFreeShotMakeSetsChallengeQueue(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestBasketballState(1, 2, 3)
	// distance=0.5 -> ideal=0.6, exact match -> made
	gameOver, _, err := gm.processBasketballMove(gs, 1, "shoot", map[string]interface{}{"power": 0.6, "distance": 0.5})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver {
		t.Fatal("a made free shot should never itself end the game")
	}
	hasPending, _ := gs.GameData["has_pending_shot"].(bool)
	if !hasPending {
		t.Fatal("a made free shot should set a pending challenge")
	}
	setDist, _ := gs.GameData["set_distance"].(float64)
	if setDist != 0.5 {
		t.Errorf("expected set_distance=0.5, got %v", setDist)
	}
	if gs.CurrentTurn != 1 {
		t.Errorf("expected turn to move to the first challenger (index 1, player 2), got %d", gs.CurrentTurn)
	}
	queue, _ := gs.GameData["attempt_queue"].([]interface{})
	if len(queue) != 2 {
		t.Fatalf("expected 2 players in the attempt queue (players 2 and 3), got %d", len(queue))
	}
	if uint(queue[0].(float64)) != 2 || uint(queue[1].(float64)) != 3 {
		t.Errorf("expected attempt queue [2,3] in turn order, got %v", queue)
	}
}

func TestBasketballIgnoresClientDistanceDuringMatch(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestBasketballState(1, 2)
	// Player 1 sets a hard far shot (distance=1, ideal=0.9).
	_, _, err := gm.processBasketballMove(gs, 1, "shoot", map[string]interface{}{"power": 0.9, "distance": 1.0})
	if err != nil {
		t.Fatalf("unexpected error setting the shot: %v", err)
	}
	// Player 2 tries to cheat by submitting distance=0 (an easy shot) along
	// with a power that would only make the EASY shot, not the real far one.
	_, _, err = gm.processBasketballMove(gs, 2, "shoot", map[string]interface{}{"power": 0.3, "distance": 0.0})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// power=0.3 against the REAL forced distance=1 (ideal=0.9, tolerance=0.07)
	// is a clean miss — confirms the server used 1.0, not the submitted 0.0.
	if basketballLettersFor(gs, 2) != "H" {
		t.Errorf("expected player 2 to be given a letter (server should have ignored the submitted distance=0 and scored against the real set distance=1) — got letters=%q", basketballLettersFor(gs, 2))
	}
}

func TestBasketballChallengerMatchNoLetterContinuesQueue(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestBasketballState(1, 2, 3)
	// Player 1 sets distance=0.5 (ideal=0.6) and makes it.
	if _, _, err := gm.processBasketballMove(gs, 1, "shoot", map[string]interface{}{"power": 0.6, "distance": 0.5}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Player 2 (first challenger) also matches it exactly.
	_, _, err := gm.processBasketballMove(gs, 2, "shoot", map[string]interface{}{"power": 0.6, "distance": 0.9})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if basketballLettersFor(gs, 2) != "" {
		t.Error("a made matching attempt should never award a letter")
	}
	if gs.CurrentTurn != 2 {
		t.Errorf("expected turn to move to the next challenger (index 2, player 3), got %d", gs.CurrentTurn)
	}
	hasPending, _ := gs.GameData["has_pending_shot"].(bool)
	if !hasPending {
		t.Error("the challenge should still be pending — one more player (3) hasn't attempted it yet")
	}
}

func TestBasketballChallengerMissGetsLetter(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestBasketballState(1, 2)
	if _, _, err := gm.processBasketballMove(gs, 1, "shoot", map[string]interface{}{"power": 0.6, "distance": 0.5}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	_, _, err := gm.processBasketballMove(gs, 2, "shoot", map[string]interface{}{"power": 0.05})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if basketballLettersFor(gs, 2) != "H" {
		t.Errorf("expected player 2 to be given the letter H, got %q", basketballLettersFor(gs, 2))
	}
}

func TestBasketballQueueExhaustedReturnsTurnToSetter(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestBasketballState(1, 2, 3)
	if _, _, err := gm.processBasketballMove(gs, 1, "shoot", map[string]interface{}{"power": 0.6, "distance": 0.5}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processBasketballMove(gs, 2, "shoot", map[string]interface{}{"power": 0.6}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processBasketballMove(gs, 3, "shoot", map[string]interface{}{"power": 0.6}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	hasPending, _ := gs.GameData["has_pending_shot"].(bool)
	if hasPending {
		t.Error("the pending challenge should be cleared once everyone has attempted it")
	}
	if gs.CurrentTurn != 0 {
		t.Errorf("expected turn to return to the original setter (index 0, player 1), got %d", gs.CurrentTurn)
	}
}

func TestBasketballSetterMissesFreeShotClearsChallengeAndPassesTurn(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestBasketballState(1, 2, 3)
	// Player 1 makes a shot, everyone matches it, turn returns to player 1.
	if _, _, err := gm.processBasketballMove(gs, 1, "shoot", map[string]interface{}{"power": 0.6, "distance": 0.5}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processBasketballMove(gs, 2, "shoot", map[string]interface{}{"power": 0.6}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processBasketballMove(gs, 3, "shoot", map[string]interface{}{"power": 0.6}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Now player 1 gets a fresh free shot and misses it.
	if _, _, err := gm.processBasketballMove(gs, 1, "shoot", map[string]interface{}{"power": 0.01, "distance": 0.5}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	hasPending, _ := gs.GameData["has_pending_shot"].(bool)
	if hasPending {
		t.Error("a missed free shot should never leave a pending challenge active")
	}
	if gs.CurrentTurn != 1 {
		t.Errorf("expected turn to pass to the next player (index 1, player 2), got %d", gs.CurrentTurn)
	}
	if basketballLettersFor(gs, 1) != "" {
		t.Error("missing your own free shot should never award yourself a letter")
	}
}

func TestBasketballFiveLettersEliminates(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestBasketballState(1, 2, 3)
	for i := 0; i < 5; i++ {
		// Player 1 re-sets the same shot each round; player 2 always misses
		// the match, accumulating H, O, R, S, E in order.
		if _, _, err := gm.processBasketballMove(gs, 1, "shoot", map[string]interface{}{"power": 0.6, "distance": 0.5}); err != nil {
			t.Fatalf("round %d: unexpected error setting shot: %v", i, err)
		}
		if _, _, err := gm.processBasketballMove(gs, 2, "shoot", map[string]interface{}{"power": 0.01}); err != nil {
			t.Fatalf("round %d: unexpected error on player 2's miss: %v", i, err)
		}
		// player 3 always matches cleanly so the round can complete and return to player 1
		if _, _, err := gm.processBasketballMove(gs, 3, "shoot", map[string]interface{}{"power": 0.6}); err != nil {
			t.Fatalf("round %d: unexpected error on player 3's match: %v", i, err)
		}
	}
	if basketballLettersFor(gs, 2) != "HORSE" {
		t.Fatalf("expected player 2 to have spelled HORSE, got %q", basketballLettersFor(gs, 2))
	}
	if !basketballIsEliminated(gs, 2) {
		t.Error("expected player 2 to be eliminated after spelling HORSE")
	}
}

func TestBasketballWinsWhenOneRemains(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestBasketballState(1, 2)
	var gameOver bool
	var winnerID *uint
	var err error
	for i := 0; i < 5; i++ {
		if _, _, err = gm.processBasketballMove(gs, 1, "shoot", map[string]interface{}{"power": 0.6, "distance": 0.5}); err != nil {
			t.Fatalf("round %d: unexpected error setting shot: %v", i, err)
		}
		gameOver, winnerID, err = gm.processBasketballMove(gs, 2, "shoot", map[string]interface{}{"power": 0.01})
		if err != nil {
			t.Fatalf("round %d: unexpected error on player 2's miss: %v", i, err)
		}
	}
	if !gameOver {
		t.Fatal("expected the game to end once player 2 spelled HORSE with only 2 players")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Fatalf("expected player 1 to win, got winnerID=%v", winnerID)
	}
}

// Out-of-turn rejection itself lives in ProcessMove's generic turn-check
// (game_manager.go), not in processBasketballMove — basketball is registered
// in selfManagedTurn only for how CurrentTurn ADVANCES after a valid move,
// the same shared turn-ownership check every other non-simultaneous game
// goes through applies unchanged. Verified end-to-end against the real
// running server instead of re-mocking GameManager's internal state here —
// see the live WebSocket test run for this game.
