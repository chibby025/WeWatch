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
		return processVSConfirmBuilds(gameState, playerID)
	case "lock_move":
		return processVSLockMove(gameState, playerID, moveData)
	case "counter_choice":
		return processVSCounterChoice(gameState, playerID, moveData)
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

func processVSConfirmBuilds(gameState *GameSessionState, playerID uint) (bool, *uint, error) {
	phase := vsGetPhase(gameState)
	if phase != "building" && phase != "confirming" {
		return false, nil, fmt.Errorf("vs_battle: cannot confirm outside building/confirming phase")
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
		"move_index": moveIndex,
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

	// Clear locked moves for next turn
	gameState.GameData["locked_moves"] = map[string]interface{}{}
	turn, _ := gameState.GameData["turn"].(int)
	gameState.GameData["turn"] = turn + 1

	// Store result for broadcast (caller reads this to construct the broadcast payload)
	gameState.GameData["last_turn_result"] = result
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

	// Determine what happened
	aSelected := a.lockData != nil
	bSelected := b.lockData != nil

	switch {
	case !aSelected && !bSelected:
		// Both timed out — nothing
		result["outcome"] = "both_timeout"

	case aSelected && !bSelected:
		// a attacks undefended b
		if a.lockData.MoveType == "attack" {
			dmg := a.move.Power
			vsApplyDamage(b.char, dmg)
			result["outcome"] = "undefended"
			result["attacker"] = a.uid
			result["defender"] = b.uid
			result["damage"] = dmg
			result["trigger_url"] = a.move.TriggerURL
			result["attacker_move_name"] = a.move.Name
		}
		// if a chose defense and b timed out: nothing meaningful

	case !aSelected && bSelected:
		if b.lockData.MoveType == "attack" {
			dmg := b.move.Power
			vsApplyDamage(a.char, dmg)
			result["outcome"] = "undefended"
			result["attacker"] = b.uid
			result["defender"] = a.uid
			result["damage"] = dmg
			result["trigger_url"] = b.move.TriggerURL
			result["attacker_move_name"] = b.move.Name
		}

	case a.lockData.MoveType == "attack" && b.lockData.MoveType == "attack":
		result = vsResolveBothAttack(gameState, a.uid, a.char, a.move, b.uid, b.char, b.move)

	case a.lockData.MoveType == "defense" && b.lockData.MoveType == "defense":
		// Both defend — each used move loses 1 point permanently
		aIdx := a.lockData.MoveIndex
		bIdx := b.lockData.MoveIndex
		if aIdx < len(a.char.Defenses) && a.char.Defenses[aIdx].Power > 0 {
			a.char.Defenses[aIdx] = VSMove{
				Name:       a.char.Defenses[aIdx].Name,
				Power:      a.char.Defenses[aIdx].Power - 1,
				MoveType:   "defense",
				TriggerURL: a.char.Defenses[aIdx].TriggerURL,
			}
		}
		if bIdx < len(b.char.Defenses) && b.char.Defenses[bIdx].Power > 0 {
			b.char.Defenses[bIdx] = VSMove{
				Name:       b.char.Defenses[bIdx].Name,
				Power:      b.char.Defenses[bIdx].Power - 1,
				MoveType:   "defense",
				TriggerURL: b.char.Defenses[bIdx].TriggerURL,
			}
		}
		result["outcome"] = "both_defend"
		result["player_a"] = a.uid
		result["player_b"] = b.uid

	default:
		// One attacks, one defends
		attacker, defender := a, b
		if a.lockData.MoveType == "defense" {
			attacker, defender = b, a
		}
		result = vsResolveAtkVsDef(gameState, attacker.uid, attacker.char, attacker.move, defender.uid, defender.char, defender.move)
	}

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
		result["damage"] = dmg
		// trigger URL of the winning attack
		if diff > 0 {
			result["trigger_url"] = aMove.TriggerURL
		} else {
			result["trigger_url"] = bMove.TriggerURL
		}
	}
	return result
}

func vsResolveAtkVsDef(gameState *GameSessionState, atkUID uint, atkChar *VSCharacter, atkMove *VSMove, defUID uint, defChar *VSCharacter, defMove *VSMove) map[string]interface{} {
	diff := atkMove.Power - defMove.Power
	result := map[string]interface{}{
		"outcome":              "atk_vs_def",
		"attacker":             atkUID,
		"defender":             defUID,
		"atk_power":            atkMove.Power,
		"def_power":            defMove.Power,
		"trigger_url":          atkMove.TriggerURL,
		"attacker_move_name":   atkMove.Name,
		"defender_move_name":   defMove.Name,
	}

	if diff >= 6 {
		// Attack lands
		vsApplyDamage(defChar, diff)
		result["outcome"] = "attack_lands"
		result["damage"] = diff

	} else if diff >= 1 {
		// Deflect — 1-5 point gap
		result["outcome"] = "deflect"
		result["damage"] = 0

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
		}
	}
	return result
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
		if option == "reflect" {
			dmg = int(math.Max(1, float64(oppAtkPower)*0.02))
		} else {
			// option == "attack" — pick any attack move at 10%
			myChar := vsFirstAliveWithAttack(myPS)
			if myChar != nil && moveIndex >= 0 && moveIndex < len(myChar.Attacks) {
				dmg = int(math.Max(1, float64(myChar.Attacks[moveIndex].Power)*0.10))
				triggerURL = myChar.Attacks[moveIndex].TriggerURL
			}
		}

		// Target is the opponent's first alive character that was in the clash
		targetChar := vsFirstAliveChar(oppPS)
		if targetChar != nil && dmg > 0 {
			vsApplyDamage(targetChar, dmg)
		}

		gameState.GameData["counter_result"] = map[string]interface{}{
			"type":        counterType,
			"actor":       playerID,
			"target":      oppUID,
			"option":      option,
			"damage":      dmg,
			"trigger_url": triggerURL,
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
		if option == "reflect" {
			dmg = int(math.Max(1, float64(atkPower)*0.02))
		} else {
			// option == "attack" — pick any of defender's own attack moves at 5%
			defChar := vsFirstAliveWithAttack(defPS)
			if defChar != nil && moveIndex >= 0 && moveIndex < len(defChar.Attacks) {
				dmg = int(math.Max(1, float64(defChar.Attacks[moveIndex].Power)*0.05))
				triggerURL = defChar.Attacks[moveIndex].TriggerURL
			}
		}

		targetChar := vsFirstAliveChar(atkPS)
		if targetChar != nil && dmg > 0 {
			vsApplyDamage(targetChar, dmg)
		}

		gameState.GameData["counter_result"] = map[string]interface{}{
			"type":        counterType,
			"actor":       playerID,
			"target":      atkUID,
			"option":      option,
			"damage":      dmg,
			"trigger_url": triggerURL,
		}
	}

	// Return to battle phase
	vsSetPhase(gameState, "battle")
	delete(gameState.GameData, "counter_state")
	vsSavePlayers(gameState, players)

	// Check win condition
	gameOver, winnerID := vsCheckWin(players)
	if gameOver {
		gameState.GameData["last_turn_result"] = map[string]interface{}{"game_over": true}
	}
	return gameOver, winnerID, nil
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
	for uid, ps := range players {
		if !vsAnyAlive(ps.Characters) {
			// This player lost — find the winner
			for wid := range players {
				if wid != uid {
					wid2 := wid
					return true, &wid2
				}
			}
			return true, nil // draw (both wiped out simultaneously)
		}
	}
	return false, nil
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

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
