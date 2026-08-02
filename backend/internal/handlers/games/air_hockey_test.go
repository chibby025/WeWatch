package games

import "testing"

// Note: new_games_test.go has an older TestAirHockey_* suite testing a
// completely different aim/block/defend design that doesn't match the real
// canvas-physics implementation in air_hockey.go at all (processAirHockeyMove
// only ever handles state_sync/mallet_move/goal/serve/rt_end) — same
// pre-existing, already-known-broken situation as ping_pong_test.go's
// TestPingPong_* note, and out of scope here. This file tests the actual
// implementation, using distinct names to avoid any collision with that
// stale suite.

// airHockeyTestPuckVel reads the flat ball_vx/ball_vy fields — unlike
// ping_pong's balls[] array, air_hockey never needed a multi-puck story, so
// it kept the original flat wire shape (see the comment on
// airHockeyGoalHandler for why the two games' handlers aren't shared).
func airHockeyTestPuckVel(t *testing.T, gs *GameSessionState) (vx, vy float64) {
	t.Helper()
	vx, _ = gs.GameData["ball_vx"].(float64)
	vy, _ = gs.GameData["ball_vy"].(float64)
	return vx, vy
}

func TestAirHockeyInitialStateStartsInServing(t *testing.T) {
	gs := makeGS("air_hockey", 1, 2)
	for k, v := range airHockeyInitialState(gs.Players) {
		gs.GameData[k] = v
	}

	phase, _ := gs.GameData["phase"].(string)
	if phase != "serving" {
		t.Fatalf("expected the game to start in serving phase, got %q", phase)
	}
	serveBy, _ := gs.GameData["serve_by"].(string)
	if serveBy != "1" {
		t.Errorf("expected player 1 to serve first, got %q", serveBy)
	}
	vx, vy := airHockeyTestPuckVel(t, gs)
	if vx != 0 || vy != 0 {
		t.Errorf("expected the puck to start stationary (waiting for a tap-serve), got vx=%v vy=%v", vx, vy)
	}
}

// TestAirHockeyGoalEntersServingNotImmediatePlay is the regression test for
// the same class of bug ping_pong had: a non-winning goal used to
// immediately re-serve a moving puck with zero pause, racing against the
// scoring client's own optimistic local reset (AirHockeyGame.jsx's old
// `awaitingGoal` pattern). Now it must land in a real "serving" phase with
// the puck stationary until an explicit serve.
func TestAirHockeyGoalEntersServingNotImmediatePlay(t *testing.T) {
	gs := makeGS("air_hockey", 1, 2)
	gm := &GameManager{}
	for k, v := range airHockeyInitialState(gs.Players) {
		gs.GameData[k] = v
	}

	gameOver, winnerID, err := gm.processAirHockeyMove(gs, 1, map[string]interface{}{
		"move_type": "goal", "scorer_id": "2",
	})
	if err != nil {
		t.Fatalf("goal: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatalf("expected the game to continue after a single goal (win_score=5), got gameOver=%v winnerID=%v", gameOver, winnerID)
	}
	phase, _ := gs.GameData["phase"].(string)
	if phase != "serving" {
		t.Errorf("expected phase=serving after a non-winning goal, got %q", phase)
	}
	serveBy, _ := gs.GameData["serve_by"].(string)
	if serveBy != "2" {
		t.Errorf("expected the scorer (player 2) to get serve, got %q", serveBy)
	}
	vx, vy := airHockeyTestPuckVel(t, gs)
	if vx != 0 || vy != 0 {
		t.Errorf("expected the puck frozen after a goal, got vx=%v vy=%v", vx, vy)
	}
	scores := gs.GameData["scores"].(map[string]interface{})
	if ppIntFrom(scores["2"]) != 1 {
		t.Errorf("expected player 2's score to be 1, got %v", scores["2"])
	}
}

func TestAirHockeyServeRejectedWhenNotServingPhase(t *testing.T) {
	gs := makeGS("air_hockey", 1, 2)
	gm := &GameManager{}
	for k, v := range airHockeyInitialState(gs.Players) {
		gs.GameData[k] = v
	}
	// Serve once to leave the serving phase.
	if _, _, err := gm.processAirHockeyMove(gs, 1, map[string]interface{}{"move_type": "serve"}); err != nil {
		t.Fatalf("first serve: %v", err)
	}
	// A second serve attempt should now be rejected — not awaiting one.
	if _, _, err := gm.processAirHockeyMove(gs, 1, map[string]interface{}{"move_type": "serve"}); err == nil {
		t.Error("expected an error serving while the rally is already in progress")
	}
}

func TestAirHockeyServeRejectedOutOfTurn(t *testing.T) {
	gs := makeGS("air_hockey", 1, 2)
	gm := &GameManager{}
	for k, v := range airHockeyInitialState(gs.Players) {
		gs.GameData[k] = v
	}
	// serve_by defaults to player 1 — player 2 trying to serve should fail.
	if _, _, err := gm.processAirHockeyMove(gs, 2, map[string]interface{}{"move_type": "serve"}); err == nil {
		t.Error("expected an error when the wrong player tries to serve")
	}
}

func TestAirHockeyServeLaunchesPuckTowardCorrectSide(t *testing.T) {
	gs := makeGS("air_hockey", 1, 2)
	gm := &GameManager{}
	for k, v := range airHockeyInitialState(gs.Players) {
		gs.GameData[k] = v
	}

	if _, _, err := gm.processAirHockeyMove(gs, 1, map[string]interface{}{"move_type": "serve"}); err != nil {
		t.Fatalf("serve: %v", err)
	}
	phase, _ := gs.GameData["phase"].(string)
	if phase != "playing" {
		t.Fatalf("expected phase=playing after a serve, got %q", phase)
	}
	_, vy := airHockeyTestPuckVel(t, gs)
	if vy >= 0 {
		t.Errorf("expected player 1's serve to head upward (negative vy) toward their own side, got %v", vy)
	}
}

func TestAirHockeyServeAfterGoalUsesScorersSide(t *testing.T) {
	gs := makeGS("air_hockey", 1, 2)
	gm := &GameManager{}
	for k, v := range airHockeyInitialState(gs.Players) {
		gs.GameData[k] = v
	}
	if _, _, err := gm.processAirHockeyMove(gs, 1, map[string]interface{}{"move_type": "goal", "scorer_id": "2"}); err != nil {
		t.Fatalf("goal: %v", err)
	}
	// Player 2 now has serve.
	if _, _, err := gm.processAirHockeyMove(gs, 1, map[string]interface{}{"move_type": "serve"}); err == nil {
		t.Fatal("expected player 1 to be rejected — it's player 2's serve after they scored")
	}
	if _, _, err := gm.processAirHockeyMove(gs, 2, map[string]interface{}{"move_type": "serve"}); err != nil {
		t.Fatalf("player 2 serve: %v", err)
	}
	_, vy := airHockeyTestPuckVel(t, gs)
	if vy <= 0 {
		t.Errorf("expected player 2's serve to head downward (positive vy) toward their own side, got %v", vy)
	}
}

// TestAirHockeyStateSyncRelaysPuckAndMallet confirms state_sync accepts and
// stores the flat ball_x/y/vx/vy + p1x/p1y fields — a pass-through relay,
// same trust model as every other volatile real-time field in this package.
func TestAirHockeyStateSyncRelaysPuckAndMallet(t *testing.T) {
	gs := makeGS("air_hockey", 1, 2)
	gm := &GameManager{}
	for k, v := range airHockeyInitialState(gs.Players) {
		gs.GameData[k] = v
	}

	if _, _, err := gm.processAirHockeyMove(gs, 1, map[string]interface{}{
		"move_type": "state_sync",
		"ball_x":    123.0, "ball_y": 456.0, "ball_vx": 10.0, "ball_vy": -20.0,
		"p1x": 200.0, "p1y": 88.0,
	}); err != nil {
		t.Fatalf("state_sync: %v", err)
	}
	vx, vy := airHockeyTestPuckVel(t, gs)
	if vx != 10.0 || vy != -20.0 {
		t.Errorf("expected the relayed puck velocity to be stored verbatim, got vx=%v vy=%v", vx, vy)
	}
	p1x, _ := gs.GameData["p1x"].(float64)
	p1y, _ := gs.GameData["p1y"].(float64)
	if p1x != 200.0 || p1y != 88.0 {
		t.Errorf("expected p1x=200 p1y=88, got p1x=%v p1y=%v", p1x, p1y)
	}
}

func TestAirHockeyMalletMoveRelaysP2Position(t *testing.T) {
	gs := makeGS("air_hockey", 1, 2)
	gm := &GameManager{}
	for k, v := range airHockeyInitialState(gs.Players) {
		gs.GameData[k] = v
	}
	if _, _, err := gm.processAirHockeyMove(gs, 2, map[string]interface{}{
		"move_type": "mallet_move", "p2x": 150.0, "p2y": 520.0,
	}); err != nil {
		t.Fatalf("mallet_move: %v", err)
	}
	p2x, _ := gs.GameData["p2x"].(float64)
	p2y, _ := gs.GameData["p2y"].(float64)
	if p2x != 150.0 || p2y != 520.0 {
		t.Errorf("expected p2x=150 p2y=520, got p2x=%v p2y=%v", p2x, p2y)
	}
}

func TestAirHockeyWinningGoalStillEndsGame(t *testing.T) {
	gs := makeGS("air_hockey", 1, 2)
	gm := &GameManager{}
	for k, v := range airHockeyInitialState(gs.Players) {
		gs.GameData[k] = v
	}
	gs.GameData["win_score"] = 1 // win on the very next goal, to keep the test short

	gameOver, winnerID, err := gm.processAirHockeyMove(gs, 1, map[string]interface{}{
		"move_type": "goal", "scorer_id": "1",
	})
	if err != nil {
		t.Fatalf("goal: %v", err)
	}
	if !gameOver {
		t.Fatal("expected the game to end once win_score is reached")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Errorf("expected player 1 to win, got %v", winnerID)
	}
	phase, _ := gs.GameData["phase"].(string)
	if phase != "ended" {
		t.Errorf("expected phase=ended, got %q", phase)
	}
}
