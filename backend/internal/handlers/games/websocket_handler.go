package games

import (
    "encoding/json"
    "fmt"
    "log"

    "wewatch-backend/internal/models"
    "wewatch-backend/internal/services"

    "gorm.io/gorm"
)

// gamePosterURL maps a game type to the same static thumbnail GameLobbyModal.jsx
// already shows in its game-picker list — reused as the lobby session-preview poster
// while that game is active, since none of these games have a video frame to extract
// a real one from.
func gamePosterURL(gameType string) string {
    switch gameType {
    case "tic_tac_toe":
        return "/images/ttt.webp"
    case "rock_paper_scissors":
        return "/images/rps.webp"
    case "chess":
        return "/images/chess.webp"
    case "trivia":
        return "/images/trivia.webp"
    case "doom":
        return "/images/doom.webp"
    case "space_shooter":
        return "/images/stellarswarm.webp"
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
    "space_shooter": 1,
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

    return map[string]interface{}{
        "type":   "game",
        "action": "game_started",
        "data": map[string]interface{}{
            "game_session_id": gameState.GameSession.ID,
            "game_type":       gameState.GameSession.GameType,
            "host_id":         gameState.GameSession.HostID,
            "players":         gameState.Players,
            "game_state":      gameState.GameSession.GameState,
        },
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
    default:
        h.sendError(client, fmt.Sprintf("unknown action: %s", action))
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
