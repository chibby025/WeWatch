//go:build ignore

// Ramp Rush temporarily removed from the build — not enough time to finish
// fixing it (the frontend's GLB vehicle models are also blocked by a
// BunnyCDN CORS-allowlist gap, see CLAUDE.md). Every call site into this
// file has been commented out in game_manager.go/websocket_handler.go and
// every UI entry point removed. To re-enable: delete this build tag (and
// the matching one in ramp_rush_test.go), then uncomment the ~8 call sites
// flagged "ramp_rush temporarily removed" across game_manager.go,
// websocket_handler.go, GameLobbyModal.jsx, and GameOverlay.jsx.

package games

import "fmt"

// Ramp Rush: 2-player turn-based car-jump game. Each round, both players take
// one turn each launching down a straight track — tap-to-charge power, then
// fly over that round's obstacle course. A run only scores if every obstacle
// on the course is cleared; a crash scores 0 for that round. If both players
// clear cleanly, the one who travels further wins the round. best_of_5 = first
// to 3 round wins (5-round cap, best total score wins if nobody reaches 3);
// first_to_win = the very first round someone actually wins ends the match —
// a draw round (both crash, or an exact tie) doesn't count against either
// player and just replays on the next stage.
//
// The charge/launch/flight physics runs entirely client-side (same trust
// model as every other score-reporting game in this package, e.g. Fowl Play's
// hot-seat scores) — the server's job is just recording each player's
// reported {cleared, distance} for the round and resolving it once both are
// in. Perfect information (no hidden per-player state), so — like
// othello/checkers/mancala/snakes_ladders — it needs no entry in
// GetActiveGameMessage's public-state-filtering switch.

// rampRushStages is the server-authoritative course list, broadcast to both
// clients (via GameData, same as everything else here) so they render and
// simulate an identical course. Two obstacle types for this first pass:
// "gap" (a pit in the track — needs enough horizontal distance in the air to
// clear) and "barrier" (a wall — needs enough height at that point in the
// arc to clear). position/size are in meters along the lane. If a match ever
// runs past the last stage (only possible in first_to_win after repeated
// draws), the final stage repeats.
var rampRushStages = []map[string]interface{}{
	{
		"name":   "Warm-Up Straight",
		"length": 200.0,
		"obstacles": []interface{}{
			map[string]interface{}{"type": "gap", "position": 90.0, "size": 8.0},
			map[string]interface{}{"type": "barrier", "position": 150.0, "size": 2.5},
		},
	},
	{
		"name":   "First Gauntlet",
		"length": 260.0,
		"obstacles": []interface{}{
			map[string]interface{}{"type": "gap", "position": 70.0, "size": 9.0},
			map[string]interface{}{"type": "barrier", "position": 130.0, "size": 3.0},
			map[string]interface{}{"type": "gap", "position": 190.0, "size": 10.0},
		},
	},
	{
		"name":   "Barrier Run",
		"length": 320.0,
		"obstacles": []interface{}{
			map[string]interface{}{"type": "barrier", "position": 60.0, "size": 3.2},
			map[string]interface{}{"type": "gap", "position": 120.0, "size": 11.0},
			map[string]interface{}{"type": "barrier", "position": 190.0, "size": 3.5},
			map[string]interface{}{"type": "gap", "position": 250.0, "size": 11.0},
		},
	},
	{
		"name":   "Tight Squeeze",
		"length": 380.0,
		"obstacles": []interface{}{
			map[string]interface{}{"type": "gap", "position": 60.0, "size": 12.0},
			map[string]interface{}{"type": "barrier", "position": 120.0, "size": 3.8},
			map[string]interface{}{"type": "gap", "position": 180.0, "size": 13.0},
			map[string]interface{}{"type": "barrier", "position": 250.0, "size": 4.0},
			map[string]interface{}{"type": "gap", "position": 320.0, "size": 13.0},
		},
	},
	{
		"name":   "The Gauntlet",
		"length": 450.0,
		"obstacles": []interface{}{
			map[string]interface{}{"type": "barrier", "position": 50.0, "size": 4.0},
			map[string]interface{}{"type": "gap", "position": 110.0, "size": 14.0},
			map[string]interface{}{"type": "barrier", "position": 180.0, "size": 4.2},
			map[string]interface{}{"type": "gap", "position": 250.0, "size": 15.0},
			map[string]interface{}{"type": "barrier", "position": 320.0, "size": 4.5},
			map[string]interface{}{"type": "gap", "position": 390.0, "size": 15.0},
		},
	},
}

// rampRushInitialState defaults to best_of_5 — handleGameStart (websocket_handler.go)
// overrides rounds_to_win/max_rounds when the host explicitly picks first_to_win,
// mirroring ping_pong's own no_walls start-option pattern.
func rampRushInitialState() map[string]interface{} {
	stagesOut := make([]interface{}, len(rampRushStages))
	for i, s := range rampRushStages {
		stagesOut[i] = s
	}
	return map[string]interface{}{
		"format":              "best_of_5",
		"rounds_to_win":       3,
		"max_rounds":          5,
		"round":               0,
		"scores":              map[string]interface{}{},
		"round_results":       map[string]interface{}{},
		"round_first_player":  0,
		"stages":              stagesOut,
		"last_round_summary":  nil,
	}
}

func rampRushStageIndex(round int) int {
	if round >= len(rampRushStages) {
		return len(rampRushStages) - 1
	}
	return round
}

func rampRushIntField(gameData map[string]interface{}, key string) int {
	switch v := gameData[key].(type) {
	case int:
		return v
	case float64:
		return int(v)
	default:
		return 0
	}
}

func rampRushMapField(gameData map[string]interface{}, key string) map[string]interface{} {
	if m, ok := gameData[key].(map[string]interface{}); ok {
		return m
	}
	return map[string]interface{}{}
}

func rampRushFloatField(m map[string]interface{}, key string) float64 {
	switch v := m[key].(type) {
	case float64:
		return v
	case int:
		return float64(v)
	default:
		return 0
	}
}

func rampRushResultFor(roundResults map[string]interface{}, key string) map[string]interface{} {
	if m, ok := roundResults[key].(map[string]interface{}); ok {
		return m
	}
	return map[string]interface{}{}
}

func (gm *GameManager) processRampRushMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (bool, *uint, error) {
	if moveType != "launch" {
		return false, nil, fmt.Errorf("unknown ramp_rush move type: %s", moveType)
	}
	if len(gameState.Players) != 2 {
		return false, nil, fmt.Errorf("ramp_rush requires exactly 2 players")
	}

	cleared, _ := moveData["cleared"].(bool)
	distance, _ := moveData["distance"].(float64)
	if distance < 0 {
		distance = 0
	}

	roundResults := rampRushMapField(gameState.GameData, "round_results")
	key := fmt.Sprintf("%d", playerID)
	if _, already := roundResults[key]; already {
		return false, nil, fmt.Errorf("you've already launched this round")
	}
	roundResults[key] = map[string]interface{}{"cleared": cleared, "distance": distance}
	gameState.GameData["round_results"] = roundResults

	if len(roundResults) < 2 {
		// Waiting on the other player. ramp_rush is in selfManagedTurn (round
		// resolution below needs full control of CurrentTurn), so the generic
		// caller-side +1-mod-N advance never runs for this game type — advance
		// it ourselves.
		gameState.CurrentTurn = (gameState.CurrentTurn + 1) % 2
		return false, nil, nil
	}

	// Both players have launched this round — resolve it.
	p0ID := gameState.Players[0].UserID
	p1ID := gameState.Players[1].UserID
	r0 := rampRushResultFor(roundResults, fmt.Sprintf("%d", p0ID))
	r1 := rampRushResultFor(roundResults, fmt.Sprintf("%d", p1ID))
	c0, _ := r0["cleared"].(bool)
	c1, _ := r1["cleared"].(bool)
	d0 := rampRushFloatField(r0, "distance")
	d1 := rampRushFloatField(r1, "distance")

	var roundWinnerID *uint
	if c0 && !c1 {
		roundWinnerID = &p0ID
	} else if c1 && !c0 {
		roundWinnerID = &p1ID
	} else if c0 && c1 {
		if d0 > d1 {
			roundWinnerID = &p0ID
		} else if d1 > d0 {
			roundWinnerID = &p1ID
		}
		// equal distance — draw round, roundWinnerID stays nil
	}
	// neither cleared — draw round, roundWinnerID stays nil

	scores := rampRushMapField(gameState.GameData, "scores")
	if roundWinnerID != nil {
		wKey := fmt.Sprintf("%d", *roundWinnerID)
		scores[wKey] = rampRushIntField(scores, wKey) + 1
	}
	// Seed both players at 0 even on a drawn first round, for a clean initial UI.
	for _, p := range gameState.Players {
		pKey := fmt.Sprintf("%d", p.UserID)
		if _, ok := scores[pKey]; !ok {
			scores[pKey] = 0
		}
	}
	gameState.GameData["scores"] = scores

	round := rampRushIntField(gameState.GameData, "round")
	roundsToWin := rampRushIntField(gameState.GameData, "rounds_to_win")
	if roundsToWin == 0 {
		roundsToWin = 3
	}
	maxRounds := rampRushIntField(gameState.GameData, "max_rounds")
	if maxRounds == 0 {
		maxRounds = 5
	}

	var summaryWinner uint
	if roundWinnerID != nil {
		summaryWinner = *roundWinnerID
	}
	gameState.GameData["last_round_summary"] = map[string]interface{}{
		"round":       round,
		"stage_index": rampRushStageIndex(round),
		"results": map[string]interface{}{
			fmt.Sprintf("%d", p0ID): r0,
			fmt.Sprintf("%d", p1ID): r1,
		},
		"winner_id": summaryWinner,
	}

	// Match over — someone reached rounds_to_win?
	for _, p := range gameState.Players {
		pKey := fmt.Sprintf("%d", p.UserID)
		if rampRushIntField(scores, pKey) >= roundsToWin {
			id := p.UserID
			return true, &id, nil
		}
	}

	// Match over on the round cap (best_of_5 only reaches this via a 5th round
	// nobody swept; first_to_win's cap is just a generous safety net against a
	// pathological all-draws game, not a real target).
	if round+1 >= maxRounds {
		var bestID *uint
		best := -1
		tie := false
		for _, p := range gameState.Players {
			pKey := fmt.Sprintf("%d", p.UserID)
			v := rampRushIntField(scores, pKey)
			if v > best {
				best = v
				id := p.UserID
				bestID = &id
				tie = false
			} else if v == best {
				tie = true
			}
		}
		if tie {
			bestID = nil
		}
		return true, bestID, nil
	}

	// Advance to the next round — alternate who launches first.
	gameState.GameData["round"] = round + 1
	gameState.GameData["round_results"] = map[string]interface{}{}
	firstPlayer := 1 - rampRushIntField(gameState.GameData, "round_first_player")
	gameState.GameData["round_first_player"] = firstPlayer
	gameState.CurrentTurn = firstPlayer

	return false, nil, nil
}
