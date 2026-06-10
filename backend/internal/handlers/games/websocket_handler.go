package games

import (
    "encoding/json"
    "fmt"
    "log"

    "wewatch-backend/internal/models"

    "gorm.io/gorm"
)

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
    default:
        h.sendError(client, fmt.Sprintf("unknown action: %s", action))
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

        players = append(players, models.Player{
            UserID:   userID,
            Username: username,
            Color:    color,
            Position: i,
        })
    }

    // ✅ Arcade games (single-player) allow 1 player, multiplayer games require 2+
    
	minPlayers := 2

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
            "players":         players,
            "game_state":      gameSession.GameState,
        },
    }

    if hub, ok := h.hub.(interface{ BroadcastJSON(uint, map[string]interface{}) }); ok {
        hub.BroadcastJSON(roomID, message)
    }

    log.Printf("🎮 [GameWebSocketHandler] Game started: %d (type: %s, room: %d)", gameSession.ID, gameType, roomID)
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
    hostID := cf.GetUserID()

    gameState, exists := h.gameManager.GetActiveGame(roomID)
    if !exists {
        h.sendError(client, "no active game")
        return
    }

    if gameState.GameSession.HostID != hostID {
        h.sendError(client, "only host can end game")
        return
    }

    err := h.gameManager.EndGame(gameSessionID, nil, "ended_by_host")
    if err != nil {
        h.sendError(client, fmt.Sprintf("failed to end game: %v", err))
        return
    }
    // endGameLocked already broadcasts game_state_update + game_ended to all clients.
    log.Printf("🎮 [GameWebSocketHandler] Host ended game %d in room %d", gameSessionID, roomID)
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
