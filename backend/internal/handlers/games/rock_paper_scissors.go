package games

import (
"fmt"
)

// processRockPaperScissorsMove handles Rock Paper Scissors game logic
func (gm *GameManager) processRockPaperScissorsMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
pick, ok := moveData["pick"].(string)
if !ok {
return false, nil, fmt.Errorf("invalid pick")
}

if pick != "rock" && pick != "paper" && pick != "scissors" {
return false, nil, fmt.Errorf("invalid pick: must be rock, paper, or scissors")
}

if gameState.GameData["picks"] == nil {
gameState.GameData["picks"] = make(map[string]string)
}

picks := gameState.GameData["picks"].(map[string]string)
playerIDStr := fmt.Sprintf("%d", playerID)

if _, exists := picks[playerIDStr]; exists {
return false, nil, fmt.Errorf("you already made your pick")
}

picks[playerIDStr] = pick
gameState.GameData["picks"] = picks

if len(picks) < 2 {
return false, nil, nil
}

player1ID := gameState.Players[0].UserID
player2ID := gameState.Players[1].UserID

pick1 := picks[fmt.Sprintf("%d", player1ID)]
pick2 := picks[fmt.Sprintf("%d", player2ID)]

gameState.GameData["final_picks"] = map[string]string{
fmt.Sprintf("%d", player1ID): pick1,
fmt.Sprintf("%d", player2ID): pick2,
}

result := determineRPSWinner(pick1, pick2)

if result == 0 {
return true, nil, nil
} else if result == 1 {
return true, &player1ID, nil
} else {
return true, &player2ID, nil
}
}

func determineRPSWinner(pick1, pick2 string) int {
if pick1 == pick2 {
return 0
}

wins := map[string]string{
"rock":     "scissors",
"paper":    "rock",
"scissors": "paper",
}

if wins[pick1] == pick2 {
return 1
}

return -1
}
