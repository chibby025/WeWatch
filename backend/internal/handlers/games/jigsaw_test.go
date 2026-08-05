package games

import (
	"testing"
	"wewatch-backend/internal/models"
)

func makeTestJigsawState(numPlayers int, hostID uint) *GameSessionState {
	players := make([]models.Player, numPlayers)
	for i := range players {
		players[i] = models.Player{UserID: uint(i + 1)}
	}
	return &GameSessionState{
		Players:     players,
		CurrentTurn: 0,
		GameData:    map[string]interface{}{},
		GameSession: &models.GameSession{GameType: "jigsaw", HostID: hostID},
	}
}

func TestJigsawConfigure(t *testing.T) {
	gs := makeTestJigsawState(2, 1)
	gm := &GameManager{}

	_, _, err := gm.processJigsawMove(gs, 1, "configure", map[string]interface{}{
		"image_url": "https://example.com/pic.webp", "cols": float64(4), "rows": float64(3),
	})
	if err != nil {
		t.Fatalf("configure: %v", err)
	}

	if phase, _ := gs.GameData["phase"].(string); phase != "playing" {
		t.Errorf("expected phase 'playing', got %q", phase)
	}
	if total := gbInt(gs.GameData["total_pieces"]); total != 12 {
		t.Errorf("expected 12 total pieces (4x3), got %d", total)
	}
	pieces := jigsawPiecesMap(gs.GameData)
	if len(pieces) != 12 {
		t.Errorf("expected 12 pieces in the map, got %d", len(pieces))
	}
	vEdges, _ := gs.GameData["v_edges"].([]interface{})
	if len(vEdges) != 3 { // rows
		t.Errorf("expected 3 rows of v_edges, got %d", len(vEdges))
	}
	firstRow, _ := vEdges[0].([]interface{})
	if len(firstRow) != 3 { // cols-1
		t.Errorf("expected 3 internal vertical edges per row (cols-1), got %d", len(firstRow))
	}
	hEdges, _ := gs.GameData["h_edges"].([]interface{})
	if len(hEdges) != 2 { // rows-1
		t.Errorf("expected 2 rows of h_edges (rows-1), got %d", len(hEdges))
	}
}

func TestJigsawConfigureRejectsNonHost(t *testing.T) {
	gs := makeTestJigsawState(2, 1)
	gm := &GameManager{}

	_, _, err := gm.processJigsawMove(gs, 2, "configure", map[string]interface{}{
		"image_url": "https://example.com/pic.webp", "cols": float64(4), "rows": float64(3),
	})
	if err == nil {
		t.Fatal("expected error: only the host can configure the puzzle")
	}
}

func TestJigsawConfigureRejectsBadGridSize(t *testing.T) {
	gm := &GameManager{}

	cases := []struct{ cols, rows float64 }{
		{2, 4},  // cols too small
		{9, 4},  // cols too large
		{4, 2},  // rows too small
		{4, 20}, // rows too large
	}
	for _, c := range cases {
		gs := makeTestJigsawState(1, 1) // fresh state each time (configure only allowed once from "setup")
		_, _, err := gm.processJigsawMove(gs, 1, "configure", map[string]interface{}{
			"image_url": "https://example.com/pic.webp", "cols": c.cols, "rows": c.rows,
		})
		if err == nil {
			t.Errorf("expected error for cols=%v rows=%v, got none", c.cols, c.rows)
		}
	}
}

func TestJigsawCannotConfigureTwice(t *testing.T) {
	gs := makeTestJigsawState(1, 1)
	gm := &GameManager{}
	if _, _, err := gm.processJigsawMove(gs, 1, "configure", map[string]interface{}{
		"image_url": "https://example.com/pic.webp", "cols": float64(4), "rows": float64(4),
	}); err != nil {
		t.Fatalf("first configure: %v", err)
	}
	if _, _, err := gm.processJigsawMove(gs, 1, "configure", map[string]interface{}{
		"image_url": "https://example.com/other.webp", "cols": float64(3), "rows": float64(3),
	}); err == nil {
		t.Fatal("expected error configuring an already-configured puzzle")
	}
}

func configuredJigsaw(t *testing.T, numPlayers int) *GameSessionState {
	t.Helper()
	gs := makeTestJigsawState(numPlayers, 1)
	gm := &GameManager{}
	if _, _, err := gm.processJigsawMove(gs, 1, "configure", map[string]interface{}{
		"image_url": "https://example.com/pic.webp", "cols": float64(4), "rows": float64(4),
	}); err != nil {
		t.Fatalf("configure: %v", err)
	}
	return gs
}

func TestJigsawPickupThenReleaseSnaps(t *testing.T) {
	gs := configuredJigsaw(t, 2)
	gm := &GameManager{}

	if _, _, err := gm.processJigsawMove(gs, 1, "pickup", map[string]interface{}{"piece_id": "0-0"}); err != nil {
		t.Fatalf("pickup: %v", err)
	}
	pieces := jigsawPiecesMap(gs.GameData)
	piece := pieces["0-0"].(map[string]interface{})
	if jigsawHolderID(piece) != 1 {
		t.Fatalf("expected piece held by player 1, got holder %v", piece["holder_id"])
	}

	// Piece (0,0)'s correct top-left is (0,0) on a 4x4 grid — release right on target.
	gameOver, _, err := gm.processJigsawMove(gs, 1, "release", map[string]interface{}{
		"piece_id": "0-0", "x": 0.01, "y": 0.01,
	})
	if err != nil {
		t.Fatalf("release: %v", err)
	}
	if gameOver {
		t.Fatal("one piece should not complete a 16-piece puzzle")
	}
	pieces = jigsawPiecesMap(gs.GameData)
	piece = pieces["0-0"].(map[string]interface{})
	if placed, _ := piece["placed"].(bool); !placed {
		t.Error("expected piece to be placed after snapping")
	}
	if jigsawHolderID(piece) != 0 {
		t.Error("expected holder_id to clear after release")
	}
	if count := gbInt(gs.GameData["placed_count"]); count != 1 {
		t.Errorf("expected placed_count=1, got %d", count)
	}
}

func TestJigsawReleaseOffTargetDoesNotSnap(t *testing.T) {
	gs := configuredJigsaw(t, 2)
	gm := &GameManager{}

	if _, _, err := gm.processJigsawMove(gs, 1, "pickup", map[string]interface{}{"piece_id": "3-3"}); err != nil {
		t.Fatalf("pickup: %v", err)
	}
	// Piece (3,3)'s correct top-left on a 4x4 grid is (0.75, 0.75) — drop it
	// somewhere far from that.
	if _, _, err := gm.processJigsawMove(gs, 1, "release", map[string]interface{}{
		"piece_id": "3-3", "x": 0.1, "y": 0.1,
	}); err != nil {
		t.Fatalf("release: %v", err)
	}
	pieces := jigsawPiecesMap(gs.GameData)
	piece := pieces["3-3"].(map[string]interface{})
	if placed, _ := piece["placed"].(bool); placed {
		t.Error("expected piece to remain unplaced when dropped far from its correct spot")
	}
	if count := gbInt(gs.GameData["placed_count"]); count != 0 {
		t.Errorf("expected placed_count=0, got %d", count)
	}
	if x, _ := piece["x"].(float64); x != 0.1 {
		t.Errorf("expected piece x to update to the dropped position, got %v", x)
	}
}

func TestJigsawCannotPickupHeldPiece(t *testing.T) {
	gs := configuredJigsaw(t, 2)
	gm := &GameManager{}

	if _, _, err := gm.processJigsawMove(gs, 1, "pickup", map[string]interface{}{"piece_id": "1-1"}); err != nil {
		t.Fatalf("player 1 pickup: %v", err)
	}
	if _, _, err := gm.processJigsawMove(gs, 2, "pickup", map[string]interface{}{"piece_id": "1-1"}); err == nil {
		t.Fatal("expected error: player 2 should not be able to pick up a piece player 1 is already holding")
	}
}

func TestJigsawCannotReleaseUnheldPiece(t *testing.T) {
	gs := configuredJigsaw(t, 2)
	gm := &GameManager{}

	if _, _, err := gm.processJigsawMove(gs, 1, "pickup", map[string]interface{}{"piece_id": "2-2"}); err != nil {
		t.Fatalf("pickup: %v", err)
	}
	if _, _, err := gm.processJigsawMove(gs, 2, "release", map[string]interface{}{
		"piece_id": "2-2", "x": 0.5, "y": 0.5,
	}); err == nil {
		t.Fatal("expected error: player 2 should not be able to release a piece they don't hold")
	}
}

// TestJigsawCompletionDeclaresTopPlacer: placing every piece ends the puzzle
// and declares whoever placed the most pieces as the "winner" — a direct,
// deliberately lightweight reuse of the existing win/draw banner rather than
// separate cooperative-completion messaging.
func TestJigsawCompletionDeclaresTopPlacer(t *testing.T) {
	gs := configuredJigsaw(t, 2) // 4x4 = 16 pieces
	gm := &GameManager{}

	var lastGameOver bool
	var lastWinner *uint
	for r := 0; r < 4; r++ {
		for c := 0; c < 4; c++ {
			id := jigsawPieceID(r, c)
			actor := uint(1)
			if r == 3 && c == 3 {
				actor = 2 // let player 2 place exactly one, so player 1 still has the most
			}
			if _, _, err := gm.processJigsawMove(gs, actor, "pickup", map[string]interface{}{"piece_id": id}); err != nil {
				t.Fatalf("pickup %s: %v", id, err)
			}
			gameOver, winner, err := gm.processJigsawMove(gs, actor, "release", map[string]interface{}{
				"piece_id": id, "x": float64(c) / 4.0, "y": float64(r) / 4.0,
			})
			if err != nil {
				t.Fatalf("release %s: %v", id, err)
			}
			lastGameOver, lastWinner = gameOver, winner
		}
	}

	if !lastGameOver {
		t.Fatal("expected the puzzle to complete once every piece is placed")
	}
	if lastWinner == nil || *lastWinner != 1 {
		t.Errorf("expected player 1 (placed 15/16) to be declared the top placer, got %v", lastWinner)
	}
	if phase, _ := gs.GameData["phase"].(string); phase != "completed" {
		t.Errorf("expected phase 'completed', got %q", phase)
	}
}

func TestJigsawDragRelaysPositionWhileHeld(t *testing.T) {
	gs := configuredJigsaw(t, 2)
	gm := &GameManager{}

	if _, _, err := gm.processJigsawMove(gs, 1, "pickup", map[string]interface{}{"piece_id": "1-2"}); err != nil {
		t.Fatalf("pickup: %v", err)
	}
	if _, _, err := gm.processJigsawMove(gs, 1, "piece_drag", map[string]interface{}{
		"piece_id": "1-2", "x": 0.33, "y": 0.44,
	}); err != nil {
		t.Fatalf("piece_drag: %v", err)
	}
	pieces := jigsawPiecesMap(gs.GameData)
	piece := pieces["1-2"].(map[string]interface{})
	if x, _ := piece["x"].(float64); x != 0.33 {
		t.Errorf("expected live x=0.33, got %v", x)
	}
	if y, _ := piece["y"].(float64); y != 0.44 {
		t.Errorf("expected live y=0.44, got %v", y)
	}
	// Dragging must not place the piece or touch placed_count — it's purely
	// a position update, snapping only happens on release.
	if placed, _ := piece["placed"].(bool); placed {
		t.Error("piece_drag should never place a piece")
	}
	if count := gbInt(gs.GameData["placed_count"]); count != 0 {
		t.Errorf("expected placed_count=0 after a drag, got %d", count)
	}
}

func TestJigsawDragRejectedWhenNotHolding(t *testing.T) {
	gs := configuredJigsaw(t, 2)
	gm := &GameManager{}

	if _, _, err := gm.processJigsawMove(gs, 1, "pickup", map[string]interface{}{"piece_id": "0-1"}); err != nil {
		t.Fatalf("pickup: %v", err)
	}
	if _, _, err := gm.processJigsawMove(gs, 2, "piece_drag", map[string]interface{}{
		"piece_id": "0-1", "x": 0.2, "y": 0.2,
	}); err == nil {
		t.Fatal("expected error: player 2 should not be able to drag a piece player 1 is holding")
	}
}

func TestJigsawDragRejectedOnUnheldPiece(t *testing.T) {
	gs := configuredJigsaw(t, 2)
	gm := &GameManager{}

	if _, _, err := gm.processJigsawMove(gs, 1, "piece_drag", map[string]interface{}{
		"piece_id": "0-1", "x": 0.2, "y": 0.2,
	}); err == nil {
		t.Fatal("expected error: cannot drag a piece nobody has picked up")
	}
}

// TestJigsawScatterGroupsEdgeAndInteriorPieces: edge pieces (border of the
// grid) should land in the left half of the tray, interior pieces in the
// right half — the "sort edge pieces first" starting-layout convenience.
func TestJigsawScatterGroupsEdgeAndInteriorPieces(t *testing.T) {
	gs := configuredJigsaw(t, 1) // 4x4 grid
	pieces := jigsawPiecesMap(gs.GameData)

	checkHalf := func(pieceID string, wantLeft bool) {
		t.Helper()
		piece := pieces[pieceID].(map[string]interface{})
		x, _ := piece["x"].(float64)
		if wantLeft && x >= 0.40 {
			t.Errorf("piece %s: expected left-half scatter (x<0.40), got x=%v", pieceID, x)
		}
		if !wantLeft && x < 0.55 {
			t.Errorf("piece %s: expected right-half scatter (x>=0.55), got x=%v", pieceID, x)
		}
	}
	// Corners and border pieces are all edge pieces on a 4x4 grid.
	checkHalf("0-0", true)
	checkHalf("0-3", true)
	checkHalf("3-0", true)
	checkHalf("0-2", true) // top row, interior column — still an edge piece
	// (1,1) and (1,2) etc are the only fully-interior pieces on a 4x4 grid.
	checkHalf("1-1", false)
	checkHalf("2-2", false)
}

func TestJigsawTopPlacerTieIsDraw(t *testing.T) {
	placedBy := map[string]interface{}{"1": 5, "2": 5}
	if winner := jigsawTopPlacer(placedBy); winner != nil {
		t.Errorf("expected nil (draw) for a tie, got %v", *winner)
	}
}

func TestJigsawTopPlacerClearWinner(t *testing.T) {
	placedBy := map[string]interface{}{"1": 5, "2": 3}
	winner := jigsawTopPlacer(placedBy)
	if winner == nil || *winner != 1 {
		t.Errorf("expected player 1, got %v", winner)
	}
}

// ── Grid mode (Snapchat-style swap puzzle) ─────────────────────────────────

func configuredGridJigsaw(t *testing.T, numPlayers int, cols, rows int) *GameSessionState {
	t.Helper()
	gs := makeTestJigsawState(numPlayers, 1)
	gm := &GameManager{}
	if _, _, err := gm.processJigsawMove(gs, 1, "configure", map[string]interface{}{
		"image_url": "https://example.com/pic.webp", "cols": float64(cols), "rows": float64(rows), "puzzle_type": "grid",
	}); err != nil {
		t.Fatalf("configure grid: %v", err)
	}
	return gs
}

func TestJigsawConfigureDefaultPuzzleTypeIsRegular(t *testing.T) {
	gs := configuredJigsaw(t, 1) // configuredJigsaw never sets puzzle_type in its moveData
	if pt, _ := gs.GameData["puzzle_type"].(string); pt != "regular" {
		t.Errorf("expected puzzle_type to default to 'regular', got %q", pt)
	}
}

func TestJigsawConfigureGrid(t *testing.T) {
	gs := configuredGridJigsaw(t, 1, 4, 3)

	if phase, _ := gs.GameData["phase"].(string); phase != "playing" {
		t.Errorf("expected phase 'playing', got %q", phase)
	}
	if pt, _ := gs.GameData["puzzle_type"].(string); pt != "grid" {
		t.Errorf("expected puzzle_type 'grid', got %q", pt)
	}
	if total := gbInt(gs.GameData["total_pieces"]); total != 12 {
		t.Errorf("expected 12 total pieces (4x3), got %d", total)
	}
	// Grid mode has no tray/edges — regular mode's fields should be empty.
	if pieces := jigsawPiecesMap(gs.GameData); len(pieces) != 0 {
		t.Errorf("expected empty pieces map for grid mode, got %d entries", len(pieces))
	}
	if vEdges, _ := gs.GameData["v_edges"].([]interface{}); len(vEdges) != 0 {
		t.Errorf("expected empty v_edges for grid mode, got %d", len(vEdges))
	}

	order := jigsawCellOrder(gs.GameData)
	if len(order) != 12 {
		t.Fatalf("expected cell_order length 12, got %d", len(order))
	}
	seen := make([]bool, 12)
	for i, v := range order {
		vi := gbInt(v)
		if vi == i {
			t.Errorf("expected a derangement — cell %d holds its own correct piece", i)
		}
		if vi < 0 || vi >= 12 || seen[vi] {
			t.Fatalf("cell_order is not a valid permutation: value %d at index %d", vi, i)
		}
		seen[vi] = true
	}
}

func TestJigsawDerangementNoFixedPointsAcrossManyRuns(t *testing.T) {
	// Rejection sampling — run it enough times to be confident the loop
	// itself (not just one lucky shuffle) genuinely never returns a fixed point.
	for run := 0; run < 200; run++ {
		order := jigsawDerangement(9)
		seen := make([]bool, 9)
		for i, v := range order {
			vi, ok := v.(int)
			if !ok {
				t.Fatalf("run %d: expected int element, got %T", run, v)
			}
			if vi == i {
				t.Fatalf("run %d: fixed point at index %d", run, i)
			}
			if vi < 0 || vi >= 9 || seen[vi] {
				t.Fatalf("run %d: not a valid permutation (value %d at index %d)", run, vi, i)
			}
			seen[vi] = true
		}
	}
}

func TestJigsawSwapRejectedForRegularPuzzle(t *testing.T) {
	gs := configuredJigsaw(t, 1) // regular mode
	gm := &GameManager{}
	if _, _, err := gm.processJigsawMove(gs, 1, "swap", map[string]interface{}{
		"cell_a": float64(0), "cell_b": float64(1),
	}); err == nil {
		t.Fatal("expected error: swap is not valid for a regular puzzle")
	}
}

func TestJigsawPickupDragReleaseRejectedForGridPuzzle(t *testing.T) {
	gs := configuredGridJigsaw(t, 1, 3, 3)
	gm := &GameManager{}
	if _, _, err := gm.processJigsawMove(gs, 1, "pickup", map[string]interface{}{"piece_id": "0-0"}); err == nil {
		t.Error("expected error: pickup is not valid for a grid puzzle")
	}
	if _, _, err := gm.processJigsawMove(gs, 1, "piece_drag", map[string]interface{}{"piece_id": "0-0", "x": 0.1, "y": 0.1}); err == nil {
		t.Error("expected error: piece_drag is not valid for a grid puzzle")
	}
	if _, _, err := gm.processJigsawMove(gs, 1, "release", map[string]interface{}{"piece_id": "0-0", "x": 0.1, "y": 0.1}); err == nil {
		t.Error("expected error: release is not valid for a grid puzzle")
	}
}

// jigsawSetCellOrder overwrites the puzzle's cell_order with a hand-crafted
// permutation, bypassing the random derangement — needed for deterministic
// swap-sequence tests.
func jigsawSetCellOrder(gs *GameSessionState, order []int) {
	arr := make([]interface{}, len(order))
	for i, v := range order {
		arr[i] = v
	}
	gs.GameData["cell_order"] = arr
}

func TestJigsawSwapSuccessUpdatesOrderAndScore(t *testing.T) {
	gs := configuredGridJigsaw(t, 1, 3, 3) // 9 cells
	// pos0 holds piece1, pos1 holds piece0 — a simple 2-cycle.
	jigsawSetCellOrder(gs, []int{1, 0, 2, 3, 4, 5, 6, 7, 8})
	// Reset placed_count to reflect this hand-crafted (already-7-correct) state,
	// same as configure would have computed for it.
	gs.GameData["placed_count"] = 7

	gm := &GameManager{}
	gameOver, winnerID, err := gm.processJigsawMove(gs, 1, "swap", map[string]interface{}{
		"cell_a": float64(0), "cell_b": float64(1),
	})
	if err != nil {
		t.Fatalf("swap: %v", err)
	}
	order := jigsawCellOrder(gs.GameData)
	if gbInt(order[0]) != 0 || gbInt(order[1]) != 1 {
		t.Fatalf("expected cells 0 and 1 to both be correct after swap, got order[0]=%v order[1]=%v", order[0], order[1])
	}
	if count := gbInt(gs.GameData["placed_count"]); count != 9 {
		t.Errorf("expected placed_count=9 (7 preset + 2 from this swap), got %d", count)
	}
	if !gameOver {
		t.Error("expected the puzzle to complete now that all 9 cells are correct")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Errorf("expected player 1 (sole scorer) to win, got %v", winnerID)
	}
	if phase, _ := gs.GameData["phase"].(string); phase != "completed" {
		t.Errorf("expected phase 'completed', got %q", phase)
	}
}

func TestJigsawSwapWithNoNewCorrectCellsDoesNotScoreOrComplete(t *testing.T) {
	gs := configuredGridJigsaw(t, 1, 3, 3)
	// Two independent 2-cycles: (0 1) and (2 3); cells 4-8 already correct.
	// Swapping ACROSS the two cycles (0 with 2, rather than within either
	// one) lands neither piece on its correct cell — hand-verified: pos0
	// wants piece0 but receives piece3; pos2 wants piece2 but receives piece1.
	jigsawSetCellOrder(gs, []int{1, 0, 3, 2, 4, 5, 6, 7, 8})
	gs.GameData["placed_count"] = 5 // cells 4-8

	gm := &GameManager{}
	gameOver, winnerID, err := gm.processJigsawMove(gs, 1, "swap", map[string]interface{}{
		"cell_a": float64(0), "cell_b": float64(2),
	})
	if err != nil {
		t.Fatalf("swap: %v", err)
	}
	if gameOver || winnerID != nil {
		t.Error("expected no completion from a swap that creates no newly-correct cells")
	}
	order := jigsawCellOrder(gs.GameData)
	if gbInt(order[0]) != 3 || gbInt(order[2]) != 1 {
		t.Fatalf("expected the two cells' contents to have swapped regardless, got order[0]=%v order[2]=%v", order[0], order[2])
	}
	if count := gbInt(gs.GameData["placed_count"]); count != 5 {
		t.Errorf("expected placed_count to stay at 5 (no newly-correct cells), got %d", count)
	}
	if placedBy := jigsawPlacedByMap(gs.GameData); gbInt(placedBy["1"]) != 0 {
		t.Errorf("expected player 1 credited with nothing, got %v", placedBy["1"])
	}
}

// TestJigsawSwapCanScorePartialCredit covers the case a straight "both cells
// or neither" model would miss: a 3-cycle needs 2 swaps to resolve, and the
// first one always lands exactly one of the two cells correctly, not both.
func TestJigsawSwapCanScorePartialCredit(t *testing.T) {
	gs := configuredGridJigsaw(t, 1, 3, 3)
	// 3-cycle among cells 0,1,2 (0->1->2->0); cells 3-8 already correct.
	jigsawSetCellOrder(gs, []int{1, 2, 0, 3, 4, 5, 6, 7, 8})
	gs.GameData["placed_count"] = 6 // cells 3-8

	gm := &GameManager{}
	gameOver, _, err := gm.processJigsawMove(gs, 1, "swap", map[string]interface{}{
		"cell_a": float64(1), "cell_b": float64(2),
	})
	if err != nil {
		t.Fatalf("swap: %v", err)
	}
	if gameOver {
		t.Error("expected the puzzle to not yet be complete after a partial-credit swap")
	}
	order := jigsawCellOrder(gs.GameData)
	if gbInt(order[2]) != 2 {
		t.Fatalf("expected cell 2 to become correct, got %v", order[2])
	}
	if gbInt(order[1]) == 1 {
		t.Fatal("expected cell 1 to still be incorrect after this particular swap")
	}
	if count := gbInt(gs.GameData["placed_count"]); count != 7 {
		t.Errorf("expected placed_count=7 (6 preset + 1 newly correct), got %d", count)
	}
	if placedBy := jigsawPlacedByMap(gs.GameData); gbInt(placedBy["1"]) != 1 {
		t.Errorf("expected player 1 credited with exactly 1, got %v", placedBy["1"])
	}
}

func TestJigsawSwapRejectsAlreadyCorrectCell(t *testing.T) {
	gs := configuredGridJigsaw(t, 1, 3, 3)
	jigsawSetCellOrder(gs, []int{0, 2, 1, 3, 4, 5, 6, 7, 8}) // pos0 already correct
	before := append([]interface{}{}, jigsawCellOrder(gs.GameData)...)

	gm := &GameManager{}
	if _, _, err := gm.processJigsawMove(gs, 1, "swap", map[string]interface{}{
		"cell_a": float64(0), "cell_b": float64(1),
	}); err == nil {
		t.Fatal("expected error: cannot swap an already-correct cell")
	}
	after := jigsawCellOrder(gs.GameData)
	for i := range before {
		if gbInt(before[i]) != gbInt(after[i]) {
			t.Fatalf("cell_order changed despite the rejected swap, at index %d: %v -> %v", i, before[i], after[i])
		}
	}
}

func TestJigsawSwapRejectsSameCell(t *testing.T) {
	gs := configuredGridJigsaw(t, 1, 3, 3)
	gm := &GameManager{}
	if _, _, err := gm.processJigsawMove(gs, 1, "swap", map[string]interface{}{
		"cell_a": float64(2), "cell_b": float64(2),
	}); err == nil {
		t.Fatal("expected error: cannot swap a cell with itself")
	}
}

func TestJigsawSwapRejectsOutOfRangeCells(t *testing.T) {
	gs := configuredGridJigsaw(t, 1, 3, 3) // 9 cells, valid indices 0-8
	gm := &GameManager{}
	if _, _, err := gm.processJigsawMove(gs, 1, "swap", map[string]interface{}{
		"cell_a": float64(-1), "cell_b": float64(0),
	}); err == nil {
		t.Error("expected error for negative cell index")
	}
	if _, _, err := gm.processJigsawMove(gs, 1, "swap", map[string]interface{}{
		"cell_a": float64(0), "cell_b": float64(9),
	}); err == nil {
		t.Error("expected error for cell index >= total")
	}
}

// TestJigsawSwapSequenceCompletesAndDeclaresTopPlacer drives a full 3x3 grid
// puzzle to completion via a real, hand-verified swap sequence (including a
// 3-cycle, which needs 2 swaps rather than 1) split across two players, then
// confirms the top scorer wins — the grid-mode equivalent of
// TestJigsawCompletionDeclaresTopPlacer.
func TestJigsawSwapSequenceCompletesAndDeclaresTopPlacer(t *testing.T) {
	gs := configuredGridJigsaw(t, 2, 3, 3)
	// Two independent 2-cycles (0<->1, 2<->3... wait, need 9 cells) plus one
	// 3-cycle: (0 1) (2 3) (4 5) (6 7 8) — hand-verified below.
	jigsawSetCellOrder(gs, []int{1, 0, 3, 2, 5, 4, 7, 8, 6})
	gs.GameData["placed_count"] = 0

	gm := &GameManager{}
	type step struct {
		actor      uint
		a, b       int
		wantDelta  int
		wantOver   bool
	}
	steps := []step{
		{1, 0, 1, 2, false}, // (0 1) both correct
		{1, 2, 3, 2, false}, // (2 3) both correct
		{1, 4, 5, 2, false}, // (4 5) both correct
		{1, 6, 7, 1, false}, // 3-cycle step 1: only cell 7 becomes correct
		{2, 6, 8, 2, true},  // 3-cycle step 2: both remaining cells correct — puzzle complete
	}
	var lastOver bool
	var lastWinner *uint
	for i, s := range steps {
		before := gbInt(gs.GameData["placed_count"])
		over, winner, err := gm.processJigsawMove(gs, s.actor, "swap", map[string]interface{}{
			"cell_a": float64(s.a), "cell_b": float64(s.b),
		})
		if err != nil {
			t.Fatalf("step %d swap(%d,%d): %v", i, s.a, s.b, err)
		}
		after := gbInt(gs.GameData["placed_count"])
		if after-before != s.wantDelta {
			t.Errorf("step %d: expected delta %d, got %d", i, s.wantDelta, after-before)
		}
		if over != s.wantOver {
			t.Errorf("step %d: expected gameOver=%v, got %v", i, s.wantOver, over)
		}
		lastOver, lastWinner = over, winner
	}

	if !lastOver {
		t.Fatal("expected the puzzle to complete after the final swap")
	}
	// Player 1 scored 2+2+2+1=7, player 2 scored 2 — player 1 should win.
	if lastWinner == nil || *lastWinner != 1 {
		t.Errorf("expected player 1 (7 correct placements) to win, got %v", lastWinner)
	}
	if count := gbInt(gs.GameData["placed_count"]); count != 9 {
		t.Errorf("expected placed_count=9 at completion, got %d", count)
	}
	if phase, _ := gs.GameData["phase"].(string); phase != "completed" {
		t.Errorf("expected phase 'completed', got %q", phase)
	}
}
