package games

import "fmt"

// Hide & Seek — real-time, N-player (2-8) hidden-role game. The first
// genuinely asymmetric-information real-time game in this package: unlike
// tank_battle/bomberman/football/blob_battle (where every player's true
// position is broadcast to everyone via state_sync), a Prop's chosen
// hiding spot must never reach a Hunter's client until that Prop is
// actually found — a real information-hiding requirement, not just a
// trust/anti-cheat one.
//
// Deliberate scope decision, not an oversight: rather than building
// continuous-position hiding (which would require a genuinely new
// role-filtered broadcast mechanism — subset-of-room delivery via
// BroadcastToUsers, plus custom hooks in handleGameMove/handleGameStart,
// none of which exist anywhere in this codebase today), Hide & Seek uses a
// fixed set of discrete hiding spots (hideSeekSpotCount of them). A Prop
// picks ONE spot; a Hunter searches ONE spot at a time. This reuses the
// EXACT already-proven pattern from crazy_eights.go/rebus_round.go: keep
// the genuinely secret data (which spot each still-hidden Prop occupies)
// entirely OFF GameData, in a dedicated GameSessionState field
// (HideSeekSpots, added alongside Hands/RebusPuzzles), and only ever
// mirror SAFE derivatives — a hidden headcount, and (once a Prop is
// actually found) the reveal itself — into GameData for the normal
// room-wide broadcast. No new Hub/broadcast infrastructure is needed at
// all: nobody but the server ever needs this data delivered anywhere,
// unlike Crazy Eights' hands (which each owning player DOES need
// delivered privately) — it just needs to be excluded from what's already
// broadcast to everyone.
//
// Roles are assigned by join-order index, same convention as football.go's
// team-by-parity split: the first hideSeekNumHunters(total) players are
// Hunters, the rest are Props.
const hideSeekSpotCount = 10

func hideSeekNumHunters(total int) int {
	n := total / 4
	if n < 1 {
		n = 1
	}
	return n
}

func hideSeekRoleOf(index, total int) string {
	if index < hideSeekNumHunters(total) {
		return "hunter"
	}
	return "prop"
}

func hideSeekInitialState(playerIDs []uint) map[string]interface{} {
	roles := map[string]interface{}{}
	for i, pid := range playerIDs {
		roles[fmt.Sprintf("%d", pid)] = hideSeekRoleOf(i, len(playerIDs))
	}
	return map[string]interface{}{
		"phase":        "hiding",
		"roles":        roles,
		"spot_count":   float64(hideSeekSpotCount),
		"hidden_count": float64(0), // how many props have chosen a spot — never WHERE
		"found_props":  []interface{}{},
		"last_search":  nil,
	}
}

func (gm *GameManager) processHideSeekMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	moveType, _ := moveData["move_type"].(string)
	switch moveType {
	case "hide_at":
		return hideSeekHideHandler(gameState, playerID, moveData)
	case "search_spot":
		return hideSeekSearchHandler(gameState, playerID, moveData)
	case "hideseek_end":
		return hideSeekEndHandler(gameState)
	}
	return false, nil, fmt.Errorf("unknown hide_seek move type: %s", moveType)
}

func hideSeekMyIndex(gameState *GameSessionState, playerID uint) int {
	for i, p := range gameState.Players {
		if p.UserID == playerID {
			return i
		}
	}
	return -1
}

func hideSeekFoundProps(gameData map[string]interface{}) []interface{} {
	if raw, ok := gameData["found_props"].([]interface{}); ok {
		return raw
	}
	return []interface{}{}
}

// hideSeekHideHandler lets a Prop choose (or, before the hunt begins,
// change) which of the fixed spots they're hiding at. The spot itself is
// stored ONLY in gameState.HideSeekSpots — never GameData — so the room-wide
// broadcast this move still triggers (see game_manager.go's generic
// broadcastGameStateLocked call after every successfully-processed move)
// carries nothing but the updated hidden_count.
func hideSeekHideHandler(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	idx := hideSeekMyIndex(gameState, playerID)
	if idx < 0 {
		return false, nil, fmt.Errorf("not a participant in this game")
	}
	if hideSeekRoleOf(idx, len(gameState.Players)) != "prop" {
		return false, nil, fmt.Errorf("only props may hide")
	}
	phase, _ := gameState.GameData["phase"].(string)
	if phase != "hiding" {
		return false, nil, fmt.Errorf("hiding is only allowed before the hunt begins")
	}

	spotF, ok := ppFloat(moveData["spot_id"])
	if !ok {
		return false, nil, fmt.Errorf("hide_at missing spot_id")
	}
	spotID := int(spotF)
	if spotID < 0 || spotID >= hideSeekSpotCount {
		return false, nil, fmt.Errorf("invalid spot_id")
	}

	if gameState.HideSeekSpots == nil {
		gameState.HideSeekSpots = map[uint]int{}
	}
	for otherID, otherSpot := range gameState.HideSeekSpots {
		if otherID != playerID && otherSpot == spotID {
			return false, nil, fmt.Errorf("that spot is already taken")
		}
	}
	gameState.HideSeekSpots[playerID] = spotID
	gameState.GameData["hidden_count"] = float64(len(gameState.HideSeekSpots))

	// Auto-transition to the hunt once every Prop has chosen a spot — no
	// server-side timer needed at all (the same "state machine driven by
	// move outcomes, not a clock" convention already used throughout this
	// package), mirroring how e.g. Ludo/VS Battle advance their own phases.
	numProps := len(gameState.Players) - hideSeekNumHunters(len(gameState.Players))
	if len(gameState.HideSeekSpots) >= numProps {
		gameState.GameData["phase"] = "hunting"
	}

	return false, nil, nil
}

// hideSeekSearchHandler is the ONLY place a hidden spot is ever compared
// against — a genuine server-side proximity/lookup check, unlike every
// other real-time game in this package (which all avoid needing one by
// making the acting player authoritative over data they already know).
// A miss reveals nothing beyond "someone searched here and found nothing."
func hideSeekSearchHandler(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	if gameState.GameData["phase"] == "ended" {
		return false, nil, nil
	}
	idx := hideSeekMyIndex(gameState, playerID)
	if idx < 0 {
		return false, nil, fmt.Errorf("not a participant in this game")
	}
	if hideSeekRoleOf(idx, len(gameState.Players)) != "hunter" {
		return false, nil, fmt.Errorf("only hunters may search")
	}
	phase, _ := gameState.GameData["phase"].(string)
	if phase != "hunting" {
		return false, nil, fmt.Errorf("searching is only allowed once the hunt has begun")
	}

	spotF, ok := ppFloat(moveData["spot_id"])
	if !ok {
		return false, nil, fmt.Errorf("search_spot missing spot_id")
	}
	spotID := int(spotF)

	var foundPlayerID uint
	hit := false
	for pid, spot := range gameState.HideSeekSpots {
		if spot == spotID {
			foundPlayerID = pid
			hit = true
			break
		}
	}

	if hit {
		delete(gameState.HideSeekSpots, foundPlayerID)
		found := hideSeekFoundProps(gameState.GameData)
		found = append(found, float64(foundPlayerID))
		gameState.GameData["found_props"] = found
	}
	gameState.GameData["last_search"] = map[string]interface{}{
		"hunter_id": float64(playerID), "spot_id": float64(spotID), "hit": hit,
	}

	if !hit {
		return false, nil, nil
	}

	numProps := len(gameState.Players) - hideSeekNumHunters(len(gameState.Players))
	if len(hideSeekFoundProps(gameState.GameData)) >= numProps {
		gameState.GameData["phase"] = "ended"
		winner := playerID // the hunter who found the last prop represents the winning team
		return true, &winner, nil
	}
	return false, nil, nil
}

// hideSeekEndHandler is the host-only forced-end path — if any Prop is
// still hidden, Props win (a still-hidden Prop represents the team); if
// every Prop had already been found by the time this fires, Hunters win.
func hideSeekEndHandler(gameState *GameSessionState) (bool, *uint, error) {
	if gameState.GameData["phase"] == "ended" {
		return false, nil, nil
	}
	gameState.GameData["phase"] = "ended"

	for pid := range gameState.HideSeekSpots {
		winner := pid
		return true, &winner, nil
	}
	// No prop remains hidden — every Prop was found, so a representative
	// Hunter wins.
	total := len(gameState.Players)
	for i, p := range gameState.Players {
		if hideSeekRoleOf(i, total) == "hunter" {
			winner := p.UserID
			return true, &winner, nil
		}
	}
	return true, nil, nil // no hunters at all — shouldn't happen given hideSeekNumHunters's floor of 1
}
