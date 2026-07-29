package games

import (
	"fmt"
	"testing"
	"wewatch-backend/internal/models"
)

// makeTestBlackjackState builds a deterministic state directly (bypassing the
// real shuffled deal) so tests can control hands/dealer/shoe exactly.
func makeTestBlackjackState(numPlayers int) *GameSessionState {
	players := make([]models.Player, numPlayers)
	for i := range players {
		players[i] = models.Player{UserID: uint(i + 1)}
	}
	gs := &GameSessionState{
		Players:     players,
		CurrentTurn: 0,
		GameData:    map[string]interface{}{},
		GameSession: &models.GameSession{GameType: "blackjack"},
		Hands:       map[uint][]string{},
		DrawPile:    []string{"2H", "3H", "4H", "5H", "6H", "7H", "8H", "9H", "10H", "AH"},
	}
	gs.GameData["dealer_hand"] = []string{"7C", "6C"}
	gs.GameData["dealer_visible"] = "7C"
	gs.GameData["phase"] = "player_turns"
	statuses := map[string]interface{}{}
	for _, p := range players {
		gs.Hands[p.UserID] = []string{}
		statuses[fmt.Sprintf("%d", p.UserID)] = "playing"
	}
	gs.GameData["player_statuses"] = statuses
	syncBlackjackPublicState(gs)
	return gs
}

// TestBlackjackDoubleRestrictedToFirstTwoCards: doubling down must only be
// legal on the player's original two cards — never after they've already
// hit. Nothing enforced this before.
func TestBlackjackDoubleRestrictedToFirstTwoCards(t *testing.T) {
	gs := makeTestBlackjackState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"5H", "5C"} // 2 cards
	gs.Hands[2] = []string{"9C", "8D"}

	if _, _, err := gm.processBlackjackMove(gs, 1, "hit", map[string]interface{}{}); err != nil {
		t.Fatalf("hit: %v", err)
	}
	if len(gs.Hands[1]) != 3 {
		t.Fatalf("expected 3 cards after hit, got %d", len(gs.Hands[1]))
	}

	if _, _, err := gm.processBlackjackMove(gs, 1, "double", map[string]interface{}{}); err == nil {
		t.Fatal("expected error doubling down after already hitting")
	}
}

// TestBlackjackDoubleAllowedOnFirstTwoCards: doubling is legal with exactly
// 2 cards, draws exactly one more, and always ends the player's turn.
func TestBlackjackDoubleAllowedOnFirstTwoCards(t *testing.T) {
	gs := makeTestBlackjackState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"5H", "5C"}
	gs.Hands[2] = []string{"9C", "8D"}

	if _, _, err := gm.processBlackjackMove(gs, 1, "double", map[string]interface{}{}); err != nil {
		t.Fatalf("double should be legal on first two cards: %v", err)
	}
	if len(gs.Hands[1]) != 3 {
		t.Errorf("expected exactly 3 cards after doubling, got %d", len(gs.Hands[1]))
	}
	statuses := blackjackStatuses(gs)
	st, _ := statuses["1"].(string)
	if st != "stood" && st != "bust" {
		t.Errorf("expected status 'stood' or 'bust' after doubling, got %q", st)
	}
}

// TestBlackjackBustOnHit: hitting past 21 marks the player bust and advances
// the turn to the next active player.
func TestBlackjackBustOnHit(t *testing.T) {
	gs := makeTestBlackjackState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"KH", "QC"} // 20
	gs.Hands[2] = []string{"9C", "8D"}
	gs.DrawPile = []string{"5S"} // blackjackDrawCard pops from the end

	if _, _, err := gm.processBlackjackMove(gs, 1, "hit", map[string]interface{}{}); err != nil {
		t.Fatalf("hit: %v", err)
	}
	statuses := blackjackStatuses(gs)
	st, _ := statuses["1"].(string)
	if st != "bust" {
		t.Errorf("expected player 1 to be bust (20+5=25), got %q", st)
	}
	if gs.CurrentTurn != 1 {
		t.Errorf("expected turn to advance to player 2 (index 1), got %d", gs.CurrentTurn)
	}
}

// TestBlackjackSettleWinLossPush: a full 3-player round settles win/push/loss
// correctly against the dealer's final hand.
func TestBlackjackSettleWinLossPush(t *testing.T) {
	gs := makeTestBlackjackState(3)
	gm := &GameManager{}
	gs.Hands[1] = []string{"KH", "9C"}                // 19 — beats the dealer's 17
	gs.Hands[2] = []string{"KH", "7C"}                // 17 — pushes with the dealer
	gs.Hands[3] = []string{"KH", "5C"}                // 15 — will bust on the hit below
	gs.GameData["dealer_hand"] = []string{"KC", "7S"} // 17, stands (>=17, no more draws needed)
	gs.GameData["dealer_visible"] = "KC"
	gs.DrawPile = []string{"KD"} // player 3's hit card: 15+10=25 -> bust

	if _, _, err := gm.processBlackjackMove(gs, 1, "stand", map[string]interface{}{}); err != nil {
		t.Fatalf("p1 stand: %v", err)
	}
	if _, _, err := gm.processBlackjackMove(gs, 2, "stand", map[string]interface{}{}); err != nil {
		t.Fatalf("p2 stand: %v", err)
	}
	gameOver, winnerID, err := gm.processBlackjackMove(gs, 3, "hit", map[string]interface{}{})
	if err != nil {
		t.Fatalf("p3 hit: %v", err)
	}
	if !gameOver {
		t.Fatal("expected game to be over once all players finished")
	}
	if winnerID == nil || *winnerID != 1 {
		t.Errorf("expected player 1 to be the sole winner, got %v", winnerID)
	}

	statuses := blackjackStatuses(gs)
	if s, _ := statuses["1"].(string); s != "won" {
		t.Errorf("player 1 should have won, got %q", s)
	}
	if s, _ := statuses["2"].(string); s != "push" {
		t.Errorf("player 2 should have pushed, got %q", s)
	}
	if s, _ := statuses["3"].(string); s != "lost" {
		t.Errorf("player 3 should have lost (bust), got %q", s)
	}
	if phase, _ := gs.GameData["phase"].(string); phase != "results" {
		t.Errorf("expected phase 'results', got %q", phase)
	}
}

// TestBlackjackPublicStateHidesDealerHoleCard: the real fix — dealer_hand
// must be stripped from the broadcast payload during player_turns, and
// present once revealed. Before blackjackPublicState existed, blackjack had
// no entry in publicGameData's switch at all, so the full dealer hand
// (including the hole card) went out to every client the entire game.
func TestBlackjackPublicStateHidesDealerHoleCard(t *testing.T) {
	gs := makeTestBlackjackState(2)
	gs.GameData["phase"] = "player_turns"

	pub := blackjackPublicState(gs.GameData)
	if _, present := pub["dealer_hand"]; present {
		t.Error("dealer_hand must not be present in the broadcast during player_turns")
	}
	// The original GameData must be untouched — the server still needs the
	// real dealer_hand to settle the round.
	if _, present := gs.GameData["dealer_hand"]; !present {
		t.Error("dealer_hand must still exist on the real GameData")
	}

	for _, phase := range []string{"dealer_turn", "results"} {
		gs.GameData["phase"] = phase
		pub := blackjackPublicState(gs.GameData)
		if _, present := pub["dealer_hand"]; !present {
			t.Errorf("dealer_hand should be present in the broadcast during phase %q", phase)
		}
	}
}

// TestBlackjackIsNatural: a natural blackjack is exactly 21 on exactly 2 cards.
func TestBlackjackIsNatural(t *testing.T) {
	cases := []struct {
		hand []string
		want bool
	}{
		{[]string{"AH", "KC"}, true},        // 11+10=21, natural
		{[]string{"AH", "10C"}, true},       // 11+10=21, natural
		{[]string{"7H", "7C", "7S"}, false}, // 21 but on 3 cards — not a natural
		{[]string{"10H", "10C"}, false},     // 20, not 21
		{[]string{"AH", "AC"}, false},       // 12 (one ace demoted), not 21
	}
	for _, c := range cases {
		if got := blackjackIsNatural(c.hand); got != c.want {
			t.Errorf("blackjackIsNatural(%v) = %v, want %v", c.hand, got, c.want)
		}
	}
}

// TestBlackjackNaturalLockedOutOfTurnOrder: a player dealt a natural gets
// status "blackjack" (not "playing"), is skipped by the starting turn, and
// can't hit/stand/double — matching real rules that never let you act past
// an already-maximum hand.
func TestBlackjackNaturalLockedOutOfTurnOrder(t *testing.T) {
	gs := makeTestBlackjackState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"AH", "KC"} // natural
	gs.Hands[2] = []string{"9C", "8D"} // ordinary 17

	blackjackApplyDealResults(gs)

	statuses := blackjackStatuses(gs)
	if s, _ := statuses["1"].(string); s != "blackjack" {
		t.Errorf("player 1 should have status 'blackjack', got %q", s)
	}
	if s, _ := statuses["2"].(string); s != "playing" {
		t.Errorf("player 2 should have status 'playing', got %q", s)
	}
	if gs.CurrentTurn != 1 {
		t.Errorf("turn should start on player 2 (index 1, the only one who can act), got %d", gs.CurrentTurn)
	}

	if _, _, err := gm.processBlackjackMove(gs, 1, "hit", map[string]interface{}{}); err == nil {
		t.Error("expected error: a natural blackjack player should not be able to hit")
	}
	if _, _, err := gm.processBlackjackMove(gs, 1, "double", map[string]interface{}{}); err == nil {
		t.Error("expected error: a natural blackjack player should not be able to double")
	}
}

// TestBlackjackAllNaturalsSettleImmediately: the rare edge case where every
// player is dealt a natural — the round must settle right away instead of
// soft-locking in "player_turns" with nobody able to act.
func TestBlackjackAllNaturalsSettleImmediately(t *testing.T) {
	gs := makeTestBlackjackState(2)
	gs.Hands[1] = []string{"AH", "KC"}                // natural
	gs.Hands[2] = []string{"AC", "KD"}                // also natural
	gs.GameData["dealer_hand"] = []string{"9C", "8S"} // 17, no natural

	blackjackApplyDealResults(gs)

	if phase, _ := gs.GameData["phase"].(string); phase != "results" {
		t.Errorf("expected the round to settle immediately, phase=%q", phase)
	}
	statuses := blackjackStatuses(gs)
	if s, _ := statuses["1"].(string); s != "won" {
		t.Errorf("player 1's natural should beat the dealer's 17, got %q", s)
	}
	if s, _ := statuses["2"].(string); s != "won" {
		t.Errorf("player 2's natural should beat the dealer's 17, got %q", s)
	}
}

// TestBlackjackNaturalPushesAgainstDealerNatural: if the dealer also ends up
// at 21, a player's natural pushes rather than wins — the existing settle
// math already handles this correctly once the natural's value (locked at
// 21 the whole time) reaches it, with no special-casing needed for the
// "natural vs natural" case specifically.
func TestBlackjackNaturalPushesAgainstDealerNatural(t *testing.T) {
	gs := makeTestBlackjackState(2)
	gm := &GameManager{}
	gs.Hands[1] = []string{"AH", "KC"}                // natural, locked at 21
	gs.Hands[2] = []string{"9C", "8D"}                // 17
	gs.GameData["dealer_hand"] = []string{"AC", "KD"} // dealer also has a natural 21

	blackjackApplyDealResults(gs) // player 1 -> "blackjack" status, player 2 still "playing"
	if _, _, err := gm.processBlackjackMove(gs, 2, "stand", map[string]interface{}{}); err != nil {
		t.Fatalf("player 2 stand: %v", err) // this is what actually triggers the settle
	}

	statuses := blackjackStatuses(gs)
	if s, _ := statuses["1"].(string); s != "push" {
		t.Errorf("player 1's natural should push against the dealer's natural, got %q", s)
	}
	if s, _ := statuses["2"].(string); s != "lost" {
		t.Errorf("player 2's 17 should lose to the dealer's 21, got %q", s)
	}
}
