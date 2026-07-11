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
	// More platforms for more players so the game lasts long enough
	slots := 6
	if playerCount >= 3 {
		slots = 7
	}
	if playerCount >= 4 {
		slots = 8
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
		"slots":        slots,
		"solutions":    solutions, // hidden, stripped from public broadcast
		"revealed":     make([]bool, slots),
		"safe_sides":   make([]string, slots), // "" until revealed
		"positions":    positions,              // player_id → slot they're currently at (-1 = at start, 0-based)
		"phase":        "playing",
		"attempts":     map[string]interface{}{}, // player_id → total wrong attempts
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

	if correct {
		newPos := nextSlot
		positions[playerKey] = newPos
		gameState.GameData["positions"] = positions

		if newPos == slots-1 {
			// Crossed! This player wins.
			gameState.GameData["phase"] = "ended"
			// Cancel auto-advance (same player "wins" this exchange)
			gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
			uid := playerID
			return true, &uid, nil
		}

		// Correct but not done — same player goes again (cancel auto-advance)
		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil
	}

	// Wrong — reset player back to start
	positions[playerKey] = -1
	gameState.GameData["positions"] = positions

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
