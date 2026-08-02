package games

import (
	"fmt"
	"math/rand"
	"time"

	"wewatch-backend/internal/models"
)

// Sudoku: simultaneous race — everyone gets the same puzzle, first to submit
// a correct completed grid wins. Server stores the full solution; players
// submit their full 81-cell grid for validation.
//
// Puzzle generation: shuffle a known valid base grid via digit permutation +
// row/col swaps within bands, then blank ~45 cells. No uniqueness check —
// acceptable for casual competitive play (the stored solution is always valid).

func sudokuGeneratePuzzle() (puzzle []int, solution []int) {
	// Base valid solved grid
	base := []int{
		5, 3, 4, 6, 7, 8, 9, 1, 2,
		6, 7, 2, 1, 9, 5, 3, 4, 8,
		1, 9, 8, 3, 4, 2, 5, 6, 7,
		8, 5, 9, 7, 6, 1, 4, 2, 3,
		4, 2, 6, 8, 5, 3, 7, 9, 1,
		7, 1, 3, 9, 2, 4, 8, 5, 6,
		9, 6, 1, 5, 3, 7, 2, 8, 4,
		2, 8, 7, 4, 1, 9, 6, 3, 5,
		3, 4, 5, 2, 8, 6, 1, 7, 9,
	}

	// Digit permutation: map each digit 1-9 to another digit 1-9
	digits := []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	rand.Shuffle(len(digits), func(i, j int) { digits[i], digits[j] = digits[j], digits[i] })
	digitMap := make([]int, 10) // index = original digit, value = new digit
	for i, d := range digits {
		digitMap[i+1] = d
	}

	grid := make([]int, 81)
	for i, v := range base {
		grid[i] = digitMap[v]
	}

	// Row swaps within bands (3 bands of 3 rows each)
	for band := 0; band < 3; band++ {
		rows := []int{band * 3, band*3 + 1, band*3 + 2}
		rand.Shuffle(len(rows), func(i, j int) { rows[i], rows[j] = rows[j], rows[i] })
		newGrid := make([]int, 81)
		copy(newGrid, grid)
		for newRow, oldRow := range rows {
			for col := 0; col < 9; col++ {
				newGrid[(band*3+newRow)*9+col] = grid[oldRow*9+col]
			}
		}
		grid = newGrid
	}

	// Column swaps within bands
	for band := 0; band < 3; band++ {
		cols := []int{band * 3, band*3 + 1, band*3 + 2}
		rand.Shuffle(len(cols), func(i, j int) { cols[i], cols[j] = cols[j], cols[i] })
		newGrid := make([]int, 81)
		copy(newGrid, grid)
		for row := 0; row < 9; row++ {
			for newCol, oldCol := range cols {
				newGrid[row*9+(band*3+newCol)] = grid[row*9+oldCol]
			}
		}
		grid = newGrid
	}

	solution = make([]int, 81)
	copy(solution, grid)

	// Remove ~45 cells to make the puzzle
	puzzle = make([]int, 81)
	copy(puzzle, grid)
	indices := rand.Perm(81)
	for i := 0; i < 45; i++ {
		puzzle[indices[i]] = 0
	}

	return puzzle, solution
}

func sudokuInitialState(players []models.Player) map[string]interface{} {
	puzzle, solution := sudokuGeneratePuzzle()

	// Convert to []interface{} for JSON compatibility
	puzzleIF := make([]interface{}, len(puzzle))
	solutionIF := make([]interface{}, len(solution))
	for i, v := range puzzle {
		puzzleIF[i] = v
	}
	for i, v := range solution {
		solutionIF[i] = v
	}

	submissions := map[string]interface{}{}
	for _, p := range players {
		submissions[fmt.Sprintf("%d", p.UserID)] = nil // nil = not submitted
	}

	return map[string]interface{}{
		"phase":       "playing",
		"puzzle":      puzzleIF,    // 81 ints, 0 = blank
		"solution":    solutionIF,  // hidden, stripped from public broadcast
		"submissions": submissions, // player_id → "correct"|"incorrect"|nil
		"start_time":  time.Now().UnixMilli(),
	}
}

// sudokuPublicState strips the solution.
func sudokuPublicState(data map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(data))
	for k, v := range data {
		out[k] = v
	}
	phase, _ := data["phase"].(string)
	if phase == "playing" {
		delete(out, "solution")
	}
	return out
}

func ensureSudokuState(gameState *GameSessionState) {
	if gameState.GameData["phase"] == nil {
		for k, v := range sudokuInitialState(gameState.Players) {
			gameState.GameData[k] = v
		}
	}
}

func (gm *GameManager) processSudokuMove(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	ensureSudokuState(gameState)

	phase, _ := gameState.GameData["phase"].(string)
	if phase != "playing" {
		return false, nil, fmt.Errorf("game is not in playing phase")
	}

	// Expect move_data.grid — array of 81 ints
	gridRaw, ok := moveData["grid"]
	if !ok {
		return false, nil, fmt.Errorf("missing grid in move data")
	}
	gridIF, ok := gridRaw.([]interface{})
	if !ok || len(gridIF) != 81 {
		return false, nil, fmt.Errorf("grid must be an array of 81 numbers")
	}

	submitted := make([]int, 81)
	for i, v := range gridIF {
		submitted[i] = sudokuInt(v)
	}

	solution := sudokuIntSlice(gameState.GameData["solution"])

	correct := true
	for i := 0; i < 81; i++ {
		if submitted[i] != solution[i] {
			correct = false
			break
		}
	}

	playerKey := fmt.Sprintf("%d", playerID)
	submissions := sudokuSubmissionsMap(gameState.GameData)

	if correct {
		submissions[playerKey] = "correct"
		gameState.GameData["submissions"] = submissions
		gameState.GameData["phase"] = "ended" // sudokuPublicState stops stripping the solution once phase is "ended" — that's the reveal

		uid := playerID
		return true, &uid, nil
	}

	submissions[playerKey] = "incorrect"
	gameState.GameData["submissions"] = submissions
	return false, nil, nil
}

// --- helpers ---

func sudokuInt(v interface{}) int {
	switch val := v.(type) {
	case int:
		return val
	case float64:
		return int(val)
	}
	return 0
}

func sudokuIntSlice(raw interface{}) []int {
	if raw == nil {
		return make([]int, 81)
	}
	if s, ok := raw.([]interface{}); ok {
		out := make([]int, len(s))
		for i, v := range s {
			out[i] = sudokuInt(v)
		}
		return out
	}
	return make([]int, 81)
}

func sudokuSubmissionsMap(data map[string]interface{}) map[string]interface{} {
	if raw, ok := data["submissions"]; ok {
		if m, ok := raw.(map[string]interface{}); ok {
			return m
		}
	}
	return map[string]interface{}{}
}
