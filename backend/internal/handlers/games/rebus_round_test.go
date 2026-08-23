package games

import (
	"fmt"
	"strings"
	"testing"
	"time"
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
		// Live-fetch puzzles (PhotoWord != "", or PartA/PartB set) deliberately
		// have an empty Pattern at bank-build time — it's assembled at
		// rebus_start once the real photo(s) have been fetched live from
		// Pexels. Everything else must still have a real, pre-built pattern.
		// (Whether a live-fetch puzzle is well-formed is checked separately by
		// TestRebusPhotoCompoundSpecsWellFormed, TestRebusIconSpecsWellFormed,
		// and TestRebusMixedCompoundSpecsWellFormed — this is just "does it
		// have a pattern or a legitimate reason not to yet".)
		if len(p.Pattern) == 0 && p.PhotoWord == "" && p.PartA == nil {
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

// fakeRebusPhotoFetcher swaps in a deterministic, network-free stand-in for
// rebusPhotoFetcher for the duration of one test — restore() must be
// deferred by the caller to avoid leaking the fake into later tests. Mirrors
// fakeFourFramesFetcher's exact shape.
func fakeRebusPhotoFetcher(t *testing.T) (restore func()) {
	t.Helper()
	original := rebusPhotoFetcher
	rebusPhotoFetcher = func(word string) (string, error) {
		return "https://images.pexels.com/fake/" + word + ".jpg", nil
	}
	return func() { rebusPhotoFetcher = original }
}

func TestRebusPhotoCompoundSpecsWellFormed(t *testing.T) {
	if len(rebusPhotoCompoundSpecs) < 10 {
		t.Fatalf("expected a reasonably sized photo-compound list, got only %d entries", len(rebusPhotoCompoundSpecs))
	}
	for i, s := range rebusPhotoCompoundSpecs {
		if s.photoWord == "" {
			t.Errorf("spec %d (%q) has an empty photoWord", i, s.answer)
		}
		// Every photo-compound spec is either a photo+text compound (textWord
		// set) or a two-photo compound (photoWordB set) — never both, and
		// never neither (that shape is rebusIconSpecs' job instead).
		if s.textWord == "" && s.photoWordB == "" {
			t.Errorf("spec %d (%q) has neither textWord nor photoWordB set", i, s.answer)
		}
		if s.textWord != "" && s.photoWordB != "" {
			t.Errorf("spec %d (%q) has BOTH textWord and photoWordB set — pick one shape", i, s.answer)
		}
		if s.answer == "" {
			t.Errorf("spec %d has an empty answer", i)
		}
		// toPuzzle() must deliberately leave Pattern empty — it's assembled
		// live at rebus_start, not at bank-build time.
		p := s.toPuzzle()
		if len(p.Pattern) != 0 {
			t.Errorf("spec %d (%q) unexpectedly produced a non-empty Pattern from toPuzzle()", i, s.answer)
		}
	}
}

func TestRebusIconSpecsWellFormed(t *testing.T) {
	if len(rebusIconSpecs) < 5 {
		t.Fatalf("expected a reasonably sized icon-spec list, got only %d entries", len(rebusIconSpecs))
	}
	for i, s := range rebusIconSpecs {
		if s.photoWord == "" {
			t.Errorf("spec %d (%q) has an empty photoWord", i, s.answer)
		}
		if s.answer == "" {
			t.Errorf("spec %d has an empty answer", i)
		}
		if s.kind != "wholeScale" && s.kind != "sub" && s.kind != "sup" {
			t.Errorf("spec %d (%q) has an unrecognized kind %q", i, s.answer, s.kind)
		}
		p := s.toPuzzle()
		if p.PhotoWord == "" || p.TextWord != "" || p.PhotoWordB != "" {
			t.Errorf("spec %d (%q) toPuzzle() didn't produce a single-image puzzle: %#v", i, s.answer, p)
		}
	}
}

// rebusValidIconNames mirrors the doc comment on rebusMixedCompoundSpecs —
// kept as a single source of truth in the test so a typo'd icon name (which
// the frontend simply wouldn't recognize, rendering nothing) fails loudly
// here instead of silently shipping a blank puzzle half.
var rebusValidIconNames = map[string]bool{
	"arrow-up": true, "log-in": true, "log-out": true, "power": true,
	"check": true, "refresh": true, "flag": true, "undo": true,
	"dollar": true, "eye": true,
}

func rebusValidatePart(t *testing.T, i int, half string, answer string, p RebusCompoundPart) {
	t.Helper()
	set := 0
	if p.Text != "" {
		set++
	}
	if p.Icon != "" {
		set++
		if !rebusValidIconNames[p.Icon] {
			t.Errorf("spec %d (%q) part %s has an unrecognized icon name %q", i, answer, half, p.Icon)
		}
	}
	if p.Swatch != "" {
		set++
		if !strings.HasPrefix(p.Swatch, "#") {
			t.Errorf("spec %d (%q) part %s has a swatch that isn't a hex color: %q", i, answer, half, p.Swatch)
		}
	}
	if p.Photo != "" {
		set++
	}
	if set != 1 {
		t.Errorf("spec %d (%q) part %s must set exactly one of Text/Icon/Swatch/Photo, got %d set: %#v", i, answer, half, set, p)
	}
}

func TestRebusMixedCompoundSpecsWellFormed(t *testing.T) {
	if len(rebusMixedCompoundSpecs) < 20 {
		t.Fatalf("expected a reasonably sized mixed-compound list, got only %d entries", len(rebusMixedCompoundSpecs))
	}
	for i, s := range rebusMixedCompoundSpecs {
		if s.answer == "" {
			t.Errorf("spec %d has an empty answer", i)
		}
		rebusValidatePart(t, i, "a", s.answer, s.a)
		rebusValidatePart(t, i, "b", s.answer, s.b)
		p := s.toPuzzle()
		if len(p.Pattern) != 0 {
			t.Errorf("spec %d (%q) unexpectedly produced a non-empty Pattern from toPuzzle()", i, s.answer)
		}
		if p.PartA == nil || p.PartB == nil {
			t.Errorf("spec %d (%q) toPuzzle() didn't set both PartA and PartB", i, s.answer)
		}
	}
}

// findRebusMixedCompoundIndex locates the first mixed-compound puzzle
// (PartA/PartB both set) in gs's puzzle list matching answer.
func findRebusMixedCompoundIndex(t *testing.T, gs *GameSessionState, answer string) int {
	t.Helper()
	return findRebusPuzzleIndex(t, gs, "mixed compound "+answer, func(p RebusPuzzle) bool {
		return p.PartA != nil && p.PartB != nil && p.Answer == answer
	})
}

func TestResolveRebusCompoundPart(t *testing.T) {
	tok, err := resolveRebusCompoundPart(RebusCompoundPart{Text: "SIDE"})
	if err != nil || tok.Text != "SIDE" || tok.Icon != "" || tok.Swatch != "" || tok.Image != "" {
		t.Fatalf("text part resolved incorrectly: %#v, err=%v", tok, err)
	}

	tok, err = resolveRebusCompoundPart(RebusCompoundPart{Icon: "log-out"})
	if err != nil || tok.Icon != "log-out" || tok.Text != "" {
		t.Fatalf("icon part resolved incorrectly: %#v, err=%v", tok, err)
	}

	tok, err = resolveRebusCompoundPart(RebusCompoundPart{Swatch: "#0a0a0a"})
	if err != nil || tok.Swatch != "#0a0a0a" || tok.Text != "" {
		t.Fatalf("swatch part resolved incorrectly: %#v, err=%v", tok, err)
	}

	restore := fakeRebusPhotoFetcher(t)
	defer restore()
	tok, err = resolveRebusCompoundPart(RebusCompoundPart{Photo: "house"})
	if err != nil || tok.Image == "" {
		t.Fatalf("photo part resolved incorrectly: %#v, err=%v", tok, err)
	}

	original := rebusPhotoFetcher
	rebusPhotoFetcher = func(word string) (string, error) { return "", fmt.Errorf("simulated outage") }
	defer func() { rebusPhotoFetcher = original }()
	if _, err := resolveRebusCompoundPart(RebusCompoundPart{Photo: "house"}); err == nil {
		t.Fatal("expected a Pexels failure to propagate as an error")
	}
}

func TestRebusStartAssemblesMixedCompoundPattern(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(2)
	defer fakeRebusPhotoFetcher(t)()

	// "checkout" = icon(check) + icon(log-out) — a pure icon+icon entry,
	// deterministic and easy to assert on precisely (no live-fetch photo
	// involved at all).
	idx := findRebusMixedCompoundIndex(t, gs, "checkout")
	gs.GameData["round"] = float64(idx)

	if _, _, err := gm.processRebusRoundMove(gs, rebusTestHostID, "rebus_start", nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	pattern, ok := gs.GameData["current_pattern"].([]RebusToken)
	if !ok || len(pattern) != 3 {
		t.Fatalf("expected a 3-token pattern (icon, connector, icon), got %#v", gs.GameData["current_pattern"])
	}
	if pattern[0].Icon != "check" || !pattern[1].Op || pattern[2].Icon != "log-out" {
		t.Fatalf("expected [icon(check), +, icon(log-out)], got %#v", pattern)
	}

	// A swatch+text entry ("blackboard") to confirm that shape assembles too.
	idx2 := findRebusMixedCompoundIndex(t, gs, "blackboard")
	gs.GameData["round"] = float64(idx2)
	if _, _, err := gm.processRebusRoundMove(gs, rebusTestHostID, "rebus_start", nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	pattern2, ok := gs.GameData["current_pattern"].([]RebusToken)
	if !ok || len(pattern2) != 3 {
		t.Fatalf("expected a 3-token pattern (swatch, connector, text), got %#v", gs.GameData["current_pattern"])
	}
	if pattern2[0].Swatch == "" || !pattern2[1].Op || pattern2[2].Text != "BOARD" {
		t.Fatalf("expected [swatch, +, text(BOARD)], got %#v", pattern2)
	}
}

// findRebusPuzzleIndex locates the first puzzle in gs's (unshuffled) list
// matching pred, for tests that need to target a specific puzzle shape
// deterministically.
func findRebusPuzzleIndex(t *testing.T, gs *GameSessionState, desc string, pred func(RebusPuzzle) bool) int {
	t.Helper()
	for i, p := range gs.RebusPuzzles {
		if pred(p) {
			return i
		}
	}
	t.Fatalf("no %s puzzle found in the test puzzle bank", desc)
	return -1
}

// findRebusPhotoCompoundIndex locates the first photo+text compound puzzle
// (PhotoWord set, TextWord set, PhotoWordB empty) in gs's puzzle list.
func findRebusPhotoCompoundIndex(t *testing.T, gs *GameSessionState) int {
	t.Helper()
	return findRebusPuzzleIndex(t, gs, "photo+text compound", func(p RebusPuzzle) bool {
		return p.PhotoWord != "" && p.TextWord != "" && p.PhotoWordB == ""
	})
}

// findRebusTwoPhotoCompoundIndex locates the first two-photo compound puzzle
// (both PhotoWord and PhotoWordB set) in gs's puzzle list.
func findRebusTwoPhotoCompoundIndex(t *testing.T, gs *GameSessionState) int {
	t.Helper()
	return findRebusPuzzleIndex(t, gs, "two-photo compound", func(p RebusPuzzle) bool {
		return p.PhotoWord != "" && p.PhotoWordB != ""
	})
}

// findRebusIconPuzzleIndex locates the first single-styled-image puzzle
// (PhotoWord set, no TextWord/PhotoWordB) in gs's puzzle list.
func findRebusIconPuzzleIndex(t *testing.T, gs *GameSessionState) int {
	t.Helper()
	return findRebusPuzzleIndex(t, gs, "single-image icon", func(p RebusPuzzle) bool {
		return p.PhotoWord != "" && p.TextWord == "" && p.PhotoWordB == ""
	})
}

// TestRebusStartAssemblesPhotoCompoundPattern jumps straight to a known
// photo-compound puzzle, starts it, and confirms the resulting
// current_pattern contains a real image token plus the text half in the
// right order (respecting PhotoFirst) — and that the real answer is still
// accepted by rebusAnswerMatches despite the pattern never containing the
// answer text itself.
func TestRebusStartAssemblesPhotoCompoundPattern(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(2)
	defer fakeRebusPhotoFetcher(t)()

	idx := findRebusPhotoCompoundIndex(t, gs)
	puzzle := gs.RebusPuzzles[idx]
	gs.GameData["round"] = float64(idx)

	if _, _, err := gm.processRebusRoundMove(gs, rebusTestHostID, "rebus_start", nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	pattern, ok := gs.GameData["current_pattern"].([]RebusToken)
	if !ok || len(pattern) != 3 {
		t.Fatalf("expected a 3-token pattern (photo, connector, text), got %#v", gs.GameData["current_pattern"])
	}

	var imageTok, textTok RebusToken
	var imageIdx int
	for i, tok := range pattern {
		if tok.Image != "" {
			imageTok = tok
			imageIdx = i
		} else if !tok.Op {
			textTok = tok
		}
	}
	if imageTok.Image == "" {
		t.Fatalf("expected one token to carry a real photo URL, got %#v", pattern)
	}
	if textTok.Text != puzzle.TextWord {
		t.Fatalf("expected the text half to be %q, got %q", puzzle.TextWord, textTok.Text)
	}
	wantImageFirst := puzzle.PhotoFirst
	gotImageFirst := imageIdx == 0
	if wantImageFirst != gotImageFirst {
		t.Fatalf("expected PhotoFirst=%v to place the image at index 0, but image was at index %d", puzzle.PhotoFirst, imageIdx)
	}

	// The pattern itself never contains readable answer text (only the photo
	// URL + one text half + a connector) — confirm the real answer is still
	// accepted server-side regardless.
	if !rebusAnswerMatches(puzzle, puzzle.Answer) {
		t.Fatalf("expected the real answer %q to be accepted", puzzle.Answer)
	}
}

// TestRebusStartSurfacesAFriendlyErrorWhenPexelsFailsForPhotoCompound mirrors
// TestFourFramesStartSurfacesAFriendlyErrorWhenPexelsFails — a Pexels outage
// must produce a clear, actionable error rather than a raw network error, and
// must leave the round counter untouched so the same puzzle can be retried.
func TestRebusStartSurfacesAFriendlyErrorWhenPexelsFailsForPhotoCompound(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(2)
	idx := findRebusPhotoCompoundIndex(t, gs)
	gs.GameData["round"] = float64(idx)

	original := rebusPhotoFetcher
	rebusPhotoFetcher = func(word string) (string, error) {
		return "", fmt.Errorf("simulated Pexels outage")
	}
	defer func() { rebusPhotoFetcher = original }()

	_, _, err := gm.processRebusRoundMove(gs, rebusTestHostID, "rebus_start", nil)
	if err == nil {
		t.Fatal("expected an error when the Pexels fetch fails")
	}
	if gs.GameData["round"] != float64(idx) {
		t.Fatalf("expected round to stay unchanged at %d after a failed start, got %v", idx, gs.GameData["round"])
	}
}

// TestRebusStartAssemblesTwoPhotoCompoundPattern jumps to a known two-photo
// compound puzzle (both PhotoWord and PhotoWordB set — the real fix for the
// "EGG + SHELL"-as-plain-text giveaway, one level stronger than photo+text)
// and confirms both fetched images land in the pattern in the right order,
// with neither one ever falling back to a text token.
func TestRebusStartAssemblesTwoPhotoCompoundPattern(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(2)
	defer fakeRebusPhotoFetcher(t)()

	idx := findRebusTwoPhotoCompoundIndex(t, gs)
	puzzle := gs.RebusPuzzles[idx]
	gs.GameData["round"] = float64(idx)

	if _, _, err := gm.processRebusRoundMove(gs, rebusTestHostID, "rebus_start", nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	pattern, ok := gs.GameData["current_pattern"].([]RebusToken)
	if !ok || len(pattern) != 3 {
		t.Fatalf("expected a 3-token pattern (photo, connector, photo), got %#v", gs.GameData["current_pattern"])
	}
	if pattern[1].Text != "+" || !pattern[1].Op {
		t.Fatalf("expected the middle token to be the '+' connector, got %#v", pattern[1])
	}
	if pattern[0].Image == "" || pattern[2].Image == "" {
		t.Fatalf("expected both outer tokens to carry real photo URLs, got %#v", pattern)
	}
	if pattern[0].Text != "" || pattern[2].Text != "" {
		t.Fatalf("expected neither outer token to fall back to plain text, got %#v", pattern)
	}
	wantFirst := "https://images.pexels.com/fake/" + puzzle.PhotoWord + ".jpg"
	wantSecond := "https://images.pexels.com/fake/" + puzzle.PhotoWordB + ".jpg"
	if !puzzle.PhotoFirst {
		wantFirst, wantSecond = wantSecond, wantFirst
	}
	if pattern[0].Image != wantFirst || pattern[2].Image != wantSecond {
		t.Fatalf("expected images %q then %q (PhotoFirst=%v), got %q then %q",
			wantFirst, wantSecond, puzzle.PhotoFirst, pattern[0].Image, pattern[2].Image)
	}
	if !rebusAnswerMatches(puzzle, puzzle.Answer) {
		t.Fatalf("expected the real answer %q to be accepted", puzzle.Answer)
	}
}

// TestRebusStartAssemblesIconPattern jumps to a known single-styled-image
// puzzle (a wholeScale/sub/sup word replaced by a real photo — "big wig"
// becomes a large wig photo, not large text) and confirms the fetched image
// carries the same scale/sub/sup flags the puzzle spec declared, in a
// single-token pattern with no connector or second half.
func TestRebusStartAssemblesIconPattern(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(2)
	defer fakeRebusPhotoFetcher(t)()

	idx := findRebusIconPuzzleIndex(t, gs)
	puzzle := gs.RebusPuzzles[idx]
	gs.GameData["round"] = float64(idx)

	if _, _, err := gm.processRebusRoundMove(gs, rebusTestHostID, "rebus_start", nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	pattern, ok := gs.GameData["current_pattern"].([]RebusToken)
	if !ok || len(pattern) != 1 {
		t.Fatalf("expected a single-token pattern, got %#v", gs.GameData["current_pattern"])
	}
	tok := pattern[0]
	wantImage := "https://images.pexels.com/fake/" + puzzle.PhotoWord + ".jpg"
	if tok.Image != wantImage {
		t.Fatalf("expected image %q, got %q", wantImage, tok.Image)
	}
	if tok.Scale != puzzle.PhotoScale || tok.Sub != puzzle.PhotoSub || tok.Sup != puzzle.PhotoSup {
		t.Fatalf("expected the image token to carry scale=%v sub=%v sup=%v, got %#v",
			puzzle.PhotoScale, puzzle.PhotoSub, puzzle.PhotoSup, tok)
	}
	if !rebusAnswerMatches(puzzle, puzzle.Answer) {
		t.Fatalf("expected the real answer %q to be accepted", puzzle.Answer)
	}
}

// TestRebusSetBoundaryEndsGameWithASoleLeader confirms the every-20-puzzles
// gate: once a set finishes with one player decisively ahead, the game ends
// immediately rather than grinding through the remaining sets.
func TestRebusSetBoundaryEndsGameWithASoleLeader(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(2)
	gs.GameData["round"] = float64(rebusSetSize) // the 20th puzzle is active
	gs.GameData["phase"] = "puzzle"
	gs.GameData["scores"] = map[string]interface{}{"1": float64(500), "2": float64(200)}

	gameOver, winnerID, err := gm.processRebusRoundMove(gs, rebusTestHostID, "reveal", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !gameOver {
		t.Fatal("expected the set boundary with a sole leader to end the game")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Fatalf("expected player 1 (the sole leader) to win, got %v", winnerID)
	}
	if gs.GameData["phase"] != "ended" {
		t.Fatalf("expected phase to be 'ended', got %v", gs.GameData["phase"])
	}
}

// TestRebusSetBoundaryContinuesOnATie confirms the other half of the gate:
// a tied score at a set boundary (including a 0-0 tie) does NOT end the
// game — play continues into the next set, and the reveal is flagged so the
// frontend can tell the player why nothing decisive happened yet.
func TestRebusSetBoundaryContinuesOnATie(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(2)
	gs.GameData["round"] = float64(rebusSetSize)
	gs.GameData["phase"] = "puzzle"
	gs.GameData["scores"] = map[string]interface{}{"1": float64(300), "2": float64(300)}

	gameOver, winnerID, err := gm.processRebusRoundMove(gs, rebusTestHostID, "reveal", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver {
		t.Fatal("expected a tied score at the set boundary to NOT end the game")
	}
	if winnerID != nil {
		t.Fatalf("expected no winner on a tie, got %v", winnerID)
	}
	if gs.GameData["phase"] != "reveal" {
		t.Fatalf("expected phase to still be 'reveal', got %v", gs.GameData["phase"])
	}
	if gs.GameData["set_complete_no_winner"] != true {
		t.Fatalf("expected set_complete_no_winner to be true, got %v", gs.GameData["set_complete_no_winner"])
	}
}

// TestRebusNonBoundaryRevealNeverChecksForAWinner confirms the set-boundary
// check only ever runs on a genuine multiple of rebusSetSize — an ordinary
// mid-set reveal must never end the game early even if one player happens to
// already be decisively ahead.
func TestRebusNonBoundaryRevealNeverChecksForAWinner(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(2)
	gs.GameData["round"] = float64(7) // not a multiple of rebusSetSize
	gs.GameData["phase"] = "puzzle"
	gs.GameData["scores"] = map[string]interface{}{"1": float64(900), "2": float64(0)}

	gameOver, _, err := gm.processRebusRoundMove(gs, rebusTestHostID, "reveal", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gameOver {
		t.Fatal("expected a mid-set reveal to never end the game, regardless of score gap")
	}
	if gs.GameData["set_complete_no_winner"] != false {
		t.Fatalf("expected set_complete_no_winner to be false on a non-boundary reveal, got %v", gs.GameData["set_complete_no_winner"])
	}
}

// TestRebusGenericHintSingleWord confirms the letter-count fallback used when
// a puzzle has no hand-authored Hint.
func TestRebusGenericHintSingleWord(t *testing.T) {
	got := rebusGenericHint("eggshell")
	want := "it's 8 letters"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestRebusGenericHintMultiWord(t *testing.T) {
	got := rebusGenericHint("polar bear")
	want := "it's 2 words (5+4 letters)"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

// TestRebusHintForAttemptEscalation confirms the three-stage escalation: no
// hint on the first wrong guess, a hint (authored if present, else generic)
// from the second wrong guess, and a first-letter reveal added from the
// third wrong guess onward.
func TestRebusHintForAttemptEscalation(t *testing.T) {
	if got := rebusHintForAttempt("eggshell", "", 1); got != "" {
		t.Fatalf("expected no hint on the first wrong attempt, got %q", got)
	}
	if got := rebusHintForAttempt("eggshell", "", 2); got != " Hint: it's 8 letters" {
		t.Fatalf("expected the generic hint on the second attempt, got %q", got)
	}
	if got := rebusHintForAttempt("eggshell", "", 3); got != " Hint: it's 8 letters, starts with 'E'" {
		t.Fatalf("expected the generic hint plus first letter on the third attempt, got %q", got)
	}
	// An authored hint takes priority over the generic fallback, but the
	// first-letter reveal still layers on top of it at attempt 3.
	if got := rebusHintForAttempt("growing old", "Watch the letters get bigger…", 2); got != " Hint: Watch the letters get bigger…" {
		t.Fatalf("expected the authored hint verbatim, got %q", got)
	}
	if got := rebusHintForAttempt("growing old", "Watch the letters get bigger…", 3); got != " Hint: Watch the letters get bigger…, starts with 'G'" {
		t.Fatalf("expected the authored hint plus first letter, got %q", got)
	}
}

// TestRebusWrongAttemptsTrackedPerPlayerAndResetOnStart confirms the tracking
// map is genuinely per-player (one player's wrong guesses never inflate
// another's count) and gets wiped clean on every new round.
func TestRebusWrongAttemptsTrackedPerPlayerAndResetOnStart(t *testing.T) {
	gs := makeTestRebusState(2)
	if got := rebusIncrementWrongAttempts(gs, "wrong_attempts", 1); got != 1 {
		t.Fatalf("expected player 1's first increment to be 1, got %d", got)
	}
	if got := rebusIncrementWrongAttempts(gs, "wrong_attempts", 1); got != 2 {
		t.Fatalf("expected player 1's second increment to be 2, got %d", got)
	}
	if got := rebusIncrementWrongAttempts(gs, "wrong_attempts", 2); got != 1 {
		t.Fatalf("expected player 2's own first increment to be 1 (independent of player 1), got %d", got)
	}
	rebusResetWrongAttempts(gs, "wrong_attempts")
	if got := rebusIncrementWrongAttempts(gs, "wrong_attempts", 1); got != 1 {
		t.Fatalf("expected the count to reset to 1 after rebusResetWrongAttempts, got %d", got)
	}
}

// TestRebusAnswerWrongIncludesHintFromSecondAttempt confirms the real
// end-to-end wiring through processRebusRoundMove: no hint text on the first
// wrong guess, a hint appears from the second.
func TestRebusAnswerWrongIncludesHintFromSecondAttempt(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(2)
	idx := findRebusPuzzleIndex(t, gs, "hand-authored with a real Hint", func(p RebusPuzzle) bool {
		return p.Hint != "" && p.PhotoWord == ""
	})
	gs.GameData["round"] = float64(idx + 1)
	gs.GameData["phase"] = "puzzle"
	puzzle := gs.RebusPuzzles[idx]

	_, _, err1 := gm.processRebusRoundMove(gs, 1, "answer", map[string]interface{}{"guess": "definitely wrong"})
	if err1 == nil || strings.Contains(err1.Error(), "Hint:") {
		t.Fatalf("expected the first wrong guess to carry no hint, got %v", err1)
	}
	_, _, err2 := gm.processRebusRoundMove(gs, 1, "answer", map[string]interface{}{"guess": "still wrong"})
	if err2 == nil || !strings.Contains(err2.Error(), "Hint: "+puzzle.Hint) {
		t.Fatalf("expected the second wrong guess to include the puzzle's authored hint %q, got %v", puzzle.Hint, err2)
	}
}

// TestRebusWithPexelsRetrySucceedsAfterTransientFailures confirms a fetch
// that fails on its first attempts but succeeds before rebusPexelsMaxAttempts
// is reached returns the success, not an error.
func TestRebusWithPexelsRetrySucceedsAfterTransientFailures(t *testing.T) {
	original := rebusPexelsRetryDelay
	rebusPexelsRetryDelay = time.Millisecond
	defer func() { rebusPexelsRetryDelay = original }()

	calls := 0
	result, err := rebusWithPexelsRetry(func() (string, error) {
		calls++
		if calls < rebusPexelsMaxAttempts {
			return "", fmt.Errorf("simulated transient failure")
		}
		return "https://images.pexels.com/fake/success.jpg", nil
	})
	if err != nil {
		t.Fatalf("expected eventual success, got error: %v", err)
	}
	if result != "https://images.pexels.com/fake/success.jpg" {
		t.Fatalf("unexpected result: %q", result)
	}
	if calls != rebusPexelsMaxAttempts {
		t.Fatalf("expected exactly %d calls, got %d", rebusPexelsMaxAttempts, calls)
	}
}

// TestRebusWithPexelsRetryReturnsLastErrorAfterExhaustion confirms a
// persistently-failing fetch returns the final attempt's error, not a
// generic wrapper, after making exactly rebusPexelsMaxAttempts attempts.
func TestRebusWithPexelsRetryReturnsLastErrorAfterExhaustion(t *testing.T) {
	original := rebusPexelsRetryDelay
	rebusPexelsRetryDelay = time.Millisecond
	defer func() { rebusPexelsRetryDelay = original }()

	calls := 0
	_, err := rebusWithPexelsRetry(func() (string, error) {
		calls++
		return "", fmt.Errorf("persistent failure #%d", calls)
	})
	if err == nil {
		t.Fatal("expected an error after exhausting all retries")
	}
	if calls != rebusPexelsMaxAttempts {
		t.Fatalf("expected exactly %d calls, got %d", rebusPexelsMaxAttempts, calls)
	}
	wantMsg := fmt.Sprintf("persistent failure #%d", rebusPexelsMaxAttempts)
	if err.Error() != wantMsg {
		t.Fatalf("expected the last attempt's error %q, got %q", wantMsg, err.Error())
	}
}

// TestRebusFinalSetWithNoLeaderIsADraw confirms the "reached the very end of
// the bank with no decisive leader" case is exactly a draw, computed via the
// same rebusWinnerFromScores helper rebus_end already uses — no special
// end-of-bank logic needed beyond what already exists.
func TestRebusFinalSetWithNoLeaderIsADraw(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestRebusState(2)
	gs.GameData["scores"] = map[string]interface{}{"1": float64(1000), "2": float64(1000)}

	gameOver, winnerID, err := gm.processRebusRoundMove(gs, rebusTestHostID, "rebus_end", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !gameOver {
		t.Fatal("expected rebus_end to always end the game")
	}
	if winnerID != nil {
		t.Fatalf("expected a tied final score to be a draw (nil winner), got %v", winnerID)
	}
}
