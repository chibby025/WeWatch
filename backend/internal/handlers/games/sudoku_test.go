package games

import (
	"testing"
	"wewatch-backend/internal/models"
)

func makeTestSudokuState(numPlayers int) *GameSessionState {
	players := make([]models.Player, numPlayers)
	for i := range players {
		players[i] = models.Player{UserID: uint(i + 1)}
	}
	return &GameSessionState{
		Players:     players,
		CurrentTurn: 0,
		GameData:    map[string]interface{}{},
		GameSession: &models.GameSession{GameType: "sudoku"},
	}
}

func sudokuAsIntSlice(t *testing.T, raw interface{}) []int {
	t.Helper()
	arr, ok := raw.([]interface{})
	if !ok {
		t.Fatalf("expected a []interface{}, got %T", raw)
	}
	out := make([]int, len(arr))
	for i, v := range arr {
		out[i] = sudokuInt(v)
	}
	return out
}

// TestEnsureSudokuStateSeedsRealPuzzle is the regression test for the actual
// "doesn't show" bug: previously the puzzle was only ever generated lazily
// inside processSudokuMove, which never runs before a player submits — but a
// player can't submit anything without first seeing a real puzzle. StartGame
// never called this before the fix, so every client's first broadcast showed
// an empty game_state and thus a puzzle with zero given digits.
func TestEnsureSudokuStateSeedsRealPuzzle(t *testing.T) {
	gs := makeTestSudokuState(2)
	ensureSudokuState(gs)

	phase, _ := gs.GameData["phase"].(string)
	if phase != "playing" {
		t.Fatalf("expected phase=playing immediately after seeding, got %q", phase)
	}

	puzzle, ok := gs.GameData["puzzle"].([]interface{})
	if !ok || len(puzzle) != 81 {
		t.Fatalf("expected an 81-cell puzzle to be seeded, got %v", gs.GameData["puzzle"])
	}
	givenCount := 0
	for _, v := range puzzle {
		if sudokuInt(v) != 0 {
			givenCount++
		}
	}
	if givenCount == 0 {
		t.Error("expected at least some given (non-zero) cells in the seeded puzzle — got a fully blank grid")
	}

	solution, ok := gs.GameData["solution"].([]interface{})
	if !ok || len(solution) != 81 {
		t.Fatalf("expected an 81-cell solution to be seeded, got %v", gs.GameData["solution"])
	}
	for i, v := range solution {
		n := sudokuInt(v)
		if n < 1 || n > 9 {
			t.Fatalf("solution[%d] = %d, expected a real digit 1-9 (regression check for the old copy-paste bug that could leave puzzle values in the solution slice)", i, n)
		}
	}
}

// TestSudokuPuzzleGivensMatchSolution confirms every given (pre-filled) cell
// in the puzzle is actually consistent with the stored solution — otherwise
// the puzzle would be unsolvable as displayed.
func TestSudokuPuzzleGivensMatchSolution(t *testing.T) {
	gs := makeTestSudokuState(2)
	ensureSudokuState(gs)
	puzzle := sudokuAsIntSlice(t, gs.GameData["puzzle"])
	solution := sudokuAsIntSlice(t, gs.GameData["solution"])
	for i := range puzzle {
		if puzzle[i] != 0 && puzzle[i] != solution[i] {
			t.Fatalf("cell %d: given value %d doesn't match solution value %d", i, puzzle[i], solution[i])
		}
	}
}

// ---- solution stripping (leak prevention) ---------------------------------

func TestSudokuPublicStateStripsSolutionDuringPlaying(t *testing.T) {
	gs := makeTestSudokuState(2)
	ensureSudokuState(gs)
	out := sudokuPublicState(gs.GameData)
	if _, present := out["solution"]; present {
		t.Error("expected the solution to be stripped from the public state while phase is playing")
	}
	if _, present := out["puzzle"]; !present {
		t.Error("expected the puzzle itself to remain visible")
	}
}

// TestSudokuPublicStateRevealsSolutionOnceEnded confirms the reveal actually
// works once someone wins — this is the deliberate exception, not a leak.
func TestSudokuPublicStateRevealsSolutionOnceEnded(t *testing.T) {
	gs := makeTestSudokuState(2)
	ensureSudokuState(gs)
	gs.GameData["phase"] = "ended"
	out := sudokuPublicState(gs.GameData)
	if _, present := out["solution"]; !present {
		t.Error("expected the solution to be visible once the game has ended (the reveal)")
	}
}

// ---- move processing --------------------------------------------------------

func TestSudokuCorrectSubmissionEndsGame(t *testing.T) {
	gs := makeTestSudokuState(2)
	gm := &GameManager{}
	ensureSudokuState(gs)
	solution := sudokuAsIntSlice(t, gs.GameData["solution"])

	gridIF := make([]interface{}, 81)
	for i, v := range solution {
		gridIF[i] = float64(v)
	}
	gameOver, winnerID, err := gm.processSudokuMove(gs, 1, map[string]interface{}{"grid": gridIF})
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	if !gameOver {
		t.Fatal("expected a fully correct submission to end the game")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Errorf("expected player 1 to win, got %v", winnerID)
	}
	phase, _ := gs.GameData["phase"].(string)
	if phase != "ended" {
		t.Errorf("expected phase=ended, got %q", phase)
	}
	submissions := gs.GameData["submissions"].(map[string]interface{})
	if submissions["1"] != "correct" {
		t.Errorf("expected submissions[1]=correct, got %v", submissions["1"])
	}
}

func TestSudokuIncorrectSubmissionContinuesGame(t *testing.T) {
	gs := makeTestSudokuState(2)
	gm := &GameManager{}
	ensureSudokuState(gs)

	gridIF := make([]interface{}, 81) // all zeros — definitely wrong
	for i := range gridIF {
		gridIF[i] = float64(0)
	}
	gameOver, winnerID, err := gm.processSudokuMove(gs, 1, map[string]interface{}{"grid": gridIF})
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	if gameOver {
		t.Fatal("expected an incorrect submission to NOT end the game")
	}
	if winnerID != nil {
		t.Errorf("expected no winner yet, got %v", winnerID)
	}
	phase, _ := gs.GameData["phase"].(string)
	if phase != "playing" {
		t.Errorf("expected phase to remain playing, got %q", phase)
	}
	submissions := gs.GameData["submissions"].(map[string]interface{})
	if submissions["1"] != "incorrect" {
		t.Errorf("expected submissions[1]=incorrect, got %v", submissions["1"])
	}
}

// TestSudokuCurrentTurnUntouched pins down the cleanup of the dead
// CurrentTurn rotation that processSudokuMove used to do on every
// submission — sudoku is a simultaneous game (no turn enforcement), so that
// code had no functional effect and was just confusing leftover boilerplate.
func TestSudokuCurrentTurnUntouched(t *testing.T) {
	gs := makeTestSudokuState(3)
	gs.CurrentTurn = 1
	gm := &GameManager{}
	ensureSudokuState(gs)

	gridIF := make([]interface{}, 81)
	for i := range gridIF {
		gridIF[i] = float64(0)
	}
	if _, _, err := gm.processSudokuMove(gs, 2, map[string]interface{}{"grid": gridIF}); err != nil {
		t.Fatalf("submit: %v", err)
	}
	if gs.CurrentTurn != 1 {
		t.Errorf("expected CurrentTurn to stay untouched at 1, got %d", gs.CurrentTurn)
	}
}

func TestSudokuRejectsMissingGrid(t *testing.T) {
	gs := makeTestSudokuState(2)
	gm := &GameManager{}
	ensureSudokuState(gs)
	if _, _, err := gm.processSudokuMove(gs, 1, map[string]interface{}{}); err == nil {
		t.Error("expected an error for a submission missing the grid")
	}
}

func TestSudokuRejectsWrongLengthGrid(t *testing.T) {
	gs := makeTestSudokuState(2)
	gm := &GameManager{}
	ensureSudokuState(gs)
	shortGrid := make([]interface{}, 10)
	if _, _, err := gm.processSudokuMove(gs, 1, map[string]interface{}{"grid": shortGrid}); err == nil {
		t.Error("expected an error for a grid that isn't 81 cells")
	}
}

func TestSudokuRejectsSubmissionAfterGameEnded(t *testing.T) {
	gs := makeTestSudokuState(2)
	gm := &GameManager{}
	ensureSudokuState(gs)
	solution := sudokuAsIntSlice(t, gs.GameData["solution"])
	gridIF := make([]interface{}, 81)
	for i, v := range solution {
		gridIF[i] = float64(v)
	}
	if _, _, err := gm.processSudokuMove(gs, 1, map[string]interface{}{"grid": gridIF}); err != nil {
		t.Fatalf("first submit: %v", err)
	}
	if _, _, err := gm.processSudokuMove(gs, 2, map[string]interface{}{"grid": gridIF}); err == nil {
		t.Error("expected an error submitting after the game already ended")
	}
}
