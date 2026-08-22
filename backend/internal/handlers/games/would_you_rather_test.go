package games

import (
	"testing"

	"wewatch-backend/internal/models"
)

func makeTestWyrState(t *testing.T, numPlayers int) *GameSessionState {
	t.Helper()
	players := make([]models.Player, numPlayers)
	for i := 0; i < numPlayers; i++ {
		players[i] = models.Player{UserID: uint(i + 1), Username: "p"}
	}
	return &GameSessionState{
		Players:  players,
		GameData: map[string]interface{}{},
	}
}

func TestWyrQuestionBankIntegrity(t *testing.T) {
	seen := map[string]bool{}
	for i, q := range wyrQuestions {
		a := q.A
		b := q.B
		if a == "" || b == "" {
			t.Fatalf("entry %d has an empty option: %q / %q", i, a, b)
		}
		key := a + "|||" + b
		if seen[key] {
			t.Fatalf("entry %d (%q vs %q) is a duplicate of an earlier entry", i, a, b)
		}
		seen[key] = true
	}
	// Confirms this session's expansion actually grew the bank to the
	// requested size (25 -> 140 -> 600) — a real, non-trivial pool, not a
	// cosmetic bump.
	if len(wyrQuestions) < 600 {
		t.Fatalf("expected a bank of at least 600 questions, got %d", len(wyrQuestions))
	}
}

func TestWyrInitialState_ShufflesTheWholeBank(t *testing.T) {
	gs := makeTestWyrState(t, 3)
	ensureWyrState(gs)

	totalRounds := wyrIntField(gs.GameData["total_rounds"])
	if totalRounds != len(wyrQuestions) {
		t.Fatalf("expected total_rounds to equal the full bank size (%d), got %d", len(wyrQuestions), totalRounds)
	}

	order := wyrQuestionOrder(gs)
	if len(order) != len(wyrQuestions) {
		t.Fatalf("expected question_order to cover the entire bank (%d entries), got %d", len(wyrQuestions), len(order))
	}
	// A real permutation: every index 0..len-1 appears exactly once.
	present := make([]bool, len(wyrQuestions))
	for _, f := range order {
		idx := int(f)
		if idx < 0 || idx >= len(present) {
			t.Fatalf("question_order contains an out-of-range index: %d", idx)
		}
		if present[idx] {
			t.Fatalf("question_order repeats index %d — not a real shuffle of the whole bank", idx)
		}
		present[idx] = true
	}
}

func TestWyr_VoteAutoRevealsOnceEveryoneVoted(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestWyrState(t, 2)
	ensureWyrState(gs)

	if _, _, err := gm.processWouldYouRatherMove(gs, 1, "vote", map[string]interface{}{"choice": "A"}); err != nil {
		t.Fatalf("player 1 voting should succeed: %v", err)
	}
	if gs.GameData["phase"] != "presenting" {
		t.Fatalf("expected phase to still be presenting with only 1/2 votes in, got %v", gs.GameData["phase"])
	}

	if _, _, err := gm.processWouldYouRatherMove(gs, 2, "vote", map[string]interface{}{"choice": "B"}); err != nil {
		t.Fatalf("player 2 voting should succeed: %v", err)
	}
	if gs.GameData["phase"] != "reveal" {
		t.Fatalf("expected phase=reveal once all players voted, got %v", gs.GameData["phase"])
	}
	if gs.GameData["tally_a"] != 1 || gs.GameData["tally_b"] != 1 {
		t.Fatalf("expected tally_a=1 tally_b=1, got a=%v b=%v", gs.GameData["tally_a"], gs.GameData["tally_b"])
	}
}

func TestWyr_OnlyHostCanAdvance(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestWyrState(t, 2)
	ensureWyrState(gs)
	gs.GameData["phase"] = "reveal"

	if _, _, err := gm.processWouldYouRatherMove(gs, 2, "next", nil); err == nil {
		t.Fatal("expected a non-host 'next' move to be rejected")
	}
	if _, _, err := gm.processWouldYouRatherMove(gs, 1, "next", nil); err != nil {
		t.Fatalf("expected the host's 'next' move to succeed: %v", err)
	}
	if gs.GameData["phase"] != "presenting" {
		t.Fatalf("expected phase=presenting after advancing, got %v", gs.GameData["phase"])
	}
}

func TestWyr_GameEndsOnceEveryQuestionInTheOrderHasBeenShown(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestWyrState(t, 2)
	ensureWyrState(gs)

	order := wyrQuestionOrder(gs)
	last := len(order) - 1
	gs.GameData["question_index"] = last
	gs.GameData["phase"] = "reveal"

	gameOver, winnerID, err := gm.processWouldYouRatherMove(gs, 1, "next", nil)
	if err != nil {
		t.Fatalf("advancing past the last question should not error: %v", err)
	}
	if !gameOver {
		t.Fatal("expected gameOver=true once the shuffled order is exhausted")
	}
	if winnerID != nil {
		t.Fatal("Would You Rather has no winner — should always report a nil winnerID")
	}
}
