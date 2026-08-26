package games

import (
	"fmt"
	"math"
	"math/rand"
)

// Archery Battle — 2-6 players, turn-based, perfect information. Same
// server-authoritative "client only sends aim + power-timing, server
// computes the real landing point and score" trust model as Darts
// (darts.go), and reuses that exact same turn-structure (dartsRounds-style
// N rounds of dartsPerTurn-style M arrows each, self-cancelling turn advance
// for arrows within a turn, generic advance for the last one) — the two
// games share enough of their skeleton that this is deliberately a close
// sibling implementation, not a from-scratch design.
//
// The one genuine mechanical differentiator from Darts: a per-ROUND WIND
// value, randomly rolled once at the start of each round and shown to every
// player before they shoot, that pushes every arrow's landing point
// sideways by a fixed amount. Reading the wind and aiming to compensate for
// it is the actual skill test here — Darts has no equivalent, since a real
// dartboard throw has no wind to fight. All players in a given round face
// the identical wind value, so it's fair (same conditions for everyone),
// mirroring how a real archery/golf tournament round shares one weather
// condition across every competitor.

const archeryRounds = 3
const archeryArrowsPerTurn = 3
const archeryWindStrength = 0.22 // max horizontal push, in the same 0-1 target-radius units the target/aim coordinates use

// archeryScoreAt mirrors a real World Archery 10-ring target face: 10
// concentric bands from the center (gold, 10 points) out to the outermost
// white ring (1 point); anything beyond the target face entirely scores 0.
// Coordinates are normalized so the target's own outer edge sits at
// radius 1.0, band width is a uniform 1/10th of that radius each.
func archeryScoreAt(x, y float64) int {
	r := math.Hypot(x, y)
	if r > 1.0 {
		return 0
	}
	ring := int(math.Ceil(r * 10))
	if ring < 1 {
		ring = 1
	}
	if ring > 10 {
		ring = 10
	}
	return 11 - ring
}

// archeryWobble is the identical mechanic to dartsWobble (darts.go) — an
// imperfectly-timed power-charge release wobbles the shot off the intended
// aim point, tightening toward near-zero as power approaches 1.0. Kept as
// its own copy (not a shared helper) since the two games' wobble curves are
// each free to be tuned independently later without affecting the other —
// they happen to start out identical, not because they're required to stay
// that way.
func archeryWobble(power float64) (dx, dy float64) {
	if power > 1 {
		power = 1
	}
	if power < 0 {
		power = 0
	}
	maxWobble := 0.35*(1-power) + 0.02
	angle := rand.Float64() * 2 * math.Pi
	radius := rand.Float64() * maxWobble
	return math.Cos(angle) * radius, math.Sin(angle) * radius
}

// archeryRollWind picks a new random wind value in [-1, 1] — sign is
// direction (negative = pushes shots left, positive = pushes shots right),
// magnitude is how strong. Multiplied by archeryWindStrength when actually
// applied to a landing point.
func archeryRollWind() float64 {
	return rand.Float64()*2 - 1
}

func ensureArcheryState(gameState *GameSessionState) {
	if gameState.GameData["scores"] != nil {
		return
	}
	scores := map[string]interface{}{}
	for _, p := range gameState.Players {
		scores[fmt.Sprintf("%d", p.UserID)] = float64(0)
	}
	gameState.GameData["scores"] = scores
	gameState.GameData["current_round"] = float64(1)
	gameState.GameData["arrows_this_turn"] = float64(0)
	gameState.GameData["current_shots"] = []interface{}{} // this turn's arrows, for rendering
	gameState.GameData["last_shot"] = map[string]interface{}{}
	gameState.GameData["wind"] = archeryRollWind()
}

func (gm *GameManager) processArcheryMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	ensureArcheryState(gameState)

	switch moveType {
	case "shoot":
		aimX, _ := moveData["aim_x"].(float64)
		aimY, _ := moveData["aim_y"].(float64)
		power, ok := moveData["power"].(float64)
		if !ok {
			return false, nil, fmt.Errorf("missing power")
		}
		// Clamp the aim point itself before wobbling/wind — a wildly
		// out-of-range aim from a malicious client shouldn't do anything a
		// real player couldn't (aiming off the visible target).
		aimR := math.Hypot(aimX, aimY)
		if aimR > 1.15 {
			scale := 1.15 / aimR
			aimX *= scale
			aimY *= scale
		}

		wind, _ := gameState.GameData["wind"].(float64)
		wx, wy := archeryWobble(power)
		landX := aimX + wx + wind*archeryWindStrength
		landY := aimY + wy
		score := archeryScoreAt(landX, landY)

		scores, _ := gameState.GameData["scores"].(map[string]interface{})
		if scores == nil {
			scores = map[string]interface{}{}
		}
		key := fmt.Sprintf("%d", playerID)
		cur, _ := scores[key].(float64)
		scores[key] = cur + float64(score)
		gameState.GameData["scores"] = scores

		arrowsThisTurn, _ := gameState.GameData["arrows_this_turn"].(float64)
		arrowsThisTurn++

		shotRecord := map[string]interface{}{
			"player_id": float64(playerID),
			"x":         landX,
			"y":         landY,
			"score":     float64(score),
			"wind":      wind,
		}
		gameState.GameData["last_shot"] = shotRecord

		if arrowsThisTurn >= archeryArrowsPerTurn {
			// Turn over — clear the visible in-progress arrows for the next
			// shooter and let ProcessMove's generic "+1 mod N" advance the
			// turn normally (no decrement-trick cancellation here, same as
			// Darts' own last-dart-of-a-turn branch).
			gameState.GameData["arrows_this_turn"] = float64(0)
			gameState.GameData["current_shots"] = []interface{}{}

			isLastPlayer := gameState.CurrentTurn == len(gameState.Players)-1
			if isLastPlayer {
				currentRound, _ := gameState.GameData["current_round"].(float64)
				currentRound++
				if currentRound > float64(archeryRounds) {
					// Game over — highest cumulative score wins; a tie is a draw.
					return true, archeryWinnerByScore(gameState, scores), nil
				}
				gameState.GameData["current_round"] = currentRound
				// Fresh wind for the new round — same condition for every
				// player in it, rolled once here rather than per-arrow.
				gameState.GameData["wind"] = archeryRollWind()
			}
			return false, nil, nil
		}

		// Arrows 1-2 of a turn: same player shoots again. Cancel the generic
		// "+1 mod N" advance ProcessMove applies after every successful
		// move — same decrement trick Darts/Othello/Ludo/Snakes&Ladders/
		// Dominoes already use for their own "same player continues" cases.
		currentShots, _ := gameState.GameData["current_shots"].([]interface{})
		currentShots = append(currentShots, shotRecord)
		gameState.GameData["current_shots"] = currentShots
		gameState.GameData["arrows_this_turn"] = arrowsThisTurn
		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil

	default:
		return false, nil, fmt.Errorf("unknown archery move type: %s", moveType)
	}
}

func archeryWinnerByScore(gameState *GameSessionState, scores map[string]interface{}) *uint {
	best := -1.0
	var bestID uint
	tied := false
	for _, p := range gameState.Players {
		s, _ := scores[fmt.Sprintf("%d", p.UserID)].(float64)
		if s > best {
			best = s
			bestID = p.UserID
			tied = false
		} else if s == best {
			tied = true
		}
	}
	if tied || best < 0 {
		return nil
	}
	return &bestID
}
