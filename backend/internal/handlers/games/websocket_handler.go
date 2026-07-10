package games

import (
    "encoding/json"
    "fmt"
    "log"

    "wewatch-backend/internal/models"
    "wewatch-backend/internal/services"

    "gorm.io/gorm"
)

// gamePostersBaseURL is the same BunnyCDN origin DoomGame.jsx/ShooterGame.jsx already
// hardcode for their own assets — game posters live there too now, not bundled into
// the frontend package. The frontend's resolvePreviewUrl already passes any
// "starts with http" poster URL through unchanged, so this needs no frontend changes
// beyond GameLobbyModal.jsx's own (already-updated) image paths.
const gamePostersBaseURL = "https://letswatchout.b-cdn.net/games/posters"

// gamePosterURL maps a game type to the same static thumbnail GameLobbyModal.jsx
// already shows in its game-picker list — reused as the lobby session-preview poster
// while that game is active, since none of these games have a video frame to extract
// a real one from.
func gamePosterURL(gameType string) string {
    switch gameType {
    case "tic_tac_toe":
        return gamePostersBaseURL + "/ttt.webp"
    case "rock_paper_scissors":
        return gamePostersBaseURL + "/rps.webp"
    case "chess":
        return gamePostersBaseURL + "/chess.webp"
    case "trivia":
        return gamePostersBaseURL + "/trivia.webp"
    case "doom":
        return gamePostersBaseURL + "/doom.webp"
    case "space_shooter":
        return gamePostersBaseURL + "/stellarswarm.webp"
    case "othello":
        return gamePostersBaseURL + "/othello.webp"
    case "checkers":
        return gamePostersBaseURL + "/checkers.webp"
    case "crazy_eights":
        return gamePostersBaseURL + "/crazy_eights.webp"
    case "ludo":
        return gamePostersBaseURL + "/ludo.webp"
    case "connect_four":
        return gamePostersBaseURL + "/connect_four.webp"
    case "would_you_rather":
        return gamePostersBaseURL + "/would_you_rather.webp"
    case "wordle":
        return gamePostersBaseURL + "/wordle.webp"
    case "uno":
        return gamePostersBaseURL + "/uno.webp"
    case "quiplash":
        return gamePostersBaseURL + "/quiplash.webp"
    case "typing_race":
        return gamePostersBaseURL + "/typing_race.webp"
    case "blackjack":
        return gamePostersBaseURL + "/blackjack.webp"
    case "battleship":
        return gamePostersBaseURL + "/battleship.webp"
    case "draw_guess":
        return gamePostersBaseURL + "/draw_guess.webp"
    case "vs_battle":
        return gamePostersBaseURL + "/vs_battle.webp"
    default:
        return ""
    }
}

// arcadeGameTypes are single-player games where the host is the only
// participant — minPlayers below is relaxed to 1 for these. A map (not a
// single `if`) so the next arcade game added doesn't need another inline
// special case.
var arcadeGameTypes = map[string]bool{
    "doom": true,
}

// minPlayersOverride lets a genuinely multiplayer game still be launched
// solo (e.g. for testing, or a quick practice run) without being grouped
// into arcadeGameTypes -- that map has its own separate meaning ("host is
// the only participant ever") which doesn't apply to a true multiplayer
// game like space_shooter that simply also happens to support 1 player.
var minPlayersOverride = map[string]int{
    "space_shooter":    1,
    "would_you_rather": 1, // can play solo (host picks for the room as a group activity)
    "wordle":           1, // solo practice is valid
    "quiplash":         2, // needs at least 2 for the voting mechanic to work
    "typing_race":      1, // solo time-trial is valid
    "draw_guess":       1, // host can draw for the room even with no other guessers
}

type GameWebSocketHandler struct {
    gameManager *GameManager
    db          *gorm.DB
    hub         MessageHub
}

func NewGameWebSocketHandler(db *gorm.DB, hub MessageHub) *GameWebSocketHandler {
    return &GameWebSocketHandler{
        gameManager: NewGameManager(db, hub),
        db:          db,
        hub:         hub,
    }
}

// GetActiveGameMessage returns a "game_started"-shaped message for the room's
// currently active game, or nil if there isn't one. Used to rehydrate a
// client that connects (or joins the watch session) after a game already
// started — without this, such a client never learns a game is running at
// all, since game_started/game_state_update are one-shot broadcasts, not
// queryable state.
func (h *GameWebSocketHandler) GetActiveGameMessage(roomID uint) map[string]interface{} {
    gameState, exists := h.gameManager.GetActiveGame(roomID)
    if !exists || gameState.GameSession == nil {
        return nil
    }

    // Draw & Guess: strip the secret word so a late-joining guesser rehydrating
    // mid-round never receives the answer (the drawer gets it via draw_word instead).
    gameStateOut := map[string]interface{}(gameState.GameSession.GameState)
    if gameState.GameSession.GameType == "draw_guess" {
        gameStateOut = drawGuessPublicState(gameState.GameSession.GameState)
    }

    return map[string]interface{}{
        "type":   "game",
        "action": "game_started",
        "data": map[string]interface{}{
            "game_session_id": gameState.GameSession.ID,
            "game_type":       gameState.GameSession.GameType,
            "host_id":         gameState.GameSession.HostID,
            "players":         gameState.Players,
            "game_state":      gameStateOut,
        },
    }
}

// GetPlayerHandMessage returns a "hand_update"-shaped message carrying userID's
// current hand in roomID's active game, or nil if there's no active card game or
// this user isn't one of its players. Used both right after a card-game move and
// for late-join rehydration (websocket.go, alongside the generic
// GetActiveGameMessage) — without this, a player who reconnects mid-game would see
// the public board state but never their own hand.
func (h *GameWebSocketHandler) GetPlayerHandMessage(roomID uint, userID uint) map[string]interface{} {
    hand, ok := h.gameManager.GetPlayerHand(roomID, userID)
    if !ok {
        return nil
    }
    return map[string]interface{}{
        "type":   "game",
        "action": "hand_update",
        "data": map[string]interface{}{
            "hand": hand,
        },
    }
}

// sendHandUpdate sends userID their current private hand via a direct, single-user
// message — never a room broadcast, since every other player's hand must stay
// hidden. A no-op for any game without hands (GetPlayerHandMessage returns nil).
func (h *GameWebSocketHandler) sendHandUpdate(roomID uint, userID uint) {
    message := h.GetPlayerHandMessage(roomID, userID)
    if message == nil {
        return
    }
    if hub, ok := h.hub.(interface {
        BroadcastJSONToUser(uint, uint, map[string]interface{})
    }); ok {
        hub.BroadcastJSONToUser(userID, roomID, message)
    }
}

func (h *GameWebSocketHandler) HandleGameMessage(client interface{}, messageData map[string]interface{}) {
	// ✅ Panic recovery to prevent server crashes
	defer func() {
		if r := recover(); r != nil {
			log.Printf("🚨 [HandleGameMessage] PANIC RECOVERED: %v", r)
			log.Printf("📊 [HandleGameMessage] Message data: %+v", messageData)
			h.sendError(client, "internal error processing game message")
		}
	}()
	
	action, ok := messageData["action"].(string)
    if !ok {
        h.sendError(client, "missing action")
        return
    }

    switch action {
    case "start_game":
        h.handleGameStart(client, messageData)
    case "make_move":
        h.handleGameMove(client, messageData)
    case "end_game":
        h.handleGameEnd(client, messageData)
    case "relay_packet":
        h.handleRelayPacket(client, messageData)
    case "create_tournament":
        h.handleCreateTournament(client, messageData)
    default:
        h.sendError(client, fmt.Sprintf("unknown action: %s", action))
    }
}

// handleCreateTournament builds a single-elimination bracket (tournament.go) from the
// selected game type + player list and broadcasts the initial bracket. Matches are
// started individually afterward via the normal start_game path (the tournament links
// the resulting session to its match). Fully in-memory — no DB.
func (h *GameWebSocketHandler) handleCreateTournament(client interface{}, data map[string]interface{}) {
    gameType, ok := data["game_type"].(string)
    if !ok {
        h.sendError(client, "missing game_type")
        return
    }

    playersData, ok := data["players"].([]interface{})
    if !ok {
        h.sendError(client, "missing players")
        return
    }

    var players []models.Player
    for i, playerData := range playersData {
        playerMap, ok := playerData.(map[string]interface{})
        if !ok {
            continue
        }
        userID := uint(playerMap["user_id"].(float64))
        username, _ := playerMap["username"].(string)
        color, _ := playerMap["color"].(string)
        avatarURL, _ := playerMap["avatar_url"].(string)
        players = append(players, models.Player{
            UserID:   userID,
            Username: username,
            Color:    color,
            Avatar:   avatarURL,
            Position: i,
        })
    }

    if len(players) < 4 {
        h.sendError(client, "a tournament needs at least 4 players")
        return
    }
    if len(players) > 16 {
        h.sendError(client, "a tournament supports at most 16 players")
        return
    }

    type ClientFields interface {
        GetRoomID() uint
        GetUserID() uint
    }
    cf := client.(ClientFields)
    roomID := cf.GetRoomID()
    hostID := cf.GetUserID()

    if h.gameManager.TournamentManager == nil {
        h.sendError(client, "tournaments are unavailable")
        return
    }
    h.gameManager.TournamentManager.CreateTournament(roomID, hostID, gameType, players)
    log.Printf("🏆 [GameWebSocketHandler] Tournament created in room %d (%s, %d players)", roomID, gameType, len(players))
}

// sendDrawerWord privately delivers the current Draw & Guess secret word to the drawer
// only (never a room broadcast — every guesser must not see the answer). A no-op if the
// hub doesn't support single-user JSON delivery.
func (h *GameWebSocketHandler) sendDrawerWord(roomID uint, drawerID uint, word string) {
    if hub, ok := h.hub.(interface {
        BroadcastJSONToUser(uint, uint, map[string]interface{})
    }); ok {
        hub.BroadcastJSONToUser(drawerID, roomID, map[string]interface{}{
            "type":   "game",
            "action": "draw_word",
            "data": map[string]interface{}{
                "word": word,
            },
        })
    }
}

// handleRelayPacket is a dumb pipe for DOOM's own networking protocol (and any
// future real-multiplayer game built the same way): it never parses the
// opaque payload, just rebroadcasts it to every other client in the room.
// The DOOM engine's own net_wewatch.c module is the only thing that
// understands the bytes inside — this handler doesn't need to.
func (h *GameWebSocketHandler) handleRelayPacket(client interface{}, data map[string]interface{}) {
    payload, ok := data["payload"].(string)
    if !ok {
        h.sendError(client, "missing payload")
        return
    }

    type ClientFields interface {
        GetRoomID() uint
        GetUserID() uint
    }
    cf := client.(ClientFields)
    roomID := cf.GetRoomID()
    userID := cf.GetUserID()

    message := map[string]interface{}{
        "type":   "game",
        "action": "relay_packet",
        "data": map[string]interface{}{
            "payload": payload,
        },
    }

    if hub, ok := h.hub.(interface {
        BroadcastJSONExceptUser(uint, uint, map[string]interface{})
    }); ok {
        hub.BroadcastJSONExceptUser(roomID, userID, message)
    }
}

func (h *GameWebSocketHandler) handleGameStart(client interface{}, data map[string]interface{}) {
    gameType, ok := data["game_type"].(string)
    if !ok {
        h.sendError(client, "missing game_type")
        return
    }

    playersData, ok := data["players"].([]interface{})
    if !ok {
        h.sendError(client, "missing players")
        return
    }

    var players []models.Player
    for i, playerData := range playersData {
        playerMap, ok := playerData.(map[string]interface{})
        if !ok {
            continue
        }

        userID := uint(playerMap["user_id"].(float64))
        username := playerMap["username"].(string)
        color := playerMap["color"].(string)
        avatarURL, _ := playerMap["avatar_url"].(string)

        players = append(players, models.Player{
            UserID:   userID,
            Username: username,
            Color:    color,
            Avatar:   avatarURL,
            Position: i,
        })
    }

    // ✅ Arcade games (single-player) allow 1 player, multiplayer games require 2+
    // unless explicitly overridden (space_shooter: also playable solo).
    minPlayers := 2
    if arcadeGameTypes[gameType] {
        minPlayers = 1
    } else if override, ok := minPlayersOverride[gameType]; ok {
        minPlayers = override
    }

    if len(players) < minPlayers {
        h.sendError(client, fmt.Sprintf("at least %d player(s) required", minPlayers))
        return
    }

    type ClientFields interface {
        GetRoomID() uint
        GetUserID() uint
    }
    cf := client.(ClientFields)
    roomID := cf.GetRoomID()
    hostID := cf.GetUserID()

    gameSession, err := h.gameManager.StartGame(roomID, hostID, nil, gameType, players)
    if err != nil {
        h.sendError(client, fmt.Sprintf("failed to start game: %v", err))
        return
    }

    // Tournament linkage: if this room has an active tournament and these two players
    // form one of its pending matches, tie this game session to that match so the
    // bracket advances when it ends. Harmless no-op for ordinary (non-tournament) games.
    if h.gameManager.TournamentManager != nil && len(players) == 2 {
        h.gameManager.TournamentManager.LinkMatchSession(roomID, players[0].UserID, players[1].UserID, gameSession.ID)
    }

    message := map[string]interface{}{
        "type":   "game",
        "action": "game_started",
        "data": map[string]interface{}{
            "game_session_id": gameSession.ID,
            "game_type":       gameSession.GameType,
            "host_id":         hostID,
            "players":         players,
            "game_state":      gameSession.GameState,
        },
    }

    if hub, ok := h.hub.(interface{ BroadcastJSON(uint, map[string]interface{}) }); ok {
        hub.BroadcastJSON(roomID, message)
    }

    // Card games only: each player's hand is dealt synchronously inside StartGame
    // above, but it never goes into the public game_started broadcast (that would
    // leak every player's hand to every other player) — deliver it privately here
    // instead, one direct message per player.
    for _, p := range players {
        h.sendHandUpdate(roomID, p.UserID)
    }

    log.Printf("🎮 [GameWebSocketHandler] Game started: %d (type: %s, room: %d)", gameSession.ID, gameType, roomID)

    // Reflect the active game in the lobby's session-preview card. Best-effort: a room
    // without an active watch session (e.g. games are technically callable outside one)
    // or a game type with no matching static asset just skips this silently — never
    // blocks the game itself from starting.
    if posterURL := gamePosterURL(gameType); posterURL != "" {
        if msh := services.GetMediaSwitchHandler(); msh != nil {
            var watchSession models.WatchSession
            // Order by started_at DESC defensively — a room should only ever have one
            // active session under normal use, but picking the most recent one avoids
            // targeting a stale row if that invariant is ever violated.
            if err := h.db.Where("room_id = ? AND ended_at IS NULL", roomID).Order("started_at DESC").First(&watchSession).Error; err == nil {
                msh.HandleGameStart(watchSession.SessionID, posterURL)
            }
        }
    }
}

func (h *GameWebSocketHandler) handleGameMove(client interface{}, data map[string]interface{}) {
	// ✅ Safely extract game_session_id with nil check
	gameSessionIDRaw, ok := data["game_session_id"]
	if !ok || gameSessionIDRaw == nil {
		log.Printf("❌ [handleGameMove] Missing or nil game_session_id in data: %+v", data)
		h.sendError(client, "game_session_id is required")
		return
	}
	
	gameSessionIDFloat, ok := gameSessionIDRaw.(float64)
	if !ok {
		log.Printf("❌ [handleGameMove] game_session_id is not a number: %T %+v", gameSessionIDRaw, gameSessionIDRaw)
		h.sendError(client, "game_session_id must be a number")
		return
	}
	
	gameSessionID := uint(gameSessionIDFloat)
	moveType, _ := data["move_type"].(string)
	// Move fields are sent at the top level of data (not nested under "move_data").
	moveData := data

	type ClientFields interface {
		GetRoomID() uint
		GetUserID() uint
	}
	cf := client.(ClientFields)
	playerID := cf.GetUserID()

	err := h.gameManager.ProcessMove(gameSessionID, playerID, moveType, moveData)
	if err != nil {
		log.Printf("❌ [handleGameMove] ProcessMove failed for player %d, game %d: %v", playerID, gameSessionID, err)
		h.sendError(client, fmt.Sprintf("move failed: %v", err))
		return
	}

	roomID := cf.GetRoomID()
	// Broadcast updated state. If the game just ended, endGameLocked already sent
	// game_state_update + game_ended, so BroadcastGameState is a no-op (game removed).
	h.gameManager.BroadcastGameState(roomID)
	// Card games only: the acting player's own hand may have changed (a card
	// removed on play, a card added on draw) — refresh it privately. A no-op for
	// every other game type (GetPlayerHand finds no Hands map and returns false).
	h.sendHandUpdate(roomID, playerID)

	// Draw & Guess: a start_round move picks a new drawer + secret word. The word is
	// hidden from the public broadcast (drawGuessPublicState strips current_word) —
	// deliver it privately to the drawer only, right after the move is processed.
	if moveType == "start_round" {
		if gs, exists := h.gameManager.GetActiveGame(roomID); exists && gs.GameSession.GameType == "draw_guess" {
			word, _ := gs.GameData["current_word"].(string)
			drawerF, _ := gs.GameData["current_drawer"].(float64)
			if word != "" && drawerF != 0 {
				h.sendDrawerWord(roomID, uint(drawerF), word)
            }
		}
	}
}

func (h *GameWebSocketHandler) handleGameEnd(client interface{}, data map[string]interface{}) {
    gameSessionID := uint(data["game_session_id"].(float64))

    type ClientFields interface {
        GetRoomID() uint
        GetUserID() uint
    }
    cf := client.(ClientFields)
    roomID := cf.GetRoomID()
    userID := cf.GetUserID()

    gameState, exists := h.gameManager.GetActiveGame(roomID)
    if !exists {
        h.sendError(client, "no active game")
        return
    }

    // Any participant can forfeit — the OTHER player wins.
    var winnerID *uint
    for _, p := range gameState.Players {
        if p.UserID != userID {
            id := p.UserID
            winnerID = &id
            break
        }
    }

    err := h.gameManager.EndGame(gameSessionID, winnerID, "forfeited")
    if err != nil {
        h.sendError(client, fmt.Sprintf("failed to end game: %v", err))
        return
    }
    log.Printf("🎮 [GameWebSocketHandler] Player %d forfeited game %d in room %d", userID, gameSessionID, roomID)
}

func (h *GameWebSocketHandler) CleanupPlayerDisconnect(roomID uint, userID uint) {
    err := h.gameManager.HandlePlayerDisconnect(roomID, userID)
    if err != nil {
        log.Printf("⚠️ [GameWebSocketHandler] Error handling disconnect: %v", err)
    }
}

// CancelDisconnectGrace cancels a pending forfeit timer for a player who
// reconnected within the 30-second grace window.
func (h *GameWebSocketHandler) CancelDisconnectGrace(roomID uint, userID uint) {
    h.gameManager.CancelDisconnectTimer(userID)
}

func (h *GameWebSocketHandler) sendError(client interface{}, errorMsg string) {
    message := map[string]interface{}{
        "type":  "game",
        "error": errorMsg,
    }
    messageBytes, _ := json.Marshal(message)

    type ClientSend interface {
        GetSendChan() chan []byte
    }
    if cs, ok := client.(ClientSend); ok {
        select {
        case cs.GetSendChan() <- messageBytes:
        default:
        }
    }

    log.Printf("⚠️ [GameWebSocketHandler] Error sent to user: %s", errorMsg)
}
