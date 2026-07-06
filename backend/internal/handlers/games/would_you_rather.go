package games

import (
	"fmt"
	"math/rand"
)

// Would You Rather: host-driven social game.
// State machine: "presenting" → players vote A or B → "reveal" (results shown) →
// host advances to next question → "presenting" again.
// move_types: "vote" (player picks "A" or "B"), "next" (host advances), "end" (host ends).
//
// All state is perfect-information — everyone sees the question and the running tally
// after reveal. No hidden state needed.

var wyrQuestions = []struct {
	A, B string
}{
	{"Watch the same movie on repeat for a year", "Never watch movies again"},
	{"Have no internet for a month", "Have no phone for a month"},
	{"Always speak in rhymes", "Always speak in a different language"},
	{"Know when you're going to die", "Know how you're going to die"},
	{"Be famous but hated", "Be unknown but loved"},
	{"Live without music", "Live without TV/streaming"},
	{"Rewind time 10 years", "Fast-forward time 10 years"},
	{"Never use social media again", "Never watch another film/series"},
	{"Have a photographic memory", "Be able to forget anything instantly"},
	{"Always be 10 minutes late", "Always be 2 hours early"},
	{"Lose your keys every day", "Have your phone die at 10% every day"},
	{"Fight 100 duck-sized horses", "Fight 1 horse-sized duck"},
	{"Travel the world with no money", "Stay home with unlimited money"},
	{"Live in a world without pain", "Live in a world without fear"},
	{"Be able to talk to animals", "Read people's minds"},
	{"Never have to sleep", "Never have to eat"},
	{"Go to space", "Go to the deepest part of the ocean"},
	{"Be the funniest person in the room", "Be the smartest person in the room"},
	{"Know every language", "Play every instrument"},
	{"Have unlimited battery life on all devices", "Never have traffic on your commute"},
	{"Always be underdressed", "Always be overdressed"},
	{"Find true love and be poor", "Be rich and never find love"},
	{"Live in a haunted house", "Live next to a cemetery"},
	{"Give up hot showers", "Give up AC and heating"},
	{"Be invisible for a day", "Fly for a day"},
}

func wyrInitialState(numPlayers int) map[string]interface{} {
	// Shuffle a copy of the question list so each game gets a different order.
	indices := rand.Perm(len(wyrQuestions))
	order := make([]int, len(wyrQuestions))
	copy(order, indices)

	q := wyrQuestions[order[0]]
	return map[string]interface{}{
		"phase":          "presenting",
		"question_index": 0,
		"question_order": floatSlice(order),
		"option_a":       q.A,
		"option_b":       q.B,
		"votes":          map[string]interface{}{},
		"tally_a":        0,
		"tally_b":        0,
		"round":          1,
		"total_rounds":   len(wyrQuestions),
	}
}

func (gm *GameManager) processWouldYouRatherMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	ensureWyrState(gameState)

	phase, _ := gameState.GameData["phase"].(string)

	switch moveType {
	case "vote":
		if phase != "presenting" {
			return false, nil, fmt.Errorf("not in voting phase")
		}
		choice, _ := moveData["choice"].(string)
		if choice != "A" && choice != "B" {
			return false, nil, fmt.Errorf("choice must be A or B")
		}
		votes := wyrVotes(gameState)
		playerKey := fmt.Sprintf("%d", playerID)
		votes[playerKey] = choice
		gameState.GameData["votes"] = votes

		// Tally
		tallyA, tallyB := 0, 0
		for _, v := range votes {
			if v == "A" {
				tallyA++
			} else {
				tallyB++
			}
		}
		gameState.GameData["tally_a"] = tallyA
		gameState.GameData["tally_b"] = tallyB

		// Auto-reveal once every player has voted
		numPlayers := len(gameState.Players)
		if len(votes) >= numPlayers {
			gameState.GameData["phase"] = "reveal"
		}
		// cancel auto-advance: same player's turn (votes aren't turn-based)
		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil

	case "next":
		// Only the host can advance. Host is Players[0] by convention.
		if playerID != gameState.Players[0].UserID {
			return false, nil, fmt.Errorf("only the host can advance")
		}

		orderRaw := gameState.GameData["question_order"].([]interface{})
		idxF := gameState.GameData["question_index"].(float64)
		idx := int(idxF) + 1
		if idx >= len(orderRaw) {
			// No more questions — game over (no winner, just fun).
			return true, nil, nil
		}

		qIdx := int(orderRaw[idx].(float64))
		q := wyrQuestions[qIdx]
		gameState.GameData["question_index"] = float64(idx)
		gameState.GameData["option_a"] = q.A
		gameState.GameData["option_b"] = q.B
		gameState.GameData["phase"] = "presenting"
		gameState.GameData["votes"] = map[string]interface{}{}
		gameState.GameData["tally_a"] = 0
		gameState.GameData["tally_b"] = 0
		gameState.GameData["round"] = float64(idx + 1)

		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil

	case "end":
		if playerID != gameState.Players[0].UserID {
			return false, nil, fmt.Errorf("only the host can end the game")
		}
		return true, nil, nil

	default:
		return false, nil, fmt.Errorf("unknown move type: %s", moveType)
	}
}

func ensureWyrState(gameState *GameSessionState) {
	if gameState.GameData["phase"] == nil {
		for k, v := range wyrInitialState(len(gameState.Players)) {
			gameState.GameData[k] = v
		}
	}
}

func wyrVotes(gameState *GameSessionState) map[string]string {
	raw := gameState.GameData["votes"]
	if raw == nil {
		return map[string]string{}
	}
	if m, ok := raw.(map[string]string); ok {
		return m
	}
	// Unmarshalled from JSON as map[string]interface{}
	if m, ok := raw.(map[string]interface{}); ok {
		result := make(map[string]string, len(m))
		for k, v := range m {
			if s, ok := v.(string); ok {
				result[k] = s
			}
		}
		return result
	}
	return map[string]string{}
}

func floatSlice(ints []int) []float64 {
	out := make([]float64, len(ints))
	for i, v := range ints {
		out[i] = float64(v)
	}
	return out
}
