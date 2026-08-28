package games

import (
	"fmt"
	"log"

	"wewatch-backend/internal/models"
	"wewatch-backend/internal/services"

	"gorm.io/gorm"
)

// gamePostersBaseURL is the same BunnyCDN origin DoomGame.jsx already
// hardcodes for its own assets — game posters live there too now, not bundled into
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
	case "quake3":
		return gamePostersBaseURL + "/quake3.webp"
	// case "micro_racing": // temporarily removed
	// 	return gamePostersBaseURL + "/v2/micro_racing.webp"
	case "obby_parkour":
		return gamePostersBaseURL + "/v2/obby_parkour.webp"
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
	case "fowl_play":
		return gamePostersBaseURL + "/fowl_play_v2.webp"
	// case "boxing": temporarily removed
	case "pool":
		return gamePostersBaseURL + "/pool.webp"
	// case "penalty_shootout": temporarily removed
	case "whot":
		return gamePostersBaseURL + "/whot.webp"
	case "hangman":
		return gamePostersBaseURL + "/hangman.webp"
	case "glass_bridge":
		return gamePostersBaseURL + "/glass_bridge.webp"
	case "tug_of_war":
		return gamePostersBaseURL + "/tug_of_war.webp"
	// case "red_light_green_light": temporarily removed
	case "sudoku":
		return gamePostersBaseURL + "/sudoku.webp"
	case "ping_pong":
		return gamePostersBaseURL + "/ping_pong.webp"
	case "air_hockey":
		return gamePostersBaseURL + "/air_hockey.webp"
	case "space_attack":
		return gamePostersBaseURL + "/space_attack.webp"
	case "toad_ball":
		return gamePostersBaseURL + "/v2/toad_ball.webp"
	case "rebus_round":
		return gamePostersBaseURL + "/v2/rebus_round.webp"
	case "four_frames":
		return gamePostersBaseURL + "/v2/four_frames.webp"
	// case "roulette": temporarily removed
	case "snakes_ladders":
		return gamePostersBaseURL + "/snakes_ladders.webp"
	case "mancala":
		return gamePostersBaseURL + "/mancala.webp"
	case "jigsaw":
		return gamePostersBaseURL + "/jigsaw_v2.webp"
	case "wordsmith":
		return gamePostersBaseURL + "/scrabble_v2.webp"
	case "backgammon":
		return gamePostersBaseURL + "/backgammon.webp"
	case "texas_holdem":
		return gamePostersBaseURL + "/texas_holdem.webp"
	// case "ramp_rush": // temporarily removed
	// 	return gamePostersBaseURL + "/ramp_rush.webp"
	case "golf":
		return gamePostersBaseURL + "/v2/golf.webp"
	case "rhythm_hero":
		return gamePostersBaseURL + "/v2/rhythm_hero.webp"
	case "dominoes":
		return gamePostersBaseURL + "/dominoes.webp"
	case "darts":
		return gamePostersBaseURL + "/darts.webp"
	case "bowling":
		return gamePostersBaseURL + "/bowling.webp"
	case "basketball":
		return gamePostersBaseURL + "/basketball.webp"
	case "archery":
		return gamePostersBaseURL + "/archery.webp"
	case "curling":
		return gamePostersBaseURL + "/curling.webp"
	case "slice_frenzy":
		return gamePostersBaseURL + "/slice_frenzy.webp"
	case "skeeball":
		return gamePostersBaseURL + "/skeeball.webp"
	default:
		return ""
	}
}

// arcadeGameTypes are single-player games where the host is the only
// participant — minPlayers below is relaxed to 1 for these. A map (not a
// single `if`) so the next arcade game added doesn't need another inline
// special case.
var arcadeGameTypes = map[string]bool{
	"doom":      true,
	"fowl_play": true,
	// "penalty_shootout": true, // temporarily removed
	"space_attack": true,
	"toad_ball":    true,
	"golf":         true,
	"rhythm_hero":  true,
	"slice_frenzy": true,
	"skeeball":     true,
	// Replaced the old real-time 2-6 player relay-based football with a
	// single-player 3D match (host plays vs AI, everyone else spectates) —
	// same host-only-ever shape as DOOM/Golf, so it moved from a real-time
	// multiplayer game into this map instead.
	"football": true,
}

// minPlayersOverride lets a genuinely multiplayer game still be launched
// solo (e.g. for testing, or a quick practice run) without being grouped
// into arcadeGameTypes -- that map has its own separate meaning ("host is
// the only participant ever") which doesn't apply to a true multiplayer
// game that simply also happens to support 1 player.
var minPlayersOverride = map[string]int{
	// "roulette": 1, // temporarily removed
	"would_you_rather": 1, // can play solo (host picks for the room as a group activity)
	"wordle":           1, // solo practice is valid
	"quiplash":         2, // needs at least 2 for the voting mechanic to work
	"typing_race":      1, // solo time-trial is valid
	"draw_guess":       1, // host can draw for the room even with no other guessers
	"jigsaw":           1, // fully cooperative — solo assembly is valid too
	"quake3":           1, // real N-player arena FPS, but solo (vs the empty arena/bots) is valid too
	// "micro_racing": 1, // temporarily removed — real N-player kart racer, but solo (vs AI bots) is valid too
	"obby_parkour": 1, // real N-player parkour course, but solo practice is valid too
}

// lowerScoreWinsGameTypes flips a hot-seat tournament's win condition —
// every other hot-seat game reports an arcade-style "higher is better"
// score, but golf's natural score is stroke count, where fewer is better.
var lowerScoreWinsGameTypes = map[string]bool{
	"golf": true,
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

	// Strip hidden state from initial/rehydration broadcasts.
	gameStateOut := map[string]interface{}(gameState.GameSession.GameState)
	switch gameState.GameSession.GameType {
	case "draw_guess":
		gameStateOut = drawGuessPublicState(gameState.GameSession.GameState)
	case "hangman":
		gameStateOut = hangmanPublicState(map[string]interface{}(gameState.GameSession.GameState))
	case "sudoku":
		gameStateOut = sudokuPublicState(map[string]interface{}(gameState.GameSession.GameState))
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
			// current_turn/status were missing here entirely — confirmed a
			// real bug (not just a defensive frontend default): a client
			// reconnecting mid-game (e.g. a dropped WS, code 1006) receives
			// this exact message to rehydrate, but with no current_turn the
			// frontend had nothing but a hardcoded 0 to fall back on — always
			// wrong past turn 0, silently corrupting isMyTurn/interactivity
			// for whichever player's connection blipped, well after the
			// board itself (game_state, correctly fresh above) had already
			// moved on. Included now so rehydration is genuinely complete.
			"current_turn": gameState.CurrentTurn,
			"status":       gameState.GameSession.Status,
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
	hand, gameSessionID, ok := h.gameManager.GetPlayerHand(roomID, userID)
	if !ok {
		return nil
	}
	return map[string]interface{}{
		"type":   "game",
		"action": "hand_update",
		"data": map[string]interface{}{
			"hand":            hand,
			"game_session_id": gameSessionID,
		},
	}
}

// sendHandUpdate sends userID their current private hand via a direct, single-user
// message — never a room broadcast, since every other player's hand must stay
// hidden. A no-op for any game without hands (GetPlayerHandMessage returns nil).
func (h *GameWebSocketHandler) sendHandUpdate(roomID uint, userID uint) {
	message := h.GetPlayerHandMessage(roomID, userID)
	if message == nil {
		// No-op for any non-card game (or a card game with no active hand for this
		// user) — this is the expected, common case on every move for every game
		// type that isn't Crazy Eights/Wordsmith, so it's deliberately silent here.
		return
	}
	handLen := -1
	if data, ok := message["data"].(map[string]interface{}); ok {
		if hand, ok := data["hand"].([]string); ok {
			handLen = len(hand)
		}
	}
	log.Printf("🐛 [DEBUG] sendHandUpdate: sending hand (len=%d) to user %d room %d", handLen, userID, roomID)
	if hub, ok := h.hub.(interface {
		BroadcastJSONToUser(uint, uint, map[string]interface{})
	}); ok {
		hub.BroadcastJSONToUser(userID, roomID, message)
	} else {
		log.Printf("🐛 [DEBUG] sendHandUpdate: h.hub does NOT implement BroadcastJSONToUser")
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
	case "create_hot_seat_tournament":
		h.handleCreateHotSeatTournament(client, messageData)
	case "record_hot_seat_score":
		h.handleRecordHotSeatScore(client, messageData)
	case "cancel_hot_seat_tournament":
		h.handleCancelHotSeatTournament(client, messageData)
	case "forfeit_hot_seat_tournament":
		h.handleForfeitHotSeatTournament(client, messageData)
	case "close_game":
		h.handleCloseGame(client, messageData)
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
		// username/color are cosmetic display fields, not required to start a
		// game — a raw (non-frontend) caller omitting either used to panic
		// this whole function via an unchecked type assertion (caught by the
		// outer defer/recover, but silently swallowing the start_game request
		// as a generic "internal error"). Safe comma-ok extraction with a
		// sensible default fixes this without changing behavior for any
		// well-formed request, which always includes both fields today.
		username, _ := playerMap["username"].(string)
		if username == "" {
			username = fmt.Sprintf("Player %d", userID)
		}
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

	// ✅ Arcade games (single-player) allow 1 player, multiplayer games require 2+
	// unless explicitly overridden via minPlayersOverride.
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

	gameStateBcast := map[string]interface{}(gameSession.GameState)
	if gameSession.GameType == "hangman" {
		gameStateBcast = hangmanPublicState(gameStateBcast)
	} else if gameSession.GameType == "sudoku" {
		// Without this, the puzzle-seeding fix above would broadcast the full
		// solved grid to every player the instant the game starts.
		gameStateBcast = sudokuPublicState(gameStateBcast)
	}

	// Apply per-game options from the start_game payload into the live in-memory
	// state so move handlers can read them. Also reflected in the initial broadcast
	// so every client sees the option immediately in game_state.
	if gameType == "ping_pong" {
		if noWalls, _ := data["no_walls"].(bool); noWalls {
			if gs, exists := h.gameManager.GetActiveGame(roomID); exists {
				gs.GameData["no_walls"] = true
				gs.GameSession.GameState["no_walls"] = true
			}
			gameStateBcast["no_walls"] = true
		}
	}
	// ramp_rush temporarily removed:
	// if gameType == "ramp_rush" {
	// 	if format, _ := data["format"].(string); format == "first_to_win" {
	// 		if gs, exists := h.gameManager.GetActiveGame(roomID); exists {
	// 			gs.GameData["format"] = "first_to_win"
	// 			gs.GameData["rounds_to_win"] = 1
	// 			gs.GameData["max_rounds"] = 20 // safety net against a pathological all-draws game, not a real target
	// 			gs.GameSession.GameState["format"] = "first_to_win"
	// 			gs.GameSession.GameState["rounds_to_win"] = 1
	// 			gs.GameSession.GameState["max_rounds"] = 20
	// 		}
	// 		gameStateBcast["format"] = "first_to_win"
	// 		gameStateBcast["rounds_to_win"] = 1
	// 		gameStateBcast["max_rounds"] = 20
	// 	}
	// }

	// current_turn/status were missing here entirely — the exact same real bug
	// GetActiveGameMessage's own doc comment above already describes and fixes
	// for the *rehydration* path, but this is the LIVE broadcast sent the
	// instant a game actually starts, to every already-connected client — a
	// separate code path that never got the same fix. Every game whose
	// starting player is always players[0] (CurrentTurn=0 at creation, the
	// common case) masked this completely, since the frontend's defensive
	// `?? 0` fallback happened to already match. Dominoes breaks that
	// coincidence on purpose (the highest-double holder goes first, which
	// dealDominoes can set to any player index) — when that's players[1] and
	// not players[0], every connected client silently defaulted to treating
	// players[0] as the current turn: the true current player (players[1])
	// never saw their own turn UI at all, and the other player, believing
	// (wrongly) it was their go, got a genuine, correctly-enforced
	// "not your turn" rejection the instant they tried to act — exactly
	// matching the reported symptom. Confirmed live via a raw 2-account WS
	// test before this fix (the captured game_started payload had no
	// current_turn anywhere), not assumed.
	currentTurn := 0
	if gs, exists := h.gameManager.GetActiveGame(roomID); exists {
		currentTurn = gs.CurrentTurn
	}

	message := map[string]interface{}{
		"type":   "game",
		"action": "game_started",
		"data": map[string]interface{}{
			"game_session_id": gameSession.ID,
			"game_type":       gameSession.GameType,
			"host_id":         hostID,
			"players":         players,
			"game_state":      gameStateBcast,
			"current_turn":    currentTurn,
			"status":          gameSession.Status,
		},
	}

	if hub, ok := h.hub.(interface {
		BroadcastJSON(uint, map[string]interface{})
	}); ok {
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
	// The game_state_update broadcast for this move already happened inside
	// ProcessMove itself (game_manager.go), atomically with the state mutation,
	// while gm.mu was still held — not here. Broadcasting it here instead, after
	// ProcessMove had already released the lock, used to leave a real race: two
	// players' moves land on two different goroutines, and nothing guaranteed
	// this second, unlocked broadcast step would fire in the same order the
	// mutations actually happened, so clients could end up seeing a stale
	// current_turn/board that momentarily disagreed with the server (and with
	// each other) — reported as "the Scrabble game sometimes gets the turn
	// wrong and locks both players out."
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

// CleanupRoomGame ends any active game for the room when the watch session ends.
func (h *GameWebSocketHandler) CleanupRoomGame(roomID uint) {
	h.gameManager.CleanupRoomGame(roomID)
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

	// Previously tried client.(ClientSend) requiring a GetSendChan() chan []byte
	// method — no concrete Client type in the codebase ever implemented that
	// method, so the assertion always silently failed and this function never
	// actually delivered anything to the client (only the log line below ever
	// fired). Fixed to use the same BroadcastJSONToUser mechanism already
	// proven working for sendHandUpdate/sendDrawerWord above.
	type ClientFields interface {
		GetRoomID() uint
		GetUserID() uint
	}
	if cf, ok := client.(ClientFields); ok {
		if hub, ok := h.hub.(interface {
			BroadcastJSONToUser(uint, uint, map[string]interface{})
		}); ok {
			hub.BroadcastJSONToUser(cf.GetUserID(), cf.GetRoomID(), message)
		}
	}

	log.Printf("⚠️ [GameWebSocketHandler] Error sent to user: %s", errorMsg)
}

// handleCloseGame broadcasts a game_closed event to all room members when the host
// closes a completed game's result screen. This ensures the winner banner / game
// overlay is dismissed for every client, not just the one that clicked Close.
// Only the host (or any participant in a completed game) can trigger this.
//
// This is ALSO the safety net for the much more common real case: the
// frontend's own generic "×" close button (VideoWatch.jsx's handleGameClose)
// only sends end_game for a game whose status is ALREADY terminal
// (finished/completed/forfeited/ended) — for any game still genuinely
// IN PROGRESS, clicking a plain "×" (rather than a dedicated "End Game"
// button, which several games — Tank Battle, Bomberman — never had at all)
// used to just clear that ONE client's own local state and send this same
// close_game message, with ZERO effect on the backend: gm.activeGames/
// gm.roomActiveGames kept the session marked active forever, since nothing
// ever called EndGame for it. StartGame's own "room already has an active
// game" guard then permanently blocked that room from starting anything —
// the same game OR a different one — until the server itself restarted, a
// real, confirmed root cause consistent with reports of games "not
// broadcasting"/turn state getting confused/stale after simply closing out
// of an unfinished game.
//
// Fixed here, not by auditing every individual game component's own close
// button — this is the one place every close_game message passes through
// regardless of which frontend path sent it. If the game this session
// belongs to is STILL active server-side, forfeit-end it first (identical
// logic to handleGameEnd's own forfeit path) before broadcasting the
// dismissal, so the backend and every client's UI agree the game is
// actually over.
func (h *GameWebSocketHandler) handleCloseGame(client interface{}, data map[string]interface{}) {
	type ClientFields interface {
		GetRoomID() uint
		GetUserID() uint
	}
	cf := client.(ClientFields)
	roomID := cf.GetRoomID()
	userID := cf.GetUserID()

	gameSessionID := uint(0)
	if v, ok := data["game_session_id"].(float64); ok {
		gameSessionID = uint(v)
	}

	// The frontend's plain "×" close doesn't always know/send a
	// game_session_id (VideoWatch.jsx's handleGameClose never includes one)
	// — look up the room's own currently-active game directly rather than
	// trusting a client-supplied ID, which is both more robust and covers
	// the common no-ID case.
	if activeState, exists := h.gameManager.GetActiveGame(roomID); exists {
		if gameSessionID == 0 || activeState.GameSession.ID == gameSessionID {
			gameSessionID = activeState.GameSession.ID
			var winnerID *uint
			for _, p := range activeState.Players {
				if p.UserID != userID {
					id := p.UserID
					winnerID = &id
					break
				}
			}
			if err := h.gameManager.EndGame(gameSessionID, winnerID, "forfeited"); err != nil {
				log.Printf("⚠️ [GameWebSocketHandler] handleCloseGame: failed to forfeit still-active game %d in room %d: %v", gameSessionID, roomID, err)
			} else {
				log.Printf("🎮 [GameWebSocketHandler] handleCloseGame forfeited a still-active game %d in room %d (closed without a proper end-game call)", gameSessionID, roomID)
			}
		}
	}

	if hub, ok := h.hub.(interface {
		BroadcastJSON(uint, map[string]interface{})
	}); ok {
		hub.BroadcastJSON(roomID, map[string]interface{}{
			"type":   "game",
			"action": "game_closed",
			"data": map[string]interface{}{
				"game_session_id": gameSessionID,
				"closed_by":       cf.GetUserID(),
			},
		})
	}
	log.Printf("🎮 [GameWebSocketHandler] game_closed broadcast for session %d in room %d", gameSessionID, roomID)
}

// handleCreateHotSeatTournament creates a hot-seat tournament for single-player arcade
// games (e.g. Fowl Play). Players take turns one at a time; scores are submitted via
// record_hot_seat_score after each turn. Highest score wins.
func (h *GameWebSocketHandler) handleCreateHotSeatTournament(client interface{}, data map[string]interface{}) {
	gameType, ok := data["game_type"].(string)
	if !ok {
		h.sendError(client, "missing game_type")
		return
	}
	playersData, ok := data["players"].([]interface{})
	if !ok || len(playersData) < 2 {
		h.sendError(client, "hot-seat tournament needs at least 2 players")
		return
	}

	// mode: "flat" (default — sequential turns, highest total score wins) or
	// "bracket" (real single-elimination — pairs play head-to-head matches,
	// higher score per match wins, loser is eliminated, ties replay via sudden
	// death). Anything else is rejected rather than silently defaulted, so a
	// frontend typo surfaces immediately instead of quietly running flat mode.
	mode, _ := data["mode"].(string)
	if mode == "" {
		mode = "flat"
	}
	if mode != "flat" && mode != "bracket" {
		h.sendError(client, "invalid tournament mode — must be 'flat' or 'bracket'")
		return
	}
	if mode == "bracket" && len(playersData) < 4 {
		h.sendError(client, "a bracket tournament needs at least 4 players")
		return
	}

	type ClientFields interface {
		GetRoomID() uint
		GetUserID() uint
	}
	cf := client.(ClientFields)
	roomID := cf.GetRoomID()
	hostID := cf.GetUserID()

	var players []models.Player
	for _, pd := range playersData {
		pm, ok := pd.(map[string]interface{})
		if !ok {
			continue
		}
		userID := uint(pm["user_id"].(float64))
		username, _ := pm["username"].(string)
		color, _ := pm["color"].(string)
		avatarURL, _ := pm["avatar_url"].(string)
		players = append(players, models.Player{UserID: userID, Username: username, Color: color, Avatar: avatarURL})
	}

	if h.gameManager.HotSeatManager == nil {
		h.sendError(client, "hot-seat tournaments unavailable")
		return
	}
	h.gameManager.HotSeatManager.CreateTournament(roomID, hostID, gameType, players, lowerScoreWinsGameTypes[gameType], mode)
	log.Printf("🏆 [HotSeat] Created %s tournament in room %d (%s, %d players)", mode, roomID, gameType, len(players))
}

// handleRecordHotSeatScore records a player's score after their Fowl Play (or any
// hot-seat arcade game) turn ends. The score comes from the iframe via postMessage
// and is forwarded here by the frontend.
func (h *GameWebSocketHandler) handleRecordHotSeatScore(client interface{}, data map[string]interface{}) {
	scoreVal, ok := data["score"].(float64)
	if !ok {
		h.sendError(client, "missing score")
		return
	}
	type ClientFields interface {
		GetRoomID() uint
		GetUserID() uint
	}
	cf := client.(ClientFields)
	roomID := cf.GetRoomID()
	playerID := cf.GetUserID()

	if h.gameManager.HotSeatManager == nil {
		return
	}
	h.gameManager.HotSeatManager.RecordScore(roomID, playerID, int(scoreVal))
}

// handleCancelHotSeatTournament cancels an active hot-seat tournament (host only).
func (h *GameWebSocketHandler) handleCancelHotSeatTournament(client interface{}, data map[string]interface{}) {
	type ClientFields interface {
		GetRoomID() uint
		GetUserID() uint
	}
	cf := client.(ClientFields)
	roomID := cf.GetRoomID()

	if h.gameManager.HotSeatManager == nil {
		return
	}
	h.gameManager.HotSeatManager.CancelTournament(roomID)
}

// handleForfeitHotSeatTournament ends the room's active hot-seat tournament
// early because the calling player chose to end it mid-tournament — the
// other (or best-scoring, if more than 2) remaining participant wins by
// forfeit. Any participant can trigger this, matching
// handleCancelHotSeatTournament's own precedent — not host-only.
func (h *GameWebSocketHandler) handleForfeitHotSeatTournament(client interface{}, data map[string]interface{}) {
	type ClientFields interface {
		GetRoomID() uint
		GetUserID() uint
	}
	cf := client.(ClientFields)
	roomID := cf.GetRoomID()
	playerID := cf.GetUserID()

	if h.gameManager.HotSeatManager == nil {
		return
	}
	h.gameManager.HotSeatManager.ForfeitTournament(roomID, playerID)
}
