package games

import (
	"fmt"
	"math/rand"
)

// Blob Battle — an Agar.io-style real-time free-for-all (2-8 players),
// trademark-safely renamed per this package's own established convention
// (Wordsmith≠Scrabble, Toad Ball≠Zuma, etc. — "Agar.io" is an actively
// trademarked product name).
//
// Every player self-reports their own continuous position via state_sync
// (same as tank_battle/bomberman/football) — but unlike every prior
// real-time game in this package, a player's MASS is NOT self-reported at
// all: it's tracked authoritatively server-side, changed only by two
// validated actions. This is a deliberate, meaningful departure from the
// "casual trust, no real anti-cheat" model used everywhere else in this
// arcade layer, because mass is the actual win-condition-driving resource
// here (unlike, say, a bullet's cosmetic trajectory) — a client blindly
// trusted to report its own mass could simply claim to be huge and eat
// anyone.
//
//  1. eat_pellet {pellet_id} — a NEW "claimable" pattern for this package:
//     pellets are generated ONCE, deterministically, server-side at game
//     start (same technique bomberman.go already uses for its wall layout)
//     and embedded in the initial broadcast. Any player can claim any
//     still-unclaimed pellet; the backend is the sole arbiter of "was this
//     the first claim" via a simple already-eaten set, so even a genuine
//     race between two players reaching the same pellet in the same
//     network round-trip resolves to exactly one winner, never both.
//  2. eat_player {target_player_id} — the EATER reports this (mirroring
//     tank_battle's shooter-authority / bomberman's bomb-owner-authority
//     precedent: whoever performs an action is authoritative for its own
//     outcome), but here the backend actually VALIDATES it against the
//     server's own tracked mass values (eater must be at least
//     blobEatMassRatio times heavier than the target RIGHT NOW, per the
//     backend's own bookkeeping) rather than trusting it outright — the
//     one real anti-cheat check in this whole real-time game family.
const (
	blobPelletCount     = 120
	blobArenaSize       = 2000.0
	blobStartingMass    = 20.0
	blobPelletMassGain  = 2.0
	blobEatMassRatio    = 1.15 // eater must be at least this many times heavier than the target
	blobEatMassTransfer = 0.7  // fraction of the eaten player's mass the eater gains
)

// Spawn positioning is a pure client-side rendering concern (never
// validated server-side, since a player's real position always flows
// through the same self-reported state_sync every other real-time game in
// this package already trusts) — computed independently by each client
// from its own index within the players array: angle = 2π·index/total,
// radius = arenaSize·0.35, centered on the arena. FootballGame.jsx/
// BombermanGame.jsx already establish this "each client derives its own
// spawn point identically, no server round-trip needed" convention.

// blobBattleInitialState generates the pellet field ONCE, server-side, and
// embeds it directly in the broadcast initial state — every client gets
// the identical layout this way, no shared seed needed (same technique as
// bombermanInitialState's soft-wall generation).
func blobBattleInitialState(playerIDs []uint) map[string]interface{} {
	pellets := make([]interface{}, 0, blobPelletCount)
	for i := 0; i < blobPelletCount; i++ {
		pellets = append(pellets, map[string]interface{}{
			"id": float64(i),
			"x":  rand.Float64() * blobArenaSize,
			"y":  rand.Float64() * blobArenaSize,
		})
	}

	mass := map[string]interface{}{}
	alive := map[string]interface{}{}
	for _, pid := range playerIDs {
		key := fmt.Sprintf("%d", pid)
		mass[key] = blobStartingMass
		alive[key] = true
	}

	return map[string]interface{}{
		"phase":            "playing",
		"pellets":          pellets,
		"eaten_pellets":    []interface{}{},
		"mass":             mass,
		"players_alive":    alive,
		"arena_size":       blobArenaSize,
		"starting_mass":    blobStartingMass,
		"pellet_mass_gain": blobPelletMassGain,
	}
}

func (gm *GameManager) processBlobBattleMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	moveType, _ := moveData["move_type"].(string)
	switch moveType {
	case "state_sync":
		key := fmt.Sprintf("player_%d", playerID)
		snapshot := map[string]interface{}{}
		for _, field := range []string{"x", "y", "vx", "vy"} {
			if v, ok := ppFloat(moveData[field]); ok {
				snapshot[field] = v
			}
		}
		gameState.GameData[key] = snapshot
		return false, nil, nil

	case "eat_pellet":
		return blobEatPelletHandler(gameState, playerID, moveData)

	case "eat_player":
		return blobEatPlayerHandler(gameState, playerID, moveData)

	case "blob_battle_end":
		return blobBattleEndHandler(gameState)
	}

	return false, nil, fmt.Errorf("unknown blob_battle move type: %s", moveType)
}

func blobMassMap(gameData map[string]interface{}) map[string]interface{} {
	if raw, ok := gameData["mass"].(map[string]interface{}); ok {
		return raw
	}
	return map[string]interface{}{}
}

func blobAliveMap(gameData map[string]interface{}) map[string]interface{} {
	if raw, ok := gameData["players_alive"].(map[string]interface{}); ok {
		return raw
	}
	return map[string]interface{}{}
}

func blobGetMass(gameData map[string]interface{}, playerID uint) float64 {
	m := blobMassMap(gameData)
	v, ok := ppFloat(m[fmt.Sprintf("%d", playerID)])
	if !ok {
		return blobStartingMass
	}
	return v
}

// blobEatPelletHandler is the "claimable resource" pattern: the pellet is
// only awarded if it hasn't already been claimed by anyone else. A genuine
// race between two players reaching the same pellet at nearly the same
// time resolves to exactly one winner — whichever claim this function
// processes first (moves are already serialized one-at-a-time under
// gm.mu, so "processed first" is well-defined and race-free even though
// the two underlying network requests may have been sent at nearly the
// same real-world instant).
func blobEatPelletHandler(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	if gameState.GameData["phase"] == "ended" {
		return false, nil, nil
	}
	alive := blobAliveMap(gameState.GameData)
	playerKey := fmt.Sprintf("%d", playerID)
	if isAlive, _ := alive[playerKey].(bool); !isAlive {
		return false, nil, fmt.Errorf("eliminated players cannot eat pellets")
	}

	pelletIDF, ok := ppFloat(moveData["pellet_id"])
	if !ok {
		return false, nil, fmt.Errorf("eat_pellet missing pellet_id")
	}
	pelletID := int(pelletIDF)

	eaten, _ := gameState.GameData["eaten_pellets"].([]interface{})
	for _, raw := range eaten {
		if id, ok := ppFloat(raw); ok && int(id) == pelletID {
			// Already claimed by someone else — a harmless no-op for the
			// loser of a genuine race, not an error worth surfacing.
			return false, nil, nil
		}
	}
	eaten = append(eaten, float64(pelletID))
	gameState.GameData["eaten_pellets"] = eaten

	mass := blobMassMap(gameState.GameData)
	mass[playerKey] = blobGetMass(gameState.GameData, playerID) + blobPelletMassGain
	gameState.GameData["mass"] = mass

	return false, nil, nil
}

// blobEatPlayerHandler validates the eater's CURRENT server-tracked mass is
// genuinely large enough to eat the target's CURRENT server-tracked mass —
// the one real anti-cheat check in this real-time game family, since mass
// is the actual resource the whole match's win condition depends on.
func blobEatPlayerHandler(gameState *GameSessionState, eaterID uint, moveData map[string]interface{}) (bool, *uint, error) {
	if gameState.GameData["phase"] == "ended" {
		return false, nil, nil
	}

	targetIDF, ok := ppFloat(moveData["target_player_id"])
	if !ok {
		return false, nil, fmt.Errorf("eat_player missing target_player_id")
	}
	targetID := uint(targetIDF)
	if targetID == eaterID {
		return false, nil, fmt.Errorf("cannot eat yourself")
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

	alive := blobAliveMap(gameState.GameData)
	eaterKey := fmt.Sprintf("%d", eaterID)
	targetKey := fmt.Sprintf("%d", targetID)
	if isAlive, _ := alive[eaterKey].(bool); !isAlive {
		return false, nil, fmt.Errorf("eliminated players cannot eat other players")
	}
	if isAlive, ok := alive[targetKey].(bool); !ok || !isAlive {
		return false, nil, fmt.Errorf("target is already eliminated")
	}

	eaterMass := blobGetMass(gameState.GameData, eaterID)
	targetMass := blobGetMass(gameState.GameData, targetID)
	if eaterMass < targetMass*blobEatMassRatio {
		return false, nil, fmt.Errorf("not heavy enough to eat that player")
	}

	mass := blobMassMap(gameState.GameData)
	mass[eaterKey] = eaterMass + targetMass*blobEatMassTransfer
	gameState.GameData["mass"] = mass
	alive[targetKey] = false
	gameState.GameData["players_alive"] = alive

	return blobBattleCheckWin(gameState)
}

// blobBattleCheckWin declares a winner once exactly one player remains
// alive, or a draw if the match is forced to end with 0 or 2+ still alive.
func blobBattleCheckWin(gameState *GameSessionState) (bool, *uint, error) {
	alive := blobAliveMap(gameState.GameData)
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
	return true, nil, nil
}

// blobBattleEndHandler is the host-only forced-end path — whoever
// currently has the highest server-tracked mass among still-alive players
// wins; a tie (including "everyone already eliminated") is a draw.
func blobBattleEndHandler(gameState *GameSessionState) (bool, *uint, error) {
	if gameState.GameData["phase"] == "ended" {
		return false, nil, nil
	}
	gameState.GameData["phase"] = "ended"

	alive := blobAliveMap(gameState.GameData)
	var topMass float64 = -1
	var winnerUID *uint
	tied := false
	for _, p := range gameState.Players {
		key := fmt.Sprintf("%d", p.UserID)
		if isAlive, ok := alive[key].(bool); !ok || !isAlive {
			continue
		}
		m := blobGetMass(gameState.GameData, p.UserID)
		if m > topMass {
			topMass = m
			uid := p.UserID
			winnerUID = &uid
			tied = false
		} else if m == topMass {
			tied = true
		}
	}
	if tied {
		return true, nil, nil
	}
	return true, winnerUID, nil
}
