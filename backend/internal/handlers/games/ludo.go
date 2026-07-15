package games

import (
	"fmt"
	"math/rand"
)

// Ludo — 2-to-4 player board game with these rules:
//
// 2-player mode: all 4 colors are active on the board.
//   Player 0 controls Red + Yellow, Player 1 controls Blue + Green.
//   This doubles each player's tokens and makes the board feel full.
//
// 3/4-player mode: each player controls one color (unchanged from original).
//
// 2-dice flow:
//   1. "roll_dice" → rolls d1 and d2, stores dice_rolls:[d1,d2] and
//      remaining_moves. If neither die has a legal move, turn passes immediately.
//   2. "move_token" with {color, token_index, die_value} → moves the token,
//      consumes that die. If the second die still has a legal move, same player
//      continues. Otherwise turn passes to the next player.
//      No bonus turns — strict alternation after all dice are used.
//
// Position convention: -1=yard, 0-50=shared track (relative to entry),
// 51-56=home column, 57=finished.

var ludoColors = []string{"red", "blue", "green", "yellow"}

var ludoEntryOffset = map[string]int{"red": 0, "blue": 13, "green": 26, "yellow": 39}

var ludoSafeSquares = map[int]bool{
	0: true, 8: true, 13: true, 21: true,
	26: true, 34: true, 39: true, 47: true,
}

// ludoActiveColors returns all 4 colors for a 2-player game so both players
// have tokens on the full board, or just the first N colors for N>2.
func ludoActiveColors(playerCount int) []string {
	if playerCount == 2 {
		return ludoColors
	}
	return ludoColors[:playerCount]
}

// colorsForPlayer returns the slice of colors that playerIdx controls.
// 2-player: player 0 = red+yellow, player 1 = blue+green.
// 3/4-player: single color per player (unchanged).
func colorsForPlayer(playerIdx, playerCount int) []string {
	if playerCount == 2 {
		switch playerIdx {
		case 0:
			return []string{"red", "yellow"}
		case 1:
			return []string{"blue", "green"}
		}
	}
	if playerIdx >= 0 && playerIdx < len(ludoColors) {
		return []string{ludoColors[playerIdx]}
	}
	return nil
}

// playerForColor returns which player index owns a given color.
func playerForColor(playerCount int, color string) int {
	if playerCount == 2 {
		if color == "red" || color == "yellow" {
			return 0
		}
		if color == "blue" || color == "green" {
			return 1
		}
	}
	for i, c := range ludoColors {
		if c == color {
			return i
		}
	}
	return -1
}

func ludoGlobalSquare(color string, relPos int) int {
	return (ludoEntryOffset[color] + relPos) % 52
}

// ludoInitialBoard creates 4 tokens for each active color.
// For 2-player: all 4 colors; for 3/4-player: first N colors.
func ludoInitialBoard(playerCount int) map[string]interface{} {
	tokens := make(map[string]interface{})
	for _, color := range ludoActiveColors(playerCount) {
		colorTokens := make([]map[string]interface{}, 4)
		for j := 0; j < 4; j++ {
			colorTokens[j] = map[string]interface{}{
				"id":       fmt.Sprintf("%s_%d", color, j),
				"position": -1,
			}
		}
		tokens[color] = colorTokens
	}
	return map[string]interface{}{"tokens": tokens}
}

func ensureLudoDealt(gameState *GameSessionState) {
	if _, ok := gameState.GameData["tokens"]; !ok {
		board := ludoInitialBoard(len(gameState.Players))
		gameState.GameData["tokens"] = board["tokens"]
	}
}

// ludoTokens returns a color's 4 tokens, handling both native and JSON-decoded types.
func ludoTokens(gameState *GameSessionState, color string) ([]map[string]interface{}, error) {
	tokensRaw, ok := gameState.GameData["tokens"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid tokens state")
	}
	colorRaw, ok := tokensRaw[color]
	if !ok {
		return nil, fmt.Errorf("unknown color: %s", color)
	}

	switch v := colorRaw.(type) {
	case []map[string]interface{}:
		return v, nil
	case []interface{}:
		out := make([]map[string]interface{}, len(v))
		for i, t := range v {
			tm, ok := t.(map[string]interface{})
			if !ok {
				return nil, fmt.Errorf("invalid token at index %d", i)
			}
			out[i] = tm
		}
		return out, nil
	default:
		return nil, fmt.Errorf("invalid color token type: %T", colorRaw)
	}
}

func ludoTokenPosition(token map[string]interface{}) int {
	switch v := token["position"].(type) {
	case int:
		return v
	case float64:
		return int(v)
	default:
		return -1
	}
}

func ludoIntField(gameData map[string]interface{}, key string) int {
	switch v := gameData[key].(type) {
	case int:
		return v
	case float64:
		return int(v)
	default:
		return 0
	}
}

// ludoRemainingMoves reads remaining_moves from GameData as []int.
func ludoRemainingMoves(gameState *GameSessionState) []int {
	raw, ok := gameState.GameData["remaining_moves"].([]interface{})
	if !ok {
		return nil
	}
	result := make([]int, 0, len(raw))
	for _, v := range raw {
		switch n := v.(type) {
		case float64:
			result = append(result, int(n))
		case int:
			result = append(result, n)
		}
	}
	return result
}

// ludoHasLegalMove returns true if any token among playerColors can legally
// use dieValue (enter the board on 6, advance, or home column).
func ludoHasLegalMove(gameState *GameSessionState, playerColors []string, dieValue int) bool {
	for _, color := range playerColors {
		tokens, err := ludoTokens(gameState, color)
		if err != nil {
			continue
		}
		for _, t := range tokens {
			pos := ludoTokenPosition(t)
			if pos == -1 && dieValue == 6 {
				return true
			}
			if pos >= 0 && pos+dieValue <= 57 {
				return true
			}
		}
	}
	return false
}

func (gm *GameManager) processLudoMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	ensureLudoDealt(gameState)

	playerIdx := gameState.CurrentTurn
	playerColors := colorsForPlayer(playerIdx, len(gameState.Players))

	switch moveType {
	case "roll_dice":
		return gm.processLudoRoll(gameState, playerIdx, playerColors)
	case "move_token":
		return gm.processLudoTokenMove(gameState, playerIdx, playerColors, moveData)
	default:
		return false, nil, fmt.Errorf("unknown move type: %s", moveType)
	}
}

func (gm *GameManager) processLudoRoll(gameState *GameSessionState, playerIdx int, playerColors []string) (bool, *uint, error) {
	if awaiting, _ := gameState.GameData["awaiting_move"].(bool); awaiting {
		return false, nil, fmt.Errorf("you must move your token before rolling again")
	}

	d1 := rand.Intn(6) + 1
	d2 := rand.Intn(6) + 1
	n := len(gameState.Players)

	gameState.GameData["dice_rolls"] = []interface{}{d1, d2}
	gameState.GameData["last_capture"] = false
	gameState.GameData["last_token_home"] = false

	// Keep BOTH dice regardless of immediate legality — the second die may
	// become legal after the first is used (e.g. 6+3 with tokens in base:
	// the 6 enters a token, then that token can use the 3).
	// Only pass the turn when NEITHER die can do anything.
	hasAnyLegal := ludoHasLegalMove(gameState, playerColors, d1) || ludoHasLegalMove(gameState, playerColors, d2)

	if !hasAnyLegal {
		// No legal move for either die — skip to next player.
		gameState.GameData["remaining_moves"] = []interface{}{}
		gameState.GameData["awaiting_move"] = false
		gameState.CurrentTurn = (gameState.CurrentTurn + 1) % n
		return false, nil, nil
	}

	// Player must now choose a token to move.
	gameState.GameData["remaining_moves"] = []interface{}{d1, d2}
	gameState.GameData["awaiting_move"] = true
	// CurrentTurn unchanged — same player continues to move_token.
	return false, nil, nil
}

func (gm *GameManager) processLudoTokenMove(gameState *GameSessionState, playerIdx int, playerColors []string, moveData map[string]interface{}) (bool, *uint, error) {
	awaiting, _ := gameState.GameData["awaiting_move"].(bool)
	if !awaiting {
		return false, nil, fmt.Errorf("roll the dice first")
	}

	// Validate die_value
	dieValueF, ok := moveData["die_value"].(float64)
	if !ok {
		return false, nil, fmt.Errorf("missing die_value")
	}
	dieValue := int(dieValueF)

	// Validate color
	color, ok := moveData["color"].(string)
	if !ok {
		return false, nil, fmt.Errorf("missing color")
	}
	ownedColor := false
	for _, c := range playerColors {
		if c == color {
			ownedColor = true
			break
		}
	}
	if !ownedColor {
		return false, nil, fmt.Errorf("color %s does not belong to you", color)
	}

	// Validate token_index
	tokenIdxF, ok := moveData["token_index"].(float64)
	if !ok {
		return false, nil, fmt.Errorf("missing token_index")
	}
	tokenIdx := int(tokenIdxF)
	if tokenIdx < 0 || tokenIdx > 3 {
		return false, nil, fmt.Errorf("token_index out of range")
	}

	// Remove one instance of dieValue from remaining_moves.
	remaining := ludoRemainingMoves(gameState)
	consumed := false
	newRemaining := []int{}
	for _, v := range remaining {
		if v == dieValue && !consumed {
			consumed = true
		} else {
			newRemaining = append(newRemaining, v)
		}
	}
	if !consumed {
		return false, nil, fmt.Errorf("die value %d is not in remaining moves", dieValue)
	}

	// Execute the token move.
	tokens, err := ludoTokens(gameState, color)
	if err != nil {
		return false, nil, err
	}
	token := tokens[tokenIdx]
	pos := ludoTokenPosition(token)

	var newPos int
	if pos == -1 {
		if dieValue != 6 {
			return false, nil, fmt.Errorf("need a 6 to leave base")
		}
		newPos = 0
	} else {
		newPos = pos + dieValue
		if newPos > 57 {
			return false, nil, fmt.Errorf("move would overshoot home")
		}
	}

	// Capture: check every opponent token on the same global square.
	captured := false
	if newPos >= 0 && newPos <= 50 {
		globalSq := ludoGlobalSquare(color, newPos)
		if !ludoSafeSquares[globalSq] {
			for _, otherColor := range ludoActiveColors(len(gameState.Players)) {
				isOwnColor := false
				for _, c := range playerColors {
					if c == otherColor {
						isOwnColor = true
						break
					}
				}
				if isOwnColor {
					continue
				}
				otherTokens, terr := ludoTokens(gameState, otherColor)
				if terr != nil {
					continue
				}
				for _, ot := range otherTokens {
					otPos := ludoTokenPosition(ot)
					if otPos >= 0 && otPos <= 50 && ludoGlobalSquare(otherColor, otPos) == globalSq {
						ot["position"] = -1
						captured = true
					}
				}
			}
		}
	}

	token["position"] = newPos
	reachedHome := newPos == 57

	gameState.GameData["last_capture"] = captured
	gameState.GameData["last_token_home"] = reachedHome

	// Win check: ALL tokens across ALL of this player's colors are home.
	allHome := true
	for _, c := range playerColors {
		ts, e := ludoTokens(gameState, c)
		if e != nil {
			allHome = false
			break
		}
		for _, t := range ts {
			if ludoTokenPosition(t) != 57 {
				allHome = false
				break
			}
		}
		if !allHome {
			break
		}
	}
	if allHome {
		winner := gameState.Players[playerIdx].UserID
		return true, &winner, nil
	}

	n := len(gameState.Players)

	// If the second die still has a legal move, same player uses it first.
	if len(newRemaining) > 0 {
		legalRemaining := []int{}
		for _, dv := range newRemaining {
			if ludoHasLegalMove(gameState, playerColors, dv) {
				legalRemaining = append(legalRemaining, dv)
			}
		}
		if len(legalRemaining) > 0 {
			lrm := make([]interface{}, len(legalRemaining))
			for i, v := range legalRemaining {
				lrm[i] = v
			}
			gameState.GameData["remaining_moves"] = lrm
			gameState.GameData["awaiting_move"] = true
			// CurrentTurn unchanged — same player still has a die to play.
			return false, nil, nil
		}
	}

	// All dice consumed (or no remaining die has a legal move) — next player's turn.
	gameState.GameData["remaining_moves"] = []interface{}{}
	gameState.GameData["awaiting_move"] = false
	gameState.CurrentTurn = (gameState.CurrentTurn + 1) % n
	return false, nil, nil
}
