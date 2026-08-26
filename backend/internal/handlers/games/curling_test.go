package games

import (
	"testing"

	"wewatch-backend/internal/models"
)

func makeTestCurlingState(userIDs ...uint) *GameSessionState {
	var players []models.Player
	for i, id := range userIDs {
		players = append(players, models.Player{UserID: id, Username: "p", Position: i})
	}
	return &GameSessionState{
		GameSession: &models.GameSession{GameType: "curling"},
		Players:     players,
		CurrentTurn: 0,
		GameData:    map[string]interface{}{},
	}
}

func TestCurlingRingLabels(t *testing.T) {
	cases := []struct {
		x, y  float64
		label string
	}{
		{0, 0, "BUTTON"},
		{0.05, 0, "BUTTON"},
		{0.2, 0, "4-FOOT"},
		{0.5, 0, "8-FOOT"},
		{0.9, 0, "12-FOOT"},
		{1.5, 0, "OUT"},
	}
	for _, c := range cases {
		got := curlingRingLabel(c.x, c.y)
		if got != c.label {
			t.Errorf("curlingRingLabel(%v,%v) = %q, want %q", c.x, c.y, got, c.label)
		}
	}
}

func TestCurlingWobbleShrinksWithPower(t *testing.T) {
	var maxLow, maxHigh float64
	for i := 0; i < 500; i++ {
		dx, dy := curlingWobble(0.1)
		if m := dx*dx + dy*dy; m > maxLow {
			maxLow = m
		}
		dx2, dy2 := curlingWobble(0.95)
		if m := dx2*dx2 + dy2*dy2; m > maxHigh {
			maxHigh = m
		}
	}
	if maxHigh >= maxLow {
		t.Errorf("expected high-power wobble (%v) to stay below low-power wobble (%v)", maxHigh, maxLow)
	}
}

func TestCurlingRejectsUnknownMoveType(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestCurlingState(1, 2)
	_, _, err := gm.processCurlingMove(gs, 1, "slide", map[string]interface{}{"aim_x": 0.0, "aim_y": 0.0, "power": 0.9})
	if err == nil {
		t.Fatal("expected an error for an unknown move type")
	}
}

func TestCurlingRejectsMissingPower(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestCurlingState(1, 2)
	_, _, err := gm.processCurlingMove(gs, 1, "throw", map[string]interface{}{"aim_x": 0.0, "aim_y": 0.0})
	if err == nil {
		t.Fatal("expected an error for missing power")
	}
}

// Mirrors darts_test.go/archery_test.go's own established convention:
// calling processCurlingMove directly bypasses the real ProcessMove
// wrapper's generic "+1 mod N" turn advance, so tests apply it manually
// after each call to see the same net effect a real move would.
func advanceCurlingTurn(gs *GameSessionState) {
	gs.CurrentTurn = (gs.CurrentTurn + 1) % len(gs.Players)
}

func TestCurlingEndStaysOpenUntilAllStonesThrown(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestCurlingState(1, 2)
	// 4 stones per player per end, 2 players = 8 total throws before the
	// end resolves. Throw 7 of them and confirm current_end hasn't advanced.
	for i := 0; i < 7; i++ {
		playerID := gs.Players[gs.CurrentTurn].UserID
		if _, _, err := gm.processCurlingMove(gs, playerID, "throw", map[string]interface{}{"aim_x": 0.0, "aim_y": 0.0, "power": 1.0}); err != nil {
			t.Fatalf("throw %d: unexpected error: %v", i, err)
		}
		advanceCurlingTurn(gs)
	}
	currentEnd, _ := gs.GameData["current_end"].(float64)
	if currentEnd != 1 {
		t.Fatalf("expected still to be in end 1 after only 7 of 8 stones, got current_end=%v", currentEnd)
	}
}

func TestCurlingEndResolvesAndAdvancesAfterAllStonesThrown(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestCurlingState(1, 2)
	// Player 1 always throws dead-center (near-guaranteed closest stone at
	// power=1.0, tiny wobble); player 2 always throws at the house's outer
	// edge (far from center). Player 1 should win every one of their 4
	// stones vs player 2's best (4 points for the end).
	for i := 0; i < 8; i++ {
		playerID := gs.Players[gs.CurrentTurn].UserID
		var aimX float64
		if playerID == 1 {
			aimX = 0.0
		} else {
			aimX = 0.95
		}
		if _, _, err := gm.processCurlingMove(gs, playerID, "throw", map[string]interface{}{"aim_x": aimX, "aim_y": 0.0, "power": 1.0}); err != nil {
			t.Fatalf("throw %d: unexpected error: %v", i, err)
		}
		advanceCurlingTurn(gs)
	}
	currentEnd, _ := gs.GameData["current_end"].(float64)
	if currentEnd != 2 {
		t.Fatalf("expected to have advanced to end 2 after all 8 stones, got current_end=%v", currentEnd)
	}
	scores, _ := gs.GameData["scores"].(map[string]interface{})
	p1Score, _ := scores["1"].(float64)
	p2Score, _ := scores["2"].(float64)
	if p1Score != 4 {
		t.Errorf("expected player 1 to score 4 points (all 4 of their stones beat player 2's best), got %v", p1Score)
	}
	if p2Score != 0 {
		t.Errorf("expected player 2 to score 0 points, got %v", p2Score)
	}
	stonesThisEnd, _ := gs.GameData["stones_this_end"].(map[string]interface{})
	s1, _ := stonesThisEnd["1"].([]interface{})
	if len(s1) != 0 {
		t.Errorf("expected stones_this_end to reset to empty for the new end, got %d entries for player 1", len(s1))
	}
}

func TestCurlingResolveEndPartialBeat(t *testing.T) {
	// A hand-constructed scenario testing curlingResolveEnd directly:
	// player 1's stones at distances [0.05, 0.10, 0.50, 0.90], player 2's
	// best stone at distance 0.30 -> only 2 of player 1's stones (0.05,
	// 0.10) beat 0.30, so player 1 should score exactly 2.
	gs := makeTestCurlingState(1, 2)
	gs.GameData["scores"] = map[string]interface{}{"1": float64(0), "2": float64(0)}
	stonesThisEnd := map[string]interface{}{
		"1": []interface{}{
			map[string]interface{}{"x": 0.05, "y": 0.0},
			map[string]interface{}{"x": 0.10, "y": 0.0},
			map[string]interface{}{"x": 0.50, "y": 0.0},
			map[string]interface{}{"x": 0.90, "y": 0.0},
		},
		"2": []interface{}{
			map[string]interface{}{"x": 0.30, "y": 0.0},
			map[string]interface{}{"x": 0.60, "y": 0.0},
			map[string]interface{}{"x": 0.70, "y": 0.0},
			map[string]interface{}{"x": 0.80, "y": 0.0},
		},
	}
	curlingResolveEnd(gs, stonesThisEnd)
	scores, _ := gs.GameData["scores"].(map[string]interface{})
	p1Score, _ := scores["1"].(float64)
	p2Score, _ := scores["2"].(float64)
	if p1Score != 2 {
		t.Errorf("expected player 1 to score exactly 2 (only 2 of their stones beat player 2's best of 0.30), got %v", p1Score)
	}
	if p2Score != 0 {
		t.Errorf("expected player 2 to score 0, got %v", p2Score)
	}
}

func TestCurlingResolveEndExactTieAwardsNothing(t *testing.T) {
	gs := makeTestCurlingState(1, 2)
	gs.GameData["scores"] = map[string]interface{}{"1": float64(0), "2": float64(0)}
	stonesThisEnd := map[string]interface{}{
		"1": []interface{}{map[string]interface{}{"x": 0.3, "y": 0.0}},
		"2": []interface{}{map[string]interface{}{"x": 0.3, "y": 0.0}},
	}
	curlingResolveEnd(gs, stonesThisEnd)
	scores, _ := gs.GameData["scores"].(map[string]interface{})
	p1Score, _ := scores["1"].(float64)
	p2Score, _ := scores["2"].(float64)
	if p1Score != 0 || p2Score != 0 {
		t.Errorf("expected an exact tie to award nobody any points, got p1=%v p2=%v", p1Score, p2Score)
	}
}

func TestCurlingFullGameDeclaresWinnerAfterAllEnds(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestCurlingState(1, 2)
	var gameOver bool
	var winnerID *uint
	var err error
	for end := 0; end < curlingEnds; end++ {
		for i := 0; i < 8; i++ {
			playerID := gs.Players[gs.CurrentTurn].UserID
			var aimX float64
			if playerID == 1 {
				aimX = 0.0
			} else {
				aimX = 0.95
			}
			gameOver, winnerID, err = gm.processCurlingMove(gs, playerID, "throw", map[string]interface{}{"aim_x": aimX, "aim_y": 0.0, "power": 1.0})
			if err != nil {
				t.Fatalf("end %d throw %d: unexpected error: %v", end, i, err)
			}
			if !gameOver {
				advanceCurlingTurn(gs)
			}
		}
	}
	if !gameOver {
		t.Fatal("expected the game to end after all 4 ends")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Fatalf("expected player 1 (consistently closer to the button every end) to win, got winnerID=%v", winnerID)
	}
}
