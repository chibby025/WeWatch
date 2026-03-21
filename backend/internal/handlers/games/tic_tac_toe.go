package games

import "fmt"

func (gm *GameManager) processTicTacToeMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
position, ok := moveData["position"].(float64)
if !ok {
return false, nil, fmt.Errorf("invalid position")
}

pos := int(position)
if pos < 0 || pos > 8 {
return false, nil, fmt.Errorf("position out of bounds")
}

boardInterface, ok := gameState.GameData["board"]
if !ok {
gameState.GameData["board"] = [9]string{"", "", "", "", "", "", "", "", ""}
boardInterface = gameState.GameData["board"]
}

	// Handle both array [9]string and slices []interface{} or []string (from JSON unmarshaling)
	var board [9]string
	switch v := boardInterface.(type) {
	case [9]string:
		board = v
	case []interface{}:
		if len(v) != 9 {
			return false, nil, fmt.Errorf("invalid board length: %d", len(v))
		}
		for i, cell := range v {
			if cellStr, ok := cell.(string); ok {
				board[i] = cellStr
			} else {
				return false, nil, fmt.Errorf("invalid cell type at position %d", i)
			}
		}
	case []string:
		if len(v) != 9 {
			return false, nil, fmt.Errorf("invalid board length: %d", len(v))
		}
		copy(board[:], v)
	default:
		return false, nil, fmt.Errorf("invalid board state type: %T", boardInterface)
	}

	if board[pos] != "" {
		return false, nil, fmt.Errorf("position already occupied")
	}

	currentPlayer := gameState.Players[gameState.CurrentTurn]
	symbol := "X"
	if gameState.CurrentTurn == 1 {
		symbol = "O"
	}

	board[pos] = symbol
	
	// Convert array to slice for JSON compatibility
	boardSlice := board[:]
	gameState.GameData["board"] = boardSlice

	if winner := checkTicTacToeWinner(board); winner != "" {
		winnerID = &currentPlayer.UserID
		return true, winnerID, nil
	}

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

func checkTicTacToeWinner(board [9]string) string {
wins := [][3]int{
{0, 1, 2}, {3, 4, 5}, {6, 7, 8},
{0, 3, 6}, {1, 4, 7}, {2, 5, 8},
{0, 4, 8}, {2, 4, 6},
}

for _, combo := range wins {
if board[combo[0]] != "" &&
board[combo[0]] == board[combo[1]] &&
board[combo[1]] == board[combo[2]] {
return board[combo[0]]
}
}

return ""
}
