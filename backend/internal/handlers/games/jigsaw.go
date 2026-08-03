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
// Phases: "setup" (host picks image + grid size) → "playing" → "completed".
//
// Piece tab/blank shapes are generated once here at configure time and
// broadcast as plain data (v_edges/h_edges) — every client draws the exact
// same interlocking silhouettes from that shared array, no client-side
// randomness involved.
//
// move_types:
//   configure  { image_url, cols, rows }  (host only, phase must be "setup")
//   pickup     { piece_id }               (claim an unclaimed piece)
//   piece_drag { piece_id, x, y }         (live position while dragging —
//                                          volatile, no DB write, see
//                                          game_manager.go's volatileRT)
//   release    { piece_id, x, y }         (drop it — snaps into place if close
//                                          enough to its correct spot)
//
// "Winner" for GameWinnerBanner purposes is whoever placed the most pieces
// (ties → draw) — a lightweight, direct reuse of the existing banner rather
// than inventing separate cooperative-completion copy.

const jigsawMinGrid = 3
const jigsawMaxGrid = 8

// jigsawSnapFraction: a piece snaps into place once within this fraction of
// a single cell's size (in both axes) of its correct top-left position.
const jigsawSnapFraction = 0.3

func jigsawInitialState() map[string]interface{} {
	return map[string]interface{}{
		"phase":        "setup",
		"image_url":    "",
		"cols":         0,
		"rows":         0,
		"v_edges":      []interface{}{},
		"h_edges":      []interface{}{},
		"pieces":       map[string]interface{}{},
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

	gameState.GameData["image_url"] = imageURL
	gameState.GameData["cols"] = cols
	gameState.GameData["rows"] = rows
	gameState.GameData["v_edges"] = vEdges
	gameState.GameData["h_edges"] = hEdges
	gameState.GameData["pieces"] = pieces
	gameState.GameData["placed_count"] = 0
	gameState.GameData["total_pieces"] = rows * cols
	gameState.GameData["placed_by"] = map[string]interface{}{}
	gameState.GameData["phase"] = "playing"
	return nil
}

func processJigsawPickup(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) error {
	phase, _ := gameState.GameData["phase"].(string)
	if phase != "playing" {
		return fmt.Errorf("puzzle is not in progress")
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
