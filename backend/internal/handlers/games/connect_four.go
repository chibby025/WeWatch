package games

import "fmt"

// Connect Four: 7 columns × 6 rows, gravity-based (piece drops to lowest empty row).
// Board is stored as a flat [42]string slice, row-major (index = row*7+col).
// "" empty, "R" red (Players[0]), "Y" yellow (Players[1]).
// Win condition: 4 consecutive pieces in any horizontal, vertical, or diagonal line.

const c4Cols = 7
const c4Rows = 6

func connectFourInitialBoard() []string {
	return make([]string, c4Rows*c4Cols)
}

func (gm *GameManager) processConnectFourMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	colF, ok := moveData["column"].(float64)
	if !ok {
		colF, ok = moveData["col"].(float64)
	}
	if !ok {
		return false, nil, fmt.Errorf("invalid col")
	}
	col := int(colF)
	if col < 0 || col >= c4Cols {
		return false, nil, fmt.Errorf("column out of bounds")
	}

	board, err := getConnectFourBoard(gameState)
	if err != nil {
		return false, nil, err
	}

	playerIdx := gameState.CurrentTurn
	piece := "R"
	if playerIdx == 1 {
		piece = "Y"
	}

	// Drop piece: find the lowest empty row in this column (highest row index).
	row := -1
	for r := c4Rows - 1; r >= 0; r-- {
		if board[r*c4Cols+col] == "" {
			row = r
			break
		}
	}
	if row == -1 {
		return false, nil, fmt.Errorf("column is full")
	}

	board[row*c4Cols+col] = piece
	gameState.GameData["board"] = board

	// Check for a winner.
	if connectFourHasWon(board, row, col, piece) {
		gameState.GameData["winner_piece"] = piece
		uid := playerID
		return true, &uid, nil
	}

	// Check for draw (board full).
	full := true
	for _, cell := range board {
		if cell == "" {
			full = false
			break
		}
	}
	if full {
		return true, nil, nil
	}

	return false, nil, nil
}

func getConnectFourBoard(gameState *GameSessionState) ([]string, error) {
	raw, ok := gameState.GameData["board"]
	if !ok || raw == nil {
		return connectFourInitialBoard(), nil
	}
	switch v := raw.(type) {
	case []string:
		return v, nil
	case []interface{}:
		board := make([]string, len(v))
		for i, cell := range v {
			if s, ok := cell.(string); ok {
				board[i] = s
			}
		}
		return board, nil
	}
	return connectFourInitialBoard(), nil
}

// connectFourHasWon checks all four directions from the last-placed piece.
func connectFourHasWon(board []string, row, col int, piece string) bool {
	dirs := [][2]int{{0, 1}, {1, 0}, {1, 1}, {1, -1}}
	for _, d := range dirs {
		count := 1
		for _, sign := range []int{1, -1} {
			r, c := row+d[0]*sign, col+d[1]*sign
			for r >= 0 && r < c4Rows && c >= 0 && c < c4Cols && board[r*c4Cols+c] == piece {
				count++
				r += d[0] * sign
				c += d[1] * sign
			}
		}
		if count >= 4 {
			return true
		}
	}
	return false
}
