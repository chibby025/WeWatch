package games

import (
	"fmt"
	"math"
	"math/rand"
)

// Curling — strictly 2-player (same hard requirement as Mancala/Backgammon:
// real curling is always a head-to-head sport, and the scoring rule below
// genuinely only makes sense for exactly two competitors), turn-based,
// server-authoritative closed-form scoring — same trust model as Darts/
// Archery Battle (client only sends aim + power-timing, server computes the
// real landing point).
//
// The genuine differentiator from Darts/Archery: curling doesn't score by
// summing points per throw. Real curling scores by ENDS — within an end,
// both players alternate throwing curlingStonesPerEnd stones each at the
// same house; once everyone's thrown their stones for that end, whichever
// player's SINGLE closest stone to the button is nearer than the
// opponent's single closest stone wins the end, scoring one point for
// EVERY one of their own stones that beats the opponent's best stone (a
// real, standard curling rule — you can win an end by more than 1 point).
// After curlingEnds ends, highest cumulative score wins; a tie is a draw.
//
// Unlike Darts/Archery's "3-in-a-row via a turn-cancel decrement trick,"
// curling's turn order is a genuine 1-stone-at-a-time alternation the whole
// way through an end — no decrement trick needed at all, the generic
// "+1 mod N" advance ProcessMove already applies after every move is
// exactly the real alternating-delivery order a real curling end follows.

const curlingEnds = 4
const curlingStonesPerEnd = 4

// House ring boundaries — approximate, normalized so the house's own outer
// edge sits at radius 1.0. Purely a descriptive label for player feedback on
// each individual throw (mirrors darts.go's own "TRIPLE 20"-style label) —
// the REAL score for a whole END is decided by curlingResolveEnd's own
// closest-stone comparison below, never by these ring labels directly.
const (
	curlingButtonR    = 0.08
	curlingFourFootR  = 0.33
	curlingEightFootR = 0.67
	curlingHouseR     = 1.0
)

func curlingRingLabel(x, y float64) string {
	r := math.Hypot(x, y)
	switch {
	case r <= curlingButtonR:
		return "BUTTON"
	case r <= curlingFourFootR:
		return "4-FOOT"
	case r <= curlingEightFootR:
		return "8-FOOT"
	case r <= curlingHouseR:
		return "12-FOOT"
	default:
		return "OUT"
	}
}

// curlingWobble is the identical mechanic to dartsWobble/archeryWobble —
// kept as its own copy so each game's curve can be tuned independently.
func curlingWobble(power float64) (dx, dy float64) {
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

func ensureCurlingState(gameState *GameSessionState) {
	if gameState.GameData["scores"] != nil {
		return
	}
	scores := map[string]interface{}{}
	stonesThisEnd := map[string]interface{}{}
	for _, p := range gameState.Players {
		key := fmt.Sprintf("%d", p.UserID)
		scores[key] = float64(0)
		stonesThisEnd[key] = []interface{}{}
	}
	gameState.GameData["scores"] = scores
	gameState.GameData["current_end"] = float64(1)
	gameState.GameData["stones_this_end"] = stonesThisEnd
	gameState.GameData["last_shot"] = map[string]interface{}{}
}

func (gm *GameManager) processCurlingMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	ensureCurlingState(gameState)

	switch moveType {
	case "throw":
		aimX, _ := moveData["aim_x"].(float64)
		aimY, _ := moveData["aim_y"].(float64)
		power, ok := moveData["power"].(float64)
		if !ok {
			return false, nil, fmt.Errorf("missing power")
		}
		aimR := math.Hypot(aimX, aimY)
		if aimR > 1.15 {
			scale := 1.15 / aimR
			aimX *= scale
			aimY *= scale
		}

		wx, wy := curlingWobble(power)
		landX, landY := aimX+wx, aimY+wy
		label := curlingRingLabel(landX, landY)

		stonesThisEnd, _ := gameState.GameData["stones_this_end"].(map[string]interface{})
		if stonesThisEnd == nil {
			stonesThisEnd = map[string]interface{}{}
		}
		key := fmt.Sprintf("%d", playerID)
		myStonesRaw, _ := stonesThisEnd[key].([]interface{})
		myStonesRaw = append(myStonesRaw, map[string]interface{}{"x": landX, "y": landY})
		stonesThisEnd[key] = myStonesRaw
		gameState.GameData["stones_this_end"] = stonesThisEnd

		gameState.GameData["last_shot"] = map[string]interface{}{
			"player_id": float64(playerID),
			"x":         landX,
			"y":         landY,
			"label":     label,
		}

		totalThrown := 0
		for _, p := range gameState.Players {
			s, _ := stonesThisEnd[fmt.Sprintf("%d", p.UserID)].([]interface{})
			totalThrown += len(s)
		}
		if totalThrown < curlingStonesPerEnd*len(gameState.Players) {
			// End still in progress — the generic "+1 mod N" advance
			// ProcessMove applies after this move is exactly the correct
			// real alternating-delivery order, no override needed.
			return false, nil, nil
		}

		// End complete — resolve scoring, then either start a fresh end or
		// end the game if that was the last one.
		curlingResolveEnd(gameState, stonesThisEnd)

		currentEnd, _ := gameState.GameData["current_end"].(float64)
		currentEnd++
		if currentEnd > float64(curlingEnds) {
			scores, _ := gameState.GameData["scores"].(map[string]interface{})
			return true, curlingWinnerByScore(gameState, scores), nil
		}
		gameState.GameData["current_end"] = currentEnd
		freshStones := map[string]interface{}{}
		for _, p := range gameState.Players {
			freshStones[fmt.Sprintf("%d", p.UserID)] = []interface{}{}
		}
		gameState.GameData["stones_this_end"] = freshStones
		return false, nil, nil

	default:
		return false, nil, fmt.Errorf("unknown curling move type: %s", moveType)
	}
}

// curlingResolveEnd implements the real curling scoring rule: whichever
// player's single closest stone to the button beats the opponent's single
// closest stone scores one point for every one of their OWN stones that is
// also closer than the opponent's best stone. A tie in closest-stone
// distance (float equality — vanishingly rare, but handled explicitly
// rather than left to undefined behavior) awards nobody anything for the
// end, same "no clean winner, no score" spirit as this package's own
// tie-is-a-draw convention elsewhere.
func curlingResolveEnd(gameState *GameSessionState, stonesThisEnd map[string]interface{}) {
	type playerStones struct {
		userID uint
		key    string
		dists  []float64
	}
	var all []playerStones
	for _, p := range gameState.Players {
		key := fmt.Sprintf("%d", p.UserID)
		raw, _ := stonesThisEnd[key].([]interface{})
		var dists []float64
		for _, s := range raw {
			sm, _ := s.(map[string]interface{})
			x, _ := sm["x"].(float64)
			y, _ := sm["y"].(float64)
			dists = append(dists, math.Hypot(x, y))
		}
		all = append(all, playerStones{userID: p.UserID, key: key, dists: dists})
	}
	if len(all) != 2 {
		return // curling is strictly 2-player — nothing sensible to resolve otherwise
	}

	bestOf := func(dists []float64) float64 {
		best := math.Inf(1)
		for _, d := range dists {
			if d < best {
				best = d
			}
		}
		return best
	}

	best0 := bestOf(all[0].dists)
	best1 := bestOf(all[1].dists)
	if best0 == best1 {
		return // exact tie — no points awarded this end
	}

	winner, loserBest := &all[0], best1
	if best1 < best0 {
		winner, loserBest = &all[1], best0
	}

	points := 0
	for _, d := range winner.dists {
		if d < loserBest {
			points++
		}
	}

	scores, _ := gameState.GameData["scores"].(map[string]interface{})
	if scores == nil {
		scores = map[string]interface{}{}
	}
	cur, _ := scores[winner.key].(float64)
	scores[winner.key] = cur + float64(points)
	gameState.GameData["scores"] = scores
}

func curlingWinnerByScore(gameState *GameSessionState, scores map[string]interface{}) *uint {
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
