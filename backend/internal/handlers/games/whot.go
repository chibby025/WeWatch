package games

import (
	"fmt"
)

// WHOT: West African card game (similar to Crazy Eights / Uno).
// Uses GameSessionState.Hands / DrawPile / DiscardPile (same as Crazy Eights / Uno).
//
// Deck: 5 suits (C=Circle, T=Triangle, X=Cross, Q=Square, S=Star) with
// numbers 1,2,3,4,5,7,8,10,11,14 per suit (10 × 5 = 50 cards)
// + 5 wild "W" (Whot 20) cards → 55 cards total.
//
// Card format: "<number><suit>" e.g. "1C","14S","W" (wild)
//
// Special cards:
//   1  – Suspension:    next player skips their turn.
//   2  – Pick Two:      next player draws 2 (stacks with another Pick Two).
//   5  – Pick Three:    next player draws 3 (stacks with Pick Two/Three).
//   8  – Suspension:    same as 1.
//   14 – General Market: all OTHER players each draw 1 card.
//   W  – Whot (wild):  caller declares the next suit.
//
// move_types:
//   play  { card: "1C" | "W", next_suit: "C"|"T"|"X"|"Q"|"S" }  (next_suit required for W)
//   draw  {}  (draw one card)

const whotHandSize = 5

var whotSuits = []string{"C", "T", "X", "Q", "S"}
var whotNumbers = []string{"1", "2", "3", "4", "5", "7", "8", "10", "11", "14"}

// NewWhotDeck returns a freshly shuffled Whot deck.
func NewWhotDeck() []string {
	deck := make([]string, 0, 55)
	for _, suit := range whotSuits {
		for _, num := range whotNumbers {
			deck = append(deck, num+suit)
		}
	}
	for i := 0; i < 5; i++ {
		deck = append(deck, "W")
	}
	ShuffleDeck(deck)
	return deck
}

func dealWhot(gameState *GameSessionState) {
	deck := NewWhotDeck()
	hands := make(map[uint][]string, len(gameState.Players))
	for _, p := range gameState.Players {
		hands[p.UserID] = append([]string{}, deck[:whotHandSize]...)
		deck = deck[whotHandSize:]
	}

	// Flip first non-special, non-wild card as starting discard so no action
	// triggers on the very first card.
	topIdx := 0
	for topIdx < len(deck) && (deck[topIdx] == "W" || whotIsSpecialNumber(whotNumberOf(deck[topIdx]))) {
		topIdx++
	}
	if topIdx >= len(deck) {
		topIdx = 0 // fallback: just use whatever is on top
	}
	top := deck[topIdx]
	deck = append(deck[:topIdx], deck[topIdx+1:]...)

	gameState.Hands = hands
	gameState.DrawPile = deck
	gameState.DiscardPile = []string{top}

	gameState.GameData["discard_top"] = top
	gameState.GameData["current_suit"] = whotSuitOf(top)
	gameState.GameData["current_number"] = whotNumberOf(top)
	gameState.GameData["pending_pick"] = 0.0

	syncWhotPublicState(gameState)
}

func syncWhotPublicState(gameState *GameSessionState) {
	counts := make(map[string]interface{}, len(gameState.Players))
	for _, p := range gameState.Players {
		counts[fmt.Sprintf("%d", p.UserID)] = len(gameState.Hands[p.UserID])
	}
	gameState.GameData["hand_counts"] = counts
	gameState.GameData["draw_pile_count"] = len(gameState.DrawPile)
}

func whotSuitOf(card string) string {
	if card == "W" || len(card) == 0 {
		return ""
	}
	return string(card[len(card)-1])
}

func whotNumberOf(card string) string {
	if card == "W" {
		return "W"
	}
	if len(card) == 0 {
		return ""
	}
	return card[:len(card)-1]
}

func whotIsSpecialNumber(num string) bool {
	return num == "1" || num == "2" || num == "5" || num == "8" || num == "14"
}

func whotCardPlayable(card, discardTop, currentSuit string, pendingPick int) bool {
	if card == "W" {
		return true
	}
	num := whotNumberOf(card)
	suit := whotSuitOf(card)

	// If there is a pending pick (stacked 2/5), only another pick card can counter.
	if pendingPick > 0 {
		return num == "2" || num == "5"
	}

	// Normal match: same suit OR same number as the discard top.
	return suit == currentSuit || (discardTop != "W" && num == whotNumberOf(discardTop))
}

func (gm *GameManager) processWhotMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	if gameState.Hands == nil {
		dealWhot(gameState)
	}

	switch moveType {
	case "draw":
		hand := gameState.Hands[playerID]
		drawn, newPile, newDiscard := whotDrawOne(gameState.DrawPile, gameState.DiscardPile)
		hand = append(hand, drawn)
		gameState.Hands[playerID] = hand
		gameState.DrawPile = newPile
		gameState.DiscardPile = newDiscard
		syncWhotPublicState(gameState)
		return false, nil, nil

	case "play":
		return gm.processWhotPlay(gameState, playerID, moveData)

	default:
		return false, nil, fmt.Errorf("unknown whot move type: %s", moveType)
	}
}

func (gm *GameManager) processWhotPlay(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	cardStr, _ := moveData["card"].(string)
	if cardStr == "" {
		return false, nil, fmt.Errorf("card required")
	}

	// Verify card is in hand.
	hand := gameState.Hands[playerID]
	cardIdx := -1
	for i, c := range hand {
		if c == cardStr {
			cardIdx = i
			break
		}
	}
	if cardIdx == -1 {
		return false, nil, fmt.Errorf("card not in your hand")
	}

	discardTop, _ := gameState.GameData["discard_top"].(string)
	currentSuit, _ := gameState.GameData["current_suit"].(string)
	pendingPickF, _ := gameState.GameData["pending_pick"].(float64)
	pendingPick := int(pendingPickF)

	if !whotCardPlayable(cardStr, discardTop, currentSuit, pendingPick) {
		return false, nil, fmt.Errorf("card not playable")
	}

	// Wild card requires the caller to declare the next suit.
	nextSuit := whotSuitOf(cardStr)
	if cardStr == "W" {
		ns, _ := moveData["next_suit"].(string)
		validSuits := map[string]bool{"C": true, "T": true, "X": true, "Q": true, "S": true}
		if !validSuits[ns] {
			return false, nil, fmt.Errorf("must declare a valid suit when playing Whot")
		}
		nextSuit = ns
	}

	// Remove card from hand.
	hand = append(hand[:cardIdx], hand[cardIdx+1:]...)
	gameState.Hands[playerID] = hand

	gameState.DiscardPile = append(gameState.DiscardPile, cardStr)
	gameState.GameData["discard_top"] = cardStr
	gameState.GameData["current_suit"] = nextSuit
	gameState.GameData["current_number"] = whotNumberOf(cardStr)

	nPlayers := len(gameState.Players)
	skipNext := false

	cardNum := whotNumberOf(cardStr)
	switch cardNum {
	case "1", "8":
		// Suspension: skip next player.
		gameState.GameData["pending_pick"] = 0.0
		skipNext = true

	case "2":
		// Pick Two: stack with any prior pending pick, force next player to draw, skip them.
		newPending := pendingPick + 2
		nextIdx := (gameState.CurrentTurn + 1) % nPlayers
		nextID := gameState.Players[nextIdx].UserID
		for i := 0; i < newPending; i++ {
			drawn, np, nd := whotDrawOne(gameState.DrawPile, gameState.DiscardPile)
			gameState.Hands[nextID] = append(gameState.Hands[nextID], drawn)
			gameState.DrawPile = np
			gameState.DiscardPile = nd
		}
		gameState.GameData["pending_pick"] = 0.0
		skipNext = true

	case "5":
		// Pick Three: same stacking logic as Pick Two.
		newPending := pendingPick + 3
		nextIdx := (gameState.CurrentTurn + 1) % nPlayers
		nextID := gameState.Players[nextIdx].UserID
		for i := 0; i < newPending; i++ {
			drawn, np, nd := whotDrawOne(gameState.DrawPile, gameState.DiscardPile)
			gameState.Hands[nextID] = append(gameState.Hands[nextID], drawn)
			gameState.DrawPile = np
			gameState.DiscardPile = nd
		}
		gameState.GameData["pending_pick"] = 0.0
		skipNext = true

	case "14":
		// General Market: every other player draws 1.
		gameState.GameData["pending_pick"] = 0.0
		for _, p := range gameState.Players {
			if p.UserID == playerID {
				continue
			}
			drawn, np, nd := whotDrawOne(gameState.DrawPile, gameState.DiscardPile)
			gameState.Hands[p.UserID] = append(gameState.Hands[p.UserID], drawn)
			gameState.DrawPile = np
			gameState.DiscardPile = nd
		}
		// No skip — normal turn advance.

	default:
		gameState.GameData["pending_pick"] = 0.0
	}

	syncWhotPublicState(gameState)

	// To skip the next player (advance 2 steps total) while the caller will
	// unconditionally add +1 to CurrentTurn, we pre-advance by 1 here so the
	// two additions sum to 2.  This mirrors the same trick Uno and Ludo use.
	if skipNext {
		gameState.CurrentTurn = (gameState.CurrentTurn + 1) % nPlayers
	}

	// Win condition: first player to empty their hand.
	if len(hand) == 0 {
		uid := playerID
		return true, &uid, nil
	}

	return false, nil, nil
}

// whotDrawOne pulls one card from the draw pile, reshuffling the discard if empty.
func whotDrawOne(drawPile, discardPile []string) (card string, newDraw []string, newDiscard []string) {
	if len(drawPile) == 0 {
		top := discardPile[len(discardPile)-1]
		reshuffled := append([]string{}, discardPile[:len(discardPile)-1]...)
		ShuffleDeck(reshuffled)
		drawPile = reshuffled
		discardPile = []string{top}
	}
	return drawPile[0], drawPile[1:], discardPile
}
