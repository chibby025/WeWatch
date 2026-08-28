package games

import "testing"

func TestTankBattleInitialStateSeedsFullHP(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}

	phase, _ := gs.GameData["phase"].(string)
	if phase != "playing" {
		t.Fatalf("expected phase=playing from the start (no separate serve/countdown state), got %q", phase)
	}
	scores := ppScoreMap(gs.GameData)
	if ppIntFrom(scores["1"]) != 100 || ppIntFrom(scores["2"]) != 100 {
		t.Fatalf("expected both players to start at 100 HP, got %v", scores)
	}
}

func TestTankBattleStateSyncRelaysOwnTankOnly(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	_, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "state_sync", "x": 50.0, "y": 60.0, "angle": 1.2, "turret_angle": 0.5, "vx": 3.0, "vy": -1.0,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	snap, ok := gs.GameData["tank_1"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected tank_1 snapshot to be stored, got %v", gs.GameData["tank_1"])
	}
	if snap["x"] != 50.0 || snap["y"] != 60.0 || snap["angle"] != 1.2 {
		t.Fatalf("unexpected snapshot contents: %v", snap)
	}
	if _, exists := gs.GameData["tank_2"]; exists {
		t.Fatalf("player 1's state_sync should never write player 2's own tank_2 key")
	}
}

func TestTankBattleFireNeverChangesHPButUpdatesLastFire(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}
	before := ppScoreMap(gs.GameData)

	gameOver, winnerID, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "fire", "x": 10.0, "y": 20.0, "angle": 0.0,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatalf("fire should never end the game or declare a winner by itself")
	}
	after := ppScoreMap(gs.GameData)
	if ppIntFrom(after["1"]) != ppIntFrom(before["1"]) || ppIntFrom(after["2"]) != ppIntFrom(before["2"]) {
		t.Fatalf("fire should never change HP — only an explicit hit does")
	}
	// Regression guard: a "fire" that writes nothing into GameData would
	// never actually reach the other client, since broadcastGameStateLocked
	// only ever broadcasts the current in-memory GameData — it doesn't know
	// or care that a move was "volatile," it just re-sends whatever's there.
	lastFire, ok := gs.GameData["last_fire"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected fire to record a last_fire entry so the broadcast actually carries it, got %v", gs.GameData["last_fire"])
	}
	if lastFire["x"] != 10.0 || lastFire["y"] != 20.0 || lastFire["shooter_id"] != 1.0 {
		t.Fatalf("unexpected last_fire contents: %v", lastFire)
	}
	if ppIntFrom(gs.GameData["fire_seq"]) != 1 {
		t.Fatalf("expected fire_seq to increment to 1 on the first shot, got %v", gs.GameData["fire_seq"])
	}

	// A second fire must bump the sequence again, so the receiver can tell
	// two separate shots apart even if x/y/angle happen to be identical.
	if _, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "fire", "x": 10.0, "y": 20.0, "angle": 0.0,
	}); err != nil {
		t.Fatalf("unexpected error on second fire: %v", err)
	}
	if ppIntFrom(gs.GameData["fire_seq"]) != 2 {
		t.Fatalf("expected fire_seq to increment to 2 on the second shot, got %v", gs.GameData["fire_seq"])
	}
}

func TestTankBattleHitAppliesDamageToTarget(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	gameOver, winnerID, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "hit", "target_player_id": 2.0, "damage": 30.0,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatalf("a 30-damage hit on 100 HP should not end the game")
	}
	scores := ppScoreMap(gs.GameData)
	if ppIntFrom(scores["2"]) != 70 {
		t.Fatalf("expected player 2 to have 70 HP remaining, got %v", scores["2"])
	}
	if ppIntFrom(scores["1"]) != 100 {
		t.Fatalf("player 1's own HP should be untouched by a hit they landed, got %v", scores["1"])
	}
}

func TestTankBattleHitRejectsSelfDamage(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	_, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "hit", "target_player_id": 1.0, "damage": 20.0,
	})
	if err == nil {
		t.Fatalf("expected an error when a player reports a hit on themselves")
	}
}

func TestTankBattleHitRejectsInvalidTarget(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	_, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "hit", "target_player_id": 999.0, "damage": 20.0,
	})
	if err == nil {
		t.Fatalf("expected an error when the reported target isn't a real participant in this game")
	}
}

func TestTankBattleHitClampsAbsurdDamage(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	// A malicious/malformed client claiming a 9000-damage hit should be
	// clamped to the default 20, not allowed to one-shot kill.
	gameOver, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "hit", "target_player_id": 2.0, "damage": 9000.0,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver {
		t.Fatalf("a clamped 20-damage hit on 100 HP should not end the game")
	}
	scores := ppScoreMap(gs.GameData)
	if ppIntFrom(scores["2"]) != 80 {
		t.Fatalf("expected damage to be clamped to the default 20, leaving 80 HP, got %v", scores["2"])
	}
}

func TestTankBattleHitEndsGameAtZeroHP(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	// Land 5 hits of 20 damage to bring player 2 from 100 to 0.
	var gameOver bool
	var winnerID *uint
	var err error
	for i := 0; i < 5; i++ {
		gameOver, winnerID, err = gm.processTankBattleMove(gs, 1, map[string]interface{}{
			"move_type": "hit", "target_player_id": 2.0, "damage": 20.0,
		})
		if err != nil {
			t.Fatalf("unexpected error on hit %d: %v", i, err)
		}
	}
	if !gameOver {
		t.Fatalf("expected the game to be over once HP reaches 0")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Fatalf("expected player 1 (the shooter) to be declared winner, got %v", winnerID)
	}
	phase, _ := gs.GameData["phase"].(string)
	if phase != "ended" {
		t.Fatalf("expected phase to be set to ended, got %q", phase)
	}
}

func TestTankBattleHitIgnoredOncePhaseEnded(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gs.GameData["phase"] = "ended"
	gm := &GameManager{}

	gameOver, winnerID, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "hit", "target_player_id": 2.0, "damage": 20.0,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatalf("a hit reported after the game has already ended should be a harmless no-op")
	}
}

func TestTankBattleForcedEndDeclaresHigherHPWinner(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}
	// Player 2 has taken some damage; player 1 hasn't.
	if _, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "hit", "target_player_id": 2.0, "damage": 30.0,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	gameOver, winnerID, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{"move_type": "tank_battle_end"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !gameOver {
		t.Fatalf("expected tank_battle_end to end the game")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Fatalf("expected player 1 (higher remaining HP) to win a forced end, got %v", winnerID)
	}
}

func TestTankBattleForcedEndTiedHPIsADraw(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	gameOver, winnerID, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{"move_type": "tank_battle_end"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !gameOver {
		t.Fatalf("expected tank_battle_end to end the game even with equal HP")
	}
	if winnerID != nil {
		t.Fatalf("expected a tied-HP forced end to be a draw (nil winner), got %v", *winnerID)
	}
}

func TestTankBattleUnknownMoveTypeRejected(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	_, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{"move_type": "teleport"})
	if err == nil {
		t.Fatalf("expected an error for an unrecognized move type")
	}
}
