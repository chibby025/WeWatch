package games

import "fmt"

// Tank Battle — genuine real-time 2-player PvP, no authoritative physics
// server, following the exact same trust model already established for
// ping_pong/air_hockey (see the file-level notes there): each client is the
// sole authority over its OWN tank's position/rotation/turret angle,
// relaying it via state_sync at ~15-20Hz for the other client to render
// (with dead-reckoning extrapolation, same as ping_pong's paddle relay).
//
// Unlike ping_pong/air_hockey, there is no single shared physics object (a
// ball) needing one player to be "the" authority — each tank is symmetric,
// self-controlled, and self-reported. The one thing that DOES need a single
// source of truth is "did a shot land" (health/elimination), and the
// natural authority for that is the SHOOTER: they know their own bullet's
// exact origin, angle, speed, and timing, and can locally detect a
// collision against the target's last-known (extrapolated) position. This
// mirrors the same "no real anti-cheat, just enough trust for a casual
// friendly arcade duel" model already accepted throughout this game
// package — a dishonest client could self-report false hits, exactly the
// same risk a dishonest ping_pong client already has by self-reporting
// "goal" events.
func tankBattleInitialState(playerIDs []uint) map[string]interface{} {
	p1ID := fmt.Sprintf("%d", playerIDs[0])
	p2ID := fmt.Sprintf("%d", playerIDs[1])
	return map[string]interface{}{
		"phase": "playing",
		// Reuse the exact "scores" field name/shape rtEndHandler already
		// understands (see ping_pong.go) — here it holds current HP, not
		// points, but rtEndHandler is purely "whoever has the higher number
		// wins," which is exactly the semantics a forced end should have.
		"scores": map[string]interface{}{p1ID: 100, p2ID: 100},
		"max_hp": 100,
		"p1_id":  p1ID,
		"p2_id":  p2ID,
	}
}

func (gm *GameManager) processTankBattleMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	moveType, _ := moveData["move_type"].(string)
	switch moveType {
	case "state_sync":
		// Pure relay of the sender's own tank state — position, rotation,
		// turret angle, and self-reported velocity (for the receiver's own
		// dead-reckoning extrapolation, same technique already proven in
		// ping_pong/air_hockey). In-memory only; no DB write (volatile).
		key := fmt.Sprintf("tank_%d", playerID)
		snapshot := map[string]interface{}{}
		for _, field := range []string{"x", "y", "angle", "turret_angle", "vx", "vy"} {
			if v, ok := ppFloat(moveData[field]); ok {
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
		gameState.GameData["last_fire"] = lastFire
		return false, nil, nil

	case "hit":
		return tankBattleHitHandler(gameState, playerID, moveData)

	case "tank_battle_end":
		return rtEndHandler(gameState)
	}

	return false, nil, fmt.Errorf("unknown tank_battle move type: %s", moveType)
}

// tankBattleHitHandler applies damage the SHOOTER (playerID) reports against
// the OTHER real player in this game. Validates the target is a genuine
// participant and not the shooter themselves (no self-damage reports),
// clamps damage to a sane range (defends against a malformed/malicious
// client claiming a one-shot kill), and declares the shooter the winner the
// instant the target's HP reaches zero.
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
		gameState.GameData["phase"] = "ended"
		winner := shooterID
		return true, &winner, nil
	}

	return false, nil, nil
}
