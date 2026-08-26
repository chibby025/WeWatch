package games

import (
	"fmt"
	"math"
	"math/rand"
)

// Darts — 2-6 players, turn-based, perfect information (no hidden state, so
// no Hands/DrawPile needed — same lazy-init-on-first-move pattern
// tic_tac_toe/othello/checkers already use, since GameData starts as a
// fresh empty map at game creation and initializeGameState's return only
// ever reaches the DB-persisted snapshot, not this runtime map).
//
// Format: each player throws 3 darts per turn, for dartsRounds rounds
// (9 darts total per player) — a simple "count up" scoring format,
// deliberately not the full "501/301 count-down with an exact-double
// checkout" ruleset, which needs bust/checkout logic on top of this same
// scoring engine. Highest cumulative score after all rounds wins; a tie is
// a draw, same convention every other game in this package uses.
//
// Scoring is server-authoritative: the client only ever sends where it
// AIMED and how well-timed its power meter was — the server (not the
// client) computes the real landing point (aim + a wobble offset scaled by
// how far off the ideal power window the throw was) and derives the score
// from a real, standard dartboard layout. Nothing about the score is ever
// trusted from the client.

const dartsRounds = 3
const dartsPerTurn = 3

// Standard dartboard sector numbers, clockwise starting at 12 o'clock (top).
var dartsSectorOrder = [20]int{20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5}

// Ring radii, normalized so the board's outer edge = 1.0 — real dartboard
// proportions (170mm outer edge, 162/170mm double ring, 99/107mm triple
// ring, 15.9mm outer bull, 6.35mm inner bull).
const (
	dartsInnerBullR  = 6.35 / 170.0
	dartsOuterBullR  = 15.9 / 170.0
	dartsTripleInner = 99.0 / 170.0
	dartsTripleOuter = 107.0 / 170.0
	dartsDoubleInner = 162.0 / 170.0
	dartsDoubleOuter = 1.0
)

// dartsScoreAt computes the real dartboard score + a short display label for
// a landing point (x,y), normalized so the board's outer edge is radius 1.0
// and (0,0) is dead center.
func dartsScoreAt(x, y float64) (score int, label string) {
	r := math.Sqrt(x*x + y*y)
	if r > dartsDoubleOuter {
		return 0, "MISS"
	}
	if r <= dartsInnerBullR {
		return 50, "BULLSEYE"
	}
	if r <= dartsOuterBullR {
		return 25, "OUTER BULL"
	}

	angleFromTop := math.Atan2(x, y)
	if angleFromTop < 0 {
		angleFromTop += 2 * math.Pi
	}
	sectorWidth := 2 * math.Pi / 20
	sectorIdx := int(math.Floor((angleFromTop+sectorWidth/2)/sectorWidth)) % 20
	sectorNum := dartsSectorOrder[sectorIdx]

	switch {
	case r >= dartsTripleInner && r <= dartsTripleOuter:
		return sectorNum * 3, fmt.Sprintf("TRIPLE %d", sectorNum)
	case r >= dartsDoubleInner && r <= dartsDoubleOuter:
		return sectorNum * 2, fmt.Sprintf("DOUBLE %d", sectorNum)
	default:
		return sectorNum, fmt.Sprintf("%d", sectorNum)
	}
}

// dartsWobble converts a power value (0-1, how well-timed the throw's power
// meter was) into a random landing offset — a classic golf/archery-style
// skill mechanic: a well-timed throw (power near 1.0) lands almost exactly
// on the aim point; a poorly-timed one wobbles further off it.
func dartsWobble(power float64) (dx, dy float64) {
	if power > 1 {
		power = 1
	}
	if power < 0 {
		power = 0
	}
	// Max wobble radius shrinks from a generous 0.35 (board-radius units) at
	// power=0 down to a tight 0.02 at power=1 — even a "perfect" throw keeps
	// a small amount of human wobble rather than being laser-precise.
	maxWobble := 0.35*(1-power) + 0.02
	angle := rand.Float64() * 2 * math.Pi
	radius := rand.Float64() * maxWobble
	return math.Cos(angle) * radius, math.Sin(angle) * radius
}

func ensureDartsState(gameState *GameSessionState) {
	if gameState.GameData["scores"] != nil {
		return
	}
	scores := map[string]interface{}{}
	for _, p := range gameState.Players {
		scores[fmt.Sprintf("%d", p.UserID)] = float64(0)
	}
	gameState.GameData["scores"] = scores
	gameState.GameData["current_round"] = float64(1)
	gameState.GameData["darts_this_turn"] = float64(0)
	gameState.GameData["current_throws"] = []interface{}{} // this turn's darts, for rendering
	gameState.GameData["last_throw"] = map[string]interface{}{}
}

func (gm *GameManager) processDartsMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	ensureDartsState(gameState)

	switch moveType {
	case "throw":
		aimX, _ := moveData["aim_x"].(float64)
		aimY, _ := moveData["aim_y"].(float64)
		power, ok := moveData["power"].(float64)
		if !ok {
			return false, nil, fmt.Errorf("missing power")
		}
		// Clamp the aim point itself to the board before wobbling — a wildly
		// out-of-range aim_x/aim_y from a malicious client shouldn't be able
		// to do anything a real player couldn't (aiming off the visible board).
		aimR := math.Sqrt(aimX*aimX + aimY*aimY)
		if aimR > 1.15 {
			scale := 1.15 / aimR
			aimX *= scale
			aimY *= scale
		}

		wx, wy := dartsWobble(power)
		landX, landY := aimX+wx, aimY+wy
		score, label := dartsScoreAt(landX, landY)

		scores, _ := gameState.GameData["scores"].(map[string]interface{})
		if scores == nil {
			scores = map[string]interface{}{}
		}
		key := fmt.Sprintf("%d", playerID)
		cur, _ := scores[key].(float64)
		scores[key] = cur + float64(score)
		gameState.GameData["scores"] = scores

		dartsThisTurn, _ := gameState.GameData["darts_this_turn"].(float64)
		dartsThisTurn++

		throwRecord := map[string]interface{}{
			"player_id": float64(playerID),
			"x":         landX,
			"y":         landY,
			"score":     float64(score),
			"label":     label,
		}
		gameState.GameData["last_throw"] = throwRecord

		if dartsThisTurn >= dartsPerTurn {
			// Turn over — clear the visible in-progress darts for the next
			// thrower and let ProcessMove's generic "+1 mod N" advance the
			// turn normally (no decrement-trick cancellation needed here,
			// unlike darts 1-2 of a turn below).
			gameState.GameData["darts_this_turn"] = float64(0)
			gameState.GameData["current_throws"] = []interface{}{}

			isLastPlayer := gameState.CurrentTurn == len(gameState.Players)-1
			if isLastPlayer {
				currentRound, _ := gameState.GameData["current_round"].(float64)
				currentRound++
				if currentRound > float64(dartsRounds) {
					// Game over — highest cumulative score wins; a tie is a draw.
					return true, dartsWinnerByScore(gameState, scores), nil
				}
				gameState.GameData["current_round"] = currentRound
			}
			return false, nil, nil
		}

		// Darts 1-2 of a turn: same player throws again. Cancel the generic
		// "+1 mod N" advance ProcessMove applies after every successful
		// move — same decrement trick othello/ludo/snakes_ladders/dominoes
		// already use for their own "same player continues" cases.
		currentThrows, _ := gameState.GameData["current_throws"].([]interface{})
		currentThrows = append(currentThrows, throwRecord)
		gameState.GameData["current_throws"] = currentThrows
		gameState.GameData["darts_this_turn"] = dartsThisTurn
		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil

	default:
		return false, nil, fmt.Errorf("unknown darts move type: %s", moveType)
	}
}

func dartsWinnerByScore(gameState *GameSessionState, scores map[string]interface{}) *uint {
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
