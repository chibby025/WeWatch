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
