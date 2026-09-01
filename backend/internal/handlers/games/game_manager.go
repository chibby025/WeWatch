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
	db                 *gorm.DB
	activeGames        map[uint]*GameSessionState
	roomActiveGames    map[uint]uint
	mu                 sync.RWMutex
	hub                MessageHub
	TournamentManager  *TournamentManager
	HotSeatManager     *HotSeatManager
	disconnectTimers   sync.Map // key: userID (uint) → *time.Timer; pending forfeit grace timers
	counterTimers      sync.Map // key: gameSessionID (uint) → *time.Timer; pending vs_battle counter-window auto-resolve timers
	fourFramesPrefetch sync.Map // key: "gameSessionID:roundIdx" (string) → fourFramesPrefetchResult; background-fetched next-round photos, consumed once by four_frames_start (see prefetchFourFramesRound in four_frames.go)
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

	// Rebus Round-only field. Deliberately kept OFF GameData and never
	// broadcast/persisted to GameSession.GameState — the whole game is "type
	// the hidden answer", so the correct answer for the currently-active
	// puzzle must never reach the wire until an explicit reveal, unlike every
	// perfect-information board game in this package (trivia included, whose
	// correct_index IS broadcast up front — acceptable there since 1-of-4
	// multiple choice isn't the actual test of skill; here the answer text
	// itself is). Set once at StartGame to a shuffled, fixed-for-this-session
	// order; GameData["round"] indexes directly into it (round N → index
	// N-1), same convention Trivia already uses for its own client-supplied
	// questions array.
	RebusPuzzles []RebusPuzzle

	// Four Frames-only field — same rationale and same "kept OFF GameData"
	// convention as RebusPuzzles above: the hidden answer word for the
	// currently-active round must never reach the wire pre-reveal. Unlike
	// RebusPuzzles (a fixed hand-authored/generated pattern per entry), each
	// round's 4 photo URLs are fetched live from the Pexels API when that
	// round starts (see four_frames.go) — only the *word list order* is fixed
	// per session here, not the photos themselves.
	FourFramesRounds []FourFramesRound

	// Four Frames-only — round index -> the optional 5th "alt view" photo
	// URL, when fetchFourFramesPhotos returned one. Deliberately kept OFF
	// GameData (same reasoning as above): revealing it early, before enough
	// wrong guesses justify it, would defeat the whole point of pacing it as
	// a later clue. Only copied into GameData["alt_photo_url"] — and
	// therefore only ever broadcast — once fourFramesAltPhotoAfterAttempts
	// is reached by any player. Absent entries (a round that only had 4
	// usable photos that round) are the normal, expected case, not an error.
	FourFramesAltPhotos map[int]string

	// Hide & Seek-only field. Deliberately kept OFF GameData and never
	// broadcast/persisted to GameSession.GameState — a Prop's chosen hiding
	// spot is the entire game's hidden information, and unlike Crazy
	// Eights' hands, nobody (not even other Props) ever needs this
	// delivered to them privately either — it just needs to never reach
	// the wire at all until the moment a Hunter's search_spot move finds
	// it (see hide_seek.go's file-level note). Keyed by player user ID,
	// value is the spot index (0..hideSeekSpotCount-1); an entry is
	// deleted the instant that player is found.
	HideSeekSpots map[uint]int
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
		"trivia": true, "doom": true, "quake3": true,
		"othello": true, "checkers": true, "crazy_eights": true, "ludo": true,
		"connect_four": true, "would_you_rather": true, "wordle": true,
		"uno": true, "quiplash": true,
		"typing_race": true, "blackjack": true, "battleship": true, "draw_guess": true,
		"vs_battle": true, "fowl_play": true,
		// "boxing": true, // temporarily removed — being redesigned as Phaser 3 + Colyseus real-time game
		"pool": true,
		// "penalty_shootout": true, // temporarily removed
		"whot": true,
		// New games
		"hangman":      true,
		"glass_bridge": true,
		"tug_of_war":   true,
		// "red_light_green_light": true, // temporarily removed
		"sudoku":       true,
		"ping_pong":    true,
		"air_hockey":   true,
		"space_attack": true,
		"toad_ball":    true,
		"rebus_round":  true,
		"four_frames":  true,
		// "roulette": true, // temporarily removed
		"snakes_ladders":  true,
		"mancala":         true,
		"jigsaw":          true,
		"wordsmith":       true,
		"backgammon":      true,
		"property_tycoon": true,
		"texas_holdem":    true,
		// "ramp_rush":    true, // temporarily removed — not enough time to finish/fix it
		"golf": true,
		// "micro_racing": true, // temporarily removed
		"obby_parkour": true,
		"teeworlds":    true,
		"rhythm_hero":  true,
		"dominoes":     true,
		"darts":        true,
		"bowling":      true,
		"basketball":   true,
		"archery":      true,
		"curling":      true,
		"slice_frenzy": true,
		"skeeball":     true,
		"tank_battle":  true,
		"bomberman":    true,
		"football":     true,
		"blob_battle":  true,
		"hide_seek":    true,
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
	// snakes_ladders positions are sized to len(players) with no hard cap in the
	// move logic, but 4 tokens is the realistic ceiling for a physical board —
	// same reasoning as ludo's cap above.
	if gameType == "snakes_ladders" && len(players) > 4 {
		return nil, fmt.Errorf("snakes and ladders supports at most 4 players")
	}
	// mancala's 14-pit board is hardcoded to exactly two sides (0-5/6 and
	// 7-12/13) — unlike ludo/snakes_ladders there's no way to generalize this
	// to more players, so it's a hard requirement, not just a sane ceiling.
	if gameType == "mancala" && len(players) != 2 {
		return nil, fmt.Errorf("mancala is a 2-player game")
	}
	// wordsmith's 15x15 board and 100-tile bag are only tuned/tested for the
	// classic 2-4 player range — same reasoning as ludo's cap above.
	if gameType == "wordsmith" && (len(players) < 2 || len(players) > 4) {
		return nil, fmt.Errorf("wordsmith supports 2-4 players")
	}
	// Backgammon's board/direction logic hardcodes player index 0 = White,
	// index 1 = Black — same hard 2-player requirement as mancala.
	if gameType == "backgammon" && len(players) != 2 {
		return nil, fmt.Errorf("backgammon is a 2-player game")
	}
	if gameType == "property_tycoon" && (len(players) < 2 || len(players) > 6) {
		return nil, fmt.Errorf("property tycoon supports 2-6 players")
	}
	if gameType == "texas_holdem" && (len(players) < 2 || len(players) > 8) {
		return nil, fmt.Errorf("texas hold'em supports 2-8 players")
	}
	// A double-six set (28 tiles, 7 dealt per player) only comfortably covers
	// 2-4 players — same reasoning as wordsmith's/mancala's own caps above.
	if gameType == "dominoes" && (len(players) < 2 || len(players) > 4) {
		return nil, fmt.Errorf("dominoes supports 2-4 players")
	}
	// Standard casual darts party format — same reasoning as other games'
	// player-count caps above.
	if gameType == "darts" && (len(players) < 2 || len(players) > 6) {
		return nil, fmt.Errorf("darts supports 2-6 players")
	}
	// A real 10-frame bowling game already takes a while solo — same casual
	// party-format cap as darts.
	if gameType == "bowling" && (len(players) < 2 || len(players) > 6) {
		return nil, fmt.Errorf("bowling supports 2-6 players")
	}
	// H.O.R.S.E needs at least 2 to have anyone to challenge; capped at 6 for
	// the same casual party-format reasoning as darts/bowling above — a real
	// game of H.O.R.S.E with more than a handful of players gets tedious
	// waiting through everyone's attempt queue.
	if gameType == "basketball" && (len(players) < 2 || len(players) > 6) {
		return nil, fmt.Errorf("basketball supports 2-6 players")
	}
	// Same casual party-format cap as darts/bowling/basketball above.
	if gameType == "archery" && (len(players) < 2 || len(players) > 6) {
		return nil, fmt.Errorf("archery supports 2-6 players")
	}
	// Real curling is always a head-to-head sport, and curlingResolveEnd's
	// own closest-stone-wins-the-end rule only makes sense for exactly two
	// competitors — same hard 2-player requirement as Mancala/Backgammon.
	if gameType == "curling" && len(players) != 2 {
		return nil, fmt.Errorf("curling is a 2-player game")
	}
	// Tank Battle is a genuine real-time free-for-all (each client owns and
	// self-reports its own tank; a shooter is the sole authority on whether
	// their own bullets land against whichever specific target they hit) —
	// this generalizes cleanly from 1v1 to N players since nothing about the
	// symmetric hit-reporting model assumes exactly one opponent. Capped at
	// 8 to match the fixed spawn-point/arena-size design in
	// TankBattleGame.jsx.
	if gameType == "tank_battle" && (len(players) < 2 || len(players) > 8) {
		return nil, fmt.Errorf("tank_battle supports 2-8 players")
	}
	// Bomberman's grid layout has exactly 4 fixed corner spawn points
	// (bombermanSpawnPoints) — capped there by design, and a real duel needs
	// at least 2.
	if gameType == "bomberman" && (len(players) < 2 || len(players) > 4) {
		return nil, fmt.Errorf("bomberman supports 2-4 players")
	}
	// Blob Battle is a genuine free-for-all — no team/pairing constraint,
	// just a sensible casual party-size cap.
	if gameType == "blob_battle" && (len(players) < 2 || len(players) > 8) {
		return nil, fmt.Errorf("blob_battle supports 2-8 players")
	}
	// Hide & Seek needs at least 1 hunter and 1 prop, which hideSeekNumHunters's
	// floor-of-1 already guarantees for any headcount >= 2; the upper bound
	// is the same casual party-size cap as blob_battle.
	if gameType == "hide_seek" && (len(players) < 2 || len(players) > 8) {
		return nil, fmt.Errorf("hide_seek supports 2-8 players")
	}
	// ramp_rush temporarily removed (see validGameTypes above) — this check is
	// now unreachable but left in place for when it's re-enabled.
	// if gameType == "ramp_rush" && len(players) != 2 {
	// 	return nil, fmt.Errorf("ramp_rush is a 2-player game")
	// }

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
	case "dominoes":
		dealDominoes(gameState)
		gameState.GameSession.GameState = gameState.GameData
	case "blackjack":
		dealBlackjack(gameState)
		gameState.GameSession.GameState = gameState.GameData
	case "wordsmith":
		dealWordsmith(gameState)
		gameState.GameSession.GameState = gameState.GameData
	case "texas_holdem":
		ensureTexasHoldemState(gameState)
		gameState.GameSession.GameState = gameState.GameData
	case "ping_pong":
		for k, v := range pingPongInitialState(players) {
			gameState.GameData[k] = v
		}
		gameState.GameSession.GameState = gameState.GameData
	case "air_hockey":
		for k, v := range airHockeyInitialState(players) {
			gameState.GameData[k] = v
		}
		gameState.GameSession.GameState = gameState.GameData
	case "pool":
		for k, v := range poolInitialGameData() {
			gameState.GameData[k] = v
		}
		gameState.GameSession.GameState = gameState.GameData
	case "tank_battle":
		playerIDs := make([]uint, len(players))
		for i, p := range players {
			playerIDs[i] = p.UserID
		}
		for k, v := range tankBattleInitialState(playerIDs) {
			gameState.GameData[k] = v
		}
		gameState.GameSession.GameState = gameState.GameData
	case "bomberman":
		playerIDs := make([]uint, len(players))
		for i, p := range players {
			playerIDs[i] = p.UserID
		}
		for k, v := range bombermanInitialState(playerIDs) {
			gameState.GameData[k] = v
		}
		gameState.GameSession.GameState = gameState.GameData
	case "blob_battle":
		playerIDs := make([]uint, len(players))
		for i, p := range players {
			playerIDs[i] = p.UserID
		}
		for k, v := range blobBattleInitialState(playerIDs) {
			gameState.GameData[k] = v
		}
		gameState.GameSession.GameState = gameState.GameData
	case "hide_seek":
		playerIDs := make([]uint, len(players))
		for i, p := range players {
			playerIDs[i] = p.UserID
		}
		gameState.HideSeekSpots = map[uint]int{}
		for k, v := range hideSeekInitialState(playerIDs) {
			gameState.GameData[k] = v
		}
		gameState.GameSession.GameState = gameState.GameData
	case "sudoku":
		ensureSudokuState(gameState)
		gameState.GameSession.GameState = gameState.GameData
	case "rebus_round":
		gameState.RebusPuzzles = rebusShuffledPuzzles()
		gameState.GameData["phase"] = "waiting"
		gameState.GameData["round"] = float64(0)
		gameState.GameData["total_puzzles"] = float64(len(gameState.RebusPuzzles))
		gameState.GameData["scores"] = map[string]interface{}{}
		gameState.GameSession.GameState = gameState.GameData
	case "four_frames":
		gameState.FourFramesRounds = fourFramesShuffledRounds()
		gameState.GameData["phase"] = "waiting"
		gameState.GameData["round"] = float64(0)
		gameState.GameData["total_rounds"] = float64(len(gameState.FourFramesRounds))
		gameState.GameData["scores"] = map[string]interface{}{}
		gameState.GameSession.GameState = gameState.GameData
	case "roulette":
		// Chips seeded lazily on first move; just set opening state here.
		gameState.GameData["phase"] = "betting"
		gameState.GameData["round"] = 1
		gameState.GameData["result"] = -1
		gameState.GameData["result_color"] = ""
		gameState.GameData["bets"] = map[string]interface{}{}
		gameState.GameData["chips"] = map[string]interface{}{}
		gameState.GameData["payouts"] = map[string]interface{}{}
		gameState.GameData["history"] = []interface{}{}
		gameState.GameSession.GameState = gameState.GameData
	case "would_you_rather":
		// Fixes a real bug: without this, gameState.GameData stays a fresh empty
		// map (see the GameSessionState field comments above) and the FIRST
		// "vote" move's ensureWyrState (would_you_rather.go) sees phase==nil and
		// calls wyrInitialState again — which reshuffles via rand.Perm and picks
		// a brand-new random first question, different from whatever question
		// initializeGameState already put on GameSession.GameState (and thus
		// already showed everyone in the initial game_started broadcast). The
		// visible symptom: the question players see at the very start silently
		// swaps to a different one the moment anyone casts the first vote.
		// Seeding GameData here (same pattern already used by wordsmith/
		// crazy_eights/etc. just above) means ensureWyrState's phase!=nil check
		// short-circuits on that first move, so the question never changes.
		for k, v := range wyrInitialState(len(players)) {
			gameState.GameData[k] = v
		}
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
		"vs_battle":           true, // both players lock moves simultaneously each turn
		"battleship":          true, // placement phase: both players place freely; combat turn enforced internally via GameData["current_turn"]
		// New simultaneous games
		"hangman":               true, // any player can guess any letter
		"tug_of_war":            true, // all players pull; host ends round
		"red_light_green_light": true, // all players move/stop simultaneously
		"sudoku":                true, // all players solve same puzzle in parallel
		"ping_pong":             true, // internal phase validation restricts who acts
		"air_hockey":            true, // internal phase validation restricts who acts
		"tank_battle":           true, // both tanks act simultaneously and continuously — no turn concept at all
		"bomberman":             true, // all players move/place bombs simultaneously and continuously — no turn concept at all
		"blob_battle":           true, // all players move continuously and simultaneously — no turn concept at all
		"hide_seek":             true, // any prop can hide, any hunter can search, at any time — no turn concept at all
		"roulette":              true, // all players bet freely; host-only spin/end enforced inside processRouletteMove
		"uno":                   true, // catch_uno can be sent by any player at any time; play/draw/uno enforced internally
		"jigsaw":                true, // fully cooperative — any player can pick up/place any unclaimed piece at any time
		"rebus_round":           true, // any player can submit "answer" at any time (unlimited retries); host-only rebus_start/reveal/rebus_end enforced internally
		"four_frames":           true, // same shape as rebus_round — any player can answer at any time; host-only four_frames_start/reveal/four_frames_end enforced internally. Added here from day one, unlike rebus_round which shipped without this and needed a same-day fix (2026-08-11) after a live test showed it locking every non-current-turn player out of "answer" entirely.
	}
	// view_ack (pool's own view-confirmation mechanism, see pool.go) is
	// exempt from the turn gate for every game type, not just simultaneous
	// ones — it's a purely informational "I've applied this state" ping, not
	// a gameplay action, and the NON-shooting player in a strictly
	// turn-based game (pool included) needs to be able to send it too.
	// shot_progress/game_event (pool's own live ball/cue-aim relays, ~10Hz/
	// ~4Hz while the shooter's own shot is rolling) are exempt for the same
	// reason PLUS a real, confirmed race: turn flips the instant the
	// authoritative "shot" move resolves, but the shooter's device can still
	// have a straggling shot_progress/game_event packet in flight at that
	// exact moment (network latency, or the tiny gap between the client's
	// own allStationary() check and the backend actually processing the
	// final report) — landing a beat AFTER CurrentTurn has already advanced.
	// These two move types are pure ephemeral relays with zero gameplay
	// effect regardless of who sends them (see processPoolShotProgress /
	// pool.go's game_event case — neither reads playerID for correctness),
	// so rejecting a late one gains nothing and previously surfaced as a
	// confusing "not your turn" toast on essentially every single turn
	// handover — reported live as "a lot of toast messages... this isn't
	// necessary in the pool game because the game already shows whose turn
	// it currently is". A generic exemption here (rather than adding pool to
	// simultaneousGames, which would incorrectly also let either player send
	// real "shot" moves out of turn) keeps this scoped to exactly the
	// harmless relay move types.
	// throw_progress (bowling's own live ball/pin relay, ~10Hz while the
	// active thrower's local Ammo.js physics is rolling — see bowling.go's
	// processBowlingThrowProgress) is exempt for the exact same reason as
	// pool's shot_progress: bowling hands the turn to the next player the
	// instant a throw settles (bowlingAdvanceToNextActivePlayer), but the
	// thrower's own client can still have one straggling throw_progress
	// packet in flight at that exact moment — landing a beat after
	// CurrentTurn already moved on. It's a pure ephemeral relay with zero
	// gameplay effect regardless of who sends it, so rejecting a late one
	// gains nothing and would just be a confusing failed send right as a
	// throw finishes.
	// basketball's "shoot_progress" is the same exemption once more — a live
	// ~10Hz relay of the shooter's own ball position while airborne (see
	// processBasketballMove in basketball.go); the actual "shoot" move that
	// decides make/miss and advances CurrentTurn is unaffected, so a
	// straggling packet arriving just after the turn passes is a harmless
	// no-op to reject, not worth a confusing failed-send right as a shot ends.
	turnGateExemptMoveTypes := map[string]bool{"view_ack": true, "shot_progress": true, "game_event": true, "throw_progress": true, "shoot_progress": true}
	if !turnGateExemptMoveTypes[moveType] && !simultaneousGames[gameState.GameSession.GameType] {
		currentPlayer := gameState.Players[gameState.CurrentTurn]
		if currentPlayer.UserID != playerID {
			return fmt.Errorf("not your turn")
		}
	}

	// Real-time relay messages from ping_pong / air_hockey arrive at ~20-30 Hz.
	// Skip DB writes for these volatile moves to avoid thousands of writes per minute.
	// jigsaw's piece_drag is the same idea at a much lower rate (~10-12 Hz,
	// only while a piece is actively being dragged) — a live position update,
	// not a discrete game action worth persisting to the move history. pool's
	// shot_progress is the same idea again (~10 Hz, only while a shot is
	// actively rolling) — see processPoolShotProgress in pool.go. pool's
	// game_event is the same idea once more, at the embedded engine's own
	// ~4Hz aim-input throttle — a purely cosmetic, opaque relay of the
	// shooter's live aim/cue-stick state while it's their turn, never a
	// discrete game action (see pool.go's game_event case).
	// tank_battle's "fire" is the same idea once more — a discrete but
	// high-ish-frequency (bounded only by fire rate, not a fixed tick) event
	// that every client locally simulates identically from the relayed
	// origin/angle/timestamp; nothing about it needs DB persistence, since a
	// late joiner has no use for historical bullets that have already
	// resolved one way or another. bowling's "throw_progress" is the same
	// idea once more — ~10Hz ball/pin transform snapshots from the active
	// thrower's own local physics (see processBowlingThrowProgress in
	// bowling.go); a late joiner gets the current standing-pin layout from
	// the (non-volatile, DB-persisted) "throw" move's own pin_mask instead.
	volatileRT := map[string]bool{"state_sync": true, "paddle_move": true, "mallet_move": true, "piece_drag": true, "shot_progress": true, "game_event": true, "fire": true, "ball_sync": true, "view_ack": true, "throw_progress": true, "shoot_progress": true}
	isVolatile := volatileRT[moveType] &&
		(gameState.GameSession.GameType == "ping_pong" || gameState.GameSession.GameType == "air_hockey" || gameState.GameSession.GameType == "jigsaw" || gameState.GameSession.GameType == "pool" || gameState.GameSession.GameType == "tank_battle" || gameState.GameSession.GameType == "bomberman" || gameState.GameSession.GameType == "blob_battle" || gameState.GameSession.GameType == "bowling" || gameState.GameSession.GameType == "basketball")

	gameMove := &models.GameMove{
		GameSessionID: gameSessionID,
		PlayerID:      playerID,
		MoveType:      moveType,
		MoveData:      moveData,
		CreatedAt:     time.Now(),
	}

	if !isVolatile {
		if err := gm.db.Create(gameMove).Error; err != nil {
			return fmt.Errorf("failed to record move: %w", err)
		}
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
	case "rebus_round":
		gameOver, winnerID, err = gm.processRebusRoundMove(gameState, playerID, moveType, moveData)
	case "four_frames":
		gameOver, winnerID, err = gm.processFourFramesMove(gameState, playerID, moveType, moveData)
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
	case "dominoes":
		gameOver, winnerID, err = gm.processDominoesMove(gameState, playerID, moveType, moveData)
	case "darts":
		gameOver, winnerID, err = gm.processDartsMove(gameState, playerID, moveType, moveData)
	case "bowling":
		gameOver, winnerID, err = gm.processBowlingMove(gameState, playerID, moveType, moveData)
	case "basketball":
		gameOver, winnerID, err = gm.processBasketballMove(gameState, playerID, moveType, moveData)
	case "archery":
		gameOver, winnerID, err = gm.processArcheryMove(gameState, playerID, moveType, moveData)
	case "curling":
		gameOver, winnerID, err = gm.processCurlingMove(gameState, playerID, moveType, moveData)
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
	case "tank_battle":
		gameOver, winnerID, err = gm.processTankBattleMove(gameState, playerID, moveData)
	case "bomberman":
		gameOver, winnerID, err = gm.processBombermanMove(gameState, playerID, moveData)
	case "football":
		// Arcade iframe (single-player 3D match vs AI, host-only) — no
		// server-side move logic needed, matching space_attack/toad_ball.
		gameOver, winnerID, err = false, nil, nil
	case "blob_battle":
		gameOver, winnerID, err = gm.processBlobBattleMove(gameState, playerID, moveData)
	case "hide_seek":
		gameOver, winnerID, err = gm.processHideSeekMove(gameState, playerID, moveData)
	case "space_attack":
		// Arcade iframe — no server-side move logic needed
		gameOver, winnerID, err = false, nil, nil
	case "toad_ball":
		// Self-contained canvas arcade game — score is reported client-side via
		// record_hot_seat_score for tournament mode; no server-side move logic needed
		gameOver, winnerID, err = false, nil, nil
	case "slice_frenzy":
		// Same as toad_ball — pure client-side canvas arcade, no server logic needed
		gameOver, winnerID, err = false, nil, nil
	case "skeeball":
		// Same as toad_ball — pure client-side canvas arcade, no server logic needed
		gameOver, winnerID, err = false, nil, nil
	case "rhythm_hero":
		// Self-contained Three.js canvas arcade game (note-highway rhythm game) —
		// score is reported client-side via record_hot_seat_score for tournament
		// mode, same as toad_ball/golf; no server-side move logic needed
		gameOver, winnerID, err = false, nil, nil
	case "roulette":
		gameOver, winnerID, err = gm.processRouletteMove(gameState, playerID, moveType, moveData)
	case "snakes_ladders":
		gameOver, winnerID, err = gm.processSnakesLaddersMove(gameState, playerID, moveData)
	case "mancala":
		gameOver, winnerID, err = gm.processMancalaMove(gameState, playerID, moveData)
	case "jigsaw":
		gameOver, winnerID, err = gm.processJigsawMove(gameState, playerID, moveType, moveData)
	case "wordsmith":
		gameOver, winnerID, err = gm.processWordsmithMove(gameState, playerID, moveType, moveData)
	case "backgammon":
		gameOver, winnerID, err = gm.processBackgammonMove(gameState, playerID, moveType, moveData)
	case "property_tycoon":
		gameOver, winnerID, err = gm.processPropertyTycoonMove(gameState, playerID, moveType, moveData)
	case "texas_holdem":
		gameOver, winnerID, err = gm.processTexasHoldemMove(gameState, playerID, moveType, moveData)
	// case "ramp_rush": // temporarily removed
	// 	gameOver, winnerID, err = gm.processRampRushMove(gameState, playerID, moveType, moveData)
	default:
		return fmt.Errorf("unknown game type: %s", gameState.GameSession.GameType)
	}

	if err != nil {
		return err
	}

	if !isVolatile {
		gameState.GameSession.GameState = gameState.GameData
		if err := gm.db.Model(&models.GameSession{}).Where("id = ?", gameSessionID).Update("game_state", gameState.GameSession.GameState).Error; err != nil {
			log.Printf("⚠️ [GameManager] Failed to update game state: %v", err)
		}
	}

	// A freshly-opened vs_battle counter window gets a server-side backstop
	// timer — see startVSCounterTimeout's own doc comment for why a purely
	// client-side countdown isn't enough on its own.
	if gameState.GameSession.GameType == "vs_battle" {
		if phase, _ := gameState.GameData["phase"].(string); phase == "counter_window" {
			if cs, ok := gameState.GameData["counter_state"].(map[string]interface{}); ok {
				durationMs := 3000
				if csType, _ := cs["type"].(string); csType == "stalemate" {
					durationMs = 1000
				}
				gm.startVSCounterTimeout(gameSessionID, gameState.GameSession.RoomID, durationMs)
			}
		}
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
		"ludo":                true, // Ludo manages its own turn (roll → move two-phase)
		"ping_pong":           true, // Real-time; no CurrentTurn pointer used
		"air_hockey":          true, // Real-time; no CurrentTurn pointer used
		"tank_battle":         true, // Real-time; no CurrentTurn pointer used
		"bomberman":           true, // Real-time; no CurrentTurn pointer used
		"blob_battle":         true, // Real-time; no CurrentTurn pointer used
		"hide_seek":           true, // Real-time; no CurrentTurn pointer used
		"backgammon":          true, // roll → move(s) → (auto-)pass; turn only advances when the backend decides dice are exhausted/unusable
		"property_tycoon":     true, // roll → land/resolve → (auto-)advance; doubles grant another roll, a pending buy/decline defers the advance
		"texas_holdem":        true, // action_on is managed directly (skips folded/all-in/busted players, reopens on a raise); never a simple +1 mod N
		"bowling":             true, // players finish their own 10 frames at very different paces (strikes finish faster) — bowlingAdvanceToNextActivePlayer skips anyone already done, a plain +1 mod N can't
		"basketball":          true, // a made free shot routes the turn through the whole attempt-queue of challengers before returning to the setter, and eliminated players must be skipped — none of that is a plain +1 mod N
		// "ramp_rush":        true, // temporarily removed — round resolution (both players must launch before advancing) manages CurrentTurn directly
	}
	if !gameOver && !selfManagedTurn[gameState.GameSession.GameType] {
		gameState.CurrentTurn = (gameState.CurrentTurn + 1) % len(gameState.Players)
	}

	if gameOver {
		if err := gm.endGameLocked(gameSessionID, winnerID, "completed"); err != nil {
			log.Printf("⚠️ [GameManager] Failed to end game: %v", err)
		}
	} else {
		// Broadcast the freshly-mutated state HERE, while gm.mu is still held for
		// this whole call, rather than releasing the lock and letting the caller
		// (websocket_handler.go's handleGameMove) call the separate
		// BroadcastGameState afterward. That gap was a real, confirmed race: two
		// players' moves land on two different goroutines, each briefly holding
		// gm.mu just long enough to mutate (e.g. advance CurrentTurn), then
		// release it and broadcast in a SEPARATE, unlocked step. Nothing
		// guarantees those two broadcasts go out to clients in the same order the
		// two mutations actually happened in — a slower goroutine's
		// now-stale broadcast could land at a client AFTER a newer one, silently
		// overwriting the correct "whose turn is it" state with an outdated one.
		// Every client (including the two players who just moved) would then
		// disagree with the server and with each other about whose turn it
		// really is — exactly the "both players stuck, neither can play, one
		// gets 'not your turn'" bug reported for Wordsmith. Broadcasting from
		// inside the same critical section that performed the mutation makes
		// the two operations atomic with respect to any other goroutine also
		// going through ProcessMove, so broadcast order is now guaranteed to
		// match mutation order.
		gm.broadcastGameStateLocked(gameState)
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
	if hub, ok := gm.hub.(interface {
		BroadcastJSON(uint, map[string]interface{})
	}); ok {
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
		if hub, ok := gm.hub.(interface {
			BroadcastJSON(uint, map[string]interface{})
		}); ok {
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
	lastLoggedTurnState.Delete(gameSessionID)
	gm.clearFourFramesPrefetch(gameSessionID)

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

// CleanupRoomGame silently removes the active game for a room when the watch session ends.
// Does NOT broadcast game_ended — the session_ended broadcast handles client navigation.
func (gm *GameManager) CleanupRoomGame(roomID uint) {
	gm.mu.Lock()
	defer gm.mu.Unlock()
	gameSessionID, exists := gm.roomActiveGames[roomID]
	if !exists {
		return
	}
	if gs, ok := gm.activeGames[gameSessionID]; ok && gs.GameSession != nil {
		gm.db.Model(gs.GameSession).Updates(map[string]interface{}{
			"status":   "completed",
			"ended_at": time.Now(),
		})
	}
	delete(gm.activeGames, gameSessionID)
	delete(gm.roomActiveGames, roomID)
	lastLoggedTurnState.Delete(gameSessionID)
}

// GetPlayerHand returns a copy of the given player's current hand in the room's
// active game (plus that game's session ID), if that game is a card game and
// this user is one of its players. Used to build private hand_update messages
// (websocket_handler.go) — the hand itself must never go through a room-wide
// broadcast. The session ID is returned specifically so the caller can stamp
// it onto the outgoing message: unlike game_state_update/game_ended (which go
// through the shared, worker-pooled BroadcastToRoom and got a session-ID guard
// on the frontend earlier), hand_update is sent via a direct per-user channel
// write with no equivalent protection — a card game ending, then a different
// card game starting shortly after with no page refresh in between, can let a
// hand_update from the OLDER game arrive late and silently overwrite the new
// game's correct rack with the old game's leftover (sometimes empty) hand.
func (gm *GameManager) GetPlayerHand(roomID uint, userID uint) ([]string, uint, bool) {
	gm.mu.RLock()
	defer gm.mu.RUnlock()

	gameSessionID, exists := gm.roomActiveGames[roomID]
	if !exists {
		return nil, 0, false
	}
	gameState, exists := gm.activeGames[gameSessionID]
	if !exists || gameState.Hands == nil {
		return nil, 0, false
	}
	hand, ok := gameState.Hands[userID]
	if !ok {
		return nil, 0, false
	}
	return append([]string{}, hand...), gameSessionID, true
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
//
// Only safe to call when the caller does NOT already hold gm.mu (it acquires its
// own read lock via GetActiveGame). A caller that already holds gm.mu — e.g.
// ProcessMove after mutating state, or startVSCounterTimeout's timer callback —
// must call broadcastGameStateLocked directly instead, using the gameState
// pointer it already has; calling this method from inside an already-held
// gm.mu.Lock() would deadlock (sync.RWMutex's RLock() blocks on any pending/held
// Lock(), including one held by the very same goroutine).
func (gm *GameManager) BroadcastGameState(roomID uint) error {
	gameState, exists := gm.GetActiveGame(roomID)
	if !exists {
		return nil // game already ended; endGameLocked already broadcast the final state
	}
	gm.broadcastGameStateLocked(gameState)
	return nil
}

// broadcastGameStateLocked builds and sends the game_state_update broadcast for
// gameState. Performs no locking of its own — the caller must already hold
// gm.mu (for read or write). Exists so a mutation and its resulting broadcast
// can happen atomically within the same gm.mu critical section: broadcasting
// only after releasing the lock (the old behavior) left a real gap where two
// concurrent movers' mutate-then-broadcast sequences could interleave, so the
// two resulting broadcasts didn't necessarily reach clients in the same order
// the mutations actually happened — clients could end up disagreeing with the
// server (and each other) about whose turn it was.
// lastLoggedTurnState tracks, per game session, the last (current_turn,
// state_version) pair we actually logged — used by broadcastGameStateLocked
// below to print one short line only when either value genuinely changes,
// instead of nothing at all for state_version (buried deep inside the
// game_state JSON, never visible in the Hub's own truncated preview log) or
// a line on every single high-frequency broadcast (e.g. Pool's 10Hz
// shot_progress relay, which never changes either value). This is what lets
// a backend log capture directly answer "is this shot actually stuck, or are
// these legitimate back-to-back turns for the same player" without needing
// the full, noisy per-tick game_state dump.
var lastLoggedTurnState sync.Map // gameSessionID(uint) -> "turn|state_version" string

func (gm *GameManager) broadcastGameStateLocked(gameState *GameSessionState) {
	stateVersion := interface{}(nil)
	if gameState.GameData != nil {
		stateVersion = gameState.GameData["state_version"]
	}
	turnKey := fmt.Sprintf("%d|%v", gameState.CurrentTurn, stateVersion)
	sessionID := gameState.GameSession.ID
	if prev, ok := lastLoggedTurnState.Load(sessionID); !ok || prev.(string) != turnKey {
		lastLoggedTurnState.Store(sessionID, turnKey)
		log.Printf("🎮 [GameManager] state change: session=%d type=%s turn=%d state_version=%v", sessionID, gameState.GameSession.GameType, gameState.CurrentTurn, stateVersion)
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

	if hub, ok := gm.hub.(interface {
		BroadcastJSON(uint, map[string]interface{})
	}); ok {
		hub.BroadcastJSON(gameState.GameSession.RoomID, message)
	}
}

// startVSCounterTimeout schedules a server-side backstop for a vs_battle
// counter window. The frontend already has the responsible player's own
// client auto-submit a choice when its local countdown reaches zero — but
// that's a purely client-side timer with no server enforcement: if that
// specific client's tab is backgrounded (browsers throttle setInterval
// heavily in inactive tabs), the app crashes, or the connection drops,
// nothing ever sends the resolving move, and every connected client's
// counter-window modal stays open indefinitely (it's gated purely on the
// server-broadcast `phase`, which never changes). Mirrors the exact
// time.AfterFunc + re-lock + activeGames-still-exists pattern already
// proven in HandlePlayerDisconnect's forfeit-grace-timer above.
func (gm *GameManager) startVSCounterTimeout(gameSessionID uint, roomID uint, durationMs int) {
	// Cancel any previous pending timer for this session — a fresh counter
	// window superseding an old one (shouldn't normally overlap, but this
	// keeps a stray duplicate schedule from ever double-firing).
	if prev, loaded := gm.counterTimers.LoadAndDelete(gameSessionID); loaded {
		prev.(*time.Timer).Stop()
	}
	// Grace period on top of the frontend's own visual countdown so this only
	// ever fires as a genuine backstop — under normal conditions the
	// responsible player's client auto-submits well before this elapses.
	wait := time.Duration(durationMs+2000) * time.Millisecond
	timer := time.AfterFunc(wait, func() {
		gm.counterTimers.Delete(gameSessionID)
		gm.mu.Lock()
		defer gm.mu.Unlock()
		gameState, exists := gm.activeGames[gameSessionID]
		if !exists {
			return // game already ended while we were waiting
		}
		resolved, err := vsResolveCounterTimeout(gameState)
		if err != nil {
			log.Printf("⚠️ [GameManager] vs_battle counter timeout resolve error (game %d): %v", gameSessionID, err)
			return
		}
		if !resolved {
			return // a real player choice already closed this window — nothing to do
		}
		gameState.GameSession.GameState = gameState.GameData
		if err := gm.db.Model(&models.GameSession{}).Where("id = ?", gameSessionID).Update("game_state", gameState.GameSession.GameState).Error; err != nil {
			log.Printf("⚠️ [GameManager] Failed to persist vs_battle counter-timeout state: %v", err)
		}
		log.Printf("🎮 [GameManager] VS Battle counter window in game %d expired unanswered — auto-resolved", gameSessionID)
		// Must use the unlocked helper, not the public BroadcastGameState — this
		// callback already holds gm.mu.Lock() (deferred unlock above), and
		// BroadcastGameState's GetActiveGame call acquires a fresh gm.mu.RLock(),
		// which would block forever waiting on the write lock this very
		// goroutine is still holding (a self-deadlock, since only this same
		// goroutine's own deferred Unlock() could ever release it). This was a
		// real, unconditional freeze of the entire GameManager — every future
		// StartGame/ProcessMove call across every room blocks on gm.mu forever —
		// triggered any time a VS Battle counter window actually times out
		// unanswered, not just a theoretical risk.
		gm.broadcastGameStateLocked(gameState)
	})
	gm.counterTimers.Store(gameSessionID, timer)
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
		case "blackjack":
			return blackjackPublicState(gameState.GameData)
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

	case "snakes_ladders":
		state["positions"] = snakesLaddersInitialPositions(playerCount)

	case "mancala":
		state["board"] = mancalaInitialBoard()

	case "backgammon":
		state["board"] = backgammonInitialBoard()
		state["bar"] = map[string]interface{}{"0": 0, "1": 0}
		state["borne_off"] = map[string]interface{}{"0": 0, "1": 0}
		state["dice"] = []interface{}{}
		state["remaining_dice"] = []interface{}{}
		state["awaiting_roll"] = true

	case "property_tycoon":
		cash := map[string]interface{}{}
		positions := map[string]interface{}{}
		jail := map[string]interface{}{}
		getOutFree := map[string]interface{}{}
		bankrupt := map[string]interface{}{}
		for i := 0; i < playerCount; i++ {
			key := fmt.Sprintf("%d", i)
			cash[key] = ptStartingCash
			positions[key] = 0
			jail[key] = map[string]interface{}{"in_jail": false, "turns": 0}
			getOutFree[key] = 0
			bankrupt[key] = false
		}
		state["cash"] = cash
		state["positions"] = positions
		state["properties"] = map[string]interface{}{}
		state["jail"] = jail
		state["get_out_free"] = getOutFree
		state["bankrupt"] = bankrupt
		state["dice"] = []interface{}{}
		state["awaiting_roll"] = true
		state["pending_purchase"] = nil
		state["doubles_count"] = 0
		state["last_event"] = ""

		// ramp_rush temporarily removed:
		// case "ramp_rush":
		// 	for k, v := range rampRushInitialState() {
		// 		state[k] = v
		// 	}
	}

	return state
}
