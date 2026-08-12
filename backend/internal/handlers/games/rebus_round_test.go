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

func TestRtGenScaleWordAscendingIncreasesMonotonically(t *testing.T) {
	tokens := rtGenScaleWord("GROW", true)
	if len(tokens) != 4 {
		t.Fatalf("expected 4 tokens for a 4-letter word, got %d", len(tokens))
	}
	for i := 1; i < len(tokens); i++ {
		if tokens[i].Scale <= tokens[i-1].Scale {
			t.Errorf("ascending scale did not increase at index %d: %v -> %v", i, tokens[i-1].Scale, tokens[i].Scale)
		}
	}
	if tokens[0].Scale != 0.55 || tokens[len(tokens)-1].Scale != 1.75 {
		t.Errorf("expected the scale range to span exactly 0.55..1.75, got %v..%v", tokens[0].Scale, tokens[len(tokens)-1].Scale)
	}
}

func TestRtGenScaleWordDescendingDecreasesMonotonically(t *testing.T) {
	tokens := rtGenScaleWord("SHRINK", false)
	if len(tokens) != 6 {
		t.Fatalf("expected 6 tokens, got %d", len(tokens))
	}
	for i := 1; i < len(tokens); i++ {
		if tokens[i].Scale >= tokens[i-1].Scale {
			t.Errorf("descending scale did not decrease at index %d: %v -> %v", i, tokens[i-1].Scale, tokens[i].Scale)
		}
	}
}

func TestRtGenScaleWordSingleLetterDoesNotDivideByZero(t *testing.T) {
	// n-1 == 0 for a single-letter word — must not panic on a zero-length
	// scale range division.
	tokens := rtGenScaleWord("A", true)
	if len(tokens) != 1 {
		t.Fatalf("expected 1 token, got %d", len(tokens))
	}
}

func TestRtGenCompoundProducesWordOpWord(t *testing.T) {
	tokens := rtGenCompound("SUN", "SET")
	if len(tokens) != 3 {
		t.Fatalf("expected 3 tokens (word, op, word), got %d", len(tokens))
	}
	if tokens[0].Text != "SUN" || tokens[2].Text != "SET" {
		t.Errorf("expected SUN/SET as the two word tokens, got %q/%q", tokens[0].Text, tokens[2].Text)
	}
	if !tokens[1].Op {
		t.Errorf("expected the middle token to be flagged Op")
	}
}

func TestRtGenRepeatProducesExactCount(t *testing.T) {
	tokens := rtGenRepeat("CYCLE", 3)
	if len(tokens) != 3 {
		t.Fatalf("expected 3 tokens, got %d", len(tokens))
	}
	for _, tok := range tokens {
		if tok.Text != "CYCLE" {
			t.Errorf("expected every token to read CYCLE, got %q", tok.Text)
		}
	}
}

func TestRtGenSubAndSup(t *testing.T) {
	sub := rtGenSub("FALL")
	if len(sub) != 1 || !sub[0].Sub || sub[0].Text != "FALL" {
		t.Errorf("rtGenSub produced unexpected tokens: %+v", sub)
	}
	sup := rtGenSup("GRADE")
	if len(sup) != 1 || !sup[0].Sup || sup[0].Text != "GRADE" {
		t.Errorf("rtGenSup produced unexpected tokens: %+v", sup)
	}
}

// TestRebusGeneratedSpecsWellFormed guards against a future spec entry
// silently panicking at toPuzzle() time (an index-out-of-range on s.words)
// or being missing critical data — checked once for every entry in the real
// table, not just a hand-picked sample.
func TestRebusGeneratedSpecsWellFormed(t *testing.T) {
	wantWords := map[string]int{
		"grow": 1, "shrink": 1, "wholeScale": 1, "compound": 2, "repeat": 1, "sub": 1, "sup": 1,
	}
	for i, s := range rebusGeneratedSpecs {
		want, ok := wantWords[s.kind]
		if !ok {
			t.Errorf("spec %d (%q) has unknown kind %q", i, s.answer, s.kind)
			continue
		}
		if len(s.words) != want {
			t.Errorf("spec %d (%q, kind=%s) expected %d word(s), got %d", i, s.answer, s.kind, want, len(s.words))
		}
		if s.answer == "" {
			t.Errorf("spec %d has an empty answer", i)
		}
		if s.kind == "repeat" && s.count < 1 {
			t.Errorf("spec %d (%q) is kind=repeat with a non-positive count %d", i, s.answer, s.count)
		}
		if s.kind == "wholeScale" && s.scale <= 0 {
			t.Errorf("spec %d (%q) is kind=wholeScale with a non-positive scale %v", i, s.answer, s.scale)
		}
		// toPuzzle() must not panic and must produce a non-empty pattern —
		// the real, end-to-end guarantee the field-count checks above exist
		// to protect.
		p := s.toPuzzle()
		if len(p.Pattern) == 0 {
			t.Errorf("spec %d (%q) produced an empty pattern from toPuzzle()", i, s.answer)
		}
	}
}

// TestRebusBankGrewSubstantially is a soft, intentionally loose sanity check
// (not tied to the exact count) confirming the generator-driven expansion
// actually landed in rebusPuzzleBank, not just in an unused table — 113 at
// the time this was written (31 hand-authored + 82 generated); guards against
// a future refactor accidentally dropping rebusGeneratedBank() from the
// combined var.
func TestRebusBankGrewSubstantially(t *testing.T) {
	const minExpected = 80
	if len(rebusPuzzleBank) < minExpected {
		t.Errorf("expected the combined bank to have grown well past the original 31 entries (>= %d), got %d", minExpected, len(rebusPuzzleBank))
	}
}
