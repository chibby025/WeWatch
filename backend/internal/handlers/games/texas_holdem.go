package games

import (
	"fmt"
	"sort"
)

// Texas Hold'em: standard community-card poker, tournament-style. Per
// explicit product decision: chips are purely symbolic (a fresh stack every
// game, no connection to the platform's real token/payment economy — same
// precedent as the existing Roulette game's "everyone starts with 1,000
// chips"), so this carries none of the real-money gambling implications
// using actual platform tokens would raise. Blinds escalate every few hands;
// a player with 0 chips is busted; last player with chips wins.
//
// "Texas Hold'em" itself is a generic, non-trademarked term for this poker
// variant (unlike Monopoly) — no renaming needed, same as Blackjack/
// Backgammon.
//
// Hidden information: each player's 2 hole cards, via the same private-Hands
// architecture as Crazy Eights/Uno/Wordsmith (GameSessionState.Hands) —
// never placed on GameData, delivered only via the generic hand_update
// mechanism already wired into websocket_handler.go.
//
// move_types:
//   check {}
//   call  {}
//   raise { amount: int }  — the new TOTAL bet level for this round (not the increment).
//   fold  {}

const texasStartingChips = 1000
const texasStartingBigBlind = 20
const texasBlindEscalationHands = 5 // blinds double every N hands

type texasSidePot struct {
	Amount   int
	Eligible []int // player indices who can win this pot
}

func ensureTexasHoldemState(gameState *GameSessionState) {
	if _, ok := gameState.GameData["chips"]; ok {
		return
	}
	chips := map[string]interface{}{}
	busted := map[string]interface{}{}
	for i := range gameState.Players {
		key := fmt.Sprintf("%d", i)
		chips[key] = texasStartingChips
		busted[key] = false
	}
	gameState.GameData["chips"] = chips
	gameState.GameData["busted"] = busted
	gameState.GameData["dealer_idx"] = -1 // -1 so the first hand's rotation lands on player 0
	gameState.GameData["hand_number"] = 0
	gameState.GameData["phase"] = "hand_complete" // triggers a fresh deal on the first roll-equivalent
	gameState.GameData["community_cards"] = []interface{}{}
	gameState.GameData["pot"] = 0
	gameState.GameData["current_bets"] = map[string]interface{}{}
	gameState.GameData["total_bets_this_hand"] = map[string]interface{}{}
	gameState.GameData["folded"] = map[string]interface{}{}
	gameState.GameData["all_in"] = map[string]interface{}{}
	gameState.GameData["acted_this_round"] = map[string]interface{}{}
	gameState.GameData["action_on"] = -1
	gameState.GameData["min_raise"] = texasStartingBigBlind
	gameState.GameData["last_event"] = ""
	texasStartHand(gameState)
}

// ---- small map/type helpers -------------------------------------------------

func texasIntField(gameData map[string]interface{}, key string) int {
	switch v := gameData[key].(type) {
	case int:
		return v
	case float64:
		return int(v)
	default:
		return 0
	}
}

func texasMapIntGet(gameData map[string]interface{}, key, subkey string) int {
	m, _ := gameData[key].(map[string]interface{})
	switch v := m[subkey].(type) {
	case int:
		return v
	case float64:
		return int(v)
	default:
		return 0
	}
}

func texasMapIntSet(gameData map[string]interface{}, key, subkey string, value int) {
	m, ok := gameData[key].(map[string]interface{})
	if !ok {
		m = map[string]interface{}{}
	}
	m[subkey] = value
	gameData[key] = m
}

func texasMapBoolGet(gameData map[string]interface{}, key, subkey string) bool {
	m, _ := gameData[key].(map[string]interface{})
	b, _ := m[subkey].(bool)
	return b
}

func texasMapBoolSet(gameData map[string]interface{}, key, subkey string, value bool) {
	m, ok := gameData[key].(map[string]interface{})
	if !ok {
		m = map[string]interface{}{}
	}
	m[subkey] = value
	gameData[key] = m
}

func texasChips(gameData map[string]interface{}, idx int) int {
	return texasMapIntGet(gameData, "chips", fmt.Sprintf("%d", idx))
}
func texasSetChips(gameData map[string]interface{}, idx, v int) {
	texasMapIntSet(gameData, "chips", fmt.Sprintf("%d", idx), v)
}
func texasIsBusted(gameData map[string]interface{}, idx int) bool {
	return texasMapBoolGet(gameData, "busted", fmt.Sprintf("%d", idx))
}
func texasIsFolded(gameData map[string]interface{}, idx int) bool {
	return texasMapBoolGet(gameData, "folded", fmt.Sprintf("%d", idx))
}
func texasIsAllIn(gameData map[string]interface{}, idx int) bool {
	return texasMapBoolGet(gameData, "all_in", fmt.Sprintf("%d", idx))
}
func texasCurrentBet(gameData map[string]interface{}, idx int) int {
	return texasMapIntGet(gameData, "current_bets", fmt.Sprintf("%d", idx))
}
func texasTotalBetThisHand(gameData map[string]interface{}, idx int) int {
	return texasMapIntGet(gameData, "total_bets_this_hand", fmt.Sprintf("%d", idx))
}

// texasNextActiveFrom returns the next non-busted player index after `from`,
// wrapping around. Busted players are permanently skipped; folded/all-in
// players ARE returned (they're still "in the hand" for seat-rotation
// purposes like dealer/blinds — folded/all-in-specific skipping for the
// betting loop is handled separately in texasNextToAct).
func texasNextActiveFrom(gameState *GameSessionState, from int) int {
	n := len(gameState.Players)
	for i := 1; i <= n; i++ {
		idx := (from + i) % n
		if !texasIsBusted(gameState.GameData, idx) {
			return idx
		}
	}
	return from
}

// texasNextToAct returns the next player who still needs to act this betting
// round (not folded, not all-in, not busted), or -1 if none remain.
func texasNextToAct(gameState *GameSessionState, from int) int {
	n := len(gameState.Players)
	for i := 1; i <= n; i++ {
		idx := (from + i) % n
		if texasIsBusted(gameState.GameData, idx) || texasIsFolded(gameState.GameData, idx) || texasIsAllIn(gameState.GameData, idx) {
			continue
		}
		return idx
	}
	return -1
}

func texasActivePlayers(gameState *GameSessionState) []int {
	out := []int{}
	for i := range gameState.Players {
		if !texasIsBusted(gameState.GameData, i) {
			out = append(out, i)
		}
	}
	return out
}

func texasNonFoldedPlayers(gameState *GameSessionState) []int {
	out := []int{}
	for i := range gameState.Players {
		if !texasIsBusted(gameState.GameData, i) && !texasIsFolded(gameState.GameData, i) {
			out = append(out, i)
		}
	}
	return out
}

// ---- hand setup --------------------------------------------------------------

func texasBlindsForHandNumber(handNumber int) (int, int) {
	doublings := handNumber / texasBlindEscalationHands
	bb := texasStartingBigBlind
	for i := 0; i < doublings; i++ {
		bb *= 2
	}
	return bb / 2, bb
}

// texasStartHand deals a fresh hand: rotates the dealer, posts blinds, deals
// hole cards, and sets up preflop action. Assumes at least 2 non-busted
// players (callers must check for tournament-over before calling this).
func texasStartHand(gameState *GameSessionState) {
	handNum := texasIntField(gameState.GameData, "hand_number") + 1
	gameState.GameData["hand_number"] = handNum

	active := texasActivePlayers(gameState)
	n := len(active)

	dealerIdx := texasIntField(gameState.GameData, "dealer_idx")
	dealerIdx = texasNextActiveFrom(gameState, dealerIdx)
	gameState.GameData["dealer_idx"] = dealerIdx

	sb, bb := texasBlindsForHandNumber(handNum)
	gameState.GameData["small_blind"] = sb
	gameState.GameData["big_blind"] = bb
	gameState.GameData["min_raise"] = bb

	// Reset per-hand state.
	gameState.GameData["community_cards"] = []interface{}{}
	gameState.GameData["pot"] = 0
	gameState.GameData["current_bets"] = map[string]interface{}{}
	gameState.GameData["total_bets_this_hand"] = map[string]interface{}{}
	gameState.GameData["folded"] = map[string]interface{}{}
	gameState.GameData["all_in"] = map[string]interface{}{}
	gameState.GameData["acted_this_round"] = map[string]interface{}{}
	gameState.GameData["phase"] = "preflop"
	gameState.GameData["last_event"] = ""
	// Cleared every hand, only populated by texasShowdown — a fold-to-win never
	// reveals the winner's cards (standard poker: mucking is allowed), only a
	// genuine showdown does.
	gameState.GameData["revealed_hands"] = map[string]interface{}{}

	var sbIdx, bbIdx int
	if n == 2 {
		sbIdx = dealerIdx // heads-up: the button posts the small blind
		bbIdx = texasNextActiveFrom(gameState, sbIdx)
	} else {
		sbIdx = texasNextActiveFrom(gameState, dealerIdx)
		bbIdx = texasNextActiveFrom(gameState, sbIdx)
	}
	texasPostBlind(gameState, sbIdx, sb)
	texasPostBlind(gameState, bbIdx, bb)

	// Deal 2 hole cards to each active player.
	deck := NewDeck()
	ShuffleDeck(deck)
	hands := map[uint][]string{}
	for _, idx := range active {
		hands[gameState.Players[idx].UserID] = []string{deck[0], deck[1]}
		deck = deck[2:]
	}
	gameState.Hands = hands
	gameState.DrawPile = deck // remaining deck, used for the flop/turn/river

	if n == 2 {
		gameState.GameData["action_on"] = sbIdx // heads-up: button/SB acts first preflop
	} else {
		gameState.GameData["action_on"] = texasNextActiveFrom(gameState, bbIdx) // "under the gun"
	}
}

// texasPostBlind posts a blind, handling the short-stack (posting all-in for
// less than the full blind) case.
func texasPostBlind(gameState *GameSessionState, idx, amount int) {
	chips := texasChips(gameState.GameData, idx)
	post := amount
	if post > chips {
		post = chips
	}
	texasSetChips(gameState.GameData, idx, chips-post)
	texasMapIntSet(gameState.GameData, "current_bets", fmt.Sprintf("%d", idx), post)
	texasMapIntSet(gameState.GameData, "total_bets_this_hand", fmt.Sprintf("%d", idx), post)
	pot := texasIntField(gameState.GameData, "pot")
	gameState.GameData["pot"] = pot + post
	if post == chips {
		texasMapBoolSet(gameState.GameData, "all_in", fmt.Sprintf("%d", idx), true)
	}
}

// ---- move processing ----------------------------------------------------------

func (gm *GameManager) processTexasHoldemMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (bool, *uint, error) {
	ensureTexasHoldemState(gameState)

	playerIdx := -1
	for i, p := range gameState.Players {
		if p.UserID == playerID {
			playerIdx = i
			break
		}
	}
	if playerIdx == -1 {
		return false, nil, fmt.Errorf("you are not a player in this game")
	}
	if texasIsBusted(gameState.GameData, playerIdx) {
		return false, nil, fmt.Errorf("you are busted and out of the tournament")
	}

	// next_hand is a global action (any active player can deal the next hand
	// once the current one is settled) — not a per-seat turn action, so it
	// must bypass the action_on check below.
	if moveType == "next_hand" {
		return gm.texasProcessNextHand(gameState)
	}

	actionOn := texasIntField(gameState.GameData, "action_on")
	if actionOn != playerIdx {
		return false, nil, fmt.Errorf("not your turn to act")
	}

	switch moveType {
	case "check":
		return gm.texasProcessCheck(gameState, playerIdx)
	case "call":
		return gm.texasProcessCall(gameState, playerIdx)
	case "raise":
		return gm.texasProcessRaise(gameState, playerIdx, moveData)
	case "fold":
		return gm.texasProcessFold(gameState, playerIdx)
	default:
		return false, nil, fmt.Errorf("unknown texas holdem move type: %s", moveType)
	}
}

func texasMaxBetThisRound(gameState *GameSessionState) int {
	max := 0
	for i := range gameState.Players {
		if b := texasCurrentBet(gameState.GameData, i); b > max {
			max = b
		}
	}
	return max
}

func (gm *GameManager) texasProcessCheck(gameState *GameSessionState, playerIdx int) (bool, *uint, error) {
	if texasCurrentBet(gameState.GameData, playerIdx) != texasMaxBetThisRound(gameState) {
		return false, nil, fmt.Errorf("you must call or fold — there's a bet to match")
	}
	texasMapBoolSet(gameState.GameData, "acted_this_round", fmt.Sprintf("%d", playerIdx), true)
	return gm.texasAdvanceAfterAction(gameState)
}

func (gm *GameManager) texasProcessCall(gameState *GameSessionState, playerIdx int) (bool, *uint, error) {
	maxBet := texasMaxBetThisRound(gameState)
	owed := maxBet - texasCurrentBet(gameState.GameData, playerIdx)
	if owed <= 0 {
		return false, nil, fmt.Errorf("nothing to call — check instead")
	}
	chips := texasChips(gameState.GameData, playerIdx)
	pay := owed
	if pay > chips {
		pay = chips
	}
	texasSetChips(gameState.GameData, playerIdx, chips-pay)
	texasMapIntSet(gameState.GameData, "current_bets", fmt.Sprintf("%d", playerIdx), texasCurrentBet(gameState.GameData, playerIdx)+pay)
	texasMapIntSet(gameState.GameData, "total_bets_this_hand", fmt.Sprintf("%d", playerIdx), texasTotalBetThisHand(gameState.GameData, playerIdx)+pay)
	gameState.GameData["pot"] = texasIntField(gameState.GameData, "pot") + pay
	if pay == chips {
		texasMapBoolSet(gameState.GameData, "all_in", fmt.Sprintf("%d", playerIdx), true)
	}
	texasMapBoolSet(gameState.GameData, "acted_this_round", fmt.Sprintf("%d", playerIdx), true)
	return gm.texasAdvanceAfterAction(gameState)
}

func (gm *GameManager) texasProcessRaise(gameState *GameSessionState, playerIdx int, moveData map[string]interface{}) (bool, *uint, error) {
	amountF, ok := moveData["amount"].(float64)
	if !ok {
		return false, nil, fmt.Errorf("missing amount")
	}
	newLevel := int(amountF)
	maxBet := texasMaxBetThisRound(gameState)
	minRaise := texasIntField(gameState.GameData, "min_raise")
	chips := texasChips(gameState.GameData, playerIdx)
	currentBet := texasCurrentBet(gameState.GameData, playerIdx)
	maxPossible := currentBet + chips // going all-in

	if newLevel < maxBet+minRaise && newLevel < maxPossible {
		return false, nil, fmt.Errorf("raise must be at least %d (or go all-in for less)", maxBet+minRaise)
	}
	if newLevel > maxPossible {
		return false, nil, fmt.Errorf("you don't have enough chips for that raise")
	}

	raiseIncrement := newLevel - maxBet
	if raiseIncrement > minRaise {
		gameState.GameData["min_raise"] = raiseIncrement
	}

	pay := newLevel - currentBet
	texasSetChips(gameState.GameData, playerIdx, chips-pay)
	texasMapIntSet(gameState.GameData, "current_bets", fmt.Sprintf("%d", playerIdx), newLevel)
	texasMapIntSet(gameState.GameData, "total_bets_this_hand", fmt.Sprintf("%d", playerIdx), texasTotalBetThisHand(gameState.GameData, playerIdx)+pay)
	gameState.GameData["pot"] = texasIntField(gameState.GameData, "pot") + pay
	if pay == chips {
		texasMapBoolSet(gameState.GameData, "all_in", fmt.Sprintf("%d", playerIdx), true)
	}

	// A raise reopens the action — everyone else must act again.
	acted := map[string]interface{}{}
	acted[fmt.Sprintf("%d", playerIdx)] = true
	gameState.GameData["acted_this_round"] = acted

	return gm.texasAdvanceAfterAction(gameState)
}

func (gm *GameManager) texasProcessFold(gameState *GameSessionState, playerIdx int) (bool, *uint, error) {
	texasMapBoolSet(gameState.GameData, "folded", fmt.Sprintf("%d", playerIdx), true)
	texasMapBoolSet(gameState.GameData, "acted_this_round", fmt.Sprintf("%d", playerIdx), true)
	return gm.texasAdvanceAfterAction(gameState)
}

// texasAdvanceAfterAction decides what happens next: another player acts,
// the betting round advances to the next street, or the hand ends (by fold
// or showdown). Also detects tournament-over.
func (gm *GameManager) texasAdvanceAfterAction(gameState *GameSessionState) (bool, *uint, error) {
	nonFolded := texasNonFoldedPlayers(gameState)
	if len(nonFolded) == 1 {
		return gm.texasAwardPotUncontested(gameState, nonFolded[0])
	}

	if texasIsRoundComplete(gameState) {
		return gm.texasAdvancePhase(gameState)
	}

	current := texasIntField(gameState.GameData, "action_on")
	next := texasNextToAct(gameState, current)
	if next == -1 {
		// Nobody left who can act (everyone else folded/all-in) — treat as
		// round complete even though the acted/bet-matching check above
		// technically wants a live actor; this covers the "one player left
		// who could act, but they already acted and everyone else is
		// all-in" edge case.
		return gm.texasAdvancePhase(gameState)
	}
	gameState.GameData["action_on"] = next
	return false, nil, nil
}

// texasIsRoundComplete reports whether every non-folded, non-all-in player
// has acted this round and matched the current highest bet.
func texasIsRoundComplete(gameState *GameSessionState) bool {
	maxBet := texasMaxBetThisRound(gameState)
	for _, idx := range texasNonFoldedPlayers(gameState) {
		if texasIsAllIn(gameState.GameData, idx) {
			continue
		}
		key := fmt.Sprintf("%d", idx)
		acted := texasMapBoolGet(gameState.GameData, "acted_this_round", key)
		if !acted || texasCurrentBet(gameState.GameData, idx) != maxBet {
			return false
		}
	}
	return true
}

// texasAdvancePhase deals the next street (or runs straight to showdown if
// everyone remaining is all-in / the river is already out).
func (gm *GameManager) texasAdvancePhase(gameState *GameSessionState) (bool, *uint, error) {
	phase, _ := gameState.GameData["phase"].(string)
	community := backgammonIntSliceToStrings(gameState.GameData["community_cards"])

	// Reset betting-round state for the new street.
	resetBets := func() {
		gameState.GameData["current_bets"] = map[string]interface{}{}
		gameState.GameData["acted_this_round"] = map[string]interface{}{}
		gameState.GameData["min_raise"] = texasIntField(gameState.GameData, "big_blind")
	}

	nonFolded := texasNonFoldedPlayers(gameState)
	everyoneAllIn := true
	liveActors := 0
	for _, idx := range nonFolded {
		if !texasIsAllIn(gameState.GameData, idx) {
			liveActors++
		}
	}
	everyoneAllIn = liveActors <= 1

	deck := gameState.DrawPile

	switch phase {
	case "preflop":
		community = append(community, deck[0], deck[1], deck[2])
		deck = deck[3:]
		gameState.GameData["phase"] = "flop"
	case "flop":
		community = append(community, deck[0])
		deck = deck[1:]
		gameState.GameData["phase"] = "turn"
	case "turn":
		community = append(community, deck[0])
		deck = deck[1:]
		gameState.GameData["phase"] = "river"
	case "river":
		gameState.GameData["phase"] = "showdown"
	}
	gameState.DrawPile = deck
	gameState.GameData["community_cards"] = texasStringsToInterface(community)

	if gameState.GameData["phase"] == "showdown" || (everyoneAllIn && len(community) < 5) {
		// Deal out any remaining streets immediately when everyone left is
		// all-in — standard "run it out" behavior, no more betting possible.
		for len(community) < 5 {
			community = append(community, deck[0])
			deck = deck[1:]
		}
		gameState.DrawPile = deck
		gameState.GameData["community_cards"] = texasStringsToInterface(community)
		gameState.GameData["phase"] = "showdown"
		return gm.texasShowdown(gameState)
	}

	resetBets()
	dealerIdx := texasIntField(gameState.GameData, "dealer_idx")
	gameState.GameData["action_on"] = texasNextToAct(gameState, dealerIdx)
	return false, nil, nil
}

func backgammonIntSliceToStrings(raw interface{}) []string {
	arr, ok := raw.([]interface{})
	if !ok {
		return []string{}
	}
	out := make([]string, 0, len(arr))
	for _, v := range arr {
		if s, ok := v.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func texasStringsToInterface(strs []string) []interface{} {
	out := make([]interface{}, len(strs))
	for i, s := range strs {
		out[i] = s
	}
	return out
}

// texasAwardPotUncontested gives the whole pot to the sole remaining
// non-folded player (everyone else folded) — no showdown/card reveal needed.
func (gm *GameManager) texasAwardPotUncontested(gameState *GameSessionState, winnerIdx int) (bool, *uint, error) {
	pot := texasIntField(gameState.GameData, "pot")
	texasSetChips(gameState.GameData, winnerIdx, texasChips(gameState.GameData, winnerIdx)+pot)
	gameState.GameData["pot"] = 0
	gameState.GameData["last_event"] = fmt.Sprintf("uncontested:%d:%d", winnerIdx, pot)
	gameState.GameData["phase"] = "hand_complete"
	return gm.texasEndHand(gameState)
}

// texasShowdown evaluates every non-folded player's best hand, splits the
// pot(s) (correctly handling side pots for differing all-in amounts), and
// updates chip counts.
func (gm *GameManager) texasShowdown(gameState *GameSessionState) (bool, *uint, error) {
	community := backgammonIntSliceToStrings(gameState.GameData["community_cards"])
	contenders := texasNonFoldedPlayers(gameState)

	type result struct {
		idx      int
		category int
		tiebreak []int
	}
	results := make(map[int]result, len(contenders))
	for _, idx := range contenders {
		hole := gameState.Hands[gameState.Players[idx].UserID]
		cat, tb := texasBestOf7(append(append([]string{}, hole...), community...))
		results[idx] = result{idx: idx, category: cat, tiebreak: tb}
	}

	pots := texasComputeSidePots(gameState, contenders)
	winningsByPlayer := map[int]int{}
	for _, pot := range pots {
		if len(pot.Eligible) == 0 || pot.Amount == 0 {
			continue
		}
		var winners []int
		var best result
		for i, idx := range pot.Eligible {
			r := results[idx]
			if i == 0 || texasCompareResult(r, best) > 0 {
				best = r
				winners = []int{idx}
			} else if texasCompareResult(r, best) == 0 {
				winners = append(winners, idx)
			}
		}
		share := pot.Amount / len(winners)
		remainder := pot.Amount % len(winners)
		for i, w := range winners {
			amt := share
			if i == 0 {
				amt += remainder // odd chip goes to the first winner (arbitrary, standard house rule)
			}
			winningsByPlayer[w] += amt
		}
	}
	for idx, amt := range winningsByPlayer {
		texasSetChips(gameState.GameData, idx, texasChips(gameState.GameData, idx)+amt)
	}

	// Reveal every contender's hole cards — a genuine showdown is public by
	// nature (unlike a fold-to-win, where the winner may muck unseen). This is
	// the one deliberate exception to this game's otherwise-private Hands
	// architecture: once hands are compared to award the pot, they're no
	// longer secret information for this hand.
	revealed := map[string]interface{}{}
	for _, idx := range contenders {
		hole := gameState.Hands[gameState.Players[idx].UserID]
		revealed[fmt.Sprintf("%d", idx)] = texasStringsToInterface(hole)
	}
	gameState.GameData["revealed_hands"] = revealed

	gameState.GameData["pot"] = 0
	gameState.GameData["phase"] = "hand_complete"
	gameState.GameData["last_event"] = "showdown"
	return gm.texasEndHand(gameState)
}

func texasCompareResult(a, b struct {
	idx      int
	category int
	tiebreak []int
}) int {
	if a.category != b.category {
		return a.category - b.category
	}
	for i := 0; i < len(a.tiebreak) && i < len(b.tiebreak); i++ {
		if a.tiebreak[i] != b.tiebreak[i] {
			return a.tiebreak[i] - b.tiebreak[i]
		}
	}
	return 0
}

// texasComputeSidePots splits the pot into layers based on each contender's
// total contribution this hand — the standard algorithm for correctly
// resolving all-ins with different stack sizes. Folded players' chips are
// still included in the pot amounts (they contributed them), just never
// eligible to win any layer.
func texasComputeSidePots(gameState *GameSessionState, contenders []int) []texasSidePot {
	allPlayers := []int{}
	for i := range gameState.Players {
		if !texasIsBusted(gameState.GameData, i) {
			allPlayers = append(allPlayers, i)
		}
	}
	contributions := map[int]int{}
	levels := map[int]bool{}
	for _, idx := range allPlayers {
		c := texasTotalBetThisHand(gameState.GameData, idx)
		contributions[idx] = c
		if c > 0 {
			levels[c] = true
		}
	}
	sortedLevels := make([]int, 0, len(levels))
	for l := range levels {
		sortedLevels = append(sortedLevels, l)
	}
	sort.Ints(sortedLevels)

	contenderSet := map[int]bool{}
	for _, idx := range contenders {
		contenderSet[idx] = true
	}

	pots := []texasSidePot{}
	prevLevel := 0
	for _, level := range sortedLevels {
		layerSize := level - prevLevel
		if layerSize <= 0 {
			continue
		}
		contributorsAtLevel := 0
		eligible := []int{}
		for _, idx := range allPlayers {
			if contributions[idx] >= level {
				contributorsAtLevel++
				if contenderSet[idx] {
					eligible = append(eligible, idx)
				}
			}
		}
		amount := layerSize * contributorsAtLevel
		if amount > 0 {
			pots = append(pots, texasSidePot{Amount: amount, Eligible: eligible})
		}
		prevLevel = level
	}
	return pots
}

// texasEndHand busts any player at 0 chips and checks for a tournament
// winner. If the tournament continues, it deliberately does NOT deal the
// next hand itself — phase stays "hand_complete" so the pot award / showdown
// reveal (if any) is a real, observable resting state that reaches clients
// via a broadcast, rather than being overwritten by the next hand's reset
// within the same atomic move-processing call. Any active player then sends
// a "next_hand" move (texasProcessNextHand) once they're ready to continue.
func (gm *GameManager) texasEndHand(gameState *GameSessionState) (bool, *uint, error) {
	for i := range gameState.Players {
		if !texasIsBusted(gameState.GameData, i) && texasChips(gameState.GameData, i) <= 0 {
			texasMapBoolSet(gameState.GameData, "busted", fmt.Sprintf("%d", i), true)
		}
	}
	active := texasActivePlayers(gameState)
	gameState.GameData["action_on"] = -1
	if len(active) <= 1 {
		if len(active) == 1 {
			winner := gameState.Players[active[0]].UserID
			return true, &winner, nil
		}
		return true, nil, nil
	}
	gameState.GameData["phase"] = "hand_complete"
	return false, nil, nil
}

// texasProcessNextHand deals a fresh hand once the previous one has settled
// (phase == "hand_complete"). Any non-busted player may trigger it — poker
// has no natural single "host" for this action, and requiring a specific
// player to click would create needless friction if that player happens to
// be slow or briefly away.
func (gm *GameManager) texasProcessNextHand(gameState *GameSessionState) (bool, *uint, error) {
	phase, _ := gameState.GameData["phase"].(string)
	if phase != "hand_complete" {
		return false, nil, fmt.Errorf("the current hand isn't finished yet")
	}
	texasStartHand(gameState)
	return false, nil, nil
}

// ---- hand evaluation ----------------------------------------------------------

var texasRankValue = map[string]int{
	"2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
	"J": 11, "Q": 12, "K": 13, "A": 14,
}

// texasBestOf7 finds the best 5-card poker hand from exactly 7 cards (2 hole
// + 5 community) by brute-forcing all 21 combinations — simple and safe
// rather than a cleverer single-pass evaluator, since correctness here
// matters far more than speed (evaluated a handful of times per hand).
func texasBestOf7(cards []string) (int, []int) {
	bestCat := -1
	var bestTB []int
	n := len(cards)
	for i := 0; i < n; i++ {
		for j := i + 1; j < n; j++ {
			five := make([]string, 0, 5)
			for k := 0; k < n; k++ {
				if k != i && k != j {
					five = append(five, cards[k])
				}
			}
			cat, tb := texasEvaluate5(five)
			if cat > bestCat || (cat == bestCat && texasCompareTiebreak(tb, bestTB) > 0) {
				bestCat, bestTB = cat, tb
			}
		}
	}
	return bestCat, bestTB
}

func texasCompareTiebreak(a, b []int) int {
	for i := 0; i < len(a) && i < len(b); i++ {
		if a[i] != b[i] {
			return a[i] - b[i]
		}
	}
	return 0
}

// texasEvaluate5 ranks exactly 5 cards. category: 8=straight flush,
// 7=four of a kind, 6=full house, 5=flush, 4=straight, 3=three of a kind,
// 2=two pair, 1=pair, 0=high card. tiebreak is a descending list of values
// to compare hands of the same category.
func texasEvaluate5(cards []string) (int, []int) {
	values := make([]int, 5)
	suitCounts := map[string]int{}
	for i, c := range cards {
		values[i] = texasRankValue[cardRank(c)]
		suitCounts[cardSuit(c)]++
	}
	isFlush := false
	for _, n := range suitCounts {
		if n == 5 {
			isFlush = true
		}
	}

	sortedVals := append([]int{}, values...)
	sort.Sort(sort.Reverse(sort.IntSlice(sortedVals)))
	isStraight, straightHigh := texasCheckStraight(sortedVals)

	valueCounts := map[int]int{}
	for _, v := range values {
		valueCounts[v]++
	}
	type grp struct{ count, value int }
	groups := make([]grp, 0, len(valueCounts))
	for v, c := range valueCounts {
		groups = append(groups, grp{c, v})
	}
	sort.Slice(groups, func(i, j int) bool {
		if groups[i].count != groups[j].count {
			return groups[i].count > groups[j].count
		}
		return groups[i].value > groups[j].value
	})

	if isStraight && isFlush {
		return 8, []int{straightHigh}
	}
	if groups[0].count == 4 {
		return 7, []int{groups[0].value, groups[1].value}
	}
	if groups[0].count == 3 && len(groups) > 1 && groups[1].count == 2 {
		return 6, []int{groups[0].value, groups[1].value}
	}
	if isFlush {
		return 5, sortedVals
	}
	if isStraight {
		return 4, []int{straightHigh}
	}
	if groups[0].count == 3 {
		tb := []int{groups[0].value}
		for _, g := range groups[1:] {
			tb = append(tb, g.value)
		}
		return 3, tb
	}
	if groups[0].count == 2 && len(groups) > 1 && groups[1].count == 2 {
		return 2, []int{groups[0].value, groups[1].value, groups[2].value}
	}
	if groups[0].count == 2 {
		tb := []int{groups[0].value}
		for _, g := range groups[1:] {
			tb = append(tb, g.value)
		}
		return 1, tb
	}
	return 0, sortedVals
}

// texasCheckStraight reports whether 5 descending-sorted values form a
// straight (including the wheel, A-5-4-3-2, where the ace counts low and
// the straight's high card is 5).
func texasCheckStraight(sortedDesc []int) (bool, int) {
	seen := map[int]bool{}
	unique := []int{}
	for _, v := range sortedDesc {
		if !seen[v] {
			seen[v] = true
			unique = append(unique, v)
		}
	}
	if len(unique) != 5 {
		return false, 0
	}
	consecutive := true
	for i := 1; i < 5; i++ {
		if unique[i-1]-unique[i] != 1 {
			consecutive = false
			break
		}
	}
	if consecutive {
		return true, unique[0]
	}
	if unique[0] == 14 && unique[1] == 5 && unique[2] == 4 && unique[3] == 3 && unique[4] == 2 {
		return true, 5
	}
	return false, 0
}
