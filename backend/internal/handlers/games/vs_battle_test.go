package games

import (
	"testing"

	"wewatch-backend/internal/models"
)

func newTestVSState(p1, p2 uint) *GameSessionState {
	gs := &models.GameSession{GameType: "vs_battle", Status: "active", HostID: p1}
	gs.ID = 1
	state := &GameSessionState{
		GameSession: gs,
		GameData:    make(map[string]interface{}),
		Players: []models.Player{
			{UserID: p1, Username: "Alice"},
			{UserID: p2, Username: "Bob"},
		},
	}
	state.GameData["phase"] = "building"
	state.GameData["locked_moves"] = map[string]interface{}{}
	state.GameData["turn"] = 0
	return state
}

func cityChar(id, name string) map[string]interface{} {
	return map[string]interface{}{
		"id":   id,
		"name": name,
		"tier": "City-Wide", // budget 400
		"attacks": []interface{}{
			map[string]interface{}{"name": "Strike", "power": float64(200), "move_type": "attack"},
		},
		"defenses": []interface{}{
			map[string]interface{}{"name": "Guard", "power": float64(150), "move_type": "defense"},
		},
	}
}

// Test 1: full building → confirming → battle phase transition
func TestVS_BuildingToConfirmToBattle(t *testing.T) {
	p1, p2 := uint(1), uint(2)
	state := newTestVSState(p1, p2)

	if _, _, err := processVSBattleMove(state, p1, "submit_character", cityChar("c1", "Iron Fist")); err != nil {
		t.Fatalf("p1 submit_character: %v", err)
	}
	if _, _, err := processVSBattleMove(state, p2, "submit_character", cityChar("c2", "Thunder King")); err != nil {
		t.Fatalf("p2 submit_character: %v", err)
	}
	if _, _, err := processVSBattleMove(state, p1, "confirm_builds", map[string]interface{}{}); err != nil {
		t.Fatalf("p1 confirm_builds: %v", err)
	}
	if phase := vsGetPhase(state); phase != "confirming" {
		t.Fatalf("after first confirm: want confirming, got %q", phase)
	}
	if _, _, err := processVSBattleMove(state, p2, "confirm_builds", map[string]interface{}{}); err != nil {
		t.Fatalf("p2 confirm_builds: %v", err)
	}
	if phase := vsGetPhase(state); phase != "battle" {
		t.Fatalf("after both confirm: want battle, got %q", phase)
	}
	t.Log("building → confirming → battle ✓")
}

// Test 2: over-budget character must be rejected
func TestVS_BudgetOverflow(t *testing.T) {
	p1, p2 := uint(1), uint(2)
	state := newTestVSState(p1, p2)
	_ = p2
	overBudget := map[string]interface{}{
		"id":   "cx",
		"name": "Cheater",
		"tier": "City-Wide", // 400 budget
		"attacks": []interface{}{
			map[string]interface{}{"name": "Nuke", "power": float64(401), "move_type": "attack"},
		},
		"defenses": []interface{}{},
	}
	_, _, err := processVSBattleMove(state, p1, "submit_character", overBudget)
	if err == nil {
		t.Fatal("expected error for over-budget character, got nil")
	}
	t.Logf("over-budget rejected: %v ✓", err)
}

// Test 3: lock_move triggers turn resolution
func TestVS_LockAndResolve(t *testing.T) {
	p1, p2 := uint(1), uint(2)
	state := newTestVSState(p1, p2)

	// Both players must submit chars first, then both confirm.
	if _, _, err := processVSBattleMove(state, p1, "submit_character", cityChar("c1", "Fighter")); err != nil {
		t.Fatalf("p1 submit: %v", err)
	}
	if _, _, err := processVSBattleMove(state, p2, "submit_character", cityChar("c2", "Fighter")); err != nil {
		t.Fatalf("p2 submit: %v", err)
	}
	if _, _, err := processVSBattleMove(state, p1, "confirm_builds", map[string]interface{}{}); err != nil {
		t.Fatalf("p1 confirm: %v", err)
	}
	if _, _, err := processVSBattleMove(state, p2, "confirm_builds", map[string]interface{}{}); err != nil {
		t.Fatalf("p2 confirm: %v", err)
	}
	if vsGetPhase(state) != "battle" {
		t.Fatalf("expected battle, got %q", vsGetPhase(state))
	}

	// p1 attack, p2 defense
	if _, _, err := processVSBattleMove(state, p1, "lock_move", map[string]interface{}{
		"char_id": "c1", "vs_move_type": "attack", "move_index": float64(0),
	}); err != nil {
		t.Fatalf("p1 lock: %v", err)
	}
	gameOver, _, err := processVSBattleMove(state, p2, "lock_move", map[string]interface{}{
		"char_id": "c2", "vs_move_type": "defense", "move_index": float64(0),
	})
	if err != nil {
		t.Fatalf("p2 lock: %v", err)
	}

	result, ok := state.GameData["last_turn_result"].(map[string]interface{})
	if !ok {
		t.Fatal("last_turn_result not set after both lock")
	}
	outcome, _ := result["outcome"].(string)
	if outcome == "" {
		t.Fatal("outcome empty in last_turn_result")
	}
	t.Logf("turn resolved: outcome=%q gameOver=%v ✓", outcome, gameOver)
}

// Test 4: vsPublicGameData must strip locked_moves and expose only opponent_locked
func TestVS_PublicDataPrivacy(t *testing.T) {
	data := map[string]interface{}{
		"phase": "battle",
		"turn":  1,
		"locked_moves": map[string]interface{}{
			"1": map[string]interface{}{"char_id": "c1", "move_type": "attack", "move_index": 0},
		},
	}
	pub := vsPublicGameData(data)

	if _, found := pub["locked_moves"]; found {
		t.Fatal("PRIVACY LEAK: locked_moves present in public broadcast")
	}
	ol, ok := pub["opponent_locked"].(map[string]bool)
	if !ok || !ol["1"] {
		t.Fatalf("opponent_locked[\"1\"] expected true, got %v", pub["opponent_locked"])
	}
	t.Log("locked_moves stripped; opponent_locked correctly set ✓")
}

// Test 5: player may not add more than 3 characters
func TestVS_CharacterCapEnforced(t *testing.T) {
	p1, p2 := uint(1), uint(2)
	state := newTestVSState(p1, p2)
	_ = p2

	for i, id := range []string{"a", "b", "c"} {
		if _, _, err := processVSBattleMove(state, p1, "submit_character", cityChar(id, "Fighter")); err != nil {
			t.Fatalf("submit %d: %v", i, err)
		}
	}
	_, _, err := processVSBattleMove(state, p1, "submit_character", cityChar("d", "Too Many"))
	if err == nil {
		t.Fatal("expected error for 4th character, got nil")
	}
	t.Logf("3-char cap enforced: %v ✓", err)
}

// Test 6: lock_move in wrong phase must be rejected
func TestVS_WrongPhaseRejection(t *testing.T) {
	p1, p2 := uint(1), uint(2)
	state := newTestVSState(p1, p2)
	_ = p2

	_, _, err := processVSBattleMove(state, p1, "lock_move", map[string]interface{}{
		"char_id": "c1", "vs_move_type": "attack", "move_index": float64(0),
	})
	if err == nil {
		t.Fatal("expected error locking in building phase, got nil")
	}
	t.Logf("wrong-phase lock rejected: %v ✓", err)
}

// Test 7: no-move character must be rejected
func TestVS_NoMoveCharacter(t *testing.T) {
	p1, p2 := uint(1), uint(2)
	state := newTestVSState(p1, p2)
	_ = p2

	noMoves := map[string]interface{}{
		"id":       "empty",
		"name":     "Ghost",
		"tier":     "Regular",
		"attacks":  []interface{}{},
		"defenses": []interface{}{},
	}
	_, _, err := processVSBattleMove(state, p1, "submit_character", noMoves)
	if err == nil {
		t.Fatal("expected error for character with no moves, got nil")
	}
	t.Logf("no-move character rejected: %v ✓", err)
}
