package games

import (
	"testing"
	"wewatch-backend/internal/models"
)

const rebusTestHostID = uint(1)

// makeTestRebusState builds a deterministic 2-player state with a fixed,
// non-shuffled puzzle sequence so tests can predict exactly which puzzle is
// active at any round, instead of depending on rebusShuffledPuzzles' random
// order.
func makeTestRebusState(numPlayers int) *GameSessionState {
	players := make([]models.Player, numPlayers)
	for i := range players {
		players[i] = models.Player{UserID: uint(i + 1)}
	}
	puzzles := make([]RebusPuzzle, len(rebusPuzzleBank))
	copy(puzzles, rebusPuzzleBank)
	gs := &GameSessionState{
		Players:      players,
		CurrentTurn:  0,
		GameData:     map[string]interface{}{},
		GameSession:  &models.GameSession{GameType: "rebus_round", HostID: rebusTestHostID},
		RebusPuzzles: puzzles,
	}
	gs.GameData["phase"] = "waiting"
	gs.GameData["round"] = float64(0)
	gs.GameData["scores"] = map[string]interface{}{}
	return gs
}

func TestRebusNormalize(t *testing.T) {
	cases := map[string]string{
		"Growing Old":   "growing old",
		"growing-old!":  "growing old",
		"  GROWING  OLD ": "growing old",
		"growing_old":   "growingold", // underscore isn't a space in this scheme, stripped entirely
	}
	for in, want := range cases {
		if got := rebusNormalize(in); got != want {
			t.Errorf("rebusNormalize(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestRebusAnswerMatches(t *testing.T) {
	p := RebusPuzzle{Answer: "growing old", Alternates: []string{"grow old"}}
	if !rebusAnswerMatches(p, "Growing Old!") {
		t.Error("expected exact (normalized) match to succeed")
	}
	if !rebusAnswerMatches(p, "grow old") {
		t.Error("expected an alternate phrasing to succeed")
	}
	if rebusAnswerMatches(p, "growing older") {
		t.Error("expected a phrasing not in Answer/Alternates to fail")
	}
	if rebusAnswerMatches(p, "") {
		t.Error("expected an empty guess to fail")
	}
}

func TestRebusShuffledPuzzlesReturnsFullBankEachTime(t *testing.T) {
	shuffled := rebusShuffledPuzzles()
	if len(shuffled) != len(rebusPuzzleBank) {
		t.Fatalf("expected shuffled bank to have %d puzzles, got %d", len(rebusPuzzleBank), len(shuffled))
	}
	// Mutating the returned slice must never affect the shared source bank —
	// confirms rebusShuffledPuzzles copies rather than aliasing.
	original := rebusPuzzleBank[0].Answer
	shuffled[0].Answer = "TAMPERED"
	if rebusPuzzleBank[0].Answer != original {
		t.Fatal("mutating the shuffled copy corrupted the shared puzzle bank")
	}
}

func TestRebusStartOnlyHost(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(2)
	_, _, err := gm.processRebusRoundMove(gs, 2, "rebus_start", nil)
	if err == nil {
		t.Fatal("expected non-host rebus_start to be rejected")
	}
}

func TestRebusStartAdvancesRoundAndExposesPatternOnly(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(2)
	_, _, err := gm.processRebusRoundMove(gs, rebusTestHostID, "rebus_start", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gs.GameData["phase"] != "puzzle" {
		t.Fatalf("expected phase=puzzle, got %v", gs.GameData["phase"])
	}
	if gs.GameData["round"] != float64(1) {
		t.Fatalf("expected round=1, got %v", gs.GameData["round"])
	}
	pattern, ok := gs.GameData["current_pattern"].([]RebusToken)
	if !ok || len(pattern) == 0 {
		t.Fatalf("expected a non-empty current_pattern, got %#v", gs.GameData["current_pattern"])
	}
	// The answer itself must never be present anywhere in GameData at this
	// point — that's the entire point of keeping RebusPuzzles off GameData.
	if _, exists := gs.GameData["answer"]; exists {
		t.Fatal("current puzzle's answer must not appear in GameData before reveal")
	}
	if gs.GameData["revealed_answer"] != "" {
		t.Fatalf("expected revealed_answer to be blank before reveal, got %v", gs.GameData["revealed_answer"])
	}
}

func TestRebusStartRejectsWhenPoolExhausted(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(2)
	gs.RebusPuzzles = gs.RebusPuzzles[:1] // pool of exactly 1 puzzle
	if _, _, err := gm.processRebusRoundMove(gs, rebusTestHostID, "rebus_start", nil); err != nil {
		t.Fatalf("unexpected error starting the only puzzle: %v", err)
	}
	if _, _, err := gm.processRebusRoundMove(gs, rebusTestHostID, "rebus_start", nil); err == nil {
		t.Fatal("expected rebus_start to be rejected once the pool is exhausted")
	}
}

func TestRebusAnswerCorrectAwardsRankedPoints(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(3)
	gs.RebusPuzzles[0] = RebusPuzzle{Pattern: []RebusToken{rt("X")}, Answer: "test answer"}
	if _, _, err := gm.processRebusRoundMove(gs, rebusTestHostID, "rebus_start", nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Player 2 answers first — should get the top rank bonus.
	if _, _, err := gm.processRebusRoundMove(gs, 2, "answer", map[string]interface{}{"guess": "Test Answer"}); err != nil {
		t.Fatalf("unexpected error on correct first answer: %v", err)
	}
	// Player 3 answers second — should get a smaller bonus.
	if _, _, err := gm.processRebusRoundMove(gs, 3, "answer", map[string]interface{}{"guess": "test-answer"}); err != nil {
		t.Fatalf("unexpected error on correct second answer: %v", err)
	}

	scores := gs.GameData["scores"].(map[string]interface{})
	s2 := scores["2"].(float64)
	s3 := scores["3"].(float64)
	if s2 <= s3 {
		t.Fatalf("expected the first correct answerer to score more than the second: s2=%v s3=%v", s2, s3)
	}
	if s2 != 100 || s3 != 75 {
		t.Fatalf("expected ranked scores 100/75, got %v/%v", s2, s3)
	}
}

func TestRebusAnswerWrongIsRejectedAndDoesNotScore(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(2)
	gs.RebusPuzzles[0] = RebusPuzzle{Pattern: []RebusToken{rt("X")}, Answer: "correct answer"}
	if _, _, err := gm.processRebusRoundMove(gs, rebusTestHostID, "rebus_start", nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, _, err := gm.processRebusRoundMove(gs, 2, "answer", map[string]interface{}{"guess": "totally wrong"}); err == nil {
		t.Fatal("expected an incorrect guess to be rejected")
	}
	scores := gs.GameData["scores"].(map[string]interface{})
	if _, exists := scores["2"]; exists {
		t.Fatal("a rejected guess must not have created a score entry")
	}
	// A wrong guess must not consume the player's turn — they can retry.
	if _, _, err := gm.processRebusRoundMove(gs, 2, "answer", map[string]interface{}{"guess": "correct answer"}); err != nil {
		t.Fatalf("expected retry with the correct answer to succeed: %v", err)
	}
}

func TestRebusAnswerCannotBeSubmittedTwiceByTheSamePlayer(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(2)
	gs.RebusPuzzles[0] = RebusPuzzle{Pattern: []RebusToken{rt("X")}, Answer: "answer"}
	_, _, _ = gm.processRebusRoundMove(gs, rebusTestHostID, "rebus_start", nil)
	if _, _, err := gm.processRebusRoundMove(gs, 2, "answer", map[string]interface{}{"guess": "answer"}); err != nil {
		t.Fatalf("unexpected error on first correct answer: %v", err)
	}
	if _, _, err := gm.processRebusRoundMove(gs, 2, "answer", map[string]interface{}{"guess": "answer"}); err == nil {
		t.Fatal("expected a second submission from the same already-correct player to be rejected")
	}
}

func TestRebusAnswerRejectedOutsidePuzzlePhase(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(2)
	// phase is still "waiting" — no rebus_start yet.
	if _, _, err := gm.processRebusRoundMove(gs, 2, "answer", map[string]interface{}{"guess": "anything"}); err == nil {
		t.Fatal("expected an answer submitted before any puzzle started to be rejected")
	}
}

func TestRebusRevealOnlyHostAndExposesAnswer(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(2)
	gs.RebusPuzzles[0] = RebusPuzzle{Pattern: []RebusToken{rt("X")}, Answer: "reveal me", Alternates: []string{"reveal it"}}
	_, _, _ = gm.processRebusRoundMove(gs, rebusTestHostID, "rebus_start", nil)

	if _, _, err := gm.processRebusRoundMove(gs, 2, "reveal", nil); err == nil {
		t.Fatal("expected non-host reveal to be rejected")
	}
	if _, _, err := gm.processRebusRoundMove(gs, rebusTestHostID, "reveal", nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gs.GameData["phase"] != "reveal" {
		t.Fatalf("expected phase=reveal, got %v", gs.GameData["phase"])
	}
	if gs.GameData["revealed_answer"] != "reveal me" {
		t.Fatalf("expected revealed_answer to be the real answer, got %v", gs.GameData["revealed_answer"])
	}
}

func TestRebusEndDeclaresWinnerByScore(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(3)
	gs.GameData["scores"] = map[string]interface{}{"1": float64(0), "2": float64(200), "3": float64(50)}
	gameOver, winnerID, err := gm.processRebusRoundMove(gs, rebusTestHostID, "rebus_end", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !gameOver {
		t.Fatal("expected rebus_end to report gameOver=true")
	}
	if winnerID == nil || *winnerID != 2 {
		t.Fatalf("expected player 2 (highest score) to win, got %v", winnerID)
	}
	if gs.GameData["phase"] != "ended" {
		t.Fatalf("expected phase=ended, got %v", gs.GameData["phase"])
	}
}

func TestRebusEndTiedScoresIsADraw(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(2)
	gs.GameData["scores"] = map[string]interface{}{"1": float64(100), "2": float64(100)}
	_, winnerID, err := gm.processRebusRoundMove(gs, rebusTestHostID, "rebus_end", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if winnerID != nil {
		t.Fatalf("expected a tie to produce a nil winnerID (draw), got %v", *winnerID)
	}
}

func TestRebusEndOnlyHost(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(2)
	if _, _, err := gm.processRebusRoundMove(gs, 2, "rebus_end", nil); err == nil {
		t.Fatal("expected non-host rebus_end to be rejected")
	}
}

// TestRebusPuzzleBankIntegrity guards against a typo in the hand-authored
// puzzle bank silently shipping a puzzle nobody could ever solve (e.g. an
// Answer that only contains punctuation, normalizing to an empty string).
func TestRebusPuzzleBankIntegrity(t *testing.T) {
	if len(rebusPuzzleBank) < 10 {
		t.Fatalf("expected a reasonably sized puzzle bank, got only %d entries", len(rebusPuzzleBank))
	}
	seen := map[string]bool{}
	for i, p := range rebusPuzzleBank {
		if len(p.Pattern) == 0 {
			t.Errorf("puzzle %d has an empty pattern", i)
		}
		norm := rebusNormalize(p.Answer)
		if norm == "" {
			t.Errorf("puzzle %d (%q) normalizes to an empty answer", i, p.Answer)
		}
		if seen[norm] {
			t.Errorf("puzzle %d (%q) duplicates another puzzle's normalized answer", i, p.Answer)
		}
		seen[norm] = true
		for _, alt := range p.Alternates {
			if rebusNormalize(alt) == "" {
				t.Errorf("puzzle %d (%q) has an alternate that normalizes to empty: %q", i, p.Answer, alt)
			}
		}
	}
}
