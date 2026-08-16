package games

import (
	"log"
	"sync"

	"wewatch-backend/internal/models"
)

// HotSeatTournament runs a single-player arcade tournament (e.g. Fowl Play) where
// each participant takes one turn, their score is recorded, and the highest score wins.
// Fully in-memory — no DB, same design as TournamentManager.
//
// Two modes:
//   - "flat" (default): every participant takes exactly one turn, in order. Highest
//     (or lowest, if LowerIsBetter) total score across everyone wins. This is the
//     original hot-seat behavior.
//   - "bracket": a real single-elimination bracket. Players are paired up; each side
//     of a match plays their own turn independently, and whoever scores higher (lower,
//     if LowerIsBetter) wins the match and advances. A tie triggers an immediate
//     sudden-death replay of just that match. Repeats until one champion remains.
//     Mirrors TournamentManager's buildFirstRound/maybeAdvanceRoundLocked bye-pairing
//     algorithm, but resolves each match via score comparison instead of a real
//     interactive GameSession — this manager has no GameSession/ProcessMove linkage.

type HotSeatParticipant struct {
	Player    models.Player `json:"player"`
	Score     int           `json:"score"`
	Played    bool          `json:"played"`
	TurnOrder int           `json:"turn_order"`
	// Eliminated is bracket-mode only — true once this participant has lost a
	// bracket match. Always false in flat mode (nobody is ever "eliminated" there).
	Eliminated bool `json:"eliminated"`
}

// HotSeatMatch is one bracket match between two participants (or a bye for one).
type HotSeatMatch struct {
	Index    int            `json:"index"`
	Player1  models.Player  `json:"player1"`
	Player2  *models.Player `json:"player2"` // nil = bye
	Score1   *int           `json:"score1"`
	Score2   *int           `json:"score2"`
	WinnerID *uint          `json:"winner_id,omitempty"`
	Status   string         `json:"status"` // "pending" | "completed" | "bye"
	// Replays counts how many times this exact match has tied and been replayed
	// via sudden death (0 = no replay yet).
	Replays int `json:"replays"`
}

type HotSeatTournament struct {
	ID           uint                  `json:"id"`
	RoomID       uint                  `json:"room_id"`
	GameType     string                `json:"game_type"`
	HostID       uint                  `json:"host_id"`
	Participants []*HotSeatParticipant `json:"participants"`
	CurrentIndex int                   `json:"current_index"` // flat mode only — index into Participants
	Status       string                `json:"status"`        // "active" | "completed" | "cancelled"
	WinnerID     *uint                 `json:"winner_id,omitempty"`
	// LowerIsBetter flips the win condition for games where a smaller score
	// wins (e.g. golf stroke count) instead of the default "highest score
	// wins" every other hot-seat game (Fowl Play, Toad Ball, etc) uses.
	LowerIsBetter bool `json:"lower_is_better"`

	// Mode is "flat" (default) or "bracket". Bracket-only fields below are unused
	// (zero-value) in flat mode.
	Mode            string           `json:"mode"`
	Bracket         [][]*HotSeatMatch `json:"-"` // not sent whole; current match is exposed via payloadLocked
	CurrentRoundIdx int              `json:"-"`
	CurrentMatchIdx int              `json:"-"`
}

type HotSeatManager struct {
	mu          sync.RWMutex
	tournaments map[uint]*HotSeatTournament // keyed by tournament ID
	roomToTour  map[uint]uint               // roomID → active tournament ID
	nextID      uint
	hub         MessageHub
}

func NewHotSeatManager(hub MessageHub) *HotSeatManager {
	return &HotSeatManager{
		tournaments: make(map[uint]*HotSeatTournament),
		roomToTour:  make(map[uint]uint),
		nextID:      1,
		hub:         hub,
	}
}

// buildFirstHotSeatRound seeds bracket round 0, mirroring TournamentManager's
// buildFirstRound: with `byes` byes (bracketSize - n), the first `byes` players (by
// input order) auto-advance as bye matches, and the remaining players are paired up.
func buildFirstHotSeatRound(players []models.Player) []*HotSeatMatch {
	n := len(players)
	bracketSize := nextPowerOfTwo(n)
	byes := bracketSize - n

	var matches []*HotSeatMatch
	idx := 0

	byePlayers := players[:byes]
	rest := players[byes:]

	for i := range byePlayers {
		p := byePlayers[i]
		wid := p.UserID
		matches = append(matches, &HotSeatMatch{
			Index:    idx,
			Player1:  p,
			Player2:  nil,
			WinnerID: &wid,
			Status:   "bye",
		})
		idx++
	}

	for i := 0; i+1 < len(rest); i += 2 {
		p1 := rest[i]
		p2 := rest[i+1]
		matches = append(matches, &HotSeatMatch{
			Index:   idx,
			Player1: p1,
			Player2: &p2,
			Status:  "pending",
		})
		idx++
	}

	return matches
}

// hotSeatNextPendingMatchIdx returns the index of the first "pending" match in the
// given round, searching from fromIdx (inclusive). Returns -1 if none found (the
// round is entirely bye/completed matches).
func hotSeatNextPendingMatchIdx(round []*HotSeatMatch, fromIdx int) int {
	for i := fromIdx; i < len(round); i++ {
		if round[i].Status == "pending" {
			return i
		}
	}
	return -1
}

func (hm *HotSeatManager) CreateTournament(roomID, hostID uint, gameType string, players []models.Player, lowerIsBetter bool, mode string) *HotSeatTournament {
	hm.mu.Lock()
	defer hm.mu.Unlock()

	// Cancel any existing tournament in this room.
	if oldID, exists := hm.roomToTour[roomID]; exists {
		delete(hm.tournaments, oldID)
	}

	if mode != "bracket" {
		mode = "flat"
	}

	id := hm.nextID
	hm.nextID++

	t := &HotSeatTournament{
		ID:            id,
		RoomID:        roomID,
		GameType:      gameType,
		HostID:        hostID,
		CurrentIndex:  0,
		Status:        "active",
		LowerIsBetter: lowerIsBetter,
		Mode:          mode,
	}
	for i, p := range players {
		p := p // capture
		t.Participants = append(t.Participants, &HotSeatParticipant{
			Player:    p,
			TurnOrder: i,
		})
	}

	if mode == "bracket" {
		t.Bracket = [][]*HotSeatMatch{buildFirstHotSeatRound(players)}
		if idx := hotSeatNextPendingMatchIdx(t.Bracket[0], 0); idx != -1 {
			t.CurrentMatchIdx = idx
		} else {
			// Degenerate: the whole first round was byes. Shouldn't happen given the
			// >=4 player minimum enforced by the caller, but fail safe rather than
			// leave the tournament permanently stuck on a bye nobody can act on.
			log.Printf("⚠️ [HotSeat] Bracket #%d in room %d has an all-bye first round (n=%d) — finalizing with no winner", id, roomID, len(players))
			t.Status = "completed"
		}
	}

	hm.tournaments[id] = t
	hm.roomToTour[roomID] = id

	log.Printf("🏆 [HotSeat] Created #%d in room %d (%s, %d players, mode=%s)", id, roomID, gameType, len(players), mode)
	hm.broadcastLocked(t)
	if t.Status == "active" {
		if mode == "bracket" {
			hm.broadcastBracketTurnLocked(t)
		} else {
			hm.broadcastTurnLocked(t)
		}
	}
	return t
}

func (hm *HotSeatManager) GetTournament(roomID uint) (*HotSeatTournament, bool) {
	hm.mu.RLock()
	defer hm.mu.RUnlock()
	id, ok := hm.roomToTour[roomID]
	if !ok {
		return nil, false
	}
	return hm.tournaments[id], true
}

// RecordScore saves a player's score. In flat mode this advances to the next
// participant (or ends the tournament if all have played). In bracket mode it
// resolves the active match once both sides have scored (or replays it on a tie).
// Silently ignores a score from an unexpected player (e.g. out-of-turn submission,
// or a stale request from an already-eliminated player) to avoid cheating.
func (hm *HotSeatManager) RecordScore(roomID uint, playerID uint, score int) {
	hm.mu.Lock()
	defer hm.mu.Unlock()

	id, ok := hm.roomToTour[roomID]
	if !ok {
		return
	}
	t := hm.tournaments[id]
	if t.Status != "active" {
		return
	}

	if t.Mode == "bracket" {
		hm.recordBracketScoreLocked(t, playerID, score)
		return
	}

	current := t.Participants[t.CurrentIndex]
	if current.Player.UserID != playerID {
		log.Printf("⚠️ [HotSeat] Score from unexpected player %d (expected %d)", playerID, current.Player.UserID)
		return
	}

	current.Score = score
	current.Played = true
	log.Printf("🏆 [HotSeat] Room %d: %s scored %d", roomID, current.Player.Username, score)

	// Broadcast score update.
	hm.broadcastScoreLocked(t, current)

	// Advance to next unplayed participant.
	t.CurrentIndex++
	for t.CurrentIndex < len(t.Participants) && t.Participants[t.CurrentIndex].Played {
		t.CurrentIndex++
	}

	if t.CurrentIndex >= len(t.Participants) {
		// All players have gone — determine winner.
		hm.finalizeLocked(t)
	} else {
		hm.broadcastTurnLocked(t)
	}
}

// recordBracketScoreLocked handles a score submission while t.Mode == "bracket".
// Caller holds hm.mu.
func (hm *HotSeatManager) recordBracketScoreLocked(t *HotSeatTournament, playerID uint, score int) {
	if t.CurrentRoundIdx >= len(t.Bracket) {
		return
	}
	round := t.Bracket[t.CurrentRoundIdx]
	if t.CurrentMatchIdx >= len(round) {
		return
	}
	match := round[t.CurrentMatchIdx]

	if match.Player2 == nil {
		// A bye should never be the "current" match — CurrentMatchIdx is only ever
		// supposed to point at a real pending match. Fail safe instead of
		// dereferencing a nil Player2 below.
		log.Printf("⚠️ [HotSeat] Bracket #%d room %d: current match %d is a bye — refusing score, this indicates a skip-loop bug", t.ID, t.RoomID, match.Index)
		return
	}

	var forPlayer1 bool
	switch {
	case match.Score1 == nil && match.Player1.UserID == playerID:
		forPlayer1 = true
	case match.Score2 == nil && match.Player2.UserID == playerID:
		forPlayer1 = false
	default:
		log.Printf("⚠️ [HotSeat] Bracket #%d room %d: score from unexpected player %d for match %d (p1=%d p2=%d, score1set=%v score2set=%v)",
			t.ID, t.RoomID, playerID, match.Index, match.Player1.UserID, match.Player2.UserID, match.Score1 != nil, match.Score2 != nil)
		return
	}

	s := score
	if forPlayer1 {
		match.Score1 = &s
	} else {
		match.Score2 = &s
	}

	scorerName := match.Player1.Username
	if !forPlayer1 {
		scorerName = match.Player2.Username
	}
	log.Printf("🏆 [HotSeat] Bracket #%d room %d: %s scored %d in match %d (round %d)", t.ID, t.RoomID, scorerName, score, match.Index, t.CurrentRoundIdx)

	hm.broadcastBracketScoreLocked(t, match, playerID, score)

	if match.Score1 == nil || match.Score2 == nil {
		// Only one side has scored so far — announce the other side's turn.
		hm.broadcastBracketTurnLocked(t)
		return
	}

	// Both sides have scored — resolve the match.
	s1, s2 := *match.Score1, *match.Score2
	if s1 == s2 {
		match.Score1 = nil
		match.Score2 = nil
		match.Replays++
		log.Printf("🏆 [HotSeat] Bracket #%d room %d: match %d tied %d-%d — sudden death replay #%d", t.ID, t.RoomID, match.Index, s1, s2, match.Replays)
		hm.broadcastBracketTurnLocked(t)
		return
	}

	p1Wins := s1 > s2
	if t.LowerIsBetter {
		p1Wins = s1 < s2
	}
	var winnerID, loserID uint
	if p1Wins {
		winnerID, loserID = match.Player1.UserID, match.Player2.UserID
	} else {
		winnerID, loserID = match.Player2.UserID, match.Player1.UserID
	}
	wid := winnerID
	match.WinnerID = &wid
	match.Status = "completed"

	for _, p := range t.Participants {
		if p.Player.UserID == loserID {
			p.Eliminated = true
			break
		}
	}

	log.Printf("🏆 [HotSeat] Bracket #%d room %d: match %d decided %d-%d, winner=%d", t.ID, t.RoomID, match.Index, s1, s2, winnerID)

	// Advance to the next pending match in this round, or roll the round over.
	if nextIdx := hotSeatNextPendingMatchIdx(round, t.CurrentMatchIdx+1); nextIdx != -1 {
		t.CurrentMatchIdx = nextIdx
		hm.broadcastLocked(t)
		hm.broadcastBracketTurnLocked(t)
		return
	}
	hm.advanceHotSeatBracketRoundLocked(t)
}

// advanceHotSeatBracketRoundLocked collects the current round's winners, builds the
// next round (pairing winners in order, odd count gets a bye into the next round), or
// finalizes the tournament if only one player remains. Mirrors
// TournamentManager.maybeAdvanceRoundLocked. Caller holds hm.mu.
func (hm *HotSeatManager) advanceHotSeatBracketRoundLocked(t *HotSeatTournament) {
	round := t.Bracket[t.CurrentRoundIdx]

	var winners []models.Player
	for _, m := range round {
		if m.WinnerID == nil {
			continue
		}
		for _, p := range t.Participants {
			if p.Player.UserID == *m.WinnerID {
				winners = append(winners, p.Player)
				break
			}
		}
	}

	if len(winners) <= 1 {
		t.Status = "completed"
		if len(winners) == 1 {
			wid := winners[0].UserID
			t.WinnerID = &wid
		}
		log.Printf("🏆 [HotSeat] Bracket #%d complete in room %d — winner: %v", t.ID, t.RoomID, t.WinnerID)
		// One last full-state broadcast so the final match's loser is correctly
		// reflected as eliminated (recordBracketScoreLocked sets the flag on the
		// in-memory struct right before calling here, but skips its own
		// broadcastLocked call when there's no further pending match in the
		// round — this is the only place that gap is ever closed).
		hm.broadcastLocked(t)
		hm.finalizeBracketLocked(t, winners)
		return
	}

	var next []*HotSeatMatch
	idx := 0
	for i := 0; i+1 < len(winners); i += 2 {
		p1 := winners[i]
		p2 := winners[i+1]
		next = append(next, &HotSeatMatch{Index: idx, Player1: p1, Player2: &p2, Status: "pending"})
		idx++
	}
	// Odd winner count gives the last winner a bye into the following round.
	if len(winners)%2 == 1 {
		p := winners[len(winners)-1]
		wid := p.UserID
		next = append(next, &HotSeatMatch{Index: idx, Player1: p, Player2: nil, WinnerID: &wid, Status: "bye"})
	}

	t.Bracket = append(t.Bracket, next)
	t.CurrentRoundIdx++
	log.Printf("🏆 [HotSeat] Bracket #%d room %d advancing to round %d (%d matches)", t.ID, t.RoomID, t.CurrentRoundIdx, len(next))

	nextIdx := hotSeatNextPendingMatchIdx(next, 0)
	if nextIdx == -1 {
		// A round that's entirely byes should recurse rather than get stuck.
		hm.advanceHotSeatBracketRoundLocked(t)
		return
	}
	t.CurrentMatchIdx = nextIdx
	hm.broadcastLocked(t)
	hm.broadcastBracketTurnLocked(t)
}

func (hm *HotSeatManager) CancelTournament(roomID uint) {
	hm.mu.Lock()
	defer hm.mu.Unlock()
	id, ok := hm.roomToTour[roomID]
	if !ok {
		return
	}
	t := hm.tournaments[id]
	t.Status = "cancelled"
	if hub, ok := hm.hub.(interface {
		BroadcastJSON(uint, map[string]interface{})
	}); ok {
		hub.BroadcastJSON(roomID, map[string]interface{}{
			"type": "hot_seat_tournament_cancelled",
			"data": map[string]interface{}{"tournament_id": t.ID},
		})
	}
	delete(hm.roomToTour, roomID)
	delete(hm.tournaments, id)
	log.Printf("🏆 [HotSeat] Tournament #%d in room %d cancelled", id, roomID)
}

// ForfeitTournament ends the room's active hot-seat tournament early because
// a participant explicitly chose to end it mid-tournament, rather than the
// natural completion path (everyone's played in flat mode, or the bracket
// resolved on its own). The winner is whoever currently has the highest
// recorded score among the remaining (non-forfeiting, non-eliminated)
// participants — a deliberate simplification for this early-termination path
// specifically, applied the same way in flat and bracket mode; the normal
// completion paths (finalizeLocked/finalizeBracketLocked) are untouched by
// this. For the common 2-player case this is exactly "the other player wins
// by forfeit"; for 3+ remaining participants there's no unambiguous bracket
// "champion" to declare mid-tournament, so best-score-so-far is the fairest
// simple resolution. Any participant can call this — not host-only, matching
// CancelTournament's own existing precedent (the whole point is either
// player being able to end it).
func (hm *HotSeatManager) ForfeitTournament(roomID, forfeitingPlayerID uint) {
	hm.mu.Lock()
	defer hm.mu.Unlock()
	id, ok := hm.roomToTour[roomID]
	if !ok {
		return
	}
	t := hm.tournaments[id]
	if t == nil || t.Status != "active" {
		return
	}
	t.Status = "completed"

	var best *HotSeatParticipant
	var forfeiterName string
	for _, p := range t.Participants {
		if p.Player.UserID == forfeitingPlayerID {
			forfeiterName = p.Player.Username
			continue
		}
		if p.Eliminated {
			continue
		}
		if best == nil {
			best = p
			continue
		}
		if t.LowerIsBetter {
			if p.Score < best.Score {
				best = p
			}
		} else if p.Score > best.Score {
			best = p
		}
	}
	if best != nil {
		wid := best.Player.UserID
		t.WinnerID = &wid
	}

	log.Printf("🏳️ [HotSeat] Tournament #%d in room %d ended early by forfeit (player %d, %q) — winner: %v", t.ID, t.RoomID, forfeitingPlayerID, forfeiterName, t.WinnerID)

	standings := make([]map[string]interface{}, len(t.Participants))
	for i, p := range t.Participants {
		standings[i] = map[string]interface{}{
			"user_id":    p.Player.UserID,
			"username":   p.Player.Username,
			"color":      p.Player.Color,
			"score":      p.Score,
			"turn_order": p.TurnOrder,
			"forfeited":  p.Player.UserID == forfeitingPlayerID,
		}
	}

	if hub, ok := hm.hub.(interface {
		BroadcastJSON(uint, map[string]interface{})
	}); ok {
		hub.BroadcastJSON(t.RoomID, map[string]interface{}{
			"type": "hot_seat_tournament_complete",
			"data": map[string]interface{}{
				"tournament_id":   t.ID,
				"game_type":       t.GameType,
				"mode":            t.Mode,
				"winner_id":       t.WinnerID,
				"lower_is_better": t.LowerIsBetter,
				"winner_name": func() string {
					if best != nil {
						return best.Player.Username
					}
					return ""
				}(),
				"standings":      standings,
				"forfeit":        true,
				"forfeiter_name": forfeiterName,
			},
		})
	}

	delete(hm.roomToTour, roomID)
	delete(hm.tournaments, id)
}

// finalizeLocked picks the winner (highest score, or lowest if
// t.LowerIsBetter — e.g. golf stroke count; ties go to whoever played
// first), broadcasts tournament_complete, and cleans up. Flat mode only.
func (hm *HotSeatManager) finalizeLocked(t *HotSeatTournament) {
	t.Status = "completed"
	var best *HotSeatParticipant
	for _, p := range t.Participants {
		if best == nil {
			best = p
			continue
		}
		if t.LowerIsBetter {
			if p.Score < best.Score {
				best = p
			}
		} else if p.Score > best.Score {
			best = p
		}
	}
	if best != nil {
		wid := best.Player.UserID
		t.WinnerID = &wid
	}

	log.Printf("🏆 [HotSeat] Tournament #%d complete in room %d — winner: %v", t.ID, t.RoomID, t.WinnerID)

	standings := make([]map[string]interface{}, len(t.Participants))
	for i, p := range t.Participants {
		standings[i] = map[string]interface{}{
			"user_id":    p.Player.UserID,
			"username":   p.Player.Username,
			"color":      p.Player.Color,
			"score":      p.Score,
			"turn_order": p.TurnOrder,
		}
	}

	if hub, ok := hm.hub.(interface {
		BroadcastJSON(uint, map[string]interface{})
	}); ok {
		hub.BroadcastJSON(t.RoomID, map[string]interface{}{
			"type": "hot_seat_tournament_complete",
			"data": map[string]interface{}{
				"tournament_id":   t.ID,
				"game_type":       t.GameType,
				"mode":            t.Mode,
				"winner_id":       t.WinnerID,
				"lower_is_better": t.LowerIsBetter,
				"winner_name": func() string {
					if best != nil {
						return best.Player.Username
					}
					return ""
				}(),
				"standings": standings,
			},
		})
	}

	delete(hm.roomToTour, t.RoomID)
}

// finalizeBracketLocked broadcasts tournament_complete for a resolved bracket. No
// "standings" list — a bracket has no natural full ranking, just a champion.
func (hm *HotSeatManager) finalizeBracketLocked(t *HotSeatTournament, winners []models.Player) {
	var winnerName string
	if len(winners) == 1 {
		winnerName = winners[0].Username
	}
	if hub, ok := hm.hub.(interface {
		BroadcastJSON(uint, map[string]interface{})
	}); ok {
		hub.BroadcastJSON(t.RoomID, map[string]interface{}{
			"type": "hot_seat_tournament_complete",
			"data": map[string]interface{}{
				"tournament_id":   t.ID,
				"game_type":       t.GameType,
				"mode":            t.Mode,
				"winner_id":       t.WinnerID,
				"winner_name":     winnerName,
				"lower_is_better": t.LowerIsBetter,
			},
		})
	}
	delete(hm.roomToTour, t.RoomID)
}

func (hm *HotSeatManager) broadcastLocked(t *HotSeatTournament) {
	payload := hm.payloadLocked(t)
	if hub, ok := hm.hub.(interface {
		BroadcastJSON(uint, map[string]interface{})
	}); ok {
		hub.BroadcastJSON(t.RoomID, map[string]interface{}{
			"type": "hot_seat_tournament_update",
			"data": payload,
		})
	}
}

func (hm *HotSeatManager) broadcastTurnLocked(t *HotSeatTournament) {
	if t.CurrentIndex >= len(t.Participants) {
		return
	}
	current := t.Participants[t.CurrentIndex]
	if hub, ok := hm.hub.(interface {
		BroadcastJSON(uint, map[string]interface{})
	}); ok {
		hub.BroadcastJSON(t.RoomID, map[string]interface{}{
			"type": "hot_seat_turn",
			"data": map[string]interface{}{
				"tournament_id":     t.ID,
				"game_type":         t.GameType,
				"mode":              t.Mode,
				"current_player_id": current.Player.UserID,
				"current_player":    current.Player.Username,
				"turn_index":        t.CurrentIndex,
				"total_turns":       len(t.Participants),
			},
		})
	}
}

// hotSeatCurrentMatchLocked returns the active bracket match, or nil outside bracket
// mode / once the bracket is exhausted.
func hotSeatCurrentMatchLocked(t *HotSeatTournament) *HotSeatMatch {
	if t.Mode != "bracket" || t.CurrentRoundIdx >= len(t.Bracket) {
		return nil
	}
	round := t.Bracket[t.CurrentRoundIdx]
	if t.CurrentMatchIdx >= len(round) {
		return nil
	}
	return round[t.CurrentMatchIdx]
}

// hotSeatCurrentPlayerLocked mirrors the exact same "who's up next" logic
// broadcastTurnLocked/broadcastBracketTurnLocked already use inline, so
// payloadLocked can report it too without duplicating a second, potentially
// divergent derivation. ok=false once there's nothing left to act on
// (completed tournament, or a degenerate bracket state).
func hotSeatCurrentPlayerLocked(t *HotSeatTournament) (id uint, name string, ok bool) {
	if t.Mode == "bracket" {
		match := hotSeatCurrentMatchLocked(t)
		if match == nil {
			return 0, "", false
		}
		if match.Score1 == nil {
			return match.Player1.UserID, match.Player1.Username, true
		}
		if match.Player2 == nil {
			// A bye should never be the current match awaiting action — this
			// mirrors the same assumption broadcastBracketTurnLocked already
			// makes, just failing safe here instead of risking a nil deref.
			return 0, "", false
		}
		return match.Player2.UserID, match.Player2.Username, true
	}
	if t.CurrentIndex >= len(t.Participants) {
		return 0, "", false
	}
	current := t.Participants[t.CurrentIndex]
	return current.Player.UserID, current.Player.Username, true
}

// hotSeatMatchPayload builds the JSON-safe representation of a match sent to
// clients — deliberately built inside the caller's lock (never handed out as a raw
// struct pointer for a caller to read after the lock is released).
func hotSeatMatchPayload(m *HotSeatMatch) map[string]interface{} {
	if m == nil {
		return nil
	}
	var p2 interface{}
	if m.Player2 != nil {
		p2 = map[string]interface{}{"user_id": m.Player2.UserID, "username": m.Player2.Username, "color": m.Player2.Color}
	}
	return map[string]interface{}{
		"index":     m.Index,
		"player1":   map[string]interface{}{"user_id": m.Player1.UserID, "username": m.Player1.Username, "color": m.Player1.Color},
		"player2":   p2,
		"score1":    m.Score1,
		"score2":    m.Score2,
		"winner_id": m.WinnerID,
		"status":    m.Status,
		"replays":   m.Replays,
	}
}

func (hm *HotSeatManager) broadcastBracketTurnLocked(t *HotSeatTournament) {
	match := hotSeatCurrentMatchLocked(t)
	if match == nil {
		return
	}
	var currentPlayerID uint
	var currentPlayerName string
	if match.Score1 == nil {
		currentPlayerID = match.Player1.UserID
		currentPlayerName = match.Player1.Username
	} else {
		currentPlayerID = match.Player2.UserID
		currentPlayerName = match.Player2.Username
	}
	if hub, ok := hm.hub.(interface {
		BroadcastJSON(uint, map[string]interface{})
	}); ok {
		hub.BroadcastJSON(t.RoomID, map[string]interface{}{
			"type": "hot_seat_turn",
			"data": map[string]interface{}{
				"tournament_id":     t.ID,
				"game_type":         t.GameType,
				"mode":              t.Mode,
				"current_player_id": currentPlayerID,
				"current_player":    currentPlayerName,
				"current_round":     t.CurrentRoundIdx,
				"current_match":     hotSeatMatchPayload(match),
			},
		})
	}
}

func (hm *HotSeatManager) broadcastScoreLocked(t *HotSeatTournament, p *HotSeatParticipant) {
	if hub, ok := hm.hub.(interface {
		BroadcastJSON(uint, map[string]interface{})
	}); ok {
		hub.BroadcastJSON(t.RoomID, map[string]interface{}{
			"type": "hot_seat_score",
			"data": map[string]interface{}{
				"tournament_id": t.ID,
				"user_id":       p.Player.UserID,
				"username":      p.Player.Username,
				"score":         p.Score,
				"turn_index":    p.TurnOrder,
			},
		})
	}
}

func (hm *HotSeatManager) broadcastBracketScoreLocked(t *HotSeatTournament, m *HotSeatMatch, playerID uint, score int) {
	username := m.Player1.Username
	if m.Player2 != nil && m.Player2.UserID == playerID {
		username = m.Player2.Username
	}
	if hub, ok := hm.hub.(interface {
		BroadcastJSON(uint, map[string]interface{})
	}); ok {
		hub.BroadcastJSON(t.RoomID, map[string]interface{}{
			"type": "hot_seat_score",
			"data": map[string]interface{}{
				"tournament_id": t.ID,
				"user_id":       playerID,
				"username":      username,
				"score":         score,
				"match_index":   m.Index,
				"current_round": t.CurrentRoundIdx,
			},
		})
	}
}

func (hm *HotSeatManager) payloadLocked(t *HotSeatTournament) map[string]interface{} {
	parts := make([]map[string]interface{}, len(t.Participants))
	for i, p := range t.Participants {
		parts[i] = map[string]interface{}{
			"user_id":    p.Player.UserID,
			"username":   p.Player.Username,
			"color":      p.Player.Color,
			"avatar":     p.Player.Avatar,
			"score":      p.Score,
			"played":     p.Played,
			"turn_order": p.TurnOrder,
			"eliminated": p.Eliminated,
		}
	}
	payload := map[string]interface{}{
		"tournament_id":   t.ID,
		"room_id":         t.RoomID,
		"game_type":       t.GameType,
		"host_id":         t.HostID,
		"participants":    parts,
		"current_index":   t.CurrentIndex,
		"status":          t.Status,
		"winner_id":       t.WinnerID,
		"lower_is_better": t.LowerIsBetter,
		"mode":            t.Mode,
	}
	if t.Mode == "bracket" {
		payload["current_round"] = t.CurrentRoundIdx
		payload["current_match"] = hotSeatMatchPayload(hotSeatCurrentMatchLocked(t))
	}
	// current_player_id/current_player_name are also broadcast separately via
	// hot_seat_turn (broadcastTurnLocked/broadcastBracketTurnLocked), sent
	// moments after this payload at tournament creation/advancement. The two
	// messages have no guaranteed relative delivery order (Hub.broadcastToRoom
	// is drained by two concurrent worker goroutines racing to dequeue — see
	// the comment on Hub.startBroadcastWorkers' fan-out loop), so this update
	// could be delivered to a client AFTER the turn broadcast it was actually
	// sent before. Including these fields directly here means that ordering
	// no longer matters — a client that does a full-state replace on receipt
	// of this message never loses what hot_seat_turn had just set.
	if id, name, ok := hotSeatCurrentPlayerLocked(t); ok {
		payload["current_player_id"] = id
		payload["current_player_name"] = name
	}
	return payload
}
