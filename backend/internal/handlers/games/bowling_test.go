package games

import (
	"testing"
	"wewatch-backend/internal/models"
)

func makeTestBowlingState(numPlayers int) *GameSessionState {
	players := make([]models.Player, numPlayers)
	for i := range players {
		players[i] = models.Player{UserID: uint(i + 1)}
	}
	return &GameSessionState{
		Players:     players,
		CurrentTurn: 0,
		GameData:    map[string]interface{}{},
		GameSession: &models.GameSession{GameType: "bowling"},
	}
}

// TestBowlingPerfectGame300 — the single most well-known real bowling fact:
// 12 consecutive strikes scores exactly 300.
func TestBowlingPerfectGame300(t *testing.T) {
	s := newBowlingScores()
	for i := 0; i < 12; i++ {
		if err := s.AddThrowResult(10); err != nil {
			t.Fatalf("strike %d rejected: %v", i+1, err)
		}
	}
	if !s.GameOver {
		t.Fatal("expected game over after 12 strikes")
	}
	if s.Score != 300 {
		t.Fatalf("expected a perfect game to score 300, got %d", s.Score)
	}
}

// TestBowlingAllGutterZero — 20 throws of 0 pins scores 0.
func TestBowlingAllGutterZero(t *testing.T) {
	s := newBowlingScores()
	for i := 0; i < 20; i++ {
		if err := s.AddThrowResult(0); err != nil {
			t.Fatalf("gutter throw %d rejected: %v", i+1, err)
		}
	}
	if !s.GameOver {
		t.Fatal("expected game over after 20 throws")
	}
	if s.Score != 0 {
		t.Fatalf("expected an all-gutter game to score 0, got %d", s.Score)
	}
}

// TestBowlingAllSpares150 — a well-known real bowling fact: 5+5 spares every
// frame, with a final 5 bonus throw, scores exactly 150 (each frame scores
// 10 + the next frame's first throw of 5 = 15, x10 frames).
func TestBowlingAllSpares150(t *testing.T) {
	s := newBowlingScores()
	for frame := 0; frame < 9; frame++ {
		if err := s.AddThrowResult(5); err != nil {
			t.Fatalf("frame %d throw 1 rejected: %v", frame+1, err)
		}
		if err := s.AddThrowResult(5); err != nil {
			t.Fatalf("frame %d throw 2 (spare) rejected: %v", frame+1, err)
		}
	}
	// 10th frame: 5, 5 (spare), bonus 5.
	if err := s.AddThrowResult(5); err != nil {
		t.Fatalf("10th frame throw 1 rejected: %v", err)
	}
	if err := s.AddThrowResult(5); err != nil {
		t.Fatalf("10th frame throw 2 (spare) rejected: %v", err)
	}
	if s.GameOver {
		t.Fatal("game should not be over yet — a spare in the 10th frame earns a bonus throw")
	}
	if err := s.AddThrowResult(5); err != nil {
		t.Fatalf("10th frame bonus throw rejected: %v", err)
	}
	if !s.GameOver {
		t.Fatal("expected game over after the 10th frame's bonus throw")
	}
	if s.Score != 150 {
		t.Fatalf("expected all-spares-with-5-bonus to score 150, got %d", s.Score)
	}
}

// TestBowlingOpenFramesSimpleSum — no strikes/spares at all: the total is
// just the sum of every throw (no bonus carry-forward applies).
func TestBowlingOpenFramesSimpleSum(t *testing.T) {
	s := newBowlingScores()
	total := 0
	for frame := 0; frame < 10; frame++ {
		a, b := 3, 4
		total += a + b
		if err := s.AddThrowResult(a); err != nil {
			t.Fatalf("frame %d throw 1 rejected: %v", frame+1, err)
		}
		if err := s.AddThrowResult(b); err != nil {
			t.Fatalf("frame %d throw 2 rejected: %v", frame+1, err)
		}
	}
	if !s.GameOver {
		t.Fatal("expected game over after 10 open frames")
	}
	if s.Score != total {
		t.Fatalf("expected score %d, got %d", total, s.Score)
	}
}

// TestBowlingSingleStrikeThenOpenFrames — a strike in frame 1 followed by
// non-strike/spare throws: frame 1 = 10 + next throw's 3 + 4 = 17 (strike
// bonus is the NEXT TWO BALLS, i.e. the next frame's two throws). Verified
// by hand against real bowling scoring rules, not assumed.
func TestBowlingSingleStrikeThenOpenFrames(t *testing.T) {
	s := newBowlingScores()
	if err := s.AddThrowResult(10); err != nil { // frame 1: strike
		t.Fatalf("strike rejected: %v", err)
	}
	if err := s.AddThrowResult(3); err != nil { // frame 2 throw 1
		t.Fatalf("frame 2 throw 1 rejected: %v", err)
	}
	if err := s.AddThrowResult(4); err != nil { // frame 2 throw 2
		t.Fatalf("frame 2 throw 2 rejected: %v", err)
	}
	// Frame 1 should now be resolved: 10 + 3 + 4 = 17.
	if s.FrameResults[0] != 17 {
		t.Fatalf("expected frame 1 to resolve to a running total of 17, got %d", s.FrameResults[0])
	}
	// Frame 2 (open, 3+4=7) should resolve immediately to 17+7=24.
	if s.FrameResults[1] != 24 {
		t.Fatalf("expected frame 2 to resolve to a running total of 24, got %d", s.FrameResults[1])
	}
}

func TestBowlingRejectsOutOfRangePins(t *testing.T) {
	s := newBowlingScores()
	if err := s.AddThrowResult(11); err == nil {
		t.Fatal("expected an error for 11 pins (impossible — only 10 exist)")
	}
	if err := s.AddThrowResult(-1); err == nil {
		t.Fatal("expected an error for a negative pin count")
	}
}

func TestBowlingRejectsMorePinsThanStanding(t *testing.T) {
	s := newBowlingScores()
	if err := s.AddThrowResult(6); err != nil { // 6 down, 4 standing
		t.Fatalf("unexpected error: %v", err)
	}
	if err := s.AddThrowResult(5); err == nil {
		t.Fatal("expected an error reporting 5 pins down when only 4 were standing")
	}
	// The genuinely legal 4 should still be accepted.
	if err := s.AddThrowResult(4); err != nil {
		t.Fatalf("expected the legitimate remaining 4 pins to be accepted, got: %v", err)
	}
}

func TestBowlingRejectsThrowAfterGameOver(t *testing.T) {
	s := newBowlingScores()
	for i := 0; i < 20; i++ {
		s.AddThrowResult(0)
	}
	if err := s.AddThrowResult(0); err == nil {
		t.Fatal("expected an error throwing after the game is already over")
	}
}

// TestBowlingTenthFrameStrikeThenStrikeThenPins — a real, slightly gnarlier
// 10th-frame scenario: strike, strike, then 5 — confirms the fresh-rack
// pins-standing bookkeeping (throw 2 gets a fresh 10 after throw 1's
// strike, throw 3 gets ANOTHER fresh 10 after throw 2 also strikes).
func TestBowlingTenthFrameStrikeThenStrikeThenPins(t *testing.T) {
	s := newBowlingScores()
	for i := 0; i < 9; i++ {
		s.AddThrowResult(0)
		s.AddThrowResult(0)
	}
	if err := s.AddThrowResult(10); err != nil { // 10th frame throw 1: strike
		t.Fatalf("throw 1 rejected: %v", err)
	}
	if s.PinsStanding != 10 {
		t.Fatalf("expected a fresh rack (10 standing) after a 10th-frame strike, got %d", s.PinsStanding)
	}
	if err := s.AddThrowResult(10); err != nil { // throw 2: another strike
		t.Fatalf("throw 2 rejected: %v", err)
	}
	if s.PinsStanding != 10 {
		t.Fatalf("expected another fresh rack after a second consecutive strike, got %d", s.PinsStanding)
	}
	if err := s.AddThrowResult(5); err != nil { // throw 3: bonus throw
		t.Fatalf("throw 3 rejected: %v", err)
	}
	if !s.GameOver {
		t.Fatal("expected game over after the 10th frame's 3rd throw")
	}
	// All 9 prior frames are 0; 10th frame = 10+10+5 = 25.
	if s.Score != 25 {
		t.Fatalf("expected total score 25, got %d", s.Score)
	}
}

// ── GameManager integration tests ──────────────────────────────────────

func TestBowlingMultipleThrowsInAFrameStayOnSamePlayer(t *testing.T) {
	gs := makeTestBowlingState(2)
	gm := &GameManager{}

	// Bowling is self-managed (game_manager.go's selfManagedTurn) —
	// processBowlingMove is the sole owner of CurrentTurn, no generic "+1
	// mod N" advance runs for this game type, so tests must never manually
	// mutate CurrentTurn themselves.
	before := gs.CurrentTurn
	if _, _, err := gm.processBowlingMove(gs, 1, "throw", map[string]interface{}{"pins_down": 3.0}); err != nil {
		t.Fatalf("throw 1 failed: %v", err)
	}
	if gs.CurrentTurn != before {
		t.Fatalf("turn should stay on player 1 after a non-strike first throw, got CurrentTurn=%d", gs.CurrentTurn)
	}
}

func TestBowlingStrikeAdvancesTurnImmediately(t *testing.T) {
	gs := makeTestBowlingState(2)
	gm := &GameManager{}

	if _, _, err := gm.processBowlingMove(gs, 1, "throw", map[string]interface{}{"pins_down": 10.0}); err != nil {
		t.Fatalf("strike throw failed: %v", err)
	}
	if gs.CurrentTurn != 1 {
		t.Fatalf("expected the turn to pass to player 2 after a strike, got CurrentTurn=%d", gs.CurrentTurn)
	}
}

func TestBowlingOutOfTurnPinCountRejected(t *testing.T) {
	gs := makeTestBowlingState(2)
	gm := &GameManager{}
	// player 2's hand is empty this frame (never rolled) — reporting more
	// pins than stand (10) should still be rejected the same way as any
	// other invalid report.
	if _, _, err := gm.processBowlingMove(gs, 2, "throw", map[string]interface{}{"pins_down": 11.0}); err == nil {
		t.Fatal("expected an error for an impossible pin count")
	}
}

// TestBowlingGameEndsOnlyOnceEveryPlayerFinishes drives the game the same
// way a real client would — always acting as whichever player CurrentTurn
// actually points to (bowlingAdvanceToNextActivePlayer owns that entirely
// for this self-managed-turn game type) — rather than assuming any fixed
// alternation pattern. Player 1 bowls all gutters (finishes fast, scores 0)
// while player 2 bowls a perfect game (300); real bowling with multiple
// players finishes players at very different real-turn counts depending on
// strikes, which is exactly the scenario bowlingAdvanceToNextActivePlayer's
// skip-already-finished-players logic exists for.
func TestBowlingGameEndsOnlyOnceEveryPlayerFinishes(t *testing.T) {
	gs := makeTestBowlingState(2)
	gm := &GameManager{}

	pinsFor := func(playerID uint) float64 {
		if playerID == 1 {
			return 0.0
		}
		return 10.0
	}

	// Real production code never calls bowlingScoresFor before at least one
	// move has run ensureBowlingState (every call site is inside
	// processBowlingMove, which always calls it first) — seed it explicitly
	// here since this test wants to inspect state before the first move.
	ensureBowlingState(gs)

	var over bool
	var winner *uint
	iterations := 0
	for !over {
		iterations++
		if iterations > 60 { // 20 (player 1) + 12 (player 2) is the real max; this is a generous safety net
			t.Fatal("game never ended — possible infinite loop in turn advancement")
		}
		actingPlayer := gs.Players[gs.CurrentTurn].UserID
		scores1Before, err := bowlingScoresFor(gs, 1)
		if err != nil {
			t.Fatalf("bowlingScoresFor(1) failed: %v", err)
		}
		if actingPlayer == 1 && scores1Before.GameOver {
			t.Fatal("turn incorrectly returned to player 1 after they already finished all 10 frames")
		}
		over, winner, err = gm.processBowlingMove(gs, actingPlayer, "throw", map[string]interface{}{"pins_down": pinsFor(actingPlayer)})
		if err != nil {
			t.Fatalf("player %d throw failed: %v", actingPlayer, err)
		}
	}

	scores1, _ := bowlingScoresFor(gs, 1)
	scores2, _ := bowlingScoresFor(gs, 2)
	if !scores1.GameOver || !scores2.GameOver {
		t.Fatalf("expected both players to have completed all 10 frames, got done1=%v done2=%v", scores1.GameOver, scores2.GameOver)
	}
	if winner == nil || *winner != 2 {
		t.Fatalf("expected player 2 (perfect game, 300 vs 0) to win, got %v", winner)
	}
}

func TestBowlingTiedTotalIsADraw(t *testing.T) {
	gs := makeTestBowlingState(2)
	gm := &GameManager{}

	var over bool
	iterations := 0
	for !over {
		iterations++
		if iterations > 50 {
			t.Fatal("game never ended — possible infinite loop in turn advancement")
		}
		actingPlayer := gs.Players[gs.CurrentTurn].UserID
		var err error
		over, _, err = gm.processBowlingMove(gs, actingPlayer, "throw", map[string]interface{}{"pins_down": 4.0})
		if err != nil {
			t.Fatalf("player %d throw failed: %v", actingPlayer, err)
		}
	}

	scores1, _ := bowlingScoresFor(gs, 1)
	scores2, _ := bowlingScoresFor(gs, 2)
	if scores1.Score != scores2.Score {
		t.Fatalf("expected tied scores (both players threw identically), got %d vs %d", scores1.Score, scores2.Score)
	}

	winner := bowlingWinnerByScore(gs)
	if winner != nil {
		t.Fatalf("expected a draw (nil winner) on a tied score, got %v", *winner)
	}
}
