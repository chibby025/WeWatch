package games

import (
	"fmt"
	"math/rand"
)

// Backgammon: classic 2-player race game. No trademark concerns (unlike
// Scrabble/Wordsmith) — it's an ancient, generic game name. Per explicit
// product decision: no doubling cube (this game has no betting/stakes to
// multiply — same simplification precedent as Blackjack dropping betting
// entirely) and "relaxed" dice usage (a player may use 1+ of their rolled
// dice in any order and choose to stop even with a legal move still
// available, rather than official tournament rules' strict "must maximize
// dice used, including checking alternate orders" requirement).
//
// Fully perfect-information — no hidden state, no Hands/private-rack
// machinery needed (unlike Wordsmith/Uno/Crazy Eights).
//
// Board representation: GameData["board"] is a 24-entry []interface{},
// index i = point (i+1). A positive value = White checker count on that
// point; negative = Black checker count; 0 = empty. Player index 0 is
// always White (moves 24→1, home board 1-6, bears off past 0). Player
// index 1 is always Black (moves 1→24, home board 19-24, bears off past
// 25) — standard backgammon numbering, chosen specifically so this stays
// directly comparable to reference implementations/rules text if the logic
// ever needs re-checking.
//
// "from" in a move is 0 for the bar, or 1-24 for a board point.
//
// move_types:
//   roll  {}                     — roll the dice for your turn.
//   move  { from: int, die: int } — move one checker using one die.
//   pass  {}                      — end your turn early (only after rolling).

const backgammonPoints = 24
const backgammonCheckersPerPlayer = 15

func backgammonInitialBoard() []interface{} {
	board := make([]interface{}, backgammonPoints)
	for i := range board {
		board[i] = 0
	}
	board[24-1] = 2  // White: point 24
	board[13-1] = 5  // White: point 13
	board[8-1] = 3   // White: point 8
	board[6-1] = 5   // White: point 6
	board[1-1] = -2  // Black: point 1
	board[12-1] = -5 // Black: point 12
	board[17-1] = -3 // Black: point 17
	board[19-1] = -5 // Black: point 19
	return board
}

func ensureBackgammonState(gameState *GameSessionState) {
	if _, ok := gameState.GameData["board"]; ok {
		return
	}
	gameState.GameData["board"] = backgammonInitialBoard()
	gameState.GameData["bar"] = map[string]interface{}{"0": 0, "1": 0}
	gameState.GameData["borne_off"] = map[string]interface{}{"0": 0, "1": 0}
	gameState.GameData["dice"] = []interface{}{}
	gameState.GameData["remaining_dice"] = []interface{}{}
	gameState.GameData["awaiting_roll"] = true
}

func backgammonBoard(gameState *GameSessionState) []interface{} {
	raw := gameState.GameData["board"]
	if b, ok := raw.([]interface{}); ok {
		return b
	}
	return backgammonInitialBoard()
}

func backgammonIntMapField(gameData map[string]interface{}, key, subkey string) int {
	m, ok := gameData[key].(map[string]interface{})
	if !ok {
		return 0
	}
	switch v := m[subkey].(type) {
	case int:
		return v
	case float64:
		return int(v)
	default:
		return 0
	}
}

func backgammonSetIntMapField(gameData map[string]interface{}, key, subkey string, value int) {
	m, ok := gameData[key].(map[string]interface{})
	if !ok {
		m = map[string]interface{}{}
	}
	m[subkey] = value
	gameData[key] = m
}

func backgammonIntSlice(raw interface{}) []int {
	arr, ok := raw.([]interface{})
	if !ok {
		return nil
	}
	out := make([]int, 0, len(arr))
	for _, v := range arr {
		switch n := v.(type) {
		case float64:
			out = append(out, int(n))
		case int:
			out = append(out, n)
		}
	}
	return out
}

func backgammonToInterfaceSlice(ints []int) []interface{} {
	out := make([]interface{}, len(ints))
	for i, v := range ints {
		out[i] = v
	}
	return out
}

// backgammonPointOwner returns (owner, count) for a 1-24 board point.
// owner is 0 (White), 1 (Black), or -1 (empty).
func backgammonPointOwner(board []interface{}, point int) (int, int) {
	v := 0
	switch n := board[point-1].(type) {
	case int:
		v = n
	case float64:
		v = int(n)
	}
	if v > 0 {
		return 0, v
	}
	if v < 0 {
		return 1, -v
	}
	return -1, 0
}

func backgammonDirection(playerIdx int) int {
	if playerIdx == 0 {
		return -1
	}
	return 1
}

// backgammonTarget computes the raw target position for a move — may be
// <= 0 (White bearing off) or >= 25 (Black bearing off); callers must check.
func backgammonTarget(playerIdx, from, die int) int {
	if playerIdx == 0 {
		if from == 0 { // entering from the bar
			return 25 - die
		}
		return from - die
	}
	if from == 0 {
		return die
	}
	return from + die
}

// backgammonAllCheckersInHome reports whether playerIdx has every checker
// (none on the bar, none outside their home board) ready to bear off.
func backgammonAllCheckersInHome(gameState *GameSessionState, playerIdx int) bool {
	if backgammonIntMapField(gameState.GameData, "bar", fmt.Sprintf("%d", playerIdx)) > 0 {
		return false
	}
	board := backgammonBoard(gameState)
	for point := 1; point <= backgammonPoints; point++ {
		owner, _ := backgammonPointOwner(board, point)
		if owner != playerIdx {
			continue
		}
		if playerIdx == 0 && point > 6 {
			return false
		}
		if playerIdx == 1 && point < 19 {
			return false
		}
	}
	return true
}

// backgammonDistanceToOff returns how many pips playerIdx's checker on
// `point` needs to bear off exactly.
func backgammonDistanceToOff(playerIdx, point int) int {
	if playerIdx == 0 {
		return point
	}
	return 25 - point
}

// backgammonIsFurthestBack reports whether `point` holds playerIdx's
// furthest-from-home checker — the only case where an oversized die is
// allowed to bear it off.
func backgammonIsFurthestBack(gameState *GameSessionState, playerIdx, point int) bool {
	board := backgammonBoard(gameState)
	dist := backgammonDistanceToOff(playerIdx, point)
	for p := 1; p <= backgammonPoints; p++ {
		owner, _ := backgammonPointOwner(board, p)
		if owner != playerIdx {
			continue
		}
		if backgammonDistanceToOff(playerIdx, p) > dist {
			return false
		}
	}
	return true
}

// backgammonCanMove reports whether playerIdx may legally move a checker
// from `from` (0 = bar, 1-24 = point) using `die`.
func backgammonCanMove(gameState *GameSessionState, playerIdx, from, die int) bool {
	barCount := backgammonIntMapField(gameState.GameData, "bar", fmt.Sprintf("%d", playerIdx))
	if barCount > 0 && from != 0 {
		return false // must enter every checker from the bar first
	}
	if from != 0 {
		board := backgammonBoard(gameState)
		owner, count := backgammonPointOwner(board, from)
		if owner != playerIdx || count == 0 {
			return false
		}
	}

	target := backgammonTarget(playerIdx, from, die)
	bearingOff := (playerIdx == 0 && target <= 0) || (playerIdx == 1 && target >= 25)
	if bearingOff {
		if !backgammonAllCheckersInHome(gameState, playerIdx) {
			return false
		}
		point := from
		dist := backgammonDistanceToOff(playerIdx, point)
		if die == dist {
			return true
		}
		if die > dist {
			return backgammonIsFurthestBack(gameState, playerIdx, point)
		}
		return false
	}

	board := backgammonBoard(gameState)
	owner, count := backgammonPointOwner(board, target)
	if owner == -1 || owner == playerIdx {
		return true
	}
	return count <= 1 // exactly one opponent checker = legal (hits it)
}

// backgammonHasAnyLegalMove checks every possible (from, die) combination
// for playerIdx against the currently unconsumed dice.
func backgammonHasAnyLegalMove(gameState *GameSessionState, playerIdx int) bool {
	dice := backgammonIntSlice(gameState.GameData["remaining_dice"])
	distinctDice := map[int]bool{}
	for _, d := range dice {
		distinctDice[d] = true
	}
	barCount := backgammonIntMapField(gameState.GameData, "bar", fmt.Sprintf("%d", playerIdx))
	for die := range distinctDice {
		if barCount > 0 {
			if backgammonCanMove(gameState, playerIdx, 0, die) {
				return true
			}
			continue
		}
		board := backgammonBoard(gameState)
		for point := 1; point <= backgammonPoints; point++ {
			owner, _ := backgammonPointOwner(board, point)
			if owner != playerIdx {
				continue
			}
			if backgammonCanMove(gameState, playerIdx, point, die) {
				return true
			}
		}
	}
	return false
}

func (gm *GameManager) processBackgammonMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (bool, *uint, error) {
	ensureBackgammonState(gameState)

	playerIdx := -1
	for i, p := range gameState.Players {
		if p.UserID == playerID {
			playerIdx = i
			break
		}
	}
	if playerIdx == -1 {
		return false, nil, fmt.Errorf("you are not a player in this game")
	}

	switch moveType {
	case "roll":
		return gm.processBackgammonRoll(gameState, playerIdx)
	case "move":
		return gm.processBackgammonMoveChecker(gameState, playerIdx, moveData)
	case "pass":
		return gm.processBackgammonPass(gameState, playerIdx)
	default:
		return false, nil, fmt.Errorf("unknown backgammon move type: %s", moveType)
	}
}

func (gm *GameManager) processBackgammonRoll(gameState *GameSessionState, playerIdx int) (bool, *uint, error) {
	awaiting, _ := gameState.GameData["awaiting_roll"].(bool)
	if !awaiting {
		return false, nil, fmt.Errorf("you've already rolled this turn")
	}

	d1 := rand.Intn(6) + 1
	d2 := rand.Intn(6) + 1
	var remaining []int
	if d1 == d2 {
		remaining = []int{d1, d1, d1, d1}
	} else {
		remaining = []int{d1, d2}
	}
	gameState.GameData["dice"] = backgammonToInterfaceSlice([]int{d1, d2})
	gameState.GameData["remaining_dice"] = backgammonToInterfaceSlice(remaining)
	gameState.GameData["awaiting_roll"] = false

	if !backgammonHasAnyLegalMove(gameState, playerIdx) {
		gameState.GameData["remaining_dice"] = []interface{}{}
		gameState.GameData["awaiting_roll"] = true
		gameState.CurrentTurn = (gameState.CurrentTurn + 1) % 2
	}

	return false, nil, nil
}

func (gm *GameManager) processBackgammonMoveChecker(gameState *GameSessionState, playerIdx int, moveData map[string]interface{}) (bool, *uint, error) {
	awaiting, _ := gameState.GameData["awaiting_roll"].(bool)
	if awaiting {
		return false, nil, fmt.Errorf("roll the dice first")
	}

	fromF, ok := moveData["from"].(float64)
	if !ok {
		return false, nil, fmt.Errorf("missing from")
	}
	from := int(fromF)
	dieF, ok := moveData["die"].(float64)
	if !ok {
		return false, nil, fmt.Errorf("missing die")
	}
	die := int(dieF)

	remaining := backgammonIntSlice(gameState.GameData["remaining_dice"])
	dieIdx := -1
	for i, d := range remaining {
		if d == die {
			dieIdx = i
			break
		}
	}
	if dieIdx == -1 {
		return false, nil, fmt.Errorf("die %d is not available this turn", die)
	}

	if !backgammonCanMove(gameState, playerIdx, from, die) {
		return false, nil, fmt.Errorf("illegal move")
	}

	board := append([]interface{}{}, backgammonBoard(gameState)...)
	target := backgammonTarget(playerIdx, from, die)
	bearingOff := (playerIdx == 0 && target <= 0) || (playerIdx == 1 && target >= 25)

	// Remove the moving checker from its origin.
	if from == 0 {
		barKey := fmt.Sprintf("%d", playerIdx)
		backgammonSetIntMapField(gameState.GameData, "bar", barKey, backgammonIntMapField(gameState.GameData, "bar", barKey)-1)
	} else {
		owner, count := backgammonPointOwner(board, from)
		_ = owner
		if playerIdx == 0 {
			board[from-1] = count - 1
		} else {
			board[from-1] = -(count - 1)
		}
	}

	if bearingOff {
		offKey := fmt.Sprintf("%d", playerIdx)
		backgammonSetIntMapField(gameState.GameData, "borne_off", offKey, backgammonIntMapField(gameState.GameData, "borne_off", offKey)+1)
	} else {
		// Hit a lone opponent checker, if present.
		targetOwner, targetCount := backgammonPointOwner(board, target)
		if targetOwner != -1 && targetOwner != playerIdx && targetCount == 1 {
			oppKey := fmt.Sprintf("%d", targetOwner)
			backgammonSetIntMapField(gameState.GameData, "bar", oppKey, backgammonIntMapField(gameState.GameData, "bar", oppKey)+1)
			board[target-1] = 0
			targetOwner, targetCount = -1, 0
		}
		_, newCount := targetOwner, targetCount
		if playerIdx == 0 {
			board[target-1] = newCount + 1
		} else {
			board[target-1] = -(newCount + 1)
		}
	}

	gameState.GameData["board"] = board
	remaining = append(remaining[:dieIdx], remaining[dieIdx+1:]...)
	gameState.GameData["remaining_dice"] = backgammonToInterfaceSlice(remaining)

	if backgammonIntMapField(gameState.GameData, "borne_off", fmt.Sprintf("%d", playerIdx)) == backgammonCheckersPerPlayer {
		gameState.GameData["awaiting_roll"] = true
		gameState.GameData["remaining_dice"] = []interface{}{}
		winner := gameState.Players[playerIdx].UserID
		return true, &winner, nil
	}

	if len(remaining) == 0 || !backgammonHasAnyLegalMove(gameState, playerIdx) {
		gameState.GameData["remaining_dice"] = []interface{}{}
		gameState.GameData["awaiting_roll"] = true
		gameState.CurrentTurn = (gameState.CurrentTurn + 1) % 2
	}

	return false, nil, nil
}

func (gm *GameManager) processBackgammonPass(gameState *GameSessionState, playerIdx int) (bool, *uint, error) {
	awaiting, _ := gameState.GameData["awaiting_roll"].(bool)
	if awaiting {
		return false, nil, fmt.Errorf("roll the dice first")
	}
	gameState.GameData["remaining_dice"] = []interface{}{}
	gameState.GameData["awaiting_roll"] = true
	gameState.CurrentTurn = (gameState.CurrentTurn + 1) % 2
	return false, nil, nil
}
