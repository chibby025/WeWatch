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

// Test 7: a character submitted with zero custom moves is accepted — not
// rejected. This was previously a hard error, but vsParseCharacterFromData
// deliberately dropped that requirement (see its own "No minimum move
// count — Punch and Block are always injected as defaults below" comment):
// every character always gets a tier-scaled default Punch/Block regardless
// of what custom moves were submitted, so an empty attacks/defenses list is
// a perfectly valid (if weak) character, not an error case. This test used
// to assert the old, now-intentionally-changed behavior — updated to match
// what the code actually does today rather than re-introducing a
// requirement the character builder no longer enforces.
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
	if err != nil {
		t.Fatalf("expected a character with no custom moves to be accepted (defaults fill in), got error: %v", err)
	}

	players, err := vsBuildState(state)
	if err != nil {
		t.Fatalf("unexpected error building state: %v", err)
	}
	char := vsCharByID(players[p1].Characters, "empty")
	if char == nil {
		t.Fatal("expected the submitted character to be present in the roster")
	}
	if len(char.Attacks) != 1 || !char.Attacks[0].IsDefault || char.Attacks[0].Name != "Punch" {
		t.Fatalf("expected exactly the default Punch attack, got %+v", char.Attacks)
	}
	if len(char.Defenses) != 1 || !char.Defenses[0].IsDefault || char.Defenses[0].Name != "Block" {
		t.Fatalf("expected exactly the default Block defense, got %+v", char.Defenses)
	}
	t.Logf("no-move character correctly got default Punch/Block: %+v / %+v ✓", char.Attacks[0], char.Defenses[0])
}

// Test 8: vsResolveCounterTimeout — the server-side backstop for a counter
// window nobody responded to (see GameManager.startVSCounterTimeout's own
// doc comment for the full rationale: a purely client-side countdown can't
// be trusted alone if that player's tab is backgrounded/throttled/crashed).
// When a counter window is genuinely still open, the timeout must revert
// phase to battle, clear counter_state, and report resolved=true so the
// caller knows to broadcast the change.
func TestVSResolveCounterTimeout_ResolvesWhenStillPending(t *testing.T) {
	p1, p2 := uint(1), uint(2)
	state := newTestVSState(p1, p2)
	state.GameData["phase"] = "counter_window"
	state.GameData["counter_state"] = map[string]interface{}{
		"type":             "atk_vs_def",
		"attacker_user_id": float64(p1),
		"defender_user_id": float64(p2),
	}
	state.GameData["turn"] = 5

	resolved, err := vsResolveCounterTimeout(state)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resolved {
		t.Fatal("expected resolved=true for a genuinely pending counter window")
	}
	if phase := vsGetPhase(state); phase != "battle" {
		t.Fatalf("expected phase to revert to battle, got %q", phase)
	}
	if _, exists := state.GameData["counter_state"]; exists {
		t.Fatal("expected counter_state to be cleared")
	}
	ltr, ok := state.GameData["last_turn_result"].(map[string]interface{})
	if !ok || ltr["outcome"] != "both_timeout" {
		t.Fatalf("expected last_turn_result outcome=both_timeout (reusing the existing 'TIMED OUT' label), got %+v", state.GameData["last_turn_result"])
	}
	if turn := getIntField(state.GameData, "turn"); turn != 6 {
		t.Fatalf("expected turn to advance from 5 to 6, got %d", turn)
	}
}

// A counter window that a real player already responded to (phase is back
// to "battle" by the time the server-side timer fires) must be a harmless
// no-op — the whole point of resolved=false is to tell the caller "don't
// broadcast, nothing changed," so a late-firing backstop timer can never
// stomp on or duplicate a real player's already-processed choice.
func TestVSResolveCounterTimeout_NoOpWhenAlreadyResolved(t *testing.T) {
	p1, p2 := uint(1), uint(2)
	state := newTestVSState(p1, p2)
	state.GameData["phase"] = "battle" // a real player already responded
	state.GameData["turn"] = 7
	state.GameData["last_turn_result"] = map[string]interface{}{"outcome": "counter_result", "damage": float64(3)}

	resolved, err := vsResolveCounterTimeout(state)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resolved {
		t.Fatal("expected resolved=false when the window was already closed by a real player choice")
	}
	// Nothing should have been touched.
	if turn := getIntField(state.GameData, "turn"); turn != 7 {
		t.Fatalf("turn should not advance on a no-op, got %d", turn)
	}
	ltr, _ := state.GameData["last_turn_result"].(map[string]interface{})
	if ltr["outcome"] != "counter_result" {
		t.Fatalf("the real player's last_turn_result must not be overwritten, got %+v", ltr)
	}
}

// Test 9: the nil-pointer panic fix — an attack against an opponent who
// timed out (never selected a character) must resolve against their first
// alive character instead of crashing. Directly reproduces the exact
// scenario from vs_battle_sim_test.go's "UNDEFENDED (opponent times out)"
// case that used to panic with a nil pointer dereference at the line
// reading the timed-out player's (never-resolved, still-nil) char.ID.
func TestVS_UndefendedTimeoutDoesNotPanic(t *testing.T) {
	p1, p2 := uint(1), uint(2)
	state := newTestVSState(p1, p2)

	for _, cd := range []map[string]interface{}{cityChar("c1", "Attacker"), cityChar("c2", "Defender")} {
		if _, _, err := processVSBattleMove(state, p1, "submit_character", cd); err != nil {
			t.Fatalf("unexpected error submitting p1 character: %v", err)
		}
	}
	if _, _, err := processVSBattleMove(state, p2, "submit_character", cityChar("c3", "Bob")); err != nil {
		t.Fatalf("unexpected error submitting p2 character: %v", err)
	}
	if _, _, err := processVSBattleMove(state, p1, "confirm_builds", nil); err != nil {
		t.Fatalf("unexpected error confirming p1: %v", err)
	}
	if _, _, err := processVSBattleMove(state, p2, "confirm_builds", nil); err != nil {
		t.Fatalf("unexpected error confirming p2: %v", err)
	}

	players, err := vsBuildState(state)
	if err != nil {
		t.Fatalf("unexpected error building state: %v", err)
	}
	p2CharID := players[p2].Characters[0].ID

	// Only p1 locks a move — p2 never does (simulating a timeout). This must
	// not panic, and must resolve as a real "undefended" hit on p2's first
	// alive character rather than silently doing nothing.
	locked := map[string]interface{}{
		"1": map[string]interface{}{"char_id": "c1", "move_type": "attack", "move_index": float64(0)},
	}
	_, _, err = vsResolveTurn(state, players, locked)
	if err != nil {
		t.Fatalf("unexpected error resolving an undefended timeout: %v", err)
	}
	lastResult, ok := state.GameData["last_turn_result"].(map[string]interface{})
	if !ok || lastResult["outcome"] != "undefended" {
		t.Fatalf("expected outcome=undefended, got %+v", state.GameData["last_turn_result"])
	}
	if lastResult["defender_char_id"] != p2CharID {
		t.Fatalf("expected the attack to land on p2's first alive character %q, got %v", p2CharID, lastResult["defender_char_id"])
	}
	dmg, _ := lastResult["damage"].(int)
	if dmg <= 0 {
		t.Fatalf("expected positive damage on an undefended hit, got %v", lastResult["damage"])
	}
}
