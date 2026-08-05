package games

import (
	"fmt"
	"time"

	"wewatch-backend/internal/models"
)

// Shared canvas logical dimensions — must match frontend constants.
const rtW = 400.0
const rtH = 600.0

// Pickup power durations (ms) — how long the debuff lasts on whoever it's
// applied to. Held here (not just the frontend) since expiry is computed as
// an absolute timestamp at grab time, server-side, so every client agrees on
// exactly when it ends regardless of their own clock drift.
const (
	pingPongFreezeDurationMs    = 2500
	pingPongSlowDurationMs      = 4000
	pingPongInvisibleDurationMs = 3000
)

var pingPongPickupDurations = map[string]int64{
	"freeze":    pingPongFreezeDurationMs,
	"slow":      pingPongSlowDurationMs,
	"invisible": pingPongInvisibleDurationMs,
}

// pingPongBall builds one ball entry for the "balls" array. Every ball-state
// field lives in this one array (never flat ball_x/y/vx/vy fields) so that
// multiply-ball (a planned follow-up power) is just "append another entry" —
// no second wire format to add later, no client-side branching on "is this
// the single-ball shape or the multi-ball shape."
func pingPongBall(id int, x, y, vx, vy float64) map[string]interface{} {
	return map[string]interface{}{"id": float64(id), "x": x, "y": y, "vx": vx, "vy": vy}
}

func pingPongSingleBallArray(x, y, vx, vy float64) []interface{} {
	return []interface{}{pingPongBall(0, x, y, vx, vy)}
}

// pingPongInitialState seeds ball(s), paddle positions, scores, and phase.
// The game (and every rally after a goal) starts in "serving" — the ball
// sits still at the server's paddle until they explicitly tap to serve, via
// pingPongServeHandler. This replaces an earlier design where a goal
// immediately re-served a moving ball with no pause at all: the client that
// detects a goal locally has to optimistically freeze the ball before the
// server confirms, and an instant auto-serve gave no time for that local
// freeze and the server-confirmed reset to ever coincide — visible as the
// ball appearing to "reload" twice in quick succession for one goal. A real,
// server-tracked "serving" phase removes the race entirely: nothing moves
// again until an explicit serve move is processed.
func pingPongInitialState(players []models.Player) map[string]interface{} {
	p1ID := fmt.Sprintf("%d", players[0].UserID)
	p2ID := fmt.Sprintf("%d", players[1].UserID)
	return map[string]interface{}{
		"p1_id":         p1ID,
		"p2_id":         p2ID,
		"balls":         pingPongSingleBallArray(rtW/2, rtH/2, 0, 0),
		"p1x":           rtW / 2,
		"p2x":           rtW / 2,
		"scores":        map[string]interface{}{p1ID: 0, p2ID: 0},
		"rally":         0,
		"phase":         "serving",
		"serve_by":      p1ID,
		"win_score":     7,
		"no_walls":      false,
		"pickups":       []interface{}{},
		"active_effect": nil,
	}
}

func (gm *GameManager) processPingPongMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	moveType, _ := moveData["move_type"].(string)
	switch moveType {
	case "state_sync":
		// Real-time relay from P1 (physics authority). In-memory only; no DB write (volatile).
		// balls is relayed as-is — the backend never validates ball physics
		// itself (see the file-level "no authoritative physics server" note),
		// it's purely a pass-through so every other client can render it.
		if v, ok := moveData["balls"].([]interface{}); ok {
			gameState.GameData["balls"] = v
		}
		if v, ok := ppFloat(moveData["p1x"]); ok {
			gameState.GameData["p1x"] = v
		}
		// p1vx: P1's own outgoing paddle velocity, alongside position — lets
		// P2/spectators dead-reckon P1's paddle forward between updates instead
		// of rendering a frozen last-known position (visual smoothness only;
		// P2 never runs collision detection, so this doesn't affect fairness).
		if v, ok := ppFloat(moveData["p1vx"]); ok {
			gameState.GameData["p1vx"] = v
		}
		// Pickups spawn/despawn on P1's own local timer (same self-reporting
		// trust model as ball physics — see the file-level note above) and
		// are relayed wholesale here, replacing the previous list.
		if v, ok := moveData["pickups"].([]interface{}); ok {
			gameState.GameData["pickups"] = v
		}
		return false, nil, nil

	case "paddle_move":
		// P2 sends their paddle X. Relay to everyone. No DB write (volatile).
		if v, ok := ppFloat(moveData["p2x"]); ok {
			gameState.GameData["p2x"] = v
		}
		// p2vx: P2's own outgoing paddle velocity — this one IS collision-
		// critical. P1 (the physics authority) dead-reckons P2's paddle forward
		// from {p2x, p2vx, receipt time} instead of trusting a frozen snapshot,
		// closing most of the gap that let the ball "pass through" a laggy
		// (typically mobile) player's paddle — see PingPongGame.jsx's
		// BASE_HIT_TOLERANCE comment for the full explanation.
		if v, ok := ppFloat(moveData["p2vx"]); ok {
			gameState.GameData["p2vx"] = v
		}
		return false, nil, nil

	case "goal":
		return pingPongGoalHandler(gameState, moveData)

	case "serve":
		return pingPongServeHandler(gameState, playerID)

	case "grab_pickup":
		return pingPongGrabPickupHandler(gameState, moveData)

	case "rt_end":
		return rtEndHandler(gameState)
	}

	return false, nil, fmt.Errorf("unknown ping_pong move type: %s", moveType)
}

// pingPongGoalHandler scores the point. On a non-winning goal, this puts the
// game into "serving" rather than immediately launching a new ball — see the
// comment on pingPongInitialState above for why. air_hockey has its own,
// nearly identical airHockeyGoalHandler (air_hockey.go), kept separate since
// the two games' state layouts differ (balls[] array here vs. flat
// ball_x/y/vx/vy there).
func pingPongGoalHandler(gameState *GameSessionState, moveData map[string]interface{}) (bool, *uint, error) {
	scorerStr, _ := moveData["scorer_id"].(string)
	if scorerStr == "" {
		return false, nil, fmt.Errorf("goal missing scorer_id")
	}

	winScore := ppIntFrom(gameState.GameData["win_score"])
	if winScore == 0 {
		winScore = 7
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

	// Freeze the ball(s) — down to exactly one again, even if multiply-ball
	// was active — and hand serve to the scorer. pingPongServeHandler
	// launches it once they explicitly tap. A goal also clears the table of
	// pickups and ends any active power-up effect — the fresh rally starts
	// on equal footing.
	gameState.GameData["phase"] = "serving"
	gameState.GameData["serve_by"] = scorerStr
	gameState.GameData["balls"] = pingPongSingleBallArray(rtW/2, rtH/2, 0, 0)
	gameState.GameData["pickups"] = []interface{}{}
	gameState.GameData["active_effect"] = nil
	return false, nil, nil
}

// pingPongGrabPickupHandler applies a power-up's effect once P1 (the physics
// authority) reports the ball collided with it. Removing the claimed pickup
// from the table is what makes a duplicate/stale report a safe no-op (an
// already-claimed ID simply won't be found) rather than double-applying or
// re-extending a duration.
func pingPongGrabPickupHandler(gameState *GameSessionState, moveData map[string]interface{}) (bool, *uint, error) {
	pickupID, _ := moveData["pickup_id"].(string)
	effectType, _ := moveData["effect_type"].(string)
	targetPlayer, _ := moveData["target_player"].(string)

	duration, ok := pingPongPickupDurations[effectType]
	if !ok {
		return false, nil, fmt.Errorf("unknown pickup effect type: %s", effectType)
	}
	if targetPlayer == "" {
		return false, nil, fmt.Errorf("grab_pickup missing target_player")
	}

	pickups, _ := gameState.GameData["pickups"].([]interface{})
	remaining := make([]interface{}, 0, len(pickups))
	found := false
	for _, raw := range pickups {
		p, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		if id, _ := p["id"].(string); id == pickupID {
			found = true
			continue
		}
		remaining = append(remaining, p)
	}
	if !found {
		return false, nil, fmt.Errorf("pickup already claimed")
	}
	gameState.GameData["pickups"] = remaining

	// Unconditionally replaces whatever effect was previously active — "a new
	// power always overwrites the old one" is the whole reset rule, and this
	// single-slot design gets it for free with no extra cancellation logic.
	gameState.GameData["active_effect"] = map[string]interface{}{
		"type":          effectType,
		"target_player": targetPlayer,
		"expires_at":    float64(time.Now().UnixMilli() + duration),
	}
	return false, nil, nil
}

// pingPongServeHandler launches the ball when whoever currently has serve
// taps it. Rejects anyone else trying to serve out of turn, and rejects a
// serve when the game isn't actually waiting on one (e.g. a stale/duplicate
// client message arriving after the rally already started).
func pingPongServeHandler(gameState *GameSessionState, playerID uint) (bool, *uint, error) {
	phase, _ := gameState.GameData["phase"].(string)
	if phase != "serving" {
		return false, nil, fmt.Errorf("not awaiting a serve")
	}
	serveBy, _ := gameState.GameData["serve_by"].(string)
	if fmt.Sprintf("%d", playerID) != serveBy {
		return false, nil, fmt.Errorf("not your serve")
	}

	p1ID, _ := gameState.GameData["p1_id"].(string)
	vy := 260.0 // serve toward P2's side (downward)
	if serveBy == p1ID {
		vy = -260.0 // serve toward P1's side (upward)
	}
	gameState.GameData["balls"] = pingPongSingleBallArray(rtW/2, rtH/2, 50.0, vy)
	gameState.GameData["phase"] = "playing"
	return false, nil, nil
}

// rtGoalHandler: immediate-relaunch goal scoring. No longer called by either
// ping_pong or air_hockey — both now use their own goal handler that puts the
// game into an explicit "serving" phase instead of instantly relaunching a
// moving ball/puck (see pingPongGoalHandler/airHockeyGoalHandler). Left in
// place rather than deleted in case a future real-time game wants the
// simpler immediate-relaunch behavior.
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
