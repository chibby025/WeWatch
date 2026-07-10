package games

import (
	"fmt"
	"math/rand"
	"testing"

	"wewatch-backend/internal/models"
)

// ── Simulation helpers ────────────────────────────────────────────────────────

// outcomeSound mirrors the frontend outcomeSound() function exactly.
func simSound(outcome string) string {
	m := map[string]string{
		"stalemate":      "🔔 stalemate",
		"attack_wins":    "⚔️  attackWin",
		"attack_lands":   "⚔️  attackWin",
		"undefended":     "💥 superAttack",
		"blocked":        "🛡  blocked",
		"counter_chance": "⚡ counter",
		"deflect":        "↩️  defenseWin",
		"both_defend":    "🔒 superDefense",
		"both_timeout":   "(silence)",
		"both_attack":    "⚔️  attackMove",
		"atk_vs_def":     "⚔️  attackMove",
	}
	if s, ok := m[outcome]; ok {
		return s
	}
	return "(none)"
}

// resolveClipQueue mirrors the frontend resolveClipQueue() function exactly.
func simVideo(result map[string]interface{}) string {
	outcome, _ := result["outcome"].(string)
	aName, _ := result["move_a_name"].(string)
	bName, _ := result["move_b_name"].(string)
	atkName, _ := result["attacker_move_name"].(string)
	defName, _ := result["defender_move_name"].(string)
	triggerURL, _ := result["trigger_url"].(string)

	isPunch := func(n string) bool { return n == "Punch" }
	isBlock := func(n string) bool { return n == "Block" }

	switch outcome {
	case "stalemate":
		if isPunch(aName) && isPunch(bName) {
			return "🎬 VID_PUNCH_STALEMATE"
		}
		if isPunch(aName) {
			return "🎬 VID_PUNCH + opponent custom"
		}
		if isPunch(bName) {
			return "🎬 player custom + VID_PUNCH"
		}
		if triggerURL != "" {
			return "🎬 custom triggers: " + triggerURL
		}
		return "(no video)"

	case "both_attack":
		if isPunch(aName) || isPunch(bName) {
			return "🎬 VID_PUNCH"
		}
		return "(custom clips)"

	case "attack_wins":
		loserUID, _ := result["loser"].(uint)
		playerB, _ := result["player_b"].(uint)
		playerA, _ := result["player_a"].(uint)
		winnerPunch := (loserUID == playerB && isPunch(aName)) || (loserUID == playerA && isPunch(bName))
		if winnerPunch {
			return "🎬 VID_PUNCH_WIN"
		}
		if triggerURL != "" {
			return "🎬 custom: " + triggerURL
		}
		return "(no video — custom move, no trigger URL)"

	case "attack_lands":
		if isPunch(atkName) {
			return "🎬 VID_PUNCH_WIN"
		}
		if triggerURL != "" {
			return "🎬 custom: " + triggerURL
		}
		return "(no video — custom move, no trigger URL)"

	case "undefended":
		if isPunch(atkName) {
			return "🎬 VID_PUNCH"
		}
		if triggerURL != "" {
			return "🎬 custom: " + triggerURL
		}
		return "(no video)"

	case "blocked":
		if isBlock(defName) {
			return "🎬 VID_BLOCK_LOSE"
		}
		if triggerURL != "" {
			return "🎬 custom: " + triggerURL
		}
		return "(no video)"

	case "counter_chance":
		if isBlock(defName) {
			return "🎬 VID_BLOCK_STALEMATE"
		}
		if triggerURL != "" {
			return "🎬 custom: " + triggerURL
		}
		return "(no video)"

	case "deflect":
		if triggerURL != "" {
			return "🎬 custom: " + triggerURL
		}
		return "(no video)"

	case "both_defend":
		return "(no video)"
	case "both_timeout":
		return "(no video)"
	}
	return "(no video)"
}

func makeGameState(playerA, playerB uint) *GameSessionState {
	gs := &GameSessionState{
		Players: []models.Player{
			{UserID: playerA},
			{UserID: playerB},
		},
		GameData: map[string]interface{}{},
	}
	return gs
}

func makeChar(tier string, attacks []VSMove, defenses []VSMove) VSCharacter {
	td := vsTiers[tier]
	// Prepend defaults, mirroring vsParseCharacterFromData
	punchPow := vsDefaultPunchPower[tier]
	blockPow := vsDefaultBlockPower[tier]
	allAtk := append([]VSMove{{Name: "Punch", Power: punchPow, MoveType: "attack", IsDefault: true}}, attacks...)
	allDef := append([]VSMove{{Name: "Block", Power: blockPow, MoveType: "defense", IsDefault: true}}, defenses...)
	return VSCharacter{
		ID: "c1", Name: "Fighter", Tier: tier,
		HP: td.HP, MaxHP: td.HP, Budget: td.Budget,
		Attacks: allAtk, Defenses: allDef,
	}
}

func printResult(label string, result map[string]interface{}, forced ...bool) {
	outcome, _ := result["outcome"].(string)
	dmg, _ := result["damage"].(int)
	counterEvent, _ := result["counter_event"].(bool)

	fmt.Printf("  %-50s → outcome=%-16s dmg=%-4d sound=%-22s video=%s",
		label, outcome, dmg, simSound(outcome), simVideo(result))
	if counterEvent {
		fmt.Printf("  [COUNTER WINDOW]")
	}
	fmt.Println()
}

// ── Test ──────────────────────────────────────────────────────────────────────

func TestVSBattleScenarios(t *testing.T) {
	// Seed for reproducibility; use a fixed seed so counter_chance is deterministic
	// We'll run scenarios 20 times to show the probabilistic branches.
	rand.Seed(42)

	const A uint = 1
	const B uint = 2
	tier := "Regular"

	// Characters for this tier
	charA := makeChar(tier, []VSMove{
		{Name: "Fireball", Power: 150, MoveType: "attack", TriggerURL: "/vid/fireball.mp4"},
		{Name: "Uppercut", Power: 100, MoveType: "attack", TriggerURL: "/vid/uppercut.mp4"},
	}, []VSMove{
		{Name: "Shield", Power: 80, MoveType: "defense", TriggerURL: "/vid/shield.mp4"},
		{Name: "Dodge",  Power: 60, MoveType: "defense", TriggerURL: "/vid/dodge.mp4"},
	})
	charB := makeChar(tier, []VSMove{
		{Name: "Laser", Power: 200, MoveType: "attack", TriggerURL: "/vid/laser.mp4"},
	}, []VSMove{
		{Name: "Barrier", Power: 120, MoveType: "defense", TriggerURL: "/vid/barrier.mp4"},
	})

	sep := func(title string) {
		fmt.Printf("\n── %s ──\n", title)
	}

	runEncounter := func(label string, gs *GameSessionState, players map[uint]*VSPlayerState, locked map[string]interface{}) {
		result, _, _, err := vsResolveEncounter(gs, players, locked)
		if err != nil {
			fmt.Printf("  %-50s → ERROR: %v\n", label, err)
			return
		}
		printResult(label, result)
	}

	// Helper to lock in a move
	lock := func(uid uint, charID, moveType string, moveIndex int) map[string]interface{} {
		return map[string]interface{}{
			fmt.Sprintf("%d", uid): map[string]interface{}{
				"char_id":    charID,
				"move_type":  moveType,
				"move_index": float64(moveIndex),
			},
		}
	}
	mergeLocks := func(a, b map[string]interface{}) map[string]interface{} {
		m := map[string]interface{}{}
		for k, v := range a {
			m[k] = v
		}
		for k, v := range b {
			m[k] = v
		}
		return m
	}

	setupPlayers := func() map[uint]*VSPlayerState {
		ca := charA
		cb := charB
		return map[uint]*VSPlayerState{
			A: {UserID: A, Characters: []VSCharacter{ca}},
			B: {UserID: B, Characters: []VSCharacter{cb}},
		}
	}

	// ── 1. BOTH ATTACK ─────────────────────────────────────────────────────────
	sep("BOTH ATTACK")

	{
		// Punch(75) vs Punch(75) — diff 0 → stalemate
		gs := makeGameState(A, B)
		p := setupPlayers()
		locked := mergeLocks(lock(A, "c1", "attack", 0), lock(B, "c1", "attack", 0))
		runEncounter("Punch(75) vs Punch(75)", gs, p, locked)
	}
	{
		// Punch(75) vs Fireball(150) — diff 75 → B's Fireball wins
		gs := makeGameState(A, B)
		p := setupPlayers()
		locked := mergeLocks(lock(A, "c1", "attack", 0), lock(B, "c1", "attack", 1))
		runEncounter("Punch(75) vs Fireball(150)", gs, p, locked)
	}
	{
		// Fireball(150) vs Punch(75) — diff 75 → A's Fireball wins
		gs := makeGameState(A, B)
		p := setupPlayers()
		locked := mergeLocks(lock(A, "c1", "attack", 1), lock(B, "c1", "attack", 0))
		runEncounter("Fireball(150) vs Punch(75)", gs, p, locked)
	}
	{
		// Punch(75) vs Uppercut(100) — diff 25 → Uppercut wins
		// Use charA on both sides to test Punch vs Uppercut
		p2 := map[uint]*VSPlayerState{
			A: {UserID: A, Characters: []VSCharacter{charA}},
			B: {UserID: B, Characters: []VSCharacter{charA}},
		}
		p2[A].Characters[0].ID = "cA"
		p2[B].Characters[0].ID = "cB"
		locked2 := mergeLocks(
			map[string]interface{}{"1": map[string]interface{}{"char_id": "cA", "move_type": "attack", "move_index": float64(0)}},
			map[string]interface{}{"2": map[string]interface{}{"char_id": "cB", "move_type": "attack", "move_index": float64(2)}},
		)
		runEncounter("Punch(75) vs Uppercut(100)", makeGameState(A, B), p2, locked2)
	}
	{
		// Fireball(150) vs Laser(200) — diff 50 → Laser wins
		runEncounter("Fireball(150) vs Laser(200)", makeGameState(A, B), setupPlayers(),
			mergeLocks(lock(A, "c1", "attack", 1), lock(B, "c1", "attack", 1)))
	}
	{
		// Uppercut(100) vs Uppercut(100) — diff 0 → stalemate
		p2 := map[uint]*VSPlayerState{
			A: {UserID: A, Characters: []VSCharacter{charA}},
			B: {UserID: B, Characters: []VSCharacter{charA}},
		}
		p2[A].Characters[0].ID = "cA"
		p2[B].Characters[0].ID = "cB"
		locked := map[string]interface{}{
			"1": map[string]interface{}{"char_id": "cA", "move_type": "attack", "move_index": float64(2)},
			"2": map[string]interface{}{"char_id": "cB", "move_type": "attack", "move_index": float64(2)},
		}
		runEncounter("Uppercut(100) vs Uppercut(100)", makeGameState(A, B), p2, locked)
	}

	// ── 2. ATTACK vs DEFENSE ───────────────────────────────────────────────────
	sep("ATTACK vs DEFENSE  (A attacks, B defends)")

	testAtkVsDef := func(atkName string, atkPow int, atkTrigger string, defName string, defPow int, defTrigger string) {
		atk := VSMove{Name: atkName, Power: atkPow, MoveType: "attack", TriggerURL: atkTrigger}
		def := VSMove{Name: defName, Power: defPow, MoveType: "defense", TriggerURL: defTrigger}
		gs := makeGameState(A, B)
		result := vsResolveAtkVsDef(gs, A, &VSCharacter{ID: "cA", Name: "A", HP: 100, MaxHP: 100}, &atk,
			B, &VSCharacter{ID: "cB", Name: "B", HP: 100, MaxHP: 100}, &def, false)
		label := fmt.Sprintf("%s(%d) ATK vs %s(%d) DEF", atkName, atkPow, defName, defPow)
		printResult(label, result)
	}

	// Punch vs Block — exact tie
	testAtkVsDef("Punch", 75, "", "Block", 75, "")
	// Punch vs weak defense — Punch wins (diff ≥ 6)
	testAtkVsDef("Punch", 75, "", "Dodge", 60, "/vid/dodge.mp4")
	// Punch vs close defense — deflect (diff 1-5)
	testAtkVsDef("Punch", 75, "", "Shield", 70, "/vid/shield.mp4")
	// Punch vs strong defense — blocked
	testAtkVsDef("Punch", 75, "", "Barrier", 120, "/vid/barrier.mp4")
	// Custom attack vs Block
	testAtkVsDef("Fireball", 150, "/vid/fireball.mp4", "Block", 75, "")
	// Custom attack vs strong defense — attack lands
	testAtkVsDef("Fireball", 150, "/vid/fireball.mp4", "Barrier", 120, "/vid/barrier.mp4")
	// Custom attack vs close defense — deflect
	testAtkVsDef("Uppercut", 100, "/vid/uppercut.mp4", "Shield", 96, "/vid/shield.mp4")
	// Weak attack vs strong defense — blocked
	testAtkVsDef("Jab", 50, "/vid/jab.mp4", "Shield", 80, "/vid/shield.mp4")

	// ── 3. UNDEFENDED (one player times out) ──────────────────────────────────
	sep("UNDEFENDED (opponent times out)")

	{
		// A attacks with Punch, B times out
		gs := makeGameState(A, B)
		p := setupPlayers()
		locked := lock(A, "c1", "attack", 0) // only A locked
		runEncounter("Punch(75) — B timed out", gs, p, locked)
	}
	{
		// A attacks with Fireball, B times out
		gs := makeGameState(A, B)
		p := setupPlayers()
		locked := lock(A, "c1", "attack", 1)
		runEncounter("Fireball(150) — B timed out", gs, p, locked)
	}
	{
		// A defends, B times out — should do nothing
		gs := makeGameState(A, B)
		p := setupPlayers()
		locked := lock(A, "c1", "defense", 0)
		runEncounter("Block(75) DEF — B timed out (no atk)", gs, p, locked)
	}

	// ── 4. BOTH DEFEND ────────────────────────────────────────────────────────
	sep("BOTH DEFEND")

	{
		gs := makeGameState(A, B)
		p := setupPlayers()
		locked := mergeLocks(lock(A, "c1", "defense", 0), lock(B, "c1", "defense", 0))
		runEncounter("Block(75) vs Block(75)", gs, p, locked)
	}
	{
		gs := makeGameState(A, B)
		p := setupPlayers()
		locked := mergeLocks(lock(A, "c1", "defense", 1), lock(B, "c1", "defense", 1))
		runEncounter("Shield(80) vs Barrier(120)", gs, p, locked)
	}

	// ── 5. BOTH TIMEOUT ───────────────────────────────────────────────────────
	sep("BOTH TIMEOUT")

	{
		gs := makeGameState(A, B)
		p := setupPlayers()
		runEncounter("Neither player locked", gs, p, map[string]interface{}{})
	}

	// ── 6. PROBABILISTIC — run 20 iterations to show branching ────────────────
	sep("PROBABILISTIC: Punch(75) ATK vs Block(75) DEF — 20 runs")

	blocked, counter := 0, 0
	for i := 0; i < 20; i++ {
		atk := VSMove{Name: "Punch", Power: 75, MoveType: "attack"}
		def := VSMove{Name: "Block", Power: 75, MoveType: "defense"}
		gs := makeGameState(A, B)
		result := vsResolveAtkVsDef(gs, A, &VSCharacter{ID: "cA", HP: 100, MaxHP: 100}, &atk,
			B, &VSCharacter{ID: "cB", HP: 100, MaxHP: 100}, &def, false)
		outcome, _ := result["outcome"].(string)
		if outcome == "blocked" {
			blocked++
		} else {
			counter++
		}
	}
	fmt.Printf("  blocked=%d/20  counter_chance=%d/20  (expect ~16 blocked, ~4 counter)\n", blocked, counter)

	sep("PROBABILISTIC: Punch(75) ATK vs Punch(75) ATK — 20 runs (stalemate→counter 5%%)")

	stalemate, counterSt := 0, 0
	for i := 0; i < 20; i++ {
		gs := makeGameState(A, B)
		p := setupPlayers()
		locked := mergeLocks(lock(A, "c1", "attack", 0), lock(B, "c1", "attack", 0))
		result, _, _, _ := vsResolveEncounter(gs, p, locked)
		outcome, _ := result["outcome"].(string)
		ce, _ := result["counter_event"].(bool)
		if outcome == "stalemate" && !ce {
			stalemate++
		} else {
			counterSt++
		}
	}
	fmt.Printf("  pure stalemate=%d/20  stalemate+counter_window=%d/20  (expect ~19 pure, ~1 counter)\n", stalemate, counterSt)

	fmt.Println()
}
