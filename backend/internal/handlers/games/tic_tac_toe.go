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

board, ok := boardInterface.([9]string)
if !ok {
return false, nil, fmt.Errorf("invalid board state")
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
gameState.GameData["board"] = board

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
