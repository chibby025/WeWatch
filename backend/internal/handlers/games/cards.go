package games

import "math/rand"

// Cards are encoded as plain "<rank><suit>" strings ("AS", "10H", "8C", "KD") —
// same encoding-as-plain-string approach othello.go/checkers.go already use for
// board cells, keeping JSON (de)serialization trivial with no custom type needed.
var cardRanks = []string{"A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"}
var cardSuits = []string{"S", "H", "D", "C"}

// NewDeck returns a standard, unshuffled 52-card deck. Shared by any future card
// game, not just Crazy Eights.
func NewDeck() []string {
    deck := make([]string, 0, 52)
    for _, suit := range cardSuits {
        for _, rank := range cardRanks {
            deck = append(deck, rank+suit)
        }
    }
    return deck
}

// ShuffleDeck shuffles in place via Fisher-Yates.
func ShuffleDeck(deck []string) {
    rand.Shuffle(len(deck), func(i, j int) {
        deck[i], deck[j] = deck[j], deck[i]
    })
}

// cardRank returns everything but the trailing suit character, e.g. "10H" -> "10".
func cardRank(card string) string {
    return card[:len(card)-1]
}

// cardSuit returns the trailing suit character, e.g. "10H" -> "H".
func cardSuit(card string) string {
    return card[len(card)-1:]
}
