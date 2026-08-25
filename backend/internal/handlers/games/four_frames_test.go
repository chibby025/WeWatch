package games

import (
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"
	"wewatch-backend/internal/models"
)

const fourFramesTestHostID = uint(1)

// makeTestFourFramesState mirrors makeTestRebusState — a deterministic
// 2-player state with a fixed, non-shuffled round order.
func makeTestFourFramesState(numPlayers int) *GameSessionState {
	players := make([]models.Player, numPlayers)
	for i := range players {
		players[i] = models.Player{UserID: uint(i + 1)}
	}
	rounds := make([]FourFramesRound, len(fourFramesWordBank))
	copy(rounds, fourFramesWordBank)
	gs := &GameSessionState{
		Players:          players,
		CurrentTurn:      0,
		GameData:         map[string]interface{}{},
		GameSession:      &models.GameSession{GameType: "four_frames", HostID: fourFramesTestHostID},
		FourFramesRounds: rounds,
	}
	gs.GameData["phase"] = "waiting"
	gs.GameData["round"] = float64(0)
	gs.GameData["scores"] = map[string]interface{}{}
	return gs
}

// fakeFourFramesFetcher swaps in a deterministic, network-free stand-in for
// fourFramesPhotoFetcher for the duration of one test — restore() must be
// deferred by the caller to avoid leaking the fake into later tests.
func fakeFourFramesFetcher(t *testing.T) (restore func()) {
	t.Helper()
	original := fourFramesPhotoFetcher
	fourFramesPhotoFetcher = func(word string) ([]string, error) {
		return []string{
			"https://images.pexels.com/fake/1.jpg",
			"https://images.pexels.com/fake/2.jpg",
			"https://images.pexels.com/fake/3.jpg",
			"https://images.pexels.com/fake/4.jpg",
			"https://images.pexels.com/fake/5-alt.jpg",
		}, nil
	}
	return func() { fourFramesPhotoFetcher = original }
}

// fakeFourFramesFetcherFourOnly mirrors fakeFourFramesFetcher but returns
// only the 4 required for core gameplay, with no 5th "alt view" photo —
// exercises the "round plays completely normally with no bonus hint
// available" path fetchFourFramesPhotos' own comment documents.
func fakeFourFramesFetcherFourOnly(t *testing.T) (restore func()) {
	t.Helper()
	original := fourFramesPhotoFetcher
	fourFramesPhotoFetcher = func(word string) ([]string, error) {
		return []string{
			"https://images.pexels.com/fake/1.jpg",
			"https://images.pexels.com/fake/2.jpg",
			"https://images.pexels.com/fake/3.jpg",
			"https://images.pexels.com/fake/4.jpg",
		}, nil
	}
	return func() { fourFramesPhotoFetcher = original }
}

func TestFourFramesAnswerMatches(t *testing.T) {
	r := FourFramesRound{Word: "hot air balloon", Alternates: []string{"balloon"}}
	cases := map[string]bool{
		"Hot Air Balloon": true,
		"hot-air-balloon": true,
		"balloon":         true,
		"Balloon!":        true,
		"parachute":       false,
		"":                false,
	}
	for guess, want := range cases {
		if got := fourFramesAnswerMatches(r, guess); got != want {
			t.Errorf("fourFramesAnswerMatches(%q) = %v, want %v", guess, got, want)
		}
	}
}

func TestFourFramesShuffledRoundsReturnsFullBankEachTime(t *testing.T) {
	a := fourFramesShuffledRounds()
	b := fourFramesShuffledRounds()
	if len(a) != len(fourFramesWordBank) || len(b) != len(fourFramesWordBank) {
		t.Fatalf("expected both shuffles to return the full %d-entry bank, got %d and %d", len(fourFramesWordBank), len(a), len(b))
	}
}

func TestFourFramesStartOnlyHost(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestFourFramesState(2)
	defer fakeFourFramesFetcher(t)()
	_, _, err := gm.processFourFramesMove(gs, 2, "four_frames_start", nil)
	if err == nil {
		t.Fatal("expected non-host four_frames_start to be rejected")
	}
}

func TestFourFramesStartAdvancesRoundAndExposesPhotosOnly(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestFourFramesState(2)
	defer fakeFourFramesFetcher(t)()
	_, _, err := gm.processFourFramesMove(gs, fourFramesTestHostID, "four_frames_start", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gs.GameData["phase"] != "puzzle" {
		t.Fatalf("expected phase=puzzle, got %v", gs.GameData["phase"])
	}
	if gs.GameData["round"] != float64(1) {
		t.Fatalf("expected round=1, got %v", gs.GameData["round"])
	}
	photos, ok := gs.GameData["current_photos"].([]string)
	if !ok || len(photos) != 4 {
		t.Fatalf("expected exactly 4 current_photos, got %#v", gs.GameData["current_photos"])
	}
	// The answer word must never be present anywhere in GameData at this
	// point — the entire point of keeping FourFramesRounds off GameData.
	if _, exists := gs.GameData["word"]; exists {
		t.Fatal("current round's answer word must not appear in GameData before reveal")
	}
	if gs.GameData["revealed_answer"] != "" {
		t.Fatalf("expected revealed_answer to be blank before reveal, got %v", gs.GameData["revealed_answer"])
	}
}

func TestFourFramesStartSurfacesAFriendlyErrorWhenPexelsFails(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestFourFramesState(2)
	original := fourFramesPhotoFetcher
	fourFramesPhotoFetcher = func(word string) ([]string, error) {
		return nil, fmt.Errorf("simulated Pexels outage")
	}
	defer func() { fourFramesPhotoFetcher = original }()

	_, _, err := gm.processFourFramesMove(gs, fourFramesTestHostID, "four_frames_start", nil)
	if err == nil {
		t.Fatal("expected four_frames_start to fail when the photo fetch fails")
	}
	// Phase must stay at "waiting" — a failed fetch must not silently leave
	// the game in a half-started state with no photos to show.
	if gs.GameData["phase"] != "waiting" {
		t.Fatalf("expected phase to remain 'waiting' after a failed fetch, got %v", gs.GameData["phase"])
	}
}

func TestFourFramesStartRejectsWhenPoolExhausted(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestFourFramesState(2)
	gs.FourFramesRounds = gs.FourFramesRounds[:1] // pool of exactly 1 round
	defer fakeFourFramesFetcher(t)()
	if _, _, err := gm.processFourFramesMove(gs, fourFramesTestHostID, "four_frames_start", nil); err != nil {
		t.Fatalf("unexpected error starting the only round: %v", err)
	}
	if _, _, err := gm.processFourFramesMove(gs, fourFramesTestHostID, "four_frames_start", nil); err == nil {
		t.Fatal("expected four_frames_start to be rejected once the pool is exhausted")
	}
}

func TestFourFramesAnswerCorrectAwardsRankedPoints(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestFourFramesState(2)
	defer fakeFourFramesFetcher(t)()
	if _, _, err := gm.processFourFramesMove(gs, fourFramesTestHostID, "four_frames_start", nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	realWord := gs.FourFramesRounds[0].Word

	if _, _, err := gm.processFourFramesMove(gs, 1, "answer", map[string]interface{}{"guess": realWord}); err != nil {
		t.Fatalf("player 1's correct guess was rejected: %v", err)
	}
	if _, _, err := gm.processFourFramesMove(gs, 2, "answer", map[string]interface{}{"guess": realWord}); err != nil {
		t.Fatalf("player 2's correct guess was rejected: %v", err)
	}

	scores := gs.GameData["scores"].(map[string]interface{})
	if scores["1"] != float64(100) {
		t.Errorf("expected player 1 (1st correct) to score 100, got %v", scores["1"])
	}
	if scores["2"] != float64(75) {
		t.Errorf("expected player 2 (2nd correct) to score 75, got %v", scores["2"])
	}
}

func TestFourFramesAnswerWrongIsRejectedAndDoesNotScore(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestFourFramesState(2)
	defer fakeFourFramesFetcher(t)()
	if _, _, err := gm.processFourFramesMove(gs, fourFramesTestHostID, "four_frames_start", nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	_, _, err := gm.processFourFramesMove(gs, 1, "answer", map[string]interface{}{"guess": "definitely not the answer"})
	if err == nil {
		t.Fatal("expected a wrong guess to be rejected")
	}
	scores, _ := gs.GameData["scores"].(map[string]interface{})
	if _, exists := scores["1"]; exists {
		t.Errorf("expected no score recorded for a wrong guess, got %v", scores["1"])
	}
}

func TestFourFramesAnswerCannotBeSubmittedTwiceByTheSamePlayer(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestFourFramesState(2)
	defer fakeFourFramesFetcher(t)()
	gm.processFourFramesMove(gs, fourFramesTestHostID, "four_frames_start", nil)
	realWord := gs.FourFramesRounds[0].Word
	gm.processFourFramesMove(gs, 1, "answer", map[string]interface{}{"guess": realWord})
	if _, _, err := gm.processFourFramesMove(gs, 1, "answer", map[string]interface{}{"guess": realWord}); err == nil {
		t.Fatal("expected a second submission from the same player to be rejected")
	}
}

func TestFourFramesAnswerRejectedOutsidePuzzlePhase(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestFourFramesState(2)
	// still phase="waiting" — no round started yet
	if _, _, err := gm.processFourFramesMove(gs, 1, "answer", map[string]interface{}{"guess": "anything"}); err == nil {
		t.Fatal("expected answer to be rejected before any round has started")
	}
}

func TestFourFramesRevealOnlyHostAndExposesAnswer(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestFourFramesState(2)
	defer fakeFourFramesFetcher(t)()
	gm.processFourFramesMove(gs, fourFramesTestHostID, "four_frames_start", nil)
	realWord := gs.FourFramesRounds[0].Word

	if _, _, err := gm.processFourFramesMove(gs, 2, "reveal", nil); err == nil {
		t.Fatal("expected non-host reveal to be rejected")
	}
	if _, _, err := gm.processFourFramesMove(gs, fourFramesTestHostID, "reveal", nil); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gs.GameData["phase"] != "reveal" {
		t.Fatalf("expected phase=reveal, got %v", gs.GameData["phase"])
	}
	if gs.GameData["revealed_answer"] != realWord {
		t.Fatalf("expected revealed_answer=%q, got %v", realWord, gs.GameData["revealed_answer"])
	}
}

func TestFourFramesEndDeclaresWinnerByScore(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestFourFramesState(2)
	gs.GameData["scores"] = map[string]interface{}{"1": float64(150), "2": float64(75)}
	over, winnerID, err := gm.processFourFramesMove(gs, fourFramesTestHostID, "four_frames_end", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !over {
		t.Fatal("expected gameOver=true")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Fatalf("expected winnerID=1, got %v", winnerID)
	}
	if gs.GameData["phase"] != "ended" {
		t.Fatalf("expected phase=ended, got %v", gs.GameData["phase"])
	}
}

func TestFourFramesEndTiedScoresIsADraw(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestFourFramesState(2)
	gs.GameData["scores"] = map[string]interface{}{"1": float64(100), "2": float64(100)}
	_, winnerID, err := gm.processFourFramesMove(gs, fourFramesTestHostID, "four_frames_end", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if winnerID != nil {
		t.Fatalf("expected a nil winnerID for a tie, got %v", *winnerID)
	}
}

func TestFourFramesEndOnlyHost(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestFourFramesState(2)
	if _, _, err := gm.processFourFramesMove(gs, 2, "four_frames_end", nil); err == nil {
		t.Fatal("expected non-host four_frames_end to be rejected")
	}
}

// TestFourFramesWordBankIntegrity mirrors TestRebusPuzzleBankIntegrity —
// every word must normalize to something non-empty and unique, and every
// alternate must too.
func TestFourFramesWordBankIntegrity(t *testing.T) {
	if len(fourFramesWordBank) < 30 {
		t.Fatalf("expected a reasonably sized word bank, got only %d entries", len(fourFramesWordBank))
	}
	seen := map[string]bool{}
	for i, r := range fourFramesWordBank {
		norm := rebusNormalize(r.Word)
		if norm == "" {
			t.Errorf("entry %d (%q) normalizes to an empty word", i, r.Word)
		}
		if seen[norm] {
			t.Errorf("entry %d (%q) duplicates another entry's normalized word", i, r.Word)
		}
		seen[norm] = true
		for _, alt := range r.Alternates {
			if rebusNormalize(alt) == "" {
				t.Errorf("entry %d (%q) has an alternate that normalizes to empty: %q", i, r.Word, alt)
			}
		}
	}
}

// TestFourFramesCheckpointEndsGameEarlyWithClearLeader plays 20 full rounds
// where player 1 always answers first (and player 2 never answers), then
// confirms the 20th round's reveal ends the game right there — declaring
// player 1 the winner — instead of continuing toward the full 82-word bank.
func TestFourFramesCheckpointEndsGameEarlyWithClearLeader(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestFourFramesState(2)
	defer fakeFourFramesFetcher(t)()

	var gameOver bool
	var winnerID *uint
	var err error
	for i := 0; i < fourFramesCheckpointSize; i++ {
		if _, _, err = gm.processFourFramesMove(gs, fourFramesTestHostID, "four_frames_start", nil); err != nil {
			t.Fatalf("round %d: unexpected start error: %v", i+1, err)
		}
		round, _ := gs.GameData["round"].(float64)
		realWord := gs.FourFramesRounds[int(round)-1].Word
		if _, _, err = gm.processFourFramesMove(gs, 1, "answer", map[string]interface{}{"guess": realWord}); err != nil {
			t.Fatalf("round %d: unexpected answer error: %v", i+1, err)
		}
		gameOver, winnerID, err = gm.processFourFramesMove(gs, fourFramesTestHostID, "reveal", nil)
		if err != nil {
			t.Fatalf("round %d: unexpected reveal error: %v", i+1, err)
		}
	}

	if !gameOver {
		t.Fatal("expected the game to end at the round-20 checkpoint with a clear leader")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Fatalf("expected player 1 to be declared the winner, got %v", winnerID)
	}
	if gs.GameData["phase"] != "ended" {
		t.Fatalf("expected phase=ended, got %v", gs.GameData["phase"])
	}
}

// TestFourFramesCheckpointContinuesWhenTied alternates which player answers
// first each round so both end up with an identical score after 20 rounds,
// then confirms the checkpoint does NOT end the game on a tie — it should
// behave exactly like any other reveal (phase stays "reveal", not "ended").
func TestFourFramesCheckpointContinuesWhenTied(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestFourFramesState(2)
	defer fakeFourFramesFetcher(t)()

	var gameOver bool
	for i := 0; i < fourFramesCheckpointSize; i++ {
		if _, _, err := gm.processFourFramesMove(gs, fourFramesTestHostID, "four_frames_start", nil); err != nil {
			t.Fatalf("round %d: unexpected start error: %v", i+1, err)
		}
		round, _ := gs.GameData["round"].(float64)
		realWord := gs.FourFramesRounds[int(round)-1].Word

		first, second := uint(1), uint(2)
		if i%2 == 1 {
			first, second = second, first
		}
		if _, _, err := gm.processFourFramesMove(gs, first, "answer", map[string]interface{}{"guess": realWord}); err != nil {
			t.Fatalf("round %d: unexpected first-answer error: %v", i+1, err)
		}
		if _, _, err := gm.processFourFramesMove(gs, second, "answer", map[string]interface{}{"guess": realWord}); err != nil {
			t.Fatalf("round %d: unexpected second-answer error: %v", i+1, err)
		}

		var err error
		gameOver, _, err = gm.processFourFramesMove(gs, fourFramesTestHostID, "reveal", nil)
		if err != nil {
			t.Fatalf("round %d: unexpected reveal error: %v", i+1, err)
		}
	}

	scores, _ := gs.GameData["scores"].(map[string]interface{})
	if scores["1"] != scores["2"] {
		t.Fatalf("expected a genuine tie going into the checkpoint, got p1=%v p2=%v", scores["1"], scores["2"])
	}
	if gameOver {
		t.Fatal("expected the checkpoint to NOT end the game when the top score is tied")
	}
	if gs.GameData["phase"] != "reveal" {
		t.Fatalf("expected phase=reveal (game continues), got %v", gs.GameData["phase"])
	}
}

// TestPexelsAltLooksRelevant uses the exact real alt-text strings captured
// live from api.pexels.com on 2026-08 for a "bat" search — the confirmed real
// case this filter exists to catch (a genuine bat photo mixed with a
// baseball-game photo and an unrelated insect photo, all returned for the
// same bare "bat" query).
func TestPexelsAltLooksRelevant(t *testing.T) {
	cases := []struct {
		name string
		word string
		alt  string
		want bool
	}{
		{
			name: "real bat photo passes",
			word: "flying bat",
			alt:  "Intimate close-up showing common big-eared bats hanging in Gamboa, Panama. Detailed view of nocturnal wildlife.",
			want: true,
		},
		{
			name: "baseball photo correctly rejected for a bat query",
			word: "flying bat",
			alt:  "Action-packed baseball game capture in Chicago, featuring players in a thrilling match.",
			want: false,
		},
		{
			name: "unrelated insect photo correctly rejected",
			word: "flying bat",
			alt:  "A true bug contemplates leaping off the bridge.",
			want: false,
		},
		{
			name: "empty alt text is never penalized",
			word: "elephant",
			alt:  "",
			want: true,
		},
		{
			name: "case and punctuation differences still match",
			word: "Elephant",
			alt:  "A GRAY ELEPHANT, standing in a field!",
			want: true,
		},
		{
			name: "multi-word query matches on any one overlapping word",
			word: "hot air balloon",
			alt:  "Colorful balloon festival at sunrise.",
			want: true,
		},
		{
			name: "multi-word query with zero overlap is rejected",
			word: "hot air balloon",
			alt:  "A red sports car parked on a city street.",
			want: false,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := pexelsAltLooksRelevant(c.word, c.alt)
			if got != c.want {
				t.Errorf("pexelsAltLooksRelevant(%q, %q) = %v, want %v", c.word, c.alt, got, c.want)
			}
		})
	}
}

func TestFetchFourFramesPhotosRequiresAPIKey(t *testing.T) {
	t.Setenv("PEXELS_API_KEY", "")
	_, err := fetchFourFramesPhotos("elephant")
	if err == nil {
		t.Fatal("expected fetchFourFramesPhotos to fail with no API key configured")
	}
}

// TestFourFramesAnswerWrongIncludesHintFromSecondAttempt mirrors Rebus
// Round's identical test — shared rebusIncrementWrongAttempts/
// rebusHintForAttempt wiring, confirmed working for this game too. No entry
// in fourFramesWordBank has an authored Hint, so this also exercises the
// generic (letter-count) fallback for real, not just the authored-hint path
// Rebus Round's own version already covers.
func TestFourFramesAnswerWrongIncludesHintFromSecondAttempt(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestFourFramesState(2)
	gs.GameData["round"] = float64(1)
	gs.GameData["phase"] = "puzzle"
	word := gs.FourFramesRounds[0].Word

	_, _, err1 := gm.processFourFramesMove(gs, fourFramesTestHostID, "answer", map[string]interface{}{"guess": "definitely wrong"})
	if err1 == nil || strings.Contains(err1.Error(), "Hint:") {
		t.Fatalf("expected the first wrong guess to carry no hint, got %v", err1)
	}
	_, _, err2 := gm.processFourFramesMove(gs, fourFramesTestHostID, "answer", map[string]interface{}{"guess": "still wrong"})
	wantHint := "Hint: " + rebusGenericHint(word)
	if err2 == nil || !strings.Contains(err2.Error(), wantHint) {
		t.Fatalf("expected the second wrong guess to include %q, got %v", wantHint, err2)
	}
}

// TestFourFramesAltPhotoRevealedAtThreshold confirms the 5th "alt view"
// photo stays hidden through the first fourFramesAltPhotoAfterAttempts-1
// wrong guesses, then appears in GameData["alt_photo_url"] exactly once the
// threshold is reached — using the real 5th URL fakeFourFramesFetcher
// supplies.
func TestFourFramesAltPhotoRevealedAtThreshold(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestFourFramesState(2)
	defer fakeFourFramesFetcher(t)()
	if _, _, err := gm.processFourFramesMove(gs, fourFramesTestHostID, "four_frames_start", nil); err != nil {
		t.Fatalf("unexpected start error: %v", err)
	}

	for attempt := 1; attempt < fourFramesAltPhotoAfterAttempts; attempt++ {
		if _, _, err := gm.processFourFramesMove(gs, 1, "answer", map[string]interface{}{"guess": "definitely wrong"}); err == nil {
			t.Fatalf("attempt %d: expected the wrong guess to be rejected", attempt)
		}
		if alt, _ := gs.GameData["alt_photo_url"].(string); alt != "" {
			t.Fatalf("attempt %d: expected alt_photo_url to still be hidden below the threshold, got %q", attempt, alt)
		}
	}

	if _, _, err := gm.processFourFramesMove(gs, 1, "answer", map[string]interface{}{"guess": "definitely wrong"}); err == nil {
		t.Fatal("expected the threshold-crossing wrong guess to still be rejected")
	}
	wantAlt := "https://images.pexels.com/fake/5-alt.jpg"
	if alt, _ := gs.GameData["alt_photo_url"].(string); alt != wantAlt {
		t.Fatalf("expected alt_photo_url=%q once the threshold is reached, got %q", wantAlt, alt)
	}
}

// TestFourFramesAltPhotoNotAvailableWhenOnlyFourPhotosFetched confirms a
// round with only 4 usable Pexels candidates (no 5th) plays completely
// normally — the threshold-crossing guess is still rejected as normal, it
// just never sets alt_photo_url, and nothing panics on the nil map lookup.
func TestFourFramesAltPhotoNotAvailableWhenOnlyFourPhotosFetched(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestFourFramesState(2)
	defer fakeFourFramesFetcherFourOnly(t)()
	if _, _, err := gm.processFourFramesMove(gs, fourFramesTestHostID, "four_frames_start", nil); err != nil {
		t.Fatalf("unexpected start error: %v", err)
	}

	for attempt := 1; attempt <= fourFramesAltPhotoAfterAttempts; attempt++ {
		if _, _, err := gm.processFourFramesMove(gs, 1, "answer", map[string]interface{}{"guess": "definitely wrong"}); err == nil {
			t.Fatalf("attempt %d: expected the wrong guess to be rejected", attempt)
		}
	}
	if alt, _ := gs.GameData["alt_photo_url"].(string); alt != "" {
		t.Fatalf("expected alt_photo_url to stay empty when no 5th photo was ever fetched, got %q", alt)
	}
}

// TestFourFramesAltPhotoResetsEachRound confirms a fresh round's
// four_frames_start clears any alt_photo_url left over from the previous
// round — otherwise a player joining round 2 could see round 1's leftover
// clue sitting there before anyone's even guessed wrong yet.
func TestFourFramesAltPhotoResetsEachRound(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestFourFramesState(2)
	defer fakeFourFramesFetcher(t)()
	gm.processFourFramesMove(gs, fourFramesTestHostID, "four_frames_start", nil)
	for attempt := 1; attempt <= fourFramesAltPhotoAfterAttempts; attempt++ {
		gm.processFourFramesMove(gs, 1, "answer", map[string]interface{}{"guess": "definitely wrong"})
	}
	if alt, _ := gs.GameData["alt_photo_url"].(string); alt == "" {
		t.Fatal("test setup failed: expected round 1 to have revealed its alt photo")
	}
	gm.processFourFramesMove(gs, fourFramesTestHostID, "reveal", nil)
	if _, _, err := gm.processFourFramesMove(gs, fourFramesTestHostID, "four_frames_start", nil); err != nil {
		t.Fatalf("unexpected error starting round 2: %v", err)
	}
	if alt, _ := gs.GameData["alt_photo_url"].(string); alt != "" {
		t.Fatalf("expected round 2 to start with alt_photo_url cleared, got %q", alt)
	}
}

// TestFourFramesPrefetchConsumedForNextRound confirms the background
// prefetch spawned by round 1's four_frames_start is actually consumed by
// round 2's four_frames_start, rather than round 2 doing its own redundant
// live fetch on top of it. The fetcher being called ONCE for round 2's word
// is expected — that's the prefetch itself, from the background goroutine.
// The bug this catches is a SECOND call for that same word once round 2
// actually starts, which would mean the cache was never consulted (or
// missed) and a live fallback fetch ran anyway.
func TestFourFramesPrefetchConsumedForNextRound(t *testing.T) {
	gm := &GameManager{}
	gs := makeTestFourFramesState(2)
	round2Word := gs.FourFramesRounds[1].Word

	var mu sync.Mutex
	round2Calls := 0

	original := fourFramesPhotoFetcher
	defer func() { fourFramesPhotoFetcher = original }()
	fourFramesPhotoFetcher = func(word string) ([]string, error) {
		if word == round2Word {
			mu.Lock()
			round2Calls++
			mu.Unlock()
		}
		return []string{
			"https://images.pexels.com/fake/1.jpg",
			"https://images.pexels.com/fake/2.jpg",
			"https://images.pexels.com/fake/3.jpg",
			"https://images.pexels.com/fake/4.jpg",
			"https://images.pexels.com/fake/5-alt.jpg",
		}, nil
	}

	if _, _, err := gm.processFourFramesMove(gs, fourFramesTestHostID, "four_frames_start", nil); err != nil {
		t.Fatalf("unexpected error starting round 1: %v", err)
	}

	// The background prefetch for round 2 was just spawned via `go` — poll
	// for it to land instead of a fixed sleep, bounded so a genuine failure
	// to prefetch fails the test promptly rather than hanging.
	key := fourFramesPrefetchKey(gs.GameSession.ID, 1)
	deadline := time.Now().Add(2 * time.Second)
	for {
		if _, ok := gm.fourFramesPrefetch.Load(key); ok {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("timed out waiting for the round 2 prefetch to complete")
		}
		time.Sleep(time.Millisecond)
	}

	mu.Lock()
	callsBeforeRound2Starts := round2Calls
	mu.Unlock()
	if callsBeforeRound2Starts != 1 {
		t.Fatalf("expected exactly 1 fetch for round 2's word (the prefetch itself) before round 2 starts, got %d", callsBeforeRound2Starts)
	}

	if _, _, err := gm.processFourFramesMove(gs, fourFramesTestHostID, "reveal", nil); err != nil {
		t.Fatalf("unexpected error revealing round 1: %v", err)
	}
	if _, _, err := gm.processFourFramesMove(gs, fourFramesTestHostID, "four_frames_start", nil); err != nil {
		t.Fatalf("unexpected error starting round 2: %v", err)
	}
	if _, stillCached := gm.fourFramesPrefetch.Load(key); stillCached {
		t.Fatal("expected the prefetch entry to be consumed (LoadAndDelete) once round 2 started")
	}

	mu.Lock()
	finalCalls := round2Calls
	mu.Unlock()
	if finalCalls != 1 {
		t.Fatalf("expected round 2's word to be fetched exactly once total (via prefetch, never a redundant live fetch), got %d calls", finalCalls)
	}
}

// TestFourFramesPrefetchClearedOnGameEnd confirms an unconsumed prefetch
// entry is removed when the game ends, rather than leaking in
// GameManager.fourFramesPrefetch forever.
func TestFourFramesPrefetchClearedOnGameEnd(t *testing.T) {
	gm := &GameManager{}
	sessionID := uint(999)
	gm.fourFramesPrefetch.Store(fourFramesPrefetchKey(sessionID, 3), fourFramesPrefetchResult{photos: []string{"https://images.pexels.com/fake/x.jpg"}})
	gm.fourFramesPrefetch.Store(fourFramesPrefetchKey(sessionID+1, 3), fourFramesPrefetchResult{photos: []string{"https://images.pexels.com/fake/y.jpg"}})

	gm.clearFourFramesPrefetch(sessionID)

	if _, ok := gm.fourFramesPrefetch.Load(fourFramesPrefetchKey(sessionID, 3)); ok {
		t.Fatal("expected the target session's prefetch entry to be removed")
	}
	if _, ok := gm.fourFramesPrefetch.Load(fourFramesPrefetchKey(sessionID+1, 3)); !ok {
		t.Fatal("expected a DIFFERENT session's prefetch entry to be left untouched")
	}
}
