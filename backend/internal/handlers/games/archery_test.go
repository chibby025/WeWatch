package games

import (
	"testing"

	"wewatch-backend/internal/models"
)

func makeTestArcheryState(userIDs ...uint) *GameSessionState {
	var players []models.Player
	for i, id := range userIDs {
		players = append(players, models.Player{UserID: id, Username: "p", Position: i})
	}
	return &GameSessionState{
		GameSession: &models.GameSession{GameType: "archery"},
		Players:     players,
		CurrentTurn: 0,
		GameData:    map[string]interface{}{},
	}
}

func TestArcheryScoreAtRealTargetFace(t *testing.T) {
	cases := []struct {
		x, y  float64
		score int
	}{
		{0, 0, 10},    // dead center
		{0.05, 0, 10}, // still inside the innermost 1/10th-radius ring
		{0.15, 0, 9},  // second ring
		{0.95, 0, 1},  // outermost ring, just inside the edge
		{1.5, 0, 0},   // clean miss, well outside the target
		{1.01, 0, 0},  // just barely outside — should be a miss, not ring 1
		{0, 0.5, 6},   // ring 5 band -> 11-5=6, purely vertical offset
	}
	for _, c := range cases {
		got := archeryScoreAt(c.x, c.y)
		if got != c.score {
			t.Errorf("archeryScoreAt(%v, %v) = %d, want %d", c.x, c.y, got, c.score)
		}
	}
}

func TestArcheryAllTenRingsAreReachable(t *testing.T) {
	seen := map[int]bool{}
	for r := 0.0; r <= 1.0; r += 0.001 {
		seen[archeryScoreAt(r, 0)] = true
	}
	for want := 1; want <= 10; want++ {
		if !seen[want] {
			t.Errorf("ring worth %d points was never reachable by any radius in [0,1]", want)
		}
	}
}

func TestArcheryWobbleShrinksWithPower(t *testing.T) {
	var maxLowPower, maxHighPower float64
	for i := 0; i < 500; i++ {
		dx, dy := archeryWobble(0.1)
		if m := dx*dx + dy*dy; m > maxLowPower {
			maxLowPower = m
		}
		dx2, dy2 := archeryWobble(0.95)
		if m := dx2*dx2 + dy2*dy2; m > maxHighPower {
			maxHighPower = m
		}
	}
	if maxHighPower >= maxLowPower {
		t.Errorf("expected high-power wobble magnitude (%v) to stay well below low-power wobble magnitude (%v)", maxHighPower, maxLowPower)
	}
}

func TestArcheryRollWindStaysInRange(t *testing.T) {
	for i := 0; i < 1000; i++ {
		w := archeryRollWind()
		if w < -1 || w > 1 {
			t.Fatalf("archeryRollWind produced out-of-range value: %v", w)
		}
	}
}

func TestArcheryRejectsUnknownMoveType(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestArcheryState(1, 2)
	_, _, err := gm.processArcheryMove(gs, 1, "fire", map[string]interface{}{"aim_x": 0.0, "aim_y": 0.0, "power": 0.9})
	if err == nil {
		t.Fatal("expected an error for an unknown move type")
	}
}

func TestArcheryRejectsMissingPower(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestArcheryState(1, 2)
	_, _, err := gm.processArcheryMove(gs, 1, "shoot", map[string]interface{}{"aim_x": 0.0, "aim_y": 0.0})
	if err == nil {
		t.Fatal("expected an error for missing power")
	}
}

// Mirrors darts_test.go's own established convention: processArcheryMove's
// decrement trick (for arrows 1-2 of a turn) only cancels out the generic
// "+1 mod N" advance the REAL ProcessMove wrapper applies after every
// successful move — calling processArcheryMove directly, in isolation,
// bypasses that wrapper entirely, so tests must apply the same "+1 mod N"
// manually after each call to see the same net effect a real move would.
func TestArcheryFirstTwoArrowsStayOnSamePlayer(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestArcheryState(1, 2)
	if _, _, err := gm.processArcheryMove(gs, 1, "shoot", map[string]interface{}{"aim_x": 0.0, "aim_y": 0.0, "power": 1.0}); err != nil {
		t.Fatalf("unexpected error on arrow 1: %v", err)
	}
	gs.CurrentTurn = (gs.CurrentTurn + 1) % len(gs.Players)
	if gs.CurrentTurn != 0 {
		t.Fatalf("expected turn to stay with player 1 after arrow 1, got CurrentTurn=%d", gs.CurrentTurn)
	}
	if _, _, err := gm.processArcheryMove(gs, 1, "shoot", map[string]interface{}{"aim_x": 0.0, "aim_y": 0.0, "power": 1.0}); err != nil {
		t.Fatalf("unexpected error on arrow 2: %v", err)
	}
	gs.CurrentTurn = (gs.CurrentTurn + 1) % len(gs.Players)
	if gs.CurrentTurn != 0 {
		t.Fatalf("expected turn to still stay with player 1 after arrow 2, got CurrentTurn=%d", gs.CurrentTurn)
	}
	arrows, _ := gs.GameData["arrows_this_turn"].(float64)
	if arrows != 2 {
		t.Errorf("expected arrows_this_turn=2, got %v", arrows)
	}
}

func TestArcheryThirdArrowPassesTurn(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestArcheryState(1, 2)
	for i := 0; i < 3; i++ {
		if _, _, err := gm.processArcheryMove(gs, 1, "shoot", map[string]interface{}{"aim_x": 0.0, "aim_y": 0.0, "power": 1.0}); err != nil {
			t.Fatalf("unexpected error on arrow %d: %v", i+1, err)
		}
		gs.CurrentTurn = (gs.CurrentTurn + 1) % len(gs.Players)
	}
	if gs.CurrentTurn != 1 {
		t.Fatalf("expected turn to pass to player 2 (index 1) after 3 arrows, got %d", gs.CurrentTurn)
	}
	arrows, _ := gs.GameData["arrows_this_turn"].(float64)
	if arrows != 0 {
		t.Errorf("expected arrows_this_turn to reset to 0 for the new shooter, got %v", arrows)
	}
	currentShots, _ := gs.GameData["current_shots"].([]interface{})
	if len(currentShots) != 0 {
		t.Errorf("expected current_shots to clear for the new shooter, got %d entries", len(currentShots))
	}
}

func TestArcheryWindAppliedToLandingPoint(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestArcheryState(1, 2)
	// Force a known wind and a perfect-power shot (zero wobble magnitude is
	// impossible to force deterministically since archeryWobble is random,
	// but power=1.0's maxWobble is only 0.02 — small enough that the wind's
	// own 0.22-magnitude push at wind=1.0 is unambiguously the dominant
	// factor in whether the shot lands right of center).
	gs.GameData["scores"] = map[string]interface{}{"1": float64(0), "2": float64(0)}
	gs.GameData["current_round"] = float64(1)
	gs.GameData["arrows_this_turn"] = float64(0)
	gs.GameData["current_shots"] = []interface{}{}
	gs.GameData["last_shot"] = map[string]interface{}{}
	gs.GameData["wind"] = 1.0 // maximum rightward push
	if _, _, err := gm.processArcheryMove(gs, 1, "shoot", map[string]interface{}{"aim_x": 0.0, "aim_y": 0.0, "power": 1.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	lastShot, _ := gs.GameData["last_shot"].(map[string]interface{})
	landX, _ := lastShot["x"].(float64)
	if landX <= 0.1 {
		t.Errorf("expected a strong rightward wind to push the landing point clearly right of center, got x=%v", landX)
	}
}

func TestArcheryFullThreeRoundGameDeclaresHigherScoreWinner(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestArcheryState(1, 2)
	// ensureArcheryState only runs its own real initialization (including a
	// real random wind roll) on the very first move ever made — calling it
	// explicitly here first means the loop's own `wind = 0.0` pin below
	// actually sticks from the very first throw onward, instead of being
	// silently clobbered by ensureArcheryState's real init on throw #1 only
	// (a real gap this exact test caught: throw #1 landed off-center from a
	// genuine random wind value despite this test's own pin already having
	// run moments before — ensureArcheryState is only a no-op once `scores`
	// is already non-nil, which it isn't yet on the very first call).
	ensureArcheryState(gs)
	// Neutralize wind for a clean, predictable score comparison.
	var gameOver bool
	var winnerID *uint
	var err error
	for round := 0; round < archeryRounds; round++ {
		gs.GameData["wind"] = 0.0 // re-pin to zero each round (processArcheryMove re-rolls it at round-end)
		for arrow := 0; arrow < archeryArrowsPerTurn; arrow++ {
			// Player 1 always aims dead center with full power -> real bullseyes.
			gameOver, winnerID, err = gm.processArcheryMove(gs, 1, "shoot", map[string]interface{}{"aim_x": 0.0, "aim_y": 0.0, "power": 1.0})
			if err != nil {
				t.Fatalf("round %d arrow %d (p1): unexpected error: %v", round, arrow, err)
			}
			// Mirrors the real ProcessMove wrapper: the generic "+1 mod N"
			// advance only runs when the move didn't already end the game.
			if !gameOver {
				gs.CurrentTurn = (gs.CurrentTurn + 1) % len(gs.Players)
			}
		}
		for arrow := 0; arrow < archeryArrowsPerTurn; arrow++ {
			// Player 2 always aims at the very edge of the target -> low score.
			gameOver, winnerID, err = gm.processArcheryMove(gs, 2, "shoot", map[string]interface{}{"aim_x": 0.99, "aim_y": 0.0, "power": 1.0})
			if err != nil {
				t.Fatalf("round %d arrow %d (p2): unexpected error: %v", round, arrow, err)
			}
			if !gameOver {
				gs.CurrentTurn = (gs.CurrentTurn + 1) % len(gs.Players)
			}
		}
	}
	if !gameOver {
		t.Fatal("expected the game to end after 3 full rounds")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Fatalf("expected player 1 (consistently aiming for bullseyes) to win, got winnerID=%v", winnerID)
	}
}

func TestArcheryTiedScoreIsADraw(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestArcheryState(1, 2)
	// See TestArcheryFullThreeRoundGameDeclaresHigherScoreWinner's own
	// comment on this exact same call — without it, this test was flaky
	// (roughly 1 in 6 runs), since ensureArcheryState's real first-ever-move
	// initialization silently overwrote this loop's own `wind = 0.0` pin on
	// throw #1 only, occasionally landing one of the two players an
	// off-center shot from genuine random wind and breaking the tie.
	ensureArcheryState(gs)
	for round := 0; round < archeryRounds; round++ {
		gs.GameData["wind"] = 0.0
		var gameOver bool
		var winnerID *uint
		var err error
		for arrow := 0; arrow < archeryArrowsPerTurn; arrow++ {
			gameOver, winnerID, err = gm.processArcheryMove(gs, 1, "shoot", map[string]interface{}{"aim_x": 0.0, "aim_y": 0.0, "power": 1.0})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !gameOver {
				gs.CurrentTurn = (gs.CurrentTurn + 1) % len(gs.Players)
			}
		}
		for arrow := 0; arrow < archeryArrowsPerTurn; arrow++ {
			gameOver, winnerID, err = gm.processArcheryMove(gs, 2, "shoot", map[string]interface{}{"aim_x": 0.0, "aim_y": 0.0, "power": 1.0})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !gameOver {
				gs.CurrentTurn = (gs.CurrentTurn + 1) % len(gs.Players)
			}
			if round == archeryRounds-1 && arrow == archeryArrowsPerTurn-1 {
				if !gameOver {
					t.Fatal("expected the game to end after the final arrow of the final round")
				}
				if winnerID != nil {
					t.Fatalf("expected a tie (both players landed identical bullseyes every arrow) to be reported as a draw (nil winner), got %v", *winnerID)
				}
			}
		}
	}
}
