package games

import "testing"

func makeHideSeekGS(playerIDs ...uint) *GameSessionState {
	gs := makeGS("hide_seek", playerIDs...)
	gs.HideSeekSpots = map[uint]int{}
	for k, v := range hideSeekInitialState(playerIDs) {
		gs.GameData[k] = v
	}
	return gs
}

func TestHideSeekRoleAssignment(t *testing.T) {
	if hideSeekNumHunters(2) != 1 {
		t.Fatalf("expected 1 hunter for 2 players, got %d", hideSeekNumHunters(2))
	}
	if hideSeekNumHunters(8) != 2 {
		t.Fatalf("expected 2 hunters for 8 players, got %d", hideSeekNumHunters(8))
	}
	if hideSeekRoleOf(0, 4) != "hunter" {
		t.Fatalf("expected index 0 of 4 to be a hunter")
	}
	if hideSeekRoleOf(1, 4) != "prop" {
		t.Fatalf("expected index 1 of 4 to be a prop")
	}
}

func TestHideSeekInitialStateStartsInHidingWithNoLeakedSpots(t *testing.T) {
	gs := makeHideSeekGS(1, 2, 3)
	phase, _ := gs.GameData["phase"].(string)
	if phase != "hiding" {
		t.Fatalf("expected phase=hiding, got %q", phase)
	}
	if ppIntFrom(gs.GameData["hidden_count"]) != 0 {
		t.Fatalf("expected hidden_count=0 at start, got %v", gs.GameData["hidden_count"])
	}
	roles, _ := gs.GameData["roles"].(map[string]interface{})
	if roles["1"] != "hunter" || roles["2"] != "prop" || roles["3"] != "prop" {
		t.Fatalf("unexpected role assignment: %v", roles)
	}
	// The core secrecy invariant: nothing resembling a spot assignment may
	// ever appear in GameData, at any point — that's the entire reason
	// HideSeekSpots exists as a separate, never-broadcast field.
	for key := range gs.GameData {
		if key == "spot_count" {
			continue // a harmless constant, not a secret
		}
		if _, ok := gs.GameData[key].(int); ok {
			t.Fatalf("found a raw int value in GameData under key %q — possible spot leak", key)
		}
	}
}

func TestHideSeekHideRejectsHunter(t *testing.T) {
	gs := makeHideSeekGS(1, 2, 3) // player 1 = hunter
	gm := &GameManager{}

	_, _, err := gm.processHideSeekMove(gs, 1, map[string]interface{}{
		"move_type": "hide_at", "spot_id": 0.0,
	})
	if err == nil {
		t.Fatalf("expected an error letting a hunter hide")
	}
}

func TestHideSeekHideSucceedsForPropAndNeverLeaksSpot(t *testing.T) {
	gs := makeHideSeekGS(1, 2, 3) // player 2 = prop
	gm := &GameManager{}

	gameOver, winnerID, err := gm.processHideSeekMove(gs, 2, map[string]interface{}{
		"move_type": "hide_at", "spot_id": 5.0,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatalf("a single hide should never end the game by itself")
	}
	if gs.HideSeekSpots[2] != 5 {
		t.Fatalf("expected player 2's spot to be recorded as 5 in HideSeekSpots, got %v", gs.HideSeekSpots[2])
	}
	if ppIntFrom(gs.GameData["hidden_count"]) != 1 {
		t.Fatalf("expected hidden_count=1, got %v", gs.GameData["hidden_count"])
	}
	// Re-confirm the secrecy invariant after a real hide — the spot value
	// (5) must never appear anywhere in GameData.
	for key, val := range gs.GameData {
		if key == "spot_count" {
			continue
		}
		if f, ok := val.(float64); ok && f == 5.0 && key != "hidden_count" {
			t.Fatalf("found the value 5 (the actual hidden spot) leaked into GameData under key %q", key)
		}
	}
}

func TestHideSeekHideRejectsDuplicateSpot(t *testing.T) {
	gs := makeHideSeekGS(1, 2, 3) // players 2,3 = props
	gm := &GameManager{}

	if _, _, err := gm.processHideSeekMove(gs, 2, map[string]interface{}{
		"move_type": "hide_at", "spot_id": 3.0,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	_, _, err := gm.processHideSeekMove(gs, 3, map[string]interface{}{
		"move_type": "hide_at", "spot_id": 3.0,
	})
	if err == nil {
		t.Fatalf("expected an error when a second prop tries to hide at an already-taken spot")
	}
}

func TestHideSeekHideAllowsRechoosingBeforeHuntBegins(t *testing.T) {
	gs := makeHideSeekGS(1, 2, 3, 4, 5) // 1 hunter, 4 props (5/4=1 hunter)
	gm := &GameManager{}

	if _, _, err := gm.processHideSeekMove(gs, 2, map[string]interface{}{"move_type": "hide_at", "spot_id": 2.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Player 2 changes their mind — this should succeed and free up spot 2.
	if _, _, err := gm.processHideSeekMove(gs, 2, map[string]interface{}{"move_type": "hide_at", "spot_id": 7.0}); err != nil {
		t.Fatalf("unexpected error re-hiding: %v", err)
	}
	if gs.HideSeekSpots[2] != 7 {
		t.Fatalf("expected player 2's spot to be updated to 7, got %v", gs.HideSeekSpots[2])
	}
	// Spot 2 should now be free for someone else.
	if _, _, err := gm.processHideSeekMove(gs, 3, map[string]interface{}{"move_type": "hide_at", "spot_id": 2.0}); err != nil {
		t.Fatalf("expected spot 2 to be free again after player 2 moved off it: %v", err)
	}
}

func TestHideSeekAutoTransitionsToHuntingOnceAllPropsHidden(t *testing.T) {
	gs := makeHideSeekGS(1, 2, 3) // 1 hunter (player 1), 2 props (2,3)
	gm := &GameManager{}

	if _, _, err := gm.processHideSeekMove(gs, 2, map[string]interface{}{"move_type": "hide_at", "spot_id": 0.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	phase, _ := gs.GameData["phase"].(string)
	if phase != "hiding" {
		t.Fatalf("expected phase to still be hiding with 1 of 2 props hidden, got %q", phase)
	}

	if _, _, err := gm.processHideSeekMove(gs, 3, map[string]interface{}{"move_type": "hide_at", "spot_id": 1.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	phase, _ = gs.GameData["phase"].(string)
	if phase != "hunting" {
		t.Fatalf("expected phase to auto-transition to hunting once all props are hidden, got %q", phase)
	}
}

func TestHideSeekHideRejectedOnceHuntingBegins(t *testing.T) {
	gs := makeHideSeekGS(1, 2) // 1 hunter, 1 prop
	gm := &GameManager{}

	if _, _, err := gm.processHideSeekMove(gs, 2, map[string]interface{}{"move_type": "hide_at", "spot_id": 0.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Phase should now be hunting (the sole prop is hidden).
	_, _, err := gm.processHideSeekMove(gs, 2, map[string]interface{}{"move_type": "hide_at", "spot_id": 1.0})
	if err == nil {
		t.Fatalf("expected an error trying to hide again once the hunt has begun")
	}
}

func TestHideSeekSearchRejectsProp(t *testing.T) {
	gs := makeHideSeekGS(1, 2) // player 2 = prop
	gm := &GameManager{}
	gs.GameData["phase"] = "hunting"

	_, _, err := gm.processHideSeekMove(gs, 2, map[string]interface{}{"move_type": "search_spot", "spot_id": 0.0})
	if err == nil {
		t.Fatalf("expected an error letting a prop search")
	}
}

func TestHideSeekSearchRejectedDuringHidingPhase(t *testing.T) {
	gs := makeHideSeekGS(1, 2) // player 1 = hunter, phase starts as "hiding"
	gm := &GameManager{}

	_, _, err := gm.processHideSeekMove(gs, 1, map[string]interface{}{"move_type": "search_spot", "spot_id": 0.0})
	if err == nil {
		t.Fatalf("expected an error searching before the hunt has begun")
	}
}

func TestHideSeekSearchMissRevealsNothing(t *testing.T) {
	gs := makeHideSeekGS(1, 2, 3) // player 1 = hunter, 2,3 = props
	gm := &GameManager{}
	// Prop hides at spot 4, hunter searches spot 9 (a deliberate miss).
	if _, _, err := gm.processHideSeekMove(gs, 2, map[string]interface{}{"move_type": "hide_at", "spot_id": 4.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processHideSeekMove(gs, 3, map[string]interface{}{"move_type": "hide_at", "spot_id": 6.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	gameOver, winnerID, err := gm.processHideSeekMove(gs, 1, map[string]interface{}{"move_type": "search_spot", "spot_id": 9.0})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatalf("a miss should never end the game")
	}
	lastSearch, _ := gs.GameData["last_search"].(map[string]interface{})
	if lastSearch["hit"] != false {
		t.Fatalf("expected last_search.hit=false for a genuine miss, got %v", lastSearch)
	}
	found := hideSeekFoundProps(gs.GameData)
	if len(found) != 0 {
		t.Fatalf("expected zero found_props after a miss, got %d", len(found))
	}
}

func TestHideSeekSearchHitFindsAndRevealsProp(t *testing.T) {
	gs := makeHideSeekGS(1, 2, 3) // player 1 = hunter, 2,3 = props
	gm := &GameManager{}
	if _, _, err := gm.processHideSeekMove(gs, 2, map[string]interface{}{"move_type": "hide_at", "spot_id": 4.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processHideSeekMove(gs, 3, map[string]interface{}{"move_type": "hide_at", "spot_id": 6.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	gameOver, winnerID, err := gm.processHideSeekMove(gs, 1, map[string]interface{}{"move_type": "search_spot", "spot_id": 4.0})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver {
		t.Fatalf("with player 3 still hidden, the game should not be over yet")
	}
	if winnerID != nil {
		t.Fatalf("expected no winner yet, one prop remains hidden")
	}
	lastSearch, _ := gs.GameData["last_search"].(map[string]interface{})
	if lastSearch["hit"] != true {
		t.Fatalf("expected last_search.hit=true, got %v", lastSearch)
	}
	found := hideSeekFoundProps(gs.GameData)
	if len(found) != 1 || ppIntFrom(found[0]) != 2 {
		t.Fatalf("expected found_props=[2], got %v", found)
	}
	if _, stillHidden := gs.HideSeekSpots[2]; stillHidden {
		t.Fatalf("expected player 2's entry to be removed from HideSeekSpots once found")
	}
}

func TestHideSeekHuntersWinOnceAllPropsFound(t *testing.T) {
	gs := makeHideSeekGS(1, 2, 3) // player 1 = hunter, 2,3 = props
	gm := &GameManager{}
	if _, _, err := gm.processHideSeekMove(gs, 2, map[string]interface{}{"move_type": "hide_at", "spot_id": 4.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processHideSeekMove(gs, 3, map[string]interface{}{"move_type": "hide_at", "spot_id": 6.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processHideSeekMove(gs, 1, map[string]interface{}{"move_type": "search_spot", "spot_id": 4.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	gameOver, winnerID, err := gm.processHideSeekMove(gs, 1, map[string]interface{}{"move_type": "search_spot", "spot_id": 6.0})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !gameOver {
		t.Fatalf("expected the game to end once every prop is found")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Fatalf("expected the finding hunter (1) to be the representative winner, got %v", winnerID)
	}
	phase, _ := gs.GameData["phase"].(string)
	if phase != "ended" {
		t.Fatalf("expected phase=ended, got %q", phase)
	}
}

func TestHideSeekSearchIgnoredOncePhaseEnded(t *testing.T) {
	gs := makeHideSeekGS(1, 2)
	gs.GameData["phase"] = "ended"
	gm := &GameManager{}

	gameOver, winnerID, err := gm.processHideSeekMove(gs, 1, map[string]interface{}{"move_type": "search_spot", "spot_id": 0.0})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatalf("a search reported after the game already ended should be a harmless no-op")
	}
}

func TestHideSeekForcedEndPropsWinIfAnyoneStillHidden(t *testing.T) {
	gs := makeHideSeekGS(1, 2, 3) // player 1 = hunter, 2,3 = props
	gm := &GameManager{}
	if _, _, err := gm.processHideSeekMove(gs, 2, map[string]interface{}{"move_type": "hide_at", "spot_id": 4.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processHideSeekMove(gs, 3, map[string]interface{}{"move_type": "hide_at", "spot_id": 6.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	gameOver, winnerID, err := gm.processHideSeekMove(gs, 1, map[string]interface{}{"move_type": "hideseek_end"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !gameOver {
		t.Fatalf("expected hideseek_end to end the game")
	}
	if winnerID == nil || (*winnerID != 2 && *winnerID != 3) {
		t.Fatalf("expected a still-hidden prop (2 or 3) to be declared winner, got %v", winnerID)
	}
}

func TestHideSeekForcedEndHuntersWinIfAllPropsAlreadyFound(t *testing.T) {
	gs := makeHideSeekGS(1, 2) // player 1 = hunter, player 2 = prop
	gm := &GameManager{}
	if _, _, err := gm.processHideSeekMove(gs, 2, map[string]interface{}{"move_type": "hide_at", "spot_id": 0.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processHideSeekMove(gs, 1, map[string]interface{}{"move_type": "search_spot", "spot_id": 0.0}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// The above search already ends the game naturally (all props found).
	// Confirm a forced end call after that point is a harmless no-op.
	gameOver, winnerID, err := gm.processHideSeekMove(gs, 1, map[string]interface{}{"move_type": "hideseek_end"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Fatalf("expected hideseek_end after an already-natural game-end to be a no-op")
	}
}

func TestHideSeekUnknownMoveTypeRejected(t *testing.T) {
	gs := makeHideSeekGS(1, 2)
	gm := &GameManager{}

	_, _, err := gm.processHideSeekMove(gs, 1, map[string]interface{}{"move_type": "teleport"})
	if err == nil {
		t.Fatalf("expected an error for an unrecognized move type")
	}
}
