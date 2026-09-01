package games

import (
	"fmt"
	"testing"
)

func makeBombermanGS(playerIDs ...uint) *GameSessionState {
	gs := makeGS("bomberman", playerIDs...)
	for k, v := range bombermanInitialState(playerIDs) {
		gs.GameData[k] = v
	}
	return gs
}

func TestBombermanInitialStateSeedsAllPlayersAlive(t *testing.T) {
	gs := makeBombermanGS(1, 2, 3)
	alive := bombermanAliveMap(gs.GameData)
	for _, id := range []uint{1, 2, 3} {
		key := ""
		switch id {
		case 1:
			key = "1"
		case 2:
			key = "2"
		case 3:
			key = "3"
		}
		if isAlive, ok := alive[key].(bool); !ok || !isAlive {
			t.Fatalf("expected player %d to start alive, got %v", id, alive[key])
		}
	}
	phase, _ := gs.GameData["phase"].(string)
	if phase != "playing" {
		t.Fatalf("expected phase=playing, got %q", phase)
	}
}

func TestBombermanIndestructibleGridPattern(t *testing.T) {
	// Border must always be solid.
	if !bombermanIsIndestructible(0, 5) || !bombermanIsIndestructible(bombermanRows-1, 5) {
		t.Fatalf("expected the top/bottom border rows to be indestructible")
	}
	if !bombermanIsIndestructible(4, 0) || !bombermanIsIndestructible(4, bombermanCols-1) {
		t.Fatalf("expected the left/right border columns to be indestructible")
	}
	// Inner even-even pillar.
	if !bombermanIsIndestructible(2, 2) {
		t.Fatalf("expected (2,2) to be an indestructible inner pillar")
	}
	// A genuine walkable inner cell.
	if bombermanIsIndestructible(1, 2) {
		t.Fatalf("expected (1,2) to be walkable, not indestructible")
	}
}

func TestBombermanSpawnZonesStayClear(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	softWalls, _ := gs.GameData["soft_walls"].([]interface{})
	for _, raw := range softWalls {
		pair, ok := raw.([]interface{})
		if !ok || len(pair) != 3 { // [r, c, tier]
			t.Fatalf("malformed soft_walls entry: %v", raw)
		}
		r := int(pair[0].(float64))
		c := int(pair[1].(float64))
		tier := int(pair[2].(float64))
		if bombermanIsSpawnZone(r, c) {
			t.Fatalf("a soft wall was generated inside a spawn zone at (%d,%d)", r, c)
		}
		if tier < 1 || tier > 3 {
			t.Fatalf("expected every wall's tier to be 1-3 (wooden/concrete/iron), got %d at (%d,%d)", tier, r, c)
		}
	}
}

func TestBombermanStateSyncRelaysOwnPositionOnly(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gm := &GameManager{}

	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "state_sync", "x": 77.0, "y": 88.0,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	snap, ok := gs.GameData["player_1"].(map[string]interface{})
	if !ok || snap["x"] != 77.0 || snap["y"] != 88.0 {
		t.Fatalf("expected player_1 snapshot with x=77,y=88, got %v", gs.GameData["player_1"])
	}
	if _, exists := gs.GameData["player_2"]; exists {
		t.Fatalf("player 1's state_sync should never write player 2's own key")
	}
}

func TestBombermanPlaceBombSucceedsOnWalkableCell(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gm := &GameManager{}

	gameOver, winnerID, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "place_bomb", "r": 1.0, "c": 2.0,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatalf("placing a bomb should never end the game by itself")
	}
	bombs := bombermanActiveBombs(gs.GameData)
	if len(bombs) != 1 {
		t.Fatalf("expected exactly 1 active bomb, got %d", len(bombs))
	}
	placed, ok := bombs["1"].(map[string]interface{})
	if !ok || placed["r"] != 1.0 || placed["c"] != 2.0 || placed["owner_id"] != 1.0 {
		t.Fatalf("unexpected bomb contents at key \"1\": %v", placed)
	}
}

func TestBombermanPlaceBombRejectsWallCell(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gm := &GameManager{}

	_, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "place_bomb", "r": 2.0, "c": 2.0, // a known inner pillar
	})
	if err == nil {
		t.Fatalf("expected an error placing a bomb on an indestructible wall cell")
	}
}

// TestBombermanStackingAllowsUpToTheCapThenRejects covers "stacking" — the
// raised bombermanMaxBombsPerPlayer cap (was a hard 1). A player should be
// able to place multiple bombs at once (up to the cap), and only the one
// PAST the cap should be rejected.
func TestBombermanStackingAllowsUpToTheCapThenRejects(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gm := &GameManager{}

	cells := [][2]float64{{1, 2}, {3, 4}, {5, 6}, {1, 4}}
	for i := 0; i < bombermanMaxBombsPerPlayer; i++ {
		if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
			"move_type": "place_bomb", "r": cells[i][0], "c": cells[i][1],
		}); err != nil {
			t.Fatalf("unexpected error placing bomb %d of %d: %v", i+1, bombermanMaxBombsPerPlayer, err)
		}
	}
	if got := len(bombermanActiveBombs(gs.GameData)); got != bombermanMaxBombsPerPlayer {
		t.Fatalf("expected %d active bombs after stacking up to the cap, got %d", bombermanMaxBombsPerPlayer, got)
	}

	_, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "place_bomb", "r": cells[bombermanMaxBombsPerPlayer][0], "c": cells[bombermanMaxBombsPerPlayer][1],
	})
	if err == nil {
		t.Fatalf("expected an error placing a bomb past the %d-bomb cap", bombermanMaxBombsPerPlayer)
	}
}

func TestBombermanPlaceBombRejectsEliminatedPlayer(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	alive := bombermanAliveMap(gs.GameData)
	alive["1"] = false
	gs.GameData["players_alive"] = alive
	gm := &GameManager{}

	_, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "place_bomb", "r": 1.0, "c": 2.0,
	})
	if err == nil {
		t.Fatalf("expected an error letting an eliminated player place a bomb")
	}
}

func TestBombermanExplodeRejectsNonOwner(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gm := &GameManager{}

	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "place_bomb", "r": 1.0, "c": 2.0,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	_, _, err := gm.processBombermanMove(gs, 2, map[string]interface{}{
		"move_type": "explode", "bomb_id": 1.0,
	})
	if err == nil {
		t.Fatalf("expected an error when a non-owner tries to resolve someone else's bomb")
	}
}

func TestBombermanExplodeUnknownBombIsHarmlessNoop(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gm := &GameManager{}

	gameOver, winnerID, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "explode", "bomb_id": 999.0,
	})
	if err != nil {
		t.Fatalf("unexpected error resolving an unknown bomb_id: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatalf("an unknown bomb_id should be a harmless no-op, not end the game")
	}
}

func TestBombermanExplodeAppliesWallDestructionAndElimination(t *testing.T) {
	gs := makeBombermanGS(1, 2, 3)
	gm := &GameManager{}

	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "place_bomb", "r": 1.0, "c": 2.0,
	}); err != nil {
		t.Fatalf("unexpected error placing bomb: %v", err)
	}

	gameOver, winnerID, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type":       "explode",
		"bomb_id":         1.0,
		"wall_hits_delta": []interface{}{[]interface{}{1.0, 3.0}},
		"hit_player_ids":  []interface{}{2.0},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver {
		t.Fatalf("with 2 players still alive (1 and 3), the game should not be over yet")
	}
	if winnerID != nil {
		t.Fatalf("expected no winner yet, got %v", *winnerID)
	}

	wallHits, _ := gs.GameData["wall_hits"].(map[string]interface{})
	if got := ppIntFrom(wallHits["1,3"]); got != 1 {
		t.Fatalf("expected wall (1,3) to have exactly 1 recorded hit, got %d (wall_hits=%v)", got, wallHits)
	}
	alive := bombermanAliveMap(gs.GameData)
	if isAlive, _ := alive["2"].(bool); isAlive {
		t.Fatalf("expected player 2 to be eliminated")
	}
	if isAlive, ok := alive["1"].(bool); !ok || !isAlive {
		t.Fatalf("expected player 1 (the bomber) to still be alive")
	}
	if isAlive, ok := alive["3"].(bool); !ok || !isAlive {
		t.Fatalf("expected player 3 (untouched) to still be alive")
	}
	// The resolved bomb must no longer be active.
	if len(bombermanActiveBombs(gs.GameData)) != 0 {
		t.Fatalf("expected the resolved bomb to be removed from active_bombs")
	}
}

func TestBombermanExplodeDeclaresWinnerWhenOneRemains(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gm := &GameManager{}

	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "place_bomb", "r": 1.0, "c": 2.0,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	gameOver, winnerID, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "explode", "bomb_id": 1.0, "hit_player_ids": []interface{}{2.0},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !gameOver {
		t.Fatalf("expected the game to end once only player 1 remains alive")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Fatalf("expected player 1 to be declared winner, got %v", winnerID)
	}
	phase, _ := gs.GameData["phase"].(string)
	if phase != "ended" {
		t.Fatalf("expected phase=ended, got %q", phase)
	}
}

func TestBombermanExplodeCanCatchTheBomberThemselves(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gm := &GameManager{}

	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "place_bomb", "r": 1.0, "c": 2.0,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// A bomb owner can legitimately report catching themselves in their own
	// blast (a real, classic Bomberman risk) as well as their opponent —
	// eliminating both at once should be a draw, not a crash.
	gameOver, winnerID, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "explode", "bomb_id": 1.0, "hit_player_ids": []interface{}{1.0, 2.0},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !gameOver {
		t.Fatalf("expected the game to end once both players are eliminated")
	}
	if winnerID != nil {
		t.Fatalf("expected a draw (nil winner) when both players are eliminated simultaneously, got %v", *winnerID)
	}
}

func TestBombermanExplodeIgnoredOncePhaseEnded(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gs.GameData["phase"] = "ended"
	gm := &GameManager{}

	gameOver, winnerID, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "explode", "bomb_id": 1.0, "hit_player_ids": []interface{}{2.0},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatalf("an explode reported after the game already ended should be a harmless no-op")
	}
}

func TestBombermanForcedEndDeclaresSoleSurvivorWinner(t *testing.T) {
	gs := makeBombermanGS(1, 2, 3)
	alive := bombermanAliveMap(gs.GameData)
	alive["2"] = false
	alive["3"] = false
	gs.GameData["players_alive"] = alive
	gm := &GameManager{}

	gameOver, winnerID, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "bomberman_end"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !gameOver {
		t.Fatalf("expected bomberman_end to end the game")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Fatalf("expected the sole surviving player 1 to win a forced end, got %v", winnerID)
	}
}

func TestBombermanForcedEndMultipleSurvivorsIsADraw(t *testing.T) {
	gs := makeBombermanGS(1, 2, 3)
	gm := &GameManager{}

	gameOver, winnerID, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "bomberman_end"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !gameOver {
		t.Fatalf("expected bomberman_end to end the game even with multiple survivors")
	}
	if winnerID != nil {
		t.Fatalf("expected a draw (nil winner) when 2+ players are still alive at a forced end, got %v", *winnerID)
	}
}

// TestBombermanWallSurvivesUntilHitCountReachesTier is the core acceptance
// test for multi-tier walls: a concrete (tier 2) wall's cell reported as
// hit twice by two separate explosions should accumulate to a hit count of
// 2, matching its tier — it's the frontend's own job (using the tier from
// soft_walls) to treat that as "now destroyed", but the backend's role is
// simply to keep an accurate running tally regardless of how many separate
// blasts it takes.
func TestBombermanWallSurvivesUntilHitCountReachesTier(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gm := &GameManager{}

	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "place_bomb", "r": 1.0, "c": 2.0,
	}); err != nil {
		t.Fatalf("unexpected error placing first bomb: %v", err)
	}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "explode", "bomb_id": 1.0, "wall_hits_delta": []interface{}{[]interface{}{4.0, 5.0}},
	}); err != nil {
		t.Fatalf("unexpected error on first explode: %v", err)
	}
	wallHits, _ := gs.GameData["wall_hits"].(map[string]interface{})
	if got := ppIntFrom(wallHits["4,5"]); got != 1 {
		t.Fatalf("expected 1 hit after the first blast, got %d", got)
	}

	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "place_bomb", "r": 3.0, "c": 4.0,
	}); err != nil {
		t.Fatalf("unexpected error placing second bomb: %v", err)
	}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "explode", "bomb_id": 2.0, "wall_hits_delta": []interface{}{[]interface{}{4.0, 5.0}},
	}); err != nil {
		t.Fatalf("unexpected error on second explode: %v", err)
	}
	wallHits, _ = gs.GameData["wall_hits"].(map[string]interface{})
	if got := ppIntFrom(wallHits["4,5"]); got != 2 {
		t.Fatalf("expected the SAME wall cell's hit count to reach 2 after a second separate blast, got %d", got)
	}
}

// TestBombermanChainReactionFlagsTargetBombForced is the core acceptance
// test for chaining: reporting chained_bomb_ids on an explode move must
// flag exactly those OTHER active bombs `forced: true` — never resolve
// them directly (only their own owner may, per this file's own trust
// model), and never touch the bomb that's exploding right now even if it
// somehow appears in its own chained list.
func TestBombermanChainReactionFlagsTargetBombForced(t *testing.T) {
	gs := makeBombermanGS(1, 2, 3)
	gm := &GameManager{}

	// Player 1 places a bomb (id 1); player 2 places a second, separate bomb
	// (id 2) that player 1's blast is about to catch.
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "place_bomb", "r": 1.0, "c": 2.0,
	}); err != nil {
		t.Fatalf("unexpected error placing player 1's bomb: %v", err)
	}
	if _, _, err := gm.processBombermanMove(gs, 2, map[string]interface{}{
		"move_type": "place_bomb", "r": 1.0, "c": 9.0,
	}); err != nil {
		t.Fatalf("unexpected error placing player 2's bomb: %v", err)
	}

	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "explode", "bomb_id": 1.0, "chained_bomb_ids": []interface{}{2.0, 1.0}, // 1.0 = itself, must be ignored
	}); err != nil {
		t.Fatalf("unexpected error resolving player 1's bomb with a chain report: %v", err)
	}

	activeBombs := bombermanActiveBombs(gs.GameData)
	if _, stillActive := activeBombs["1"]; stillActive {
		t.Fatalf("the exploding bomb itself (id 1) should have been removed from active_bombs, not left behind")
	}
	chainedBomb, ok := activeBombs["2"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected bomb id 2 to still be present (only its own owner may resolve it), got %v", activeBombs)
	}
	if forced, _ := chainedBomb["forced"].(bool); !forced {
		t.Fatalf("expected bomb id 2 to be flagged forced=true after being chained, got %v", chainedBomb)
	}

	// Now player 2 (bomb 2's real owner) resolves their own chained bomb —
	// same explode call any owner would send, just triggered early.
	gameOver, winnerID, err := gm.processBombermanMove(gs, 2, map[string]interface{}{
		"move_type": "explode", "bomb_id": 2.0, "hit_player_ids": []interface{}{3.0},
	})
	if err != nil {
		t.Fatalf("unexpected error letting bomb 2's real owner resolve the chained bomb: %v", err)
	}
	if gameOver {
		t.Fatalf("2 players (1 and 2) should still remain alive after only player 3 is eliminated")
	}
	if winnerID != nil {
		t.Fatalf("expected no winner yet, got %v", *winnerID)
	}
	if len(bombermanActiveBombs(gs.GameData)) != 0 {
		t.Fatalf("expected both bombs to now be resolved and removed from active_bombs")
	}
}

// TestBombermanChainCannotBeTriggeredByNonOwner is a direct defense-in-depth
// check: even once a bomb is flagged forced, only ITS OWN owner can still
// actually resolve it — chaining must never become a backdoor around the
// existing ownership check.
func TestBombermanChainCannotBeTriggeredByNonOwner(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gm := &GameManager{}

	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "place_bomb", "r": 1.0, "c": 2.0,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processBombermanMove(gs, 2, map[string]interface{}{
		"move_type": "place_bomb", "r": 1.0, "c": 9.0,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Player 1 detonates their own bomb (id 1) and reports chaining player
	// 2's bomb (id 2) — this only flags it, it does not grant player 1
	// resolution rights over it.
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "explode", "bomb_id": 1.0, "chained_bomb_ids": []interface{}{2.0},
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	_, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "explode", "bomb_id": 2.0,
	})
	if err == nil {
		t.Fatalf("expected player 1 to still be rejected trying to resolve player 2's (now-chained) bomb 2 themselves")
	}
}

func TestBombermanUnknownMoveTypeRejected(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gm := &GameManager{}

	_, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "teleport"})
	if err == nil {
		t.Fatalf("expected an error for an unrecognized move type")
	}
}

// ---------- Carrying walls ----------

func TestBombermanPickupWallRemovesFromSoftWallsAndTracksCarrying(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	// Replace the randomly-generated layout with one deterministic wooden
	// wall so this test doesn't depend on the random generator having
	// placed anything at a specific cell.
	gs.GameData["soft_walls"] = []interface{}{[]interface{}{5.0, 5.0, float64(bombermanWallTierWood)}}
	gm := &GameManager{}

	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "pickup_wall", "r": 5.0, "c": 5.0,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	softWalls, _ := gs.GameData["soft_walls"].([]interface{})
	if len(softWalls) != 0 {
		t.Fatalf("expected the wall to be removed from soft_walls, got %v", softWalls)
	}
	carried := bombermanCarriedWalls(gs.GameData)
	entry, ok := carried["1"].([]interface{})
	if !ok || len(entry) < 2 {
		t.Fatalf("expected carried_walls[1] to be set, got %v", carried["1"])
	}
	if tier, _ := ppFloat(entry[0]); int(tier) != bombermanWallTierWood {
		t.Fatalf("expected carried tier %d, got %v", bombermanWallTierWood, entry[0])
	}
	if hits, _ := ppFloat(entry[1]); hits != 0 {
		t.Fatalf("expected 0 carried hits for an undamaged wall, got %v", entry[1])
	}
}

func TestBombermanPickupWallPreservesExistingDamage(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gs.GameData["soft_walls"] = []interface{}{[]interface{}{5.0, 5.0, float64(bombermanWallTierIron)}}
	gs.GameData["wall_hits"] = map[string]interface{}{"5,5": float64(2)}
	gm := &GameManager{}

	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "pickup_wall", "r": 5.0, "c": 5.0,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	carried := bombermanCarriedWalls(gs.GameData)
	entry, _ := carried["1"].([]interface{})
	if hits, _ := ppFloat(entry[1]); hits != 2 {
		t.Fatalf("expected the wall's existing 2 hits to travel with it when picked up, got %v", entry[1])
	}
	wallHits, _ := gs.GameData["wall_hits"].(map[string]interface{})
	if _, exists := wallHits["5,5"]; exists {
		t.Fatalf("expected the origin cell's wall_hits entry to be cleared once picked up, still has %v", wallHits["5,5"])
	}
}

func TestBombermanPickupWallRejectsWhenAlreadyCarrying(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gs.GameData["soft_walls"] = []interface{}{
		[]interface{}{5.0, 5.0, float64(bombermanWallTierWood)},
		[]interface{}{6.0, 6.0, float64(bombermanWallTierWood)},
	}
	gm := &GameManager{}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "pickup_wall", "r": 5.0, "c": 5.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "pickup_wall", "r": 6.0, "c": 6.0}); err == nil {
		t.Fatalf("expected an error picking up a second wall while already carrying one")
	}
}

func TestBombermanPickupWallRejectsEmptyCell(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gs.GameData["soft_walls"] = []interface{}{}
	gm := &GameManager{}
	_, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "pickup_wall", "r": 5.0, "c": 5.0})
	if err == nil {
		t.Fatalf("expected an error picking up a wall from a cell with none")
	}
}

func TestBombermanDropWallRestoresWallAndDamage(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gs.GameData["soft_walls"] = []interface{}{[]interface{}{5.0, 5.0, float64(bombermanWallTierConcrete)}}
	gs.GameData["wall_hits"] = map[string]interface{}{"5,5": float64(1)}
	gm := &GameManager{}

	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "pickup_wall", "r": 5.0, "c": 5.0}); err != nil {
		t.Fatalf("unexpected error on pickup: %v", err)
	}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "drop_wall", "r": 3.0, "c": 3.0}); err != nil {
		t.Fatalf("unexpected error on drop: %v", err)
	}
	softWalls, _ := gs.GameData["soft_walls"].([]interface{})
	idx, tier := bombermanFindSoftWall(softWalls, 3, 3)
	if idx == -1 {
		t.Fatalf("expected a wall to now stand at the drop cell (3,3), got %v", softWalls)
	}
	if tier != bombermanWallTierConcrete {
		t.Fatalf("expected the dropped wall's tier to be preserved (concrete=%d), got %d", bombermanWallTierConcrete, tier)
	}
	wallHits, _ := gs.GameData["wall_hits"].(map[string]interface{})
	if got := ppIntFrom(wallHits["3,3"]); got != 1 {
		t.Fatalf("expected the wall's 1 accumulated hit to be restored at the new location, got %d", got)
	}
	if len(bombermanCarriedWalls(gs.GameData)) != 0 {
		t.Fatalf("expected carried_walls to be empty after a successful drop")
	}
}

func TestBombermanDropWallRejectsWhenNotCarrying(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gm := &GameManager{}
	_, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "drop_wall", "r": 3.0, "c": 3.0})
	if err == nil {
		t.Fatalf("expected an error dropping a wall when not carrying one")
	}
}

func TestBombermanDropWallRejectsOccupiedCell(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gs.GameData["soft_walls"] = []interface{}{
		[]interface{}{5.0, 5.0, float64(bombermanWallTierWood)},
		[]interface{}{3.0, 3.0, float64(bombermanWallTierWood)},
	}
	gm := &GameManager{}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "pickup_wall", "r": 5.0, "c": 5.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "drop_wall", "r": 3.0, "c": 3.0}); err == nil {
		t.Fatalf("expected an error dropping onto a cell that already has a wall")
	}
}

func TestBombermanDropWallRejectsIndestructibleCell(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gs.GameData["soft_walls"] = []interface{}{[]interface{}{5.0, 5.0, float64(bombermanWallTierWood)}}
	gm := &GameManager{}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "pickup_wall", "r": 5.0, "c": 5.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// (0,0) is the permanent border — always indestructible.
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "drop_wall", "r": 0.0, "c": 0.0}); err == nil {
		t.Fatalf("expected an error dropping a wall onto an indestructible cell")
	}
}

func TestBombermanDropWallRejectsCellWithLiveBomb(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gs.GameData["soft_walls"] = []interface{}{[]interface{}{5.0, 5.0, float64(bombermanWallTierWood)}}
	gm := &GameManager{}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "pickup_wall", "r": 5.0, "c": 5.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "place_bomb", "r": 3.0, "c": 3.0}); err != nil {
		t.Fatalf("unexpected error placing bomb: %v", err)
	}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "drop_wall", "r": 3.0, "c": 3.0}); err == nil {
		t.Fatalf("expected an error dropping a wall onto a cell with a live bomb")
	}
}

// ---------- Kick ----------

func TestBombermanKickBombRequiresKickUpgrade(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gm := &GameManager{}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "place_bomb", "r": 3.0, "c": 3.0}); err != nil {
		t.Fatalf("unexpected error placing bomb: %v", err)
	}
	_, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "kick_bomb", "bomb_id": 1.0, "new_r": 3.0, "new_c": 5.0,
	})
	if err == nil {
		t.Fatalf("expected an error kicking a bomb without the Kick upgrade")
	}
}

func TestBombermanKickBombRelocatesBomb(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gs.GameData["player_upgrades"] = map[string]interface{}{"1": map[string]interface{}{"has_kick": true}}
	gm := &GameManager{}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "place_bomb", "r": 3.0, "c": 3.0}); err != nil {
		t.Fatalf("unexpected error placing bomb: %v", err)
	}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "kick_bomb", "bomb_id": 1.0, "new_r": 3.0, "new_c": 7.0,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	bombs := bombermanActiveBombs(gs.GameData)
	bomb, _ := bombs["1"].(map[string]interface{})
	if r, _ := ppFloat(bomb["r"]); int(r) != 3 {
		t.Fatalf("expected row unchanged at 3, got %v", bomb["r"])
	}
	if c, _ := ppFloat(bomb["c"]); int(c) != 7 {
		t.Fatalf("expected the bomb relocated to column 7, got %v", bomb["c"])
	}
}

func TestBombermanKickBombAnyPlayerCanKickAnyonesBombs(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	// Player 2 has Kick, player 1 (the bomb's actual owner) does not —
	// classic Bomberman explicitly allows kicking an OPPONENT's bomb, no
	// ownership check the way "explode" has.
	gs.GameData["player_upgrades"] = map[string]interface{}{"2": map[string]interface{}{"has_kick": true}}
	gm := &GameManager{}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "place_bomb", "r": 3.0, "c": 3.0}); err != nil {
		t.Fatalf("unexpected error placing bomb: %v", err)
	}
	if _, _, err := gm.processBombermanMove(gs, 2, map[string]interface{}{
		"move_type": "kick_bomb", "bomb_id": 1.0, "new_r": 3.0, "new_c": 9.0,
	}); err != nil {
		t.Fatalf("expected player 2 to be able to kick player 1's bomb, got error: %v", err)
	}
	bombs := bombermanActiveBombs(gs.GameData)
	bomb, _ := bombs["1"].(map[string]interface{})
	if c, _ := ppFloat(bomb["c"]); int(c) != 9 {
		t.Fatalf("expected the bomb relocated to column 9, got %v", bomb["c"])
	}
}

func TestBombermanKickBombUnknownBombIsHarmlessNoop(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gs.GameData["player_upgrades"] = map[string]interface{}{"1": map[string]interface{}{"has_kick": true}}
	gm := &GameManager{}
	_, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type": "kick_bomb", "bomb_id": 999.0, "new_r": 3.0, "new_c": 7.0,
	})
	if err != nil {
		t.Fatalf("expected a harmless no-op for a bomb that no longer exists, got error: %v", err)
	}
}

// ---------- Power-up pickups ----------

func TestBombermanGrabPickupAppliesBlastBonus(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gs.GameData["pickups"] = map[string]interface{}{"4,4": "blast"}
	gm := &GameManager{}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "grab_pickup", "r": 4.0, "c": 4.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	upgrades := bombermanPlayerUpgrade(bombermanUpgradesMap(gs.GameData), "1")
	if got := ppIntFrom(upgrades["blast_bonus"]); got != 1 {
		t.Fatalf("expected blast_bonus=1, got %d", got)
	}
	if _, stillThere := bombermanPickupsMap(gs.GameData)["4,4"]; stillThere {
		t.Fatalf("expected the pickup to be removed from the grid once grabbed")
	}
}

func TestBombermanGrabPickupCapsAtMax(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gm := &GameManager{}
	for i := 0; i < bombermanMaxBlastBonus+2; i++ {
		key := fmt.Sprintf("%d,%d", i, i+1)
		gs.GameData["pickups"] = map[string]interface{}{key: "blast"}
		if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
			"move_type": "grab_pickup", "r": float64(i), "c": float64(i + 1),
		}); err != nil {
			t.Fatalf("unexpected error on grab %d: %v", i, err)
		}
	}
	upgrades := bombermanPlayerUpgrade(bombermanUpgradesMap(gs.GameData), "1")
	if got := ppIntFrom(upgrades["blast_bonus"]); got != bombermanMaxBlastBonus {
		t.Fatalf("expected blast_bonus capped at %d, got %d", bombermanMaxBlastBonus, got)
	}
}

func TestBombermanGrabPickupKickSetsFlag(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gs.GameData["pickups"] = map[string]interface{}{"4,4": "kick"}
	gm := &GameManager{}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "grab_pickup", "r": 4.0, "c": 4.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	upgrades := bombermanPlayerUpgrade(bombermanUpgradesMap(gs.GameData), "1")
	if hasKick, _ := upgrades["has_kick"].(bool); !hasKick {
		t.Fatalf("expected has_kick=true after grabbing a kick pickup, got %v", upgrades["has_kick"])
	}
}

func TestBombermanGrabPickupRaceSecondGrabIsNoop(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gs.GameData["pickups"] = map[string]interface{}{"4,4": "blast"}
	gm := &GameManager{}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "grab_pickup", "r": 4.0, "c": 4.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processBombermanMove(gs, 2, map[string]interface{}{"move_type": "grab_pickup", "r": 4.0, "c": 4.0}); err != nil {
		t.Fatalf("expected a harmless no-op for the race loser, got error: %v", err)
	}
	p2Upgrades := bombermanPlayerUpgrade(bombermanUpgradesMap(gs.GameData), "2")
	if got := ppIntFrom(p2Upgrades["blast_bonus"]); got != 0 {
		t.Fatalf("expected player 2 (the race loser) to gain nothing, got blast_bonus=%d", got)
	}
}

func TestBombermanExplodeSpawnsPickupOnlyOnceWallActuallyBreaks(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	// A concrete (tier 2) wall — one hit is NOT enough to break it.
	gs.GameData["soft_walls"] = []interface{}{[]interface{}{4.0, 4.0, float64(bombermanWallTierConcrete)}}
	gm := &GameManager{}

	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "place_bomb", "r": 1.0, "c": 2.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type":        "explode",
		"bomb_id":          1.0,
		"wall_hits_delta":  []interface{}{[]interface{}{4.0, 4.0}},
		"spawned_pickups":  []interface{}{[]interface{}{4.0, 4.0, "blast"}},
	}); err != nil {
		t.Fatalf("unexpected error on first explode: %v", err)
	}
	if len(bombermanPickupsMap(gs.GameData)) != 0 {
		t.Fatalf("expected NO pickup yet -- the wall only took 1 of its 2 required hits, got %v", bombermanPickupsMap(gs.GameData))
	}

	// Second hit actually breaks it -- NOW the same spawned_pickups report
	// should be honored.
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "place_bomb", "r": 1.0, "c": 2.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type":        "explode",
		"bomb_id":          2.0,
		"wall_hits_delta":  []interface{}{[]interface{}{4.0, 4.0}},
		"spawned_pickups":  []interface{}{[]interface{}{4.0, 4.0, "blast"}},
	}); err != nil {
		t.Fatalf("unexpected error on second explode: %v", err)
	}
	pickups := bombermanPickupsMap(gs.GameData)
	if pickups["4,4"] != "blast" {
		t.Fatalf("expected a blast pickup to spawn now that the wall has genuinely broken, got %v", pickups)
	}
}

func TestBombermanExplodeSpawnedPickupSkipsInvalidType(t *testing.T) {
	gs := makeBombermanGS(1, 2)
	gs.GameData["soft_walls"] = []interface{}{[]interface{}{4.0, 4.0, float64(bombermanWallTierWood)}}
	gm := &GameManager{}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{"move_type": "place_bomb", "r": 1.0, "c": 2.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processBombermanMove(gs, 1, map[string]interface{}{
		"move_type":       "explode",
		"bomb_id":         1.0,
		"wall_hits_delta": []interface{}{[]interface{}{4.0, 4.0}},
		"spawned_pickups": []interface{}{[]interface{}{4.0, 4.0, "invincibility"}},
	}); err != nil {
		t.Fatalf("unexpected error (an invalid pickup type should be silently skipped, not error the whole move): %v", err)
	}
	if len(bombermanPickupsMap(gs.GameData)) != 0 {
		t.Fatalf("expected an unrecognized pickup type to be silently skipped, got %v", bombermanPickupsMap(gs.GameData))
	}
}
