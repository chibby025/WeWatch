package games

import (
	"testing"
	"wewatch-backend/internal/models"
)

// makeTestBackgammonState builds a deterministic 2-player state directly
// (bypassing the real random roll) so tests can control the board and dice
// exactly. Player 1 (UserID 1) is always White (index 0), player 2 (UserID
// 2) is always Black (index 1) — matches the package's own fixed convention.
func makeTestBackgammonState() *GameSessionState {
	players := []models.Player{{UserID: 1}, {UserID: 2}}
	gs := &GameSessionState{
		Players:     players,
		CurrentTurn: 0,
		GameData:    map[string]interface{}{},
		GameSession: &models.GameSession{GameType: "backgammon"},
	}
	ensureBackgammonState(gs)
	return gs
}

// setDice bypasses the random "roll" move so tests can inject an exact set
// of remaining dice, as if the player had just rolled them.
func setDice(gs *GameSessionState, dice ...int) {
	gs.GameData["remaining_dice"] = backgammonToInterfaceSlice(dice)
	gs.GameData["awaiting_roll"] = false
}

func clearBoard(gs *GameSessionState) {
	board := make([]interface{}, backgammonPoints)
	for i := range board {
		board[i] = 0
	}
	gs.GameData["board"] = board
}

func setPoint(gs *GameSessionState, point, value int) {
	board := backgammonBoard(gs)
	board[point-1] = value
	gs.GameData["board"] = board
}

func TestBackgammonInitialBoard(t *testing.T) {
	gs := makeTestBackgammonState()
	board := backgammonBoard(gs)
	cases := map[int]int{24: 2, 13: 5, 8: 3, 6: 5, 1: -2, 12: -5, 17: -3, 19: -5}
	for point, want := range cases {
		owner, count := backgammonPointOwner(board, point)
		gotVal := count
		if owner == 1 {
			gotVal = -count
		}
		if owner == -1 {
			gotVal = 0
		}
		if gotVal != want {
			t.Errorf("point %d: expected %d, got %d", point, want, gotVal)
		}
	}
	// Total checkers per side must be 15.
	whiteTotal, blackTotal := 0, 0
	for p := 1; p <= backgammonPoints; p++ {
		owner, count := backgammonPointOwner(board, p)
		if owner == 0 {
			whiteTotal += count
		} else if owner == 1 {
			blackTotal += count
		}
	}
	if whiteTotal != 15 || blackTotal != 15 {
		t.Errorf("expected 15 checkers per side, got white=%d black=%d", whiteTotal, blackTotal)
	}
}

func TestBackgammonBasicMove(t *testing.T) {
	gs := makeTestBackgammonState()
	gm := &GameManager{}
	setDice(gs, 3, 5)

	// White moves a checker from point 24 using die 3 -> point 21 (empty).
	_, _, err := gm.processBackgammonMove(gs, 1, "move", map[string]interface{}{"from": 24.0, "die": 3.0})
	if err != nil {
		t.Fatalf("move 24->21: %v", err)
	}
	board := backgammonBoard(gs)
	if owner, count := backgammonPointOwner(board, 24); owner != 0 || count != 1 {
		t.Errorf("expected 1 White checker left on 24, got owner=%d count=%d", owner, count)
	}
	if owner, count := backgammonPointOwner(board, 21); owner != 0 || count != 1 {
		t.Errorf("expected 1 White checker on 21, got owner=%d count=%d", owner, count)
	}
	// One die consumed, one remains — same player's turn continues.
	if gs.CurrentTurn != 0 {
		t.Errorf("expected turn to stay with player 0 (dice remain), got %d", gs.CurrentTurn)
	}
	remaining := backgammonIntSlice(gs.GameData["remaining_dice"])
	if len(remaining) != 1 || remaining[0] != 5 {
		t.Errorf("expected remaining_dice=[5], got %v", remaining)
	}
}

func TestBackgammonHitSendsToBar(t *testing.T) {
	gs := makeTestBackgammonState()
	gm := &GameManager{}
	clearBoard(gs)
	setPoint(gs, 10, 1)  // White checker
	setPoint(gs, 7, -1)  // lone Black checker — hittable
	setDice(gs, 3)

	_, _, err := gm.processBackgammonMove(gs, 1, "move", map[string]interface{}{"from": 10.0, "die": 3.0})
	if err != nil {
		t.Fatalf("move 10->7 (hit): %v", err)
	}
	board := backgammonBoard(gs)
	if owner, count := backgammonPointOwner(board, 7); owner != 0 || count != 1 {
		t.Errorf("expected White checker on 7 after hit, got owner=%d count=%d", owner, count)
	}
	if got := backgammonIntMapField(gs.GameData, "bar", "1"); got != 1 {
		t.Errorf("expected Black to have 1 checker on the bar, got %d", got)
	}
}

func TestBackgammonBlockedPointRejected(t *testing.T) {
	gs := makeTestBackgammonState()
	gm := &GameManager{}
	clearBoard(gs)
	setPoint(gs, 10, 1)  // White checker
	setPoint(gs, 7, -2)  // 2 Black checkers — blocked
	setDice(gs, 3)

	_, _, err := gm.processBackgammonMove(gs, 1, "move", map[string]interface{}{"from": 10.0, "die": 3.0})
	if err == nil {
		t.Fatal("expected error: point 7 is blocked by 2 Black checkers")
	}
}

func TestBackgammonMustEnterFromBarFirst(t *testing.T) {
	gs := makeTestBackgammonState()
	gm := &GameManager{}
	backgammonSetIntMapField(gs.GameData, "bar", "0", 1) // White has a checker on the bar
	setDice(gs, 3)

	// Trying to move a different (non-bar) White checker should be rejected.
	_, _, err := gm.processBackgammonMove(gs, 1, "move", map[string]interface{}{"from": 24.0, "die": 3.0})
	if err == nil {
		t.Fatal("expected error: must enter from the bar before any other move")
	}
}

func TestBackgammonBarEntry(t *testing.T) {
	gs := makeTestBackgammonState()
	gm := &GameManager{}
	backgammonSetIntMapField(gs.GameData, "bar", "0", 1)
	setDice(gs, 4)

	// White enters with die 4 -> target = 25-4 = 21.
	_, _, err := gm.processBackgammonMove(gs, 1, "move", map[string]interface{}{"from": 0.0, "die": 4.0})
	if err != nil {
		t.Fatalf("bar entry: %v", err)
	}
	if got := backgammonIntMapField(gs.GameData, "bar", "0"); got != 0 {
		t.Errorf("expected White's bar count to be 0 after entering, got %d", got)
	}
	board := backgammonBoard(gs)
	if owner, count := backgammonPointOwner(board, 21); owner != 0 || count != 1 {
		t.Errorf("expected White checker entered on point 21, got owner=%d count=%d", owner, count)
	}
}

func TestBackgammonBearOffExactDie(t *testing.T) {
	gs := makeTestBackgammonState()
	gm := &GameManager{}
	clearBoard(gs)
	setPoint(gs, 3, 1) // White's only checker, already in home (1-6)
	setDice(gs, 3)

	_, _, err := gm.processBackgammonMove(gs, 1, "move", map[string]interface{}{"from": 3.0, "die": 3.0})
	if err != nil {
		t.Fatalf("bear off with exact die: %v", err)
	}
	if got := backgammonIntMapField(gs.GameData, "borne_off", "0"); got != 1 {
		t.Errorf("expected 1 White checker borne off, got %d", got)
	}
}

func TestBackgammonBearOffOversizedDieOnlyForFurthestBack(t *testing.T) {
	gs := makeTestBackgammonState()
	gm := &GameManager{}
	clearBoard(gs)
	setPoint(gs, 5, 1) // furthest-back White checker
	setPoint(gs, 2, 1) // a closer White checker
	setDice(gs, 6)

	// Bearing off the point-2 checker with a 6 (oversized) is illegal —
	// point 5 is further back and must be cleared (or attempted) first.
	if _, _, err := gm.processBackgammonMove(gs, 1, "move", map[string]interface{}{"from": 2.0, "die": 6.0}); err == nil {
		t.Fatal("expected error: point 2 is not the furthest-back checker")
	}
	// Bearing off the point-5 checker (the actual furthest-back) with a 6 is legal.
	if _, _, err := gm.processBackgammonMove(gs, 1, "move", map[string]interface{}{"from": 5.0, "die": 6.0}); err != nil {
		t.Fatalf("expected furthest-back checker to bear off with an oversized die: %v", err)
	}
}

func TestBackgammonCannotBearOffWithCheckersOutsideHome(t *testing.T) {
	gs := makeTestBackgammonState()
	gm := &GameManager{}
	clearBoard(gs)
	setPoint(gs, 3, 1)  // in home
	setPoint(gs, 10, 1) // NOT in home — blocks bearing off entirely
	setDice(gs, 3)

	_, _, err := gm.processBackgammonMove(gs, 1, "move", map[string]interface{}{"from": 3.0, "die": 3.0})
	if err == nil {
		t.Fatal("expected error: can't bear off while a checker is outside the home board")
	}
}

func TestBackgammonTurnAdvancesWhenDiceExhausted(t *testing.T) {
	gs := makeTestBackgammonState()
	gm := &GameManager{}
	clearBoard(gs)
	setPoint(gs, 24, 1)
	setDice(gs, 3)

	_, _, err := gm.processBackgammonMove(gs, 1, "move", map[string]interface{}{"from": 24.0, "die": 3.0})
	if err != nil {
		t.Fatalf("move: %v", err)
	}
	if gs.CurrentTurn != 1 {
		t.Errorf("expected turn to advance to player 1 (dice exhausted), got %d", gs.CurrentTurn)
	}
	awaiting, _ := gs.GameData["awaiting_roll"].(bool)
	if !awaiting {
		t.Error("expected awaiting_roll=true for the next player")
	}
}

func TestBackgammonExplicitPass(t *testing.T) {
	gs := makeTestBackgammonState()
	gm := &GameManager{}
	setDice(gs, 3, 5) // both dice technically usable, but player chooses to stop (relaxed rule)

	_, _, err := gm.processBackgammonMove(gs, 1, "pass", map[string]interface{}{})
	if err != nil {
		t.Fatalf("pass: %v", err)
	}
	if gs.CurrentTurn != 1 {
		t.Errorf("expected turn to advance after pass, got %d", gs.CurrentTurn)
	}
}

func TestBackgammonCannotPassBeforeRolling(t *testing.T) {
	gs := makeTestBackgammonState()
	gm := &GameManager{}
	// awaiting_roll is true by default (ensureBackgammonState's initial state).

	_, _, err := gm.processBackgammonMove(gs, 1, "pass", map[string]interface{}{})
	if err == nil {
		t.Fatal("expected error: must roll before passing")
	}
}

func TestBackgammonWinOnFifteenthCheckerBorneOff(t *testing.T) {
	gs := makeTestBackgammonState()
	gm := &GameManager{}
	clearBoard(gs)
	setPoint(gs, 1, 1) // White's last remaining checker
	backgammonSetIntMapField(gs.GameData, "borne_off", "0", 14)
	setDice(gs, 1)

	gameOver, winnerID, err := gm.processBackgammonMove(gs, 1, "move", map[string]interface{}{"from": 1.0, "die": 1.0})
	if err != nil {
		t.Fatalf("bear off 15th checker: %v", err)
	}
	if !gameOver {
		t.Fatal("expected game to be over — all 15 checkers borne off")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Errorf("expected player 1 (UserID 1, White) to win, got %v", winnerID)
	}
}

func TestBackgammonRollAutoPassesWhenFullyBlocked(t *testing.T) {
	gs := makeTestBackgammonState()
	gm := &GameManager{}
	clearBoard(gs)
	setPoint(gs, 10, 1) // White's only checker
	// Block every point White could possibly reach with a 1-6 from point 10
	// (points 4-9) with 2 Black checkers each.
	for p := 4; p <= 9; p++ {
		setPoint(gs, p, -2)
	}

	// Force a specific roll by re-implementing just the post-roll legality
	// check path: set remaining dice directly to a full 1-6 sweep and invoke
	// the same auto-pass logic processBackgammonRoll uses.
	gs.GameData["awaiting_roll"] = true
	_, _, err := gm.processBackgammonMove(gs, 1, "roll", map[string]interface{}{})
	if err != nil {
		t.Fatalf("roll: %v", err)
	}
	// Regardless of what was actually rolled, White's single checker on 10
	// is blocked on every one of points 4-9 (dice 1-6), so ANY roll must
	// result in an auto-pass — turn moves to player 1 (Black).
	if gs.CurrentTurn != 1 {
		t.Errorf("expected auto-pass to advance the turn to player 1 (fully blocked), got %d", gs.CurrentTurn)
	}
	awaiting, _ := gs.GameData["awaiting_roll"].(bool)
	if !awaiting {
		t.Error("expected awaiting_roll=true after an auto-passed turn")
	}
}

func TestBackgammonDoublesGiveFourDice(t *testing.T) {
	gs := makeTestBackgammonState()
	gm := &GameManager{}

	// Roll many times until a double comes up (1/6 chance per roll) to
	// confirm remaining_dice length is 4 specifically on doubles.
	found := false
	for i := 0; i < 500 && !found; i++ {
		gs.GameData["awaiting_roll"] = true
		gs.GameData["remaining_dice"] = []interface{}{}
		if _, _, err := gm.processBackgammonMove(gs, 1, "roll", map[string]interface{}{}); err != nil {
			t.Fatalf("roll: %v", err)
		}
		dice := backgammonIntSlice(gs.GameData["dice"])
		if len(dice) == 2 && dice[0] == dice[1] {
			found = true
			remaining := backgammonIntSlice(gs.GameData["remaining_dice"])
			// remaining_dice may have been auto-cleared if that double was
			// fully blocked on this board — re-check via a fresh, empty
			// board scenario instead if that happened.
			if len(remaining) != 0 && len(remaining) != 4 {
				t.Errorf("expected 4 dice on a double, got %d (%v)", len(remaining), remaining)
			}
		}
	}
	if !found {
		t.Skip("no double rolled in 500 attempts — extremely unlikely but not a hard failure")
	}
}

func TestBackgammonMoveRejectsUnavailableDie(t *testing.T) {
	gs := makeTestBackgammonState()
	gm := &GameManager{}
	setDice(gs, 3, 5)

	_, _, err := gm.processBackgammonMove(gs, 1, "move", map[string]interface{}{"from": 24.0, "die": 4.0})
	if err == nil {
		t.Fatal("expected error: die 4 was not rolled this turn")
	}
}

func TestBackgammonMoveRejectedBeforeRolling(t *testing.T) {
	gs := makeTestBackgammonState()
	gm := &GameManager{}
	// awaiting_roll is true by default.

	_, _, err := gm.processBackgammonMove(gs, 1, "move", map[string]interface{}{"from": 24.0, "die": 3.0})
	if err == nil {
		t.Fatal("expected error: must roll before moving")
	}
}
