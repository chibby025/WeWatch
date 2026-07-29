package games

import (
	"fmt"
	"math/rand"
)

// Glass Bridge: players take turns stepping across a bridge of N platforms.
// Each platform has a hidden safe side (left or right). The current player
// picks left or right. Correct: advance to next platform (same player's turn
// again). Wrong: back to start, slot is revealed, next player's turn.
// First to cross all platforms wins.

func glassBridgeInitialState(playerCount int) map[string]interface{} {
	// Base length is 10 slots for 2 players, +3 per player beyond that, capped
	// at 22 so a large group doesn't turn into an unreasonably long slog.
	slots := 10 + (playerCount-2)*3
	if slots < 10 {
		slots = 10
	}
	if slots > 22 {
		slots = 22
	}

	solutions := make([]string, slots)
	for i := range solutions {
		if rand.Intn(2) == 0 {
			solutions[i] = "left"
		} else {
			solutions[i] = "right"
		}
	}

	positions := map[string]interface{}{}
	eliminated := []string{}
	_ = eliminated

	return map[string]interface{}{
		"slots":      slots,
		"solutions":  solutions, // hidden, stripped from public broadcast
		"revealed":   make([]bool, slots),
		"safe_sides": make([]string, slots), // "" until revealed
		"positions":  positions,             // player_id → slot they're currently at (-1 = at start, 0-based)
		"phase":      "playing",
		"attempts":   map[string]interface{}{}, // player_id → total wrong attempts
		// Move-event tracking so every connected client (not just the mover) can
		// reliably animate "what just happened" in real time. move_seq is
		// monotonic and never reset, so two moves in quick succession are always
		// distinguishable — the same edge-detection pattern used for Ludo captures.
		"move_seq":      0,
		"last_actor_id": nil,
		"last_result":   "", // "advanced" | "fell" | "crossed"
		"last_slot":     -1,
		"last_side":     "",
		// Furthest position ANY player has ever successfully reached, updated
		// only on a successful advance and never decreased by a later fall —
		// this is what lets the frontend show a persistent "furthest confirmed
		// safe point" marker even after whoever reached it falls back to start.
		// Deriving this from `revealed` alone isn't reliable: a row can become
		// revealed from a *failed* first attempt, not just a successful pass.
		"frontier_position": -1,
	}
}

// glassBridgePublicState strips the hidden solution array.
func glassBridgePublicState(data map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(data))
	for k, v := range data {
		out[k] = v
	}
	phase, _ := data["phase"].(string)
	if phase == "playing" {
		delete(out, "solutions")
	}
	return out
}

func ensureGlassBridgeState(gameState *GameSessionState) {
	if gameState.GameData["phase"] == nil {
		for k, v := range glassBridgeInitialState(len(gameState.Players)) {
			gameState.GameData[k] = v
		}
		// Seed positions: all at -1 (haven't started yet)
		positions := gameState.GameData["positions"].(map[string]interface{})
		for _, p := range gameState.Players {
			positions[fmt.Sprintf("%d", p.UserID)] = -1
		}
		gameState.GameData["positions"] = positions
	}
}

func (gm *GameManager) processGlassBridgeMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	ensureGlassBridgeState(gameState)

	phase, _ := gameState.GameData["phase"].(string)
	if phase != "playing" {
		return false, nil, fmt.Errorf("game is not in playing phase")
	}

	side, _ := moveData["side"].(string)
	if side != "left" && side != "right" {
		return false, nil, fmt.Errorf("side must be 'left' or 'right'")
	}

	playerKey := fmt.Sprintf("%d", playerID)
	positions := gbPositions(gameState.GameData)
	slots := gbInt(gameState.GameData["slots"])
	solutions := gbStringSlice(gameState.GameData["solutions"])
	revealed := gbBoolSlice(gameState.GameData["revealed"])
	safeSides := gbStringSlice(gameState.GameData["safe_sides"])

	// Current player's position (slot they're about to step on)
	currentPos := gbInt(positions[playerKey])
	nextSlot := currentPos + 1 // 0-indexed slot they're attempting

	if nextSlot >= slots {
		return false, nil, fmt.Errorf("player has already crossed the bridge")
	}

	correct := solutions[nextSlot] == side

	// Reveal this slot for all players going forward
	if !revealed[nextSlot] {
		revealed[nextSlot] = true
		safeSides[nextSlot] = solutions[nextSlot]
		gameState.GameData["revealed"] = revealed
		gameState.GameData["safe_sides"] = safeSides
	}

	// Move-event tracking, monotonic — lets every connected client (mover or
	// spectator) edge-detect and animate this exact move exactly once, even if
	// this player's next move lands before a slower client has re-rendered.
	gameState.GameData["move_seq"] = gbInt(gameState.GameData["move_seq"]) + 1
	gameState.GameData["last_actor_id"] = playerID
	gameState.GameData["last_slot"] = nextSlot
	gameState.GameData["last_side"] = side

	if correct {
		newPos := nextSlot
		positions[playerKey] = newPos
		gameState.GameData["positions"] = positions
		if newPos > gbInt(gameState.GameData["frontier_position"]) {
			gameState.GameData["frontier_position"] = newPos
		}

		if newPos == slots-1 {
			// Crossed! This player wins.
			gameState.GameData["phase"] = "ended"
			gameState.GameData["last_result"] = "crossed"
			// Cancel auto-advance (same player "wins" this exchange)
			gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
			uid := playerID
			return true, &uid, nil
		}

		// Correct but not done — same player goes again (cancel auto-advance)
		gameState.GameData["last_result"] = "advanced"
		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil
	}

	// Wrong — reset player back to start
	positions[playerKey] = -1
	gameState.GameData["positions"] = positions
	gameState.GameData["last_result"] = "fell"

	// Track attempts
	attempts := gbAttempts(gameState.GameData)
	attempts[playerKey] = gbInt(attempts[playerKey]) + 1
	gameState.GameData["attempts"] = attempts

	// Check if all players have been eliminated (all positions -1 and all tried)?
	// Not really an elimination game — they just keep trying. Let turn advance normally.
	return false, nil, nil
}

// --- helpers ---

func gbPositions(data map[string]interface{}) map[string]interface{} {
	if raw, ok := data["positions"]; ok {
		if m, ok := raw.(map[string]interface{}); ok {
			return m
		}
	}
	return map[string]interface{}{}
}

func gbAttempts(data map[string]interface{}) map[string]interface{} {
	if raw, ok := data["attempts"]; ok {
		if m, ok := raw.(map[string]interface{}); ok {
			return m
		}
	}
	return map[string]interface{}{}
}

func gbInt(v interface{}) int {
	switch val := v.(type) {
	case int:
		return val
	case float64:
		return int(val)
	}
	return 0
}

func gbStringSlice(raw interface{}) []string {
	if raw == nil {
		return []string{}
	}
	if s, ok := raw.([]string); ok {
		return append([]string{}, s...)
	}
	if s, ok := raw.([]interface{}); ok {
		out := make([]string, len(s))
		for i, v := range s {
			out[i], _ = v.(string)
		}
		return out
	}
	return []string{}
}

func gbBoolSlice(raw interface{}) []bool {
	if raw == nil {
		return []bool{}
	}
	if s, ok := raw.([]bool); ok {
		return append([]bool{}, s...)
	}
	if s, ok := raw.([]interface{}); ok {
		out := make([]bool, len(s))
		for i, v := range s {
			out[i], _ = v.(bool)
		}
		return out
	}
	return []bool{}
}
