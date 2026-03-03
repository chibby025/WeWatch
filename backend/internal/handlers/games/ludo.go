package games

import (
"fmt"
)

func (gm *GameManager) processLudoMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
switch moveType {
case "roll":
return gm.processLudoRoll(gameState, playerID, moveData)
case "move_token":
return gm.processLudoTokenMove(gameState, playerID, moveData)
default:
return false, nil, fmt.Errorf("unknown ludo move type: %s", moveType)
}
}

func (gm *GameManager) processLudoRoll(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
return false, nil, fmt.Errorf("ludo not yet implemented - coming in Phase 4")
}

func (gm *GameManager) processLudoTokenMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
return false, nil, fmt.Errorf("ludo not yet implemented - coming in Phase 4")
}

const (
LudoBoardSize       = 52
LudoHomeStretch     = 6
LudoTokensPerPlayer = 4
)

var ludoSafeSquares = []int{0, 8, 13, 21, 26, 34, 39, 47}
