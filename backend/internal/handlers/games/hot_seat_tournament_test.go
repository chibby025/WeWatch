package games

import (
	"testing"

	"wewatch-backend/internal/models"
)

func makeGolfParticipants(n int) []*HotSeatParticipant {
	parts := make([]*HotSeatParticipant, n)
	for i := 0; i < n; i++ {
		parts[i] = &HotSeatParticipant{
			Player:    models.Player{UserID: uint(i + 1), Username: "p"},
			TurnOrder: i,
		}
	}
	return parts
}

func TestIsGolfMathematicallyDecided_NotGolf(t *testing.T) {
	tour := &HotSeatTournament{GameType: "fowl_play", Participants: makeGolfParticipants(2)}
	tour.Participants[0].Played = true
	tour.Participants[0].Score = 1
	if isGolfMathematicallyDecidedLocked(tour) {
		t.Fatal("non-golf game types must never be treated as mathematically decided")
	}
}

func TestIsGolfMathematicallyDecided_NobodyPlayedYet(t *testing.T) {
	tour := &HotSeatTournament{GameType: "golf", Participants: makeGolfParticipants(3)}
	if isGolfMathematicallyDecidedLocked(tour) {
		t.Fatal("should never be decided before anyone has a recorded score")
	}
}

func TestIsGolfMathematicallyDecided_EveryoneAlreadyPlayed(t *testing.T) {
	tour := &HotSeatTournament{GameType: "golf", Participants: makeGolfParticipants(2)}
	tour.Participants[0].Played = true
	tour.Participants[0].Score = 5
	tour.Participants[1].Played = true
	tour.Participants[1].Score = 3
	if isGolfMathematicallyDecidedLocked(tour) {
		t.Fatal("with nobody left to play, this check has nothing to short-circuit — normal finalize should handle it")
	}
}

func TestIsGolfMathematicallyDecided_RealisticScoreNeverTriggersEarly(t *testing.T) {
	// A very good but entirely realistic 9-hole round (well below what most
	// players would ever score) must NOT be treated as decided — the bound
	// is deliberately the extreme "ace every hole" floor (9 strokes for a
	// 9-hole round), not a realistic "good round" threshold.
	tour := &HotSeatTournament{GameType: "golf", Participants: makeGolfParticipants(2)}
	tour.Participants[0].Played = true
	tour.Participants[0].Score = 15 // well above 9, a strong but normal round
	if isGolfMathematicallyDecidedLocked(tour) {
		t.Fatal("a realistic score of 15 must not be treated as unbeatable against a 9-hole best-case floor of 9")
	}
}

func TestIsGolfMathematicallyDecided_TrueMathematicalCertainty(t *testing.T) {
	// The leader's score is strictly better than even a flawless (ace-every-hole)
	// remaining round could achieve — genuinely, airtightly decided.
	tour := &HotSeatTournament{GameType: "golf", Participants: makeGolfParticipants(2)}
	tour.Participants[0].Played = true
	tour.Participants[0].Score = 8 // < golfHolesPerRound (9)
	if !isGolfMathematicallyDecidedLocked(tour) {
		t.Fatal("a score below the ace-every-hole floor for the remaining player(s) must be treated as decided")
	}
}

func TestIsGolfMathematicallyDecided_TieAtTheFloorIsNotDecided(t *testing.T) {
	// Exactly at the floor (9 == 9) means a remaining player COULD still tie
	// with a perfect round — must not be treated as decided (strict < only).
	tour := &HotSeatTournament{GameType: "golf", Participants: makeGolfParticipants(2)}
	tour.Participants[0].Played = true
	tour.Participants[0].Score = golfHolesPerRound
	if isGolfMathematicallyDecidedLocked(tour) {
		t.Fatal("a score exactly equal to the ace-every-hole floor could still be tied — must not end early")
	}
}

// TestGolfHotSeat_EndsEarlyOnceMathematicallyDecided drives the real
// RecordScore path end-to-end (not just the pure helper) with a genuine
// HotSeatManager, confirming a tournament actually finalizes early and never
// advances to the remaining, now-irrelevant participants.
func TestGolfHotSeat_EndsEarlyOnceMathematicallyDecided(t *testing.T) {
	hm := NewHotSeatManager(nil)
	players := []models.Player{
		{UserID: 1, Username: "alice"},
		{UserID: 2, Username: "bob"},
		{UserID: 3, Username: "carol"},
	}
	roomID := uint(500)
	// finalizeLocked removes the room→tournament mapping once completed (by
	// design, so a fresh tournament can be created in the same room
	// afterward) — so GetTournament(roomID) won't work post-completion.
	// CreateTournament returns the same pointer the manager mutates in
	// place, so hold onto it directly instead.
	tour := hm.CreateTournament(roomID, 1, "golf", players, true, "flat")

	// Alice (first up) scores an essentially-impossible-to-beat 5 strokes —
	// below golfHolesPerRound (9), so nobody left can mathematically catch up.
	hm.RecordScore(roomID, 1, 5)

	if tour.Status != "completed" {
		t.Fatalf("expected status=completed after a mathematically-decided score, got %q", tour.Status)
	}
	if tour.WinnerID == nil || *tour.WinnerID != 1 {
		t.Fatalf("expected alice (user 1) to be declared the winner, got %v", tour.WinnerID)
	}
	for _, p := range tour.Participants {
		if p.Player.UserID != 1 && p.Played {
			t.Fatalf("participant %d should never have been given a turn once the match was already decided", p.Player.UserID)
		}
	}
}

// TestGolfHotSeat_RealisticScoresPlayThroughNormally confirms the early-end
// check doesn't fire for ordinary, non-extreme scores — the tournament
// should rotate through every participant and finalize normally at the end,
// exactly as it did before this feature existed.
func TestGolfHotSeat_RealisticScoresPlayThroughNormally(t *testing.T) {
	hm := NewHotSeatManager(nil)
	players := []models.Player{
		{UserID: 1, Username: "alice"},
		{UserID: 2, Username: "bob"},
	}
	roomID := uint(501)
	tour := hm.CreateTournament(roomID, 1, "golf", players, true, "flat")

	hm.RecordScore(roomID, 1, 22) // realistic round, well above the floor
	if tour.Status != "active" {
		t.Fatalf("expected the tournament to still be active after one realistic score, got %q", tour.Status)
	}

	hm.RecordScore(roomID, 2, 19) // bob wins on a normal, lower total
	if tour.Status != "completed" {
		t.Fatalf("expected status=completed once both realistic scores are in, got %q", tour.Status)
	}
	if tour.WinnerID == nil || *tour.WinnerID != 2 {
		t.Fatalf("expected bob (user 2, lower stroke count) to win, got %v", tour.WinnerID)
	}
}
