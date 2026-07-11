package games

import (
	"log"
	"sync"

	"wewatch-backend/internal/models"
)

// HotSeatTournament runs a single-player arcade tournament (e.g. Fowl Play) where
// each participant takes one turn, their score is recorded, and the highest score wins.
// Fully in-memory — no DB, same design as TournamentManager.

type HotSeatParticipant struct {
	Player    models.Player `json:"player"`
	Score     int           `json:"score"`
	Played    bool          `json:"played"`
	TurnOrder int           `json:"turn_order"`
}

type HotSeatTournament struct {
	ID           uint                 `json:"id"`
	RoomID       uint                 `json:"room_id"`
	GameType     string               `json:"game_type"`
	HostID       uint                 `json:"host_id"`
	Participants []*HotSeatParticipant `json:"participants"`
	CurrentIndex int                  `json:"current_index"` // index into Participants
	Status       string               `json:"status"`        // "active" | "completed" | "cancelled"
	WinnerID     *uint                `json:"winner_id,omitempty"`
}

type HotSeatManager struct {
	mu           sync.RWMutex
	tournaments  map[uint]*HotSeatTournament // keyed by tournament ID
	roomToTour   map[uint]uint               // roomID → active tournament ID
	nextID       uint
	hub          MessageHub
}

func NewHotSeatManager(hub MessageHub) *HotSeatManager {
	return &HotSeatManager{
		tournaments: make(map[uint]*HotSeatTournament),
		roomToTour:  make(map[uint]uint),
		nextID:      1,
		hub:         hub,
	}
}

func (hm *HotSeatManager) CreateTournament(roomID, hostID uint, gameType string, players []models.Player) *HotSeatTournament {
	hm.mu.Lock()
	defer hm.mu.Unlock()

	// Cancel any existing tournament in this room.
	if oldID, exists := hm.roomToTour[roomID]; exists {
		delete(hm.tournaments, oldID)
	}

	id := hm.nextID
	hm.nextID++

	t := &HotSeatTournament{
		ID:           id,
		RoomID:       roomID,
		GameType:     gameType,
		HostID:       hostID,
		CurrentIndex: 0,
		Status:       "active",
	}
	for i, p := range players {
		p := p // capture
		t.Participants = append(t.Participants, &HotSeatParticipant{
			Player:    p,
			TurnOrder: i,
		})
	}
	hm.tournaments[id] = t
	hm.roomToTour[roomID] = id

	log.Printf("🏆 [HotSeat] Created #%d in room %d (%s, %d players)", id, roomID, gameType, len(players))
	hm.broadcastLocked(t)
	// Immediately announce first player's turn.
	hm.broadcastTurnLocked(t)
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

// RecordScore saves a player's score, advances to the next participant (or ends the
// tournament if all have played). Silently ignores a score from an unexpected player
// (e.g. out-of-turn submission) to avoid cheating.
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
			"type":   "hot_seat_tournament_cancelled",
			"data":   map[string]interface{}{"tournament_id": t.ID},
		})
	}
	delete(hm.roomToTour, roomID)
	delete(hm.tournaments, id)
	log.Printf("🏆 [HotSeat] Tournament #%d in room %d cancelled", id, roomID)
}

// finalizeLocked picks the winner (highest score; ties go to whoever played first),
// broadcasts tournament_complete, and cleans up.
func (hm *HotSeatManager) finalizeLocked(t *HotSeatTournament) {
	t.Status = "completed"
	var best *HotSeatParticipant
	for _, p := range t.Participants {
		if best == nil || p.Score > best.Score {
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
				"tournament_id": t.ID,
				"game_type":     t.GameType,
				"winner_id":     t.WinnerID,
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
				"tournament_id":      t.ID,
				"current_player_id":  current.Player.UserID,
				"current_player":     current.Player.Username,
				"turn_index":         t.CurrentIndex,
				"total_turns":        len(t.Participants),
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

func (hm *HotSeatManager) payloadLocked(t *HotSeatTournament) map[string]interface{} {
	parts := make([]map[string]interface{}, len(t.Participants))
	for i, p := range t.Participants {
		parts[i] = map[string]interface{}{
			"user_id":    p.Player.UserID,
			"username":   p.Player.Username,
			"color":      p.Player.Color,
			"score":      p.Score,
			"played":     p.Played,
			"turn_order": p.TurnOrder,
		}
	}
	return map[string]interface{}{
		"tournament_id":  t.ID,
		"room_id":        t.RoomID,
		"game_type":      t.GameType,
		"host_id":        t.HostID,
		"participants":   parts,
		"current_index":  t.CurrentIndex,
		"status":         t.Status,
		"winner_id":      t.WinnerID,
	}
}
