package games

import (
	"fmt"
	"math"
	"math/rand"
)

// Jigsaw: a fully cooperative, simultaneous (not turn-based) puzzle — any
// player can pick up any unclaimed piece at any time. No image cropping
// happens server-side; the client renders every piece as a CSS
// background-position offset against the ONE shared full image (the
// standard technique for browser jigsaw puzzles), so this file only needs
// to track piece identity/position, never pixels.
//
// Two puzzle_type variants share this one file, since they share the setup
// screen, image/difficulty pickers, progress bar, player list, sounds, and
// GameWinnerBanner wiring — only the core piece representation and the
// move(s) that manipulate it differ:
//
//   "regular" (default) — free-drag interlocking pieces with tab/blank
//   silhouettes, scattered in a tray. Phases: "setup" (host picks image +
//   grid size) → "playing" → "completed". Piece tab/blank shapes are
//   generated once here at configure time and broadcast as plain data
//   (v_edges/h_edges) — every client draws the exact same interlocking
//   silhouettes from that shared array, no client-side randomness involved.
//
//   "grid" — a Snapchat-style swap puzzle: every grid cell always holds
//   SOME piece (no tray, no free x/y, no tab/blank shapes — a plain
//   rectangular crop), just not necessarily its own. `cell_order[i]` is the
//   home-piece-index currently sitting in cell i; cell i is correct once
//   cell_order[i] == i. The only move is `swap` — pick two cells, swap
//   their contents. A cell that's already correct can never be selected for
//   another swap (enforced server-side, not just a UI nicety — see
//   processJigsawSwap), which is also what keeps the scoring math simple:
//   since neither cell in a swap can already be correct, a swap's "newly
//   correct" delta is always >= 0, so placed_count only ever goes up, same
//   as regular mode's placed_count from snapped releases.
//
// move_types:
//   configure  { image_url, cols, rows, puzzle_type? }  (host only, phase
//              must be "setup"; puzzle_type defaults to "regular")
//   pickup     { piece_id }               (regular only: claim an unclaimed piece)
//   piece_drag { piece_id, x, y }         (regular only: live position while
//                                          dragging — volatile, no DB write,
//                                          see game_manager.go's volatileRT)
//   release    { piece_id, x, y }         (regular only: drop it — snaps into
//                                          place if close enough to its
//                                          correct spot)
//   swap       { cell_a, cell_b }         (grid only: swap two cells' pieces)
//
// "Winner" for GameWinnerBanner purposes is whoever placed the most pieces
// (ties → draw) — a lightweight, direct reuse of the existing banner rather
// than inventing separate cooperative-completion copy.

const jigsawMinGrid = 3
const jigsawMaxGrid = 8

// jigsawSnapFraction: a piece snaps into place once within this fraction of
// a single cell's size (in both axes) of its correct top-left position.
// Regular mode only — grid mode's "correct" check is exact index equality.
const jigsawSnapFraction = 0.3

func jigsawInitialState() map[string]interface{} {
	return map[string]interface{}{
		"phase":        "setup",
		"image_url":    "",
		"puzzle_type":  "regular",
		"cols":         0,
		"rows":         0,
		"v_edges":      []interface{}{},
		"h_edges":      []interface{}{},
		"pieces":       map[string]interface{}{},
		"cell_order":   []interface{}{},
		"placed_count": 0,
		"total_pieces": 0,
		"placed_by":    map[string]interface{}{},
	}
}

func ensureJigsawState(gameState *GameSessionState) {
	if gameState.GameData["phase"] == nil {
		for k, v := range jigsawInitialState() {
			gameState.GameData[k] = v
		}
	}
}

func (gm *GameManager) processJigsawMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (bool, *uint, error) {
	ensureJigsawState(gameState)

	switch moveType {
	case "configure":
		return false, nil, gm.processJigsawConfigure(gameState, playerID, moveData)
	case "pickup":
		return false, nil, processJigsawPickup(gameState, playerID, moveData)
	case "piece_drag":
		return false, nil, processJigsawDrag(gameState, playerID, moveData)
	case "release":
		return processJigsawRelease(gameState, playerID, moveData)
	case "swap":
		return processJigsawSwap(gameState, playerID, moveData)
	default:
		return false, nil, fmt.Errorf("unknown jigsaw move type: %s", moveType)
	}
}

func (gm *GameManager) processJigsawConfigure(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) error {
	phase, _ := gameState.GameData["phase"].(string)
	if phase != "setup" {
		return fmt.Errorf("puzzle is already configured")
	}
	// Host-only — matches the convention other setup-phase games use
	// (e.g. battleship's placement phase has no such gate since both
	// players configure independently, but jigsaw has ONE shared board,
	// so only the host chooses it).
	if gameState.GameSession != nil && gameState.GameSession.HostID != 0 && gameState.GameSession.HostID != playerID {
		return fmt.Errorf("only the host can configure the puzzle")
	}

	imageURL, _ := moveData["image_url"].(string)
	if imageURL == "" {
		return fmt.Errorf("image_url required")
	}
	colsF, _ := moveData["cols"].(float64)
	rowsF, _ := moveData["rows"].(float64)
	cols := int(colsF)
	rows := int(rowsF)
	if cols < jigsawMinGrid || cols > jigsawMaxGrid || rows < jigsawMinGrid || rows > jigsawMaxGrid {
		return fmt.Errorf("cols and rows must each be between %d and %d", jigsawMinGrid, jigsawMaxGrid)
	}

	puzzleType, _ := moveData["puzzle_type"].(string)
	if puzzleType == "" {
		puzzleType = "regular"
	}
	if puzzleType != "regular" && puzzleType != "grid" {
		return fmt.Errorf("invalid puzzle_type %q", puzzleType)
	}

	gameState.GameData["image_url"] = imageURL
	gameState.GameData["puzzle_type"] = puzzleType
	gameState.GameData["cols"] = cols
	gameState.GameData["rows"] = rows
	gameState.GameData["placed_count"] = 0
	gameState.GameData["total_pieces"] = rows * cols
	gameState.GameData["placed_by"] = map[string]interface{}{}

	if puzzleType == "grid" {
		gameState.GameData["cell_order"] = jigsawDerangement(rows * cols)
		gameState.GameData["v_edges"] = []interface{}{}
		gameState.GameData["h_edges"] = []interface{}{}
		gameState.GameData["pieces"] = map[string]interface{}{}
	} else {
		// Internal edges only — the grid boundary is always a flat/straight cut.
		vEdges := make([]interface{}, rows)
		for r := 0; r < rows; r++ {
			row := make([]interface{}, cols-1)
			for c := 0; c < cols-1; c++ {
				row[c] = rand.Intn(2) == 0
			}
			vEdges[r] = row
		}
		hEdges := make([]interface{}, rows-1)
		for r := 0; r < rows-1; r++ {
			row := make([]interface{}, cols)
			for c := 0; c < cols; c++ {
				row[c] = rand.Intn(2) == 0
			}
			hEdges[r] = row
		}

		// Tray scatter: edge pieces (border of the grid — the classic "sort
		// these first" starting move for a real jigsaw) land in the left half of
		// the tray, interior pieces in the right half. Purely a starting-layout
		// convenience — nothing else about a piece's identity or behavior
		// depends on which group it's in, and pieces move freely between the
		// halves once picked up.
		pieces := make(map[string]interface{}, rows*cols)
		for r := 0; r < rows; r++ {
			for c := 0; c < cols; c++ {
				isEdge := r == 0 || r == rows-1 || c == 0 || c == cols-1
				pieces[jigsawPieceID(r, c)] = map[string]interface{}{
					"row":       r,
					"col":       c,
					"x":         jigsawScatterX(isEdge),
					"y":         1.05 + rand.Float64()*0.75,
					"placed":    false,
					"holder_id": 0.0,
				}
			}
		}

		gameState.GameData["v_edges"] = vEdges
		gameState.GameData["h_edges"] = hEdges
		gameState.GameData["pieces"] = pieces
		gameState.GameData["cell_order"] = []interface{}{}
	}

	gameState.GameData["phase"] = "playing"
	return nil
}

func processJigsawPickup(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) error {
	phase, _ := gameState.GameData["phase"].(string)
	if phase != "playing" {
		return fmt.Errorf("puzzle is not in progress")
	}
	if pt, _ := gameState.GameData["puzzle_type"].(string); pt == "grid" {
		return fmt.Errorf("pickup isn't valid for a grid puzzle — use swap")
	}
	pieceID, _ := moveData["piece_id"].(string)
	pieces := jigsawPiecesMap(gameState.GameData)
	piece, ok := pieces[pieceID].(map[string]interface{})
	if !ok {
		return fmt.Errorf("unknown piece")
	}
	if placed, _ := piece["placed"].(bool); placed {
		return fmt.Errorf("piece is already placed")
	}
	if holder := jigsawHolderID(piece); holder != 0 {
		return fmt.Errorf("piece is already held by another player")
	}
	piece["holder_id"] = float64(playerID)
	pieces[pieceID] = piece
	gameState.GameData["pieces"] = pieces
	return nil
}

// processJigsawDrag relays a piece's live position while someone is actively
// dragging it (volatile, no DB write — see game_manager.go's volatileRT).
// Only the current holder may move it, same ownership check as release —
// this is purely a "where is it right now" update, no snap/placement logic
// at all, so every other client just sees the shared piece.x/y animate
// smoothly toward wherever the dragger currently is (the existing render
// already reads piece.x/y for any piece that isn't the local client's own
// active drag — this is the only backend piece needed to make that live).
func processJigsawDrag(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) error {
	phase, _ := gameState.GameData["phase"].(string)
	if phase != "playing" {
		return fmt.Errorf("puzzle is not in progress")
	}
	if pt, _ := gameState.GameData["puzzle_type"].(string); pt == "grid" {
		return fmt.Errorf("piece_drag isn't valid for a grid puzzle")
	}
	pieceID, _ := moveData["piece_id"].(string)
	pieces := jigsawPiecesMap(gameState.GameData)
	piece, ok := pieces[pieceID].(map[string]interface{})
	if !ok {
		return fmt.Errorf("unknown piece")
	}
	if jigsawHolderID(piece) != playerID {
		return fmt.Errorf("you are not holding this piece")
	}
	x, _ := moveData["x"].(float64)
	y, _ := moveData["y"].(float64)
	piece["x"] = x
	piece["y"] = y
	pieces[pieceID] = piece
	gameState.GameData["pieces"] = pieces
	return nil
}

func processJigsawRelease(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	phase, _ := gameState.GameData["phase"].(string)
	if phase != "playing" {
		return false, nil, fmt.Errorf("puzzle is not in progress")
	}
	if pt, _ := gameState.GameData["puzzle_type"].(string); pt == "grid" {
		return false, nil, fmt.Errorf("release isn't valid for a grid puzzle")
	}
	pieceID, _ := moveData["piece_id"].(string)
	pieces := jigsawPiecesMap(gameState.GameData)
	piece, ok := pieces[pieceID].(map[string]interface{})
	if !ok {
		return false, nil, fmt.Errorf("unknown piece")
	}
	if jigsawHolderID(piece) != playerID {
		return false, nil, fmt.Errorf("you are not holding this piece")
	}

	x, _ := moveData["x"].(float64)
	y, _ := moveData["y"].(float64)

	row := gbInt(piece["row"])
	col := gbInt(piece["col"])
	cols := gbInt(gameState.GameData["cols"])
	rows := gbInt(gameState.GameData["rows"])
	correctX := float64(col) / float64(cols)
	correctY := float64(row) / float64(rows)

	snapped := math.Abs(x-correctX) < jigsawSnapFraction/float64(cols) &&
		math.Abs(y-correctY) < jigsawSnapFraction/float64(rows)

	piece["holder_id"] = 0.0
	if snapped {
		piece["x"] = correctX
		piece["y"] = correctY
		piece["placed"] = true

		placedBy := jigsawPlacedByMap(gameState.GameData)
		key := fmt.Sprintf("%d", playerID)
		placedBy[key] = gbInt(placedBy[key]) + 1
		gameState.GameData["placed_by"] = placedBy

		newCount := gbInt(gameState.GameData["placed_count"]) + 1
		gameState.GameData["placed_count"] = newCount
		pieces[pieceID] = piece
		gameState.GameData["pieces"] = pieces

		if newCount >= gbInt(gameState.GameData["total_pieces"]) {
			gameState.GameData["phase"] = "completed"
			winnerID := jigsawTopPlacer(placedBy)
			return true, winnerID, nil
		}
		return false, nil, nil
	}

	piece["x"] = x
	piece["y"] = y
	pieces[pieceID] = piece
	gameState.GameData["pieces"] = pieces
	return false, nil, nil
}

// processJigsawSwap handles grid mode's one move: swap the pieces currently
// sitting in two cells. Neither cell may already be correct (cell_order[i]
// == i) — enforced here, not just as a UI nicety, both to stop a solved
// cell from ever being accidentally (or maliciously) un-scrambled, and
// because it keeps the scoring math simple: with that guaranteed, a swap's
// "newly correct" delta can never be negative, so placed_count only ever
// increases, exactly like regular mode's placed_count from snapped releases.
func processJigsawSwap(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	phase, _ := gameState.GameData["phase"].(string)
	if phase != "playing" {
		return false, nil, fmt.Errorf("puzzle is not in progress")
	}
	if pt, _ := gameState.GameData["puzzle_type"].(string); pt != "grid" {
		return false, nil, fmt.Errorf("swap is only valid for a grid puzzle")
	}

	cellAF, okA := moveData["cell_a"].(float64)
	cellBF, okB := moveData["cell_b"].(float64)
	if !okA || !okB {
		return false, nil, fmt.Errorf("cell_a and cell_b required")
	}
	cellA, cellB := int(cellAF), int(cellBF)

	order := jigsawCellOrder(gameState.GameData)
	total := len(order)
	if cellA < 0 || cellA >= total || cellB < 0 || cellB >= total {
		return false, nil, fmt.Errorf("cell index out of range")
	}
	if cellA == cellB {
		return false, nil, fmt.Errorf("cannot swap a cell with itself")
	}
	if gbInt(order[cellA]) == cellA || gbInt(order[cellB]) == cellB {
		return false, nil, fmt.Errorf("cannot swap a piece that's already correctly placed")
	}

	order[cellA], order[cellB] = order[cellB], order[cellA]
	gameState.GameData["cell_order"] = order

	delta := 0
	if gbInt(order[cellA]) == cellA {
		delta++
	}
	if gbInt(order[cellB]) == cellB {
		delta++
	}
	if delta == 0 {
		return false, nil, nil
	}

	placedBy := jigsawPlacedByMap(gameState.GameData)
	key := fmt.Sprintf("%d", playerID)
	placedBy[key] = gbInt(placedBy[key]) + delta
	gameState.GameData["placed_by"] = placedBy

	newCount := gbInt(gameState.GameData["placed_count"]) + delta
	gameState.GameData["placed_count"] = newCount

	if newCount >= gbInt(gameState.GameData["total_pieces"]) {
		gameState.GameData["phase"] = "completed"
		winnerID := jigsawTopPlacer(placedBy)
		return true, winnerID, nil
	}
	return false, nil, nil
}

// jigsawDerangement returns a random permutation of [0, n) with no fixed
// points (order[i] != i for every i) — so a freshly-configured grid puzzle
// never starts with any cell already correct. Rejection sampling: reshuffle
// until no fixed point survives. Converges fast in practice (probability of
// zero fixed points approaches 1/e ≈ 37% as n grows) and this only ever runs
// once, at configure time, on at most jigsawMaxGrid² = 64 elements.
func jigsawDerangement(n int) []interface{} {
	order := make([]int, n)
	for i := range order {
		order[i] = i
	}
	if n >= 2 {
		for {
			rand.Shuffle(n, func(i, j int) { order[i], order[j] = order[j], order[i] })
			hasFixed := false
			for i, v := range order {
				if v == i {
					hasFixed = true
					break
				}
			}
			if !hasFixed {
				break
			}
		}
	}
	result := make([]interface{}, n)
	for i, v := range order {
		result[i] = v
	}
	return result
}

func jigsawCellOrder(data map[string]interface{}) []interface{} {
	if arr, ok := data["cell_order"].([]interface{}); ok {
		return arr
	}
	return []interface{}{}
}

// jigsawTopPlacer returns whoever placed the most pieces, or nil if there's
// a tie for the top spot (including a tie at zero, which just means the
// puzzle got finished by pure luck-of-the-last-piece across equal
// contributions — a draw either way).
func jigsawTopPlacer(placedBy map[string]interface{}) *uint {
	best := -1
	var bestID uint
	tied := false
	for key, v := range placedBy {
		count := gbInt(v)
		var id uint
		if _, err := fmt.Sscanf(key, "%d", &id); err != nil {
			continue
		}
		if count > best {
			best = count
			bestID = id
			tied = false
		} else if count == best {
			tied = true
		}
	}
	if best <= 0 || tied {
		return nil
	}
	return &bestID
}

func jigsawPieceID(row, col int) string {
	return fmt.Sprintf("%d-%d", row, col)
}

// jigsawScatterX picks a starting tray x-position: edge pieces scatter into
// the left half [-0.05, 0.40), interior pieces into the right half
// [0.55, 1.00) — see the comment at the call site in processJigsawConfigure.
func jigsawScatterX(isEdge bool) float64 {
	if isEdge {
		return rand.Float64()*0.45 - 0.05
	}
	return 0.55 + rand.Float64()*0.45
}

func jigsawPiecesMap(data map[string]interface{}) map[string]interface{} {
	if m, ok := data["pieces"].(map[string]interface{}); ok {
		return m
	}
	return map[string]interface{}{}
}

func jigsawPlacedByMap(data map[string]interface{}) map[string]interface{} {
	if m, ok := data["placed_by"].(map[string]interface{}); ok {
		return m
	}
	return map[string]interface{}{}
}

func jigsawHolderID(piece map[string]interface{}) uint {
	switch v := piece["holder_id"].(type) {
	case float64:
		return uint(v)
	case uint:
		return v
	case int:
		return uint(v)
	}
	return 0
}
