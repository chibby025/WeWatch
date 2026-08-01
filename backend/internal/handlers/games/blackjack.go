package games

import "fmt"

// Blackjack: each player plays their own hand against a shared dealer. Turn-based
// (each player hits/stands in sequence), NOT simultaneous. Hidden information: the
// draw pile order and the dealer's hole card (card index 1) until the dealer turn.
//
// State layout:
//   Private (GameSessionState): Hands[playerID] = player cards, DrawPile = shoe,
//     dealer's cards live in GameData["dealer_hand"] (the full 2+ cards) but only
//     GameData["dealer_visible"] (card 0) is shown until phase == "dealer_turn".
//   Public (GameData): phase, hand_counts, hand_values, player_statuses, dealer_visible,
//     dealer_value (only meaningful once revealed), dealer_hand (only set at reveal).
//
// Unlike Crazy Eights there's no per-player secrecy about a player's own hand vs the
// others' — a blackjack player's cards are shown to the whole table (this matches how
// the game is normally played at a table). So the hands go through the public hand_values
// (best total per player) rather than a private hand_update. We still keep card contents
// out of a broadcast for the DEALER's hole card only.
//
// Phases: "player_turns" → "dealer_turn" → "results".

// NewBlackjackDeck returns a standard, unshuffled 52-card deck in the "<rank><suit>"
// encoding used throughout this package. Ranks A,2-10,J,Q,K across S,H,D,C. Distinct
// from NewUnoDeck() (108 UNO cards) — Blackjack is a classic playing-card game.
func NewBlackjackDeck() []string {
	return NewDeck() // NewDeck() (cards.go) already builds exactly the 52 standard cards.
}

// blackjackCardValue returns the base value of a single card; aces count as 11 here
// and are demoted to 1 later by blackjackHandValue if the hand would otherwise bust.
func blackjackCardValue(card string) int {
	switch cardRank(card) {
	case "A":
		return 11
	case "K", "Q", "J", "10":
		return 10
	default:
		// "2".."9"
		return int(card[0] - '0')
	}
}

// blackjackHandValue computes the best (highest not-over-21 if possible) total for a
// hand: start with all aces as 11, then demote aces to 1 one at a time while busting.
func blackjackHandValue(hand []string) int {
	total := 0
	aces := 0
	for _, card := range hand {
		v := blackjackCardValue(card)
		total += v
		if cardRank(card) == "A" {
			aces++
		}
	}
	for total > 21 && aces > 0 {
		total -= 10 // demote one ace from 11 to 1
		aces--
	}
	return total
}

// dealBlackjack sets up the shoe and deals two cards to each player and the dealer.
// Called directly from StartGame (like dealCrazyEights) — players need to see their
// starting hands before anyone acts, so this can't be lazy-initialized.
func dealBlackjack(gameState *GameSessionState) {
	deck := NewBlackjackDeck()
	ShuffleDeck(deck)

	hands := make(map[uint][]string, len(gameState.Players))
	for _, p := range gameState.Players {
		hands[p.UserID] = append([]string{}, deck[:2]...)
		deck = deck[2:]
	}

	dealer := append([]string{}, deck[:2]...)
	deck = deck[2:]

	gameState.Hands = hands
	gameState.DrawPile = deck
	gameState.GameData["dealer_hand"] = dealer       // full hand — see blackjackPublicState for how the hole card actually stays hidden
	gameState.GameData["dealer_visible"] = dealer[0] // the one up-card everyone can see
	gameState.GameData["phase"] = "player_turns"

	blackjackApplyDealResults(gameState)
}

// blackjackApplyDealResults computes each player's starting status (a natural
// blackjack — 21 on the first two cards — is locked in immediately, since
// real rules never let a player hit past an already-maximum hand), picks the
// correct starting turn, and settles the round right away in the rare case
// nobody can act. Split out from dealBlackjack so it's testable without
// needing a real shuffled deal — gameState.Hands/dealer_hand just need to
// already be set.
func blackjackApplyDealResults(gameState *GameSessionState) {
	// A natural gets a distinct "blackjack" status (not "playing") and is
	// excluded from turn order by the same status check
	// allPlayersDone/advanceToNextActivePlayer already use for stood/bust.
	statuses := make(map[string]interface{}, len(gameState.Players))
	gameState.CurrentTurn = -1
	for i, p := range gameState.Players {
		key := fmt.Sprintf("%d", p.UserID)
		if blackjackIsNatural(gameState.Hands[p.UserID]) {
			statuses[key] = "blackjack"
			continue
		}
		statuses[key] = "playing"
		if gameState.CurrentTurn == -1 {
			gameState.CurrentTurn = i
		}
	}
	if gameState.CurrentTurn == -1 {
		gameState.CurrentTurn = 0 // nobody can act — settled immediately below
	}
	gameState.GameData["player_statuses"] = statuses

	syncBlackjackPublicState(gameState)

	// Extremely rare (requires every single player to independently draw a
	// natural), but must be handled: without this the game would sit in
	// "player_turns" forever with nobody able to act. Known, accepted gap:
	// this settles the round's state directly without going through
	// endGameLocked (which broadcasts game_ended and expects to run after
	// the initial game_started broadcast has already gone out — calling it
	// from inside StartGame, before that first broadcast, risks an
	// out-of-order game_ended-before-game_started on the wire). The room
	// will correctly show this game as finished but stays marked as "has an
	// active game" until the host explicitly ends it — not worth that risk
	// for a case this unlikely.
	if allPlayersDone(gameState) {
		runDealerTurnAndSettle(gameState)
	}
}

// blackjackIsNatural reports whether a 2-card hand is a natural blackjack
// (21 on the deal). Note this can only be true with exactly one Ace and one
// 10-value card, which is also why no separate "was the up-card an Ace or
// 10" pre-check is needed anywhere this is used.
func blackjackIsNatural(hand []string) bool {
	return len(hand) == 2 && blackjackHandValue(hand) == 21
}

func ensureBlackjackDealt(gameState *GameSessionState) {
	if gameState.Hands == nil {
		dealBlackjack(gameState)
	}
}

// syncBlackjackPublicState mirrors the shareable derivatives into GameData. Player
// hand contents ARE public in blackjack, so we expose player_hands too. The dealer's
// hole card is stripped from the actual broadcast by blackjackPublicState below
// (registered in game_manager.go's publicGameData) — GameData itself still holds the
// full dealer_hand for the server's own use (settling the round).
func syncBlackjackPublicState(gameState *GameSessionState) {
	handCounts := make(map[string]int, len(gameState.Players))
	handValues := make(map[string]int, len(gameState.Players))
	handCards := make(map[string]interface{}, len(gameState.Players))
	for _, p := range gameState.Players {
		key := fmt.Sprintf("%d", p.UserID)
		hand := gameState.Hands[p.UserID]
		handCounts[key] = len(hand)
		handValues[key] = blackjackHandValue(hand)
		handCards[key] = append([]string{}, hand...)
	}
	gameState.GameData["hand_counts"] = handCounts
	gameState.GameData["hand_values"] = handValues
	gameState.GameData["player_hands"] = handCards
	gameState.GameData["draw_pile_count"] = len(gameState.DrawPile)

	// Dealer's revealed value only makes sense once the hole card is flipped; before
	// that, expose only the up-card's value so the UI can hint.
	if phase, _ := gameState.GameData["phase"].(string); phase == "dealer_turn" || phase == "results" {
		dealer := blackjackDealerHand(gameState)
		gameState.GameData["dealer_value"] = blackjackHandValue(dealer)
	} else {
		visible, _ := gameState.GameData["dealer_visible"].(string)
		gameState.GameData["dealer_value"] = blackjackCardValue(visible)
	}
}

// blackjackPublicState strips the dealer's hole card from the broadcast
// payload until the reveal. Before this function existed, blackjack had no
// entry in game_manager.go's publicGameData switch at all, so the full
// dealer_hand (including the hole card) was sent to every client from the
// moment the game started — the comments elsewhere in this file describing
// it as "hidden until dealer_turn" were describing the intent, not what was
// actually happening on the wire. GameData itself is untouched; only the
// broadcast copy has it removed.
func blackjackPublicState(data map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(data))
	for k, v := range data {
		out[k] = v
	}
	phase, _ := data["phase"].(string)
	if phase != "dealer_turn" && phase != "results" {
		delete(out, "dealer_hand")
	}
	return out
}

func blackjackDealerHand(gameState *GameSessionState) []string {
	raw := gameState.GameData["dealer_hand"]
	if arr, ok := raw.([]string); ok {
		return arr
	}
	if arr, ok := raw.([]interface{}); ok {
		out := make([]string, 0, len(arr))
		for _, v := range arr {
			if s, ok := v.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	return nil
}

func blackjackStatuses(gameState *GameSessionState) map[string]interface{} {
	raw := gameState.GameData["player_statuses"]
	if m, ok := raw.(map[string]interface{}); ok {
		return m
	}
	m := map[string]interface{}{}
	gameState.GameData["player_statuses"] = m
	return m
}

// blackjackDrawCard pops one card from the shoe.
func blackjackDrawCard(gameState *GameSessionState) (string, error) {
	if len(gameState.DrawPile) == 0 {
		return "", fmt.Errorf("shoe is empty")
	}
	last := len(gameState.DrawPile) - 1
	card := gameState.DrawPile[last]
	gameState.DrawPile = gameState.DrawPile[:last]
	return card, nil
}

// allPlayersDone reports whether every player has finished acting (stood/bust/double).
func allPlayersDone(gameState *GameSessionState) bool {
	statuses := blackjackStatuses(gameState)
	for _, p := range gameState.Players {
		s, _ := statuses[fmt.Sprintf("%d", p.UserID)].(string)
		if s == "playing" {
			return false
		}
	}
	return true
}

// advanceToNextActivePlayer moves CurrentTurn to the next player still "playing".
// The generic ProcessMove turn-advance is suppressed for blackjack (see game_manager)
// because a bust/stand may need to skip over multiple already-done players.
func advanceToNextActivePlayer(gameState *GameSessionState) {
	statuses := blackjackStatuses(gameState)
	n := len(gameState.Players)
	for i := 1; i <= n; i++ {
		idx := (gameState.CurrentTurn + i) % n
		s, _ := statuses[fmt.Sprintf("%d", gameState.Players[idx].UserID)].(string)
		if s == "playing" {
			gameState.CurrentTurn = idx
			return
		}
	}
}

// runDealerTurnAndSettle flips the hole card, hits to 17+, then decides each player's
// result and returns the single winnerID (highest scorer who beat the dealer, or nil
// if none/tie).
func runDealerTurnAndSettle(gameState *GameSessionState) (bool, *uint, error) {
	gameState.GameData["phase"] = "dealer_turn"

	dealer := blackjackDealerHand(gameState)
	for blackjackHandValue(dealer) < 17 {
		card, err := blackjackDrawCard(gameState)
		if err != nil {
			break
		}
		dealer = append(dealer, card)
	}
	gameState.GameData["dealer_hand"] = dealer
	dealerVal := blackjackHandValue(dealer)
	dealerBust := dealerVal > 21
	// A natural dealer hand (21 on the first 2 cards) never enters the hit
	// loop above (its value is already >= 17), so `dealer` here is still the
	// original 2 cards either way — safe to check naturalness post-loop.
	dealerNatural := blackjackIsNatural(dealer)

	statuses := blackjackStatuses(gameState)
	var winners []uint
	var bestWinnerScore int = -1
	var bestWinnerID *uint

	for _, p := range gameState.Players {
		key := fmt.Sprintf("%d", p.UserID)
		hand := gameState.Hands[p.UserID]
		playerVal := blackjackHandValue(hand)
		playerNatural := blackjackIsNatural(hand)
		var result string
		switch {
		case playerVal > 21:
			result = "lost" // player busted earlier
		case playerNatural && dealerNatural:
			result = "push" // both naturals — genuine tie
		case playerNatural:
			result = "won" // natural blackjack beats any non-natural dealer total, including a built 21
		case dealerNatural:
			result = "lost" // dealer's natural beats any non-natural player total, including a built 21
		case dealerBust || playerVal > dealerVal:
			result = "won"
		case playerVal == dealerVal:
			result = "push"
		default:
			result = "lost"
		}
		if result == "won" {
			winners = append(winners, p.UserID)
			if playerVal > bestWinnerScore {
				bestWinnerScore = playerVal
				id := p.UserID
				bestWinnerID = &id
			}
		}
		statuses[key] = result
	}
	gameState.GameData["player_statuses"] = statuses
	gameState.GameData["phase"] = "results"
	syncBlackjackPublicState(gameState)

	// If exactly one player won, that's the winnerID; if multiple tied for the top
	// winning score, no single winner (draw among winners).
	topScorers := 0
	for _, p := range gameState.Players {
		if blackjackHandValue(gameState.Hands[p.UserID]) == bestWinnerScore {
			// only count actual winners
			if s, _ := statuses[fmt.Sprintf("%d", p.UserID)].(string); s == "won" {
				topScorers++
			}
		}
	}
	if len(winners) == 0 || topScorers != 1 {
		return true, nil, nil
	}
	return true, bestWinnerID, nil
}

func (gm *GameManager) processBlackjackMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	ensureBlackjackDealt(gameState)

	phase, _ := gameState.GameData["phase"].(string)
	if phase != "player_turns" {
		return false, nil, fmt.Errorf("no longer accepting player actions")
	}
	statuses := blackjackStatuses(gameState)
	key := fmt.Sprintf("%d", playerID)
	if s, _ := statuses[key].(string); s != "playing" {
		return false, nil, fmt.Errorf("you have already finished your turn")
	}

	switch moveType {
	case "hit":
		card, drawErr := blackjackDrawCard(gameState)
		if drawErr != nil {
			return false, nil, drawErr
		}
		gameState.Hands[playerID] = append(gameState.Hands[playerID], card)
		if blackjackHandValue(gameState.Hands[playerID]) > 21 {
			statuses[key] = "bust"
			gameState.GameData["player_statuses"] = statuses
			advanceToNextActivePlayer(gameState)
		}
		syncBlackjackPublicState(gameState)

	case "stand":
		statuses[key] = "stood"
		gameState.GameData["player_statuses"] = statuses
		advanceToNextActivePlayer(gameState)
		syncBlackjackPublicState(gameState)

	case "double":
		// Real blackjack only allows doubling down on your original two cards —
		// never after you've already hit. Nothing enforced this before, so a
		// player could hit repeatedly and still double at any point.
		if len(gameState.Hands[playerID]) != 2 {
			return false, nil, fmt.Errorf("can only double down on your first two cards")
		}
		card, drawErr := blackjackDrawCard(gameState)
		if drawErr != nil {
			return false, nil, drawErr
		}
		gameState.Hands[playerID] = append(gameState.Hands[playerID], card)
		if blackjackHandValue(gameState.Hands[playerID]) > 21 {
			statuses[key] = "bust"
		} else {
			statuses[key] = "stood"
		}
		gameState.GameData["player_statuses"] = statuses
		advanceToNextActivePlayer(gameState)
		syncBlackjackPublicState(gameState)

	default:
		return false, nil, fmt.Errorf("unknown blackjack move type: %s", moveType)
	}

	// Once everyone has finished acting, run the dealer and settle.
	if allPlayersDone(gameState) {
		return runDealerTurnAndSettle(gameState)
	}
	return false, nil, nil
}
