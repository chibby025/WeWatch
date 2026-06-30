package games

import (
	"fmt"
	"log"
	"sync"
	"time"

	"wewatch-backend/internal/models"
	"wewatch-backend/internal/services"

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

	// Card-game-only fields (currently just Crazy Eights). Deliberately kept OFF
	// GameData and never read into a room-wide broadcast or DB-persisted
	// GameState — every other game here is perfect-information, but a card
	// game's hands and draw-pile order are the entire game's hidden information.
	// Only non-revealing derivatives (hand_counts, draw_pile_count) get mirrored
	// into GameData by syncCrazyEightsPublicState (crazy_eights.go). Each
	// player's own hand reaches them exclusively via a private hand_update
	// message (websocket_handler.go, hub.BroadcastToUser).
	Hands       map[uint][]string
	DrawPile    []string
	DiscardPile []string // includes the current top card (last element)
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

	if gameType != "tic_tac_toe" && gameType != "rock_paper_scissors" && gameType != "chess" && gameType != "trivia" && gameType != "doom" && gameType != "space_shooter" && gameType != "othello" && gameType != "checkers" && gameType != "crazy_eights" && gameType != "ludo" {
		return nil, fmt.Errorf("invalid game type: %s", gameType)
	}

	// ludoColors only has 4 entries (red/blue/green/yellow) — indexing beyond
	// that in ludo.go would panic. Every other game here is fixed at exactly 2
	// players already (enforced implicitly by their own move logic), so this
	// check is ludo-specific.
	if gameType == "ludo" && len(players) > 4 {
		return nil, fmt.Errorf("ludo supports at most 4 players")
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

	// Card games need their hands dealt immediately, before anyone has moved —
	// unlike every other game type here, players must see their own hand from the
	// very first moment. This can't use the lazy-init-on-first-move pattern the
	// perfect-information games rely on.
	switch gameType {
	case "crazy_eights":
		dealCrazyEights(gameState)
		// dealCrazyEights only mutates gameState.GameData (the runtime copy) — the
		// initial game_started broadcast (handleGameStart, websocket_handler.go)
		// reads gameSession.GameState (the DB-row snapshot returned from this
		// function), which initializeGameState already populated *before* dealing
		// happened. Without this sync, the very first broadcast would carry an
		// empty game_state (no discard_top/hand_counts) for crazy_eights — every
		// other game type's initializeGameState case populates GameState directly,
		// so they never hit this gap. Same reconciliation ProcessMove already does
		// after every move.
		gameState.GameSession.GameState = gameState.GameData
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

	if gameState.GameSession.GameType != "rock_paper_scissors" && gameState.GameSession.GameType != "trivia" {
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
	case "chess":
		gameOver, winnerID, err = gm.processChessMove(gameState, playerID, moveData)
	case "trivia":
		gameOver, winnerID, err = gm.processTriviaMove(gameState, playerID, moveType, moveData)
	case "othello":
		gameOver, winnerID, err = gm.processOthelloMove(gameState, playerID, moveData)
	case "checkers":
		gameOver, winnerID, err = gm.processCheckersMove(gameState, playerID, moveData)
	case "crazy_eights":
		gameOver, winnerID, err = gm.processCrazyEightsMove(gameState, playerID, moveType, moveData)
	case "ludo":
		gameOver, winnerID, err = gm.processLudoMove(gameState, playerID, moveType, moveData)
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
		if err := gm.endGameLocked(gameSessionID, winnerID, "completed"); err != nil {
			log.Printf("⚠️ [GameManager] Failed to end game: %v", err)
		}
	}

	return nil
}

// EndGame marks a game as completed or forfeited (acquires lock — call from outside the manager).
func (gm *GameManager) EndGame(gameSessionID uint, winnerID *uint, status string) error {
	gm.mu.Lock()
	defer gm.mu.Unlock()
	return gm.endGameLocked(gameSessionID, winnerID, status)
}

// endGameLocked does the actual work; caller must already hold gm.mu.
func (gm *GameManager) endGameLocked(gameSessionID uint, winnerID *uint, status string) error {
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

	// Broadcast the final board state then game_ended before removing from active maps,
	// so all clients see the winning position and can display the result.
	if hub, ok := gm.hub.(interface{ BroadcastJSON(uint, map[string]interface{}) }); ok {
		hub.BroadcastJSON(roomID, map[string]interface{}{
			"type":            "game",
			"action":          "game_state_update",
			"game_session_id": gameState.GameSession.ID,
			"game_type":       gameState.GameSession.GameType,
			"host_id":         gameState.GameSession.HostID,
			"status":          status,
			"current_turn":    gameState.CurrentTurn,
			"players":         gameState.Players,
			"game_state":      gameState.GameData,
			"winner_id":       winnerID,
		})
		hub.BroadcastJSON(roomID, map[string]interface{}{
			"type":   "game",
			"action": "game_ended",
			"data": map[string]interface{}{
				"game_session_id": gameSessionID,
				"host_id":         gameState.GameSession.HostID,
				"winner_id":       winnerID,
				"reason":          status,
				"players":         gameState.Players,
				"game_state":      gameState.GameData,
			},
		})
	}

	delete(gm.activeGames, gameSessionID)
	delete(gm.roomActiveGames, roomID)

	log.Printf("🎮 [GameManager] Ended game %d (status: %s, winner: %v)", gameSessionID, status, winnerID)

	// Clear the game poster from the lobby session-preview card — reuses the same
	// "stop ticker, clear preview, reset to none" path LiveShare/Watch-From/upload
	// already use on stop, so a subsequent media switch sees a clean "none" state to
	// transition away from rather than a stale game poster.
	if msh := services.GetMediaSwitchHandler(); msh != nil {
		var watchSession models.WatchSession
		// Order by started_at DESC defensively — a room should only ever have one
		// active session under normal use, but picking the most recent one avoids
		// targeting a stale row if that invariant is ever violated.
		if err := gm.db.Where("room_id = ? AND ended_at IS NULL", roomID).Order("started_at DESC").First(&watchSession).Error; err == nil {
			msh.HandleMediaStop(watchSession.SessionID)
		}
	}

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

// GetPlayerHand returns a copy of the given player's current hand in the room's
// active game, if that game is a card game and this user is one of its players.
// Used to build private hand_update messages (websocket_handler.go) — the hand
// itself must never go through a room-wide broadcast.
func (gm *GameManager) GetPlayerHand(roomID uint, userID uint) ([]string, bool) {
	gm.mu.RLock()
	defer gm.mu.RUnlock()

	gameSessionID, exists := gm.roomActiveGames[roomID]
	if !exists {
		return nil, false
	}
	gameState, exists := gm.activeGames[gameSessionID]
	if !exists || gameState.Hands == nil {
		return nil, false
	}
	hand, ok := gameState.Hands[userID]
	if !ok {
		return nil, false
	}
	return append([]string{}, hand...), true
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

	return gm.endGameLocked(gameSessionID, winnerID, "forfeited")
}

// BroadcastGameState sends the current game state to all room members as a text frame.
// Must use BroadcastJSON (text), NOT BroadcastToRoomBinary — binary frames are routed
// to the video handler on the frontend and silently dropped.
func (gm *GameManager) BroadcastGameState(roomID uint) error {
	gameState, exists := gm.GetActiveGame(roomID)
	if !exists {
		return nil // game already ended; endGameLocked already broadcast the final state
	}

	message := map[string]interface{}{
		"type":            "game",
		"action":          "game_state_update",
		"game_session_id": gameState.GameSession.ID,
		"game_type":       gameState.GameSession.GameType,
		"host_id":         gameState.GameSession.HostID,
		"status":          gameState.GameSession.Status,
		"current_turn":    gameState.CurrentTurn,
		"players":         gameState.Players,
		"game_state":      gameState.GameData,
	}

	if hub, ok := gm.hub.(interface{ BroadcastJSON(uint, map[string]interface{}) }); ok {
		hub.BroadcastJSON(roomID, message)
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

	case "chess":
		state["fen"] = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
		state["turn"] = "w"
		state["status"] = "active"

	case "trivia":
		state["round"] = 0
		state["phase"] = "waiting"
		state["scores"] = map[string]interface{}{}
		state["answers"] = map[string]interface{}{}

	case "ludo":
		ludoBoard := ludoInitialBoard(playerCount)
		state["tokens"] = ludoBoard["tokens"]
		state["current_dice"] = 0
		state["awaiting_move"] = false
		state["consecutive_sixes"] = 0

	case "othello":
		state["board"] = othelloInitialBoard()

	case "checkers":
		state["board"] = checkersInitialBoard()
	}

	return state
}
