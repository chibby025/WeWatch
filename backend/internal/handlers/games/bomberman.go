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
//
// Carrying walls (v3, added 2026-09-01): a player can pick up an adjacent
// destructible wall (any tier, whatever damage it's already taken travels
// with it) and drop it on any adjacent empty cell — letting them relocate
// cover to wherever they're standing instead of being limited to the fixed
// generated layout. Only one wall can be carried at a time. Same trust tier
// as everything else here: the ACTING player (whoever's picking up or
// dropping) reports which two cells are involved; the server just validates
// a wall genuinely exists (pickup) or the target is genuinely empty (drop)
// and applies the change — it never needs to trust a client-reported
// tier/hit-count, since it already holds that data authoritatively in
// soft_walls/wall_hits and simply relocates it itself.
//
// Power-ups + kick (v3): breaking a soft wall has a chance to reveal a
// pickup (blast radius, bomb capacity, speed, or the Kick ability) — the
// classic Bomberman "power-up from crates" loop, now that walls (and
// therefore breaking them) are a core mechanic worth rewarding further.
// Which cells get a pickup and of what type is decided by the SAME player
// who's already the authority for that blast's outcome (see
// bombermanExplodeHandler) — reported alongside wall_hits_delta in the same
// "explode" move, validated against which cells the blast's own hit-count
// delta actually just finished breaking. Kick lets its owner relocate ANY
// live bomb (not just their own — a real strategic tool, matching classic
// Bomberman) by reporting the bomb's new resting cell, computed the same
// way a shooter already computes a bullet's path elsewhere in this package:
// the acting player's own client walks the kick direction cell-by-cell
// against its own wall/bomb state until something stops it, then reports
// just the final position.

const (
	// Bumped from 9x11 to 11x13 — a modest, deliberately conservative
	// increase (not a much-larger jump) so match pacing/bomb blast-radius
	// balance don't shift meaningfully; just noticeably roomier. MUST stay
	// in lockstep with BombermanGame.jsx's own ROWS/COLS constants.
	bombermanRows            = 11
	bombermanCols            = 13
	bombermanBlastRadius     = 2
	bombermanSoftWallDensity = 0.55
	// Raised from a hard 1 — see the "Stacking" doc comment above.
	bombermanMaxBombsPerPlayer = 3
	// Wall tiers — wooden/concrete/iron, requiring 1/2/3 separate blast hits
	// respectively before the cell is actually destroyed and passable.
	bombermanWallTierWood     = 1
	bombermanWallTierConcrete = 2
	bombermanWallTierIron     = 3
	// Per-stat caps on grabbed power-ups — a defensive bound, not a trust
	// gap: a client can only ever grab as many DISTINCT pickup cells as
	// legitimately spawned during the match (see bombermanGrabPickupHandler),
	// this just keeps any single stat from growing unreasonably large even
	// across a very long match with many broken walls.
	bombermanMaxBlastBonus = 3
	bombermanMaxBombBonus  = 2
	bombermanMaxSpeedBonus = 3
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
		// carried_walls: player id (string) -> [tier, hits] for whatever
		// single wall they're currently carrying. Absent = not carrying.
		"carried_walls": map[string]interface{}{},
		// pickups: "r,c" (string) -> pickup type ("blast"|"bomb"|"speed"|"kick"),
		// spawned when a wall breaks (see bombermanExplodeHandler) and removed
		// the instant someone grabs it.
		"pickups": map[string]interface{}{},
		// player_upgrades: player id (string) -> {blast_bonus, bomb_bonus,
		// speed_bonus, has_kick} — permanent for the rest of the match.
		"player_upgrades": map[string]interface{}{},
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

	case "pickup_wall":
		return bombermanPickupWallHandler(gameState, playerID, moveData)

	case "drop_wall":
		return bombermanDropWallHandler(gameState, playerID, moveData)

	case "kick_bomb":
		return bombermanKickBombHandler(gameState, playerID, moveData)

	case "grab_pickup":
		return bombermanGrabPickupHandler(gameState, playerID, moveData)

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

func bombermanCarriedWalls(gameData map[string]interface{}) map[string]interface{} {
	if raw, ok := gameData["carried_walls"].(map[string]interface{}); ok {
		return raw
	}
	return map[string]interface{}{}
}

func bombermanPickupsMap(gameData map[string]interface{}) map[string]interface{} {
	if raw, ok := gameData["pickups"].(map[string]interface{}); ok {
		return raw
	}
	return map[string]interface{}{}
}

func bombermanUpgradesMap(gameData map[string]interface{}) map[string]interface{} {
	if raw, ok := gameData["player_upgrades"].(map[string]interface{}); ok {
		return raw
	}
	return map[string]interface{}{}
}

func bombermanPlayerUpgrade(upgrades map[string]interface{}, playerKey string) map[string]interface{} {
	if raw, ok := upgrades[playerKey].(map[string]interface{}); ok {
		return raw
	}
	return map[string]interface{}{}
}

// bombermanFindSoftWall returns the index and tier of the soft_walls entry
// at (r,c), or (-1, 0) if there is none. Shared by pickup_wall (removing an
// entry) and drop_wall/explode's pickup-spawn validation (checking one
// exists without removing it).
func bombermanFindSoftWall(softWalls []interface{}, r, c int) (int, int) {
	for i, raw := range softWalls {
		entry, ok := raw.([]interface{})
		if !ok || len(entry) < 3 {
			continue
		}
		er, _ := ppFloat(entry[0])
		ec, _ := ppFloat(entry[1])
		if int(er) == r && int(ec) == c {
			tier, _ := ppFloat(entry[2])
			return i, int(tier)
		}
	}
	return -1, 0
}

// bombermanPickupWallHandler picks up a destructible wall the acting player
// reports as adjacent to them (client-computed from their own known
// position/facing, same trust tier as everything else in this file) — its
// tier and whatever damage it's already taken travel with it, restored
// exactly on drop. Only one wall can be carried at a time.
func bombermanPickupWallHandler(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	if gameState.GameData["phase"] == "ended" {
		return false, nil, nil
	}
	playerKey := fmt.Sprintf("%d", playerID)
	carried := bombermanCarriedWalls(gameState.GameData)
	if _, already := carried[playerKey]; already {
		return false, nil, fmt.Errorf("already carrying a wall")
	}

	rF, ok1 := ppFloat(moveData["r"])
	cF, ok2 := ppFloat(moveData["c"])
	if !ok1 || !ok2 {
		return false, nil, fmt.Errorf("pickup_wall missing r/c")
	}
	r, c := int(rF), int(cF)

	softWalls, _ := gameState.GameData["soft_walls"].([]interface{})
	idx, tier := bombermanFindSoftWall(softWalls, r, c)
	if idx == -1 {
		return false, nil, fmt.Errorf("no wall at (%d,%d) to pick up", r, c)
	}
	softWalls = append(append([]interface{}{}, softWalls[:idx]...), softWalls[idx+1:]...)
	gameState.GameData["soft_walls"] = softWalls

	wallHits, _ := gameState.GameData["wall_hits"].(map[string]interface{})
	if wallHits == nil {
		wallHits = map[string]interface{}{}
	}
	hitsKey := fmt.Sprintf("%d,%d", r, c)
	hits := ppIntFrom(wallHits[hitsKey])
	delete(wallHits, hitsKey)
	gameState.GameData["wall_hits"] = wallHits

	carried[playerKey] = []interface{}{float64(tier), float64(hits)}
	gameState.GameData["carried_walls"] = carried
	return false, nil, nil
}

// bombermanDropWallHandler places whatever wall the acting player is
// currently carrying onto an adjacent cell they report — rejecting a target
// that's structurally invalid (indestructible), already has a wall, or has
// a live bomb sitting on it (avoids burying a bomb with no clean resolution).
func bombermanDropWallHandler(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	if gameState.GameData["phase"] == "ended" {
		return false, nil, nil
	}
	playerKey := fmt.Sprintf("%d", playerID)
	carried := bombermanCarriedWalls(gameState.GameData)
	carriedRaw, ok := carried[playerKey].([]interface{})
	if !ok || len(carriedRaw) < 2 {
		return false, nil, fmt.Errorf("not currently carrying a wall")
	}
	tierF, _ := ppFloat(carriedRaw[0])
	hitsF, _ := ppFloat(carriedRaw[1])

	rF, ok1 := ppFloat(moveData["r"])
	cF, ok2 := ppFloat(moveData["c"])
	if !ok1 || !ok2 {
		return false, nil, fmt.Errorf("drop_wall missing r/c")
	}
	r, c := int(rF), int(cF)
	if bombermanIsIndestructible(r, c) {
		return false, nil, fmt.Errorf("cannot drop a wall on an indestructible cell")
	}

	softWalls, _ := gameState.GameData["soft_walls"].([]interface{})
	if idx, _ := bombermanFindSoftWall(softWalls, r, c); idx != -1 {
		return false, nil, fmt.Errorf("a wall already stands at (%d,%d)", r, c)
	}
	for _, raw := range bombermanActiveBombs(gameState.GameData) {
		b, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		br, _ := ppFloat(b["r"])
		bc, _ := ppFloat(b["c"])
		if int(br) == r && int(bc) == c {
			return false, nil, fmt.Errorf("cannot drop a wall on a live bomb")
		}
	}

	softWalls = append(softWalls, []interface{}{float64(r), float64(c), tierF})
	gameState.GameData["soft_walls"] = softWalls

	if hitsF > 0 {
		wallHits, _ := gameState.GameData["wall_hits"].(map[string]interface{})
		if wallHits == nil {
			wallHits = map[string]interface{}{}
		}
		wallHits[fmt.Sprintf("%d,%d", r, c)] = hitsF
		gameState.GameData["wall_hits"] = wallHits
	}

	delete(carried, playerKey)
	gameState.GameData["carried_walls"] = carried
	return false, nil, nil
}

// bombermanKickBombHandler relocates a LIVE bomb — any player's own bomb,
// or (deliberately, matching classic Bomberman) anyone else's too, since
// redirecting an opponent's own bomb away from you or into them is a real
// strategic tool, not a bug. Requires the Kick power-up. The kicking
// player's own client computes the bomb's actual resting cell (walking the
// kick direction against its own known wall/bomb state, same trust tier
// already used for "did my bullet/blast reach this cell" everywhere else in
// this package) and reports only the final position — the server doesn't
// redo that pathfinding, just applies it.
func bombermanKickBombHandler(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	if gameState.GameData["phase"] == "ended" {
		return false, nil, nil
	}
	playerKey := fmt.Sprintf("%d", playerID)
	upgrades := bombermanPlayerUpgrade(bombermanUpgradesMap(gameState.GameData), playerKey)
	hasKick, _ := upgrades["has_kick"].(bool)
	if !hasKick {
		return false, nil, fmt.Errorf("you haven't picked up the Kick power-up yet")
	}

	bombIDF, ok := ppFloat(moveData["bomb_id"])
	if !ok {
		return false, nil, fmt.Errorf("kick_bomb missing bomb_id")
	}
	bombIDKey := fmt.Sprintf("%d", int(bombIDF))
	activeBombs := bombermanActiveBombs(gameState.GameData)
	bombRaw, exists := activeBombs[bombIDKey]
	if !exists {
		return false, nil, nil // already resolved -- harmless no-op, same convention as explode
	}
	bomb, _ := bombRaw.(map[string]interface{})

	newR, ok1 := ppFloat(moveData["new_r"])
	newC, ok2 := ppFloat(moveData["new_c"])
	if !ok1 || !ok2 {
		return false, nil, fmt.Errorf("kick_bomb missing new_r/new_c")
	}
	bomb["r"] = newR
	bomb["c"] = newC
	activeBombs[bombIDKey] = bomb
	gameState.GameData["active_bombs"] = activeBombs
	return false, nil, nil
}

// bombermanValidPickupTypes gates grab_pickup/explode's spawned_pickups
// against a known set — anything else is rejected (grab_pickup) or silently
// skipped (explode, so one bad entry in a list doesn't sink the whole move).
var bombermanValidPickupTypes = map[string]bool{"blast": true, "bomb": true, "speed": true, "kick": true}

// bombermanGrabPickupHandler claims a power-up sitting on the grid (spawned
// by a broken wall — see bombermanExplodeHandler). First write wins: if the
// cell's pickup entry is already gone (someone else grabbed it moments
// earlier), this is a silent no-op, not an error — the same race-tolerance
// already established for tank_battle.go's own grab_pickup.
func bombermanGrabPickupHandler(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	if gameState.GameData["phase"] == "ended" {
		return false, nil, nil
	}
	rF, ok1 := ppFloat(moveData["r"])
	cF, ok2 := ppFloat(moveData["c"])
	if !ok1 || !ok2 {
		return false, nil, fmt.Errorf("grab_pickup missing r/c")
	}
	key := fmt.Sprintf("%d,%d", int(rF), int(cF))
	pickups := bombermanPickupsMap(gameState.GameData)
	pickupType, exists := pickups[key].(string)
	if !exists {
		return false, nil, nil // race lost -- already grabbed
	}
	if !bombermanValidPickupTypes[pickupType] {
		return false, nil, fmt.Errorf("unknown pickup type: %s", pickupType)
	}
	delete(pickups, key)
	gameState.GameData["pickups"] = pickups

	playerKey := fmt.Sprintf("%d", playerID)
	upgradesMap := bombermanUpgradesMap(gameState.GameData)
	my := bombermanPlayerUpgrade(upgradesMap, playerKey)
	switch pickupType {
	case "blast":
		if cur := ppIntFrom(my["blast_bonus"]); cur < bombermanMaxBlastBonus {
			my["blast_bonus"] = float64(cur + 1)
		}
	case "bomb":
		if cur := ppIntFrom(my["bomb_bonus"]); cur < bombermanMaxBombBonus {
			my["bomb_bonus"] = float64(cur + 1)
		}
	case "speed":
		if cur := ppIntFrom(my["speed_bonus"]); cur < bombermanMaxSpeedBonus {
			my["speed_bonus"] = float64(cur + 1)
		}
	case "kick":
		my["has_kick"] = true
	}
	upgradesMap[playerKey] = my
	gameState.GameData["player_upgrades"] = upgradesMap
	return false, nil, nil
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

	// spawned_pickups: cells this blast just finished breaking that the
	// resolving player's own client decided (via its own random roll,
	// mirroring how it's already the authority for wall damage and player
	// hits from this same blast) should reveal a power-up. Each entry is
	// only honored if the cell genuinely has a wall whose hit count (just
	// updated above) has actually reached its own tier — a client can't use
	// this to conjure a pickup out of thin air or re-spawn one on a cell
	// that broke on some EARLIER blast, only on a cell THIS blast just
	// finished off.
	softWalls, _ := gameState.GameData["soft_walls"].([]interface{})
	spawnedPickups, _ := moveData["spawned_pickups"].([]interface{})
	if len(spawnedPickups) > 0 {
		pickups := bombermanPickupsMap(gameState.GameData)
		for _, raw := range spawnedPickups {
			entry, ok := raw.([]interface{})
			if !ok || len(entry) < 3 {
				continue
			}
			rF, ok1 := ppFloat(entry[0])
			cF, ok2 := ppFloat(entry[1])
			pType, ok3 := entry[2].(string)
			if !ok1 || !ok2 || !ok3 || !bombermanValidPickupTypes[pType] {
				continue
			}
			r, c := int(rF), int(cF)
			_, tier := bombermanFindSoftWall(softWalls, r, c)
			if tier == 0 {
				continue // no wall was ever at this cell
			}
			cellKey := fmt.Sprintf("%d,%d", r, c)
			if ppIntFrom(wallHits[cellKey]) < tier {
				continue // this cell hasn't actually finished breaking yet
			}
			if _, already := pickups[cellKey]; already {
				continue
			}
			pickups[cellKey] = pType
		}
		gameState.GameData["pickups"] = pickups
	}

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
