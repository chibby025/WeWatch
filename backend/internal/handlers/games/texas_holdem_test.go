package games

import (
	"fmt"
	"testing"
	"wewatch-backend/internal/models"
)

func makeTestTexasHoldemState(numPlayers int) *GameSessionState {
	players := make([]models.Player, numPlayers)
	for i := range players {
		players[i] = models.Player{UserID: uint(i + 1)}
	}
	gs := &GameSessionState{
		Players:     players,
		CurrentTurn: 0,
		GameData:    map[string]interface{}{},
		GameSession: &models.GameSession{GameType: "texas_holdem"},
	}
	return gs
}

// ---- hand evaluation -----------------------------------------------------------

func TestTexasEvaluate5_Categories(t *testing.T) {
	cases := []struct {
		name string
		hand []string
		cat  int
	}{
		{"high card", []string{"2S", "5H", "9D", "JC", "AS"}, 0},
		{"pair", []string{"5S", "5H", "9D", "JC", "AS"}, 1},
		{"two pair", []string{"5S", "5H", "9D", "9C", "AS"}, 2},
		{"three of a kind", []string{"5S", "5H", "5D", "JC", "AS"}, 3},
		{"straight", []string{"5S", "6H", "7D", "8C", "9S"}, 4},
		{"wheel straight", []string{"AS", "2H", "3D", "4C", "5S"}, 4},
		{"flush", []string{"2S", "5S", "9S", "JS", "AS"}, 5},
		{"full house", []string{"5S", "5H", "5D", "9C", "9S"}, 6},
		{"four of a kind", []string{"5S", "5H", "5D", "5C", "AS"}, 7},
		{"straight flush", []string{"5S", "6S", "7S", "8S", "9S"}, 8},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			cat, _ := texasEvaluate5(c.hand)
			if cat != c.cat {
				t.Errorf("%v: expected category %d, got %d", c.hand, c.cat, cat)
			}
		})
	}
}

func TestTexasWheelStraightRanksBelowSixHighStraight(t *testing.T) {
	wheel, _ := texasEvaluate5([]string{"AS", "2H", "3D", "4C", "5S"})
	_, wheelTB := texasEvaluate5([]string{"AS", "2H", "3D", "4C", "5S"})
	sixHigh, _ := texasEvaluate5([]string{"2S", "3H", "4D", "5C", "6S"})
	_, sixHighTB := texasEvaluate5([]string{"2S", "3H", "4D", "5C", "6S"})
	if wheel != 4 || sixHigh != 4 {
		t.Fatalf("expected both to be category 4 (straight), got %d and %d", wheel, sixHigh)
	}
	if texasCompareTiebreak(wheelTB, sixHighTB) >= 0 {
		t.Errorf("expected wheel (5-high) to rank below 6-high straight, wheelTB=%v sixHighTB=%v", wheelTB, sixHighTB)
	}
}

func TestTexasStraightFlushBeatsFourOfAKind(t *testing.T) {
	sf, _ := texasEvaluate5([]string{"5S", "6S", "7S", "8S", "9S"})
	quad, _ := texasEvaluate5([]string{"AS", "AH", "AD", "AC", "KS"})
	if sf <= quad {
		t.Errorf("expected straight flush (%d) to outrank four of a kind (%d)", sf, quad)
	}
}

func TestTexasFlushBeatsStraight(t *testing.T) {
	flush, _ := texasEvaluate5([]string{"2S", "6S", "9S", "JS", "AS"})
	straight, _ := texasEvaluate5([]string{"5H", "6D", "7C", "8S", "9H"})
	if flush <= straight {
		t.Errorf("expected flush (%d) to outrank straight (%d)", flush, straight)
	}
}

func TestTexasKickersBreakTies(t *testing.T) {
	// Both pair of 5s; hand A's kickers (A,K,Q) beat hand B's (A,K,J).
	_, tbA := texasEvaluate5([]string{"5S", "5H", "AS", "KH", "QD"})
	_, tbB := texasEvaluate5([]string{"5D", "5C", "AH", "KD", "JS"})
	if texasCompareTiebreak(tbA, tbB) <= 0 {
		t.Errorf("expected hand A's better kicker to win: tbA=%v tbB=%v", tbA, tbB)
	}
}

func TestTexasBestOf7FindsBestFive(t *testing.T) {
	// 2 hole cards are junk; the best hand is entirely from the 5 community
	// cards, which already make a straight flush.
	cards := []string{"2H", "7D", "5S", "6S", "7S", "8S", "9S"}
	cat, _ := texasBestOf7(cards)
	if cat != 8 {
		t.Errorf("expected straight flush (8) found among the 7 cards, got category %d", cat)
	}
}

func TestTexasBestOf7UsesHoleCardsWhenBetter(t *testing.T) {
	// Hole cards form a pair of aces; community is unrelated low cards —
	// best hand should be the pair, not high-card community cards alone.
	cards := []string{"AS", "AH", "2D", "5C", "7H", "9D", "JC"}
	cat, tb := texasBestOf7(cards)
	if cat != 1 {
		t.Fatalf("expected a pair (1), got category %d", cat)
	}
	if tb[0] != 14 {
		t.Errorf("expected the pair to be aces (14), got %v", tb)
	}
}

// ---- hand setup / blinds -------------------------------------------------------

func TestTexasInitialDealPostsBlindsAndDealsCards(t *testing.T) {
	gs := makeTestTexasHoldemState(3)
	ensureTexasHoldemState(gs)

	sb := texasIntField(gs.GameData, "small_blind")
	bb := texasIntField(gs.GameData, "big_blind")
	if sb != 10 || bb != 20 {
		t.Errorf("expected starting blinds 10/20, got %d/%d", sb, bb)
	}
	pot := texasIntField(gs.GameData, "pot")
	if pot != sb+bb {
		t.Errorf("expected pot = sb+bb = %d, got %d", sb+bb, pot)
	}
	for i := 0; i < 3; i++ {
		hand := gs.Hands[gs.Players[i].UserID]
		if len(hand) != 2 {
			t.Errorf("player %d: expected 2 hole cards, got %d", i, len(hand))
		}
	}
	actionOn := texasIntField(gs.GameData, "action_on")
	if actionOn < 0 || actionOn >= 3 {
		t.Errorf("expected a valid action_on, got %d", actionOn)
	}
}

func TestTexasHeadsUpButtonActsFirstPreflop(t *testing.T) {
	gs := makeTestTexasHoldemState(2)
	ensureTexasHoldemState(gs)

	dealerIdx := texasIntField(gs.GameData, "dealer_idx")
	actionOn := texasIntField(gs.GameData, "action_on")
	if actionOn != dealerIdx {
		t.Errorf("expected the button (%d) to act first preflop heads-up, got action_on=%d", dealerIdx, actionOn)
	}
	// Button posts the small blind heads-up.
	sbBet := texasCurrentBet(gs.GameData, dealerIdx)
	if sbBet != texasIntField(gs.GameData, "small_blind") {
		t.Errorf("expected the button to have posted the small blind, got bet=%d", sbBet)
	}
}

func TestTexasBlindsEscalateOverHands(t *testing.T) {
	sb1, bb1 := texasBlindsForHandNumber(1)
	sb2, bb2 := texasBlindsForHandNumber(texasBlindEscalationHands + 1)
	if bb2 != bb1*2 || sb2 != sb1*2 {
		t.Errorf("expected blinds to double after %d hands: hand1=%d/%d hand%d=%d/%d",
			texasBlindEscalationHands, sb1, bb1, texasBlindEscalationHands+1, sb2, bb2)
	}
}

// ---- betting actions -----------------------------------------------------------

func TestTexasCannotCheckFacingABet(t *testing.T) {
	gs := makeTestTexasHoldemState(3)
	gm := &GameManager{}
	ensureTexasHoldemState(gs)
	actionOn := texasIntField(gs.GameData, "action_on")

	_, _, err := gm.processTexasHoldemMove(gs, gs.Players[actionOn].UserID, "check", map[string]interface{}{})
	if err == nil {
		t.Fatal("expected error: can't check facing the big blind preflop")
	}
}

func TestTexasCallMatchesBet(t *testing.T) {
	gs := makeTestTexasHoldemState(3)
	gm := &GameManager{}
	ensureTexasHoldemState(gs)
	actionOn := texasIntField(gs.GameData, "action_on")
	before := texasChips(gs.GameData, actionOn)
	bb := texasIntField(gs.GameData, "big_blind")

	_, _, err := gm.processTexasHoldemMove(gs, gs.Players[actionOn].UserID, "call", map[string]interface{}{})
	if err != nil {
		t.Fatalf("call: %v", err)
	}
	after := texasChips(gs.GameData, actionOn)
	if before-after != bb {
		t.Errorf("expected UTG to pay the full big blind (%d) to call, paid %d", bb, before-after)
	}
}

func TestTexasNotYourTurnRejected(t *testing.T) {
	gs := makeTestTexasHoldemState(3)
	gm := &GameManager{}
	ensureTexasHoldemState(gs)
	actionOn := texasIntField(gs.GameData, "action_on")
	notActing := (actionOn + 1) % 3

	_, _, err := gm.processTexasHoldemMove(gs, gs.Players[notActing].UserID, "fold", map[string]interface{}{})
	if err == nil {
		t.Fatal("expected error: not your turn")
	}
}

func TestTexasMinRaiseEnforced(t *testing.T) {
	gs := makeTestTexasHoldemState(3)
	gm := &GameManager{}
	ensureTexasHoldemState(gs)
	actionOn := texasIntField(gs.GameData, "action_on")
	bb := texasIntField(gs.GameData, "big_blind")

	// Raising to bb+1 (less than a full extra big blind) should be rejected.
	_, _, err := gm.processTexasHoldemMove(gs, gs.Players[actionOn].UserID, "raise", map[string]interface{}{"amount": float64(bb + 1)})
	if err == nil {
		t.Fatal("expected error: raise below the minimum")
	}
	// Raising to 2x the big blind (a legal min-raise) should succeed.
	_, _, err = gm.processTexasHoldemMove(gs, gs.Players[actionOn].UserID, "raise", map[string]interface{}{"amount": float64(bb * 2)})
	if err != nil {
		t.Fatalf("expected a legal min-raise to succeed: %v", err)
	}
}

func TestTexasRaiseReopensAction(t *testing.T) {
	gs := makeTestTexasHoldemState(3)
	gm := &GameManager{}
	ensureTexasHoldemState(gs)
	utg := texasIntField(gs.GameData, "action_on")

	if _, _, err := gm.processTexasHoldemMove(gs, gs.Players[utg].UserID, "call", map[string]interface{}{}); err != nil {
		t.Fatalf("utg call: %v", err)
	}
	dealerIdx := texasIntField(gs.GameData, "dealer_idx")
	sbIdx := texasNextActiveFrom(gs, dealerIdx)
	if _, _, err := gm.processTexasHoldemMove(gs, gs.Players[sbIdx].UserID, "raise", map[string]interface{}{"amount": float64(60)}); err != nil {
		t.Fatalf("sb raise: %v", err)
	}
	// UTG already acted (called) but must act again after the raise.
	actedUTG := texasMapBoolGet(gs.GameData, "acted_this_round", intToStr(utg))
	if actedUTG {
		t.Error("expected UTG's acted flag to be cleared by the reopening raise")
	}
}

// ---- round/phase progression ----------------------------------------------------

func TestTexasRoundCompletesAndDealsFlop(t *testing.T) {
	gs := makeTestTexasHoldemState(2)
	gm := &GameManager{}
	ensureTexasHoldemState(gs)
	// Heads-up: button/SB acts first preflop.
	button := texasIntField(gs.GameData, "action_on")
	other := texasNextActiveFrom(gs, button)

	if _, _, err := gm.processTexasHoldemMove(gs, gs.Players[button].UserID, "call", map[string]interface{}{}); err != nil {
		t.Fatalf("button call: %v", err)
	}
	if _, _, err := gm.processTexasHoldemMove(gs, gs.Players[other].UserID, "check", map[string]interface{}{}); err != nil {
		t.Fatalf("bb check: %v", err)
	}
	phase, _ := gs.GameData["phase"].(string)
	if phase != "flop" {
		t.Fatalf("expected phase 'flop' after preflop completes, got %q", phase)
	}
	community := backgammonIntSliceToStrings(gs.GameData["community_cards"])
	if len(community) != 3 {
		t.Errorf("expected 3 flop cards, got %d", len(community))
	}
}

func TestTexasUncontestedPotOnFold(t *testing.T) {
	gs := makeTestTexasHoldemState(2)
	gm := &GameManager{}
	ensureTexasHoldemState(gs)
	button := texasIntField(gs.GameData, "action_on")
	other := texasNextActiveFrom(gs, button)
	otherBefore := texasChips(gs.GameData, other)
	potBefore := texasIntField(gs.GameData, "pot")

	_, _, err := gm.processTexasHoldemMove(gs, gs.Players[button].UserID, "fold", map[string]interface{}{})
	if err != nil {
		t.Fatalf("fold: %v", err)
	}
	phase, _ := gs.GameData["phase"].(string)
	if phase != "hand_complete" {
		t.Errorf("expected phase=hand_complete to rest after an uncontested win (next hand requires an explicit next_hand move), got %q", phase)
	}
	otherAfter := texasChips(gs.GameData, other)
	if otherAfter <= otherBefore {
		t.Errorf("expected the non-folding player to have won the pot (%d), chips went from %d to %d", potBefore, otherBefore, otherAfter)
	}
}

// ---- side pots -------------------------------------------------------------------

func TestTexasSidePotSplitsCorrectlyOnUnevenAllIn(t *testing.T) {
	gs := makeTestTexasHoldemState(3)
	// Manually set up contributions: player 0 all-in for 100, players 1&2
	// each contributed 300 total (100 matches the side pot layer, 200 more
	// goes into a side pot only 1&2 can win).
	for i := 0; i < 3; i++ {
		gs.GameData["busted"] = map[string]interface{}{}
	}
	ensureTexasHoldemState(gs) // seed busted/chips maps, then overwrite below
	texasMapIntSet(gs.GameData, "total_bets_this_hand", "0", 100)
	texasMapIntSet(gs.GameData, "total_bets_this_hand", "1", 300)
	texasMapIntSet(gs.GameData, "total_bets_this_hand", "2", 300)

	pots := texasComputeSidePots(gs, []int{0, 1, 2}) // all 3 reached showdown (none folded)
	if len(pots) != 2 {
		t.Fatalf("expected 2 pots (main + side), got %d: %+v", len(pots), pots)
	}
	if pots[0].Amount != 300 { // 100*3 contributors at the first layer
		t.Errorf("expected main pot 300, got %d", pots[0].Amount)
	}
	if len(pots[0].Eligible) != 3 {
		t.Errorf("expected all 3 players eligible for the main pot, got %v", pots[0].Eligible)
	}
	if pots[1].Amount != 400 { // (300-100)*2 contributors at the second layer
		t.Errorf("expected side pot 400, got %d", pots[1].Amount)
	}
	for _, idx := range pots[1].Eligible {
		if idx == 0 {
			t.Error("player 0 (all-in for less) should NOT be eligible for the side pot")
		}
	}
}

func TestTexasSidePotExcludesFoldedPlayerFromEligibilityButKeepsChips(t *testing.T) {
	gs := makeTestTexasHoldemState(3)
	ensureTexasHoldemState(gs)
	texasMapIntSet(gs.GameData, "total_bets_this_hand", "0", 200)
	texasMapIntSet(gs.GameData, "total_bets_this_hand", "1", 200)
	texasMapIntSet(gs.GameData, "total_bets_this_hand", "2", 200)

	// Player 1 folded — contributed chips stay in the pot, but they can't win it.
	pots := texasComputeSidePots(gs, []int{0, 2})
	if len(pots) != 1 {
		t.Fatalf("expected a single pot (everyone contributed the same amount), got %d", len(pots))
	}
	if pots[0].Amount != 600 {
		t.Errorf("expected pot 600 (200*3, including the folded player's chips), got %d", pots[0].Amount)
	}
	for _, idx := range pots[0].Eligible {
		if idx == 1 {
			t.Error("folded player should not be eligible to win the pot")
		}
	}
}

// ---- busting / tournament end ----------------------------------------------------

func TestTexasBustAtZeroChips(t *testing.T) {
	gs := makeTestTexasHoldemState(3)
	gm := &GameManager{}
	ensureTexasHoldemState(gs)
	texasSetChips(gs.GameData, 0, 0)

	gameOver, _, err := gm.texasEndHand(gs)
	if err != nil {
		t.Fatalf("end hand: %v", err)
	}
	if gameOver {
		t.Fatal("expected the tournament to continue — 2 players still have chips")
	}
	if !texasIsBusted(gs.GameData, 0) {
		t.Error("expected player 0 to be marked busted at 0 chips")
	}
}

func TestTexasTournamentEndsWithOnePlayerLeft(t *testing.T) {
	gs := makeTestTexasHoldemState(2)
	gm := &GameManager{}
	ensureTexasHoldemState(gs)
	texasSetChips(gs.GameData, 0, 0)

	gameOver, winnerID, err := gm.texasEndHand(gs)
	if err != nil {
		t.Fatalf("end hand: %v", err)
	}
	if !gameOver {
		t.Fatal("expected the tournament to be over — only 1 player has chips")
	}
	if winnerID == nil || *winnerID != 2 { // player index 1 = UserID 2
		t.Errorf("expected player UserID 2 to win, got %v", winnerID)
	}
}

func TestTexasBustedPlayerRejectedFromActing(t *testing.T) {
	gs := makeTestTexasHoldemState(3)
	gm := &GameManager{}
	ensureTexasHoldemState(gs)
	texasMapBoolSet(gs.GameData, "busted", "0", true)

	_, _, err := gm.processTexasHoldemMove(gs, gs.Players[0].UserID, "fold", map[string]interface{}{})
	if err == nil {
		t.Fatal("expected error: busted player can't act")
	}
}

// ---- showdown reveal -------------------------------------------------------------

func TestTexasShowdownRevealsContenderHands(t *testing.T) {
	gs := makeTestTexasHoldemState(2)
	gm := &GameManager{}
	ensureTexasHoldemState(gs)

	p0Hole := append([]string{}, gs.Hands[gs.Players[0].UserID]...)
	p1Hole := append([]string{}, gs.Hands[gs.Players[1].UserID]...)

	button := texasIntField(gs.GameData, "action_on")
	other := texasNextActiveFrom(gs, button)
	if _, _, err := gm.processTexasHoldemMove(gs, gs.Players[button].UserID, "call", map[string]interface{}{}); err != nil {
		t.Fatalf("preflop call: %v", err)
	}
	if _, _, err := gm.processTexasHoldemMove(gs, gs.Players[other].UserID, "check", map[string]interface{}{}); err != nil {
		t.Fatalf("preflop check: %v", err)
	}
	for _, street := range []string{"flop", "turn", "river"} {
		a1 := texasIntField(gs.GameData, "action_on")
		if _, _, err := gm.processTexasHoldemMove(gs, gs.Players[a1].UserID, "check", map[string]interface{}{}); err != nil {
			t.Fatalf("%s check 1: %v", street, err)
		}
		a2 := texasIntField(gs.GameData, "action_on")
		if _, _, err := gm.processTexasHoldemMove(gs, gs.Players[a2].UserID, "check", map[string]interface{}{}); err != nil {
			t.Fatalf("%s check 2: %v", street, err)
		}
	}

	revealed, ok := gs.GameData["revealed_hands"].(map[string]interface{})
	if !ok {
		t.Fatal("expected revealed_hands to be populated after a genuine showdown")
	}
	for idx, expectedHole := range map[int][]string{0: p0Hole, 1: p1Hole} {
		raw, ok := revealed[intToStr(idx)]
		if !ok {
			t.Fatalf("expected player %d's hand to be revealed", idx)
		}
		arr, ok := raw.([]interface{})
		if !ok || len(arr) != 2 {
			t.Fatalf("expected 2 revealed cards for player %d, got %v", idx, raw)
		}
		if arr[0] != expectedHole[0] || arr[1] != expectedHole[1] {
			t.Errorf("player %d: revealed hand %v doesn't match dealt hand %v", idx, arr, expectedHole)
		}
	}
}

func TestTexasUncontestedFoldDoesNotRevealHands(t *testing.T) {
	gs := makeTestTexasHoldemState(2)
	gm := &GameManager{}
	ensureTexasHoldemState(gs)
	button := texasIntField(gs.GameData, "action_on")

	if _, _, err := gm.processTexasHoldemMove(gs, gs.Players[button].UserID, "fold", map[string]interface{}{}); err != nil {
		t.Fatalf("fold: %v", err)
	}
	revealed, _ := gs.GameData["revealed_hands"].(map[string]interface{})
	if len(revealed) != 0 {
		t.Errorf("expected no revealed hands after winning uncontested by fold, got %v", revealed)
	}
}

func intToStr(i int) string {
	return fmt.Sprintf("%d", i)
}

// texasTotalChipsInPlay sums pot + every player's remaining stack. Wagered
// chips are already reflected in "pot" the moment a bet/call/raise/blind is
// posted (see texasPostBlind/texasProcessCall/texasProcessRaise all adding
// directly to gameData["pot"]), so current_bets must NOT be added again here
// — it's a same-round bookkeeping label for money already counted in pot,
// not a separate pool.
func texasTotalChipsInPlay(gs *GameSessionState) int {
	total := texasIntField(gs.GameData, "pot")
	for i := range gs.Players {
		total += texasChips(gs.GameData, i)
	}
	return total
}

// TestTexasFullHandEndToEnd plays a complete heads-up hand through every
// street via real move calls (not direct state manipulation), checking that
// total chips in play are conserved throughout (a strong sanity invariant —
// chips can only move between players/pot, never vanish or duplicate) and
// that the game correctly progresses preflop -> flop -> turn -> river ->
// showdown -> a fresh next hand.
func TestTexasFullHandEndToEnd(t *testing.T) {
	gs := makeTestTexasHoldemState(2)
	gm := &GameManager{}
	ensureTexasHoldemState(gs)

	expectedTotal := 2 * texasStartingChips
	checkTotal := func(label string) {
		t.Helper()
		got := texasTotalChipsInPlay(gs)
		if got != expectedTotal {
			t.Fatalf("%s: chip conservation broken — expected %d total, got %d", label, expectedTotal, got)
		}
	}
	checkTotal("after initial deal")

	button := texasIntField(gs.GameData, "action_on")
	other := texasNextActiveFrom(gs, button)

	// Preflop: button calls, other checks.
	if _, _, err := gm.processTexasHoldemMove(gs, gs.Players[button].UserID, "call", map[string]interface{}{}); err != nil {
		t.Fatalf("preflop call: %v", err)
	}
	checkTotal("after preflop call")
	if _, _, err := gm.processTexasHoldemMove(gs, gs.Players[other].UserID, "check", map[string]interface{}{}); err != nil {
		t.Fatalf("preflop check: %v", err)
	}
	if phase, _ := gs.GameData["phase"].(string); phase != "flop" {
		t.Fatalf("expected flop, got %q", phase)
	}
	checkTotal("after flop dealt")

	// Postflop in heads-up: non-button acts first. Both check through flop/turn/river.
	for _, street := range []string{"flop", "turn", "river"} {
		actionOn := texasIntField(gs.GameData, "action_on")
		if _, _, err := gm.processTexasHoldemMove(gs, gs.Players[actionOn].UserID, "check", map[string]interface{}{}); err != nil {
			t.Fatalf("%s check 1: %v", street, err)
		}
		actionOn2 := texasIntField(gs.GameData, "action_on")
		gameOver, _, err := gm.processTexasHoldemMove(gs, gs.Players[actionOn2].UserID, "check", map[string]interface{}{})
		if err != nil {
			t.Fatalf("%s check 2: %v", street, err)
		}
		checkTotal("after " + street + " betting")
		if street == "river" {
			// River completing triggers showdown, but NOT an automatic next
			// hand — phase should rest at hand_complete so the showdown
			// reveal is an observable state, not silently overwritten.
			phase, _ := gs.GameData["phase"].(string)
			if phase != "hand_complete" {
				t.Errorf("expected phase=hand_complete to rest after showdown, got %q", phase)
			}
			if gameOver {
				t.Error("2 players both still have chips after a normal pot — tournament should not be over")
			}
			revealed, ok := gs.GameData["revealed_hands"].(map[string]interface{})
			if !ok || len(revealed) != 2 {
				t.Errorf("expected both players' hands revealed at showdown, got %v", revealed)
			}
		}
	}
	checkTotal("after the hand resolves, before the next hand is dealt")

	// Explicitly trigger the next hand — mirrors what a real client does once
	// players have seen the showdown result.
	anyActive := texasActivePlayers(gs)[0]
	if _, _, err := gm.processTexasHoldemMove(gs, gs.Players[anyActive].UserID, "next_hand", map[string]interface{}{}); err != nil {
		t.Fatalf("next_hand: %v", err)
	}
	checkTotal("after next_hand deals a fresh hand")

	if phase, _ := gs.GameData["phase"].(string); phase != "preflop" {
		t.Errorf("expected phase=preflop after next_hand, got %q", phase)
	}
	community := backgammonIntSliceToStrings(gs.GameData["community_cards"])
	if len(community) != 0 {
		t.Errorf("expected community cards reset for the new hand, got %d cards", len(community))
	}
	handNum := texasIntField(gs.GameData, "hand_number")
	if handNum != 2 {
		t.Errorf("expected hand_number=2 after next_hand, got %d", handNum)
	}
}
