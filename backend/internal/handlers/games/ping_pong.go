package games

import (
	"fmt"

	"wewatch-backend/internal/models"
)

// Ping Pong — turn-based tactical pong.
//
// Zones: the court is divided into 9 aim zones (3×3 grid), and 3 block zones
// (left / center / right thirds). A block zone covers 3 aim columns.
//
// Flow:
//   Phase "attacking": the attacker picks an aim zone (row 0-2, col 0-2).
//     → stored as hidden_shot; phase changes to "defending".
//   Phase "defending": the defender picks a block zone ("left"|"center"|"right").
//     → reveal both; block covers aim columns [0,1,2]/[0,1,2]/[3,4,5]/[6,7,8] — wait,
//       left = cols 0-2, center = cols 3-5, right = cols 6-8 of a 9-col grid.
//       Actually: left = cols 0-2, center = cols 3-5, right = cols 6-8 (mapped to 9 zones).
//     → if defended: score +0 for attacker; if not: score +1.
//     → swap attacker/defender, reset to "attacking".
//
// Win: first to 7 points (or host sends "end_game" for a mid-match exit).
// Players: exactly 2. Player 0 attacks first.

const pingPongWinScore = 7

// Zone mapping: aim_col 0-2 → left, 3-5 → center, 6-8 → right
// We encode aim zones as a single 0-8 index (row*3 + col in a 3×3 grid)
// but for blocking we only care about the column.

func pingPongInitialState(players []models.Player) map[string]interface{} {
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
		"phase":       "attacking",
		"attacker_id": fmt.Sprintf("%d", attackerID),
		"defender_id": fmt.Sprintf("%d", defenderID),
		"scores":      scores,
		"hidden_shot": nil, // set during defending phase, stripped from broadcast
		"last_shot":   nil, // revealed after each exchange
		"last_block":  nil,
		"last_result": "",  // "scored" | "blocked"
		"rally":       0,
		"win_score":   pingPongWinScore,
	}
}

// pingPongPublicState strips hidden_shot during the defending phase.
func pingPongPublicState(data map[string]interface{}) map[string]interface{} {
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

func ensurePingPongState(gameState *GameSessionState) {
	if gameState.GameData["phase"] == nil {
		for k, v := range pingPongInitialState(gameState.Players) {
			gameState.GameData[k] = v
		}
	}
}

func (gm *GameManager) processPingPongMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	ensurePingPongState(gameState)

	phase, _ := gameState.GameData["phase"].(string)
	attackerID, _ := gameState.GameData["attacker_id"].(string)
	defenderID, _ := gameState.GameData["defender_id"].(string)
	playerKey := fmt.Sprintf("%d", playerID)

	switch phase {
	case "attacking":
		if playerKey != attackerID {
			return false, nil, fmt.Errorf("it's not your turn to attack")
		}
		// Expect move_data.zone: 0-8
		zoneRaw, ok := moveData["zone"]
		if !ok {
			return false, nil, fmt.Errorf("missing zone (0-8)")
		}
		zone := ppInt(zoneRaw)
		if zone < 0 || zone > 8 {
			return false, nil, fmt.Errorf("zone must be 0-8")
		}
		gameState.GameData["hidden_shot"] = zone
		gameState.GameData["phase"] = "defending"
		// Cancel auto-advance — same "exchange" isn't done yet
		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil

	case "defending":
		if playerKey != defenderID {
			return false, nil, fmt.Errorf("it's not your turn to defend")
		}
		// Expect move_data.block: "left"|"center"|"right"
		block, _ := moveData["block"].(string)
		if block != "left" && block != "center" && block != "right" {
			return false, nil, fmt.Errorf("block must be 'left', 'center', or 'right'")
		}

		shot := ppInt(gameState.GameData["hidden_shot"])
		shotCol := shot % 3 // col 0,1,2 within the 3×3 aim grid

		// Map block zones to aim columns:
		// left → col 0, center → col 1, right → col 2
		blocked := false
		switch block {
		case "left":
			blocked = shotCol == 0
		case "center":
			blocked = shotCol == 1
		case "right":
			blocked = shotCol == 2
		}

		gameState.GameData["last_shot"] = shot
		gameState.GameData["last_block"] = block

		scores := ppScoreMap(gameState.GameData)
		rally := ppInt(gameState.GameData["rally"]) + 1
		gameState.GameData["rally"] = rally
		winScore := ppInt(gameState.GameData["win_score"])

		var result string
		if !blocked {
			scores[attackerID] = ppInt(scores[attackerID]) + 1
			result = "scored"
		} else {
			result = "blocked"
		}
		gameState.GameData["scores"] = scores
		gameState.GameData["last_result"] = result

		// Check win
		if ppInt(scores[attackerID]) >= winScore {
			gameState.GameData["phase"] = "ended"
			uid := ppParseUID(attackerID)
			gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
			return true, &uid, nil
		}
		if ppInt(scores[defenderID]) >= winScore {
			gameState.GameData["phase"] = "ended"
			uid := ppParseUID(defenderID)
			gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
			return true, &uid, nil
		}

		// Swap roles for next exchange
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

func ppInt(v interface{}) int {
	switch val := v.(type) {
	case int:
		return val
	case float64:
		return int(val)
	}
	return 0
}

func ppScoreMap(data map[string]interface{}) map[string]interface{} {
	if raw, ok := data["scores"]; ok {
		if m, ok := raw.(map[string]interface{}); ok {
			return m
		}
	}
	return map[string]interface{}{}
}

func ppParseUID(s string) uint {
	var uid uint
	fmt.Sscanf(s, "%d", &uid)
	return uid
}
