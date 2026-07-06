package games

import (
	"fmt"
	"strings"
)

// UNO: builds directly on the Crazy Eights hidden-hand architecture.
// Uses GameSessionState.Hands / DrawPile / DiscardPile (defined in game_manager.go).
// Public state in GameData: discard_top, current_color, hand_counts, draw_pile_count,
// direction, current_turn_player_id, pending_draw (for stacked Draw 2 / Wild Draw 4),
// uno_declared (map playerID→bool).
//
// Cards: "<rank><suit>" e.g. "7H", "SD" (Skip/Hearts), "RH" (Reverse/Hearts),
// "D2H" (Draw Two/Hearts), "WC" (Wild), "W4C" (Wild Draw Four) — suit irrelevant for
// Wild cards, stored as "C" by convention.
//
// move_types:
//   play        { card: "7H", next_color: "H"|"D"|"C"|"S" }  (next_color required for WC/W4C)
//   draw        {}   (draw one card from pile)
//   uno         {}   (declare UNO before playing last card — stored, validated later)
//   challenge   {}   (challenge a Wild Draw Four — not implemented in v1, stubbed)

const unoHandSize = 7

var unoRanks = []string{"0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "S", "R", "D2"}
var unoSuits = []string{"H", "D", "C", "S"}

func NewUnoDeck() []string {
	deck := make([]string, 0, 108)
	for _, suit := range unoSuits {
		deck = append(deck, "0"+suit) // one 0 per colour
		for _, rank := range unoRanks[1:] {
			deck = append(deck, rank+suit) // two of everything else
			deck = append(deck, rank+suit)
		}
	}
	for i := 0; i < 4; i++ {
		deck = append(deck, "WC")  // Wild
		deck = append(deck, "W4C") // Wild Draw Four
	}
	ShuffleDeck(deck)
	return deck
}

func dealUno(gameState *GameSessionState) {
	deck := NewUnoDeck()
	hands := make(map[uint][]string, len(gameState.Players))
	for _, p := range gameState.Players {
		hands[p.UserID] = append([]string{}, deck[:unoHandSize]...)
		deck = deck[unoHandSize:]
	}

	// Flip first non-action, non-wild card as starting discard.
	topIdx := 0
	for unoIsActionOrWild(deck[topIdx]) {
		topIdx++
	}
	top := deck[topIdx]
	deck = append(deck[:topIdx], deck[topIdx+1:]...)

	gameState.Hands = hands
	gameState.DrawPile = deck
	gameState.DiscardPile = []string{top}

	gameState.GameData["discard_top"] = top
	gameState.GameData["current_color"] = unoSuitOf(top)
	gameState.GameData["direction"] = 1.0 // 1 = clockwise, -1 = counter
	gameState.GameData["pending_draw"] = 0.0
	gameState.GameData["uno_declared"] = map[string]interface{}{}

	syncUnoPublicState(gameState)
}

func syncUnoPublicState(gameState *GameSessionState) {
	counts := make(map[string]interface{}, len(gameState.Players))
	for _, p := range gameState.Players {
		counts[fmt.Sprintf("%d", p.UserID)] = len(gameState.Hands[p.UserID])
	}
	gameState.GameData["hand_counts"] = counts
	gameState.GameData["draw_pile_count"] = len(gameState.DrawPile)
}

func (gm *GameManager) processUnoMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	if gameState.Hands == nil {
		dealUno(gameState)
	}

	switch moveType {
	case "uno":
		key := fmt.Sprintf("%d", playerID)
		decls := unoDeclarations(gameState)
		decls[key] = true
		gameState.GameData["uno_declared"] = decls
		// Cancel turn advance — declaring UNO isn't a turn action.
		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil

	case "draw":
		hand := gameState.Hands[playerID]
		drawn, newPile, newDiscard := unoDrawOne(gameState.DrawPile, gameState.DiscardPile)
		hand = append(hand, drawn)
		gameState.Hands[playerID] = hand
		gameState.DrawPile = newPile
		gameState.DiscardPile = newDiscard
		syncUnoPublicState(gameState)
		return false, nil, nil

	case "play":
		return gm.processUnoPlay(gameState, playerID, moveData)

	default:
		return false, nil, fmt.Errorf("unknown move type: %s", moveType)
	}
}

func (gm *GameManager) processUnoPlay(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	cardStr, _ := moveData["card"].(string)
	card := strings.ToUpper(strings.TrimSpace(cardStr))
	if card == "" {
		return false, nil, fmt.Errorf("card required")
	}

	hand := gameState.Hands[playerID]
	cardIdx := -1
	for i, c := range hand {
		if c == card {
			cardIdx = i
			break
		}
	}
	if cardIdx == -1 {
		return false, nil, fmt.Errorf("card not in your hand")
	}

	top, _ := gameState.GameData["discard_top"].(string)
	currentColor, _ := gameState.GameData["current_color"].(string)
	pendingDrawF, _ := gameState.GameData["pending_draw"].(float64)
	pendingDraw := int(pendingDrawF)

	// Validate the card is playable.
	if !unoCardPlayable(card, top, currentColor, pendingDraw) {
		return false, nil, fmt.Errorf("card not playable")
	}

	// Wild cards require a next_color.
	nextColor := currentColor
	if unoIsWild(card) {
		nc, _ := moveData["next_color"].(string)
		nc = strings.ToUpper(nc)
		if nc != "H" && nc != "D" && nc != "C" && nc != "S" {
			return false, nil, fmt.Errorf("must choose a color for wild card")
		}
		nextColor = nc
	}

	// Remove card from hand.
	hand = append(hand[:cardIdx], hand[cardIdx+1:]...)
	gameState.Hands[playerID] = hand

	// Add to discard.
	gameState.DiscardPile = append(gameState.DiscardPile, card)
	gameState.GameData["discard_top"] = card
	gameState.GameData["current_color"] = nextColor

	nPlayers := len(gameState.Players)
	dir := 1
	if d, ok := gameState.GameData["direction"].(float64); ok {
		dir = int(d)
	}

	// Handle action cards.
	extraSkip := 0
	switch unoRankOf(card) {
	case "S":
		// Skip: advance one extra step (the target player's turn is eaten).
		extraSkip = 1
		gameState.GameData["pending_draw"] = 0.0
	case "R":
		// Reverse: flip direction; in 2-player this acts like skip.
		dir = -dir
		gameState.GameData["direction"] = float64(dir)
		if nPlayers == 2 {
			extraSkip = 1
		}
		gameState.GameData["pending_draw"] = 0.0
	case "D2":
		// Draw Two: next player draws 2 and is skipped.
		gameState.GameData["pending_draw"] = float64(pendingDraw + 2)
		// Apply the forced draw + skip now so we can advance turn below normally.
		nextIdx := unoNextIdx(gameState.CurrentTurn, dir, nPlayers, 1)
		nextPlayerID := gameState.Players[nextIdx].UserID
		for i := 0; i < pendingDraw+2; i++ {
			drawn, newPile, newDiscard := unoDrawOne(gameState.DrawPile, gameState.DiscardPile)
			gameState.Hands[nextPlayerID] = append(gameState.Hands[nextPlayerID], drawn)
			gameState.DrawPile = newPile
			gameState.DiscardPile = newDiscard
		}
		gameState.GameData["pending_draw"] = 0.0
		extraSkip = 1
	case "W4":
		// Wild Draw Four: next player draws 4 and is skipped.
		gameState.GameData["pending_draw"] = float64(pendingDraw + 4)
		nextIdx := unoNextIdx(gameState.CurrentTurn, dir, nPlayers, 1)
		nextPlayerID := gameState.Players[nextIdx].UserID
		for i := 0; i < pendingDraw+4; i++ {
			drawn, newPile, newDiscard := unoDrawOne(gameState.DrawPile, gameState.DiscardPile)
			gameState.Hands[nextPlayerID] = append(gameState.Hands[nextPlayerID], drawn)
			gameState.DrawPile = newPile
			gameState.DiscardPile = newDiscard
		}
		gameState.GameData["pending_draw"] = 0.0
		extraSkip = 1
	default:
		gameState.GameData["pending_draw"] = 0.0
	}

	syncUnoPublicState(gameState)

	// Advance current turn by 1 (the caller also advances by 1 after ProcessMove returns,
	// so we pre-apply direction and extra-skip here and cancel the caller's advance).
	steps := 1 + extraSkip
	nextTurn := unoNextIdx(gameState.CurrentTurn, dir, nPlayers, steps)
	gameState.CurrentTurn = nextTurn - int(float64(dir)) // caller will add +1 which gives nextTurn
	if gameState.CurrentTurn < 0 {
		gameState.CurrentTurn += nPlayers
	}

	// Win: hand empty.
	if len(hand) == 0 {
		uid := playerID
		return true, &uid, nil
	}

	// Penalty: if player played last card without declaring UNO and has 1 card left —
	// v1: silently ignore (real UNO penalty requires another player to "catch" them).
	decls := unoDeclarations(gameState)
	delete(decls, fmt.Sprintf("%d", playerID))
	gameState.GameData["uno_declared"] = decls

	return false, nil, nil
}

// unoNextIdx computes the next turn index given direction and number of steps.
func unoNextIdx(current, dir, nPlayers, steps int) int {
	return ((current + dir*steps) % nPlayers + nPlayers) % nPlayers
}

// unoDrawOne pulls one card from the draw pile, reshuffling the discard if needed.
func unoDrawOne(drawPile, discardPile []string) (card string, newDraw []string, newDiscard []string) {
	if len(drawPile) == 0 {
		// Reshuffle discard (keep top card).
		top := discardPile[len(discardPile)-1]
		reshuffled := append([]string{}, discardPile[:len(discardPile)-1]...)
		ShuffleDeck(reshuffled)
		drawPile = reshuffled
		discardPile = []string{top}
	}
	card = drawPile[0]
	return card, drawPile[1:], discardPile
}

func unoCardPlayable(card, top, currentColor string, pendingDraw int) bool {
	rank := unoRankOf(card)
	// Wild Draw Four can only counter a pending draw or start fresh — always playable in v1.
	if rank == "W" || rank == "W4" {
		return true
	}
	// If there's a pending draw (stacked D2s), only another D2 or W4 can counter.
	if pendingDraw > 0 {
		return rank == "D2" || rank == "W4"
	}
	// Normal card: must match color or rank.
	return unoSuitOf(card) == currentColor || rank == unoRankOf(top)
}

func unoRankOf(card string) string {
	if card == "WC" {
		return "W"
	}
	if card == "W4C" {
		return "W4"
	}
	// Rank is everything but the last character (suit).
	if len(card) < 2 {
		return card
	}
	return card[:len(card)-1]
}

func unoSuitOf(card string) string {
	if unoIsWild(card) {
		return ""
	}
	return string(card[len(card)-1])
}

func unoIsWild(card string) bool {
	return card == "WC" || card == "W4C"
}

func unoIsActionOrWild(card string) bool {
	rank := unoRankOf(card)
	return rank == "S" || rank == "R" || rank == "D2" || rank == "W" || rank == "W4"
}

func unoDeclarations(gameState *GameSessionState) map[string]interface{} {
	raw := gameState.GameData["uno_declared"]
	if m, ok := raw.(map[string]interface{}); ok {
		return m
	}
	return map[string]interface{}{}
}
