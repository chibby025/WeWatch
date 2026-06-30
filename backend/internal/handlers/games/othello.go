package games

import "fmt"

// Board is 64 cells, row-major (index = row*8+col). "" empty, "B" black, "W" white.
// Players[0] is always Black, Players[1] is always White, matching tic_tac_toe's
// X/O-by-index convention.

var othelloDirections = [8][2]int{
	{-1, -1}, {-1, 0}, {-1, 1},
	{0, -1}, {0, 1},
	{1, -1}, {1, 0}, {1, 1},
}

func (gm *GameManager) processOthelloMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	positionF, ok := moveData["position"].(float64)
	if !ok {
		return false, nil, fmt.Errorf("invalid position")
	}
	position := int(positionF)

	board, err := getOthelloBoard(gameState)
	if err != nil {
		return false, nil, err
	}

	color := "B"
	if gameState.CurrentTurn == 1 {
		color = "W"
	}
	opponentColor := "W"
	if color == "W" {
		opponentColor = "B"
	}

	if position == -1 {
		// Explicit pass — only legal when the current player genuinely has no move.
		if len(othelloLegalMoves(board, color)) > 0 {
			return false, nil, fmt.Errorf("you have a legal move, cannot pass")
		}
	} else {
		if position < 0 || position > 63 {
			return false, nil, fmt.Errorf("position out of bounds")
		}
		flips := othelloFlipsForMove(board, position, color)
		if len(flips) == 0 {
			return false, nil, fmt.Errorf("illegal move")
		}
		board[position] = color
		for _, f := range flips {
			board[f] = color
		}
	}

	gameState.GameData["board"] = board

	opponentMoves := othelloLegalMoves(board, opponentColor)
	currentMoves := othelloLegalMoves(board, color)

	if len(opponentMoves) == 0 && len(currentMoves) == 0 {
		// Neither side can move — game over, most discs wins.
		blackCount, whiteCount := othelloCounts(board)
		if blackCount > whiteCount {
			winnerID = &gameState.Players[0].UserID
		} else if whiteCount > blackCount {
			winnerID = &gameState.Players[1].UserID
		}
		return true, winnerID, nil
	}

	if len(opponentMoves) == 0 {
		// Opponent has no move — skip them by cancelling out the caller's automatic
		// turn-advance (ProcessMove always does currentTurn = (currentTurn+1) % len(players)
		// after a non-gameOver move, so decrementing here first leaves it net-unchanged,
		// i.e. the same player who just moved goes again).
		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
	}

	return false, nil, nil
}

// othelloInitialBoard places the standard 4-disc starting position. Shared by
// game_manager.go's initializeGameState (the DB/initial-broadcast path) and the
// lazy-init fallback below (the runtime GameData path) so both agree exactly.
func othelloInitialBoard() []string {
	board := make([]string, 64)
	board[3*8+3] = "W"
	board[3*8+4] = "B"
	board[4*8+3] = "B"
	board[4*8+4] = "W"
	return board
}

func getOthelloBoard(gameState *GameSessionState) ([]string, error) {
	boardInterface, ok := gameState.GameData["board"]
	if !ok {
		// GameData starts as a fresh empty map at game-session creation (separate
		// from the GameSession.GameState the initial game_started broadcast reads
		// from), so the very first move of every game lands here — same lazy-init
		// fallback tic_tac_toe.go and chess.go already rely on for this reason.
		board := othelloInitialBoard()
		gameState.GameData["board"] = board
		return board, nil
	}

	board := make([]string, 64)
	switch v := boardInterface.(type) {
	case []string:
		if len(v) != 64 {
			return nil, fmt.Errorf("invalid board length: %d", len(v))
		}
		copy(board, v)
	case []interface{}:
		if len(v) != 64 {
			return nil, fmt.Errorf("invalid board length: %d", len(v))
		}
		for i, cell := range v {
			cellStr, ok := cell.(string)
			if !ok {
				return nil, fmt.Errorf("invalid cell type at position %d", i)
			}
			board[i] = cellStr
		}
	default:
		return nil, fmt.Errorf("invalid board state type: %T", boardInterface)
	}

	return board, nil
}

// othelloFlipsForMove returns the indices that would flip if `color` played at
// `position`. Empty slice means the move is illegal (no bracket in any direction).
func othelloFlipsForMove(board []string, position int, color string) []int {
	if board[position] != "" {
		return nil
	}

	opponent := "W"
	if color == "W" {
		opponent = "B"
	}

	row, col := position/8, position%8
	var flips []int

	for _, dir := range othelloDirections {
		var lineFlips []int
		r, c := row+dir[0], col+dir[1]
		for r >= 0 && r < 8 && c >= 0 && c < 8 && board[r*8+c] == opponent {
			lineFlips = append(lineFlips, r*8+c)
			r += dir[0]
			c += dir[1]
		}
		if len(lineFlips) > 0 && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r*8+c] == color {
			flips = append(flips, lineFlips...)
		}
	}

	return flips
}

func othelloLegalMoves(board []string, color string) []int {
	var moves []int
	for i := 0; i < 64; i++ {
		if board[i] == "" && len(othelloFlipsForMove(board, i, color)) > 0 {
			moves = append(moves, i)
		}
	}
	return moves
}

func othelloCounts(board []string) (black, white int) {
	for _, cell := range board {
		if cell == "B" {
			black++
		} else if cell == "W" {
			white++
		}
	}
	return
}
