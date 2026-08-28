package games

import (
	"fmt"
	"math/rand"
)

// Bomberman — real-time, N-player (2-4) grid duel. Continues the same
// "no authoritative physics server" trust model established by
// tank_battle.go, but this is the first game in this package to extend
// self-authority past exactly two players: every client owns and
// self-reports its own character's continuous pixel position via
// state_sync (identical to tank_battle), and — the new idea here — whoever
// PLACES a bomb is the sole authority over the outcome of THAT bomb's
// explosion (which soft walls it damages/destroys, which players it catches
// in the blast), reported once via an "explode" move at the moment their
// own local fuse timer expires OR they choose to detonate it early
// themselves (see tryDetonateMine in BombermanGame.jsx). This generalizes
// cleanly to any player count: a bomb only ever has one owner regardless of
// how many other players are in the match, so there's never an ambiguous
// "who's the physics authority for this event" question the way there
// would be for a single shared object like a ball.
//
// Chain reactions (v2, added 2026-08-28): a bomb's blast passing through a
// cell containing ANOTHER live bomb doesn't stop there or ignore it — it
// forces that bomb to detonate early too. Ownership authority is preserved
// even for a chained bomb: the resolving client only ever REPORTS which
// bomb IDs its own blast passed over (chainedBombIds); the server just
// flags each one `forced: true` in active_bombs (never resolves it
// directly, same trust boundary as everything else self-reported here) —
// that bomb's OWN owner's client is the one watching for the flag and
// calling the exact same resolution path a manual detonation already uses,
// so a chain can cascade through any number of bombs/owners with zero new
// resolution logic, just a new trigger. If a chained bomb's owner has
// disconnected, it simply never resolves — the same pre-existing limitation
// every bomb already has today (a disconnected owner's armed bomb never
// naturally fuses out either); not a new risk chaining introduces.
//
// Multi-tier walls (v2): soft walls now have a tier (1/2/3 — wooden/
// concrete/iron in the frontend's own naming), each requiring that many
// separate blast hits before it's actually destroyed and becomes passable.
// wall_hits tracks a running hit count per cell; a wall blocks movement and
// still stops a blast (same as an undamaged one) until its hit count
// reaches its tier.
//
// Stacking (v2): the old hard cap of exactly one live bomb per player is
// raised to bombermanMaxBombsPerPlayer — the classic "Bomb Up" capability,
// here granted as a base rule rather than gated behind a pickup (power-ups
// generally remain out of scope for v1). This is what actually makes
// chaining meaningful in practice: a player can now cluster several of
// their own bombs, and one going off can cascade through the rest for a
// visibly bigger combined blast — rather than inventing a non-standard
// "blast radius grows with bomb count" mechanic with no real genre
// precedent.

const (
	bombermanRows            = 9
	bombermanCols            = 11
	bombermanBlastRadius     = 2
	bombermanSoftWallDensity = 0.55
	// Raised from a hard 1 — see the "Stacking" doc comment above.
	bombermanMaxBombsPerPlayer = 3
	// Wall tiers — wooden/concrete/iron, requiring 1/2/3 separate blast hits
	// respectively before the cell is actually destroyed and passable.
	bombermanWallTierWood     = 1
	bombermanWallTierConcrete = 2
	bombermanWallTierIron     = 3
)

// bombermanRollWallTier picks a wall's tier at generation time — weighted
// toward the classic mostly-wooden layout, with concrete and iron as rarer,
// more defensible obstacles.
func bombermanRollWallTier() int {
	roll := rand.Float64()
	switch {
	case roll < 0.65:
		return bombermanWallTierWood
	case roll < 0.90:
		return bombermanWallTierConcrete
	default:
		return bombermanWallTierIron
	}
}

// bombermanIsIndestructible reports whether (r,c) is a permanent wall —
// the full border, plus an inner checkerboard of pillars (the classic
// Bomberman grid pattern), neither of which a blast can ever destroy.
func bombermanIsIndestructible(r, c int) bool {
	if r < 0 || r >= bombermanRows || c < 0 || c >= bombermanCols {
		return true // out of bounds treated as solid — blasts/movement never cross it
	}
	if r == 0 || r == bombermanRows-1 || c == 0 || c == bombermanCols-1 {
		return true
	}
	return r%2 == 0 && c%2 == 0
}

// bombermanSpawnPoints returns up to 4 fixed corner spawn cells.
func bombermanSpawnPoints() [][2]int {
	return [][2]int{
		{1, 1},
		{1, bombermanCols - 2},
		{bombermanRows - 2, 1},
		{bombermanRows - 2, bombermanCols - 2},
	}
}

// bombermanIsSpawnZone keeps each spawn point and its two orthogonal
// neighbors clear of soft walls, so nobody spawns already boxed in.
func bombermanIsSpawnZone(r, c int) bool {
	for _, sp := range bombermanSpawnPoints() {
		sr, sc := sp[0], sp[1]
		if (r == sr && c == sc) ||
			(r == sr+1 && c == sc) || (r == sr-1 && c == sc) ||
			(r == sr && c == sc+1) || (r == sr && c == sc-1) {
			return true
		}
	}
	return false
}

// bombermanInitialState generates the soft-wall layout ONCE, server-side,
// at game start, and embeds the resulting list directly in the broadcast
// initial state — every client receives the identical layout this way, so
// there's no need for a shared random seed or client-side regeneration.
func bombermanInitialState(playerIDs []uint) map[string]interface{} {
	// Each entry is [r, c, tier] — tier 1/2/3 = wooden/concrete/iron, the
	// number of separate blast hits that cell needs before it's actually
	// destroyed. wall_hits (below) tracks the running count per cell.
	softWalls := []interface{}{}
	for r := 1; r < bombermanRows-1; r++ {
		for c := 1; c < bombermanCols-1; c++ {
			if bombermanIsIndestructible(r, c) || bombermanIsSpawnZone(r, c) {
				continue
			}
			if rand.Float64() < bombermanSoftWallDensity {
				softWalls = append(softWalls, []interface{}{float64(r), float64(c), float64(bombermanRollWallTier())})
			}
		}
	}

	playersAlive := map[string]interface{}{}
	spawns := bombermanSpawnPoints()
	for i, pid := range playerIDs {
		if i >= len(spawns) {
			break
		}
		playersAlive[fmt.Sprintf("%d", pid)] = true
	}

	return map[string]interface{}{
		"phase":         "playing",
		"soft_walls":    softWalls,
		"wall_hits":     map[string]interface{}{}, // "r,c" (string) -> hit count so far; destroyed once >= that cell's own tier
		"players_alive": playersAlive,
		"active_bombs":  map[string]interface{}{}, // bomb_id (string) -> {r, c, owner_id, forced?}
		"next_bomb_id":  float64(1),
	}
}

func (gm *GameManager) processBombermanMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	moveType, _ := moveData["move_type"].(string)
	switch moveType {
	case "state_sync":
		// Pure relay of the sender's own character position — in-memory
		// only, no DB write (volatile). Same pattern as tank_battle.go.
		key := fmt.Sprintf("player_%d", playerID)
		snapshot := map[string]interface{}{}
		for _, field := range []string{"x", "y"} {
			if v, ok := ppFloat(moveData[field]); ok {
				snapshot[field] = v
			}
		}
		gameState.GameData[key] = snapshot
		return false, nil, nil

	case "place_bomb":
		return bombermanPlaceBombHandler(gameState, playerID, moveData)

	case "explode":
		return bombermanExplodeHandler(gameState, playerID, moveData)

	case "bomberman_end":
		return bombermanEndHandler(gameState)
	}

	return false, nil, fmt.Errorf("unknown bomberman move type: %s", moveType)
}

func bombermanAliveMap(gameData map[string]interface{}) map[string]interface{} {
	if raw, ok := gameData["players_alive"].(map[string]interface{}); ok {
		return raw
	}
	return map[string]interface{}{}
}

func bombermanActiveBombs(gameData map[string]interface{}) map[string]interface{} {
	if raw, ok := gameData["active_bombs"].(map[string]interface{}); ok {
		return raw
	}
	return map[string]interface{}{}
}

func bombermanPlaceBombHandler(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	if gameState.GameData["phase"] == "ended" {
		return false, nil, nil
	}

	alive := bombermanAliveMap(gameState.GameData)
	playerKey := fmt.Sprintf("%d", playerID)
	if isAlive, _ := alive[playerKey].(bool); !isAlive {
		return false, nil, fmt.Errorf("eliminated players cannot place bombs")
	}

	rF, ok1 := ppFloat(moveData["r"])
	cF, ok2 := ppFloat(moveData["c"])
	if !ok1 || !ok2 {
		return false, nil, fmt.Errorf("place_bomb missing r/c")
	}
	r, c := int(rF), int(cF)
	if bombermanIsIndestructible(r, c) {
		return false, nil, fmt.Errorf("cannot place a bomb on a wall")
	}

	activeBombs := bombermanActiveBombs(gameState.GameData)
	// Up to bombermanMaxBombsPerPlayer live bombs per player at a time — see
	// this file's "Stacking" doc comment. Still a real cap (not unlimited),
	// so this remains a cheap sanity check against a malformed/malicious
	// client spamming bomb_id allocations.
	myBombCount := 0
	for _, raw := range activeBombs {
		if b, ok := raw.(map[string]interface{}); ok {
			if ownerF, ok := ppFloat(b["owner_id"]); ok && uint(ownerF) == playerID {
				myBombCount++
			}
		}
	}
	if myBombCount >= bombermanMaxBombsPerPlayer {
		return false, nil, fmt.Errorf("you already have %d bombs active — that's the limit", bombermanMaxBombsPerPlayer)
	}

	bombID := ppIntFrom(gameState.GameData["next_bomb_id"])
	if bombID == 0 {
		bombID = 1
	}
	gameState.GameData["next_bomb_id"] = float64(bombID + 1)

	bombIDKey := fmt.Sprintf("%d", bombID)
	// active_bombs itself is the single source of truth the frontend needs —
	// unlike tank_battle's "fire" (a truly ephemeral, one-shot event with no
	// natural persistent state to represent), a placed bomb genuinely sits
	// on the grid for the whole fuse duration, so active_bombs already
	// changes (and broadcasts) on every placement/resolution. No separate
	// "last_bomb"/"seq" ephemeral relay is needed on top of it.
	activeBombs[bombIDKey] = map[string]interface{}{
		"r": float64(r), "c": float64(c), "owner_id": float64(playerID),
	}
	gameState.GameData["active_bombs"] = activeBombs

	return false, nil, nil
}

// bombermanExplodeHandler is called by the BOMB'S OWNER once their own local
// fuse timer expires, or they detonate it early, or another bomb's blast
// chains into theirs. Validates bomb_id genuinely belongs to the caller
// (never trust a client to resolve someone else's bomb), applies wall
// damage/destruction and player eliminations, flags any further bombs THIS
// blast caught for their own owners to chain-resolve, and checks the win
// condition.
func bombermanExplodeHandler(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	if gameState.GameData["phase"] == "ended" {
		return false, nil, nil
	}

	bombIDF, ok := ppFloat(moveData["bomb_id"])
	if !ok {
		return false, nil, fmt.Errorf("explode missing bomb_id")
	}
	bombIDKey := fmt.Sprintf("%d", int(bombIDF))
	activeBombs := bombermanActiveBombs(gameState.GameData)
	bombRaw, exists := activeBombs[bombIDKey]
	if !exists {
		// Already resolved (or never existed) — a harmless no-op, not an
		// error: a slow/duplicate explode call shouldn't be treated as
		// malicious. Also the normal outcome of TWO chain paths reaching the
		// same bomb (e.g. two other bombs both catch it in their blast) —
		// whichever owner's explode arrives first wins, the second is just
		// this same harmless no-op.
		return false, nil, nil
	}
	bomb, _ := bombRaw.(map[string]interface{})
	ownerF, _ := ppFloat(bomb["owner_id"])
	if uint(ownerF) != playerID {
		return false, nil, fmt.Errorf("only a bomb's own owner can resolve its explosion")
	}
	delete(activeBombs, bombIDKey)

	// Chain reaction: bombs this blast passed over, reported by the
	// resolving client (same self-reported trust level as everything else
	// here). We never resolve them ourselves — only their own owner may
	// (this file's own doc comment) — we just flag them; each owner's own
	// BombermanGame.jsx polls active_bombs and reacts to `forced` the exact
	// same way it already reacts to a manual detonate press, so a cascade
	// through any number of bombs/owners falls out for free.
	chainedRaw, _ := moveData["chained_bomb_ids"].([]interface{})
	for _, v := range chainedRaw {
		idF, ok := ppFloat(v)
		if !ok {
			continue
		}
		key := fmt.Sprintf("%d", int(idF))
		if key == bombIDKey {
			continue // can't chain into the bomb that's exploding right now
		}
		if b, ok := activeBombs[key].(map[string]interface{}); ok {
			b["forced"] = true
			activeBombs[key] = b
		}
	}
	gameState.GameData["active_bombs"] = activeBombs

	// wall_hits_delta: cells this blast hit a (still-standing) wall on —
	// increments each cell's running hit count by 1. A wall is considered
	// destroyed (passable) once its hit count reaches its own tier — the
	// frontend already has the tier list (soft_walls) to compare against;
	// nothing server-side needs to know "destroyed" as its own concept.
	wallHitsDelta, _ := moveData["wall_hits_delta"].([]interface{})
	wallHits, _ := gameState.GameData["wall_hits"].(map[string]interface{})
	if wallHits == nil {
		wallHits = map[string]interface{}{}
	}
	for _, w := range wallHitsDelta {
		pair, ok := w.([]interface{})
		if !ok || len(pair) < 2 {
			continue
		}
		rF, ok1 := ppFloat(pair[0])
		cF, ok2 := ppFloat(pair[1])
		if !ok1 || !ok2 {
			continue
		}
		key := fmt.Sprintf("%d,%d", int(rF), int(cF))
		cur := ppIntFrom(wallHits[key])
		wallHits[key] = float64(cur + 1)
	}
	gameState.GameData["wall_hits"] = wallHits

	hitPlayerIDs, _ := moveData["hit_player_ids"].([]interface{})
	alive := bombermanAliveMap(gameState.GameData)
	for _, raw := range hitPlayerIDs {
		if hf, ok := ppFloat(raw); ok {
			alive[fmt.Sprintf("%d", uint(hf))] = false
		}
	}
	gameState.GameData["players_alive"] = alive

	return bombermanCheckWin(gameState)
}

// bombermanCheckWin declares a winner once exactly one player remains
// alive, or a draw (nil winner) if a single blast eliminates every
// remaining player at once (including the placer's own last stand).
func bombermanCheckWin(gameState *GameSessionState) (bool, *uint, error) {
	alive := bombermanAliveMap(gameState.GameData)
	var aliveIDs []uint
	for _, p := range gameState.Players {
		key := fmt.Sprintf("%d", p.UserID)
		if isAlive, ok := alive[key].(bool); ok && isAlive {
			aliveIDs = append(aliveIDs, p.UserID)
		}
	}

	if len(aliveIDs) > 1 {
		return false, nil, nil
	}
	gameState.GameData["phase"] = "ended"
	if len(aliveIDs) == 1 {
		winner := aliveIDs[0]
		return true, &winner, nil
	}
	return true, nil, nil // everyone eliminated at once — a draw
}

// bombermanEndHandler is the host-only forced-end path — declares whoever
// currently has the most surviving lives-equivalent (here, simply "is
// still alive") the winner; a tie among 2+ still-alive players is a draw.
func bombermanEndHandler(gameState *GameSessionState) (bool, *uint, error) {
	if gameState.GameData["phase"] == "ended" {
		return false, nil, nil
	}
	gameState.GameData["phase"] = "ended"

	alive := bombermanAliveMap(gameState.GameData)
	var aliveIDs []uint
	for _, p := range gameState.Players {
		key := fmt.Sprintf("%d", p.UserID)
		if isAlive, ok := alive[key].(bool); ok && isAlive {
			aliveIDs = append(aliveIDs, p.UserID)
		}
	}
	if len(aliveIDs) == 1 {
		winner := aliveIDs[0]
		return true, &winner, nil
	}
	return true, nil, nil
}
