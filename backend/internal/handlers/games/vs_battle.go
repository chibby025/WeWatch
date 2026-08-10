package games

// VS Battle — turn-based 3v3 card battle game.
//
// Each player builds a team of 3 custom characters during the "building" phase.
// Characters have two independent stat budgets (determined by tier): one for attack
// moves and one for defense moves — each pool equals the full tier budget. Up to 5
// moves per pool. Both players confirm the builds, then
// the battle begins: each turn both players simultaneously lock in a character +
// move choice, moves are revealed when the timer expires (or both are in), and
// damage is resolved according to the encounter rules below.
//
// Tier table (budget = pts per pool; ATK and DEF are independent):
//   Regular:     300 ATK pts / 300 DEF pts, 100 HP
//   Street:      350 ATK pts / 350 DEF pts, 150 HP
//   City-Wide:   400 ATK pts / 400 DEF pts, 200 HP
//   Continental: 450 ATK pts / 450 DEF pts, 250 HP
//   Global:      500 ATK pts / 500 DEF pts, 300 HP
//   Universal:   550 ATK pts / 550 DEF pts, 350 HP
//
// Encounter resolution (per turn):
//   Both attack:
//     diff 0–5  → stalemate (0 dmg); 5% chance 1s counter window
//     diff ≥ 6  → lesser attacker loses HP = diff
//   Both defend:
//     both used defense moves permanently -1 point
//   One attacks, one defends:
//     atk-def ≥ 6  → defender loses HP = diff
//     atk-def 1–5  → deflect (0 dmg)
//     atk ≤ def    → 20% counter chance (3s window): reflect 2% or own attack at 5%
//   Attacker vs no-selection:
//     defender takes full attack power as damage
//   Both timeout:
//     nothing

import (
	"fmt"
	"log"
	"math"
	"math/rand"
)

// ── Tier definitions ─────────────────────────────────────────────────────────

type vsTier struct {
	Budget int
	HP     int
}

var vsTiers = map[string]vsTier{
	"Regular":     {300, 100},
	"Street":      {350, 150},
	"City-Wide":   {400, 200},
	"Continental": {450, 250},
	"Global":      {500, 300},
	"Universal":   {550, 350},
}

func vsValidTier(tier string) bool {
	_, ok := vsTiers[tier]
	return ok
}

// ── Data types (serialised into GameData) ────────────────────────────────────

type VSMove struct {
	Name       string `json:"name"`
	Power      int    `json:"power"`
	MoveType   string `json:"move_type"` // "attack" | "defense"
	TriggerURL string `json:"trigger_url,omitempty"`
	IsDefault  bool   `json:"is_default,omitempty"`
}

// Default move powers per tier (outside budget).
var vsDefaultPunchPower = map[string]int{
	"Regular": 75, "Street": 90, "City-Wide": 100,
	"Continental": 115, "Global": 125, "Universal": 140,
}
var vsDefaultBlockPower = map[string]int{
	"Regular": 75, "Street": 90, "City-Wide": 100,
	"Continental": 115, "Global": 125, "Universal": 140,
}

type VSCharacter struct {
	ID      string   `json:"id"`   // client-generated UUID
	Name    string   `json:"name"`
	Tier    string   `json:"tier"`
	HP      int      `json:"hp"`
	MaxHP   int      `json:"max_hp"`
	Budget  int      `json:"budget"`
	Attacks []VSMove `json:"attacks"`
	Defenses []VSMove `json:"defenses"`
	ImageURL string  `json:"image_url,omitempty"`
	Defeated bool    `json:"defeated"`
}

type VSLockedMove struct {
	CharID    string `json:"char_id"`
	MoveType  string `json:"move_type"`  // "attack" | "defense"
	MoveIndex int    `json:"move_index"` // index into Attacks or Defenses
}

type VSCounterState struct {
	CounterType    string `json:"counter_type"`     // "stalemate" | "atk_vs_def"
	AttackerUserID uint   `json:"attacker_user_id"`
	AttackPower    int    `json:"attack_power"`
	DefenderUserID uint   `json:"defender_user_id"`
	// For atk_vs_def counters, the defender's characters so they can pick a move
	DefenderChars []VSCharacter `json:"defender_chars,omitempty"`
}

type VSPlayerState struct {
	UserID     uint          `json:"user_id"`
	Characters []VSCharacter `json:"characters"`
	Confirmed  bool          `json:"confirmed"` // confirmed opponent's build
	HypeMeter  int           `json:"hype_meter"`
	// Consecutive-win streak counters (reset on any non-qualifying outcome)
	AttackStreak  int `json:"attack_streak"`
	DefenseStreak int `json:"defense_streak"`
	// Pending power-up effects (cleared after applied in the next exchange)
	PendingStun     bool   `json:"pending_stun,omitempty"`
	PendingAtkBoost bool   `json:"pending_atk_boost,omitempty"`
	PendingShield   bool   `json:"pending_shield,omitempty"`
	PendingDefBoost bool   `json:"pending_def_boost,omitempty"`
	PendingPoison   string `json:"pending_poison,omitempty"` // "charId:moveType:idx" of disabled move
	// Battle stats (accumulated over the whole match)
	DamageDealt   int `json:"damage_dealt"`
	AttacksLanded int `json:"attacks_landed"`
	Blocks        int `json:"blocks"`
	Counters      int `json:"counters"`
	BiggestHit    int `json:"biggest_hit"`
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func vsBuildState(gameState *GameSessionState) (map[uint]*VSPlayerState, error) {
	raw, ok := gameState.GameData["players"]
	if !ok {
		return nil, fmt.Errorf("vs_battle: no players in game data")
	}
	result := make(map[uint]*VSPlayerState, 2)
	// The data is stored as map[uint]*VSPlayerState but after JSON round-trip
	// it comes back as map[string]interface{} — reconstruct manually.
	switch v := raw.(type) {
	case map[uint]*VSPlayerState:
		return v, nil
	case map[string]interface{}:
		for _, ps := range gameState.Players {
			uid := ps.UserID
			key := fmt.Sprintf("%d", uid)
			pRaw, exists := v[key]
			if !exists {
				continue
			}
			ps2, err := vsDecodePlayerState(pRaw)
			if err != nil {
				return nil, err
			}
			result[uid] = ps2
		}
		return result, nil
	}
	return nil, fmt.Errorf("vs_battle: unexpected players type %T", raw)
}

func vsDecodePlayerState(raw interface{}) (*VSPlayerState, error) {
	m, ok := raw.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("vsDecodePlayerState: not a map")
	}
	ps := &VSPlayerState{}
	if uid, ok := m["user_id"].(float64); ok {
		ps.UserID = uint(uid)
	}
	if c, ok := m["confirmed"].(bool); ok {
		ps.Confirmed = c
	}
	if hype, ok := m["hype_meter"].(float64); ok {
		ps.HypeMeter = int(hype)
	}
	if v, ok := m["attack_streak"].(float64); ok {
		ps.AttackStreak = int(v)
	}
	if v, ok := m["defense_streak"].(float64); ok {
		ps.DefenseStreak = int(v)
	}
	if v, ok := m["pending_stun"].(bool); ok {
		ps.PendingStun = v
	}
	if v, ok := m["pending_atk_boost"].(bool); ok {
		ps.PendingAtkBoost = v
	}
	if v, ok := m["pending_shield"].(bool); ok {
		ps.PendingShield = v
	}
	if v, ok := m["pending_def_boost"].(bool); ok {
		ps.PendingDefBoost = v
	}
	if v, ok := m["pending_poison"].(string); ok {
		ps.PendingPoison = v
	}
	if v, ok := m["damage_dealt"].(float64); ok {
		ps.DamageDealt = int(v)
	}
	if v, ok := m["attacks_landed"].(float64); ok {
		ps.AttacksLanded = int(v)
	}
	if v, ok := m["blocks"].(float64); ok {
		ps.Blocks = int(v)
	}
	if v, ok := m["counters"].(float64); ok {
		ps.Counters = int(v)
	}
	if v, ok := m["biggest_hit"].(float64); ok {
		ps.BiggestHit = int(v)
	}
	if chars, ok := m["characters"].([]interface{}); ok {
		for _, ch := range chars {
			char, err := vsDecodeCharacter(ch)
			if err != nil {
				return nil, err
			}
			ps.Characters = append(ps.Characters, char)
		}
	}
	return ps, nil
}

func vsDecodeCharacter(raw interface{}) (VSCharacter, error) {
	m, ok := raw.(map[string]interface{})
	if !ok {
		return VSCharacter{}, fmt.Errorf("vsDecodeCharacter: not a map")
	}
	c := VSCharacter{}
	if id, ok := m["id"].(string); ok {
		c.ID = id
	}
	if name, ok := m["name"].(string); ok {
		c.Name = name
	}
	if tier, ok := m["tier"].(string); ok {
		c.Tier = tier
	}
	if hp, ok := m["hp"].(float64); ok {
		c.HP = int(hp)
	}
	if maxHP, ok := m["max_hp"].(float64); ok {
		c.MaxHP = int(maxHP)
	}
	if budget, ok := m["budget"].(float64); ok {
		c.Budget = int(budget)
	}
	if imgURL, ok := m["image_url"].(string); ok {
		c.ImageURL = imgURL
	}
	if def, ok := m["defeated"].(bool); ok {
		c.Defeated = def
	}
	for _, field := range []string{"attacks", "defenses"} {
		movesRaw, ok := m[field].([]interface{})
		if !ok {
			continue
		}
		for _, mv := range movesRaw {
			move, err := vsDecodeMove(mv)
			if err != nil {
				return c, err
			}
			if field == "attacks" {
				c.Attacks = append(c.Attacks, move)
			} else {
				c.Defenses = append(c.Defenses, move)
			}
		}
	}
	return c, nil
}

func vsDecodeMove(raw interface{}) (VSMove, error) {
	m, ok := raw.(map[string]interface{})
	if !ok {
		return VSMove{}, fmt.Errorf("vsDecodeMove: not a map")
	}
	mv := VSMove{}
	if name, ok := m["name"].(string); ok {
		mv.Name = name
	}
	if power, ok := m["power"].(float64); ok {
		mv.Power = int(power)
	}
	if mt, ok := m["move_type"].(string); ok {
		mv.MoveType = mt
	}
	if url, ok := m["trigger_url"].(string); ok {
		mv.TriggerURL = url
	}
	return mv, nil
}

func vsSavePlayers(gameState *GameSessionState, players map[uint]*VSPlayerState) {
	gameState.GameData["players"] = players
}

func vsGetPhase(gameState *GameSessionState) string {
	phase, _ := gameState.GameData["phase"].(string)
	if phase == "" {
		return "building" // GameData starts empty for a freshly-started game
	}
	return phase
}

func vsSetPhase(gameState *GameSessionState, phase string) {
	gameState.GameData["phase"] = phase
}

func vsAllDefeated(chars []VSCharacter) bool {
	for _, c := range chars {
		if !c.Defeated {
			return true // at least one still alive
		}
	}
	return false // none alive — all defeated
}

func vsAliveChars(chars []VSCharacter) []VSCharacter {
	var alive []VSCharacter
	for _, c := range chars {
		if !c.Defeated {
			alive = append(alive, c)
		}
	}
	return alive
}

func vsCharByID(chars []VSCharacter, id string) *VSCharacter {
	for i := range chars {
		if chars[i].ID == id {
			return &chars[i]
		}
	}
	return nil
}

func vsOpponentID(players map[uint]*VSPlayerState, myID uint) uint {
	for uid := range players {
		if uid != myID {
			return uid
		}
	}
	return 0
}

// clamp HP to [0, maxHP]
func vsClampHP(c *VSCharacter) {
	if c.HP < 0 {
		c.HP = 0
	}
	if c.HP > c.MaxHP {
		c.HP = c.MaxHP
	}
	if c.HP == 0 {
		c.Defeated = true
	}
}

// ── Move processors ───────────────────────────────────────────────────────────

// vsPublicGameData returns a version of GameData safe to broadcast to all clients.
// It strips the locked_moves map (which would reveal opponent choices before reveal)
// and replaces it with opponent_locked — a bool map showing who has locked without
// revealing what they chose. Each client tracks their own lock locally in React state.
func vsPublicGameData(data map[string]interface{}) map[string]interface{} {
	pub := make(map[string]interface{}, len(data))
	for k, v := range data {
		pub[k] = v
	}

	// Build opponent_locked from locked_moves keys
	opponentLocked := map[string]bool{}
	if lm, ok := data["locked_moves"]; ok {
		switch v := lm.(type) {
		case map[string]interface{}:
			for uid := range v {
				opponentLocked[uid] = true
			}
		case map[uint]VSLockedMove:
			for uid := range v {
				opponentLocked[fmt.Sprintf("%d", uid)] = true
			}
		}
	}
	pub["opponent_locked"] = opponentLocked
	delete(pub, "locked_moves")
	return pub
}

// processVSBattleMove is the main entry point called from game_manager.ProcessMove.
// Move types:
//   submit_character  — add a character to the player's roster during building
//   confirm_builds    — signal the player is happy with both rosters
//   lock_move         — lock in this turn's character + move choice
//   counter_choice    — choose option A (reflect) or B (own attack) in counter window
//   dice_roll_result  — player triggers dice roll; server generates result and applies power-up
//   hype              — spectator taps hype for a player
func processVSBattleMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (bool, *uint, error) {
	// The frontend nests all character/move fields under a "move_data" key.
	// Extract it so individual processors can read fields directly.
	if nested, ok := moveData["move_data"].(map[string]interface{}); ok {
		moveData = nested
	}
	switch moveType {
	case "submit_character":
		return processVSSubmitCharacter(gameState, playerID, moveData)
	case "confirm_builds":
		return processVSConfirmBuilds(gameState, playerID, moveData)
	case "lock_move":
		return processVSLockMove(gameState, playerID, moveData)
	case "counter_choice":
		return processVSCounterChoice(gameState, playerID, moveData)
	case "dice_roll_result":
		return processVSDiceRollResult(gameState, playerID, moveData)
	case "hype":
		return processVSHype(gameState, playerID, moveData)
	default:
		return false, nil, fmt.Errorf("vs_battle: unknown move type %q", moveType)
	}
}

// ── Phase: building ───────────────────────────────────────────────────────────

func processVSSubmitCharacter(gameState *GameSessionState, playerID uint, data map[string]interface{}) (bool, *uint, error) {
	if vsGetPhase(gameState) != "building" {
		return false, nil, fmt.Errorf("vs_battle: cannot submit character outside building phase")
	}
	// Ensure phase is persisted in GameData (it may be absent on the first move
	// of a freshly-started game whose GameData begins as an empty map).
	vsSetPhase(gameState, "building")

	players, err := vsBuildState(gameState)
	if err != nil {
		players = vsInitPlayers(gameState)
	}

	ps, ok := players[playerID]
	if !ok {
		return false, nil, fmt.Errorf("vs_battle: player %d not found", playerID)
	}
	if len(ps.Characters) >= 3 {
		return false, nil, fmt.Errorf("vs_battle: already have 3 characters")
	}

	char, err := vsParseCharacterFromData(data)
	if err != nil {
		return false, nil, err
	}
	// Idempotent: skip silently if this character ID is already in the roster.
	// This lets confirm_builds safely re-submit characters that arrived earlier.
	for _, existing := range ps.Characters {
		if existing.ID == char.ID {
			return false, nil, nil
		}
	}
	ps.Characters = append(ps.Characters, char)
	vsSavePlayers(gameState, players)
	return false, nil, nil
}

func vsInitPlayers(gameState *GameSessionState) map[uint]*VSPlayerState {
	players := make(map[uint]*VSPlayerState, len(gameState.Players))
	for _, p := range gameState.Players {
		players[p.UserID] = &VSPlayerState{
			UserID:    p.UserID,
			HypeMeter: 0,
		}
	}
	vsSavePlayers(gameState, players)
	return players
}

func vsParseCharacterFromData(data map[string]interface{}) (VSCharacter, error) {
	c := VSCharacter{}
	id, _ := data["id"].(string)
	if id == "" {
		return c, fmt.Errorf("vs_battle: character missing id")
	}
	name, _ := data["name"].(string)
	if name == "" {
		return c, fmt.Errorf("vs_battle: character missing name")
	}
	tier, _ := data["tier"].(string)
	td, ok := vsTiers[tier]
	if !ok {
		return c, fmt.Errorf("vs_battle: invalid tier %q", tier)
	}
	imageURL, _ := data["image_url"].(string)

	// Parse attacks — attack budget is independent of defence budget.
	// Each pool allows td.Budget points; they do not share a combined cap.
	attacksRaw, _ := data["attacks"].([]interface{})
	var attacks []VSMove
	var atkBudget int
	for _, ar := range attacksRaw {
		mv, err := vsDecodeMove(ar)
		if err != nil {
			return c, err
		}
		mv.MoveType = "attack"
		if mv.Power <= 0 {
			return c, fmt.Errorf("vs_battle: move %q has non-positive power", mv.Name)
		}
		atkBudget += mv.Power
		attacks = append(attacks, mv)
	}
	if len(attacks) > 5 {
		return c, fmt.Errorf("vs_battle: max 5 attack moves")
	}
	if atkBudget > td.Budget {
		return c, fmt.Errorf("vs_battle: attack move power %d exceeds tier attack budget %d", atkBudget, td.Budget)
	}

	// Parse defenses — separate budget pool from attacks.
	defensesRaw, _ := data["defenses"].([]interface{})
	var defenses []VSMove
	var defBudget int
	for _, dr := range defensesRaw {
		mv, err := vsDecodeMove(dr)
		if err != nil {
			return c, err
		}
		mv.MoveType = "defense"
		if mv.Power <= 0 {
			return c, fmt.Errorf("vs_battle: move %q has non-positive power", mv.Name)
		}
		defBudget += mv.Power
		defenses = append(defenses, mv)
	}
	if len(defenses) > 5 {
		return c, fmt.Errorf("vs_battle: max 5 defense moves")
	}
	if defBudget > td.Budget {
		return c, fmt.Errorf("vs_battle: defense move power %d exceeds tier defense budget %d", defBudget, td.Budget)
	}
	// No minimum move count — Punch and Block are always injected as defaults below.

	c.ID = id
	c.Name = name
	c.Tier = tier
	c.HP = td.HP
	c.MaxHP = td.HP
	c.Budget = td.Budget
	// Prepend tier-scaled default moves (outside budget, non-removable).
	punchPow := vsDefaultPunchPower[tier]
	blockPow := vsDefaultBlockPower[tier]
	c.Attacks = append([]VSMove{{
		Name:      "Punch",
		Power:     punchPow,
		MoveType:  "attack",
		IsDefault: true,
	}}, attacks...)
	c.Defenses = append([]VSMove{{
		Name:      "Block",
		Power:     blockPow,
		MoveType:  "defense",
		IsDefault: true,
	}}, defenses...)
	c.ImageURL = imageURL
	return c, nil
}

// ── Phase: confirming ─────────────────────────────────────────────────────────

func processVSConfirmBuilds(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	phase := vsGetPhase(gameState)
	if phase != "building" && phase != "confirming" {
		return false, nil, fmt.Errorf("vs_battle: cannot confirm outside building/confirming phase")
	}

	// Process any characters sent inline with confirm_builds (all-in-one path).
	// processVSSubmitCharacter requires "building" phase, but when the opponent
	// already confirmed the phase is already "confirming" — temporarily restore
	// "building" so the characters are accepted, then put the phase back.
	if charsRaw, ok := moveData["characters"]; ok {
		if charsList, ok := charsRaw.([]interface{}); ok {
			savedPhase := vsGetPhase(gameState)
			vsSetPhase(gameState, "building")
			for _, charRaw := range charsList {
				if charMap, ok := charRaw.(map[string]interface{}); ok {
					processVSSubmitCharacter(gameState, playerID, charMap)
				}
			}
			vsSetPhase(gameState, savedPhase)
		}
	}

	players, err := vsBuildState(gameState)
	if err != nil {
		return false, nil, err
	}
	ps, ok := players[playerID]
	if !ok {
		return false, nil, fmt.Errorf("vs_battle: player %d not found", playerID)
	}
	if len(ps.Characters) == 0 {
		return false, nil, fmt.Errorf("vs_battle: must submit at least one character before confirming")
	}
	ps.Confirmed = true

	// Check if all players confirmed
	allConfirmed := true
	for _, p := range players {
		if !p.Confirmed {
			allConfirmed = false
			break
		}
	}

	vsSetPhase(gameState, "confirming")
	if allConfirmed {
		vsSetPhase(gameState, "battle")
		gameState.GameData["turn"] = 0
		gameState.GameData["locked_moves"] = map[string]interface{}{}
	}
	vsSavePlayers(gameState, players)
	return false, nil, nil
}

// ── Phase: battle — lock move ─────────────────────────────────────────────────

func processVSLockMove(gameState *GameSessionState, playerID uint, data map[string]interface{}) (bool, *uint, error) {
	phase := vsGetPhase(gameState)
	if phase != "battle" {
		return false, nil, fmt.Errorf("vs_battle: cannot lock move outside battle phase")
	}

	charID, _ := data["char_id"].(string)
	// vs_move_type is the attack/defense sub-type within a lock_move, distinct
	// from the top-level WS move_type ("lock_move") that routes here.
	vsMoveType, _ := data["vs_move_type"].(string)
	moveIndexF, _ := data["move_index"].(float64)
	moveIndex := int(moveIndexF)

	log.Printf("🎮 [VSBattle] lock_move received: playerID=%d char_id=%q vs_move_type=%q move_index=%d", playerID, charID, vsMoveType, moveIndex)

	if charID == "" || (vsMoveType != "attack" && vsMoveType != "defense") {
		return false, nil, fmt.Errorf("vs_battle: invalid lock_move data (char_id=%q vs_move_type=%q)", charID, vsMoveType)
	}
	moveType := vsMoveType

	players, err := vsBuildState(gameState)
	if err != nil {
		return false, nil, err
	}
	ps, ok := players[playerID]
	if !ok {
		return false, nil, fmt.Errorf("vs_battle: player %d not found", playerID)
	}

	// Validate character belongs to this player and is alive
	char := vsCharByID(ps.Characters, charID)
	if char == nil {
		return false, nil, fmt.Errorf("vs_battle: character %q not found", charID)
	}
	if char.Defeated {
		return false, nil, fmt.Errorf("vs_battle: character %q is defeated", charID)
	}

	// Validate move index
	if moveType == "attack" {
		if moveIndex < 0 || moveIndex >= len(char.Attacks) {
			return false, nil, fmt.Errorf("vs_battle: invalid attack index %d", moveIndex)
		}
	} else {
		if moveIndex < 0 || moveIndex >= len(char.Defenses) {
			return false, nil, fmt.Errorf("vs_battle: invalid defense index %d", moveIndex)
		}
	}

	// Store the lock (hidden per-player — websocket_handler sends this only to the locking player)
	locked, _ := gameState.GameData["locked_moves"].(map[string]interface{})
	if locked == nil {
		locked = map[string]interface{}{}
	}
	locked[fmt.Sprintf("%d", playerID)] = map[string]interface{}{
		"char_id":    charID,
		"move_type":  moveType,
		"move_index": float64(moveIndex),
	}
	gameState.GameData["locked_moves"] = locked

	// If both players have locked, resolve the turn
	allLocked := true
	for _, p := range gameState.Players {
		if _, ok := locked[fmt.Sprintf("%d", p.UserID)]; !ok {
			allLocked = false
			break
		}
	}

	if allLocked {
		return vsResolveTurn(gameState, players, locked)
	}

	vsSavePlayers(gameState, players)
	return false, nil, nil
}

// vsResolveTurnTimeout resolves a turn where one or both players didn't lock in time.
// Called by the server-side turn timer goroutine in websocket_handler.go.
// Returns (gameOver, winnerID, error); the turn result is stored in gameState.GameData["last_turn_result"].
func vsResolveTurnTimeout(gameState *GameSessionState) (bool, *uint, error) {
	players, err := vsBuildState(gameState)
	if err != nil {
		return false, nil, err
	}
	locked, _ := gameState.GameData["locked_moves"].(map[string]interface{})
	if locked == nil {
		locked = map[string]interface{}{}
	}
	return vsResolveTurn(gameState, players, locked)
}

// ── Turn resolution ───────────────────────────────────────────────────────────

// vsResolveTurn resolves a full turn. The turn result is stored in
// gameState.GameData["last_turn_result"] so the caller can broadcast it.
func vsResolveTurn(gameState *GameSessionState, players map[uint]*VSPlayerState, locked map[string]interface{}) (bool, *uint, error) {
	result, gameOver, winnerID, err := vsResolveEncounter(gameState, players, locked)
	if err != nil {
		return false, nil, err
	}

	// Clear locked moves and dice_roll_result from the previous turn
	gameState.GameData["locked_moves"] = map[string]interface{}{}
	delete(gameState.GameData, "dice_roll_result")
	turn := getIntField(gameState.GameData, "turn")
	gameState.GameData["turn"] = turn + 1

	// Store result for broadcast (caller reads this to construct the broadcast payload)
	gameState.GameData["last_turn_result"] = result

	// Check if any player earned a dice roll (streak of 3).
	// Only triggers when the game is still ongoing.
	if !gameOver {
		pending := map[string]interface{}{}
		for uid, ps := range players {
			key := fmt.Sprintf("%d", uid)
			if ps.AttackStreak >= 3 {
				pending[key] = "attack"
				ps.AttackStreak = 0 // reset so it doesn't re-trigger next turn
			} else if ps.DefenseStreak >= 3 {
				pending[key] = "defense"
				ps.DefenseStreak = 0
			}
		}
		if len(pending) > 0 {
			gameState.GameData["pending_dice_rolls"] = pending
			vsSetPhase(gameState, "dice_roll")
		}
	}

	vsSavePlayers(gameState, players)
	return gameOver, winnerID, nil
}

func vsResolveEncounter(gameState *GameSessionState, players map[uint]*VSPlayerState, locked map[string]interface{}) (map[string]interface{}, bool, *uint, error) {
	// Collect what each player locked in (nil = timed out / no selection)
	type playerChoice struct {
		uid      uint
		ps       *VSPlayerState
		lockData *VSLockedMove
		char     *VSCharacter
		move     *VSMove
	}

	var choices []playerChoice
	for _, p := range gameState.Players {
		uid := p.UserID
		ps := players[uid]
		var ld *VSLockedMove
		if rawLock, ok := locked[fmt.Sprintf("%d", uid)]; ok {
			if lm, ok := rawLock.(map[string]interface{}); ok {
				charID, _ := lm["char_id"].(string)
				mt, _ := lm["move_type"].(string)
				miF, _ := lm["move_index"].(float64)
				ld = &VSLockedMove{CharID: charID, MoveType: mt, MoveIndex: int(miF)}
			}
		}
		choices = append(choices, playerChoice{uid: uid, ps: ps, lockData: ld})
	}

	// Resolve each choice to its character and move
	for i := range choices {
		c := &choices[i]
		if c.lockData == nil {
			continue // timed out
		}
		char := vsCharByID(c.ps.Characters, c.lockData.CharID)
		if char == nil || char.Defeated {
			c.lockData = nil // treat as no selection
			continue
		}
		c.char = char
		if c.lockData.MoveType == "attack" {
			if c.lockData.MoveIndex < len(char.Attacks) {
				mv := char.Attacks[c.lockData.MoveIndex]
				c.move = &mv
			}
		} else {
			if c.lockData.MoveIndex < len(char.Defenses) {
				mv := char.Defenses[c.lockData.MoveIndex]
				c.move = &mv
			}
		}
		if c.move == nil {
			c.lockData = nil // invalid index, treat as timeout
		} else {
			log.Printf("🎮 [VSBattle] resolved move: playerID=%d char=%q moveType=%q moveIndex=%d moveName=%q", c.uid, c.char.Name, c.lockData.MoveType, c.lockData.MoveIndex, c.move.Name)
		}
	}

	result := map[string]interface{}{
		"outcome":       "none",
		"counter_event": false,
	}

	if len(choices) < 2 {
		return result, false, nil, nil
	}
	a, b := &choices[0], &choices[1]

	// ── Apply pending power-ups before resolving ──────────────────────────────

	// Stun: stunned player's effective move power becomes 0
	if a.ps.PendingStun {
		a.ps.PendingStun = false
		if a.move != nil {
			cp := *a.move
			cp.Power = 0
			a.move = &cp
		}
	}
	if b.ps.PendingStun {
		b.ps.PendingStun = false
		if b.move != nil {
			cp := *b.move
			cp.Power = 0
			b.move = &cp
		}
	}

	// Poison: if the selected move is the poisoned move, disable it
	applyPoison := func(c *playerChoice) {
		if c.move == nil || c.ps.PendingPoison == "" {
			return
		}
		key := fmt.Sprintf("%s:%s:%d", c.lockData.CharID, c.lockData.MoveType, c.lockData.MoveIndex)
		if key == c.ps.PendingPoison {
			cp := *c.move
			cp.Power = 0
			c.move = &cp
		}
		c.ps.PendingPoison = "" // clear after one exchange regardless
	}
	applyPoison(a)
	applyPoison(b)

	// Attack boost: +10% to attacker's move if they're attacking
	applyAtkBoost := func(c *playerChoice) {
		if c.ps.PendingAtkBoost && c.move != nil && c.lockData != nil && c.lockData.MoveType == "attack" {
			c.ps.PendingAtkBoost = false
			cp := *c.move
			cp.Power = int(float64(cp.Power) * 1.10)
			c.move = &cp
		}
	}
	// Defense boost: +10% to defender's move if they're defending
	applyDefBoost := func(c *playerChoice) {
		if c.ps.PendingDefBoost && c.move != nil && c.lockData != nil && c.lockData.MoveType == "defense" {
			c.ps.PendingDefBoost = false
			cp := *c.move
			cp.Power = int(float64(cp.Power) * 1.10)
			c.move = &cp
		}
	}
	applyAtkBoost(a)
	applyAtkBoost(b)
	applyDefBoost(a)
	applyDefBoost(b)

	// ── Determine what happened ───────────────────────────────────────────────

	// Determine what happened
	aSelected := a.lockData != nil
	bSelected := b.lockData != nil

	switch {
	case !aSelected && !bSelected:
		// Both timed out — nothing
		result["outcome"] = "both_timeout"

	case aSelected && !bSelected:
		// a attacks; b timed out and never selected a character, so a.char/
		// a.move are the only resolved side here — b.char stays nil (the
		// resolution loop above `continue`s without setting it whenever
		// lockData is nil). The attack lands on b's first alive character
		// instead, same as every other "no selection made" resolution in
		// this file (see vsFirstAliveChar's other callers in the counter-
		// choice logic below). Dereferencing b.char.ID directly here used
		// to panic with a nil pointer — this is that fix.
		if a.lockData.MoveType == "attack" {
			if defChar := vsFirstAliveChar(b.ps); defChar != nil {
				dmg := a.move.Power
				vsApplyDamage(defChar, dmg)
				result["outcome"] = "undefended"
				result["attacker"] = a.uid
				result["defender"] = b.uid
				result["attacker_char_id"] = a.char.ID
				result["defender_char_id"] = defChar.ID
				result["damage"] = dmg
				result["trigger_url"] = a.move.TriggerURL
				result["attacker_move_name"] = a.move.Name
			}
		}
		// if a chose defense and b timed out: nothing meaningful

	case !aSelected && bSelected:
		// Symmetric case — a timed out, b attacks. Same nil-pointer fix.
		if b.lockData.MoveType == "attack" {
			if defChar := vsFirstAliveChar(a.ps); defChar != nil {
				dmg := b.move.Power
				vsApplyDamage(defChar, dmg)
				result["outcome"] = "undefended"
				result["attacker"] = b.uid
				result["defender"] = a.uid
				result["attacker_char_id"] = b.char.ID
				result["defender_char_id"] = defChar.ID
				result["damage"] = dmg
				result["trigger_url"] = b.move.TriggerURL
				result["attacker_move_name"] = b.move.Name
			}
		}

	case a.lockData.MoveType == "attack" && b.lockData.MoveType == "attack":
		result = vsResolveBothAttack(gameState, a.uid, a.char, a.move, b.uid, b.char, b.move)

	case a.lockData.MoveType == "defense" && b.lockData.MoveType == "defense":
		// Both defend — each used move loses 1 point permanently
		aIdx := a.lockData.MoveIndex
		bIdx := b.lockData.MoveIndex
		// Capture clip info before modifying powers
		var aTrigger, bTrigger, aMoveName, bMoveName string
		if aIdx < len(a.char.Defenses) {
			aTrigger = a.char.Defenses[aIdx].TriggerURL
			aMoveName = a.char.Defenses[aIdx].Name
		}
		if bIdx < len(b.char.Defenses) {
			bTrigger = b.char.Defenses[bIdx].TriggerURL
			bMoveName = b.char.Defenses[bIdx].Name
		}
		if aIdx < len(a.char.Defenses) && a.char.Defenses[aIdx].Power > 0 {
			a.char.Defenses[aIdx] = VSMove{
				Name:       a.char.Defenses[aIdx].Name,
				Power:      max(0, a.char.Defenses[aIdx].Power-3),
				MoveType:   "defense",
				TriggerURL: a.char.Defenses[aIdx].TriggerURL,
			}
		}
		if bIdx < len(b.char.Defenses) && b.char.Defenses[bIdx].Power > 0 {
			b.char.Defenses[bIdx] = VSMove{
				Name:       b.char.Defenses[bIdx].Name,
				Power:      max(0, b.char.Defenses[bIdx].Power-3),
				MoveType:   "defense",
				TriggerURL: b.char.Defenses[bIdx].TriggerURL,
			}
		}
		result["outcome"] = "both_defend"
		result["player_a"] = a.uid
		result["player_b"] = b.uid
		result["trigger_a"] = aTrigger
		result["trigger_b"] = bTrigger
		result["move_a_name"] = aMoveName
		result["move_b_name"] = bMoveName

	default:
		// One attacks, one defends
		attacker, defender := a, b
		if a.lockData.MoveType == "defense" {
			attacker, defender = b, a
		}
		// Shield: if defender has shield, force block regardless of power diff
		forceBlocked := defender.ps.PendingShield
		if forceBlocked {
			defender.ps.PendingShield = false
		}
		result = vsResolveAtkVsDef(gameState, attacker.uid, attacker.char, attacker.move, defender.uid, defender.char, defender.move, forceBlocked)
	}

	// ── Update streaks and battle stats ───────────────────────────────────────
	vsUpdateStreaksAndStats(players, result)

	// Check win condition after any damage
	gameOver, winnerID := vsCheckWin(players)
	if gameOver {
		result["game_over"] = true
		if winnerID != nil {
			result["winner_id"] = *winnerID
			// Store killing blow trigger URL
			gameState.GameData["killing_blow_url"] = result["trigger_url"]
		}
	}

	return result, gameOver, winnerID, nil
}

func vsResolveBothAttack(gameState *GameSessionState, aUID uint, aChar *VSCharacter, aMove *VSMove, bUID uint, bChar *VSCharacter, bMove *VSMove) map[string]interface{} {
	diff := aMove.Power - bMove.Power
	absDiff := int(math.Abs(float64(diff)))

	result := map[string]interface{}{
		"outcome":      "both_attack",
		"player_a":     aUID,
		"player_b":     bUID,
		"power_a":      aMove.Power,
		"power_b":      bMove.Power,
		"trigger_a":    aMove.TriggerURL,
		"trigger_b":    bMove.TriggerURL,
		"move_a_name":  aMove.Name,
		"move_b_name":  bMove.Name,
	}

	if absDiff <= 5 {
		result["outcome"] = "stalemate"
		result["damage"] = 0
		// 5% chance counter window
		if rand.Float64() < 0.05 {
			result["counter_event"] = true
			result["counter_type"] = "stalemate"
			result["counter_duration_ms"] = 1000
			gameState.GameData["counter_state"] = map[string]interface{}{
				"type":             "stalemate",
				"attacker_user_id": aUID,
				"attack_power_a":   aMove.Power,
				"attacker_b_uid":   bUID,
				"attack_power_b":   bMove.Power,
			}
			vsSetPhase(gameState, "counter_window")
		}
	} else {
		// Damage goes to the character with lesser attack
		var losChar *VSCharacter
		var losUID uint
		var dmg int
		if diff > 0 {
			losChar, losUID = bChar, bUID
		} else {
			losChar, losUID = aChar, aUID
		}
		dmg = absDiff
		vsApplyDamage(losChar, dmg)
		result["outcome"] = "attack_wins"
		result["loser"] = losUID
		result["loser_char_id"] = losChar.ID
		result["damage"] = dmg
		// identify winner char for frontend combat display
		if diff > 0 {
			result["winner_char_id"] = aChar.ID
			result["trigger_url"] = aMove.TriggerURL
		} else {
			result["winner_char_id"] = bChar.ID
			result["trigger_url"] = bMove.TriggerURL
		}
	}
	return result
}

func vsResolveAtkVsDef(gameState *GameSessionState, atkUID uint, atkChar *VSCharacter, atkMove *VSMove, defUID uint, defChar *VSCharacter, defMove *VSMove, forceBlocked bool) map[string]interface{} {
	result := map[string]interface{}{
		"outcome":            "atk_vs_def",
		"attacker":           atkUID,
		"defender":           defUID,
		"attacker_char_id":   atkChar.ID,
		"atk_power":          atkMove.Power,
		"def_power":          defMove.Power,
		"trigger_url":        atkMove.TriggerURL,
		"def_trigger_url":    defMove.TriggerURL,
		"attacker_move_name": atkMove.Name,
		"defender_move_name": defMove.Name,
	}

	// Shield blocks all attacks — no damage, no counter window
	if forceBlocked {
		result["outcome"] = "blocked"
		result["damage"] = 0
		result["defender_char_id"] = defChar.ID
		result["shield_blocked"] = true
		return result
	}

	diff := atkMove.Power - defMove.Power

	if diff >= 6 {
		// Attack lands
		vsApplyDamage(defChar, diff)
		result["outcome"] = "attack_lands"
		result["defender_char_id"] = defChar.ID
		result["damage"] = diff

	} else if diff >= 1 {
		// Deflect — 1-5 point gap
		result["outcome"] = "deflect"
		result["damage"] = 0
		result["defender_char_id"] = defChar.ID

	} else {
		// Attack ≤ defense — 20% counter chance
		if rand.Float64() < 0.20 {
			result["counter_event"] = true
			result["counter_type"] = "atk_vs_def"
			result["counter_duration_ms"] = 3000
			gameState.GameData["counter_state"] = map[string]interface{}{
				"type":             "atk_vs_def",
				"attacker_user_id": atkUID,
				"attack_power":     atkMove.Power,
				"defender_user_id": defUID,
			}
			vsSetPhase(gameState, "counter_window")
			result["outcome"] = "counter_chance"
		} else {
			result["outcome"] = "blocked"
			result["damage"] = 0
			result["defender_char_id"] = defChar.ID
		}
	}
	return result
}

// VSWinnerCharNames returns the character names for the winner of a VS Battle game.
// Used by game_manager to build the end-of-game room announcement.
func VSWinnerCharNames(gameState *GameSessionState, winnerID uint) []string {
	players, err := vsBuildState(gameState)
	if err != nil {
		return nil
	}
	ps, ok := players[winnerID]
	if !ok {
		return nil
	}
	names := make([]string, 0, len(ps.Characters))
	for _, c := range ps.Characters {
		names = append(names, c.Name)
	}
	return names
}

func vsApplyDamage(char *VSCharacter, dmg int) {
	if char == nil {
		return
	}
	char.HP -= dmg
	vsClampHP(char)
}

// ── Phase: counter_window ─────────────────────────────────────────────────────

func processVSCounterChoice(gameState *GameSessionState, playerID uint, data map[string]interface{}) (bool, *uint, error) {
	if vsGetPhase(gameState) != "counter_window" {
		return false, nil, fmt.Errorf("vs_battle: no active counter window")
	}

	csRaw, ok := gameState.GameData["counter_state"].(map[string]interface{})
	if !ok {
		return false, nil, fmt.Errorf("vs_battle: missing counter state")
	}
	counterType, _ := csRaw["type"].(string)

	players, err := vsBuildState(gameState)
	if err != nil {
		return false, nil, err
	}

	option, _ := data["option"].(string) // "reflect" | "attack"
	moveIndexF, _ := data["move_index"].(float64)
	moveIndex := int(moveIndexF)

	switch counterType {
	case "stalemate":
		// Either player can trigger — whoever sends first wins
		// Reflect 2% of opponent's attack power OR play any attack at 10%
		oppUID := vsOpponentID(players, playerID)
		oppPS := players[oppUID]
		myPS := players[playerID]

		// Find the opponent's attack power from counter_state
		var oppAtkPower int
		if playerID == uint(getF64(csRaw, "attacker_user_id")) {
			oppAtkPower = int(getF64(csRaw, "attack_power_b"))
		} else {
			oppAtkPower = int(getF64(csRaw, "attack_power_a"))
		}

		var dmg int
		var triggerURL string
		var actorCharID string
		if option == "reflect" {
			dmg = int(math.Max(1, float64(oppAtkPower)*0.02))
			if ac := vsFirstAliveChar(myPS); ac != nil {
				actorCharID = ac.ID
			}
		} else {
			// option == "attack" — pick any attack move at 10%
			myChar := vsFirstAliveWithAttack(myPS)
			if myChar != nil && moveIndex >= 0 && moveIndex < len(myChar.Attacks) {
				dmg = int(math.Max(1, float64(myChar.Attacks[moveIndex].Power)*0.10))
				triggerURL = myChar.Attacks[moveIndex].TriggerURL
				actorCharID = myChar.ID
			}
		}

		// Target is the opponent's first alive character that was in the clash
		targetChar := vsFirstAliveChar(oppPS)
		if targetChar != nil && dmg > 0 {
			vsApplyDamage(targetChar, dmg)
		}

		var targetCharID string
		if targetChar != nil {
			targetCharID = targetChar.ID
		}
		gameState.GameData["counter_result"] = map[string]interface{}{
			"type":           counterType,
			"actor":          playerID,
			"actor_char_id":  actorCharID,
			"target":         oppUID,
			"target_char_id": targetCharID,
			"option":         option,
			"damage":         dmg,
			"trigger_url":    triggerURL,
		}

	case "atk_vs_def":
		// Only the defender can choose
		defUID := uint(getF64(csRaw, "defender_user_id"))
		if playerID != defUID {
			return false, nil, fmt.Errorf("vs_battle: only the defender can choose in atk_vs_def counter")
		}
		atkUID := uint(getF64(csRaw, "attacker_user_id"))
		atkPower := int(getF64(csRaw, "attack_power"))
		atkPS := players[atkUID]
		defPS := players[defUID]

		var dmg int
		var triggerURL string
		var actorCharID string
		if option == "reflect" {
			dmg = int(math.Max(1, float64(atkPower)*0.02))
			if ac := vsFirstAliveChar(defPS); ac != nil {
				actorCharID = ac.ID
			}
		} else {
			// option == "attack" — pick any of defender's own attack moves at 5%
			defChar := vsFirstAliveWithAttack(defPS)
			if defChar != nil && moveIndex >= 0 && moveIndex < len(defChar.Attacks) {
				dmg = int(math.Max(1, float64(defChar.Attacks[moveIndex].Power)*0.05))
				triggerURL = defChar.Attacks[moveIndex].TriggerURL
				actorCharID = defChar.ID
			}
		}

		targetChar := vsFirstAliveChar(atkPS)
		if targetChar != nil && dmg > 0 {
			vsApplyDamage(targetChar, dmg)
		}

		var targetCharID string
		if targetChar != nil {
			targetCharID = targetChar.ID
		}
		gameState.GameData["counter_result"] = map[string]interface{}{
			"type":           counterType,
			"actor":          playerID,
			"actor_char_id":  actorCharID,
			"target":         atkUID,
			"target_char_id": targetCharID,
			"option":         option,
			"damage":         dmg,
			"trigger_url":    triggerURL,
		}
	}

	// Return to battle phase
	vsSetPhase(gameState, "battle")
	delete(gameState.GameData, "counter_state")
	vsSavePlayers(gameState, players)

	// Expose counter result as last_turn_result so the frontend can show it.
	// Also advance the turn counter so BattlePhase's turn-change effect fires.
	if cr, ok := gameState.GameData["counter_result"]; ok {
		if crMap, ok2 := cr.(map[string]interface{}); ok2 {
			crMap["outcome"] = "counter_result"
			gameState.GameData["last_turn_result"] = crMap
		}
	}
	delete(gameState.GameData, "counter_result")
	counterTurn := getIntField(gameState.GameData, "turn")
	gameState.GameData["turn"] = counterTurn + 1

	// Check win condition
	gameOver, winnerID := vsCheckWin(players)
	if gameOver {
		gameState.GameData["last_turn_result"] = map[string]interface{}{"game_over": true}
	}
	return gameOver, winnerID, nil
}

// vsResolveCounterTimeout is the server-side backstop for a counter window
// nobody responded to in time — see GameManager.startVSCounterTimeout's doc
// comment for the full rationale (a purely client-side countdown can't be
// trusted alone: a backgrounded/throttled tab, a crash, or a dropped
// connection means the resolving move never arrives, and every connected
// client's modal stays open forever since it's gated on the server-broadcast
// phase, which would otherwise never change).
//
// Deliberately does nothing clever — no guessed "reflect" on anyone's
// behalf, just a clean revert to normal play with zero damage, reported to
// clients via the same "both_timeout" outcome the normal turn-timeout path
// already uses. Returns resolved=false (a no-op) if a real player choice
// already closed this window before the timer fired, which is the
// expected, common case; the caller uses that to skip a redundant
// broadcast.
func vsResolveCounterTimeout(gameState *GameSessionState) (resolved bool, err error) {
	if vsGetPhase(gameState) != "counter_window" {
		return false, nil
	}
	vsSetPhase(gameState, "battle")
	delete(gameState.GameData, "counter_state")
	// Reuse the existing "both_timeout" outcome — the frontend's OUTCOME_MAP
	// already has a proper "TIMED OUT" label/color for it, and the semantic
	// (nothing happened, time ran out) is exactly right here too. No new
	// outcome string needed, so no frontend changes required for this fix.
	gameState.GameData["last_turn_result"] = map[string]interface{}{
		"outcome": "both_timeout",
	}
	turn := getIntField(gameState.GameData, "turn")
	gameState.GameData["turn"] = turn + 1
	return true, nil
}

// ── Hype ─────────────────────────────────────────────────────────────────────

func processVSHype(gameState *GameSessionState, playerID uint, data map[string]interface{}) (bool, *uint, error) {
	targetIDF, _ := data["target_player_id"].(float64)
	targetID := uint(targetIDF)

	players, err := vsBuildState(gameState)
	if err != nil {
		return false, nil, err
	}

	targetPS, ok := players[targetID]
	if !ok {
		return false, nil, fmt.Errorf("vs_battle: hype target %d not found", targetID)
	}

	targetPS.HypeMeter++
	if targetPS.HypeMeter >= 100 {
		// Restore 2% HP to all alive characters of this player
		for i := range targetPS.Characters {
			c := &targetPS.Characters[i]
			if !c.Defeated {
				restore := int(math.Max(1, float64(c.MaxHP)*0.02))
				c.HP = min(c.HP+restore, c.MaxHP)
			}
		}
		targetPS.HypeMeter = 0
		gameState.GameData["hype_restore"] = map[string]interface{}{
			"player_id": targetID,
			"restored":  true,
		}
	}

	vsSavePlayers(gameState, players)
	return false, nil, nil
}

// ── Win condition ─────────────────────────────────────────────────────────────

func vsCheckWin(players map[uint]*VSPlayerState) (bool, *uint) {
	var eliminated []uint
	for uid, ps := range players {
		if !vsAnyAlive(ps.Characters) {
			eliminated = append(eliminated, uid)
		}
	}
	if len(eliminated) == 0 {
		return false, nil
	}
	if len(eliminated) >= len(players) {
		return true, nil // everyone eliminated — draw
	}
	// Exactly one side eliminated (the only case today's single-target damage
	// resolution can produce) — the other player wins. Iterating players again
	// (rather than assuming exactly 2) keeps this correct if this game ever
	// supports more than 2 players.
	for uid := range players {
		isEliminated := false
		for _, e := range eliminated {
			if e == uid {
				isEliminated = true
				break
			}
		}
		if !isEliminated {
			winner := uid
			return true, &winner
		}
	}
	return true, nil
}

func vsAnyAlive(chars []VSCharacter) bool {
	for _, c := range chars {
		if !c.Defeated {
			return true
		}
	}
	return false
}

func vsFirstAliveChar(ps *VSPlayerState) *VSCharacter {
	if ps == nil {
		return nil
	}
	for i := range ps.Characters {
		if !ps.Characters[i].Defeated {
			return &ps.Characters[i]
		}
	}
	return nil
}

func vsFirstAliveWithAttack(ps *VSPlayerState) *VSCharacter {
	if ps == nil {
		return nil
	}
	for i := range ps.Characters {
		c := &ps.Characters[i]
		if !c.Defeated && len(c.Attacks) > 0 {
			return c
		}
	}
	return nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func getF64(m map[string]interface{}, key string) float64 {
	if v, ok := m[key].(float64); ok {
		return v
	}
	return 0
}

// getIntField reads an int from GameData tolerant of both representations:
// a plain Go int (same in-memory GameSessionState the whole match, the
// common case) or a float64 (GameData round-tripped through JSON — see
// vsBuildState's own comment on this happening for "players"). A bare
// `.(int)` assertion silently returns 0 for the float64 case, which
// resets "turn" back to 0 any time GameData gets rehydrated from JSON.
func getIntField(m map[string]interface{}, key string) int {
	switch v := m[key].(type) {
	case int:
		return v
	case float64:
		return int(v)
	default:
		return 0
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ── Streak & stats tracking ───────────────────────────────────────────────────

func vsUpdateStreaksAndStats(players map[uint]*VSPlayerState, result map[string]interface{}) {
	outcome, _ := result["outcome"].(string)
	getDmg := func() int {
		if v, ok := result["damage"].(int); ok {
			return v
		}
		return 0
	}
	resetAll := func() {
		for _, ps := range players {
			ps.AttackStreak = 0
			ps.DefenseStreak = 0
		}
	}

	switch outcome {
	case "attack_lands":
		atkUID, _ := result["attacker"].(uint)
		defUID, _ := result["defender"].(uint)
		dmg := getDmg()
		if ps, ok := players[atkUID]; ok {
			ps.AttackStreak++
			ps.DefenseStreak = 0
			ps.DamageDealt += dmg
			ps.AttacksLanded++
			if dmg > ps.BiggestHit {
				ps.BiggestHit = dmg
			}
		}
		if ps, ok := players[defUID]; ok {
			ps.AttackStreak = 0
			ps.DefenseStreak = 0
		}

	case "blocked":
		atkUID, _ := result["attacker"].(uint)
		defUID, _ := result["defender"].(uint)
		if ps, ok := players[atkUID]; ok {
			ps.AttackStreak = 0
			ps.DefenseStreak = 0
		}
		if ps, ok := players[defUID]; ok {
			ps.DefenseStreak++
			ps.AttackStreak = 0
			ps.Blocks++
		}

	case "counter_chance":
		atkUID, _ := result["attacker"].(uint)
		defUID, _ := result["defender"].(uint)
		if ps, ok := players[defUID]; ok {
			ps.DefenseStreak++
			ps.AttackStreak = 0
		}
		if ps, ok := players[atkUID]; ok {
			ps.AttackStreak = 0
			ps.DefenseStreak = 0
		}

	case "counter_result":
		actorUID, _ := result["actor"].(uint)
		dmg := getDmg()
		if ps, ok := players[actorUID]; ok {
			ps.DefenseStreak++
			ps.AttackStreak = 0
			ps.Counters++
			ps.DamageDealt += dmg
		}

	default:
		// stalemate, deflect, attack_wins, both_attack, both_defend, both_timeout,
		// undefended — reset all streaks per spec
		resetAll()
	}
}

// ── Dice roll ─────────────────────────────────────────────────────────────────

func processVSDiceRollResult(gameState *GameSessionState, playerID uint, _ map[string]interface{}) (bool, *uint, error) {
	players, err := vsBuildState(gameState)
	if err != nil {
		return false, nil, err
	}

	ps, ok := players[playerID]
	if !ok {
		return false, nil, fmt.Errorf("vs_battle: player %d not found", playerID)
	}

	// Validate the player has a pending roll
	pendingRaw, _ := gameState.GameData["pending_dice_rolls"].(map[string]interface{})
	if pendingRaw == nil {
		return false, nil, fmt.Errorf("vs_battle: no pending dice rolls")
	}
	playerKey := fmt.Sprintf("%d", playerID)
	if _, exists := pendingRaw[playerKey]; !exists {
		return false, nil, fmt.Errorf("vs_battle: player %d has no pending dice roll", playerID)
	}

	// Find opponent
	var oppPS *VSPlayerState
	var oppUID uint
	for uid, p := range players {
		if uid != playerID {
			oppPS = p
			oppUID = uid
			break
		}
	}
	_ = oppUID

	// Server-generated dice value (1–6)
	diceValue := rand.Intn(6) + 1
	var powerUpName string

	switch diceValue {
	case 1: // Stun — opponent's next move is power 0
		if oppPS != nil {
			oppPS.PendingStun = true
		}
		powerUpName = "stun"
	case 2: // Attack Boost +10%
		ps.PendingAtkBoost = true
		powerUpName = "atk_boost"
	case 3: // Health Pack — +10% MaxHP to weakest alive character
		weakest := vsWeakestChar(ps)
		if weakest != nil {
			restore := int(math.Max(1, float64(weakest.MaxHP)*0.10))
			weakest.HP = min(weakest.HP+restore, weakest.MaxHP)
		}
		powerUpName = "health_pack"
	case 4: // Shield — auto-block next incoming attack
		ps.PendingShield = true
		powerUpName = "shield"
	case 5: // Defense Boost +10%
		ps.PendingDefBoost = true
		powerUpName = "def_boost"
	case 6: // Poison — one random opponent move is disabled for 1 exchange
		if oppPS != nil {
			key := vsPickRandomMove(oppPS)
			if key != "" {
				oppPS.PendingPoison = key
			}
		}
		powerUpName = "poison"
	}

	// Record result for broadcast
	gameState.GameData["dice_roll_result"] = map[string]interface{}{
		"player_id":  playerID,
		"dice_value": diceValue,
		"power_up":   powerUpName,
	}

	// Remove this player from pending rolls
	delete(pendingRaw, playerKey)
	if len(pendingRaw) == 0 {
		delete(gameState.GameData, "pending_dice_rolls")
		vsSetPhase(gameState, "battle")
	} else {
		gameState.GameData["pending_dice_rolls"] = pendingRaw
	}

	vsSavePlayers(gameState, players)
	return false, nil, nil
}

// vsWeakestChar returns the alive character with the lowest HP.
func vsWeakestChar(ps *VSPlayerState) *VSCharacter {
	if ps == nil {
		return nil
	}
	var weakest *VSCharacter
	for i := range ps.Characters {
		c := &ps.Characters[i]
		if c.Defeated {
			continue
		}
		if weakest == nil || c.HP < weakest.HP {
			weakest = c
		}
	}
	return weakest
}

// vsPickRandomMove picks a random non-zero-power move from any alive character,
// returning it as "charId:moveType:idx" (for poison targeting).
func vsPickRandomMove(ps *VSPlayerState) string {
	type moveKey struct {
		charID   string
		moveType string
		idx      int
	}
	var candidates []moveKey
	for _, c := range ps.Characters {
		if c.Defeated {
			continue
		}
		for i, m := range c.Attacks {
			if m.Power > 0 {
				candidates = append(candidates, moveKey{c.ID, "attack", i})
			}
		}
		for i, m := range c.Defenses {
			if m.Power > 0 {
				candidates = append(candidates, moveKey{c.ID, "defense", i})
			}
		}
	}
	if len(candidates) == 0 {
		return ""
	}
	pick := candidates[rand.Intn(len(candidates))]
	return fmt.Sprintf("%s:%s:%d", pick.charID, pick.moveType, pick.idx)
}
