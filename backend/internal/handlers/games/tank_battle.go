package games

import (
	"fmt"
	"time"
)

// Tank Battle — genuine real-time free-for-all PvP (2-8 players), no
// authoritative physics server, following the exact same trust model
// already established for ping_pong/air_hockey (see the file-level notes
// there): each client is the sole authority over its OWN tank's
// position/rotation/turret angle, relaying it via state_sync at ~15-20Hz for
// every OTHER client to render (with dead-reckoning extrapolation, same as
// ping_pong's paddle relay).
//
// Unlike ping_pong/air_hockey, there is no single shared physics object (a
// ball) needing one player to be "the" authority — each tank is symmetric,
// self-controlled, and self-reported, which is exactly what let this game
// generalize from a strict 1v1 duel to an N-player free-for-all with zero
// change to the core trust model: the same "shooter is authoritative over
// their own bullets" rule that worked for one opponent works identically for
// seven. The one thing that DOES need a single source of truth is "did a
// shot land" (health/elimination), and the natural authority for that is the
// SHOOTER: they know their own bullet's exact origin, angle, speed, and
// timing, and can locally detect a collision against whichever target's
// last-known (extrapolated) position it actually struck. This mirrors the
// same "no real anti-cheat, just enough trust for a casual friendly arcade
// battle" model already accepted throughout this game package — a dishonest
// client could self-report false hits, exactly the same risk a dishonest
// ping_pong client already has by self-reporting "goal" events. Wall/pickup
// handling below follows the same tier of trust.
//
// Wall positions and the pickup spawn schedule are both deliberately NOT
// tracked server-side at all — they're fixed/deterministic constants baked
// into TankBattleGame.jsx, so every client computes the identical layout and
// spawn timeline independently, the same way bullet physics constants
// already don't need network sync (see the frontend file's own notes). The
// server only needs to track the parts that actually mutate over a match:
// each wall's remaining HP, which pickups have already been claimed (a
// simple first-write-wins race guard so two simultaneous grabs on the same
// pickup can't both succeed), and each player's current temporary effect.
func tankBattleInitialState(playerIDs []uint) map[string]interface{} {
	scores := map[string]interface{}{}
	// player_ids is the ordered participant list the frontend uses to assign
	// each player one of the 8 fixed spawn points (their index into this
	// array) — order is whatever StartGame passed in, stable for the life of
	// the match.
	orderedIDs := make([]string, len(playerIDs))
	for i, pid := range playerIDs {
		idStr := fmt.Sprintf("%d", pid)
		orderedIDs[i] = idStr
		scores[idStr] = 100
	}

	walls := map[string]interface{}{}
	for _, id := range tankBattleWallIDs {
		walls[id] = float64(tankBattleWallMaxHP)
	}

	return map[string]interface{}{
		"phase": "playing",
		// Reuse the exact "scores" field name/shape rtEndHandler already
		// understands (see ping_pong.go) — here it holds current HP, not
		// points, but rtEndHandler is purely "whoever has the higher number
		// wins," which is exactly the semantics a forced end should have.
		"scores":     scores,
		"max_hp":     100,
		"player_ids": orderedIDs,
		// walls: wall id -> remaining HP, one entry per id in
		// tankBattleWallIDs — see WALLS in TankBattleGame.jsx for the actual
		// positions/sizes both clients render and collide against; this map
		// only needs to agree on IDs, not geometry.
		"walls": walls,
		// pickups_grabbed: pickup id (e.g. "p1_3" — spawn point 1, cycle 3)
		// -> grabbing player's user ID. Empty at start; entries only ever get
		// added, never removed — a pickup id is unique per (point, cycle)
		// pair, so this map naturally stays small relative to a match's real
		// length and never needs pruning for correctness.
		"pickups_grabbed": map[string]interface{}{},
		// effects: player id -> {type, expires_at (server ms epoch)}. One
		// slot per player — mirrors ping_pong.go's active_effect design
		// exactly: a newly grabbed power-up unconditionally overwrites
		// whatever was active before, no separate cancellation logic needed.
		"effects": map[string]interface{}{},
	}
}

const (
	tankBattleWallMaxHP  = 60
	tankBattleWallDamage = 20 // same as a normal bullet's tank damage — 3 hits to break a wall
	tankBattleHealAmount = 30
)

// tankBattleWallIDs must match WALLS' ids in TankBattleGame.jsx exactly (13
// destructible obstacles across the 2000x1200 arena) — only the ids need to
// agree between frontend and backend, never the actual positions/sizes,
// which the server has no knowledge of at all (see the file-level comment).
var tankBattleWallIDs = []string{
	"w0", "w1", "w2", "w3", "w4", "w5", "w6", "w7", "w8", "w9", "w10", "w11", "w12",
}

// tankBattleEffectDurationMs returns how long (in ms) a grabbed power-up
// lasts, server-decided so a client can't claim an arbitrarily long buff.
// "powershot" isn't really time-based (it's consumed on the grabber's next
// shot, entirely client-side — see TankBattleGame.jsx), but is still given a
// generous window here so it uses the exact same {type, expires_at} storage
// shape as the time-based effects rather than needing a separate field.
func tankBattleEffectDurationMs(pickupType string) int64 {
	switch pickupType {
	case "speed":
		return 6000
	case "shield":
		return 5000
	case "rapidfire":
		return 6000
	case "powershot":
		return 15000
	}
	return 0
}

func (gm *GameManager) processTankBattleMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	moveType, _ := moveData["move_type"].(string)
	switch moveType {
	case "state_sync":
		// Pure relay of the sender's own tank state — position, rotation,
		// turret angle, self-reported velocity (for the receiver's own
		// dead-reckoning extrapolation, same technique already proven in
		// ping_pong/air_hockey), plus optional cosmetic effect flags
		// (shield_active/speed_active/rapidfire_active) so the OTHER client
		// can render them (e.g. a shield glow) without needing a separate
		// broadcast — these ride along on the same already-high-frequency
		// relay rather than adding a new one. In-memory only; no DB write
		// (volatile).
		key := fmt.Sprintf("tank_%d", playerID)
		snapshot := map[string]interface{}{}
		for _, field := range []string{"x", "y", "angle", "turret_angle", "vx", "vy"} {
			if v, ok := ppFloat(moveData[field]); ok {
				snapshot[field] = v
			}
		}
		for _, field := range []string{"shield_active", "speed_active", "rapidfire_active"} {
			if v, ok := moveData[field].(bool); ok {
				snapshot[field] = v
			}
		}
		gameState.GameData[key] = snapshot
		return false, nil, nil

	case "fire":
		// Relay of a discrete fire event — every client (including the
		// shooter) spawns a locally-simulated bullet from the same
		// origin/angle/speed, so bullet trajectories agree across clients
		// without needing a physics-authority round-trip. No DB write
		// (volatile — see isVolatile in game_manager.go), but this still
		// must write INTO GameData: broadcastGameStateLocked always
		// broadcasts the current in-memory GameData regardless of a move's
		// volatile status, so without a real field changing here, the
		// broadcast would just re-send stale state and the other client
		// would never learn a shot was fired at all. seq increments on every
		// call so the receiver can tell a genuinely new fire event apart
		// from the same one arriving again in a later, unrelated broadcast.
		// powered (bool, optional) lets the receiver render a bigger/redder
		// power-shot bullet — purely cosmetic, the actual damage is still
		// only ever applied by the shooter's own later "hit" report.
		seq := ppIntFrom(gameState.GameData["fire_seq"]) + 1
		gameState.GameData["fire_seq"] = seq
		lastFire := map[string]interface{}{
			"shooter_id": float64(playerID),
			"seq":        float64(seq),
		}
		if v, ok := ppFloat(moveData["x"]); ok {
			lastFire["x"] = v
		}
		if v, ok := ppFloat(moveData["y"]); ok {
			lastFire["y"] = v
		}
		if v, ok := ppFloat(moveData["angle"]); ok {
			lastFire["angle"] = v
		}
		if v, ok := moveData["powered"].(bool); ok {
			lastFire["powered"] = v
		}
		gameState.GameData["last_fire"] = lastFire
		return false, nil, nil

	case "hit":
		return tankBattleHitHandler(gameState, playerID, moveData)

	case "wall_hit":
		return tankBattleWallHitHandler(gameState, moveData)

	case "grab_pickup":
		return tankBattleGrabPickupHandler(gameState, playerID, moveData)

	case "tank_battle_end":
		return rtEndHandler(gameState)
	}

	return false, nil, fmt.Errorf("unknown tank_battle move type: %s", moveType)
}

// tankBattleHitHandler applies damage the SHOOTER (playerID) reports against
// one OTHER real player in this match. Validates the target is a genuine
// participant and not the shooter themselves (no self-damage reports),
// clamps damage to a sane range (defends against a malformed/malicious
// client claiming a one-shot kill). Free-for-all win condition: eliminating
// a player does NOT end the match by itself — the match continues among
// survivors (HP > 0) until exactly one remains, who is declared the winner.
// For the original 2-player case this collapses to identical behavior to
// before the free-for-all generalization: eliminating the one opponent
// always leaves exactly one survivor (the shooter, since a shooter can never
// have just damaged themselves).
func tankBattleHitHandler(gameState *GameSessionState, shooterID uint, moveData map[string]interface{}) (bool, *uint, error) {
	if gameState.GameData["phase"] == "ended" {
		return false, nil, nil
	}

	targetIDF, ok := ppFloat(moveData["target_player_id"])
	if !ok {
		return false, nil, fmt.Errorf("hit missing target_player_id")
	}
	targetID := uint(targetIDF)
	if targetID == shooterID {
		return false, nil, fmt.Errorf("cannot report a hit on yourself")
	}

	validTarget := false
	for _, p := range gameState.Players {
		if p.UserID == targetID {
			validTarget = true
			break
		}
	}
	if !validTarget {
		return false, nil, fmt.Errorf("invalid target player")
	}

	damage := 20 // default bullet damage
	if d, ok := ppFloat(moveData["damage"]); ok {
		damage = int(d)
	}
	if damage <= 0 || damage > 100 {
		damage = 20
	}

	scores := ppScoreMap(gameState.GameData)
	targetKey := fmt.Sprintf("%d", targetID)
	// tankBattleInitialState always seeds both players' HP at game start, and
	// the phase == "ended" guard above already prevents processing any hit
	// once a player's HP has actually reached zero — so currentHP is always
	// a real, current in-progress value here, never a "missing key" case
	// that would need a defensive default. If it were ever missing for some
	// other reason, defaulting to 0 (no free health) is the safe choice.
	currentHP := ppIntFrom(scores[targetKey])
	newHP := currentHP - damage
	if newHP < 0 {
		newHP = 0
	}
	scores[targetKey] = newHP
	gameState.GameData["scores"] = scores

	if newHP <= 0 {
		var survivors []uint
		for _, p := range gameState.Players {
			if ppIntFrom(scores[fmt.Sprintf("%d", p.UserID)]) > 0 {
				survivors = append(survivors, p.UserID)
			}
		}
		if len(survivors) <= 1 {
			gameState.GameData["phase"] = "ended"
			if len(survivors) == 1 {
				winner := survivors[0]
				return true, &winner, nil
			}
			// Extremely unlikely in practice (would need the last two
			// players to both already be at 0 HP going into a single hit
			// report that only ever damages one target) — handled
			// defensively as a draw rather than guessing a winner.
			return true, nil, nil
		}
	}

	return false, nil, nil
}

// tankBattleWallHitHandler applies damage to a destructible wall. Either
// player can report this (whichever one's own bullet hit it), so there's no
// "reporter must be a specific role" check the way tankBattleHitHandler has
// for self-damage — a wall has no owner to protect from itself. A wall
// already at 0 HP just stays there (Max(0, ...) below), so a duplicate or
// late-arriving report for an already-broken wall is a harmless no-op.
func tankBattleWallHitHandler(gameState *GameSessionState, moveData map[string]interface{}) (bool, *uint, error) {
	wallID, _ := moveData["wall_id"].(string)
	if wallID == "" {
		return false, nil, fmt.Errorf("wall_hit missing wall_id")
	}

	walls := tankBattleNestedMap(gameState.GameData, "walls")
	if _, exists := walls[wallID]; !exists {
		return false, nil, fmt.Errorf("unknown wall_id: %s", wallID)
	}

	damage := tankBattleWallDamage
	if d, ok := ppFloat(moveData["damage"]); ok {
		damage = int(d)
	}
	if damage <= 0 || damage > 100 {
		damage = tankBattleWallDamage
	}

	newHP := ppIntFrom(walls[wallID]) - damage
	if newHP < 0 {
		newHP = 0
	}
	walls[wallID] = newHP
	gameState.GameData["walls"] = walls
	return false, nil, nil
}

// tankBattleGrabPickupHandler claims a spawned power-up. First write wins:
// if this pickup_id is already in pickups_grabbed (the other player's grab
// request was processed first — a genuine but rare race, since spawn
// position/timing is identical on both clients), this call is a silent,
// harmless no-op rather than an error, so the losing client doesn't need any
// special-case handling beyond "the pickup just isn't in my possession."
//
// pickup_type is entirely client-reported and not independently verified
// against the real spawn schedule (which the server has no knowledge of at
// all — see the file-level comment above) — the same trust tier already
// accepted for "hit" damage values in this exact file. A dishonest client
// could claim any pickup_id as type "health" for free healing; not defended
// against here, consistent with this game package's stated design.
func tankBattleGrabPickupHandler(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	if gameState.GameData["phase"] == "ended" {
		return false, nil, nil
	}

	pickupID, _ := moveData["pickup_id"].(string)
	pickupType, _ := moveData["pickup_type"].(string)
	if pickupID == "" || pickupType == "" {
		return false, nil, fmt.Errorf("grab_pickup missing pickup_id or pickup_type")
	}

	grabbed := tankBattleNestedMap(gameState.GameData, "pickups_grabbed")
	if _, alreadyGrabbed := grabbed[pickupID]; alreadyGrabbed {
		return false, nil, nil // race lost — someone else already claimed it
	}
	grabbed[pickupID] = float64(playerID)
	gameState.GameData["pickups_grabbed"] = grabbed

	shooterKey := fmt.Sprintf("%d", playerID)
	if pickupType == "health" {
		scores := ppScoreMap(gameState.GameData)
		maxHP := ppIntFrom(gameState.GameData["max_hp"])
		if maxHP <= 0 {
			maxHP = 100
		}
		newHP := ppIntFrom(scores[shooterKey]) + tankBattleHealAmount
		if newHP > maxHP {
			newHP = maxHP
		}
		scores[shooterKey] = newHP
		gameState.GameData["scores"] = scores
		return false, nil, nil
	}

	durationMs := tankBattleEffectDurationMs(pickupType)
	if durationMs <= 0 {
		return false, nil, fmt.Errorf("unknown pickup_type: %s", pickupType)
	}
	effects := tankBattleNestedMap(gameState.GameData, "effects")
	effects[shooterKey] = map[string]interface{}{
		"type":       pickupType,
		"expires_at": float64(time.Now().UnixMilli() + durationMs),
	}
	gameState.GameData["effects"] = effects
	return false, nil, nil
}

// tankBattleNestedMap reads a map[string]interface{} sub-object out of
// GameData by key, mirroring ppScoreMap's exact shape/behavior (defined in
// ping_pong.go) but parameterized so walls/pickups_grabbed/effects don't
// each need their own copy of the same lookup-with-safe-fallback logic.
func tankBattleNestedMap(data map[string]interface{}, key string) map[string]interface{} {
	if raw, ok := data[key]; ok {
		if m, ok := raw.(map[string]interface{}); ok {
			return m
		}
	}
	return map[string]interface{}{}
}
