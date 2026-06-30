package games

import "fmt"

// Crazy Eights is the first game in this package with HIDDEN information — every
// other game (tic_tac_toe, chess, othello, checkers, trivia) is perfect-information,
// so broadcasting the full GameData to the whole room is fine. A card game can't
// work that way: GameSessionState.Hands/DrawPile/DiscardPile (declared on
// GameSessionState in game_manager.go) are deliberately kept OFF GameData and never
// touch a room-wide broadcast. Only non-revealing derivatives (hand_counts,
// draw_pile_count, discard_top, current_suit) go into GameData; the actual hand
// contents reach each player exclusively via a private hand_update message
// (websocket_handler.go, hub.BroadcastToUser) — never a room broadcast.

const crazyEightsHandSize = 7

// dealCrazyEights sets up a fresh shuffled deck, deals crazyEightsHandSize cards to
// each player, and flips the first non-8 card of the remaining deck as the discard
// pile's starting card (an 8 can't legally start the game — nobody has had a turn
// yet to name the wild suit it would require). Called once, directly from
// StartGame — unlike every other game here, a card game's players need to see their
// hands from the very first moment, before anyone has moved, so this can't wait for
// the usual "lazy-init on first move" pattern the perfect-information games use.
func dealCrazyEights(gameState *GameSessionState) {
    deck := NewDeck()
    ShuffleDeck(deck)

    hands := make(map[uint][]string, len(gameState.Players))
    for _, p := range gameState.Players {
        hands[p.UserID] = append([]string{}, deck[:crazyEightsHandSize]...)
        deck = deck[crazyEightsHandSize:]
    }

    topIdx := 0
    for cardRank(deck[topIdx]) == "8" {
        topIdx++
    }
    top := deck[topIdx]
    deck = append(deck[:topIdx], deck[topIdx+1:]...)

    gameState.Hands = hands
    gameState.DrawPile = deck
    gameState.DiscardPile = []string{top}
    gameState.GameData["discard_top"] = top
    gameState.GameData["current_suit"] = cardSuit(top)

    syncCrazyEightsPublicState(gameState)
}

// ensureCrazyEightsDealt is a defensive fallback mirroring the lazy-init pattern
// every other game in this package uses for GameData — Hands is always populated by
// dealCrazyEights at StartGame time in normal operation, but this guards against
// any path that reaches a move without it (e.g. a future direct API call that
// bypasses StartGame).
func ensureCrazyEightsDealt(gameState *GameSessionState) {
    if gameState.Hands == nil {
        dealCrazyEights(gameState)
    }
}

func (gm *GameManager) processCrazyEightsMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
    ensureCrazyEightsDealt(gameState)

    switch moveType {
    case "play_card":
        card, ok := moveData["card"].(string)
        if !ok {
            return false, nil, fmt.Errorf("missing card")
        }
        hand := gameState.Hands[playerID]
        idx := indexOfCard(hand, card)
        if idx == -1 {
            return false, nil, fmt.Errorf("you don't have that card")
        }

        topCard, _ := gameState.GameData["discard_top"].(string)
        currentSuit, _ := gameState.GameData["current_suit"].(string)
        isEight := cardRank(card) == "8"
        if !isEight && cardRank(card) != cardRank(topCard) && cardSuit(card) != currentSuit {
            return false, nil, fmt.Errorf("card doesn't match the current rank or suit")
        }

        nextSuit := cardSuit(card)
        if isEight {
            chosen, ok := moveData["next_suit"].(string)
            if !ok || !isValidSuit(chosen) {
                return false, nil, fmt.Errorf("must choose a suit when playing an 8")
            }
            nextSuit = chosen
        }

        hand = append(hand[:idx], hand[idx+1:]...)
        gameState.Hands[playerID] = hand
        gameState.DiscardPile = append(gameState.DiscardPile, card)
        gameState.GameData["discard_top"] = card
        gameState.GameData["current_suit"] = nextSuit
        syncCrazyEightsPublicState(gameState)

        if len(hand) == 0 {
            winner := playerID
            return true, &winner, nil
        }
        return false, nil, nil

    case "draw_card":
        card, drawErr := drawCrazyEightsCard(gameState)
        if drawErr != nil {
            return false, nil, drawErr
        }
        gameState.Hands[playerID] = append(gameState.Hands[playerID], card)
        syncCrazyEightsPublicState(gameState)
        return false, nil, nil

    default:
        return false, nil, fmt.Errorf("unknown move type: %s", moveType)
    }
}

// syncCrazyEightsPublicState refreshes the PUBLIC mirror fields in GameData
// (hand_counts, draw_pile_count) from the PRIVATE Hands/DrawPile. These counts are
// the only thing about hands/draw-pile that's safe to broadcast — the contents and
// draw order are the entire game's hidden information.
func syncCrazyEightsPublicState(gameState *GameSessionState) {
    handCounts := make(map[string]int, len(gameState.Hands))
    for _, p := range gameState.Players {
        handCounts[fmt.Sprintf("%d", p.UserID)] = len(gameState.Hands[p.UserID])
    }
    gameState.GameData["hand_counts"] = handCounts
    gameState.GameData["draw_pile_count"] = len(gameState.DrawPile)
}

// drawCrazyEightsCard pops one card from the draw pile, reshuffling the discard
// pile (minus its current top card, which must stay visible) into a fresh draw pile
// first if the draw pile has run out.
func drawCrazyEightsCard(gameState *GameSessionState) (string, error) {
    if len(gameState.DrawPile) == 0 {
        if len(gameState.DiscardPile) <= 1 {
            return "", fmt.Errorf("no cards left to draw")
        }
        top := gameState.DiscardPile[len(gameState.DiscardPile)-1]
        rest := append([]string{}, gameState.DiscardPile[:len(gameState.DiscardPile)-1]...)
        ShuffleDeck(rest)
        gameState.DrawPile = rest
        gameState.DiscardPile = []string{top}
    }
    last := len(gameState.DrawPile) - 1
    card := gameState.DrawPile[last]
    gameState.DrawPile = gameState.DrawPile[:last]
    return card, nil
}

func indexOfCard(hand []string, card string) int {
    for i, c := range hand {
        if c == card {
            return i
        }
    }
    return -1
}

func isValidSuit(s string) bool {
    for _, suit := range cardSuits {
        if s == suit {
            return true
        }
    }
    return false
}
