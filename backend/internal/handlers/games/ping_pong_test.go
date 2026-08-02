package games

import (
	"testing"
	"time"
)

// pingPongTestBallVel reads the first ball's velocity out of the "balls"
// array — the tests below deal with a single ball, but the wire shape is
// always an array (see pingPongBall's doc comment for why).
func pingPongTestBallVel(t *testing.T, gs *GameSessionState) (vx, vy float64) {
	t.Helper()
	balls, ok := gs.GameData["balls"].([]interface{})
	if !ok || len(balls) == 0 {
		t.Fatalf("expected a non-empty balls array, got %v", gs.GameData["balls"])
	}
	b, ok := balls[0].(map[string]interface{})
	if !ok {
		t.Fatalf("expected balls[0] to be a map, got %T", balls[0])
	}
	vx, _ = b["vx"].(float64)
	vy, _ = b["vy"].(float64)
	return vx, vy
}

// Note: new_games_test.go has an older TestPingPong_* suite testing a
// completely different aim/block/defend design that doesn't match the real
// canvas-physics implementation in ping_pong.go at all (processPingPongMove
// only ever handles state_sync/paddle_move/goal/serve/rt_end) — those tests
// are pre-existing, already-known-broken, and out of scope here. This file
// tests the actual implementation, using distinct names to avoid any
// collision with that stale suite.

func TestPingPongInitialStateStartsInServing(t *testing.T) {
	gs := makeGS("ping_pong", 1, 2)
	for k, v := range pingPongInitialState(gs.Players) {
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
	vx, vy := pingPongTestBallVel(t, gs)
	if vx != 0 || vy != 0 {
		t.Errorf("expected the ball to start stationary (waiting for a tap-serve), got vx=%v vy=%v", vx, vy)
	}
}

// TestPingPongGoalEntersServingNotImmediatePlay is the regression test for
// the actual bug: a non-winning goal used to immediately re-serve a moving
// ball with zero pause, racing against the scoring client's own optimistic
// local reset. Now it must land in a real "serving" phase with the ball
// stationary until an explicit serve.
func TestPingPongGoalEntersServingNotImmediatePlay(t *testing.T) {
	gs := makeGS("ping_pong", 1, 2)
	gm := &GameManager{}
	for k, v := range pingPongInitialState(gs.Players) {
		gs.GameData[k] = v
	}

	gameOver, winnerID, err := gm.processPingPongMove(gs, 1, map[string]interface{}{
		"move_type": "goal", "scorer_id": "2",
	})
	if err != nil {
		t.Fatalf("goal: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatalf("expected the game to continue after a single goal (win_score=7), got gameOver=%v winnerID=%v", gameOver, winnerID)
	}
	phase, _ := gs.GameData["phase"].(string)
	if phase != "serving" {
		t.Errorf("expected phase=serving after a non-winning goal, got %q", phase)
	}
	serveBy, _ := gs.GameData["serve_by"].(string)
	if serveBy != "2" {
		t.Errorf("expected the scorer (player 2) to get serve, got %q", serveBy)
	}
	vx, vy := pingPongTestBallVel(t, gs)
	if vx != 0 || vy != 0 {
		t.Errorf("expected the ball frozen after a goal, got vx=%v vy=%v", vx, vy)
	}
	scores := gs.GameData["scores"].(map[string]interface{})
	if ppIntFrom(scores["2"]) != 1 {
		t.Errorf("expected player 2's score to be 1, got %v", scores["2"])
	}
}

func TestPingPongServeRejectedWhenNotServingPhase(t *testing.T) {
	gs := makeGS("ping_pong", 1, 2)
	gm := &GameManager{}
	for k, v := range pingPongInitialState(gs.Players) {
		gs.GameData[k] = v
	}
	// Serve once to leave the serving phase.
	if _, _, err := gm.processPingPongMove(gs, 1, map[string]interface{}{"move_type": "serve"}); err != nil {
		t.Fatalf("first serve: %v", err)
	}
	// A second serve attempt should now be rejected — not awaiting one.
	if _, _, err := gm.processPingPongMove(gs, 1, map[string]interface{}{"move_type": "serve"}); err == nil {
		t.Error("expected an error serving while the rally is already in progress")
	}
}

func TestPingPongServeRejectedOutOfTurn(t *testing.T) {
	gs := makeGS("ping_pong", 1, 2)
	gm := &GameManager{}
	for k, v := range pingPongInitialState(gs.Players) {
		gs.GameData[k] = v
	}
	// serve_by defaults to player 1 — player 2 trying to serve should fail.
	if _, _, err := gm.processPingPongMove(gs, 2, map[string]interface{}{"move_type": "serve"}); err == nil {
		t.Error("expected an error when the wrong player tries to serve")
	}
}

func TestPingPongServeLaunchesBallTowardCorrectSide(t *testing.T) {
	gs := makeGS("ping_pong", 1, 2)
	gm := &GameManager{}
	for k, v := range pingPongInitialState(gs.Players) {
		gs.GameData[k] = v
	}

	if _, _, err := gm.processPingPongMove(gs, 1, map[string]interface{}{"move_type": "serve"}); err != nil {
		t.Fatalf("serve: %v", err)
	}
	phase, _ := gs.GameData["phase"].(string)
	if phase != "playing" {
		t.Fatalf("expected phase=playing after a serve, got %q", phase)
	}
	_, vy := pingPongTestBallVel(t, gs)
	if vy >= 0 {
		t.Errorf("expected player 1's serve to head upward (negative vy) toward their own side, got %v", vy)
	}
}

func TestPingPongServeAfterGoalUsesScorersSide(t *testing.T) {
	gs := makeGS("ping_pong", 1, 2)
	gm := &GameManager{}
	for k, v := range pingPongInitialState(gs.Players) {
		gs.GameData[k] = v
	}
	if _, _, err := gm.processPingPongMove(gs, 1, map[string]interface{}{"move_type": "goal", "scorer_id": "2"}); err != nil {
		t.Fatalf("goal: %v", err)
	}
	// Player 2 now has serve.
	if _, _, err := gm.processPingPongMove(gs, 1, map[string]interface{}{"move_type": "serve"}); err == nil {
		t.Fatal("expected player 1 to be rejected — it's player 2's serve after they scored")
	}
	if _, _, err := gm.processPingPongMove(gs, 2, map[string]interface{}{"move_type": "serve"}); err != nil {
		t.Fatalf("player 2 serve: %v", err)
	}
	_, vy := pingPongTestBallVel(t, gs)
	if vy <= 0 {
		t.Errorf("expected player 2's serve to head downward (positive vy) toward their own side, got %v", vy)
	}
}

// TestPingPongStateSyncRelaysBallsArray confirms state_sync accepts and
// stores the new balls[] shape (a pass-through relay — the backend never
// validates ball physics itself, matching every other volatile real-time
// field like p1x/p2x).
func TestPingPongStateSyncRelaysBallsArray(t *testing.T) {
	gs := makeGS("ping_pong", 1, 2)
	gm := &GameManager{}
	for k, v := range pingPongInitialState(gs.Players) {
		gs.GameData[k] = v
	}

	newBalls := []interface{}{
		map[string]interface{}{"id": float64(0), "x": 123.0, "y": 456.0, "vx": 10.0, "vy": -20.0},
	}
	if _, _, err := gm.processPingPongMove(gs, 1, map[string]interface{}{
		"move_type": "state_sync", "balls": newBalls, "p1x": 200.0,
	}); err != nil {
		t.Fatalf("state_sync: %v", err)
	}
	vx, vy := pingPongTestBallVel(t, gs)
	if vx != 10.0 || vy != -20.0 {
		t.Errorf("expected the relayed ball velocity to be stored verbatim, got vx=%v vy=%v", vx, vy)
	}
	p1x, _ := gs.GameData["p1x"].(float64)
	if p1x != 200.0 {
		t.Errorf("expected p1x=200, got %v", p1x)
	}
}

// ---- pickups / power-up effects -------------------------------------------------

func pingPongTestPickup(id, effectType string) []interface{} {
	return []interface{}{
		map[string]interface{}{"id": id, "type": effectType, "x": 100.0, "y": 300.0},
	}
}

func TestPingPongGrabPickupAppliesEffect(t *testing.T) {
	gs := makeGS("ping_pong", 1, 2)
	gm := &GameManager{}
	for k, v := range pingPongInitialState(gs.Players) {
		gs.GameData[k] = v
	}
	gs.GameData["pickups"] = pingPongTestPickup("p1", "freeze")

	before := time.Now().UnixMilli()
	if _, _, err := gm.processPingPongMove(gs, 1, map[string]interface{}{
		"move_type": "grab_pickup", "pickup_id": "p1", "effect_type": "freeze", "target_player": "2",
	}); err != nil {
		t.Fatalf("grab_pickup: %v", err)
	}

	effect, ok := gs.GameData["active_effect"].(map[string]interface{})
	if !ok {
		t.Fatal("expected active_effect to be set")
	}
	if effect["type"] != "freeze" {
		t.Errorf("expected type=freeze, got %v", effect["type"])
	}
	if effect["target_player"] != "2" {
		t.Errorf("expected target_player=2, got %v", effect["target_player"])
	}
	expiresAt, _ := effect["expires_at"].(float64)
	if int64(expiresAt) < before+pingPongFreezeDurationMs {
		t.Errorf("expected expires_at at least %dms out, got %v", pingPongFreezeDurationMs, expiresAt)
	}

	pickups, _ := gs.GameData["pickups"].([]interface{})
	if len(pickups) != 0 {
		t.Errorf("expected the claimed pickup removed from the table, got %d remaining", len(pickups))
	}
}

func TestPingPongGrabPickupRejectsAlreadyClaimed(t *testing.T) {
	gs := makeGS("ping_pong", 1, 2)
	gm := &GameManager{}
	for k, v := range pingPongInitialState(gs.Players) {
		gs.GameData[k] = v
	}
	gs.GameData["pickups"] = pingPongTestPickup("p1", "slow")

	if _, _, err := gm.processPingPongMove(gs, 1, map[string]interface{}{
		"move_type": "grab_pickup", "pickup_id": "p1", "effect_type": "slow", "target_player": "2",
	}); err != nil {
		t.Fatalf("first grab: %v", err)
	}
	// A duplicate/stale report for the same (now-gone) pickup must be rejected,
	// not double-applied or re-extend the duration.
	if _, _, err := gm.processPingPongMove(gs, 1, map[string]interface{}{
		"move_type": "grab_pickup", "pickup_id": "p1", "effect_type": "slow", "target_player": "2",
	}); err == nil {
		t.Error("expected an error re-claiming an already-claimed pickup")
	}
}

func TestPingPongGrabPickupRejectsUnknownEffectType(t *testing.T) {
	gs := makeGS("ping_pong", 1, 2)
	gm := &GameManager{}
	for k, v := range pingPongInitialState(gs.Players) {
		gs.GameData[k] = v
	}
	gs.GameData["pickups"] = pingPongTestPickup("p1", "bogus")

	if _, _, err := gm.processPingPongMove(gs, 1, map[string]interface{}{
		"move_type": "grab_pickup", "pickup_id": "p1", "effect_type": "bogus", "target_player": "2",
	}); err == nil {
		t.Error("expected an error for an unrecognized effect type")
	}
}

// TestPingPongNewPickupReplacesActiveEffect is the regression test for your
// stated reset rule: grabbing a new power overwrites whatever was active,
// regardless of who it targets or whether the old one had already expired.
func TestPingPongNewPickupReplacesActiveEffect(t *testing.T) {
	gs := makeGS("ping_pong", 1, 2)
	gm := &GameManager{}
	for k, v := range pingPongInitialState(gs.Players) {
		gs.GameData[k] = v
	}
	gs.GameData["pickups"] = []interface{}{
		map[string]interface{}{"id": "p1", "type": "freeze", "x": 100.0, "y": 300.0},
		map[string]interface{}{"id": "p2", "type": "invisible", "x": 200.0, "y": 300.0},
	}

	if _, _, err := gm.processPingPongMove(gs, 1, map[string]interface{}{
		"move_type": "grab_pickup", "pickup_id": "p1", "effect_type": "freeze", "target_player": "2",
	}); err != nil {
		t.Fatalf("first grab: %v", err)
	}
	if _, _, err := gm.processPingPongMove(gs, 2, map[string]interface{}{
		"move_type": "grab_pickup", "pickup_id": "p2", "effect_type": "invisible", "target_player": "1",
	}); err != nil {
		t.Fatalf("second grab: %v", err)
	}

	effect := gs.GameData["active_effect"].(map[string]interface{})
	if effect["type"] != "invisible" || effect["target_player"] != "1" {
		t.Errorf("expected the second grab to fully replace the first, got %v", effect)
	}
}

// TestPingPongGoalClearsPickupsAndEffect confirms the other half of the reset
// rule — scoring wipes the table and cancels any active effect, even if it
// hadn't naturally expired yet.
func TestPingPongGoalClearsPickupsAndEffect(t *testing.T) {
	gs := makeGS("ping_pong", 1, 2)
	gm := &GameManager{}
	for k, v := range pingPongInitialState(gs.Players) {
		gs.GameData[k] = v
	}
	gs.GameData["pickups"] = pingPongTestPickup("p1", "slow")
	gs.GameData["active_effect"] = map[string]interface{}{
		"type": "freeze", "target_player": "2", "expires_at": float64(time.Now().UnixMilli() + 100000),
	}

	if _, _, err := gm.processPingPongMove(gs, 1, map[string]interface{}{
		"move_type": "goal", "scorer_id": "1",
	}); err != nil {
		t.Fatalf("goal: %v", err)
	}

	if gs.GameData["active_effect"] != nil {
		t.Errorf("expected active_effect cleared after a goal, got %v", gs.GameData["active_effect"])
	}
	pickups, _ := gs.GameData["pickups"].([]interface{})
	if len(pickups) != 0 {
		t.Errorf("expected pickups cleared after a goal, got %d remaining", len(pickups))
	}
}

func TestPingPongStateSyncRelaysPickups(t *testing.T) {
	gs := makeGS("ping_pong", 1, 2)
	gm := &GameManager{}
	for k, v := range pingPongInitialState(gs.Players) {
		gs.GameData[k] = v
	}
	newPickups := pingPongTestPickup("p9", "invisible")
	if _, _, err := gm.processPingPongMove(gs, 1, map[string]interface{}{
		"move_type": "state_sync", "balls": []interface{}{}, "pickups": newPickups,
	}); err != nil {
		t.Fatalf("state_sync: %v", err)
	}
	pickups, ok := gs.GameData["pickups"].([]interface{})
	if !ok || len(pickups) != 1 {
		t.Fatalf("expected the relayed pickups list stored verbatim, got %v", gs.GameData["pickups"])
	}
}

func TestPingPongWinningGoalStillEndsGame(t *testing.T) {
	gs := makeGS("ping_pong", 1, 2)
	gm := &GameManager{}
	for k, v := range pingPongInitialState(gs.Players) {
		gs.GameData[k] = v
	}
	gs.GameData["win_score"] = 1 // win on the very next goal, to keep the test short

	gameOver, winnerID, err := gm.processPingPongMove(gs, 1, map[string]interface{}{
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
