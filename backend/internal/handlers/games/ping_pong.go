package games

import (
	"fmt"

	"wewatch-backend/internal/models"
)

// Shared canvas logical dimensions — must match frontend constants.
const rtW = 400.0
const rtH = 600.0

// pingPongInitialState seeds ball, paddle positions, scores, and phase.
func pingPongInitialState(players []models.Player) map[string]interface{} {
	p1ID := fmt.Sprintf("%d", players[0].UserID)
	p2ID := fmt.Sprintf("%d", players[1].UserID)
	return map[string]interface{}{
		"p1_id":     p1ID,
		"p2_id":     p2ID,
		"ball_x":    rtW / 2,
		"ball_y":    rtH / 2,
		"ball_vx":   50.0,
		"ball_vy":   260.0,
		"p1x":       rtW / 2,
		"p2x":       rtW / 2,
		"scores":    map[string]interface{}{p1ID: 0, p2ID: 0},
		"rally":     0,
		"phase":     "playing",
		"win_score": 7,
		"no_walls":  false,
	}
}

func (gm *GameManager) processPingPongMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	moveType, _ := moveData["move_type"].(string)
	switch moveType {
	case "state_sync":
		// Real-time relay from P1 (physics authority). In-memory only; no DB write (volatile).
		if v, ok := ppFloat(moveData["ball_x"]); ok {
			gameState.GameData["ball_x"] = v
		}
		if v, ok := ppFloat(moveData["ball_y"]); ok {
			gameState.GameData["ball_y"] = v
		}
		if v, ok := ppFloat(moveData["ball_vx"]); ok {
			gameState.GameData["ball_vx"] = v
		}
		if v, ok := ppFloat(moveData["ball_vy"]); ok {
			gameState.GameData["ball_vy"] = v
		}
		if v, ok := ppFloat(moveData["p1x"]); ok {
			gameState.GameData["p1x"] = v
		}
		return false, nil, nil

	case "paddle_move":
		// P2 sends their paddle X. Relay to everyone. No DB write (volatile).
		if v, ok := ppFloat(moveData["p2x"]); ok {
			gameState.GameData["p2x"] = v
		}
		return false, nil, nil

	case "goal":
		return rtGoalHandler(gameState, moveData, 7)

	case "rt_end":
		return rtEndHandler(gameState)
	}

	return false, nil, fmt.Errorf("unknown ping_pong move type: %s", moveType)
}

// rtGoalHandler is shared between ping_pong and air_hockey.
// Increments the scorer's score, resets ball to center, checks win.
func rtGoalHandler(gameState *GameSessionState, moveData map[string]interface{}, defaultWinScore int) (bool, *uint, error) {
	scorerStr, _ := moveData["scorer_id"].(string)
	if scorerStr == "" {
		return false, nil, fmt.Errorf("goal missing scorer_id")
	}

	winScore := ppIntFrom(gameState.GameData["win_score"])
	if winScore == 0 {
		winScore = defaultWinScore
	}

	scores := ppScoreMap(gameState.GameData)
	newScore := ppIntFrom(scores[scorerStr]) + 1
	scores[scorerStr] = newScore
	gameState.GameData["scores"] = scores
	gameState.GameData["rally"] = ppIntFrom(gameState.GameData["rally"]) + 1

	if newScore >= winScore {
		gameState.GameData["phase"] = "ended"
		for _, p := range gameState.Players {
			if fmt.Sprintf("%d", p.UserID) == scorerStr {
				uid := p.UserID
				return true, &uid, nil
			}
		}
		return true, nil, nil
	}

	// Reset ball/puck to center. Ball goes toward the scorer (they serve next).
	p1ID, _ := gameState.GameData["p1_id"].(string)
	gameState.GameData["ball_x"] = rtW / 2
	gameState.GameData["ball_y"] = rtH / 2
	gameState.GameData["ball_vx"] = 50.0
	if scorerStr == p1ID {
		gameState.GameData["ball_vy"] = -260.0 // scored → serve toward P1's side (upward)
	} else {
		gameState.GameData["ball_vy"] = 260.0 // P2 scored → serve downward toward P2's side
	}
	return false, nil, nil
}

// --- helpers (shared across real-time game files in this package) ---

func ppFloat(v interface{}) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	}
	return 0, false
}

func ppIntFrom(v interface{}) int {
	switch n := v.(type) {
	case int:
		return n
	case float64:
		return int(n)
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

// ppInt kept for backward compatibility with any residual callers in this package.
func ppInt(v interface{}) int { return ppIntFrom(v) }

// pingPongPublicState returns the full game data — all state is public in this real-time game.
func pingPongPublicState(data map[string]interface{}) map[string]interface{} { return data }

// airHockeyPublicState returns the full game data — all state is public in this real-time game.
func airHockeyPublicState(data map[string]interface{}) map[string]interface{} { return data }

// rtEndHandler ends a real-time game immediately, determining the winner from current scores.
// Idempotent: a second call while already ended is a no-op.
func rtEndHandler(gameState *GameSessionState) (bool, *uint, error) {
	if gameState.GameData["phase"] == "ended" {
		return false, nil, nil
	}

	scores := ppScoreMap(gameState.GameData)

	topScore := -1
	var winnerUID *uint
	tied := false

	for _, p := range gameState.Players {
		idStr := fmt.Sprintf("%d", p.UserID)
		s := ppIntFrom(scores[idStr])
		if s > topScore {
			topScore = s
			uid := p.UserID
			winnerUID = &uid
			tied = false
		} else if topScore >= 0 && s == topScore {
			tied = true
			winnerUID = nil
		}
	}
	if tied {
		winnerUID = nil
	}

	gameState.GameData["phase"] = "ended"
	return true, winnerUID, nil
}
