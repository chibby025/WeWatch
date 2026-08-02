package games

import (
	"testing"
	"wewatch-backend/internal/models"
)

var testPlayerNames = []string{"", "alice", "bob", "carol", "dave"}

func makeTestDrawGuessState(hostID uint, numPlayers int) *GameSessionState {
	players := make([]models.Player, numPlayers)
	for i := range players {
		name := "player"
		if i+1 < len(testPlayerNames) {
			name = testPlayerNames[i+1]
		}
		players[i] = models.Player{UserID: uint(i + 1), Username: name}
	}
	return &GameSessionState{
		Players:     players,
		CurrentTurn: 0,
		GameData:    map[string]interface{}{},
		GameSession: &models.GameSession{HostID: hostID, GameType: "draw_guess"},
	}
}

// ---- reveal-word bug fix -----------------------------------------------------

// TestDrawGuessPublicStateHidesWordDuringDrawing is the regression check for
// the original design intent — this already worked correctly before the fix,
// but is worth pinning down explicitly alongside the reveal-phase fix below so
// a future change can't quietly reintroduce a leak during the live round.
func TestDrawGuessPublicStateHidesWordDuringDrawing(t *testing.T) {
	gameData := map[string]interface{}{
		"phase":        "drawing",
		"current_word": "elephant",
	}
	out := drawGuessPublicState(gameData)
	if _, present := out["current_word"]; present {
		t.Error("expected current_word to be stripped while phase is drawing")
	}
}

// TestDrawGuessPublicStateRevealsWordAtReveal is the actual bug fix: guessers
// were never able to see the answer at reveal time, because the word was
// stripped from every broadcast unconditionally, in every phase. Only the
// drawer (via the separate private draw_word message) ever saw it.
func TestDrawGuessPublicStateRevealsWordAtReveal(t *testing.T) {
	gameData := map[string]interface{}{
		"phase":        "reveal",
		"current_word": "elephant",
	}
	out := drawGuessPublicState(gameData)
	word, _ := out["current_word"].(string)
	if word != "elephant" {
		t.Errorf("expected the word to be revealed publicly once phase is reveal, got %q", word)
	}
}

func TestDrawGuessPublicStateRevealsWordAtEnded(t *testing.T) {
	gameData := map[string]interface{}{
		"phase":        "ended",
		"current_word": "elephant",
	}
	out := drawGuessPublicState(gameData)
	if out["current_word"] != "elephant" {
		t.Errorf("expected the word to still be visible once the game has ended, got %v", out["current_word"])
	}
}

func TestDrawGuessRevealHappensViaEndRound(t *testing.T) {
	gs := makeTestDrawGuessState(1, 3)
	gm := &GameManager{}
	if _, _, err := gm.processDrawGuessMove(gs, 1, "start_round", nil); err != nil {
		t.Fatalf("start_round: %v", err)
	}
	if _, _, err := gm.processDrawGuessMove(gs, 1, "end_round", nil); err != nil {
		t.Fatalf("end_round: %v", err)
	}
	out := drawGuessPublicState(gs.GameData)
	if _, present := out["current_word"]; !present {
		t.Error("expected the word to be publicly visible immediately after end_round moves phase to reveal")
	}
}

func TestDrawGuessRevealHappensViaAutoAdvance(t *testing.T) {
	// 1 drawer + 1 guesser: a single correct guess should auto-advance to
	// reveal (nonDrawers == 1, correctGuessers reaches 1).
	gs := makeTestDrawGuessState(1, 2)
	gm := &GameManager{}
	if _, _, err := gm.processDrawGuessMove(gs, 1, "start_round", nil); err != nil {
		t.Fatalf("start_round: %v", err)
	}
	word, _ := gs.GameData["current_word"].(string)
	if _, _, err := gm.processDrawGuessMove(gs, 2, "guess", map[string]interface{}{"text": word}); err != nil {
		t.Fatalf("guess: %v", err)
	}
	phase, _ := gs.GameData["phase"].(string)
	if phase != "reveal" {
		t.Fatalf("expected auto-advance to reveal once the only guesser got it right, got phase=%q", phase)
	}
	out := drawGuessPublicState(gs.GameData)
	if out["current_word"] != word {
		t.Errorf("expected the word visible after auto-advancing to reveal, got %v", out["current_word"])
	}
}

// ---- guess feed ----------------------------------------------------------------

func TestDrawGuessFeedRecordsWrongGuessWithRawText(t *testing.T) {
	gs := makeTestDrawGuessState(1, 2)
	gm := &GameManager{}
	if _, _, err := gm.processDrawGuessMove(gs, 1, "start_round", nil); err != nil {
		t.Fatalf("start_round: %v", err)
	}
	if _, _, err := gm.processDrawGuessMove(gs, 2, "guess", map[string]interface{}{"text": "definitely-wrong"}); err != nil {
		t.Fatalf("guess: %v", err)
	}
	feed, _ := gs.GameData["guess_feed"].([]interface{})
	if len(feed) != 1 {
		t.Fatalf("expected 1 feed entry, got %d", len(feed))
	}
	entry := feed[0].(map[string]interface{})
	if entry["text"] != "definitely-wrong" {
		t.Errorf("expected the wrong guess's raw text to be recorded, got %v", entry["text"])
	}
	if entry["correct"] != false {
		t.Errorf("expected correct=false, got %v", entry["correct"])
	}
	if entry["username"] != "bob" {
		t.Errorf("expected username 'bob', got %v", entry["username"])
	}
}

// TestDrawGuessFeedNeverLeaksWordOnCorrectGuess confirms a correct guess's
// feed entry never carries the raw guessed text — since a correct guess's
// text equals the secret word by definition, including it would broadcast
// the answer to every guesser still trying, defeating the whole round.
func TestDrawGuessFeedNeverLeaksWordOnCorrectGuess(t *testing.T) {
	gs := makeTestDrawGuessState(1, 2)
	gm := &GameManager{}
	if _, _, err := gm.processDrawGuessMove(gs, 1, "start_round", nil); err != nil {
		t.Fatalf("start_round: %v", err)
	}
	word, _ := gs.GameData["current_word"].(string)
	if _, _, err := gm.processDrawGuessMove(gs, 2, "guess", map[string]interface{}{"text": word}); err != nil {
		t.Fatalf("guess: %v", err)
	}
	feed, _ := gs.GameData["guess_feed"].([]interface{})
	if len(feed) != 1 {
		t.Fatalf("expected 1 feed entry, got %d", len(feed))
	}
	entry := feed[0].(map[string]interface{})
	if _, present := entry["text"]; present {
		t.Errorf("expected no raw text field on a correct-guess feed entry (would leak the word), got %v", entry["text"])
	}
	if entry["correct"] != true {
		t.Errorf("expected correct=true, got %v", entry["correct"])
	}
}

func TestDrawGuessFeedResetsOnNewRound(t *testing.T) {
	gs := makeTestDrawGuessState(1, 3)
	gm := &GameManager{}
	if _, _, err := gm.processDrawGuessMove(gs, 1, "start_round", nil); err != nil {
		t.Fatalf("start_round: %v", err)
	}
	if _, _, err := gm.processDrawGuessMove(gs, 2, "guess", map[string]interface{}{"text": "nope"}); err != nil {
		t.Fatalf("guess: %v", err)
	}
	feed, _ := gs.GameData["guess_feed"].([]interface{})
	if len(feed) != 1 {
		t.Fatalf("expected 1 feed entry before the next round, got %d", len(feed))
	}

	if _, _, err := gm.processDrawGuessMove(gs, 1, "end_round", nil); err != nil {
		t.Fatalf("end_round: %v", err)
	}
	if _, _, err := gm.processDrawGuessMove(gs, 1, "next_round", nil); err != nil {
		t.Fatalf("next_round: %v", err)
	}
	if _, _, err := gm.processDrawGuessMove(gs, 1, "start_round", nil); err != nil {
		t.Fatalf("second start_round: %v", err)
	}
	feed2, _ := gs.GameData["guess_feed"].([]interface{})
	if len(feed2) != 0 {
		t.Errorf("expected the guess feed to reset for the new round, got %d stale entries", len(feed2))
	}
}

func TestDrawGuessFeedCapsLength(t *testing.T) {
	gs := makeTestDrawGuessState(1, 2)
	gm := &GameManager{}
	if _, _, err := gm.processDrawGuessMove(gs, 1, "start_round", nil); err != nil {
		t.Fatalf("start_round: %v", err)
	}
	// The 2nd player is the only guesser and would normally lock out after one
	// guess via "you already guessed it" only on a CORRECT guess — wrong
	// guesses have no such lock, so repeated wrong guesses are legal and a
	// realistic way this cap gets exercised in a long game.
	for i := 0; i < drawGuessFeedMax+10; i++ {
		if _, _, err := gm.processDrawGuessMove(gs, 2, "guess", map[string]interface{}{"text": "wrong"}); err != nil {
			t.Fatalf("guess %d: %v", i, err)
		}
	}
	feed, _ := gs.GameData["guess_feed"].([]interface{})
	if len(feed) != drawGuessFeedMax {
		t.Errorf("expected the feed capped at %d entries, got %d", drawGuessFeedMax, len(feed))
	}
}

func TestDrawGuessAlreadyGuessedRejected(t *testing.T) {
	gs := makeTestDrawGuessState(1, 2)
	gm := &GameManager{}
	if _, _, err := gm.processDrawGuessMove(gs, 1, "start_round", nil); err != nil {
		t.Fatalf("start_round: %v", err)
	}
	word, _ := gs.GameData["current_word"].(string)
	if _, _, err := gm.processDrawGuessMove(gs, 2, "guess", map[string]interface{}{"text": word}); err != nil {
		t.Fatalf("first guess: %v", err)
	}
	if _, _, err := gm.processDrawGuessMove(gs, 2, "guess", map[string]interface{}{"text": word}); err == nil {
		t.Error("expected an error re-guessing after already guessing correctly")
	}
}

func TestDrawGuessDrawerCannotGuess(t *testing.T) {
	gs := makeTestDrawGuessState(1, 2)
	gm := &GameManager{}
	if _, _, err := gm.processDrawGuessMove(gs, 1, "start_round", nil); err != nil {
		t.Fatalf("start_round: %v", err)
	}
	if _, _, err := gm.processDrawGuessMove(gs, 1, "guess", map[string]interface{}{"text": "anything"}); err == nil {
		t.Error("expected an error when the drawer tries to guess")
	}
}
