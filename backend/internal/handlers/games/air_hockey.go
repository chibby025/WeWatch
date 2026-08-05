package games

import (
	"fmt"

	"wewatch-backend/internal/models"
)

// airHockeyInitialState seeds puck, 2-D mallet positions, scores, and phase.
// Canvas is the same 400×600 as ping_pong (rtW × rtH from ping_pong.go).
// Like ping_pong, the game (and every rally after a goal) starts in
// "serving" — the puck sits still at center until the server explicitly
// taps to serve, via airHockeyServeHandler. See the equivalent comment on
// pingPongInitialState (ping_pong.go) for why: an instant auto-relaunch on
// goal races the scoring client's own optimistic local reset against the
// server-confirmed one, visible as the puck appearing to "reload" twice for
// one goal. A real, server-tracked "serving" phase removes that race.
func airHockeyInitialState(players []models.Player) map[string]interface{} {
	p1ID := fmt.Sprintf("%d", players[0].UserID)
	p2ID := fmt.Sprintf("%d", players[1].UserID)
	return map[string]interface{}{
		"p1_id":     p1ID,
		"p2_id":     p2ID,
		"ball_x":    rtW / 2,
		"ball_y":    rtH / 2,
		"ball_vx":   0.0,
		"ball_vy":   0.0,
		"p1x":       rtW / 2,
		"p1y":       100.0, // P1 mallet starts in top half
		"p2x":       rtW / 2,
		"p2y":       500.0, // P2 mallet starts in bottom half
		"scores":    map[string]interface{}{p1ID: 0, p2ID: 0},
		"rally":     0,
		"phase":     "serving",
		"serve_by":  p1ID,
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
		// P1's estimated own-mallet velocity — lets P2's client extrapolate P1's
		// position between throttled sends instead of freezing it, mirroring the
		// same fix already applied to ping_pong.go.
		if v, ok := ppFloat(moveData["p1vx"]); ok {
			gameState.GameData["p1vx"] = v
		}
		if v, ok := ppFloat(moveData["p1vy"]); ok {
			gameState.GameData["p1vy"] = v
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
		// P2's estimated own-mallet velocity — same extrapolation purpose as above,
		// consumed by P1's collision check to forgive staleness on P2's side.
		if v, ok := ppFloat(moveData["p2vx"]); ok {
			gameState.GameData["p2vx"] = v
		}
		if v, ok := ppFloat(moveData["p2vy"]); ok {
			gameState.GameData["p2vy"] = v
		}
		return false, nil, nil

	case "goal":
		return airHockeyGoalHandler(gameState, moveData)

	case "serve":
		return airHockeyServeHandler(gameState, playerID)

	case "rt_end":
		return rtEndHandler(gameState)
	}

	return false, nil, fmt.Errorf("unknown air_hockey move type: %s", moveType)
}

// airHockeyGoalHandler scores the point, same math/shape as
// pingPongGoalHandler (kept as its own function rather than sharing it,
// since the two games' state layouts differ — flat ball_x/y/vx/vy here vs.
// ping_pong's balls[] array). On a non-winning goal this puts the game into
// "serving" and hands serve to the scorer, rather than instantly relaunching
// a moving puck — same reasoning as pingPongGoalHandler's own comment.
func airHockeyGoalHandler(gameState *GameSessionState, moveData map[string]interface{}) (bool, *uint, error) {
	scorerStr, _ := moveData["scorer_id"].(string)
	if scorerStr == "" {
		return false, nil, fmt.Errorf("goal missing scorer_id")
	}

	winScore := ppIntFrom(gameState.GameData["win_score"])
	if winScore == 0 {
		winScore = 5
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

	// Freeze the puck at center and hand serve to the scorer.
	// airHockeyServeHandler launches it once they explicitly tap.
	gameState.GameData["phase"] = "serving"
	gameState.GameData["serve_by"] = scorerStr
	gameState.GameData["ball_x"] = rtW / 2
	gameState.GameData["ball_y"] = rtH / 2
	gameState.GameData["ball_vx"] = 0.0
	gameState.GameData["ball_vy"] = 0.0
	return false, nil, nil
}

// airHockeyServeHandler launches the puck when whoever currently has serve
// taps it. Rejects anyone else trying to serve out of turn, and rejects a
// serve when the game isn't actually waiting on one (e.g. a stale/duplicate
// client message arriving after the rally already started).
func airHockeyServeHandler(gameState *GameSessionState, playerID uint) (bool, *uint, error) {
	phase, _ := gameState.GameData["phase"].(string)
	if phase != "serving" {
		return false, nil, fmt.Errorf("not awaiting a serve")
	}
	serveBy, _ := gameState.GameData["serve_by"].(string)
	if fmt.Sprintf("%d", playerID) != serveBy {
		return false, nil, fmt.Errorf("not your serve")
	}

	p1ID, _ := gameState.GameData["p1_id"].(string)
	vy := 220.0 // serve toward P2's side (downward)
	if serveBy == p1ID {
		vy = -220.0 // serve toward P1's side (upward)
	}
	gameState.GameData["ball_x"] = rtW / 2
	gameState.GameData["ball_y"] = rtH / 2
	gameState.GameData["ball_vx"] = 80.0
	gameState.GameData["ball_vy"] = vy
	gameState.GameData["phase"] = "playing"
	return false, nil, nil
}

// ensureAirHockeyState lazy-inits if GameData is empty (first move arrives before StartGame switch runs).
func ensureAirHockeyState(gameState *GameSessionState) {
	if gameState.GameData["p1_id"] == nil && len(gameState.Players) >= 2 {
		for k, v := range airHockeyInitialState(gameState.Players) {
			gameState.GameData[k] = v
		}
	}
}
