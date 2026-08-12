package games

import (
	"fmt"
	"testing"
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

func TestFetchFourFramesPhotosRequiresAPIKey(t *testing.T) {
	t.Setenv("PEXELS_API_KEY", "")
	_, err := fetchFourFramesPhotos("elephant")
	if err == nil {
		t.Fatal("expected fetchFourFramesPhotos to fail with no API key configured")
	}
}
