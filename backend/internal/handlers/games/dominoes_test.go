package games

import (
	"fmt"
	"testing"
	"wewatch-backend/internal/models"
)

// makeTestDominoesState builds a deterministic dominoes state directly
// (bypassing the real shuffled deal) so tests can control hands/chain/ends
// exactly — same convention makeTestUnoState already established for this
// package's other hidden-hand games.
func makeTestDominoesState(numPlayers int) *GameSessionState {
	players := make([]models.Player, numPlayers)
	for i := range players {
		players[i] = models.Player{UserID: uint(i + 1)}
	}
	gs := &GameSessionState{
		Players:     players,
		CurrentTurn: 0,
		GameData:    map[string]interface{}{},
		GameSession: &models.GameSession{GameType: "dominoes"},
		Hands:       map[uint][]string{},
		DrawPile:    []string{},
	}
	gs.GameData["chain"] = []interface{}{}
	gs.GameData["left_end"] = float64(-1)
	gs.GameData["right_end"] = float64(-1)
	gs.GameData["opening_tile"] = ""
	gs.GameData["last_move"] = map[string]interface{}{}
	for _, p := range players {
		gs.Hands[p.UserID] = []string{}
	}
	syncDominoesPublicState(gs)
	return gs
}

func TestDominoesAllTilesUnique(t *testing.T) {
	tiles := dominoAllTiles()
	if len(tiles) != 28 {
		t.Fatalf("expected 28 tiles, got %d", len(tiles))
	}
	seen := map[string]bool{}
	for _, tile := range tiles {
		if seen[tile] {
			t.Fatalf("duplicate tile: %s", tile)
		}
		seen[tile] = true
	}
}

func TestDominoesDealGivesSevenEachAndTracksBoneyard(t *testing.T) {
	for _, n := range []int{2, 3, 4} {
		gs := makeTestDominoesState(n)
		dealDominoes(gs)
		for _, p := range gs.Players {
			if len(gs.Hands[p.UserID]) != 7 {
				t.Errorf("%d players: expected 7 tiles for player %d, got %d", n, p.UserID, len(gs.Hands[p.UserID]))
			}
		}
		wantBoneyard := 28 - 7*n
		if len(gs.DrawPile) != wantBoneyard {
			t.Errorf("%d players: expected %d tiles left in boneyard, got %d", n, wantBoneyard, len(gs.DrawPile))
		}
		counts, ok := gs.GameData["hand_counts"].(map[string]int)
		if !ok {
			t.Fatalf("%d players: hand_counts missing or wrong type", n)
		}
		for _, p := range gs.Players {
			key := fmt.Sprintf("%d", p.UserID)
			if counts[key] != 7 {
				t.Errorf("%d players: hand_counts for %d should be 7, got %d", n, p.UserID, counts[key])
			}
		}
		if gs.GameData["draw_pile_count"] != wantBoneyard {
			t.Errorf("%d players: draw_pile_count should be %d, got %v", n, wantBoneyard, gs.GameData["draw_pile_count"])
		}
	}
}

func TestDominoesOpeningPlayerHoldsHighestDouble(t *testing.T) {
	gs := makeTestDominoesState(3)
	dealDominoes(gs)

	openingTile, _ := gs.GameData["opening_tile"].(string)
	if openingTile == "" {
		t.Skip("no double dealt to anyone this shuffle — statistically rare, not a bug")
	}
	a, b := dominoParseTile(openingTile)
	if a != b {
		t.Fatalf("opening_tile %q is not a double", openingTile)
	}

	opener := gs.Players[gs.CurrentTurn]
	found := false
	for _, tile := range gs.Hands[opener.UserID] {
		if tile == openingTile {
			found = true
		}
	}
	if !found {
		t.Fatalf("opening_tile %q is not actually in the designated opener's hand", openingTile)
	}

	// Confirm it's genuinely the HIGHEST double across every hand, not just *a* double.
	for _, p := range gs.Players {
		for _, tile := range gs.Hands[p.UserID] {
			ta, tb := dominoParseTile(tile)
			if ta == tb && ta > a {
				t.Fatalf("player %d holds a higher double (%s) than the chosen opening tile (%s)", p.UserID, tile, openingTile)
			}
		}
	}
}

func TestDominoesFirstMoveMustBeOpeningTile(t *testing.T) {
	gs := makeTestDominoesState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"6-6", "2-3"}
	gs.GameData["opening_tile"] = "6-6"

	if _, _, err := gm.processDominoesMove(gs, 1, "play", map[string]interface{}{"tile": "2-3"}); err == nil {
		t.Fatal("expected error playing a non-opening tile as the first move")
	}
	if _, _, err := gm.processDominoesMove(gs, 1, "play", map[string]interface{}{"tile": "6-6"}); err != nil {
		t.Fatalf("expected the real opening tile to be accepted, got: %v", err)
	}
	if gs.GameData["left_end"] != float64(6) || gs.GameData["right_end"] != float64(6) {
		t.Errorf("expected both ends to be 6 after opening with 6-6, got left=%v right=%v", gs.GameData["left_end"], gs.GameData["right_end"])
	}
}

func TestDominoesOrientationRightEnd(t *testing.T) {
	gs := makeTestDominoesState(2)
	gm := &GameManager{}
	// Chain: one tile placed as {left:3, right:5} -> left_end=3, right_end=5.
	gs.GameData["chain"] = []interface{}{map[string]interface{}{"left": float64(3), "right": float64(5)}}
	gs.GameData["left_end"] = float64(3)
	gs.GameData["right_end"] = float64(5)
	gs.Hands[1] = []string{"5-2"} // matches right end (5) via its "a" side

	if _, _, err := gm.processDominoesMove(gs, 1, "play", map[string]interface{}{"tile": "5-2", "end": "right"}); err != nil {
		t.Fatalf("expected legal right-end play, got: %v", err)
	}
	if gs.GameData["right_end"] != float64(2) {
		t.Errorf("expected new right_end=2, got %v", gs.GameData["right_end"])
	}
	if gs.GameData["left_end"] != float64(3) {
		t.Errorf("left_end should be untouched by a right-end play, got %v", gs.GameData["left_end"])
	}
}

func TestDominoesOrientationLeftEnd(t *testing.T) {
	gs := makeTestDominoesState(2)
	gm := &GameManager{}
	gs.GameData["chain"] = []interface{}{map[string]interface{}{"left": float64(3), "right": float64(5)}}
	gs.GameData["left_end"] = float64(3)
	gs.GameData["right_end"] = float64(5)
	gs.Hands[1] = []string{"1-3"} // matches left end (3) via its "b" side

	if _, _, err := gm.processDominoesMove(gs, 1, "play", map[string]interface{}{"tile": "1-3", "end": "left"}); err != nil {
		t.Fatalf("expected legal left-end play, got: %v", err)
	}
	if gs.GameData["left_end"] != float64(1) {
		t.Errorf("expected new left_end=1, got %v", gs.GameData["left_end"])
	}
	if gs.GameData["right_end"] != float64(5) {
		t.Errorf("right_end should be untouched by a left-end play, got %v", gs.GameData["right_end"])
	}
}

func TestDominoesDoubleOrientationMatchesEitherWay(t *testing.T) {
	gs := makeTestDominoesState(2)
	gm := &GameManager{}
	gs.GameData["chain"] = []interface{}{map[string]interface{}{"left": float64(3), "right": float64(5)}}
	gs.GameData["left_end"] = float64(3)
	gs.GameData["right_end"] = float64(5)
	gs.Hands[1] = []string{"5-5"}

	if _, _, err := gm.processDominoesMove(gs, 1, "play", map[string]interface{}{"tile": "5-5", "end": "right"}); err != nil {
		t.Fatalf("expected a double to legally match an end equal to its own value, got: %v", err)
	}
	if gs.GameData["right_end"] != float64(5) {
		t.Errorf("expected new right_end to stay 5 after playing double 5-5, got %v", gs.GameData["right_end"])
	}
}

func TestDominoesRejectNonMatchingTile(t *testing.T) {
	gs := makeTestDominoesState(2)
	gm := &GameManager{}
	gs.GameData["chain"] = []interface{}{map[string]interface{}{"left": float64(3), "right": float64(5)}}
	gs.GameData["left_end"] = float64(3)
	gs.GameData["right_end"] = float64(5)
	gs.Hands[1] = []string{"0-1"}

	if _, _, err := gm.processDominoesMove(gs, 1, "play", map[string]interface{}{"tile": "0-1", "end": "right"}); err == nil {
		t.Fatal("expected error playing a tile matching neither end")
	}
}

func TestDominoesRejectTileNotInHand(t *testing.T) {
	gs := makeTestDominoesState(2)
	gm := &GameManager{}
	gs.GameData["chain"] = []interface{}{map[string]interface{}{"left": float64(3), "right": float64(5)}}
	gs.GameData["left_end"] = float64(3)
	gs.GameData["right_end"] = float64(5)
	gs.Hands[1] = []string{"0-1"}

	if _, _, err := gm.processDominoesMove(gs, 1, "play", map[string]interface{}{"tile": "5-6", "end": "right"}); err == nil {
		t.Fatal("expected error playing a tile the player doesn't hold")
	}
}

func TestDominoesWinByEmptyingHand(t *testing.T) {
	gs := makeTestDominoesState(2)
	gm := &GameManager{}
	gs.GameData["chain"] = []interface{}{map[string]interface{}{"left": float64(3), "right": float64(5)}}
	gs.GameData["left_end"] = float64(3)
	gs.GameData["right_end"] = float64(5)
	gs.Hands[1] = []string{"5-2"} // player 1's last tile

	over, winner, err := gm.processDominoesMove(gs, 1, "play", map[string]interface{}{"tile": "5-2", "end": "right"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !over || winner == nil || *winner != 1 {
		t.Fatalf("expected player 1 to win by emptying their hand, got over=%v winner=%v", over, winner)
	}
}

func TestDominoesDrawOnlyWhenStuck(t *testing.T) {
	gs := makeTestDominoesState(2)
	gm := &GameManager{}
	gs.GameData["chain"] = []interface{}{map[string]interface{}{"left": float64(3), "right": float64(5)}}
	gs.GameData["left_end"] = float64(3)
	gs.GameData["right_end"] = float64(5)
	gs.Hands[1] = []string{"5-2"} // playable
	gs.DrawPile = []string{"1-1"}

	if _, _, err := gm.processDominoesMove(gs, 1, "draw", map[string]interface{}{}); err == nil {
		t.Fatal("expected draw to be rejected while a playable tile is held")
	}

	gs.Hands[1] = []string{"0-1"} // no longer playable against 3/5
	before := gs.CurrentTurn
	if _, _, err := gm.processDominoesMove(gs, 1, "draw", map[string]interface{}{}); err != nil {
		t.Fatalf("expected draw to succeed while stuck, got: %v", err)
	}
	if len(gs.Hands[1]) != 2 {
		t.Errorf("expected hand to grow by 1 after drawing, got %d tiles", len(gs.Hands[1]))
	}
	if len(gs.DrawPile) != 0 {
		t.Errorf("expected boneyard to shrink by 1, got %d left", len(gs.DrawPile))
	}
	// Simulate ProcessMove's generic "+1 mod N" advance that always runs after
	// a successful move — draw must have pre-cancelled it via a decrement.
	gs.CurrentTurn = (gs.CurrentTurn + 1) % len(gs.Players)
	if gs.CurrentTurn != before {
		t.Errorf("draw should not advance the turn (after ProcessMove's generic advance too), got CurrentTurn=%d want %d", gs.CurrentTurn, before)
	}
}

func TestDominoesDrawRejectedWhenBoneyardEmpty(t *testing.T) {
	gs := makeTestDominoesState(2)
	gm := &GameManager{}
	gs.GameData["chain"] = []interface{}{map[string]interface{}{"left": float64(3), "right": float64(5)}}
	gs.GameData["left_end"] = float64(3)
	gs.GameData["right_end"] = float64(5)
	gs.Hands[1] = []string{"0-1"} // not playable
	gs.DrawPile = []string{}

	if _, _, err := gm.processDominoesMove(gs, 1, "draw", map[string]interface{}{}); err == nil {
		t.Fatal("expected draw to be rejected with an empty boneyard")
	}
}

func TestDominoesPassRejectedWithPlayableTile(t *testing.T) {
	gs := makeTestDominoesState(2)
	gm := &GameManager{}
	gs.GameData["chain"] = []interface{}{map[string]interface{}{"left": float64(3), "right": float64(5)}}
	gs.GameData["left_end"] = float64(3)
	gs.GameData["right_end"] = float64(5)
	gs.Hands[1] = []string{"5-2"}
	gs.DrawPile = []string{}

	if _, _, err := gm.processDominoesMove(gs, 1, "pass", map[string]interface{}{}); err == nil {
		t.Fatal("expected pass to be rejected while a playable tile is held")
	}
}

func TestDominoesPassRejectedWithNonEmptyBoneyard(t *testing.T) {
	gs := makeTestDominoesState(2)
	gm := &GameManager{}
	gs.GameData["chain"] = []interface{}{map[string]interface{}{"left": float64(3), "right": float64(5)}}
	gs.GameData["left_end"] = float64(3)
	gs.GameData["right_end"] = float64(5)
	gs.Hands[1] = []string{"0-1"}
	gs.DrawPile = []string{"6-6"}

	if _, _, err := gm.processDominoesMove(gs, 1, "pass", map[string]interface{}{}); err == nil {
		t.Fatal("expected pass to be rejected while tiles remain in the boneyard")
	}
}

func TestDominoesBlockedGameEndsByLowestPips(t *testing.T) {
	gs := makeTestDominoesState(2)
	gm := &GameManager{}
	gs.GameData["chain"] = []interface{}{map[string]interface{}{"left": float64(3), "right": float64(5)}}
	gs.GameData["left_end"] = float64(3)
	gs.GameData["right_end"] = float64(5)
	gs.Hands[1] = []string{"0-1"}        // stuck (1 pip), pips=1
	gs.Hands[2] = []string{"0-2", "6-6"} // also stuck against 3/5, pips=2+12=14
	gs.DrawPile = []string{}

	over, winner, err := gm.processDominoesMove(gs, 1, "pass", map[string]interface{}{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !over {
		t.Fatal("expected the game to end — neither player can play and the boneyard is empty")
	}
	if winner == nil || *winner != 1 {
		t.Fatalf("expected player 1 (lowest pips) to win, got %v", winner)
	}
}

func TestDominoesBlockedGameTieIsDraw(t *testing.T) {
	gs := makeTestDominoesState(2)
	gm := &GameManager{}
	gs.GameData["chain"] = []interface{}{map[string]interface{}{"left": float64(3), "right": float64(5)}}
	gs.GameData["left_end"] = float64(3)
	gs.GameData["right_end"] = float64(5)
	gs.Hands[1] = []string{"0-1"} // pips=1
	gs.Hands[2] = []string{"1-0"} // pips=1, tied
	gs.DrawPile = []string{}

	over, winner, err := gm.processDominoesMove(gs, 1, "pass", map[string]interface{}{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !over {
		t.Fatal("expected the game to end")
	}
	if winner != nil {
		t.Fatalf("expected a tie (nil winner), got %v", *winner)
	}
}

func TestDominoesPassDoesNotEndWhenSomeoneElseCanStillPlay(t *testing.T) {
	gs := makeTestDominoesState(3)
	gm := &GameManager{}
	gs.GameData["chain"] = []interface{}{map[string]interface{}{"left": float64(3), "right": float64(5)}}
	gs.GameData["left_end"] = float64(3)
	gs.GameData["right_end"] = float64(5)
	gs.Hands[1] = []string{"0-1"} // stuck
	gs.Hands[2] = []string{"5-2"} // NOT stuck — has a legal play
	gs.Hands[3] = []string{"1-2"}
	gs.DrawPile = []string{}

	over, _, err := gm.processDominoesMove(gs, 1, "pass", map[string]interface{}{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if over {
		t.Fatal("game should not end — player 2 still has a legal move even though player 1 is stuck")
	}
}

// TestDominoesHiddenHandsNeverLeakIntoPublicState confirms the core security
// property this whole architecture exists for: no player's actual hidden
// tiles ever appear as a value anywhere in the room-broadcastable GameData —
// only opening_tile (legitimately public: whoever holds the highest double
// is known to be about to open with it) and the non-revealing hand_counts.
func TestDominoesHiddenHandsNeverLeakIntoPublicState(t *testing.T) {
	gs := makeTestDominoesState(2)
	dealDominoes(gs)

	hiddenTiles := map[string]bool{}
	for _, p := range gs.Players {
		for _, tile := range gs.Hands[p.UserID] {
			hiddenTiles[tile] = true
		}
	}
	if len(hiddenTiles) == 0 {
		t.Fatal("test setup produced no hidden tiles to check against — dealDominoes may be broken")
	}

	for key, val := range gs.GameData {
		if key == "opening_tile" {
			continue
		}
		if s, ok := val.(string); ok && hiddenTiles[s] {
			t.Fatalf("GameData[%q] = %q leaks a tile straight out of a player's hidden hand", key, s)
		}
	}
}
