package games

import (
	"testing"
	"wewatch-backend/internal/models"
)

func makeTestRampRushState() *GameSessionState {
	players := []models.Player{{UserID: 1}, {UserID: 2}}
	gd := rampRushInitialState()
	return &GameSessionState{
		Players:     players,
		CurrentTurn: 0,
		GameData:    gd,
		GameSession: &models.GameSession{GameType: "ramp_rush"},
	}
}

func TestRampRush_FirstLaunchWaitsForSecond(t *testing.T) {
	gs := makeTestRampRushState()
	gm := &GameManager{}

	gameOver, winnerID, err := gm.processRampRushMove(gs, 1, "launch", map[string]interface{}{
		"cleared": true, "distance": 120.0,
	})
	if err != nil {
		t.Fatalf("launch: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatalf("round shouldn't resolve after only one player has launched, got gameOver=%v winnerID=%v", gameOver, winnerID)
	}
	if gs.CurrentTurn != 1 {
		t.Errorf("expected turn to advance to player index 1, got %d", gs.CurrentTurn)
	}
	rr := rampRushMapField(gs.GameData, "round_results")
	if len(rr) != 1 {
		t.Errorf("expected 1 recorded result, got %d", len(rr))
	}
}

func TestRampRush_RoundResolves_OneClearsOneCrashes(t *testing.T) {
	gs := makeTestRampRushState()
	gm := &GameManager{}

	if _, _, err := gm.processRampRushMove(gs, 1, "launch", map[string]interface{}{"cleared": false, "distance": 40.0}); err != nil {
		t.Fatalf("p1 launch: %v", err)
	}
	gameOver, winnerID, err := gm.processRampRushMove(gs, 2, "launch", map[string]interface{}{"cleared": true, "distance": 30.0})
	if err != nil {
		t.Fatalf("p2 launch: %v", err)
	}
	if gameOver {
		t.Fatalf("match shouldn't be over after round 1 of best_of_5")
	}
	if winnerID != nil {
		t.Fatalf("processRampRushMove only returns a non-nil winner when the whole MATCH ends, not a round — got %v", winnerID)
	}

	scores := rampRushMapField(gs.GameData, "scores")
	if rampRushIntField(scores, "2") != 1 {
		t.Errorf("player 2 (the only one who cleared) should have 1 round win, got %d", rampRushIntField(scores, "2"))
	}
	if rampRushIntField(scores, "1") != 0 {
		t.Errorf("player 1 (crashed) should have 0 round wins, got %d", rampRushIntField(scores, "1"))
	}
	if round := rampRushIntField(gs.GameData, "round"); round != 1 {
		t.Errorf("expected round to advance to 1, got %d", round)
	}
	if len(rampRushMapField(gs.GameData, "round_results")) != 0 {
		t.Errorf("round_results should be cleared after resolution")
	}
	// round_first_player alternated from 0 to 1
	if fp := rampRushIntField(gs.GameData, "round_first_player"); fp != 1 {
		t.Errorf("expected round_first_player to alternate to 1, got %d", fp)
	}
	if gs.CurrentTurn != 1 {
		t.Errorf("expected CurrentTurn to be set to the new round's first player (1), got %d", gs.CurrentTurn)
	}
}

func TestRampRush_RoundResolves_BothClear_FurthestWins(t *testing.T) {
	gs := makeTestRampRushState()
	gm := &GameManager{}

	gm.processRampRushMove(gs, 1, "launch", map[string]interface{}{"cleared": true, "distance": 150.0})
	gm.processRampRushMove(gs, 2, "launch", map[string]interface{}{"cleared": true, "distance": 200.0})

	scores := rampRushMapField(gs.GameData, "scores")
	if rampRushIntField(scores, "2") != 1 {
		t.Errorf("player 2 travelled further and should win the round, got scores=%v", scores)
	}
	if rampRushIntField(scores, "1") != 0 {
		t.Errorf("player 1 should not have scored, got scores=%v", scores)
	}
}

func TestRampRush_RoundResolves_BothCrash_Draw(t *testing.T) {
	gs := makeTestRampRushState()
	gm := &GameManager{}

	gm.processRampRushMove(gs, 1, "launch", map[string]interface{}{"cleared": false, "distance": 10.0})
	gm.processRampRushMove(gs, 2, "launch", map[string]interface{}{"cleared": false, "distance": 90.0})

	scores := rampRushMapField(gs.GameData, "scores")
	if rampRushIntField(scores, "1") != 0 || rampRushIntField(scores, "2") != 0 {
		t.Errorf("neither player cleared — nobody should score this round, got scores=%v", scores)
	}
	if round := rampRushIntField(gs.GameData, "round"); round != 1 {
		t.Errorf("a drawn round should still advance to the next round, got round=%d", round)
	}
}

func TestRampRush_MatchEndsAtRoundsToWin(t *testing.T) {
	gs := makeTestRampRushState()
	gm := &GameManager{}

	// Player 1 wins 3 straight rounds — should end the match after the 3rd.
	for i := 0; i < 3; i++ {
		var gameOver bool
		var winnerID *uint
		var err error
		firstUp := gs.CurrentTurn // whoever's actually up first this round
		var order [2]uint
		if firstUp == 0 {
			order = [2]uint{1, 2}
		} else {
			order = [2]uint{2, 1}
		}
		for _, pid := range order {
			cleared := pid == 1
			dist := 10.0
			if pid == 1 {
				dist = 300.0
			}
			gameOver, winnerID, err = gm.processRampRushMove(gs, pid, "launch", map[string]interface{}{"cleared": cleared, "distance": dist})
			if err != nil {
				t.Fatalf("round %d, player %d: %v", i, pid, err)
			}
		}
		if i < 2 {
			if gameOver {
				t.Fatalf("match should not be over before player 1 reaches 3 round wins (round %d)", i)
			}
		} else {
			if !gameOver {
				t.Fatalf("match should be over after player 1's 3rd round win")
			}
			if winnerID == nil || *winnerID != 1 {
				t.Fatalf("expected player 1 to win the match, got %v", winnerID)
			}
		}
	}
}

func TestRampRush_MatchCapEndsAsDrawOnTiedScores(t *testing.T) {
	gs := makeTestRampRushState()
	gm := &GameManager{}

	// 5 rounds: P1 win, P2 win, draw (both crash), P1 win, P2 win -> 2-2, nobody
	// reaches 3, the 5-round cap should end the match as a draw (nil winner).
	outcomes := []struct {
		p1Cleared, p2Cleared     bool
		p1Distance, p2Distance   float64
	}{
		{true, false, 100, 10},   // p1 wins
		{false, true, 10, 100},   // p2 wins
		{false, false, 10, 10},   // draw
		{true, false, 100, 10},   // p1 wins
		{false, true, 10, 100},   // p2 wins
	}

	var gameOver bool
	var winnerID *uint
	for i, o := range outcomes {
		firstUp := gs.CurrentTurn
		var order [2]uint
		if firstUp == 0 {
			order = [2]uint{1, 2}
		} else {
			order = [2]uint{2, 1}
		}
		for _, pid := range order {
			var cleared bool
			var dist float64
			if pid == 1 {
				cleared, dist = o.p1Cleared, o.p1Distance
			} else {
				cleared, dist = o.p2Cleared, o.p2Distance
			}
			var err error
			gameOver, winnerID, err = gm.processRampRushMove(gs, pid, "launch", map[string]interface{}{"cleared": cleared, "distance": dist})
			if err != nil {
				t.Fatalf("round %d, player %d: %v", i, pid, err)
			}
		}
	}
	if !gameOver {
		t.Fatalf("expected the match to end at the 5-round cap")
	}
	if winnerID != nil {
		t.Fatalf("2-2 after 5 rounds should be a draw (nil winner), got %v", winnerID)
	}
}

func TestRampRush_RequiresExactlyTwoPlayers(t *testing.T) {
	gs := makeTestRampRushState()
	gs.Players = append(gs.Players, models.Player{UserID: 3})
	gm := &GameManager{}

	_, _, err := gm.processRampRushMove(gs, 1, "launch", map[string]interface{}{"cleared": true, "distance": 50.0})
	if err == nil {
		t.Fatalf("expected an error for a 3-player game state")
	}
}

func TestRampRush_DoubleSubmitRejected(t *testing.T) {
	gs := makeTestRampRushState()
	gm := &GameManager{}

	if _, _, err := gm.processRampRushMove(gs, 1, "launch", map[string]interface{}{"cleared": true, "distance": 50.0}); err != nil {
		t.Fatalf("first launch: %v", err)
	}
	_, _, err := gm.processRampRushMove(gs, 1, "launch", map[string]interface{}{"cleared": true, "distance": 60.0})
	if err == nil {
		t.Fatalf("expected an error resubmitting for the same player in the same round")
	}
}

func TestRampRush_UnknownMoveTypeRejected(t *testing.T) {
	gs := makeTestRampRushState()
	gm := &GameManager{}

	_, _, err := gm.processRampRushMove(gs, 1, "steer", map[string]interface{}{})
	if err == nil {
		t.Fatalf("expected an error for an unknown move type")
	}
}
