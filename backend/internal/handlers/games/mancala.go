package games

import "fmt"

// Board is 14 pits, index 0-13. Player0's 6 sowing pits are 0-5, store is 6.
// Player1's 6 sowing pits are 7-12, store is 13. Standard Kalah rules: 4 seeds
// per starting pit, sow counter-clockwise (increasing index, wrapping 13→0)
// skipping the opponent's store, capture on landing in an empty own-side pit
// (steal that seed + the mirrored opposite pit into your own store), extra
// turn on landing in your own store. Strictly 2-player — enforced in
// game_manager.go's StartGame, same as ludo.go's 4-player cap.

func mancalaInitialBoard() []int {
	board := make([]int, 14)
	for i := 0; i < 14; i++ {
		if i == 6 || i == 13 {
			continue // stores start empty
		}
		board[i] = 4
	}
	return board
}

// mancalaOwnPits returns playerIdx's sowing-pit range and store index.
func mancalaOwnPits(playerIdx int) (start, end, store int) {
	if playerIdx == 0 {
		return 0, 5, 6
	}
	return 7, 12, 13
}

func getMancalaBoard(gameState *GameSessionState) ([]int, error) {
	boardInterface, ok := gameState.GameData["board"]
	if !ok {
		// GameData starts as a fresh empty map at game-session creation (separate
		// from the GameSession.GameState the initial game_started broadcast reads
		// from), so the very first move of every game lands here — same lazy-init
		// fallback othello.go/checkers.go already rely on for this reason.
		board := mancalaInitialBoard()
		gameState.GameData["board"] = board
		return board, nil
	}

	board := make([]int, 14)
	switch v := boardInterface.(type) {
	case []int:
		if len(v) != 14 {
			return nil, fmt.Errorf("invalid board length: %d", len(v))
		}
		copy(board, v)
	case []interface{}:
		if len(v) != 14 {
			return nil, fmt.Errorf("invalid board length: %d", len(v))
		}
		for i, cell := range v {
			cf, ok := cell.(float64)
			if !ok {
				return nil, fmt.Errorf("invalid cell type at position %d", i)
			}
			board[i] = int(cf)
		}
	default:
		return nil, fmt.Errorf("invalid board state type: %T", boardInterface)
	}
	return board, nil
}

func (gm *GameManager) processMancalaMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	pitF, ok := moveData["pit"].(float64)
	if !ok {
		return false, nil, fmt.Errorf("invalid pit")
	}
	pit := int(pitF)

	board, err := getMancalaBoard(gameState)
	if err != nil {
		return false, nil, err
	}

	playerIdx := gameState.CurrentTurn
	start, end, myStore := mancalaOwnPits(playerIdx)
	oppStart, oppEnd, oppStore := mancalaOwnPits(1 - playerIdx)

	if pit < start || pit > end {
		return false, nil, fmt.Errorf("must pick one of your own pits")
	}
	if board[pit] == 0 {
		return false, nil, fmt.Errorf("that pit is empty")
	}

	seeds := board[pit]
	board[pit] = 0
	idx := pit
	for seeds > 0 {
		idx = (idx + 1) % 14
		if idx == oppStore {
			continue // never sow into the opponent's store
		}
		board[idx]++
		seeds--
	}

	// Capture: the last seed landed in a pit that was empty before it (now
	// holds exactly 1) on my own side, and the mirrored opposite pit (12-idx)
	// has seeds — steal both into my store.
	if idx >= start && idx <= end && board[idx] == 1 {
		opposite := 12 - idx
		if board[opposite] > 0 {
			board[myStore] += board[idx] + board[opposite]
			board[idx] = 0
			board[opposite] = 0
		}
	}

	gameState.GameData["board"] = board

	// Round-end check: either side fully empty — sweep whatever remains on
	// each side into that side's own store, winner = most seeds in their store.
	mySideEmpty := true
	for i := start; i <= end; i++ {
		if board[i] > 0 {
			mySideEmpty = false
			break
		}
	}
	oppSideEmpty := true
	for i := oppStart; i <= oppEnd; i++ {
		if board[i] > 0 {
			oppSideEmpty = false
			break
		}
	}

	if mySideEmpty || oppSideEmpty {
		for i := start; i <= end; i++ {
			board[myStore] += board[i]
			board[i] = 0
		}
		for i := oppStart; i <= oppEnd; i++ {
			board[oppStore] += board[i]
			board[i] = 0
		}
		gameState.GameData["board"] = board

		myTotal, oppTotal := board[myStore], board[oppStore]
		if myTotal > oppTotal {
			winnerID = &gameState.Players[playerIdx].UserID
		} else if oppTotal > myTotal {
			winnerID = &gameState.Players[1-playerIdx].UserID
		}
		// Equal totals: winnerID stays nil — a draw, same convention othello.go uses.
		return true, winnerID, nil
	}

	if idx == myStore {
		// Landing the last seed in your own store earns another turn — cancel out
		// the caller's automatic turn-advance, same trick othello.go uses for a
		// skipped pass and checkers.go uses for a forced multi-jump.
		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
	}

	return false, nil, nil
}
