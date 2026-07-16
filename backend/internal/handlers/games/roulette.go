package games

import (
	"fmt"
	"math/rand"
)

// European roulette — single zero (0–36).
// State (all stored in GameData):
//   phase: "betting" | "spinning" | "reveal" | "ended"
//   round: int
//   chips: map[string]int  (userID → chip count)
//   bets:  map[string][]RoutetteBet  serialised as []interface{} JSON
//   result: int (-1 = not yet spun)
//   history: []int
//   payouts: map[string]int  (net change this round per user)
//   winner_id: nil|string (for ended phase)

// Starting chip count per player.
const rouletteStartChips = 1000

// Chip floor — when a player is at 0 they get this many free chips so they can still bet.
const rouletteChipFloor = 50

// European roulette number→colour.
var rouletteRed = map[int]bool{
	1: true, 3: true, 5: true, 7: true, 9: true, 12: true,
	14: true, 16: true, 18: true, 19: true, 21: true, 23: true,
	25: true, 27: true, 30: true, 32: true, 34: true, 36: true,
}

func rouletteColor(n int) string {
	if n == 0 {
		return "green"
	}
	if rouletteRed[n] {
		return "red"
	}
	return "black"
}

func rouletteChips(gameState *GameSessionState) map[string]int {
	raw, ok := gameState.GameData["chips"]
	if !ok || raw == nil {
		return map[string]int{}
	}
	switch v := raw.(type) {
	case map[string]int:
		return v
	case map[string]interface{}:
		out := make(map[string]int, len(v))
		for k, val := range v {
			switch n := val.(type) {
			case float64:
				out[k] = int(n)
			case int:
				out[k] = n
			}
		}
		return out
	}
	return map[string]int{}
}

// Each bet is: type (number/red/black/odd/even), number (-1 if not a number bet), amount.
type rouletteBet struct {
	Type   string
	Number int
	Amount int
}

func parseBets(raw interface{}) []rouletteBet {
	slice, ok := raw.([]interface{})
	if !ok {
		return nil
	}
	var out []rouletteBet
	for _, item := range slice {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		b := rouletteBet{Number: -1}
		if t, ok := m["type"].(string); ok {
			b.Type = t
		}
		if n, ok := m["number"].(float64); ok {
			b.Number = int(n)
		}
		if a, ok := m["amount"].(float64); ok {
			b.Amount = int(a)
		}
		if b.Type != "" && b.Amount > 0 {
			out = append(out, b)
		}
	}
	return out
}

func (gm *GameManager) processRouletteMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	key := fmt.Sprintf("%d", playerID)
	phase, _ := gameState.GameData["phase"].(string)
	isHost := gameState.Players[0].UserID == playerID

	chips := rouletteChips(gameState)

	// Ensure every player has chips seeded.
	for _, p := range gameState.Players {
		k := fmt.Sprintf("%d", p.UserID)
		if _, exists := chips[k]; !exists {
			chips[k] = rouletteStartChips
		}
		if chips[k] <= 0 {
			chips[k] = rouletteChipFloor
		}
	}

	switch moveType {

	case "place_bet":
		if phase != "betting" {
			return false, nil, fmt.Errorf("bets only accepted during betting phase")
		}
		betType, _ := moveData["bet_type"].(string)
		betAmountF, _ := moveData["amount"].(float64)
		betAmount := int(betAmountF)
		betNumber := -1
		if n, ok := moveData["number"].(float64); ok {
			betNumber = int(n)
		}

		if betType == "" || betAmount <= 0 {
			return false, nil, fmt.Errorf("invalid bet")
		}
		if betType == "number" && (betNumber < 0 || betNumber > 36) {
			return false, nil, fmt.Errorf("invalid number bet")
		}

		if chips[key] < betAmount {
			return false, nil, fmt.Errorf("not enough chips")
		}

		// Deduct chips immediately (held while bet is open).
		chips[key] -= betAmount

		// Store bet.
		allBets, _ := gameState.GameData["bets"].(map[string]interface{})
		if allBets == nil {
			allBets = map[string]interface{}{}
		}
		existing := parseBets(allBets[key])
		existing = append(existing, rouletteBet{Type: betType, Number: betNumber, Amount: betAmount})

		// Convert back to []interface{} for JSON.
		bSlice := make([]interface{}, len(existing))
		for i, b := range existing {
			bSlice[i] = map[string]interface{}{
				"type":   b.Type,
				"number": b.Number,
				"amount": b.Amount,
			}
		}
		allBets[key] = bSlice
		gameState.GameData["bets"] = allBets
		gameState.GameData["chips"] = chips
		return false, nil, nil

	case "clear_bets":
		if phase != "betting" {
			return false, nil, fmt.Errorf("can only clear bets during betting phase")
		}
		// Refund this player's bets.
		allBets, _ := gameState.GameData["bets"].(map[string]interface{})
		if allBets != nil {
			for _, b := range parseBets(allBets[key]) {
				chips[key] += b.Amount
			}
			delete(allBets, key)
			gameState.GameData["bets"] = allBets
		}
		gameState.GameData["chips"] = chips
		return false, nil, nil

	case "spin":
		if !isHost {
			return false, nil, fmt.Errorf("only the host can spin")
		}
		if phase != "betting" {
			return false, nil, fmt.Errorf("can only spin during betting phase")
		}

		result := rand.Intn(37) // 0–36
		resultColor := rouletteColor(result)

		// Settle bets and compute payouts.
		allBets, _ := gameState.GameData["bets"].(map[string]interface{})
		if allBets == nil {
			allBets = map[string]interface{}{}
		}
		payouts := map[string]int{}

		for _, p := range gameState.Players {
			k := fmt.Sprintf("%d", p.UserID)
			bets := parseBets(allBets[k])
			net := 0
			for _, b := range bets {
				win := false
				multiplier := 0
				switch b.Type {
				case "number":
					win = b.Number == result
					multiplier = 35
				case "red":
					win = resultColor == "red"
					multiplier = 1
				case "black":
					win = resultColor == "black"
					multiplier = 1
				case "odd":
					win = result != 0 && result%2 == 1
					multiplier = 1
				case "even":
					win = result != 0 && result%2 == 0
					multiplier = 1
				}
				if win {
					// Return stake + winnings.
					chips[k] += b.Amount + b.Amount*multiplier
					net += b.Amount * multiplier
				}
				// Chips were already deducted on place_bet, so lost bets require no action.
			}
			payouts[k] = net
		}

		// Append to history.
		history, _ := gameState.GameData["history"].([]interface{})
		history = append(history, result)

		// Ensure chip floor.
		for _, p := range gameState.Players {
			k := fmt.Sprintf("%d", p.UserID)
			if chips[k] <= 0 {
				chips[k] = rouletteChipFloor
			}
		}

		gameState.GameData["phase"] = "reveal"
		gameState.GameData["result"] = result
		gameState.GameData["result_color"] = resultColor
		gameState.GameData["history"] = history
		gameState.GameData["chips"] = chips
		gameState.GameData["payouts"] = payouts
		// Clear bets for display, keep them readable until next_round.
		return false, nil, nil

	case "next_round":
		if !isHost {
			return false, nil, fmt.Errorf("only the host can advance rounds")
		}
		if phase != "reveal" {
			return false, nil, fmt.Errorf("must be in reveal phase")
		}

		round, _ := gameState.GameData["round"].(float64)
		gameState.GameData["round"] = int(round) + 1
		gameState.GameData["phase"] = "betting"
		gameState.GameData["bets"] = map[string]interface{}{}
		gameState.GameData["payouts"] = map[string]int{}
		gameState.GameData["result"] = -1
		gameState.GameData["result_color"] = ""
		gameState.GameData["chips"] = chips

		// Turn advance is handled by ProcessMove's (currentTurn+1)%len — we want the
		// same player (host) to keep control, so cancel that increment.
		gameState.CurrentTurn = (gameState.CurrentTurn + len(gameState.Players) - 1) % len(gameState.Players)
		return false, nil, nil

	case "roulette_end":
		if !isHost {
			return false, nil, fmt.Errorf("only the host can end the game")
		}
		// Determine winner by most chips.
		var topID *uint
		topChips := -1
		isTie := false
		for _, p := range gameState.Players {
			k := fmt.Sprintf("%d", p.UserID)
			c := chips[k]
			if c > topChips {
				topChips = c
				uid := p.UserID
				topID = &uid
				isTie = false
			} else if c == topChips {
				isTie = true
			}
		}
		if isTie {
			topID = nil
		}

		gameState.GameData["phase"] = "ended"
		gameState.GameData["chips"] = chips
		return true, topID, nil
	}

	return false, nil, fmt.Errorf("unknown roulette move: %s", moveType)
}
