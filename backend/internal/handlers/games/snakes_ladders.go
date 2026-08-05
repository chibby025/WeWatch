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

// Warp pads teleport either direction (unlike snakeLadders, direction isn't
// implied by the square's visual identity — you don't know if it's good
// until you land). Destinations deliberately avoid every square already used
// as a source or destination above, so a single non-recursive lookup (same
// model snakeLadders already uses) never needs to chain through a second map.
var warpPads = map[int]int{
	11: 44, // forward
	46: 16, // backward
	79: 97, // forward, high-tension near the finish
}

// Trap squares set a one-turn skip flag (see skip_next in GameData) rather
// than moving the player anywhere. Also disjoint from every square above.
var trapSquares = map[int]bool{
	30: true, 58: true, 68: true, 90: true,
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

// getSnakesLaddersSkipFlags mirrors getSnakesLaddersPositions's lazy-init +
// JSON-roundtrip type-coercion pattern exactly, for the per-player "will miss
// their next turn" flag set by landing on a trap square.
func getSnakesLaddersSkipFlags(gameState *GameSessionState, playerCount int) ([]bool, error) {
	flagsInterface, ok := gameState.GameData["skip_next"]
	if !ok {
		return make([]bool, playerCount), nil
	}

	flags := make([]bool, playerCount)
	switch v := flagsInterface.(type) {
	case []bool:
		copy(flags, v)
	case []interface{}:
		for i, f := range v {
			if i >= len(flags) {
				break
			}
			fb, ok := f.(bool)
			if !ok {
				return nil, fmt.Errorf("invalid skip flag type at index %d", i)
			}
			flags[i] = fb
		}
	default:
		return nil, fmt.Errorf("invalid skip_next state type: %T", flagsInterface)
	}
	return flags, nil
}

func (gm *GameManager) processSnakesLaddersMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	playerIdx := gameState.CurrentTurn

	positions, err := getSnakesLaddersPositions(gameState)
	if err != nil {
		return false, nil, err
	}
	skipNext, err := getSnakesLaddersSkipFlags(gameState, len(positions))
	if err != nil {
		return false, nil, err
	}

	if skipNext[playerIdx] {
		// This player was trapped the last time their turn came around. The
		// client's own "Roll Dice" button (relabeled) sends the same ordinary
		// move — the trap just burns it here instead of actually rolling: no
		// dice, no position change, generic turn-advance (outside this
		// function) moves play on to the next player.
		skipNext[playerIdx] = false
		gameState.GameData["skip_next"] = skipNext
		gameState.GameData["last_event"] = "skipped"
		gameState.GameData["last_player"] = playerIdx
		return false, nil, nil
	}

	roll := rand.Intn(6) + 1 // server-authoritative, same convention as ludo.go's dice rolls

	pos := positions[playerIdx]
	newPos := pos + roll
	eventType := "" // "" | "ladder" | "snake" | "warp" | "trap" | "trap_dodged" | "overshoot"

	if newPos > 100 {
		// Must land exactly on 100 — an overshoot forfeits the move, position unchanged.
		newPos = pos
		eventType = "overshoot"
	} else if dest, ok := snakeLadders[newPos]; ok {
		if dest > newPos {
			eventType = "ladder"
		} else {
			eventType = "snake"
		}
		newPos = dest
	} else if dest, ok := warpPads[newPos]; ok {
		eventType = "warp"
		newPos = dest
	} else if trapSquares[newPos] {
		if roll == 6 {
			// A lucky 6 gets you out before the trap closes — also sidesteps a
			// real ordering bug: without this, setting skip_next here would be
			// immediately (and wrongly) consumed by this same player's bonus
			// roll below, since CurrentTurn doesn't actually change yet.
			eventType = "trap_dodged"
		} else {
			eventType = "trap"
			skipNext[playerIdx] = true
			gameState.GameData["skip_next"] = skipNext
		}
	}

	positions[playerIdx] = newPos
	gameState.GameData["positions"] = positions
	gameState.GameData["last_roll"] = roll
	gameState.GameData["last_player"] = playerIdx
	gameState.GameData["last_event"] = eventType

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
