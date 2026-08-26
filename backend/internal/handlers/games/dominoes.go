package games

import (
	"fmt"
	"strconv"
	"strings"
)

// Dominoes — standard double-six Block/Draw rules, 2-4 players. Hidden
// information (each player's hand, the boneyard draw order) lives on
// GameSessionState.Hands/DrawPile — deliberately kept OFF GameData and never
// touch a room-wide broadcast, same architecture Crazy Eights already
// established for exactly this problem. Only non-revealing derivatives
// (hand_counts, draw_pile_count) are mirrored into GameData.
//
// Tiles are encoded as plain "a-b" strings with a<=b (e.g. "0-0", "3-5",
// "6-6") — the tile's stable identity, same "cards are plain strings"
// convention cards.go/othello.go/checkers.go already use for their own board
// cells. Orientation (which pip value faces which direction once actually
// placed in the chain) is a separate, derived concept computed at play time —
// see dominoOrientForEnd.

const dominoesHandSize = 7

// dominoAllTiles returns the 28 unique tiles of a double-six set.
func dominoAllTiles() []string {
	tiles := make([]string, 0, 28)
	for a := 0; a <= 6; a++ {
		for b := a; b <= 6; b++ {
			tiles = append(tiles, fmt.Sprintf("%d-%d", a, b))
		}
	}
	return tiles
}

// dominoParseTile splits "a-b" into its two pip values. Malformed input
// (should never happen — every tile string either came from dominoAllTiles
// or was validated as a real hand entry before reaching here) parses to 0,0
// rather than panicking.
func dominoParseTile(t string) (int, int) {
	parts := strings.SplitN(t, "-", 2)
	if len(parts) != 2 {
		return 0, 0
	}
	a, _ := strconv.Atoi(parts[0])
	b, _ := strconv.Atoi(parts[1])
	return a, b
}

func dominoTilePips(t string) int {
	a, b := dominoParseTile(t)
	return a + b
}

// dealDominoes shuffles a fresh set, deals dominoesHandSize tiles to each
// player, and determines who opens (the highest double anyone holds — a
// real, well-known rule; if nobody has any double, the seat-0 player opens
// with any tile instead). Called once, directly from StartGame — like every
// other hidden-hand game here, players need to see their hand from the very
// first moment, before anyone has moved.
func dealDominoes(gameState *GameSessionState) {
	tiles := dominoAllTiles()
	ShuffleDeck(tiles)

	hands := make(map[uint][]string, len(gameState.Players))
	for _, p := range gameState.Players {
		n := dominoesHandSize
		if len(tiles) < n {
			n = len(tiles)
		}
		hands[p.UserID] = append([]string{}, tiles[:n]...)
		tiles = tiles[n:]
	}

	openingTile := ""
	openingPlayerIdx := 0
	bestDouble := -1
	for idx, p := range gameState.Players {
		for _, t := range hands[p.UserID] {
			a, b := dominoParseTile(t)
			if a == b && a > bestDouble {
				bestDouble = a
				openingTile = t
				openingPlayerIdx = idx
			}
		}
	}

	gameState.Hands = hands
	gameState.DrawPile = tiles
	gameState.GameData["chain"] = []interface{}{}
	gameState.GameData["left_end"] = float64(-1)
	gameState.GameData["right_end"] = float64(-1)
	gameState.GameData["opening_tile"] = openingTile
	gameState.GameData["last_move"] = map[string]interface{}{}
	gameState.CurrentTurn = openingPlayerIdx

	syncDominoesPublicState(gameState)
}

// ensureDominoesDealt mirrors ensureCrazyEightsDealt's defensive fallback —
// Hands is always populated by dealDominoes at StartGame time in normal
// operation, but this guards against any path that reaches a move without it.
func ensureDominoesDealt(gameState *GameSessionState) {
	if gameState.Hands == nil {
		dealDominoes(gameState)
	}
}

func syncDominoesPublicState(gameState *GameSessionState) {
	handCounts := make(map[string]int, len(gameState.Hands))
	for _, p := range gameState.Players {
		handCounts[fmt.Sprintf("%d", p.UserID)] = len(gameState.Hands[p.UserID])
	}
	gameState.GameData["hand_counts"] = handCounts
	gameState.GameData["draw_pile_count"] = len(gameState.DrawPile)
}

func dominoGetEnd(gameState *GameSessionState, key string) int {
	switch v := gameState.GameData[key].(type) {
	case float64:
		return int(v)
	case int:
		return v
	default:
		return -1
	}
}

// dominoOrientForEnd computes the {left,right} pip values for placing tile
// (a,b) against the chain's existing end value endValue, extending on the
// given side ("left" or "right"), plus the newly-exposed end value on the
// tile's OUTER side. Caller must already have confirmed a==endValue ||
// b==endValue.
func dominoOrientForEnd(a, b, endValue int, side string) (left, right, newEnd int) {
	if side == "right" {
		if a == endValue {
			return a, b, b
		}
		return b, a, a
	}
	// side == "left": the tile's RIGHT-facing side must touch the existing
	// left end, so the LEFT-facing side becomes the new, further-out end.
	if a == endValue {
		return b, a, b
	}
	return a, b, a
}

func dominoHandHasPlayableTile(hand []string, leftEnd, rightEnd int) bool {
	for _, t := range hand {
		a, b := dominoParseTile(t)
		if a == leftEnd || b == leftEnd || a == rightEnd || b == rightEnd {
			return true
		}
	}
	return false
}

// dominoAnyPlayerHasMove scans every player's hand (not just the current
// player's) against the current fixed ends — used to detect a permanently
// blocked game the instant it happens, rather than waiting for a full round
// of passes. If the board's ends can't change (no move is possible right
// now) and the boneyard is empty (no move will ever become possible either),
// the game is provably over at that exact moment.
func dominoAnyPlayerHasMove(gameState *GameSessionState, leftEnd, rightEnd int) bool {
	for _, p := range gameState.Players {
		if dominoHandHasPlayableTile(gameState.Hands[p.UserID], leftEnd, rightEnd) {
			return true
		}
	}
	return false
}

// dominoScoreByPips resolves a blocked game: lowest total remaining pip
// count wins. A tie for lowest (including an all-tied field) is a draw —
// nil winner, same convention every other game here uses for a tie.
func dominoScoreByPips(gameState *GameSessionState) *uint {
	best := -1
	var bestID uint
	tied := false
	for _, p := range gameState.Players {
		total := 0
		for _, t := range gameState.Hands[p.UserID] {
			total += dominoTilePips(t)
		}
		if best == -1 || total < best {
			best = total
			bestID = p.UserID
			tied = false
		} else if total == best {
			tied = true
		}
	}
	if tied || best == -1 {
		return nil
	}
	return &bestID
}

func (gm *GameManager) processDominoesMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	ensureDominoesDealt(gameState)

	switch moveType {
	case "play":
		tile, ok := moveData["tile"].(string)
		if !ok || tile == "" {
			return false, nil, fmt.Errorf("missing tile")
		}
		hand := gameState.Hands[playerID]
		idx := -1
		for i, t := range hand {
			if t == tile {
				idx = i
				break
			}
		}
		if idx == -1 {
			return false, nil, fmt.Errorf("you don't have that tile")
		}

		a, b := dominoParseTile(tile)
		leftEnd := dominoGetEnd(gameState, "left_end")
		rightEnd := dominoGetEnd(gameState, "right_end")

		chainArr, _ := gameState.GameData["chain"].([]interface{})
		var placedLeft, placedRight, newLeftEnd, newRightEnd int
		var endUsed string

		if len(chainArr) == 0 {
			openingTile, _ := gameState.GameData["opening_tile"].(string)
			if openingTile != "" && tile != openingTile {
				return false, nil, fmt.Errorf("you must open with your highest double (%s)", openingTile)
			}
			placedLeft, placedRight = a, b
			newLeftEnd, newRightEnd = a, b
			endUsed = "open"
		} else {
			end, _ := moveData["end"].(string)
			if end != "left" && end != "right" {
				return false, nil, fmt.Errorf("end must be \"left\" or \"right\"")
			}
			endValue := leftEnd
			if end == "right" {
				endValue = rightEnd
			}
			if a != endValue && b != endValue {
				return false, nil, fmt.Errorf("tile doesn't match that end")
			}
			placedLeft, placedRight, _ = dominoOrientForEnd(a, b, endValue, end)
			if end == "left" {
				newLeftEnd = placedLeft
				newRightEnd = rightEnd
			} else {
				newLeftEnd = leftEnd
				newRightEnd = placedRight
			}
			endUsed = end
		}

		hand = append(hand[:idx], hand[idx+1:]...)
		gameState.Hands[playerID] = hand
		chainArr = append(chainArr, map[string]interface{}{
			"left":  float64(placedLeft),
			"right": float64(placedRight),
		})
		gameState.GameData["chain"] = chainArr
		gameState.GameData["left_end"] = float64(newLeftEnd)
		gameState.GameData["right_end"] = float64(newRightEnd)
		gameState.GameData["last_move"] = map[string]interface{}{
			"player_id": float64(playerID),
			"action":    "play",
			"tile":      tile,
			"end":       endUsed,
		}
		syncDominoesPublicState(gameState)

		if len(hand) == 0 {
			winner := playerID
			return true, &winner, nil
		}
		return false, nil, nil

	case "draw":
		leftEnd := dominoGetEnd(gameState, "left_end")
		rightEnd := dominoGetEnd(gameState, "right_end")
		chainArr, _ := gameState.GameData["chain"].([]interface{})
		if len(chainArr) == 0 {
			return false, nil, fmt.Errorf("you must play the opening tile")
		}
		if dominoHandHasPlayableTile(gameState.Hands[playerID], leftEnd, rightEnd) {
			return false, nil, fmt.Errorf("you have a playable tile — you can't draw")
		}
		if len(gameState.DrawPile) == 0 {
			return false, nil, fmt.Errorf("no tiles left to draw — you must pass")
		}
		last := len(gameState.DrawPile) - 1
		drawn := gameState.DrawPile[last]
		gameState.DrawPile = gameState.DrawPile[:last]
		gameState.Hands[playerID] = append(gameState.Hands[playerID], drawn)
		gameState.GameData["last_move"] = map[string]interface{}{
			"player_id": float64(playerID),
			"action":    "draw",
		}
		syncDominoesPublicState(gameState)

		// Cancel the generic "+1 mod N" turn advance ProcessMove applies after
		// every successful move — drawing doesn't end your turn, you check
		// your hand again and either play or draw once more. Same decrement
		// trick Othello/Ludo/Snakes & Ladders already use for their own
		// "same player continues" cases.
		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil

	case "pass":
		leftEnd := dominoGetEnd(gameState, "left_end")
		rightEnd := dominoGetEnd(gameState, "right_end")
		chainArr, _ := gameState.GameData["chain"].([]interface{})
		if len(chainArr) == 0 {
			return false, nil, fmt.Errorf("you must play the opening tile")
		}
		if dominoHandHasPlayableTile(gameState.Hands[playerID], leftEnd, rightEnd) {
			return false, nil, fmt.Errorf("you have a playable tile — you can't pass")
		}
		if len(gameState.DrawPile) > 0 {
			return false, nil, fmt.Errorf("you must draw before you can pass")
		}
		gameState.GameData["last_move"] = map[string]interface{}{
			"player_id": float64(playerID),
			"action":    "pass",
		}

		// A pass is only reachable with an empty boneyard (checked above) — so
		// if NOBODY, anywhere, currently has a tile matching either fixed end,
		// the board can never change again (no future move is possible until
		// someone plays, and nobody can) and the game is provably, permanently
		// blocked right now. Resolve it immediately rather than waiting for a
		// full round of passes to confirm the same conclusion.
		if !dominoAnyPlayerHasMove(gameState, leftEnd, rightEnd) {
			winner := dominoScoreByPips(gameState)
			return true, winner, nil
		}
		return false, nil, nil

	default:
		return false, nil, fmt.Errorf("unknown dominoes move type: %s", moveType)
	}
}
