package games

import (
	"fmt"
	"math/rand"

	"wewatch-backend/internal/models"
)

// Air Hockey — similar to Ping Pong but with 5 aim zones and a bank-shot twist.
//
// Shot zones: 5 (left-corner, left, center, right, right-corner).
// Bank shots: attacker can optionally pick a bank side ("left"|"right"|"none").
//   A banked shot shifts the effective landing zone by ±2 positions — unpredictable
//   for the defender.
// Block zones: 3 (left / center / right), same as Ping Pong.
//   left covers zones 0-1, center covers zone 2, right covers zones 3-4.
//
// Win: first to 5 points (shorter than Ping Pong for more dynamism).
// Players: exactly 2.

const airHockeyWinScore = 5

func airHockeyInitialState(players []models.Player) map[string]interface{} {
	scores := map[string]interface{}{}
	for _, p := range players {
		scores[fmt.Sprintf("%d", p.UserID)] = 0
	}
	attackerID := uint(0)
	defenderID := uint(0)
	if len(players) >= 1 {
		attackerID = players[0].UserID
	}
	if len(players) >= 2 {
		defenderID = players[1].UserID
	}
	return map[string]interface{}{
		"phase":            "attacking",
		"attacker_id":      fmt.Sprintf("%d", attackerID),
		"defender_id":      fmt.Sprintf("%d", defenderID),
		"scores":           scores,
		"hidden_shot":      nil, // {zone, bank}
		"last_shot":        nil,
		"last_effective_zone": nil,
		"last_block":       nil,
		"last_result":      "",
		"rally":            0,
		"win_score":        airHockeyWinScore,
	}
}

// airHockeyPublicState strips hidden_shot during defending phase.
func airHockeyPublicState(data map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(data))
	for k, v := range data {
		out[k] = v
	}
	phase, _ := data["phase"].(string)
	if phase == "defending" {
		delete(out, "hidden_shot")
	}
	return out
}

func ensureAirHockeyState(gameState *GameSessionState) {
	if gameState.GameData["phase"] == nil {
		for k, v := range airHockeyInitialState(gameState.Players) {
			gameState.GameData[k] = v
		}
	}
}

func (gm *GameManager) processAirHockeyMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	ensureAirHockeyState(gameState)

	phase, _ := gameState.GameData["phase"].(string)
	attackerID, _ := gameState.GameData["attacker_id"].(string)
	defenderID, _ := gameState.GameData["defender_id"].(string)
	playerKey := fmt.Sprintf("%d", playerID)

	switch phase {
	case "attacking":
		if playerKey != attackerID {
			return false, nil, fmt.Errorf("it's not your turn to attack")
		}
		// zone: 0-4 (left-corner=0, left=1, center=2, right=3, right-corner=4)
		zoneRaw, ok := moveData["zone"]
		if !ok {
			return false, nil, fmt.Errorf("missing zone (0-4)")
		}
		zone := ahInt(zoneRaw)
		if zone < 0 || zone > 4 {
			return false, nil, fmt.Errorf("zone must be 0-4")
		}
		bank, _ := moveData["bank"].(string)
		if bank == "" {
			bank = "none"
		}
		if bank != "none" && bank != "left" && bank != "right" {
			return false, nil, fmt.Errorf("bank must be 'none', 'left', or 'right'")
		}

		gameState.GameData["hidden_shot"] = map[string]interface{}{
			"zone": zone,
			"bank": bank,
		}
		gameState.GameData["phase"] = "defending"
		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil

	case "defending":
		if playerKey != defenderID {
			return false, nil, fmt.Errorf("it's not your turn to defend")
		}
		block, _ := moveData["block"].(string)
		if block != "left" && block != "center" && block != "right" {
			return false, nil, fmt.Errorf("block must be 'left', 'center', or 'right'")
		}

		shotRaw := gameState.GameData["hidden_shot"]
		shotMap, _ := shotRaw.(map[string]interface{})
		zone := ahInt(shotMap["zone"])
		bank, _ := shotMap["bank"].(string)

		// Apply bank: shift zone by ±2, clamped to 0-4.
		// Small random wobble makes exact bank destination unknown to defender.
		effectiveZone := zone
		if bank == "left" {
			shift := 1 + rand.Intn(2) // +1 or +2 toward right (bank off left wall)
			effectiveZone = zone + shift
		} else if bank == "right" {
			shift := 1 + rand.Intn(2)
			effectiveZone = zone - shift
		}
		if effectiveZone < 0 {
			effectiveZone = 0
		}
		if effectiveZone > 4 {
			effectiveZone = 4
		}

		// Block coverage:
		// left → zones 0-1, center → zone 2, right → zones 3-4
		blocked := false
		switch block {
		case "left":
			blocked = effectiveZone <= 1
		case "center":
			blocked = effectiveZone == 2
		case "right":
			blocked = effectiveZone >= 3
		}

		gameState.GameData["last_shot"] = shotMap
		gameState.GameData["last_effective_zone"] = effectiveZone
		gameState.GameData["last_block"] = block

		scores := ahScoreMap(gameState.GameData)
		rally := ahInt(gameState.GameData["rally"]) + 1
		gameState.GameData["rally"] = rally
		winScore := ahInt(gameState.GameData["win_score"])

		var result string
		if !blocked {
			scores[attackerID] = ahInt(scores[attackerID]) + 1
			result = "scored"
		} else {
			result = "blocked"
		}
		gameState.GameData["scores"] = scores
		gameState.GameData["last_result"] = result

		// Check win
		if ahInt(scores[attackerID]) >= winScore {
			gameState.GameData["phase"] = "ended"
			uid := ahParseUID(attackerID)
			gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
			return true, &uid, nil
		}
		if ahInt(scores[defenderID]) >= winScore {
			gameState.GameData["phase"] = "ended"
			uid := ahParseUID(defenderID)
			gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
			return true, &uid, nil
		}

		// Swap roles
		gameState.GameData["attacker_id"] = defenderID
		gameState.GameData["defender_id"] = attackerID
		gameState.GameData["phase"] = "attacking"
		gameState.GameData["hidden_shot"] = nil

		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil

	default:
		return false, nil, fmt.Errorf("game is not in an active phase")
	}
}

// --- helpers ---

func ahInt(v interface{}) int {
	switch val := v.(type) {
	case int:
		return val
	case float64:
		return int(val)
	}
	return 0
}

func ahScoreMap(data map[string]interface{}) map[string]interface{} {
	if raw, ok := data["scores"]; ok {
		if m, ok := raw.(map[string]interface{}); ok {
			return m
		}
	}
	return map[string]interface{}{}
}

func ahParseUID(s string) uint {
	var uid uint
	fmt.Sscanf(s, "%d", &uid)
	return uid
}
