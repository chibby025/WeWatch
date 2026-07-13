package games

import (
	"fmt"
	"log"
	"strings"
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
	TournamentManager *TournamentManager
	HotSeatManager    *HotSeatManager
	disconnectTimers  sync.Map // key: userID (uint) → *time.Timer; pending forfeit grace timers
}

// GameSessionState holds the runtime state of an active game
type GameSessionState struct {
	GameSession *models.GameSession
	Players     []models.Player
	CurrentTurn int
	GameData    map[string]interface{}

	// Set when this game session is a single match inside a tournament bracket
	// (tournament.go). Nil for ordinary standalone games. Lets the tournament
	// manager tie a finished game session back to its bracket match, though the
	// primary link is via TMatch.GameSessionID recorded at start time.
	TournamentMatchID *uint

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
		db:                db,
		activeGames:       make(map[uint]*GameSessionState),
		roomActiveGames:   make(map[uint]uint),
		hub:               hub,
		TournamentManager: NewTournamentManager(hub),
		HotSeatManager:    NewHotSeatManager(hub),
	}
}

// StartGame initiates a new game session
func (gm *GameManager) StartGame(roomID uint, hostID uint, sessionID *uint, gameType string, players []models.Player) (*models.GameSession, error) {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	if existingGameID, exists := gm.roomActiveGames[roomID]; exists {
		return nil, fmt.Errorf("room %d already has an active game (ID: %d)", roomID, existingGameID)
	}

	validGameTypes := map[string]bool{
		"tic_tac_toe": true, "rock_paper_scissors": true, "chess": true,
		"trivia": true, "doom": true, "space_shooter": true,
		"othello": true, "checkers": true, "crazy_eights": true, "ludo": true,
		"connect_four": true, "would_you_rather": true, "wordle": true,
		"uno": true, "quiplash": true,
		"typing_race": true, "blackjack": true, "battleship": true, "draw_guess": true,
		"vs_battle": true, "fowl_play": true,
		"boxing": true,
		"pool":   true,
		"penalty_shootout": true,
		"whot": true,
		// New games
		"hangman":             true,
		"glass_bridge":        true,
		"tug_of_war":          true,
		"red_light_green_light": true,
		"sudoku":              true,
		"ping_pong":           true,
		"air_hockey":          true,
		"space_attack":        true,
	}
	if !validGameTypes[gameType] {
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

	// Card games (and any game that must distribute hidden state before the first
	// move) need their hands dealt immediately here, then synced back onto the
	// GameSession.GameState snapshot the initial broadcast reads.
	switch gameType {
	case "crazy_eights":
		dealCrazyEights(gameState)
		gameState.GameSession.GameState = gameState.GameData
	case "uno":
		dealUno(gameState)
		gameState.GameSession.GameState = gameState.GameData
	case "whot":
		dealWhot(gameState)
		gameState.GameSession.GameState = gameState.GameData
	case "blackjack":
		dealBlackjack(gameState)
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

	// Games where all players act simultaneously (no strict per-player turn order).
	simultaneousGames := map[string]bool{
		"rock_paper_scissors": true,
		"trivia":              true,
		"would_you_rather":    true,
		"wordle":              true,
		"quiplash":            true,
		"typing_race":         true,
		"draw_guess":          true,
		"vs_battle":           true,   // both players lock moves simultaneously each turn
		"battleship":          true,   // placement phase: both players place freely; combat turn enforced internally via GameData["current_turn"]
		// New simultaneous games
		"hangman":               true, // any player can guess any letter
		"tug_of_war":            true, // all players pull; host ends round
		"red_light_green_light": true, // all players move/stop simultaneously
		"sudoku":                true, // all players solve same puzzle in parallel
		"ping_pong":             true, // internal phase validation restricts who acts
		"air_hockey":            true, // internal phase validation restricts who acts
	}
	if !simultaneousGames[gameState.GameSession.GameType] {
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
	case "connect_four":
		gameOver, winnerID, err = gm.processConnectFourMove(gameState, playerID, moveData)
	case "would_you_rather":
		gameOver, winnerID, err = gm.processWouldYouRatherMove(gameState, playerID, moveType, moveData)
	case "wordle":
		gameOver, winnerID, err = gm.processWordleMove(gameState, playerID, moveData)
	case "uno":
		gameOver, winnerID, err = gm.processUnoMove(gameState, playerID, moveType, moveData)
	case "quiplash":
		gameOver, winnerID, err = gm.processQuiplashMove(gameState, playerID, moveType, moveData)
	case "typing_race":
		gameOver, winnerID, err = gm.processTypingRaceMove(gameState, playerID, moveType, moveData)
	case "blackjack":
		gameOver, winnerID, err = gm.processBlackjackMove(gameState, playerID, moveType, moveData)
	case "battleship":
		gameOver, winnerID, err = gm.processBattleshipMove(gameState, playerID, moveType, moveData)
	case "draw_guess":
		gameOver, winnerID, err = gm.processDrawGuessMove(gameState, playerID, moveType, moveData)
	case "vs_battle":
		gameOver, winnerID, err = processVSBattleMove(gameState, playerID, moveType, moveData)
	case "boxing":
		gameOver, winnerID, err = gm.processBoxingMove(gameState, playerID, moveType, moveData)
	case "pool":
		gameOver, winnerID, err = gm.processPoolMove(gameState, playerID, moveType, moveData)
	case "whot":
		gameOver, winnerID, err = gm.processWhotMove(gameState, playerID, moveType, moveData)
	case "hangman":
		gameOver, winnerID, err = gm.processHangmanMove(gameState, playerID, moveData)
	case "glass_bridge":
		gameOver, winnerID, err = gm.processGlassBridgeMove(gameState, playerID, moveData)
	case "tug_of_war":
		gameOver, winnerID, err = gm.processTugOfWarMove(gameState, playerID, moveType, moveData)
	case "red_light_green_light":
		gameOver, winnerID, err = gm.processRedLightMove(gameState, playerID, moveType, moveData)
	case "sudoku":
		gameOver, winnerID, err = gm.processSudokuMove(gameState, playerID, moveData)
	case "ping_pong":
		gameOver, winnerID, err = gm.processPingPongMove(gameState, playerID, moveData)
	case "air_hockey":
		gameOver, winnerID, err = gm.processAirHockeyMove(gameState, playerID, moveData)
	case "space_attack":
		// Arcade iframe — no server-side move logic needed
		gameOver, winnerID, err = false, nil, nil
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

	// Blackjack and battleship manage their own turn pointer internally (a bust may
	// skip several players; battleship tracks current_turn in GameData) — the generic
	// "+1 mod N" advance would corrupt that, so they're excluded alongside RPS.
	selfManagedTurn := map[string]bool{
		"rock_paper_scissors": true,
		"blackjack":           true,
		"battleship":          true,
		"vs_battle":           true, // VS Battle phase+turn managed internally
		"boxing":              true, // Boxing manages attacker/defender swap internally
		"pool":                true, // Pool stays on same player after a legal pocket
	}
	if !gameOver && !selfManagedTurn[gameState.GameSession.GameType] {
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
		pub := publicGameData(gameState)
		hub.BroadcastJSON(roomID, map[string]interface{}{
			"type":            "game",
			"action":          "game_state_update",
			"game_session_id": gameState.GameSession.ID,
			"game_type":       gameState.GameSession.GameType,
			"host_id":         gameState.GameSession.HostID,
			"status":          status,
			"current_turn":    gameState.CurrentTurn,
			"players":         gameState.Players,
			"game_state":      pub,
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
				"game_state":      pub,
			},
		})
	}

	// Announce VS Battle winner to the whole room so RoomPageNew can display it.
	if gameState.GameSession.GameType == "vs_battle" && winnerID != nil {
		if hub, ok := gm.hub.(interface{ BroadcastJSON(uint, map[string]interface{}) }); ok {
			charNames := VSWinnerCharNames(gameState, *winnerID)
			var winner models.User
			winnerName := "Unknown"
			if err := gm.db.Select("username").First(&winner, *winnerID).Error; err == nil {
				winnerName = winner.Username
			}
			// Collect per-player battle stats
			playerStats := map[string]interface{}{}
			if players, err := vsBuildState(gameState); err == nil {
				for uid, ps := range players {
					key := fmt.Sprintf("%d", uid)
					playerStats[key] = map[string]interface{}{
						"damage_dealt":   ps.DamageDealt,
						"attacks_landed": ps.AttacksLanded,
						"blocks":         ps.Blocks,
						"counters":       ps.Counters,
						"biggest_hit":    ps.BiggestHit,
					}
				}
			}
			hub.BroadcastJSON(roomID, map[string]interface{}{
				"type":         "vs_battle_result",
				"winner_id":    *winnerID,
				"winner_name":  winnerName,
				"winner_chars": strings.Join(charNames, ", "),
				"player_stats": playerStats,
			})
		}
	}

	delete(gm.activeGames, gameSessionID)
	delete(gm.roomActiveGames, roomID)

	log.Printf("🎮 [GameManager] Ended game %d (status: %s, winner: %v)", gameSessionID, status, winnerID)

	// If this game was a tournament match, tell the tournament manager so it can
	// record the winner and advance the bracket. OnGameEnd only touches the
	// tournament's own mutex (never gm.mu), so calling it while gm.mu is held is safe.
	if gm.TournamentManager != nil {
		gm.TournamentManager.OnGameEnd(gameSessionID, winnerID)
	}

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

// HandlePlayerDisconnect handles player disconnection during a game.
// Starts a 30-second grace period before forfeiting so a page refresh
// doesn't immediately end the game. Cancelled by CancelDisconnectTimer
// when the player reconnects within the window.
func (gm *GameManager) HandlePlayerDisconnect(roomID uint, userID uint) error {
	gm.mu.Lock()

	gameSessionID, exists := gm.roomActiveGames[roomID]
	if !exists {
		gm.mu.Unlock()
		return nil
	}

	gameState, exists := gm.activeGames[gameSessionID]
	if !exists {
		gm.mu.Unlock()
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
		gm.mu.Unlock()
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
	capturedWinner := winnerID
	capturedSession := gameSessionID
	gm.mu.Unlock()

	// Cancel any previous timer for this user (e.g. double-disconnect edge case)
	if prev, loaded := gm.disconnectTimers.LoadAndDelete(userID); loaded {
		prev.(*time.Timer).Stop()
	}

	log.Printf("🎮 [GameManager] Player %d disconnected from game %d — 30s grace period started", userID, capturedSession)

	timer := time.AfterFunc(30*time.Second, func() {
		gm.disconnectTimers.Delete(userID)
		gm.mu.Lock()
		defer gm.mu.Unlock()
		if _, still := gm.activeGames[capturedSession]; !still {
			return // game already ended while we were waiting
		}
		log.Printf("🎮 [GameManager] Player %d grace period expired — forfeiting game %d", userID, capturedSession)
		gm.endGameLocked(capturedSession, capturedWinner, "forfeited")
	})
	gm.disconnectTimers.Store(userID, timer)

	return nil
}

// CancelDisconnectTimer cancels a pending forfeit timer for a reconnecting player.
func (gm *GameManager) CancelDisconnectTimer(userID uint) {
	if prev, loaded := gm.disconnectTimers.LoadAndDelete(userID); loaded {
		prev.(*time.Timer).Stop()
		log.Printf("🎮 [GameManager] Player %d reconnected — forfeit timer cancelled", userID)
	}
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
		"game_state":      publicGameData(gameState),
	}

	if hub, ok := gm.hub.(interface{ BroadcastJSON(uint, map[string]interface{}) }); ok {
		hub.BroadcastJSON(roomID, message)
	}
	return nil
}

// publicGameData returns the room-broadcastable view of a game's GameData, stripping
// any per-game hidden fields. Draw & Guess hides the secret word from every client
// except the drawer (who receives it via the private draw_word message); everything
// else broadcasts GameData unchanged (perfect-information games) — note card games
// already keep their hands OFF GameData entirely, so nothing extra is needed there.
func publicGameData(gameState *GameSessionState) map[string]interface{} {
	if gameState.GameSession != nil {
		switch gameState.GameSession.GameType {
		case "draw_guess":
			return drawGuessPublicState(gameState.GameData)
		case "vs_battle":
			return vsPublicGameData(gameState.GameData)
		case "hangman":
			return hangmanPublicState(gameState.GameData)
		case "glass_bridge":
			return glassBridgePublicState(gameState.GameData)
		case "sudoku":
			return sudokuPublicState(gameState.GameData)
		case "ping_pong":
			return pingPongPublicState(gameState.GameData)
		case "air_hockey":
			return airHockeyPublicState(gameState.GameData)
		}
	}
	return gameState.GameData
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
		state["dice_rolls"] = []interface{}{}
		state["remaining_moves"] = []interface{}{}
		state["awaiting_move"] = false
		state["doubles"] = false
		state["bonus_earned"] = false
		state["last_capture"] = false
		state["last_token_home"] = false
		state["last_roll_wasted"] = false

	case "othello":
		state["board"] = othelloInitialBoard()

	case "checkers":
		state["board"] = checkersInitialBoard()

	case "typing_race":
		for k, v := range typingRaceInitialState() {
			state[k] = v
		}

	case "battleship":
		// Per-player boards/ships_remaining are keyed by user ID, which isn't known
		// here — they're seeded lazily by ensureBattleshipState on the first move
		// (which has gameState.Players). Seed just the phase so the initial broadcast
		// tells the frontend to render the placement UI.
		state["phase"] = "placement"

	case "draw_guess":
		for k, v := range drawGuessInitialState() {
			state[k] = v
		}

	case "vs_battle":
		state["phase"] = "building"
		state["locked_moves"] = map[string]interface{}{}
		state["turn"] = 0

	case "would_you_rather":
		for k, v := range wyrInitialState(playerCount) {
			state[k] = v
		}

	case "hangman":
		for k, v := range hangmanInitialStatePC(playerCount) {
			state[k] = v
		}
	}

	return state
}
