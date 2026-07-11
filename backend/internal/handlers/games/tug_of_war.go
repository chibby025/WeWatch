package games

import (
	"fmt"

	"wewatch-backend/internal/models"
)

// Tug of War: players split into two teams and click "pull" as fast as they can
// during a timed round. The host ends each round by sending "end_round" (the
// frontend handles the countdown timer). Best of 3 rounds wins the match.
// For 2 players: each is their own team. For 4+ players: even indices vs odd.

func tugOfWarInitialState(players []models.Player) map[string]interface{} {
	team1 := []uint{}
	team2 := []uint{}
	for i, p := range players {
		if i%2 == 0 {
			team1 = append(team1, p.UserID)
		} else {
			team2 = append(team2, p.UserID)
		}
	}

	pulls := map[string]interface{}{}
	for _, p := range players {
		pulls[fmt.Sprintf("%d", p.UserID)] = 0
	}

	team1IDs := make([]interface{}, len(team1))
	for i, id := range team1 {
		team1IDs[i] = float64(id)
	}
	team2IDs := make([]interface{}, len(team2))
	for i, id := range team2 {
		team2IDs[i] = float64(id)
	}

	return map[string]interface{}{
		"phase":          "pulling",
		"round":          1,
		"max_rounds":     3,
		"team1":          team1IDs,
		"team2":          team2IDs,
		"pulls":          pulls,
		"team1_pulls":    0,
		"team2_pulls":    0,
		"team1_wins":     0,
		"team2_wins":     0,
		"rope_position":  0, // -100 to +100, negative = team1 winning
		"round_history":  []interface{}{},
		"last_winner":    "",
	}
}

func ensureTugOfWarState(gameState *GameSessionState) {
	if gameState.GameData["phase"] == nil {
		for k, v := range tugOfWarInitialState(gameState.Players) {
			gameState.GameData[k] = v
		}
	}
}

func (gm *GameManager) processTugOfWarMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (bool, *uint, error) {
	ensureTugOfWarState(gameState)

	phase, _ := gameState.GameData["phase"].(string)

	switch moveType {
	case "pull":
		if phase != "pulling" {
			return false, nil, fmt.Errorf("round not active")
		}

		playerKey := fmt.Sprintf("%d", playerID)
		pulls := tugPullMap(gameState.GameData)
		pulls[playerKey] = tugInt(pulls[playerKey]) + 1
		gameState.GameData["pulls"] = pulls

		// Recompute team totals and rope position
		team1 := tugUintSlice(gameState.GameData["team1"])
		team2 := tugUintSlice(gameState.GameData["team2"])
		t1Total, t2Total := 0, 0
		for _, uid := range team1 {
			t1Total += tugInt(pulls[fmt.Sprintf("%d", uid)])
		}
		for _, uid := range team2 {
			t2Total += tugInt(pulls[fmt.Sprintf("%d", uid)])
		}
		gameState.GameData["team1_pulls"] = t1Total
		gameState.GameData["team2_pulls"] = t2Total

		diff := t2Total - t1Total
		if diff > 100 {
			diff = 100
		}
		if diff < -100 {
			diff = -100
		}
		gameState.GameData["rope_position"] = diff

		// Cancel auto-advance (simultaneous game)
		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil

	case "end_round":
		if phase != "pulling" {
			return false, nil, fmt.Errorf("round not active")
		}
		// Only host (Players[0]) can end round
		if playerID != gameState.Players[0].UserID {
			return false, nil, fmt.Errorf("only the host can end the round")
		}

		t1Total := tugInt(gameState.GameData["team1_pulls"])
		t2Total := tugInt(gameState.GameData["team2_pulls"])
		t1Wins := tugInt(gameState.GameData["team1_wins"])
		t2Wins := tugInt(gameState.GameData["team2_wins"])
		maxRounds := tugInt(gameState.GameData["max_rounds"])
		round := tugInt(gameState.GameData["round"])

		var roundWinner string
		if t1Total > t2Total {
			t1Wins++
			roundWinner = "team1"
		} else if t2Total > t1Total {
			t2Wins++
			roundWinner = "team2"
		} else {
			roundWinner = "draw"
		}

		history := tugHistory(gameState.GameData)
		history = append(history, map[string]interface{}{
			"round":       round,
			"team1_pulls": t1Total,
			"team2_pulls": t2Total,
			"winner":      roundWinner,
		})

		gameState.GameData["team1_wins"] = t1Wins
		gameState.GameData["team2_wins"] = t2Wins
		gameState.GameData["round_history"] = history
		gameState.GameData["last_winner"] = roundWinner

		// Check match winner (best of 3)
		needed := maxRounds/2 + 1
		if t1Wins >= needed || t2Wins >= needed || round >= maxRounds {
			gameState.GameData["phase"] = "ended"

			var winnerID *uint
			if t1Wins > t2Wins {
				// Team1 winner — pick first player in team1 as representative
				team1 := tugUintSlice(gameState.GameData["team1"])
				if len(team1) > 0 {
					uid := team1[0]
					winnerID = &uid
				}
			} else if t2Wins > t1Wins {
				team2 := tugUintSlice(gameState.GameData["team2"])
				if len(team2) > 0 {
					uid := team2[0]
					winnerID = &uid
				}
			}

			gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
			return true, winnerID, nil
		}

		// Next round — reset pulls
		newPulls := map[string]interface{}{}
		for _, p := range gameState.Players {
			newPulls[fmt.Sprintf("%d", p.UserID)] = 0
		}
		gameState.GameData["pulls"] = newPulls
		gameState.GameData["team1_pulls"] = 0
		gameState.GameData["team2_pulls"] = 0
		gameState.GameData["rope_position"] = 0
		gameState.GameData["round"] = round + 1
		gameState.GameData["phase"] = "pulling"

		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil

	default:
		return false, nil, fmt.Errorf("unknown move type: %s", moveType)
	}
}

// --- helpers ---

func tugPullMap(data map[string]interface{}) map[string]interface{} {
	if raw, ok := data["pulls"]; ok {
		if m, ok := raw.(map[string]interface{}); ok {
			return m
		}
	}
	return map[string]interface{}{}
}

func tugInt(v interface{}) int {
	switch val := v.(type) {
	case int:
		return val
	case float64:
		return int(val)
	}
	return 0
}

func tugUintSlice(raw interface{}) []uint {
	if raw == nil {
		return nil
	}
	if s, ok := raw.([]interface{}); ok {
		out := make([]uint, 0, len(s))
		for _, v := range s {
			out = append(out, uint(tugInt(v)))
		}
		return out
	}
	return nil
}

func tugHistory(data map[string]interface{}) []interface{} {
	if raw, ok := data["round_history"]; ok {
		if s, ok := raw.([]interface{}); ok {
			return s
		}
	}
	return []interface{}{}
}
