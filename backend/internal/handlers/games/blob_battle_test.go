package games

import "testing"

func makeBlobGS(playerIDs ...uint) *GameSessionState {
	gs := makeGS("blob_battle", playerIDs...)
	for k, v := range blobBattleInitialState(playerIDs) {
		gs.GameData[k] = v
	}
	return gs
}

func TestBlobBattleInitialStateSeedsMassAndAlive(t *testing.T) {
	gs := makeBlobGS(1, 2, 3)
	if blobGetMass(gs.GameData, 1) != blobStartingMass {
		t.Fatalf("expected player 1 to start at mass %v, got %v", blobStartingMass, blobGetMass(gs.GameData, 1))
	}
	alive := blobAliveMap(gs.GameData)
	for _, id := range []string{"1", "2", "3"} {
		if isAlive, ok := alive[id].(bool); !ok || !isAlive {
			t.Fatalf("expected player %s to start alive, got %v", id, alive[id])
		}
	}
	phase, _ := gs.GameData["phase"].(string)
	if phase != "playing" {
		t.Fatalf("expected phase=playing, got %q", phase)
	}
}

func TestBlobBattlePelletFieldHasCorrectCount(t *testing.T) {
	gs := makeBlobGS(1, 2)
	pellets, _ := gs.GameData["pellets"].([]interface{})
	if len(pellets) != blobPelletCount {
		t.Fatalf("expected %d pellets, got %d", blobPelletCount, len(pellets))
	}
	for _, raw := range pellets {
		p, ok := raw.(map[string]interface{})
		if !ok {
			t.Fatalf("malformed pellet entry: %v", raw)
		}
		x, _ := ppFloat(p["x"])
		y, _ := ppFloat(p["y"])
		if x < 0 || x > blobArenaSize || y < 0 || y > blobArenaSize {
			t.Fatalf("pellet out of arena bounds: %v", p)
		}
	}
}

func TestBlobBattleStateSyncRelaysOwnPositionOnly(t *testing.T) {
	gs := makeBlobGS(1, 2)
	gm := &GameManager{}

	if _, _, err := gm.processBlobBattleMove(gs, 1, map[string]interface{}{
		"move_type": "state_sync", "x": 500.0, "y": 600.0, "vx": 10.0, "vy": -5.0,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	snap, ok := gs.GameData["player_1"].(map[string]interface{})
	if !ok || snap["x"] != 500.0 || snap["y"] != 600.0 {
		t.Fatalf("expected player_1 snapshot with x=500,y=600, got %v", gs.GameData["player_1"])
	}
	if _, exists := gs.GameData["player_2"]; exists {
		t.Fatalf("player 1's state_sync should never write player 2's own key")
	}
}

func TestBlobBattleEatPelletGrowsMassAndMarksEaten(t *testing.T) {
	gs := makeBlobGS(1, 2)
	gm := &GameManager{}

	gameOver, winnerID, err := gm.processBlobBattleMove(gs, 1, map[string]interface{}{
		"move_type": "eat_pellet", "pellet_id": 5.0,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatalf("eating a pellet should never end the game by itself")
	}
	if blobGetMass(gs.GameData, 1) != blobStartingMass+blobPelletMassGain {
		t.Fatalf("expected player 1's mass to grow by %v, got %v", blobPelletMassGain, blobGetMass(gs.GameData, 1))
	}
	eaten, _ := gs.GameData["eaten_pellets"].([]interface{})
	if len(eaten) != 1 {
		t.Fatalf("expected exactly 1 eaten pellet recorded, got %d", len(eaten))
	}
}

func TestBlobBattleEatPelletRaceOnlyAwardsFirstClaim(t *testing.T) {
	gs := makeBlobGS(1, 2)
	gm := &GameManager{}

	// Both players "race" for the same pellet — process p1's claim first.
	if _, _, err := gm.processBlobBattleMove(gs, 1, map[string]interface{}{
		"move_type": "eat_pellet", "pellet_id": 7.0,
	}); err != nil {
		t.Fatalf("unexpected error on first claim: %v", err)
	}
	massAfterFirst := blobGetMass(gs.GameData, 1)

	// p2's claim on the SAME pellet, processed second, must be a harmless
	// no-op — no error, and crucially no mass awarded to p2 either.
	gameOver, winnerID, err := gm.processBlobBattleMove(gs, 2, map[string]interface{}{
		"move_type": "eat_pellet", "pellet_id": 7.0,
	})
	if err != nil {
		t.Fatalf("unexpected error on second (losing) claim: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatalf("a losing pellet-race claim should never end the game")
	}
	if blobGetMass(gs.GameData, 2) != blobStartingMass {
		t.Fatalf("expected player 2 to gain NO mass from a lost race, got %v", blobGetMass(gs.GameData, 2))
	}
	if blobGetMass(gs.GameData, 1) != massAfterFirst {
		t.Fatalf("player 1's mass should be unaffected by player 2's losing claim")
	}
	eaten, _ := gs.GameData["eaten_pellets"].([]interface{})
	if len(eaten) != 1 {
		t.Fatalf("expected the pellet to still only be recorded once, got %d entries", len(eaten))
	}
}

func TestBlobBattleEatPelletRejectsEliminatedPlayer(t *testing.T) {
	gs := makeBlobGS(1, 2)
	alive := blobAliveMap(gs.GameData)
	alive["1"] = false
	gs.GameData["players_alive"] = alive
	gm := &GameManager{}

	_, _, err := gm.processBlobBattleMove(gs, 1, map[string]interface{}{
		"move_type": "eat_pellet", "pellet_id": 1.0,
	})
	if err == nil {
		t.Fatalf("expected an error letting an eliminated player eat a pellet")
	}
}

func TestBlobBattleEatPlayerRejectsWhenNotHeavyEnough(t *testing.T) {
	gs := makeBlobGS(1, 2) // both start at equal mass — 1.0x, not >= 1.15x
	gm := &GameManager{}

	_, _, err := gm.processBlobBattleMove(gs, 1, map[string]interface{}{
		"move_type": "eat_player", "target_player_id": 2.0,
	})
	if err == nil {
		t.Fatalf("expected an error when the eater isn't heavy enough")
	}
}

func TestBlobBattleEatPlayerSucceedsWhenHeavyEnough(t *testing.T) {
	gs := makeBlobGS(1, 2)
	gm := &GameManager{}
	// Grow player 1's mass well past the 1.15x threshold via real pellet eats.
	for i := 0; i < 10; i++ {
		if _, _, err := gm.processBlobBattleMove(gs, 1, map[string]interface{}{
			"move_type": "eat_pellet", "pellet_id": float64(i),
		}); err != nil {
			t.Fatalf("unexpected error growing mass: %v", err)
		}
	}
	eaterMassBefore := blobGetMass(gs.GameData, 1)
	targetMass := blobGetMass(gs.GameData, 2)

	gameOver, winnerID, err := gm.processBlobBattleMove(gs, 1, map[string]interface{}{
		"move_type": "eat_player", "target_player_id": 2.0,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !gameOver {
		t.Fatalf("expected the game to end once only player 1 remains alive (2-player match)")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Fatalf("expected player 1 to be declared winner, got %v", winnerID)
	}
	expectedMass := eaterMassBefore + targetMass*blobEatMassTransfer
	if blobGetMass(gs.GameData, 1) != expectedMass {
		t.Fatalf("expected player 1's mass to be %v after eating, got %v", expectedMass, blobGetMass(gs.GameData, 1))
	}
	alive := blobAliveMap(gs.GameData)
	if isAlive, _ := alive["2"].(bool); isAlive {
		t.Fatalf("expected player 2 to be eliminated")
	}
}

func TestBlobBattleEatPlayerRejectsSelfEat(t *testing.T) {
	gs := makeBlobGS(1, 2)
	gm := &GameManager{}

	_, _, err := gm.processBlobBattleMove(gs, 1, map[string]interface{}{
		"move_type": "eat_player", "target_player_id": 1.0,
	})
	if err == nil {
		t.Fatalf("expected an error when a player tries to eat themselves")
	}
}

func TestBlobBattleEatPlayerRejectsInvalidTarget(t *testing.T) {
	gs := makeBlobGS(1, 2)
	gm := &GameManager{}

	_, _, err := gm.processBlobBattleMove(gs, 1, map[string]interface{}{
		"move_type": "eat_player", "target_player_id": 999.0,
	})
	if err == nil {
		t.Fatalf("expected an error for a target that isn't a real participant")
	}
}

func TestBlobBattleEatPlayerRejectsAlreadyEliminatedTarget(t *testing.T) {
	gs := makeBlobGS(1, 2, 3)
	alive := blobAliveMap(gs.GameData)
	alive["2"] = false
	gs.GameData["players_alive"] = alive
	gm := &GameManager{}

	_, _, err := gm.processBlobBattleMove(gs, 1, map[string]interface{}{
		"move_type": "eat_player", "target_player_id": 2.0,
	})
	if err == nil {
		t.Fatalf("expected an error trying to eat an already-eliminated player")
	}
}

func TestBlobBattleGameContinuesWithThreePlayersAfterOneEaten(t *testing.T) {
	gs := makeBlobGS(1, 2, 3)
	gm := &GameManager{}
	for i := 0; i < 10; i++ {
		if _, _, err := gm.processBlobBattleMove(gs, 1, map[string]interface{}{
			"move_type": "eat_pellet", "pellet_id": float64(i),
		}); err != nil {
			t.Fatalf("unexpected error growing mass: %v", err)
		}
	}

	gameOver, winnerID, err := gm.processBlobBattleMove(gs, 1, map[string]interface{}{
		"move_type": "eat_player", "target_player_id": 2.0,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver {
		t.Fatalf("with player 3 still alive, the game should not be over yet")
	}
	if winnerID != nil {
		t.Fatalf("expected no winner yet")
	}
}

func TestBlobBattleEatPlayerIgnoredOncePhaseEnded(t *testing.T) {
	gs := makeBlobGS(1, 2)
	gs.GameData["phase"] = "ended"
	gm := &GameManager{}

	gameOver, winnerID, err := gm.processBlobBattleMove(gs, 1, map[string]interface{}{
		"move_type": "eat_player", "target_player_id": 2.0,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatalf("an eat_player reported after the game already ended should be a harmless no-op")
	}
}

func TestBlobBattleForcedEndDeclaresHighestMassWinner(t *testing.T) {
	gs := makeBlobGS(1, 2, 3)
	gm := &GameManager{}
	if _, _, err := gm.processBlobBattleMove(gs, 2, map[string]interface{}{
		"move_type": "eat_pellet", "pellet_id": 0.0,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	gameOver, winnerID, err := gm.processBlobBattleMove(gs, 1, map[string]interface{}{"move_type": "blob_battle_end"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !gameOver {
		t.Fatalf("expected blob_battle_end to end the game")
	}
	if winnerID == nil || *winnerID != 2 {
		t.Fatalf("expected player 2 (highest mass) to win a forced end, got %v", winnerID)
	}
}

func TestBlobBattleForcedEndTiedMassIsADraw(t *testing.T) {
	gs := makeBlobGS(1, 2)
	gm := &GameManager{}

	gameOver, winnerID, err := gm.processBlobBattleMove(gs, 1, map[string]interface{}{"move_type": "blob_battle_end"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !gameOver {
		t.Fatalf("expected blob_battle_end to end the game even at equal mass")
	}
	if winnerID != nil {
		t.Fatalf("expected a draw (nil winner) at tied mass, got %v", *winnerID)
	}
}

func TestBlobBattleUnknownMoveTypeRejected(t *testing.T) {
	gs := makeBlobGS(1, 2)
	gm := &GameManager{}

	_, _, err := gm.processBlobBattleMove(gs, 1, map[string]interface{}{"move_type": "teleport"})
	if err == nil {
		t.Fatalf("expected an error for an unrecognized move type")
	}
}
