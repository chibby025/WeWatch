package games

import (
	"fmt"
	"strings"
)

// UNO: builds directly on the Crazy Eights hidden-hand architecture.
// Uses GameSessionState.Hands / DrawPile / DiscardPile (defined in game_manager.go).
// Public state in GameData: discard_top, current_color, hand_counts, draw_pile_count,
// direction, pending_draw (real Draw 2 / Wild Draw 4 stacking — see processUnoPlay),
// uno_declared (map playerID→bool), event_seq/last_event/last_event_actor/
// last_event_target (Skip/Reverse/Draw2/Wild4/caught, for client-side banners).
//
// Cards: "<rank><suit>" e.g. "7H", "SH" (Skip/Hearts), "RH" (Reverse/Hearts),
// "D2H" (Draw Two/Hearts), "WC" (Wild), "W4C" (Wild Draw Four) — suit irrelevant for
// Wild cards, stored as "C" by convention.
//
// Wild Draw Four is only legal when the player has no card matching the
// current color (see unoHasMatchingColor) — the standard "no legal
// alternative" restriction.
//
// move_types:
//   play        { card: "7H", next_color: "H"|"D"|"C"|"S" }  (next_color required for WC/W4C)
//   draw        {}   (draw 1 card, or the whole pending_draw stack if one is active)
//   uno         {}   (declare UNO for your current 1-card hand)
//   catch_uno   { target_id: 5 }  (catch a player with 1 card who hasn't declared —
//                                  they draw 2 penalty cards. Any player, any time.)

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
	// Event tracking so every connected client (not just the mover) can
	// reliably animate/announce Skip, Reverse, Draw Two, Wild Draw Four, and
	// UNO-catch moments in real time. event_seq is monotonic and never
	// reset — same edge-detection pattern used elsewhere in this package.
	gameState.GameData["event_seq"] = 0
	gameState.GameData["last_event"] = ""         // "skip" | "reverse" | "draw2" | "wild4" | "caught"
	gameState.GameData["last_event_actor"] = nil  // who played the card / made the catch
	gameState.GameData["last_event_target"] = nil // who was skipped / forced to draw / caught

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

	// UNO is registered in simultaneousGames (game_manager.go) specifically so
	// catch_uno can be sent by any player at any time, not just whoever's
	// turn it is. "uno" (declaring) is also exempt — it's about the caller's
	// own hand, not a turn action, and critically it needs to work AFTER a
	// player's own play already reduced them to 1 card and advanced the turn
	// to someone else (the exact moment the frontend shows the button) — a
	// real bug found by testing that exact sequence, not a hypothetical.
	// play/draw still require it to genuinely be your turn.
	if moveType != "catch_uno" && moveType != "uno" {
		currentPlayer := gameState.Players[gameState.CurrentTurn]
		if currentPlayer.UserID != playerID {
			return false, nil, fmt.Errorf("not your turn")
		}
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

	case "catch_uno":
		return gm.processUnoCatch(gameState, playerID, moveData)

	case "draw":
		pendingDrawF, _ := gameState.GameData["pending_draw"].(float64)
		pendingDraw := int(pendingDrawF)
		drawCount := 1
		if pendingDraw > 0 {
			// No D2/W4 to counter with — draw the whole accumulated stack.
			// This is what actually resolves stacking; the turn then simply
			// advances to the next player with nothing further to do.
			drawCount = pendingDraw
		}
		hand := gameState.Hands[playerID]
		for i := 0; i < drawCount; i++ {
			drawn, newPile, newDiscard := unoDrawOne(gameState.DrawPile, gameState.DiscardPile)
			hand = append(hand, drawn)
			gameState.DrawPile = newPile
			gameState.DiscardPile = newDiscard
		}
		gameState.Hands[playerID] = hand
		if pendingDraw > 0 {
			gameState.GameData["pending_draw"] = 0.0
		}
		syncUnoPublicState(gameState)
		return false, nil, nil

	case "play":
		return gm.processUnoPlay(gameState, playerID, moveData)

	default:
		return false, nil, fmt.Errorf("unknown move type: %s", moveType)
	}
}

// processUnoCatch: any player may catch another player who has exactly one
// card left and hasn't declared UNO for it — the target draws 2 penalty
// cards. Not a turn action (the caller compensates the generic turn-advance).
func (gm *GameManager) processUnoCatch(gameState *GameSessionState, playerID uint, moveData map[string]interface{}) (bool, *uint, error) {
	targetIDF, _ := moveData["target_id"].(float64)
	targetID := uint(targetIDF)
	if targetID == 0 {
		return false, nil, fmt.Errorf("target_id required")
	}
	if targetID == playerID {
		return false, nil, fmt.Errorf("can't catch yourself")
	}

	targetHand, ok := gameState.Hands[targetID]
	if !ok {
		return false, nil, fmt.Errorf("target not in this game")
	}
	decls := unoDeclarations(gameState)
	declared, _ := decls[fmt.Sprintf("%d", targetID)].(bool)

	if len(targetHand) != 1 || declared {
		return false, nil, fmt.Errorf("nothing to catch")
	}

	for i := 0; i < 2; i++ {
		drawn, newPile, newDiscard := unoDrawOne(gameState.DrawPile, gameState.DiscardPile)
		targetHand = append(targetHand, drawn)
		gameState.DrawPile = newPile
		gameState.DiscardPile = newDiscard
	}
	gameState.Hands[targetID] = targetHand
	syncUnoPublicState(gameState)
	unoRecordEvent(gameState, "caught", playerID, targetID)

	// Cancel turn advance — catching isn't a turn action.
	gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
	return false, nil, nil
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

	// Wild Draw Four is only legal when the player has no card matching the
	// current color — the classic "no legal alternative" restriction. Without
	// this, W4 could always be played regardless of hand, which also makes
	// the challenge move meaningless (nothing would ever actually be illegal).
	if unoRankOf(card) == "W4" && unoHasMatchingColor(hand, currentColor) {
		return false, nil, fmt.Errorf("you have a matching color card — Wild Draw Four isn't allowed")
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

	// Handle action cards. Draw Two / Wild Draw Four DEFER the forced draw —
	// they only accumulate pending_draw here; it's actually resolved later,
	// either by the next player countering with another D2/W4 (stacking it
	// further) or by them drawing the whole pile via the "draw" move type.
	// This is what makes stacking real: the next player gets a genuine chance
	// to respond instead of the draw being forced instantly within this move.
	extraSkip := 0
	switch unoRankOf(card) {
	case "S":
		// Skip: advance one extra step (the target player's turn is eaten).
		nextIdx := unoNextIdx(gameState.CurrentTurn, dir, nPlayers, 1)
		unoRecordEvent(gameState, "skip", playerID, gameState.Players[nextIdx].UserID)
		extraSkip = 1
		gameState.GameData["pending_draw"] = 0.0
	case "R":
		// Reverse: flip direction; in 2-player this acts like skip.
		dir = -dir
		gameState.GameData["direction"] = float64(dir)
		if nPlayers == 2 {
			extraSkip = 1
		}
		nextIdx := unoNextIdx(gameState.CurrentTurn, dir, nPlayers, 1)
		unoRecordEvent(gameState, "reverse", playerID, gameState.Players[nextIdx].UserID)
		gameState.GameData["pending_draw"] = 0.0
	case "D2":
		gameState.GameData["pending_draw"] = float64(pendingDraw + 2)
		nextIdx := unoNextIdx(gameState.CurrentTurn, dir, nPlayers, 1)
		unoRecordEvent(gameState, "draw2", playerID, gameState.Players[nextIdx].UserID)
	case "W4":
		gameState.GameData["pending_draw"] = float64(pendingDraw + 4)
		nextIdx := unoNextIdx(gameState.CurrentTurn, dir, nPlayers, 1)
		unoRecordEvent(gameState, "wild4", playerID, gameState.Players[nextIdx].UserID)
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

	// This play changed the player's hand, so any earlier UNO declaration no
	// longer applies to their new hand — if they're now down to 1 card, they
	// must declare again or risk being caught (see processUnoCatch).
	decls := unoDeclarations(gameState)
	delete(decls, fmt.Sprintf("%d", playerID))
	gameState.GameData["uno_declared"] = decls

	return false, nil, nil
}

// unoNextIdx computes the next turn index given direction and number of steps.
func unoNextIdx(current, dir, nPlayers, steps int) int {
	return ((current+dir*steps)%nPlayers + nPlayers) % nPlayers
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
	// Wild cards are always structurally playable here — W4's "no matching
	// color in hand" restriction needs the full hand, which this function
	// doesn't have, so it's enforced separately in processUnoPlay.
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

// unoHasMatchingColor reports whether hand contains any non-wild card whose
// color matches the given color — used to enforce Wild Draw Four's "only
// when you have no legal alternative" restriction.
func unoHasMatchingColor(hand []string, color string) bool {
	for _, c := range hand {
		if !unoIsWild(c) && unoSuitOf(c) == color {
			return true
		}
	}
	return false
}

// unoRecordEvent stamps a monotonic, edge-detectable event onto GameData so
// every connected client (mover or spectator) can reliably animate/announce
// Skip, Reverse, Draw 2, Wild Draw 4, and catch moments exactly once — the
// same event_seq pattern used elsewhere in this package (e.g. Glass Bridge's
// move_seq, Ludo's capture_seq).
func unoRecordEvent(gameState *GameSessionState, event string, actorID, targetID uint) {
	gameState.GameData["event_seq"] = gbInt(gameState.GameData["event_seq"]) + 1
	gameState.GameData["last_event"] = event
	gameState.GameData["last_event_actor"] = actorID
	gameState.GameData["last_event_target"] = targetID
}
