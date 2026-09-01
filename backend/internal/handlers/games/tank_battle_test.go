package games

import (
	"testing"
	"time"
)

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

func TestTankBattleInitialStateSeedsWallsAndEmptyPickupState(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	walls := tankBattleNestedMap(gs.GameData, "walls")
	for _, id := range []string{"w0", "w1", "w2", "w3", "w4"} {
		if ppIntFrom(walls[id]) != tankBattleWallMaxHP {
			t.Fatalf("expected wall %s to start at %d HP, got %v", id, tankBattleWallMaxHP, walls[id])
		}
	}
	if len(tankBattleNestedMap(gs.GameData, "pickups_grabbed")) != 0 {
		t.Fatalf("expected no pickups grabbed at game start")
	}
	if len(tankBattleNestedMap(gs.GameData, "effects")) != 0 {
		t.Fatalf("expected no active effects at game start")
	}
}

func TestTankBattleWallHitDamagesWall(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	gameOver, winnerID, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "wall_hit", "wall_id": "w0", "damage": 20.0,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatalf("damaging a wall should never end the game or declare a winner")
	}
	walls := tankBattleNestedMap(gs.GameData, "walls")
	if ppIntFrom(walls["w0"]) != tankBattleWallMaxHP-20 {
		t.Fatalf("expected wall w0 to drop by 20, got %v", walls["w0"])
	}
	// Other walls must be untouched.
	if ppIntFrom(walls["w1"]) != tankBattleWallMaxHP {
		t.Fatalf("expected wall w1 to be untouched, got %v", walls["w1"])
	}
}

func TestTankBattleWallHitEitherPlayerCanReport(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	// A wall has no "owner" the way a tank does — either player's bullet can
	// hit it, so player 2 reporting damage should work exactly like player 1.
	if _, _, err := gm.processTankBattleMove(gs, 2, map[string]interface{}{
		"move_type": "wall_hit", "wall_id": "w2", "damage": 20.0,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	walls := tankBattleNestedMap(gs.GameData, "walls")
	if ppIntFrom(walls["w2"]) != tankBattleWallMaxHP-20 {
		t.Fatalf("expected wall w2 to take damage reported by player 2, got %v", walls["w2"])
	}
}

func TestTankBattleWallHitClampsAtZeroNotNegative(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	// tankBattleWallMaxHP is 60 — 4 hits of 20 damage would go to -20
	// without clamping.
	for i := 0; i < 4; i++ {
		if _, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
			"move_type": "wall_hit", "wall_id": "w0", "damage": 20.0,
		}); err != nil {
			t.Fatalf("unexpected error on hit %d: %v", i, err)
		}
	}
	walls := tankBattleNestedMap(gs.GameData, "walls")
	if ppIntFrom(walls["w0"]) != 0 {
		t.Fatalf("expected a broken wall's HP to clamp at 0, not go negative, got %v", walls["w0"])
	}
}

func TestTankBattleWallHitRejectsUnknownWallID(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	_, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "wall_hit", "wall_id": "w99", "damage": 20.0,
	})
	if err == nil {
		t.Fatalf("expected an error for a wall_id that was never seeded at game start")
	}
}

func TestTankBattleGrabPickupHealAppliesAndCapsAtMaxHP(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}
	// Damage player 1 down first so the heal has room to matter.
	if _, _, err := gm.processTankBattleMove(gs, 2, map[string]interface{}{
		"move_type": "hit", "target_player_id": 1.0, "damage": 90.0,
	}); err != nil {
		t.Fatalf("unexpected error setting up damage: %v", err)
	}
	scores := ppScoreMap(gs.GameData)
	if ppIntFrom(scores["1"]) != 10 {
		t.Fatalf("setup failed, expected player 1 at 10 HP, got %v", scores["1"])
	}

	if _, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "grab_pickup", "pickup_id": "p0", "pickup_type": "health",
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	scores = ppScoreMap(gs.GameData)
	if ppIntFrom(scores["1"]) != 10+tankBattleHealAmount {
		t.Fatalf("expected player 1 to heal by %d to %d HP, got %v", tankBattleHealAmount, 10+tankBattleHealAmount, scores["1"])
	}

	// A second, larger heal should cap at max_hp (100) rather than overshoot.
	if _, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "grab_pickup", "pickup_id": "p1", "pickup_type": "health",
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	scores = ppScoreMap(gs.GameData)
	if ppIntFrom(scores["1"]) != 70 {
		t.Fatalf("expected player 1 at 40+30=70 HP after the second heal, got %v", scores["1"])
	}
	if _, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "grab_pickup", "pickup_id": "p2", "pickup_type": "health",
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	scores = ppScoreMap(gs.GameData)
	if ppIntFrom(scores["1"]) != 100 {
		t.Fatalf("expected healing to cap at 100 HP (70+30=100, exactly at cap), got %v", scores["1"])
	}
}

func TestTankBattleGrabPickupEffectSetsFutureExpiry(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	before := time.Now().UnixMilli()
	if _, _, err := gm.processTankBattleMove(gs, 2, map[string]interface{}{
		"move_type": "grab_pickup", "pickup_id": "p0", "pickup_type": "shield",
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	effects := tankBattleNestedMap(gs.GameData, "effects")
	entry, ok := effects["2"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected an effects entry for player 2, got %v", effects["2"])
	}
	if entry["type"] != "shield" {
		t.Fatalf("expected effect type 'shield', got %v", entry["type"])
	}
	expiresAt, ok := ppFloat(entry["expires_at"])
	if !ok || int64(expiresAt) <= before {
		t.Fatalf("expected expires_at to be a real future timestamp, got %v (grabbed at %d)", entry["expires_at"], before)
	}
	// Grabbing a shield must never touch HP — it's a defensive buff, not healing.
	scores := ppScoreMap(gs.GameData)
	if ppIntFrom(scores["2"]) != 100 {
		t.Fatalf("expected player 2's HP untouched by a shield grab, got %v", scores["2"])
	}
}

func TestTankBattleGrabPickupSecondSlotOverwritesFirst(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	if _, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "grab_pickup", "pickup_id": "p0", "pickup_type": "speed",
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "grab_pickup", "pickup_id": "p1", "pickup_type": "rapidfire",
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	effects := tankBattleNestedMap(gs.GameData, "effects")
	entry, ok := effects["1"].(map[string]interface{})
	if !ok || entry["type"] != "rapidfire" {
		t.Fatalf("expected the newer rapidfire pickup to overwrite the older speed one in the single effect slot, got %v", effects["1"])
	}
}

func TestTankBattleGrabPickupFirstWriteWinsOnRace(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	// Player 1 grabs it first...
	if _, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "grab_pickup", "pickup_id": "p0", "pickup_type": "health",
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	scoresAfterFirstGrab := ppScoreMap(gs.GameData)
	p1HPAfterFirst := ppIntFrom(scoresAfterFirstGrab["1"])

	// ...player 2's request for the SAME pickup_id arrives moments later
	// (the realistic race: both tanks were near it at roughly the same
	// instant) — must be a silent no-op, not a second heal.
	if _, _, err := gm.processTankBattleMove(gs, 2, map[string]interface{}{
		"move_type": "grab_pickup", "pickup_id": "p0", "pickup_type": "health",
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	scores := ppScoreMap(gs.GameData)
	if ppIntFrom(scores["1"]) != p1HPAfterFirst {
		t.Fatalf("player 1's HP should be unaffected by player 2's lost race, got %v", scores["1"])
	}
	if ppIntFrom(scores["2"]) != 100 {
		t.Fatalf("player 2 should NOT have been healed — they lost the race for this pickup, got %v", scores["2"])
	}
	grabbed := tankBattleNestedMap(gs.GameData, "pickups_grabbed")
	if ppFloat64Eq(grabbed["p0"], 1) == false {
		t.Fatalf("expected pickup p0 to remain attributed to player 1 (the winner), got %v", grabbed["p0"])
	}
}

func TestTankBattleGrabPickupRejectsMissingFields(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	if _, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "grab_pickup", "pickup_type": "health",
	}); err == nil {
		t.Fatalf("expected an error when pickup_id is missing")
	}
	if _, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "grab_pickup", "pickup_id": "p0",
	}); err == nil {
		t.Fatalf("expected an error when pickup_type is missing")
	}
}

func TestTankBattleGrabPickupRejectsUnknownType(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	_, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "grab_pickup", "pickup_id": "p0", "pickup_type": "invincibility",
	})
	if err == nil {
		t.Fatalf("expected an error for a pickup_type this game doesn't recognize")
	}
}

func TestTankBattleStateSyncRelaysEffectFlags(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	if _, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "state_sync", "x": 1.0, "y": 2.0, "angle": 0.0, "turret_angle": 0.0, "vx": 0.0, "vy": 0.0,
		"shield_active": true,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	snap, _ := gs.GameData["tank_1"].(map[string]interface{})
	if snap["shield_active"] != true {
		t.Fatalf("expected shield_active:true to be relayed in the tank snapshot, got %v", snap)
	}
}

func TestTankBattleFireRelaysPoweredFlag(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2)
	for k, v := range tankBattleInitialState([]uint{1, 2}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	if _, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
		"move_type": "fire", "x": 10.0, "y": 20.0, "angle": 0.0, "powered": true,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	lastFire, _ := gs.GameData["last_fire"].(map[string]interface{})
	if lastFire["powered"] != true {
		t.Fatalf("expected a power-shot fire event to relay powered:true, got %v", lastFire)
	}
}

// ppFloat64Eq is a tiny helper local to this test file — grabbed values in
// pickups_grabbed are stored as float64(playerID), so a plain == against an
// untyped int constant would never match; this makes that comparison explicit
// and readable at each call site instead.
func ppFloat64Eq(v interface{}, want int) bool {
	f, ok := ppFloat(v)
	return ok && int(f) == want
}

// ---------- N-player free-for-all ----------

func TestTankBattleInitialStateSeedsAllNPlayers(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2, 3, 4)
	for k, v := range tankBattleInitialState([]uint{1, 2, 3, 4}) {
		gs.GameData[k] = v
	}
	scores := ppScoreMap(gs.GameData)
	for _, id := range []string{"1", "2", "3", "4"} {
		if ppIntFrom(scores[id]) != 100 {
			t.Fatalf("expected player %s to start at 100 HP, got %v", id, scores[id])
		}
	}
	playerIDs, ok := gs.GameData["player_ids"].([]string)
	if !ok || len(playerIDs) != 4 {
		t.Fatalf("expected a 4-entry player_ids list, got %v", gs.GameData["player_ids"])
	}
	if playerIDs[0] != "1" || playerIDs[3] != "4" {
		t.Fatalf("expected player_ids to preserve the given order, got %v", playerIDs)
	}
}

func TestTankBattleFreeForAllContinuesUntilOneSurvivorRemains(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2, 3, 4)
	for k, v := range tankBattleInitialState([]uint{1, 2, 3, 4}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	// Player 1 eliminates player 2 — 3 players still standing (1, 3, 4), so
	// the match must NOT end yet, unlike the old strict-2-player behavior.
	for i := 0; i < 5; i++ {
		gameOver, winnerID, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
			"move_type": "hit", "target_player_id": 2.0, "damage": 20.0,
		})
		if err != nil {
			t.Fatalf("unexpected error on hit %d: %v", i, err)
		}
		if gameOver {
			t.Fatalf("eliminating one of four players should not end a free-for-all, got gameOver on hit %d, winner=%v", i, winnerID)
		}
	}
	scores := ppScoreMap(gs.GameData)
	if ppIntFrom(scores["2"]) != 0 {
		t.Fatalf("expected player 2 to be at 0 HP, got %v", scores["2"])
	}
	phase, _ := gs.GameData["phase"].(string)
	if phase == "ended" {
		t.Fatalf("phase should still be 'playing' with 3 survivors remaining")
	}

	// Player 3 eliminates player 4 — now only players 1 and 3 remain, still
	// not a win (2 survivors).
	for i := 0; i < 5; i++ {
		if _, _, err := gm.processTankBattleMove(gs, 3, map[string]interface{}{
			"move_type": "hit", "target_player_id": 4.0, "damage": 20.0,
		}); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	}
	phase, _ = gs.GameData["phase"].(string)
	if phase == "ended" {
		t.Fatalf("phase should still be 'playing' with 2 survivors (1 and 3) remaining")
	}

	// Player 1 eliminates player 3 — exactly one survivor (player 1) left,
	// THIS is what should finally end the match.
	var gameOver bool
	var winnerID *uint
	var err error
	for i := 0; i < 5; i++ {
		gameOver, winnerID, err = gm.processTankBattleMove(gs, 1, map[string]interface{}{
			"move_type": "hit", "target_player_id": 3.0, "damage": 20.0,
		})
		if err != nil {
			t.Fatalf("unexpected error on final hit %d: %v", i, err)
		}
	}
	if !gameOver {
		t.Fatalf("expected the match to end once only one player (1) has HP remaining")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Fatalf("expected player 1 (the sole survivor) to win, got %v", winnerID)
	}
	phase, _ = gs.GameData["phase"].(string)
	if phase != "ended" {
		t.Fatalf("expected phase to be 'ended', got %q", phase)
	}
}

func TestTankBattleFreeForAllHitOnAlreadyEliminatedTargetIsHarmless(t *testing.T) {
	gs := makeGS("tank_battle", 1, 2, 3)
	for k, v := range tankBattleInitialState([]uint{1, 2, 3}) {
		gs.GameData[k] = v
	}
	gm := &GameManager{}

	for i := 0; i < 5; i++ {
		if _, _, err := gm.processTankBattleMove(gs, 1, map[string]interface{}{
			"move_type": "hit", "target_player_id": 2.0, "damage": 20.0,
		}); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	}
	// Player 3 (a different shooter) also fires at the already-eliminated
	// player 2 — should clamp at 0 and never end the match by itself, since
	// player 3 is still alive too.
	gameOver, _, err := gm.processTankBattleMove(gs, 3, map[string]interface{}{
		"move_type": "hit", "target_player_id": 2.0, "damage": 20.0,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver {
		t.Fatalf("hitting an already-dead target should not end a match with 2 other survivors still standing")
	}
	scores := ppScoreMap(gs.GameData)
	if ppIntFrom(scores["2"]) != 0 {
		t.Fatalf("expected player 2's HP to stay clamped at 0, got %v", scores["2"])
	}
}
