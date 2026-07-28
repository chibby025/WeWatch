package games

import (
	"fmt"
	"math/rand"
)

// Positions are per-player ints (index into Players[]), 0 = not yet on the
// board, 1-100 = board square. 100 = won. snakeLadders maps a square to its
// destination if a snake head or ladder bottom lands there — not present in
// the map means no snake/ladder on that square.
var snakeLadders = map[int]int{
	// Ladders (up)
	4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91,
	// Snakes (down)
	17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78,
}

func snakesLaddersInitialPositions(playerCount int) []int {
	return make([]int, playerCount) // all start at 0 (off-board); zero-value already correct
}

func getSnakesLaddersPositions(gameState *GameSessionState) ([]int, error) {
	posInterface, ok := gameState.GameData["positions"]
	if !ok {
		// GameData starts as a fresh empty map at game-session creation (separate
		// from the GameSession.GameState the initial game_started broadcast reads
		// from), so the very first move of every game lands here — same lazy-init
		// fallback othello.go/checkers.go already rely on for this reason.
		positions := snakesLaddersInitialPositions(len(gameState.Players))
		gameState.GameData["positions"] = positions
		return positions, nil
	}

	positions := make([]int, len(gameState.Players))
	switch v := posInterface.(type) {
	case []int:
		copy(positions, v)
	case []interface{}:
		for i, p := range v {
			if i >= len(positions) {
				break
			}
			pf, ok := p.(float64)
			if !ok {
				return nil, fmt.Errorf("invalid position type at index %d", i)
			}
			positions[i] = int(pf)
		}
	default:
		return nil, fmt.Errorf("invalid positions state type: %T", posInterface)
	}
	return positions, nil
}

func (gm *GameManager) processSnakesLaddersMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	playerIdx := gameState.CurrentTurn

	positions, err := getSnakesLaddersPositions(gameState)
	if err != nil {
		return false, nil, err
	}

	roll := rand.Intn(6) + 1 // server-authoritative, same convention as ludo.go's dice rolls

	pos := positions[playerIdx]
	newPos := pos + roll
	if newPos > 100 {
		// Must land exactly on 100 — an overshoot forfeits the move, position unchanged.
		newPos = pos
	} else if dest, ok := snakeLadders[newPos]; ok {
		newPos = dest
	}
	positions[playerIdx] = newPos
	gameState.GameData["positions"] = positions
	gameState.GameData["last_roll"] = roll
	gameState.GameData["last_player"] = playerIdx

	if newPos == 100 {
		winnerID = &gameState.Players[playerIdx].UserID
		return true, winnerID, nil
	}

	if roll == 6 {
		// Rolling a 6 earns another turn — cancel out the caller's automatic
		// turn-advance (ProcessMove always does currentTurn = (currentTurn+1) %
		// len(players) after a non-gameOver move), same trick othello.go uses for
		// a skipped pass and checkers.go uses for a forced multi-jump.
		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
	}

	return false, nil, nil
}
