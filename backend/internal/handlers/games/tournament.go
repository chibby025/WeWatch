package games

import (
	"fmt"
	"log"
	"sync"

	"wewatch-backend/internal/models"
)

// Tournament mode: single-elimination brackets over any of the 2-player games.
// Fully in-memory (no DB) — the same design as GameManager's activeGames map. A
// tournament orchestrates a sequence of ordinary GameSessions; each match's winner
// (reported via GameManager.endGameLocked → OnGameEnd) advances to the next round.
//
// Matches are NOT auto-started: the host explicitly starts each pending match (via
// the frontend's "Start This Match" button, which triggers a normal start_game). The
// tournament links that resulting GameSession back to the match via TournamentMatchID
// on GameSessionState.

type TMatch struct {
	Index         int            `json:"index"`
	Player1       *models.Player `json:"player1"`
	Player2       *models.Player `json:"player2"`
	WinnerID      *uint          `json:"winner_id,omitempty"`
	GameSessionID *uint          `json:"game_session_id,omitempty"`
	Status        string         `json:"status"` // "pending" | "active" | "bye" | "completed"
}

type TournamentState struct {
	ID           uint            `json:"id"`
	RoomID       uint            `json:"room_id"`
	GameType     string          `json:"game_type"`
	HostID       uint            `json:"host_id"`
	Players      []models.Player `json:"players"`
	Rounds       [][]TMatch      `json:"rounds"`
	CurrentRound int             `json:"current_round"`
	Status       string          `json:"status"` // "active" | "completed"
	WinnerID     *uint           `json:"winner_id,omitempty"`
}

type TournamentManager struct {
	mu          sync.RWMutex
	tournaments map[uint]*TournamentState // keyed by tournament ID
	roomToTour  map[uint]uint             // roomID → active tournament ID
	nextID      uint
	hub         MessageHub
}

func NewTournamentManager(hub MessageHub) *TournamentManager {
	return &TournamentManager{
		tournaments: make(map[uint]*TournamentState),
		roomToTour:  make(map[uint]uint),
		nextID:      1,
		hub:         hub,
	}
}

// nextPowerOfTwo returns the smallest power of two >= n (min 1).
func nextPowerOfTwo(n int) int {
	p := 1
	for p < n {
		p <<= 1
	}
	return p
}

// buildFirstRound seeds round 0. If the player count isn't a power of two, the top
// seeds (earlier in the players slice) receive byes so the round-2 count is a clean
// power of two. Concretely: with `byes` byes, the first `byes` players auto-advance,
// and the remaining players are paired up.
func buildFirstRound(players []models.Player) []TMatch {
	n := len(players)
	bracketSize := nextPowerOfTwo(n)
	byes := bracketSize - n

	var matches []TMatch
	idx := 0

	// Players granted a bye advance automatically (a completed "bye" match with a
	// single player and that player as the winner).
	byePlayers := players[:byes]
	rest := players[byes:]

	for i := range byePlayers {
		p := byePlayers[i]
		wid := p.UserID
		matches = append(matches, TMatch{
			Index:    idx,
			Player1:  &byePlayers[i],
			Player2:  nil,
			WinnerID: &wid,
			Status:   "bye",
		})
		idx++
	}

	for i := 0; i+1 < len(rest); i += 2 {
		p1 := rest[i]
		p2 := rest[i+1]
		matches = append(matches, TMatch{
			Index:   idx,
			Player1: &p1,
			Player2: &p2,
			Status:  "pending",
		})
		idx++
	}

	return matches
}

// CreateTournament builds the full first round and registers the tournament.
func (tm *TournamentManager) CreateTournament(roomID, hostID uint, gameType string, players []models.Player) *TournamentState {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	id := tm.nextID
	tm.nextID++

	t := &TournamentState{
		ID:           id,
		RoomID:       roomID,
		GameType:     gameType,
		HostID:       hostID,
		Players:      players,
		CurrentRound: 0,
		Status:       "active",
	}
	t.Rounds = [][]TMatch{buildFirstRound(players)}
	tm.tournaments[id] = t
	tm.roomToTour[roomID] = id

	log.Printf("🏆 [Tournament] Created #%d in room %d (%s, %d players)", id, roomID, gameType, len(players))

	// Byes may already fully decide round 0 (e.g. 3 players: 1 bye + 1 match — round
	// still has a real match; but 2 players from an odd higher count could be all byes).
	tm.maybeAdvanceRoundLocked(t)
	return t
}

// GetTournamentForRoom returns the active tournament in a room, if any.
func (tm *TournamentManager) GetTournamentForRoom(roomID uint) (*TournamentState, bool) {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	id, ok := tm.roomToTour[roomID]
	if !ok {
		return nil, false
	}
	t, ok := tm.tournaments[id]
	return t, ok
}

// LinkMatchSession records that a started GameSession belongs to a specific pending
// match, so OnGameEnd can find it later. Called from the game-start path when a
// tournament match is being played. Returns the match index, or -1 if not found.
func (tm *TournamentManager) LinkMatchSession(roomID uint, player1ID, player2ID, gameSessionID uint) int {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	id, ok := tm.roomToTour[roomID]
	if !ok {
		return -1
	}
	t := tm.tournaments[id]
	round := t.Rounds[t.CurrentRound]
	for i := range round {
		m := &round[i]
		if m.Status != "pending" || m.Player1 == nil || m.Player2 == nil {
			continue
		}
		if (m.Player1.UserID == player1ID && m.Player2.UserID == player2ID) ||
			(m.Player1.UserID == player2ID && m.Player2.UserID == player1ID) {
			gsid := gameSessionID
			m.GameSessionID = &gsid
			m.Status = "active"
			tm.broadcastLocked(t)
			return m.Index
		}
	}
	return -1
}

// OnGameEnd is called after any game ends. If that game session was a tournament
// match, record its winner and advance the bracket.
func (tm *TournamentManager) OnGameEnd(gameSessionID uint, winnerID *uint) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	for _, t := range tm.tournaments {
		if t.Status != "active" {
			continue
		}
		round := t.Rounds[t.CurrentRound]
		for i := range round {
			m := &round[i]
			if m.GameSessionID != nil && *m.GameSessionID == gameSessionID && m.Status == "active" {
				// A draw/forfeit with no winner defaults to player1 advancing so the
				// bracket never stalls (a tournament must always produce a winner).
				if winnerID == nil && m.Player1 != nil {
					wid := m.Player1.UserID
					m.WinnerID = &wid
				} else {
					m.WinnerID = winnerID
				}
				m.Status = "completed"
				log.Printf("🏆 [Tournament] Match %d of #%d done, winner: %v", m.Index, t.ID, m.WinnerID)
				tm.maybeAdvanceRoundLocked(t)
				return
			}
		}
	}
}

// maybeAdvanceRoundLocked checks whether every match in the current round is resolved;
// if so, builds the next round (or ends the tournament). Caller holds tm.mu.
func (tm *TournamentManager) maybeAdvanceRoundLocked(t *TournamentState) {
	round := t.Rounds[t.CurrentRound]
	for _, m := range round {
		if m.Status != "completed" && m.Status != "bye" {
			// Still matches to play in this round.
			tm.broadcastLocked(t)
			return
		}
	}

	// Collect the winners of this round in bracket order.
	var winners []models.Player
	for _, m := range round {
		if m.WinnerID == nil {
			continue
		}
		for _, p := range t.Players {
			if p.UserID == *m.WinnerID {
				winners = append(winners, p)
				break
			}
		}
	}

	// One winner left → tournament over.
	if len(winners) <= 1 {
		t.Status = "completed"
		if len(winners) == 1 {
			wid := winners[0].UserID
			t.WinnerID = &wid
		}
		log.Printf("🏆 [Tournament] #%d complete, winner: %v", t.ID, t.WinnerID)
		tm.broadcastCompleteLocked(t, winners)
		delete(tm.roomToTour, t.RoomID)
		return
	}

	// Build the next round by pairing winners.
	var next []TMatch
	idx := 0
	for i := 0; i+1 < len(winners); i += 2 {
		p1 := winners[i]
		p2 := winners[i+1]
		next = append(next, TMatch{
			Index:   idx,
			Player1: &p1,
			Player2: &p2,
			Status:  "pending",
		})
		idx++
	}
	// Odd winner count gives the last winner a bye into the following round.
	if len(winners)%2 == 1 {
		p := winners[len(winners)-1]
		wid := p.UserID
		next = append(next, TMatch{
			Index:    idx,
			Player1:  &p,
			Player2:  nil,
			WinnerID: &wid,
			Status:   "bye",
		})
	}

	t.Rounds = append(t.Rounds, next)
	t.CurrentRound++
	log.Printf("🏆 [Tournament] #%d advancing to round %d (%d matches)", t.ID, t.CurrentRound, len(next))

	// A round that's entirely byes should recurse rather than get stuck.
	allByes := true
	for _, m := range next {
		if m.Status != "bye" {
			allByes = false
		}
	}
	if allByes {
		tm.maybeAdvanceRoundLocked(t)
		return
	}
	tm.broadcastRoundReadyLocked(t)
}

// broadcastLocked pushes the full tournament state to the room.
func (tm *TournamentManager) broadcastLocked(t *TournamentState) {
	if hub, ok := tm.hub.(interface {
		BroadcastJSON(uint, map[string]interface{})
	}); ok {
		hub.BroadcastJSON(t.RoomID, map[string]interface{}{
			"type":   "game",
			"action": "tournament_update",
			"data":   tournamentPayload(t),
		})
	}
}

// broadcastRoundReadyLocked announces the pending matches of the newly-started round,
// then the full state, so the host sees "start this match" prompts.
func (tm *TournamentManager) broadcastRoundReadyLocked(t *TournamentState) {
	round := t.Rounds[t.CurrentRound]
	if hub, ok := tm.hub.(interface {
		BroadcastJSON(uint, map[string]interface{})
	}); ok {
		for _, m := range round {
			if m.Status != "pending" || m.Player1 == nil || m.Player2 == nil {
				continue
			}
			hub.BroadcastJSON(t.RoomID, map[string]interface{}{
				"type":   "game",
				"action": "tournament_match_ready",
				"data": map[string]interface{}{
					"tournament_id": t.ID,
					"round":         t.CurrentRound,
					"match_index":   m.Index,
					"game_type":     t.GameType,
					"host_id":       t.HostID,
					"player1":       m.Player1.Username,
					"player2":       m.Player2.Username,
					"player1_id":    m.Player1.UserID,
					"player2_id":    m.Player2.UserID,
				},
			})
		}
	}
	tm.broadcastLocked(t)
}

func (tm *TournamentManager) broadcastCompleteLocked(t *TournamentState, winners []models.Player) {
	var winnerName string
	if len(winners) == 1 {
		winnerName = winners[0].Username
	}
	if hub, ok := tm.hub.(interface {
		BroadcastJSON(uint, map[string]interface{})
	}); ok {
		hub.BroadcastJSON(t.RoomID, map[string]interface{}{
			"type":   "game",
			"action": "tournament_complete",
			"data": map[string]interface{}{
				"tournament_id": t.ID,
				"winner_id":     t.WinnerID,
				"winner_name":   winnerName,
				"bracket":       t.Rounds,
			},
		})
	}
}

func tournamentPayload(t *TournamentState) map[string]interface{} {
	return map[string]interface{}{
		"tournament_id": t.ID,
		"room_id":       t.RoomID,
		"game_type":     t.GameType,
		"host_id":       t.HostID,
		"players":       t.Players,
		"rounds":        t.Rounds,
		"current_round": t.CurrentRound,
		"status":        t.Status,
		"winner_id":     t.WinnerID,
	}
}

// StartNextRound is a public trigger (currently unused by auto-advance, kept for a
// manual "advance" control if ever needed) that re-broadcasts the current round's
// pending matches.
func (tm *TournamentManager) StartNextRound(tournamentID uint) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	t, ok := tm.tournaments[tournamentID]
	if !ok {
		return fmt.Errorf("tournament %d not found", tournamentID)
	}
	tm.broadcastRoundReadyLocked(t)
	return nil
}
