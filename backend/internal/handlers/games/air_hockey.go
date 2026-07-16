package games

import (
	"fmt"

	"wewatch-backend/internal/models"
)

// airHockeyInitialState seeds puck, 2-D mallet positions, scores, and phase.
// Canvas is the same 400×600 as ping_pong (rtW × rtH from ping_pong.go).
func airHockeyInitialState(players []models.Player) map[string]interface{} {
	p1ID := fmt.Sprintf("%d", players[0].UserID)
	p2ID := fmt.Sprintf("%d", players[1].UserID)
	return map[string]interface{}{
		"p1_id":     p1ID,
		"p2_id":     p2ID,
		"ball_x":    rtW / 2,
		"ball_y":    rtH / 2,
		"ball_vx":   80.0,
		"ball_vy":   220.0,
		"p1x":       rtW / 2,
		"p1y":       100.0, // P1 mallet starts in top half
		"p2x":       rtW / 2,
		"p2y":       500.0, // P2 mallet starts in bottom half
		"scores":    map[string]interface{}{p1ID: 0, p2ID: 0},
		"rally":     0,
		"phase":     "playing",
		"win_score": 5,
	}
}

func (gm *GameManager) processAirHockeyMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
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
		if v, ok := ppFloat(moveData["p1y"]); ok {
			gameState.GameData["p1y"] = v
		}
		return false, nil, nil

	case "mallet_move":
		// P2 sends 2-D mallet position. Relay to P1. No DB write (volatile).
		if v, ok := ppFloat(moveData["p2x"]); ok {
			gameState.GameData["p2x"] = v
		}
		if v, ok := ppFloat(moveData["p2y"]); ok {
			gameState.GameData["p2y"] = v
		}
		return false, nil, nil

	case "goal":
		return rtGoalHandler(gameState, moveData, 5)

	case "rt_end":
		return rtEndHandler(gameState)
	}

	return false, nil, fmt.Errorf("unknown air_hockey move type: %s", moveType)
}

// ensureAirHockeyState lazy-inits if GameData is empty (first move arrives before StartGame switch runs).
func ensureAirHockeyState(gameState *GameSessionState) {
	if gameState.GameData["p1_id"] == nil && len(gameState.Players) >= 2 {
		for k, v := range airHockeyInitialState(gameState.Players) {
			gameState.GameData[k] = v
		}
	}
}
