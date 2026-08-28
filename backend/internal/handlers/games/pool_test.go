package games

import (
	"fmt"
	"testing"
	"wewatch-backend/internal/models"
)

func makeTestPoolState(numPlayers int) *GameSessionState {
	players := make([]models.Player, numPlayers)
	for i := range players {
		players[i] = models.Player{UserID: uint(i + 1)}
	}
	return &GameSessionState{
		Players:     players,
		CurrentTurn: 0,
		GameData:    map[string]interface{}{},
		GameSession: &models.GameSession{GameType: "pool"},
	}
}

// TestPoolInitialRackHasAllFifteenBalls is the regression test for the real
// "only the cue ball shows, nothing else, can't play" bug: the embedded
// engine's own bridge script treats any ball ID absent from ball_positions
// as already-pocketed and hides it (confirmed by reading
// wewatch-bridge.js's applySyncState directly), so a genuinely-complete
// starting rack is a hard requirement, not just a nice-to-have.
func TestPoolInitialRackHasAllFifteenBalls(t *testing.T) {
	rack := poolInitialRack()
	if len(rack) != 15 {
		t.Fatalf("expected exactly 15 balls in the initial rack, got %d: %v", len(rack), rack)
	}
	for id := 1; id <= 15; id++ {
		key := fmtInt(id)
		posRaw, ok := rack[key]
		if !ok {
			t.Errorf("ball %d missing from initial rack", id)
			continue
		}
		pos, ok := posRaw.(map[string]interface{})
		if !ok {
			t.Errorf("ball %d position is not a map: %v", id, posRaw)
			continue
		}
		x, xok := pos["x"].(float64)
		y, yok := pos["y"].(float64)
		if !xok || !yok {
			t.Errorf("ball %d position missing x/y: %v", id, pos)
			continue
		}
		if x < 0 || x > 1 || y < 0 || y > 1 {
			t.Errorf("ball %d position out of [0,1] bounds: x=%v y=%v", id, x, y)
		}
	}
}

// TestPoolInitialGameDataSeedsRackAndDefaults confirms poolInitialGameData
// (called from GameManager.StartGame, see game_manager.go) produces a
// non-empty rack alongside the original set of default fields — this is the
// function whose output becomes the very FIRST game_started broadcast,
// before any shot has ever been taken, which is exactly the moment the
// original bug fired (the embedded iframe's first sync_state, sent the
// instant it reports ready).
func TestPoolInitialGameDataSeedsRackAndDefaults(t *testing.T) {
	data := poolInitialGameData()
	rack, ok := data["ball_positions"].(map[string]interface{})
	if !ok || len(rack) != 15 {
		t.Fatalf("expected poolInitialGameData to seed all 15 balls, got: %v", data["ball_positions"])
	}
	if data["breaking"] != true {
		t.Errorf("expected breaking=true, got %v", data["breaking"])
	}
	if data["open_table"] != true {
		t.Errorf("expected open_table=true, got %v", data["open_table"])
	}
	if data["cue_pos_x"] != 0.25 || data["cue_pos_y"] != 0.5 {
		t.Errorf("expected default cue position (0.25, 0.5), got (%v, %v)", data["cue_pos_x"], data["cue_pos_y"])
	}
}

// TestPoolFullGameFlow plays a complete, realistic sequence through
// processPoolMove directly (this package's established way of testing a
// full game — see e.g. TestRebusStart*/TestFourFrames* — the physics
// themselves run client-side, so there's nothing for the backend to
// simulate beyond what a real client would report). Confirms, in order: a
// dry break with nothing pocketed correctly passes the turn (real 8-ball
// rules — a break that pockets nothing is a miss, same as any other shot);
// a legal type-assigning pocket on the open table keeps the shooter's
// turn; a miss passes the turn; a scratch foul passes the turn and sets
// ball-in-hand; and a legal 8-ball pot (with the shooter's own group
// already cleared) ends the game with the correct winner.
//
// processPoolMove itself never validates that the passed playerID actually
// owns the current turn — it trusts gameState.CurrentTurn unconditionally
// and derives playerIdx from that alone (turn-ownership enforcement lives
// one layer up, in GameManager.ProcessMove, for pool's "selfManagedTurn"
// entry). So this test tracks gs.CurrentTurn explicitly after each move
// and always plays the NEXT shot as whichever player the state machine
// itself says is up, exactly mirroring how a real client-driven sequence
// would actually unfold.
func TestPoolFullGameFlow(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}

	// Before any move at all, GameData is untouched — the real rack only
	// exists once StartGame seeds it (poolInitialGameData, tested directly
	// above) or, as a defensive fallback, the first shot's lazy-init runs.
	// A real client always reports its own full post-shot ball_positions on
	// every move (TestPoolBallPositionsCarryAcrossShots), so the seeded
	// rack is expected to be immediately superseded by the first shot's own
	// report — that's not a regression, it's the whole point of the sync
	// protocol (the server never runs physics of its own).
	if _, ok := gs.GameData["ball_positions"]; ok {
		t.Fatal("test setup should start with untouched GameData")
	}

	// p0 breaks. Dry break — nothing pocketed, no foul — but per real
	// 8-ball rules that's still a miss: the turn passes to p1.
	breakMove := baseShotMove()
	breakMove["first_contact"] = float64(1)
	if _, _, err := gm.processPoolMove(gs, gs.Players[0].UserID, "shot", breakMove); err != nil {
		t.Fatalf("break: %v", err)
	}
	if _, ok := gs.GameData["ball_positions"].(map[string]interface{}); !ok {
		t.Fatalf("expected ball_positions to remain a map after the break, got %v", gs.GameData["ball_positions"])
	}
	if breaking, _ := gs.GameData["breaking"].(bool); breaking {
		t.Fatal("expected breaking to clear after the first shot")
	}
	if gs.CurrentTurn != 1 {
		t.Fatalf("expected a dry break to pass the turn to p1, got turn index %d", gs.CurrentTurn)
	}

	// p1 legally pockets a solid on the still-open table — assigns
	// p1=solids/p0=stripes and keeps p1's turn (open-table pockets never
	// foul on first contact, and a legal pocket always keeps the table).
	pocketMove := baseShotMove()
	pocketMove["pocketed"] = []interface{}{float64(3)}
	pocketMove["first_contact"] = float64(3)
	if _, _, err := gm.processPoolMove(gs, gs.Players[gs.CurrentTurn].UserID, "shot", pocketMove); err != nil {
		t.Fatalf("pocket: %v", err)
	}
	if gs.GameData["p1_type"] != "solids" {
		t.Fatalf("expected p1 assigned solids, got %v", gs.GameData["p1_type"])
	}
	if gs.GameData["p0_type"] != "stripes" {
		t.Fatalf("expected p0 assigned stripes, got %v", gs.GameData["p0_type"])
	}
	if gs.CurrentTurn != 1 {
		t.Fatalf("expected turn to stay with p1 after a legal pocket, got turn index %d", gs.CurrentTurn)
	}

	// p1 misses (first contact on their own solids group, nothing
	// pocketed) — turn passes to p0.
	missMove := baseShotMove()
	missMove["first_contact"] = float64(1)
	if _, _, err := gm.processPoolMove(gs, gs.Players[gs.CurrentTurn].UserID, "shot", missMove); err != nil {
		t.Fatalf("miss: %v", err)
	}
	if gs.CurrentTurn != 0 {
		t.Fatalf("expected turn to pass to p0 after p1's miss, got turn index %d", gs.CurrentTurn)
	}

	// p0 scratches — a foul; turn passes to p1, ball-in-hand set.
	scratchMove := baseShotMove()
	scratchMove["first_contact"] = float64(9)
	scratchMove["cue_scratched"] = true
	if _, _, err := gm.processPoolMove(gs, gs.Players[gs.CurrentTurn].UserID, "shot", scratchMove); err != nil {
		t.Fatalf("scratch: %v", err)
	}
	if gs.CurrentTurn != 1 {
		t.Fatalf("expected turn to pass to p1 after p0's scratch, got turn index %d", gs.CurrentTurn)
	}
	if inHand, _ := gs.GameData["ball_in_hand"].(bool); !inHand {
		t.Fatal("expected ball_in_hand=true after a scratch foul")
	}
	if foul, _ := gs.GameData["last_foul"].(string); foul != "scratch" {
		t.Fatalf("expected last_foul=scratch, got %q", foul)
	}

	// p1 (solids) clears their remaining solids — ball 3 was already
	// pocketed above, so 1, 2, 4, 5, 6, 7 remain — each a legal pocket that
	// keeps their own turn throughout.
	for _, ball := range []float64{1, 2, 4, 5, 6, 7} {
		clearMove := baseShotMove()
		clearMove["pocketed"] = []interface{}{ball}
		clearMove["first_contact"] = ball
		if _, _, err := gm.processPoolMove(gs, gs.Players[gs.CurrentTurn].UserID, "shot", clearMove); err != nil {
			t.Fatalf("clearing solid %v: %v", ball, err)
		}
		if gs.CurrentTurn != 1 {
			t.Fatalf("expected turn to stay with p1 while clearing solid %v, got turn index %d", ball, gs.CurrentTurn)
		}
	}

	// With every solid cleared, p1 legally pots the 8-ball — game ends,
	// p1 wins.
	eightMove := baseShotMove()
	eightMove["pocketed"] = []interface{}{float64(8)}
	eightMove["first_contact"] = float64(8)
	gameOver, winnerID, err := gm.processPoolMove(gs, gs.Players[gs.CurrentTurn].UserID, "shot", eightMove)
	if err != nil {
		t.Fatalf("8-ball: %v", err)
	}
	if !gameOver {
		t.Fatal("expected sinking the 8-ball with all own balls cleared to end the game")
	}
	if winnerID == nil || *winnerID != gs.Players[1].UserID {
		t.Fatalf("expected p1 (%d) to win, got %v", gs.Players[1].UserID, winnerID)
	}
}

// fmtInt avoids importing strconv purely for a couple of test-side map key
// lookups (fmt is already used throughout this package's tests).
func fmtInt(i int) string {
	return fmt.Sprintf("%d", i)
}

func baseShotMove() map[string]interface{} {
	return map[string]interface{}{
		"pocketed":       []interface{}{},
		"cue_scratched":  false,
		"cue_x":          0.5,
		"cue_y":          0.5,
		"first_contact":  float64(1),
		"ball_positions": map[string]interface{}{},
	}
}

// TestPoolBallPositionsStored is the regression test for the cross-client
// desync bug: previously only pocketed IDs and the cue ball position were
// ever synced, so every other ball silently kept whatever position it was at
// on each individual client. This confirms the shooter's reported resting
// positions for every other ball actually land in GameData for broadcast.
func TestPoolBallPositionsStored(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	move := baseShotMove()
	move["ball_positions"] = map[string]interface{}{
		"1": map[string]interface{}{"x": 0.6, "y": 0.3},
		"9": map[string]interface{}{"x": 0.7, "y": 0.42},
	}

	if _, _, err := gm.processPoolMove(gs, gs.Players[0].UserID, "shot", move); err != nil {
		t.Fatalf("shot: %v", err)
	}

	stored, ok := gs.GameData["ball_positions"].(map[string]interface{})
	if !ok {
		t.Fatal("expected ball_positions to be a map after a shot")
	}
	p1, ok := stored["1"].(map[string]interface{})
	if !ok || p1["x"] != 0.6 || p1["y"] != 0.3 {
		t.Errorf("expected ball 1 at (0.6, 0.3), got %v", stored["1"])
	}
	p9, ok := stored["9"].(map[string]interface{})
	if !ok || p9["x"] != 0.7 || p9["y"] != 0.42 {
		t.Errorf("expected ball 9 at (0.7, 0.42), got %v", stored["9"])
	}
}

func TestPoolBallPositionsClampedToTableBounds(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	move := baseShotMove()
	move["ball_positions"] = map[string]interface{}{
		"2": map[string]interface{}{"x": 1.8, "y": -0.4},
	}

	if _, _, err := gm.processPoolMove(gs, gs.Players[0].UserID, "shot", move); err != nil {
		t.Fatalf("shot: %v", err)
	}

	stored := gs.GameData["ball_positions"].(map[string]interface{})
	p2 := stored["2"].(map[string]interface{})
	if p2["x"] != 1.0 {
		t.Errorf("expected x clamped to 1.0, got %v", p2["x"])
	}
	if p2["y"] != 0.0 {
		t.Errorf("expected y clamped to 0.0, got %v", p2["y"])
	}
}

// TestPoolBallPositionsSkipsMalformedEntries confirms a malformed single
// entry (missing a coordinate, or not a map at all) never fails or drops the
// whole shot — the rest of the report is still applied. A misbehaving or
// out-of-date client shouldn't be able to break the game for everyone else.
func TestPoolBallPositionsSkipsMalformedEntries(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	move := baseShotMove()
	move["ball_positions"] = map[string]interface{}{
		"3": map[string]interface{}{"x": 0.4, "y": 0.5},
		"4": map[string]interface{}{"x": 0.4}, // missing y
		"5": "not a map at all",
	}

	if _, _, err := gm.processPoolMove(gs, gs.Players[0].UserID, "shot", move); err != nil {
		t.Fatalf("shot: %v", err)
	}

	stored := gs.GameData["ball_positions"].(map[string]interface{})
	if _, ok := stored["3"]; !ok {
		t.Error("expected the well-formed entry for ball 3 to still be stored")
	}
	if _, ok := stored["4"]; ok {
		t.Error("expected the malformed entry (missing y) for ball 4 to be skipped")
	}
	if _, ok := stored["5"]; ok {
		t.Error("expected the non-map entry for ball 5 to be skipped")
	}
}

// TestPoolLazyInitDefaultsToEmptyBallPositions confirms a freshly-initialized
// game (before ball_positions was added) doesn't panic on a type assertion
// anywhere reading GameData["ball_positions"] before the first shot report.
func TestPoolLazyInitDefaultsToEmptyBallPositions(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	move := baseShotMove() // reports no ball positions at all — e.g. every ball pocketed on the break somehow

	if _, _, err := gm.processPoolMove(gs, gs.Players[0].UserID, "shot", move); err != nil {
		t.Fatalf("shot: %v", err)
	}

	stored, ok := gs.GameData["ball_positions"].(map[string]interface{})
	if !ok {
		t.Fatal("expected ball_positions to still be a map even when the report is empty")
	}
	if len(stored) != 0 {
		t.Errorf("expected an empty map, got %v", stored)
	}
}

// TestPoolBallPositionsCarryAcrossShots confirms a second shot's report
// (e.g. after a different player's turn) correctly replaces the whole
// snapshot rather than merging with the previous one — every still-active
// ball's position must be re-reported every shot, since the server has no
// physics of its own to reconcile a partial update against.
func TestPoolBallPositionsCarryAcrossShots(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}

	first := baseShotMove()
	first["ball_positions"] = map[string]interface{}{
		"1": map[string]interface{}{"x": 0.3, "y": 0.3},
	}
	if _, _, err := gm.processPoolMove(gs, gs.Players[0].UserID, "shot", first); err != nil {
		t.Fatalf("first shot: %v", err)
	}
	// Foul, so it's still player 0's opponent's turn next — but for this test
	// we only care that the second report fully replaces the first snapshot.
	second := baseShotMove()
	second["ball_positions"] = map[string]interface{}{
		"2": map[string]interface{}{"x": 0.8, "y": 0.1},
	}
	gs.CurrentTurn = 0 // keep it simple: same player reports again
	if _, _, err := gm.processPoolMove(gs, gs.Players[0].UserID, "shot", second); err != nil {
		t.Fatalf("second shot: %v", err)
	}

	stored := gs.GameData["ball_positions"].(map[string]interface{})
	if _, ok := stored["1"]; ok {
		t.Error("expected ball 1's stale position from the first shot to be gone after the second report")
	}
	if _, ok := stored["2"]; !ok {
		t.Error("expected ball 2's position from the second report to be present")
	}
}

// TestPoolShotProgressRelaysPositionsOnly confirms the live in-progress relay
// (shot_progress) stores exactly what was reported — position AND velocity —
// under its own separate field, and touches nothing else: no foul/turn/win
// side effects, matching processPoolShotProgress's own "cosmetic only"
// contract.
func TestPoolShotProgressRelaysPositionsOnly(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	turnBefore := gs.CurrentTurn

	move := map[string]interface{}{
		"live_ball_positions": map[string]interface{}{
			"0": map[string]interface{}{"x": 0.4, "y": 0.55, "vx": 0.12, "vy": -0.03},
			"1": map[string]interface{}{"x": 0.6, "y": 0.2, "vx": -0.05, "vy": 0.08},
		},
	}

	gameOver, winnerID, err := gm.processPoolMove(gs, gs.Players[0].UserID, "shot_progress", move)
	if err != nil {
		t.Fatalf("shot_progress: %v", err)
	}
	if gameOver {
		t.Error("shot_progress must never end the game")
	}
	if winnerID != nil {
		t.Error("shot_progress must never declare a winner")
	}
	if gs.CurrentTurn != turnBefore {
		t.Errorf("shot_progress must never advance the turn, got %d (was %d)", gs.CurrentTurn, turnBefore)
	}

	live, ok := gs.GameData["live_ball_positions"].(map[string]interface{})
	if !ok {
		t.Fatal("expected live_ball_positions to be stored as a map")
	}
	b0, ok := live["0"].(map[string]interface{})
	if !ok || b0["x"] != 0.4 || b0["y"] != 0.55 || b0["vx"] != 0.12 || b0["vy"] != -0.03 {
		t.Errorf("expected ball 0's full position+velocity to be relayed exactly, got %v", live["0"])
	}
	b1, ok := live["1"].(map[string]interface{})
	if !ok || b1["x"] != 0.6 || b1["y"] != 0.2 || b1["vx"] != -0.05 || b1["vy"] != 0.08 {
		t.Errorf("expected ball 1's full position+velocity to be relayed exactly, got %v", live["1"])
	}

	// The authoritative "shot" fields must be completely untouched by a
	// shot_progress move — confirms this is genuinely a separate, additive
	// field, not something that could ever corrupt real game state. Both
	// fields already exist at this point via the unconditional lazy-init
	// defaults (poolInitialGameData), so the real assertion is that
	// shot_progress didn't MODIFY them, not that they're absent.
	pocketed, _ := gs.GameData["pocketed"].([]interface{})
	if len(pocketed) != 0 {
		t.Errorf("shot_progress must never touch pocketed, got %v", pocketed)
	}
	ballPositions, ok := gs.GameData["ball_positions"].(map[string]interface{})
	if !ok || len(ballPositions) != 15 {
		t.Errorf("shot_progress must never touch the authoritative ball_positions field (expected the untouched 15-ball default rack), got %v", ballPositions)
	}
}

// TestPoolShotProgressSkipsMalformedEntries mirrors
// TestPoolBallPositionsSkipsMalformedEntries for the live-relay path — one
// bad entry must not drop the whole report.
func TestPoolShotProgressSkipsMalformedEntries(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	move := map[string]interface{}{
		"live_ball_positions": map[string]interface{}{
			"3": map[string]interface{}{"x": 0.4, "y": 0.5, "vx": 0.1, "vy": 0.1},
			"4": map[string]interface{}{"x": 0.4}, // missing y
			"5": "not a map at all",
		},
	}
	if _, _, err := gm.processPoolMove(gs, gs.Players[0].UserID, "shot_progress", move); err != nil {
		t.Fatalf("shot_progress: %v", err)
	}
	live := gs.GameData["live_ball_positions"].(map[string]interface{})
	if _, ok := live["3"]; !ok {
		t.Error("expected the well-formed entry for ball 3 to still be stored")
	}
	if _, ok := live["4"]; ok {
		t.Error("expected the malformed entry (missing y) for ball 4 to be skipped")
	}
	if _, ok := live["5"]; ok {
		t.Error("expected the non-map entry for ball 5 to be skipped")
	}
}

// TestPoolShotProgressAcceptedRegardlessOfTurn confirms shot_progress is
// exempt from the generic ProcessMove turn gate, same as view_ack — a real,
// confirmed bug (reported live: "a lot of toast messages saying 'wrong
// move: not your turn'... this isn't necessary in the pool game") where a
// straggling shot_progress packet arriving a beat after CurrentTurn had
// already advanced (normal network latency, or the gap between the client's
// own allStationary() check and the backend processing the final report)
// was rejected and surfaced as a confusing user-facing toast, even though
// shot_progress has zero gameplay effect regardless of who sends it.
func TestPoolShotProgressAcceptedRegardlessOfTurn(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{activeGames: map[uint]*GameSessionState{1: gs}}
	move := map[string]interface{}{
		"live_ball_positions": map[string]interface{}{
			"0": map[string]interface{}{"x": 0.5, "y": 0.5, "vx": 0, "vy": 0},
		},
	}
	// gs.CurrentTurn is 0 (player index 0) — sending as player 1 (index 1)
	// must NOT be rejected on turn grounds; it's a pure ephemeral relay.
	err := gm.ProcessMove(1, gs.Players[1].UserID, "shot_progress", move)
	if err != nil {
		t.Fatalf("expected shot_progress from the non-current player to be accepted, got: %v", err)
	}
}

// TestPoolGameEventAcceptedRegardlessOfTurn mirrors the shot_progress test
// above for the other cosmetic relay move type (cue/aim-stick state) — same
// exemption, same real-world race, same fix.
func TestPoolGameEventAcceptedRegardlessOfTurn(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{activeGames: map[uint]*GameSessionState{1: gs}}
	move := map[string]interface{}{"payload": "opaque-aim-state"}
	err := gm.ProcessMove(1, gs.Players[1].UserID, "game_event", move)
	if err != nil {
		t.Fatalf("expected game_event from the non-current player to be accepted, got: %v", err)
	}
}

// TestPoolShotRejectsOutOfTurn is the positive control for the two tests
// above — confirms the turn gate itself is still very much alive for the one
// move type that actually matters: a real "shot" report from the
// non-current player must still be rejected, unaffected by exempting the
// purely cosmetic relay move types.
func TestPoolShotRejectsOutOfTurn(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{activeGames: map[uint]*GameSessionState{1: gs}}
	move := map[string]interface{}{
		"pocketed":       []interface{}{},
		"cue_scratched":  false,
		"cue_x":          0.5,
		"cue_y":          0.5,
		"first_contact":  float64(1),
		"ball_positions": map[string]interface{}{},
	}
	err := gm.ProcessMove(1, gs.Players[1].UserID, "shot", move)
	if err == nil {
		t.Fatal("expected a real shot move from the non-current player to still be rejected")
	}
}

// TestPoolFinalShotClearsLiveBallPositions confirms a genuine "shot" report
// always clears any stale live_ball_positions left over from the in-progress
// relay, so a late joiner's rehydration never sees a mid-shot snapshot
// sitting stale next to the fresh authoritative positions.
func TestPoolFinalShotClearsLiveBallPositions(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}

	// Seed a stale live_ball_positions value directly, as if a shot_progress
	// tick landed moments before the final report.
	progressMove := map[string]interface{}{
		"live_ball_positions": map[string]interface{}{
			"0": map[string]interface{}{"x": 0.5, "y": 0.5, "vx": 0.2, "vy": 0.1},
		},
	}
	if _, _, err := gm.processPoolMove(gs, gs.Players[0].UserID, "shot_progress", progressMove); err != nil {
		t.Fatalf("shot_progress: %v", err)
	}
	if _, ok := gs.GameData["live_ball_positions"]; !ok {
		t.Fatal("test setup: expected live_ball_positions to be present before the final shot")
	}

	finalMove := baseShotMove()
	finalMove["first_contact"] = float64(1)
	if _, _, err := gm.processPoolMove(gs, gs.Players[0].UserID, "shot", finalMove); err != nil {
		t.Fatalf("shot: %v", err)
	}
	if _, ok := gs.GameData["live_ball_positions"]; ok {
		t.Error("expected live_ball_positions to be cleared once the final shot report lands")
	}
}

// TestPoolOpenTableEightBallAlwaysLoses is the regression test for a real,
// confirmed bug: on a still-open table (no group has EVER been established
// for anyone — not even by this same shot), potting the 8-ball was always
// silently ruled a LEGAL WIN. Root cause: the eight-ball legality check ran
// BEFORE ball-type assignment, so myType was still "" at that point;
// poolPlayerBalls("") returns an empty slice, so the "are all my balls
// cleared" loop never executed a single iteration and its `allCleared`
// default of true was never overturned — regardless of how many balls of
// either color were still sitting on the table. Real 8-ball rules: the 8
// can only ever be legally sunk once a player's own group is both
// established AND fully cleared — an open table means neither has happened.
func TestPoolOpenTableEightBallAlwaysLoses(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	p0, p1 := gs.Players[0].UserID, gs.Players[1].UserID

	// p0 breaks (dry — nothing pocketed), turn passes to p1, table stays open.
	breakMove := baseShotMove()
	breakMove["first_contact"] = float64(1)
	if _, _, err := gm.processPoolMove(gs, p0, "shot", breakMove); err != nil {
		t.Fatalf("break: %v", err)
	}
	if gs.CurrentTurn != 1 {
		t.Fatalf("expected turn to pass to p1 after the dry break, got %d", gs.CurrentTurn)
	}
	if open, _ := gs.GameData["open_table"].(bool); !open {
		t.Fatal("test setup: expected the table to still be open")
	}

	// p1 pockets ONLY the 8-ball, on the still-open table — no group ball
	// pocketed alongside it, no group ever assigned to either player.
	eightMove := baseShotMove()
	eightMove["pocketed"] = []interface{}{float64(8)}
	eightMove["first_contact"] = float64(8)
	gameOver, winnerID, err := gm.processPoolMove(gs, p1, "shot", eightMove)
	if err != nil {
		t.Fatalf("open-table 8-pot: %v", err)
	}
	if !gameOver {
		t.Fatal("expected sinking the 8-ball to end the game regardless of legality")
	}
	if winnerID == nil || *winnerID != p0 {
		t.Fatalf("expected p0 (opponent, %d) to win an illegal open-table 8-pot, got %v", p0, winnerID)
	}
	if foul, _ := gs.GameData["last_foul"].(string); foul != "early_eight" {
		t.Errorf("expected last_foul=early_eight, got %q", foul)
	}
}

// TestPoolLastBallAndEightInSameShotWins confirms the companion fix: legally
// clearing your own group's LAST remaining ball and potting the 8-ball in
// the very same stroke is a real, common, LEGAL win — the eight-ball check
// must consider this same shot's newly-pocketed balls, not just what was
// already pocketed before this shot started.
func TestPoolLastBallAndEightInSameShotWins(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	p0 := gs.Players[0].UserID

	// Seed state directly: p0 is "solids", already cleared 1-6, only ball 7
	// remains from their group, table no longer open.
	gs.GameData["breaking"] = false
	gs.GameData["open_table"] = false
	gs.GameData["p0_type"] = "solids"
	gs.GameData["p1_type"] = "stripes"
	gs.GameData["pocketed"] = []interface{}{float64(1), float64(2), float64(3), float64(4), float64(5), float64(6)}
	gs.CurrentTurn = 0

	move := baseShotMove()
	move["pocketed"] = []interface{}{float64(7), float64(8)}
	move["first_contact"] = float64(7)
	gameOver, winnerID, err := gm.processPoolMove(gs, p0, "shot", move)
	if err != nil {
		t.Fatalf("last-ball-plus-eight: %v", err)
	}
	if !gameOver {
		t.Fatal("expected the game to end")
	}
	if winnerID == nil || *winnerID != p0 {
		t.Fatalf("expected p0 (%d) to legally win by clearing their last ball and the 8 in one shot, got %v", p0, winnerID)
	}
	if foul, _ := gs.GameData["last_foul"].(string); foul == "early_eight" {
		t.Error("expected this to be judged a LEGAL win, not early_eight")
	}
}

// TestPoolEightBallFirstContactBeforeGroupClearedIsFoul is the regression
// test for a real, confirmed bug: the "wrong first contact" foul check
// unconditionally exempted the 8-ball ("ballType != 'eight'"), meaning a
// player could hit the 8-ball FIRST — before ever clearing their own group —
// with zero foul, contradicting real 8-ball rules (hitting the money ball
// first is only legal once your group is fully cleared). Reported live:
// "sometimes the foul is wrong, it can sometimes say I hit opponent's ball
// when I didn't" — the exact reverse gap in the same block of code.
func TestPoolEightBallFirstContactBeforeGroupClearedIsFoul(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	p0 := gs.Players[0].UserID

	// p0 is "solids", has only cleared 1-6 — ball 7 still on the table.
	gs.GameData["breaking"] = false
	gs.GameData["open_table"] = false
	gs.GameData["p0_type"] = "solids"
	gs.GameData["p1_type"] = "stripes"
	gs.GameData["pocketed"] = []interface{}{float64(1), float64(2), float64(3), float64(4), float64(5), float64(6)}
	gs.CurrentTurn = 0

	move := baseShotMove()
	move["first_contact"] = float64(8) // hits the 8-ball first, pockets nothing
	if _, _, err := gm.processPoolMove(gs, p0, "shot", move); err != nil {
		t.Fatalf("shot: %v", err)
	}
	if foul, _ := gs.GameData["last_foul"].(string); foul != "wrong_first_contact" {
		t.Errorf("expected last_foul=wrong_first_contact for hitting the 8-ball before clearing your group, got %q", foul)
	}
	if gs.CurrentTurn != 1 {
		t.Errorf("expected turn to pass to p1 on this foul, got %d", gs.CurrentTurn)
	}
}

// TestPoolEightBallFirstContactAfterGroupClearedIsLegal is the positive
// control for the fix above — once a player HAS fully cleared their own
// group, hitting the 8-ball first is completely legal (it's the only ball
// left to shoot at), and must not be flagged as a foul.
func TestPoolEightBallFirstContactAfterGroupClearedIsLegal(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	p0 := gs.Players[0].UserID

	// p0 is "solids", has cleared all 7 solids already — only the 8 remains.
	gs.GameData["breaking"] = false
	gs.GameData["open_table"] = false
	gs.GameData["p0_type"] = "solids"
	gs.GameData["p1_type"] = "stripes"
	gs.GameData["pocketed"] = []interface{}{float64(1), float64(2), float64(3), float64(4), float64(5), float64(6), float64(7)}
	gs.CurrentTurn = 0

	move := baseShotMove()
	move["first_contact"] = float64(8) // hits the 8-ball first — legal now, misses the pot
	if _, _, err := gm.processPoolMove(gs, p0, "shot", move); err != nil {
		t.Fatalf("shot: %v", err)
	}
	if foul, _ := gs.GameData["last_foul"].(string); foul != "" {
		t.Errorf("expected no foul for hitting the 8-ball first after fully clearing your group, got %q", foul)
	}
}

// Regression test for a real bug found while verifying the fix above live:
// both eight-ball win/loss branches used to `return` before ever reaching
// the code that merges newlyPocketed into GameData["pocketed"] and persists
// GameData["ball_positions"] — meaning the winner/loser was decided
// correctly, but the opponent's board never actually updated to show the
// 8-ball (or anything else pocketed in that same final stroke) as gone from
// the table. Covers both the legal-win and illegal-early-eight paths.
func TestPoolEightBallShotPersistsPocketedAndBallPositions(t *testing.T) {
	t.Run("legal win persists the final pocketed list and ball positions", func(t *testing.T) {
		gs := makeTestPoolState(2)
		gm := &GameManager{}
		p0 := gs.Players[0].UserID

		gs.GameData["breaking"] = false
		gs.GameData["open_table"] = false
		gs.GameData["p0_type"] = "solids"
		gs.GameData["p1_type"] = "stripes"
		gs.GameData["pocketed"] = []interface{}{float64(1), float64(2), float64(3), float64(4), float64(5), float64(6)}
		gs.CurrentTurn = 0

		// Last remaining solid (7) and the 8-ball, both in the same final
		// stroke — a real, common legal win. ball_positions also reports
		// ball 9 (an opponent's stripe, untouched, still on the table) to
		// confirm the persisted board reflects a real, non-pocketed ball
		// too, not just the newly-pocketed ones.
		move := baseShotMove()
		move["pocketed"] = []interface{}{float64(7), float64(8)}
		move["first_contact"] = float64(7)
		move["ball_positions"] = map[string]interface{}{
			"0": map[string]interface{}{"x": 0.5, "y": 0.5},
			"9": map[string]interface{}{"x": 0.2, "y": 0.3},
		}
		gameOver, winnerID, err := gm.processPoolMove(gs, p0, "shot", move)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !gameOver || winnerID == nil || *winnerID != p0 {
			got := "nil"
			if winnerID != nil {
				got = fmt.Sprintf("%d", *winnerID)
			}
			t.Fatalf("expected p0 (%d) to win, got gameOver=%v winnerID=%v", p0, gameOver, got)
		}

		pocketedRaw, _ := gs.GameData["pocketed"].([]interface{})
		pocketed := make(map[int]bool)
		for _, v := range pocketedRaw {
			if f, ok := v.(float64); ok {
				pocketed[int(f)] = true
			}
		}
		for _, want := range []int{1, 2, 3, 4, 5, 6, 7, 8} {
			if !pocketed[want] {
				t.Errorf("expected ball %d in the persisted pocketed list, got %v", want, pocketedRaw)
			}
		}

		bp, _ := gs.GameData["ball_positions"].(map[string]interface{})
		if _, ok := bp["9"]; !ok {
			t.Errorf("expected ball_positions to be persisted from this final shot, got %v", bp)
		}
	})

	t.Run("illegal early-eight loss still persists the final pocketed list and ball positions", func(t *testing.T) {
		gs := makeTestPoolState(2)
		gm := &GameManager{}
		p0 := gs.Players[0].UserID
		p1 := gs.Players[1].UserID

		gs.GameData["breaking"] = false
		gs.GameData["open_table"] = true // no group ever established
		gs.CurrentTurn = 0

		move := baseShotMove()
		move["pocketed"] = []interface{}{float64(8)}
		move["first_contact"] = float64(8)
		move["ball_positions"] = map[string]interface{}{
			"0": map[string]interface{}{"x": 0.5, "y": 0.5},
		}
		gameOver, winnerID, err := gm.processPoolMove(gs, p0, "shot", move)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !gameOver || winnerID == nil || *winnerID != p1 {
			t.Fatalf("expected p1 (opponent) to win on an illegal early-eight, got gameOver=%v winnerID=%v", gameOver, winnerID)
		}

		pocketedRaw, _ := gs.GameData["pocketed"].([]interface{})
		found8 := false
		for _, v := range pocketedRaw {
			if f, ok := v.(float64); ok && int(f) == 8 {
				found8 = true
			}
		}
		if !found8 {
			t.Errorf("expected ball 8 in the persisted pocketed list even on the illegal-loss path, got %v", pocketedRaw)
		}
		bp, _ := gs.GameData["ball_positions"].(map[string]interface{})
		if len(bp) == 0 {
			t.Error("expected ball_positions to be persisted even on the illegal-loss path")
		}
	})
}

// --- View-confirmation (state_version / view_ack) ---
//
// Regression coverage for a real, confirmed bug: PoolGame.jsx's
// set_interactive postMessage lived in a SEPARATE useEffect keyed only on
// isMyTurn — but a legal pocket keeps the same player's turn (CurrentTurn
// unchanged), so isMyTurn never toggles and that effect never re-fired.
// Meanwhile the sync_state effect DID re-fire (ball_positions genuinely
// changed), plausibly resetting the embedded engine's own internal
// interactive/aim-controller state as a side effect of repositioning balls.
// Net effect: after a legal-pocket "2nd chance," the shooter's own iframe
// silently stopped being interactive — their cue stopped emitting
// game_event (nothing to broadcast) and they couldn't take their next shot
// at all (so ball_positions never updated again either). state_version
// exists so every client (and this test suite) has a single number to
// confirm "did the authoritative state actually change here" independent
// of whatever any one frontend effect did or didn't do with it.

func TestPoolStateVersionStartsAtZero(t *testing.T) {
	data := poolInitialGameData()
	if data["state_version"] != float64(0) {
		t.Fatalf("expected state_version=0 at game start, got %v", data["state_version"])
	}
	acks, ok := data["view_acks"].(map[string]interface{})
	if !ok || len(acks) != 0 {
		t.Fatalf("expected an empty view_acks map at game start, got %v", data["view_acks"])
	}
}

// TestPoolStateVersionIncrementsAcrossLegalPocketContinuation directly
// exercises the exact real-world scenario the bug was reported against: a
// player legally pockets a ball (keeping their own turn), then takes a
// SECOND shot on that same "2nd chance" turn. Both shots must each bump
// state_version — confirming the authoritative state genuinely does keep
// changing across a same-player continuation, which is what a client-side
// fix needs to react to (the bug was that the FRONTEND failed to react to
// this, not that the backend ever stopped producing it).
func TestPoolStateVersionIncrementsAcrossLegalPocketContinuation(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	p0 := gs.Players[0].UserID

	firstShot := baseShotMove()
	firstShot["pocketed"] = []interface{}{float64(3)}
	firstShot["first_contact"] = float64(3)
	if _, _, err := gm.processPoolMove(gs, p0, "shot", firstShot); err != nil {
		t.Fatalf("first shot: %v", err)
	}
	if gs.CurrentTurn != 0 {
		t.Fatalf("expected p0 to keep the turn after a legal pocket (the '2nd chance' scenario), got turn index %d", gs.CurrentTurn)
	}
	v1 := ppIntFrom(gs.GameData["state_version"])
	if v1 != 1 {
		t.Fatalf("expected state_version=1 after the first real shot, got %d", v1)
	}

	// The "2nd chance" shot — same player, same turn, a second real shot.
	secondShot := baseShotMove()
	secondShot["pocketed"] = []interface{}{float64(1)}
	secondShot["first_contact"] = float64(1)
	if _, _, err := gm.processPoolMove(gs, p0, "shot", secondShot); err != nil {
		t.Fatalf("second (2nd-chance) shot: %v", err)
	}
	v2 := ppIntFrom(gs.GameData["state_version"])
	if v2 != 2 {
		t.Fatalf("expected state_version=2 after the 2nd-chance shot, got %d (this is exactly the scenario the reported bug was about — the backend must keep producing a fresh version here even though CurrentTurn never changed)", v2)
	}
}

func TestPoolStateVersionUnaffectedByVolatileMoves(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	p0 := gs.Players[0].UserID

	// Establish a real baseline via one genuine shot first.
	if _, _, err := gm.processPoolMove(gs, p0, "shot", baseShotMove()); err != nil {
		t.Fatalf("baseline shot: %v", err)
	}
	baseline := ppIntFrom(gs.GameData["state_version"])

	if _, _, err := gm.processPoolMove(gs, p0, "shot_progress", map[string]interface{}{
		"live_ball_positions": map[string]interface{}{"0": map[string]interface{}{"x": 0.5, "y": 0.5, "vx": 0.1, "vy": 0.1}},
	}); err != nil {
		t.Fatalf("shot_progress: %v", err)
	}
	if _, _, err := gm.processPoolMove(gs, p0, "game_event", map[string]interface{}{"payload": "opaque-aim-json"}); err != nil {
		t.Fatalf("game_event: %v", err)
	}
	if _, _, err := gm.processPoolMove(gs, p0, "view_ack", map[string]interface{}{"state_version": float64(baseline)}); err != nil {
		t.Fatalf("view_ack: %v", err)
	}

	if got := ppIntFrom(gs.GameData["state_version"]); got != baseline {
		t.Fatalf("expected state_version to stay at %d after only volatile/ack moves, got %d", baseline, got)
	}
}

func TestPoolViewAckRecordsPlayerVersion(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	p0, p1 := gs.Players[0].UserID, gs.Players[1].UserID

	if _, _, err := gm.processPoolMove(gs, p0, "shot", baseShotMove()); err != nil {
		t.Fatalf("shot: %v", err)
	}

	gameOver, winnerID, err := gm.processPoolMove(gs, p0, "view_ack", map[string]interface{}{"state_version": float64(1)})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatal("view_ack must never end the game or declare a winner")
	}
	acks, _ := gs.GameData["view_acks"].(map[string]interface{})
	if ppIntFrom(acks[fmt.Sprintf("%d", p0)]) != 1 {
		t.Fatalf("expected p0's ack to record version 1, got %v", acks[fmt.Sprintf("%d", p0)])
	}
	if _, exists := acks[fmt.Sprintf("%d", p1)]; exists {
		t.Fatalf("p0's ack should never write p1's own entry — p1 hasn't acked anything yet")
	}
}

// TestPoolViewAckIgnoresStaleRollback confirms an out-of-order ack (a lower
// version arriving after a higher one already landed — plausible if two
// acks race on the wire) never regresses a player's recorded version
// backwards, which would make them look artificially "behind" again to
// anyone reading view_acks for the confirmation UI.
func TestPoolViewAckIgnoresStaleRollback(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	p0 := gs.Players[0].UserID

	if _, _, err := gm.processPoolMove(gs, p0, "view_ack", map[string]interface{}{"state_version": float64(5)}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processPoolMove(gs, p0, "view_ack", map[string]interface{}{"state_version": float64(3)}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	acks, _ := gs.GameData["view_acks"].(map[string]interface{})
	if ppIntFrom(acks[fmt.Sprintf("%d", p0)]) != 5 {
		t.Fatalf("expected the stale, lower ack (3) to be ignored, keeping version 5, got %v", acks[fmt.Sprintf("%d", p0)])
	}
}

func TestPoolViewAckRejectsMissingVersion(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	_, _, err := gm.processPoolMove(gs, gs.Players[0].UserID, "view_ack", map[string]interface{}{})
	if err == nil {
		t.Fatal("expected an error for a view_ack with no state_version")
	}
}

// TestPoolViewAckNeverGatesOrTouchesGameplay confirms the whole mechanism
// is purely informational: sending (or never sending) a view_ack has zero
// effect on turn order, fouls, or any other real gameplay state — matching
// the explicit design intent (a confirmation/diagnostic signal, never a
// gate on whether a shot is allowed).
func TestPoolViewAckNeverGatesOrTouchesGameplay(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	p0 := gs.Players[0].UserID

	turnBefore := gs.CurrentTurn
	if _, _, err := gm.processPoolMove(gs, p0, "view_ack", map[string]interface{}{"state_version": float64(0)}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gs.CurrentTurn != turnBefore {
		t.Fatalf("view_ack must never advance the turn, got %d (was %d)", gs.CurrentTurn, turnBefore)
	}

	// A real shot must still work completely normally afterward.
	shot := baseShotMove()
	shot["pocketed"] = []interface{}{float64(3)}
	shot["first_contact"] = float64(3)
	if _, _, err := gm.processPoolMove(gs, p0, "shot", shot); err != nil {
		t.Fatalf("shot after a view_ack: %v", err)
	}
	if gs.CurrentTurn != 0 {
		t.Fatalf("expected the legal pocket to correctly keep p0's turn, got %d", gs.CurrentTurn)
	}
}

// --- Cue-stick relay shooter tagging ---
//
// Regression coverage for a real, confirmed member report: even on the very
// first turn (no "2nd chance" needed to reproduce it), a spectating player
// never saw the current shooter's cue-stick at all — only the balls. Since
// the actual 3D stick rendering happens entirely inside a third-party,
// externally-hosted engine this backend can't inspect or control, the fix
// tags every game_event with the sender's own player ID so the frontend can
// positively identify whose aim is being relayed and show its own,
// WeWatch-owned "X is aiming" indicator regardless of whether the embedded
// engine's own rendering succeeds. These tests only cover this backend's
// half of that fix — that the tag is always correct and never leaks the
// wrong sender — not the frontend indicator itself.

func TestPoolGameEventTagsSenderID(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	p0 := gs.Players[0].UserID

	if _, _, err := gm.processPoolMove(gs, p0, "game_event", map[string]interface{}{"payload": "opaque-aim-blob"}); err != nil {
		t.Fatalf("game_event: %v", err)
	}

	wrapped, ok := gs.GameData["aim_event"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected aim_event to be a tagged {shooter_id, payload} map, got %T: %v", gs.GameData["aim_event"], gs.GameData["aim_event"])
	}
	if got := ppIntFrom(wrapped["shooter_id"]); uint(got) != p0 {
		t.Fatalf("expected shooter_id=%d (the actual sender), got %d", p0, got)
	}
	if wrapped["payload"] != "opaque-aim-blob" {
		t.Fatalf("expected the inner payload to be passed through unchanged, got %v", wrapped["payload"])
	}
}

// The tag must reflect whoever actually called processPoolMove, not a
// hardcoded/assumed player index — confirmed by calling it as p1 instead of
// p0. (This test exercises processPoolMove directly, same as every other
// test in this file, bypassing ProcessMove's own outer turn-gate — real
// out-of-turn rejection for game_event is unchanged by this fix and is
// exercised by the live end-to-end test, not a unit test here.)
func TestPoolGameEventTagReflectsWhicheverPlayerActuallySent(t *testing.T) {
	gs := makeTestPoolState(2)
	gm := &GameManager{}
	p1 := gs.Players[1].UserID

	if _, _, err := gm.processPoolMove(gs, p1, "game_event", map[string]interface{}{"payload": "p1s-aim"}); err != nil {
		t.Fatalf("game_event: %v", err)
	}

	wrapped, ok := gs.GameData["aim_event"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected aim_event to be a tagged map, got %T", gs.GameData["aim_event"])
	}
	if got := ppIntFrom(wrapped["shooter_id"]); uint(got) != p1 {
		t.Fatalf("expected shooter_id=%d (p1, the actual caller), got %d — the tag must reflect who genuinely sent it, never a hardcoded/assumed player", p1, got)
	}
}
