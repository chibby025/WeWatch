package games

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"wewatch-backend/internal/models"

	"gorm.io/gorm"
)

// MessageHub represents the hub for broadcasting (interface{} to avoid import cycle)
type MessageHub interface{}

// GameManager handles game session state and logic
type GameManager struct {
	db                *gorm.DB
	activeGames       map[uint]*GameSessionState
	roomActiveGames   map[uint]uint
	mu                sync.RWMutex
	hub               MessageHub
}

// GameSessionState holds the runtime state of an active game
type GameSessionState struct {
	GameSession *models.GameSession
	Players     []models.Player
	CurrentTurn int
	GameData    map[string]interface{}
}

// NewGameManager creates a new game manager instance
func NewGameManager(db *gorm.DB, hub MessageHub) *GameManager {
	return &GameManager{
		db:              db,
		activeGames:     make(map[uint]*GameSessionState),
		roomActiveGames: make(map[uint]uint),
		hub:             hub,
	}
}

// StartGame initiates a new game session
func (gm *GameManager) StartGame(roomID uint, hostID uint, sessionID *uint, gameType string, players []models.Player) (*models.GameSession, error) {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	if existingGameID, exists := gm.roomActiveGames[roomID]; exists {
		return nil, fmt.Errorf("room %d already has an active game (ID: %d)", roomID, existingGameID)
	}

	if gameType != "tic_tac_toe" && gameType != "rock_paper_scissors" {
		return nil, fmt.Errorf("invalid game type: %s", gameType)
	}

	gameSession := &models.GameSession{
		RoomID:    roomID,
		SessionID: sessionID,
		GameType:  gameType,
		HostID:    hostID,
		Status:    "active",
		Players:   players,
		GameState: gm.initializeGameState(gameType, len(players)),
		CreatedAt: time.Now(),
	}

	if err := gm.db.Create(gameSession).Error; err != nil {
		return nil, fmt.Errorf("failed to create game session: %w", err)
	}

	gameState := &GameSessionState{
		GameSession: gameSession,
		Players:     players,
		CurrentTurn: 0,
		GameData:    make(map[string]interface{}),
	}

	gm.activeGames[gameSession.ID] = gameState
	gm.roomActiveGames[roomID] = gameSession.ID

	log.Printf("🎮 [GameManager] Started %s game (ID: %d) in room %d with %d players", gameType, gameSession.ID, roomID, len(players))

	return gameSession, nil
}

// ProcessMove handles a player's move
func (gm *GameManager) ProcessMove(gameSessionID uint, playerID uint, moveType string, moveData map[string]interface{}) error {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	gameState, exists := gm.activeGames[gameSessionID]
	if !exists {
		return fmt.Errorf("game session %d not found", gameSessionID)
	}

	if gameState.GameSession.GameType != "rock_paper_scissors" {
		currentPlayer := gameState.Players[gameState.CurrentTurn]
		if currentPlayer.UserID != playerID {
			return fmt.Errorf("not your turn")
		}
	}

	gameMove := &models.GameMove{
		GameSessionID: gameSessionID,
		PlayerID:      playerID,
		MoveType:      moveType,
		MoveData:      moveData,
		CreatedAt:     time.Now(),
	}

	if err := gm.db.Create(gameMove).Error; err != nil {
		return fmt.Errorf("failed to record move: %w", err)
	}

	var gameOver bool
	var winnerID *uint
	var err error

	switch gameState.GameSession.GameType {
	case "tic_tac_toe":
		gameOver, winnerID, err = gm.processTicTacToeMove(gameState, playerID, moveData)
	case "rock_paper_scissors":
		gameOver, winnerID, err = gm.processRockPaperScissorsMove(gameState, playerID, moveData)
	default:
		return fmt.Errorf("unknown game type: %s", gameState.GameSession.GameType)
	}

	if err != nil {
		return err
	}

	gameState.GameSession.GameState = gameState.GameData
	if err := gm.db.Model(&models.GameSession{}).Where("id = ?", gameSessionID).Update("game_state", gameState.GameSession.GameState).Error; err != nil {
		log.Printf("⚠️ [GameManager] Failed to update game state: %v", err)
	}

	if !gameOver && gameState.GameSession.GameType != "rock_paper_scissors" {
		gameState.CurrentTurn = (gameState.CurrentTurn + 1) % len(gameState.Players)
	}

	if gameOver {
		if err := gm.EndGame(gameSessionID, winnerID, "completed"); err != nil {
			log.Printf("⚠️ [GameManager] Failed to end game: %v", err)
		}
	}

	return nil
}

// EndGame marks a game as completed or forfeited
func (gm *GameManager) EndGame(gameSessionID uint, winnerID *uint, status string) error {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	gameState, exists := gm.activeGames[gameSessionID]
	if !exists {
		return fmt.Errorf("game session %d not found", gameSessionID)
	}

	now := time.Now()
	gameState.GameSession.Status = status
	gameState.GameSession.WinnerID = winnerID
	gameState.GameSession.EndedAt = &now

	if err := gm.db.Model(&models.GameSession{}).Where("id = ?", gameSessionID).Updates(map[string]interface{}{
		"status":    status,
		"winner_id": winnerID,
		"ended_at":  now,
	}).Error; err != nil {
		return fmt.Errorf("failed to update game session: %w", err)
	}

	roomID := gameState.GameSession.RoomID
	delete(gm.activeGames, gameSessionID)
	delete(gm.roomActiveGames, roomID)

	log.Printf("🎮 [GameManager] Ended game %d (status: %s, winner: %v)", gameSessionID, status, winnerID)

	return nil
}

// GetActiveGame returns the active game session for a room
func (gm *GameManager) GetActiveGame(roomID uint) (*GameSessionState, bool) {
	gm.mu.RLock()
	defer gm.mu.RUnlock()

	gameSessionID, exists := gm.roomActiveGames[roomID]
	if !exists {
		return nil, false
	}

	gameState, exists := gm.activeGames[gameSessionID]
	return gameState, exists
}

// HandlePlayerDisconnect handles player disconnection during a game
func (gm *GameManager) HandlePlayerDisconnect(roomID uint, userID uint) error {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	gameSessionID, exists := gm.roomActiveGames[roomID]
	if !exists {
		return nil
	}

	gameState, exists := gm.activeGames[gameSessionID]
	if !exists {
		return nil
	}

	isPlayer := false
	for _, player := range gameState.Players {
		if player.UserID == userID {
			isPlayer = true
			break
		}
	}

	if !isPlayer {
		return nil
	}

	var winnerID *uint
	if len(gameState.Players) == 2 {
		for _, player := range gameState.Players {
			if player.UserID != userID {
				winnerID = &player.UserID
				break
			}
		}
	}

	log.Printf("🎮 [GameManager] Player %d disconnected from game %d - forfeiting", userID, gameSessionID)

	return gm.EndGame(gameSessionID, winnerID, "forfeited")
}

// BroadcastGameState sends the current game state to all room members
func (gm *GameManager) BroadcastGameState(roomID uint) error {
	gameState, exists := gm.GetActiveGame(roomID)
	if !exists {
		return fmt.Errorf("no active game for room %d", roomID)
	}

	message := map[string]interface{}{
		"type":            "game",
		"action":          "game_state_update",
		"game_session_id": gameState.GameSession.ID,
		"game_type":       gameState.GameSession.GameType,
		"status":          gameState.GameSession.Status,
		"current_turn":    gameState.CurrentTurn,
		"players":         gameState.Players,
		"game_state":      gameState.GameData,
	}

	messageBytes, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal game state: %w", err)
	}

	// Use type assertion to call BroadcastToRoomBinary
	if hub, ok := gm.hub.(interface{ BroadcastToRoomBinary(uint, []byte, uint) }); ok {
		hub.BroadcastToRoomBinary(roomID, messageBytes, 0)
	}
	return nil
}

// initializeGameState creates the initial game state based on game type
func (gm *GameManager) initializeGameState(gameType string, playerCount int) models.GameState {
	state := models.GameState{}

	switch gameType {
	case "tic_tac_toe":
		state["board"] = [9]string{"", "", "", "", "", "", "", "", ""}
		state["current_turn"] = 0

	case "rock_paper_scissors":
		state["picks"] = make(map[string]string)
		state["picks_made"] = 0

	case "ludo":
		state["board"] = gm.initializeLudoBoard(playerCount)
		state["current_turn"] = 0
		state["dice_value"] = 0
		state["extra_turn"] = false
	}

	return state
}

// initializeLudoBoard creates initial Ludo board state
func (gm *GameManager) initializeLudoBoard(playerCount int) map[string]interface{} {
	colors := []string{"red", "blue", "green", "yellow"}
	board := map[string]interface{}{
		"tokens": make(map[string]interface{}),
	}

	for i := 0; i < playerCount; i++ {
		color := colors[i]
		tokens := make([]map[string]interface{}, 4)
		for j := 0; j < 4; j++ {
			tokens[j] = map[string]interface{}{
				"id":       fmt.Sprintf("%s_%d", color, j),
				"position": -1,
				"safe":     false,
			}
		}
		board["tokens"].(map[string]interface{})[color] = tokens
	}

	return board
}
