package games

import (
	"math"
	"testing"
	"wewatch-backend/internal/models"
)

func makeTestDartsState(numPlayers int) *GameSessionState {
	players := make([]models.Player, numPlayers)
	for i := range players {
		players[i] = models.Player{UserID: uint(i + 1)}
	}
	return &GameSessionState{
		Players:     players,
		CurrentTurn: 0,
		GameData:    map[string]interface{}{},
		GameSession: &models.GameSession{GameType: "darts"},
	}
}

func TestDartsScoreBullseye(t *testing.T) {
	score, label := dartsScoreAt(0, 0)
	if score != 50 || label != "BULLSEYE" {
		t.Fatalf("expected 50/BULLSEYE at dead center, got %d/%s", score, label)
	}
}

func TestDartsScoreOuterBull(t *testing.T) {
	// Just inside the outer bull ring, off-center so it's not the inner bull.
	score, label := dartsScoreAt(0.06, 0)
	if score != 25 || label != "OUTER BULL" {
		t.Fatalf("expected 25/OUTER BULL, got %d/%s", score, label)
	}
}

func TestDartsScoreTopSectorIsTwenty(t *testing.T) {
	// Straight up from center, in the single region (between outer bull and triple ring).
	score, label := dartsScoreAt(0, 0.3)
	if score != 20 || label != "20" {
		t.Fatalf("expected 20/\"20\" straight up, got %d/%s", score, label)
	}
}

func TestDartsScoreTripleTwenty(t *testing.T) {
	r := (dartsTripleInner + dartsTripleOuter) / 2
	score, label := dartsScoreAt(0, r)
	if score != 60 || label != "TRIPLE 20" {
		t.Fatalf("expected 60/TRIPLE 20, got %d/%s", score, label)
	}
}

func TestDartsScoreDoubleTwenty(t *testing.T) {
	r := (dartsDoubleInner + dartsDoubleOuter) / 2
	score, label := dartsScoreAt(0, r)
	if score != 40 || label != "DOUBLE 20" {
		t.Fatalf("expected 40/DOUBLE 20, got %d/%s", score, label)
	}
}

func TestDartsScoreMissOutsideBoard(t *testing.T) {
	score, label := dartsScoreAt(0, 1.5)
	if score != 0 || label != "MISS" {
		t.Fatalf("expected 0/MISS outside the board, got %d/%s", score, label)
	}
}

func TestDartsAllTwentySectorsSumToKnownDartboardTotal(t *testing.T) {
	// Sanity check the sector order/count is a real, complete dartboard: all
	// 20 numbers 1-20 present exactly once, summing to 210 (real dartboard fact).
	seen := map[int]bool{}
	sum := 0
	for _, n := range dartsSectorOrder {
		if seen[n] {
			t.Fatalf("sector %d appears more than once", n)
		}
		seen[n] = true
		sum += n
	}
	for n := 1; n <= 20; n++ {
		if !seen[n] {
			t.Fatalf("sector %d missing from dartboard layout", n)
		}
	}
	if sum != 210 {
		t.Fatalf("expected sector numbers to sum to 210 (real dartboard fact), got %d", sum)
	}
}

func TestDartsWobbleShrinksWithPower(t *testing.T) {
	// A well-timed throw (power=1) should never wobble further than a
	// poorly-timed one (power=0), across many samples.
	maxAtFullPower := 0.0
	maxAtNoPower := 0.0
	for i := 0; i < 500; i++ {
		dx, dy := dartsWobble(1.0)
		r := math.Hypot(dx, dy)
		if r > maxAtFullPower {
			maxAtFullPower = r
		}
		dx, dy = dartsWobble(0.0)
		r = math.Hypot(dx, dy)
		if r > maxAtNoPower {
			maxAtNoPower = r
		}
	}
	if maxAtFullPower >= maxAtNoPower {
		t.Fatalf("expected full-power wobble (%f) to stay well below zero-power wobble (%f)", maxAtFullPower, maxAtNoPower)
	}
}

func TestDartsThreeThrowsStayOnSamePlayer(t *testing.T) {
	gs := makeTestDartsState(2)
	gm := &GameManager{}

	for i := 0; i < 2; i++ { // darts 1 and 2 of the turn
		_, _, err := gm.processDartsMove(gs, 1, "throw", map[string]interface{}{"aim_x": 0.0, "aim_y": 0.3, "power": 1.0})
		if err != nil {
			t.Fatalf("throw %d failed: %v", i+1, err)
		}
		// Simulate ProcessMove's generic advance, which the decrement trick should cancel out.
		gs.CurrentTurn = (gs.CurrentTurn + 1) % len(gs.Players)
	}
	if gs.CurrentTurn != 0 {
		t.Fatalf("expected turn to stay on player 0 after 2 of 3 darts, got CurrentTurn=%d", gs.CurrentTurn)
	}

	dartsThisTurn, _ := gs.GameData["darts_this_turn"].(float64)
	if dartsThisTurn != 2 {
		t.Fatalf("expected darts_this_turn=2, got %v", dartsThisTurn)
	}
}

func TestDartsThirdThrowAdvancesTurn(t *testing.T) {
	gs := makeTestDartsState(2)
	gm := &GameManager{}

	for i := 0; i < 3; i++ {
		_, _, err := gm.processDartsMove(gs, 1, "throw", map[string]interface{}{"aim_x": 0.0, "aim_y": 0.3, "power": 1.0})
		if err != nil {
			t.Fatalf("throw %d failed: %v", i+1, err)
		}
		gs.CurrentTurn = (gs.CurrentTurn + 1) % len(gs.Players)
	}
	if gs.CurrentTurn != 1 {
		t.Fatalf("expected turn to pass to player 2 after 3 darts, got CurrentTurn=%d", gs.CurrentTurn)
	}
	dartsThisTurn, _ := gs.GameData["darts_this_turn"].(float64)
	if dartsThisTurn != 0 {
		t.Fatalf("expected darts_this_turn reset to 0 for the next player, got %v", dartsThisTurn)
	}
}

func TestDartsRoundAdvancesAfterLastPlayerFinishes(t *testing.T) {
	gs := makeTestDartsState(2)
	gm := &GameManager{}

	throwThreeDarts := func(playerID uint) {
		for i := 0; i < 3; i++ {
			_, _, err := gm.processDartsMove(gs, playerID, "throw", map[string]interface{}{"aim_x": 0.0, "aim_y": 0.3, "power": 1.0})
			if err != nil {
				t.Fatalf("throw failed for player %d: %v", playerID, err)
			}
			gs.CurrentTurn = (gs.CurrentTurn + 1) % len(gs.Players)
		}
	}

	throwThreeDarts(1) // player 1's turn (round 1)
	round, _ := gs.GameData["current_round"].(float64)
	if round != 1 {
		t.Fatalf("round should still be 1 after only the first player's turn, got %v", round)
	}
	throwThreeDarts(2) // player 2's turn (round 1) — last player, should advance the round
	round, _ = gs.GameData["current_round"].(float64)
	if round != 2 {
		t.Fatalf("expected round to advance to 2 after the last player finished round 1, got %v", round)
	}
}

func TestDartsGameEndsAfterAllRoundsWithCorrectWinner(t *testing.T) {
	gs := makeTestDartsState(2)
	gm := &GameManager{}

	// Player 1 always aims dead center (bullseye, 50pts x3 x3rounds = 450);
	// player 2 always aims for a guaranteed miss (aim way outside the board,
	// clamped, but with power=1 so wobble is tiny — should score ~0 every time
	// via the single-region "5" sector at worst, never beating player 1's total).
	var gameOver bool
	var winnerID *uint
	var err error
	for round := 0; round < dartsRounds; round++ {
		for i := 0; i < 3; i++ {
			gameOver, winnerID, err = gm.processDartsMove(gs, 1, "throw", map[string]interface{}{"aim_x": 0.0, "aim_y": 0.0, "power": 1.0})
			if err != nil {
				t.Fatalf("player 1 throw failed: %v", err)
			}
			if !gameOver {
				gs.CurrentTurn = (gs.CurrentTurn + 1) % len(gs.Players)
			}
		}
		for i := 0; i < 3; i++ {
			gameOver, winnerID, err = gm.processDartsMove(gs, 2, "throw", map[string]interface{}{"aim_x": 0.0, "aim_y": 1.3, "power": 1.0})
			if err != nil {
				t.Fatalf("player 2 throw failed: %v", err)
			}
			if !gameOver {
				gs.CurrentTurn = (gs.CurrentTurn + 1) % len(gs.Players)
			}
		}
	}
	if !gameOver {
		t.Fatal("expected the game to be over after all rounds completed")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Fatalf("expected player 1 (bullseye every throw) to win, got %v", winnerID)
	}
	scores, _ := gs.GameData["scores"].(map[string]interface{})
	if scores["1"] != 450.0 {
		t.Fatalf("expected player 1's total score to be 450 (9 bullseyes), got %v", scores["1"])
	}
}

func TestDartsGameEndsInDrawOnTiedScore(t *testing.T) {
	gs := makeTestDartsState(2)
	gm := &GameManager{}

	var gameOver bool
	var winnerID *uint
	var err error
	for round := 0; round < dartsRounds; round++ {
		for _, pid := range []uint{1, 2} {
			for i := 0; i < 3; i++ {
				// Both players throw identically — should tie exactly.
				gameOver, winnerID, err = gm.processDartsMove(gs, pid, "throw", map[string]interface{}{"aim_x": 0.0, "aim_y": 0.0, "power": 1.0})
				if err != nil {
					t.Fatalf("throw failed: %v", err)
				}
				if !gameOver {
					gs.CurrentTurn = (gs.CurrentTurn + 1) % len(gs.Players)
				}
			}
		}
	}
	if !gameOver {
		t.Fatal("expected the game to be over")
	}
	scores, _ := gs.GameData["scores"].(map[string]interface{})
	if scores["1"] != scores["2"] {
		t.Fatalf("expected tied scores, got %v vs %v", scores["1"], scores["2"])
	}
	if winnerID != nil {
		t.Fatalf("expected a draw (nil winner) on a tied score, got %v", *winnerID)
	}
}

func TestDartsAimClampedForOutOfRangeInput(t *testing.T) {
	gs := makeTestDartsState(2)
	gm := &GameManager{}
	// A malicious/buggy client sending a wildly out-of-range aim shouldn't crash
	// or produce a nonsensical result — just clamp it defensively.
	_, _, err := gm.processDartsMove(gs, 1, "throw", map[string]interface{}{"aim_x": 999.0, "aim_y": 999.0, "power": 1.0})
	if err != nil {
		t.Fatalf("unexpected error with an out-of-range aim: %v", err)
	}
	lastThrow, _ := gs.GameData["last_throw"].(map[string]interface{})
	lx, _ := lastThrow["x"].(float64)
	ly, _ := lastThrow["y"].(float64)
	if math.Hypot(lx, ly) > 2.0 {
		t.Fatalf("expected the clamped landing point to stay reasonably close to the board, got (%f, %f)", lx, ly)
	}
}
