package games

import (
	"testing"
	"wewatch-backend/internal/models"
)

// makeTestWordsmithState builds a deterministic state directly (bypassing the
// real random deal) so tests can control racks/board/bag exactly.
func makeTestWordsmithState(numPlayers int) *GameSessionState {
	players := make([]models.Player, numPlayers)
	for i := range players {
		players[i] = models.Player{UserID: uint(i + 1)}
	}
	gs := &GameSessionState{
		Players:     players,
		CurrentTurn: 0,
		GameData:    map[string]interface{}{},
		GameSession: &models.GameSession{GameType: "wordsmith"},
		Hands:       map[uint][]string{},
		DrawPile:    []string{},
	}
	gs.GameData["board"] = wordsmithEmptyBoard()
	gs.GameData["scores"] = map[string]interface{}{}
	gs.GameData["consecutive_passes"] = 0
	for _, p := range players {
		gs.Hands[p.UserID] = []string{}
	}
	syncWordsmithPublicState(gs)
	return gs
}

func placement(row, col int, tile string) map[string]interface{} {
	return map[string]interface{}{"row": float64(row), "col": float64(col), "tile": tile}
}

func blankPlacement(row, col int, letter string) map[string]interface{} {
	return map[string]interface{}{"row": float64(row), "col": float64(col), "tile": "?", "letter": letter}
}

func placementsData(ps ...map[string]interface{}) map[string]interface{} {
	arr := make([]interface{}, len(ps))
	for i, p := range ps {
		arr[i] = p
	}
	return map[string]interface{}{"placements": arr}
}

// TestWordsmithFirstMoveMustCoverCenter: the very first placement of the
// game is rejected if it doesn't cover the center star square.
func TestWordsmithFirstMoveMustCoverCenter(t *testing.T) {
	gs := makeTestWordsmithState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"C", "A", "T"}

	// CAT at row 3, nowhere near the center (7,7).
	_, _, err := gm.processWordsmithPlace(gs, 1, placementsData(
		placement(3, 3, "C"), placement(3, 4, "A"), placement(3, 5, "T"),
	))
	if err == nil {
		t.Fatal("expected error: first move must cover center")
	}
}

// TestWordsmithFirstMoveScoresWithCenterDoubleWord: placing "CAT" through the
// center on the first move scores correctly — C(3)+A(1)+T(1)=5, doubled by
// the center's DW premium (only the center cell is newly-covered-premium;
// C and T sit on plain squares) = 10.
func TestWordsmithFirstMoveScoresWithCenterDoubleWord(t *testing.T) {
	gs := makeTestWordsmithState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"C", "A", "T", "Z", "Z", "Z", "Z"}

	gameOver, _, err := gm.processWordsmithPlace(gs, 1, placementsData(
		placement(7, 6, "C"), placement(7, 7, "A"), placement(7, 8, "T"),
	))
	if err != nil {
		t.Fatalf("place CAT: %v", err)
	}
	if gameOver {
		t.Fatal("game should not be over")
	}

	scores := wordsmithScores(gs)
	if got := wordsmithFloatField(scores, "1"); got != 10 {
		t.Errorf("expected score 10 (CAT=5, center DW doubles it), got %v", got)
	}
	if gs.GameData["last_word"] != "CAT" {
		t.Errorf("expected last_word CAT, got %v", gs.GameData["last_word"])
	}
	board := wordsmithBoard(gs)
	if wordsmithCellLetter(board, 7, 7) != "A" {
		t.Errorf("expected A at center, got %q", wordsmithCellLetter(board, 7, 7))
	}
	if len(gs.Hands[1]) != 4 { // 7 - 3 played, no bag to refill from in this test
		t.Errorf("expected 4 tiles left in rack, got %d", len(gs.Hands[1]))
	}
}

// TestWordsmithSecondMoveMustConnect: a placement that doesn't touch or
// extend any existing tile is rejected once the board is no longer empty.
func TestWordsmithSecondMoveMustConnect(t *testing.T) {
	gs := makeTestWordsmithState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"C", "A", "T"}
	gs.Hands[2] = []string{"D", "O", "G"}

	if _, _, err := gm.processWordsmithPlace(gs, 1, placementsData(
		placement(7, 6, "C"), placement(7, 7, "A"), placement(7, 8, "T"),
	)); err != nil {
		t.Fatalf("place CAT: %v", err)
	}

	// DOG placed far away, touching nothing.
	_, _, err := gm.processWordsmithPlace(gs, 2, placementsData(
		placement(0, 0, "D"), placement(0, 1, "O"), placement(0, 2, "G"),
	))
	if err == nil {
		t.Fatal("expected error: disconnected placement should be rejected")
	}
}

// TestWordsmithCrossWordFormedAndScored: building off an existing word
// vertically forms a new word with the perpendicular neighbor, and that
// cross word must itself be a valid dictionary word and gets scored too.
func TestWordsmithCrossWordFormedAndScored(t *testing.T) {
	gs := makeTestWordsmithState(2)
	gm := &GameManager{}
	// Both racks padded with unused tiles so playing 3 (resp. 1) of them
	// doesn't also empty a rack against the empty bag and end the game
	// early — this test is specifically about cross-word formation/scoring,
	// not the empty-rack end condition (covered separately below).
	gs.Hands[1] = []string{"C", "A", "T", "Z", "Z"}
	gs.Hands[2] = []string{"S", "Z", "Z"}

	if _, _, err := gm.processWordsmithPlace(gs, 1, placementsData(
		placement(7, 6, "C"), placement(7, 7, "A"), placement(7, 8, "T"),
	)); err != nil {
		t.Fatalf("place CAT: %v", err)
	}

	// "S" below the "A" at (7,7) forms "AS" vertically (a real word) —
	// connects via extending the vertical run upward into the existing A.
	gameOver, _, err := gm.processWordsmithPlace(gs, 2, placementsData(
		placement(8, 7, "S"),
	))
	if err != nil {
		t.Fatalf("place S under A (forms AS): %v", err)
	}
	if gameOver {
		t.Fatal("game should not be over")
	}

	scores := wordsmithScores(gs)
	// A is not newly placed this turn (no premium re-applied), S sits on a
	// plain square (row 8 col 7 = '.') — 1(A) + 1(S) = 2, no word premium.
	if got := wordsmithFloatField(scores, "2"); got != 2 {
		t.Errorf("expected player 2 score 2 for AS, got %v", got)
	}
	board := wordsmithBoard(gs)
	if wordsmithCellLetter(board, 8, 7) != "S" {
		t.Errorf("expected S at (8,7), got %q", wordsmithCellLetter(board, 8, 7))
	}
}

// TestWordsmithInvalidWordRejected: a placement spelling something not in
// the dictionary is rejected and the board/rack are left unchanged.
func TestWordsmithInvalidWordRejected(t *testing.T) {
	gs := makeTestWordsmithState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"Q", "Z", "X"}

	_, _, err := gm.processWordsmithPlace(gs, 1, placementsData(
		placement(7, 6, "Q"), placement(7, 7, "Z"), placement(7, 8, "X"),
	))
	if err == nil {
		t.Fatal("expected error: QZX is not a real word")
	}
	if len(gs.Hands[1]) != 3 {
		t.Errorf("rack should be untouched after a rejected move, got %d tiles", len(gs.Hands[1]))
	}
	board := wordsmithBoard(gs)
	if !wordsmithCellEmpty(board, 7, 7) {
		t.Error("board should be untouched after a rejected move")
	}
}

// TestWordsmithGapRejected: placing tiles with a genuine empty gap between
// them (not bridged by an existing tile) is rejected.
func TestWordsmithGapRejected(t *testing.T) {
	gs := makeTestWordsmithState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"C", "T"}

	// C at col6, T at col8, nothing at col7 — a real gap on the first move.
	_, _, err := gm.processWordsmithPlace(gs, 1, placementsData(
		placement(7, 6, "C"), placement(7, 8, "T"),
	))
	if err == nil {
		t.Fatal("expected error: gap between placed tiles")
	}
}

// TestWordsmithRackValidation: a placement referencing a tile the player
// doesn't hold is rejected.
func TestWordsmithRackValidation(t *testing.T) {
	gs := makeTestWordsmithState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"C", "A"} // no T

	_, _, err := gm.processWordsmithPlace(gs, 1, placementsData(
		placement(7, 6, "C"), placement(7, 7, "A"), placement(7, 8, "T"),
	))
	if err == nil {
		t.Fatal("expected error: T is not in the rack")
	}
}

// TestWordsmithCannotReuseSameRackTileTwice: two placements both claiming
// the rack's only copy of a tile must be rejected, not silently duplicated.
func TestWordsmithCannotReuseSameRackTileTwice(t *testing.T) {
	gs := makeTestWordsmithState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"A", "T"} // only one A

	_, _, err := gm.processWordsmithPlace(gs, 1, placementsData(
		placement(7, 6, "A"), placement(7, 7, "A"), placement(7, 8, "T"),
	))
	if err == nil {
		t.Fatal("expected error: only one A is held, can't place two")
	}
}

// TestWordsmithBlankTileScoresZero: a blank tile assigned a letter renders
// on the board as that letter but always contributes 0 to the score,
// regardless of the letter's normal point value.
func TestWordsmithBlankTileScoresZero(t *testing.T) {
	gs := makeTestWordsmithState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"?", "A", "T"} // blank standing in for C

	_, _, err := gm.processWordsmithPlace(gs, 1, placementsData(
		blankPlacement(7, 6, "C"), placement(7, 7, "A"), placement(7, 8, "T"),
	))
	if err != nil {
		t.Fatalf("place blank-C-A-T: %v", err)
	}

	board := wordsmithBoard(gs)
	if wordsmithCellLetter(board, 7, 6) != "c" {
		t.Errorf("expected lowercase 'c' (blank) on the board, got %q", wordsmithCellLetter(board, 7, 6))
	}
	scores := wordsmithScores(gs)
	// blank(0) + A(1) + T(1) = 2, doubled by center DW = 4 (not 10, since a
	// real C would have been worth 3).
	if got := wordsmithFloatField(scores, "1"); got != 4 {
		t.Errorf("expected score 4 (blank scores 0, not C's normal 3), got %v", got)
	}
}

// TestWordsmithBingoBonus: using all 7 rack tiles in a single placement adds
// the 50-point bonus on top of the word's own score.
func TestWordsmithBingoBonus(t *testing.T) {
	gs := makeTestWordsmithState(2)
	gm := &GameManager{}
	// "STARING" — 7 letters, a real word, placed through the center.
	gs.Hands[1] = []string{"S", "T", "A", "R", "I", "N", "G"}

	_, _, err := gm.processWordsmithPlace(gs, 1, placementsData(
		placement(7, 4, "S"), placement(7, 5, "T"), placement(7, 6, "A"),
		placement(7, 7, "R"), placement(7, 8, "I"), placement(7, 9, "N"), placement(7, 10, "G"),
	))
	if err != nil {
		t.Fatalf("place STARING (bingo): %v", err)
	}

	scores := wordsmithScores(gs)
	// S1+T1+A1+R1+I1+N1+G2=8, center (col7=R) is DW -> 16, +50 bingo = 66.
	if got := wordsmithFloatField(scores, "1"); got != 66 {
		t.Errorf("expected score 66 (16 for STARING + 50 bingo), got %v", got)
	}
}

// TestWordsmithExchange: exchanging tiles swaps them for new ones from the
// bag, returns the exchanged tiles to the bag, and counts as a scoreless
// turn (increments consecutive_passes).
func TestWordsmithExchange(t *testing.T) {
	gs := makeTestWordsmithState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"Q", "Z", "X"}
	gs.DrawPile = []string{"A", "B", "C", "D", "E"}

	_, _, err := gm.processWordsmithExchange(gs, 1, map[string]interface{}{
		"tiles": []interface{}{"Q", "Z"},
	})
	if err != nil {
		t.Fatalf("exchange: %v", err)
	}
	if len(gs.Hands[1]) != 3 {
		t.Errorf("rack should still have 3 tiles after exchanging 2-for-2, got %d", len(gs.Hands[1]))
	}
	if len(gs.DrawPile) != 5 {
		t.Errorf("bag should still have 5 tiles total (2 drawn out, 2 returned), got %d", len(gs.DrawPile))
	}
	if wordsmithIntField(gs.GameData, "consecutive_passes") != 1 {
		t.Errorf("expected consecutive_passes=1 after an exchange, got %v", gs.GameData["consecutive_passes"])
	}
	// The exchanged Q and Z must have gone back into the bag somewhere.
	foundQ, foundZ := false, false
	for _, tile := range gs.DrawPile {
		if tile == "Q" {
			foundQ = true
		}
		if tile == "Z" {
			foundZ = true
		}
	}
	if !foundQ || !foundZ {
		t.Error("exchanged tiles Q and Z should be back in the bag")
	}
}

// TestWordsmithExchangeRejectedWithInsufficientBag: can't exchange more
// tiles than the bag currently holds.
func TestWordsmithExchangeRejectedWithInsufficientBag(t *testing.T) {
	gs := makeTestWordsmithState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"Q", "Z", "X"}
	gs.DrawPile = []string{"A"} // only 1 tile in the bag

	_, _, err := gm.processWordsmithExchange(gs, 1, map[string]interface{}{
		"tiles": []interface{}{"Q", "Z"},
	})
	if err == nil {
		t.Fatal("expected error: bag doesn't have enough tiles for a 2-tile exchange")
	}
}

// TestWordsmithConsecutivePassesEndGame: once every player has passed twice
// in a row, the game ends and the highest score wins — no rack-value
// adjustment (nobody emptied their rack).
func TestWordsmithConsecutivePassesEndGame(t *testing.T) {
	gs := makeTestWordsmithState(2)
	gm := &GameManager{}
	gs.GameData["scores"] = map[string]interface{}{"1": 30.0, "2": 10.0}

	for i := 0; i < 3; i++ {
		gameOver, _, err := gm.processWordsmithPass(gs, 1)
		if err != nil {
			t.Fatalf("pass %d: %v", i, err)
		}
		if gameOver {
			t.Fatalf("game ended too early after %d passes", i+1)
		}
		gameOver2, winnerID, err2 := gm.processWordsmithPass(gs, 2)
		if err2 != nil {
			t.Fatalf("pass %d (p2): %v", i, err2)
		}
		if i < 1 {
			if gameOver2 {
				t.Fatalf("game ended too early after round %d", i+1)
			}
		} else {
			if !gameOver2 {
				t.Fatal("expected game to end after 2 full rounds of passes")
			}
			if winnerID == nil || *winnerID != 1 {
				t.Errorf("expected player 1 (higher score) to win, got %v", winnerID)
			}
			return
		}
	}
}

// TestWordsmithEmptyRackEndsGameWithScoreAdjustment: a player who empties
// their rack while the bag is empty ends the game immediately, gets credited
// the sum of every other player's remaining rack value, and those players
// are docked that same amount.
func TestWordsmithEmptyRackEndsGameWithScoreAdjustment(t *testing.T) {
	gs := makeTestWordsmithState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"C", "A", "T"} // will play all 3, emptying the rack
	gs.Hands[2] = []string{"Q", "Z"}      // Q=10, Z=10 -> 20 left over
	gs.DrawPile = []string{}              // empty bag — no refill possible
	gs.GameData["scores"] = map[string]interface{}{"1": 0.0, "2": 0.0}

	gameOver, winnerID, err := gm.processWordsmithPlace(gs, 1, placementsData(
		placement(7, 6, "C"), placement(7, 7, "A"), placement(7, 8, "T"),
	))
	if err != nil {
		t.Fatalf("place CAT: %v", err)
	}
	if !gameOver {
		t.Fatal("expected game to end — player 1's rack is now empty with an empty bag")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Errorf("expected player 1 to win (10 base + 20 rack-adjustment bonus), got %v", winnerID)
	}

	scores := wordsmithScores(gs)
	// Player 1: CAT=5, doubled by center DW = 10, +20 (player 2's docked rack value) = 30.
	if got := wordsmithFloatField(scores, "1"); got != 30 {
		t.Errorf("expected player 1 final score 30, got %v", got)
	}
	// Player 2: 0 - 20 (their own unplayed Q+Z) = -20.
	if got := wordsmithFloatField(scores, "2"); got != -20 {
		t.Errorf("expected player 2 final score -20, got %v", got)
	}
}

// TestWordsmithDictionaryLoaded: sanity check that the embedded word list
// actually loaded and contains common words but rejects gibberish.
func TestWordsmithDictionaryLoaded(t *testing.T) {
	if len(wordsmithDictionary) < 100000 {
		t.Fatalf("expected the ENABLE word list to have 100k+ entries, got %d — embed likely failed", len(wordsmithDictionary))
	}
	for _, w := range []string{"CAT", "DOG", "SCRABBLE", "WORDSMITH", "QUIZ", "ZEBRA"} {
		if !wordsmithIsValidWord(w) {
			t.Errorf("expected %q to be a valid word", w)
		}
	}
	for _, w := range []string{"ZZQX", "QQQQ", ""} {
		if wordsmithIsValidWord(w) {
			t.Errorf("expected %q to NOT be a valid word", w)
		}
	}
}

// TestWordsmithSingleTileOrientationInference: a single-tile placement with
// no explicit axis correctly infers orientation from adjacent board tiles
// and forms the right cross word.
func TestWordsmithSingleTileOrientationInference(t *testing.T) {
	gs := makeTestWordsmithState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"C", "A", "T", "Z", "Z"}
	gs.Hands[2] = []string{"S", "Z", "Z"}

	if _, _, err := gm.processWordsmithPlace(gs, 1, placementsData(
		placement(7, 6, "C"), placement(7, 7, "A"), placement(7, 8, "T"),
	)); err != nil {
		t.Fatalf("place CAT: %v", err)
	}

	// A single "S" placed right after the T (7,9) — horizontal neighbor only
	// (nothing above/below) — should infer horizontal and extend "CAT" to "CATS".
	_, _, err := gm.processWordsmithPlace(gs, 2, placementsData(placement(7, 9, "S")))
	if err != nil {
		t.Fatalf("place S after CAT (forms CATS): %v", err)
	}
	if gs.GameData["last_word"] != "CATS" {
		// last_word only reflects the main word if it has >=2 cells, which it does here.
		t.Errorf("expected CATS to be recognized as the extended word, got %v", gs.GameData["last_word"])
	}
}
