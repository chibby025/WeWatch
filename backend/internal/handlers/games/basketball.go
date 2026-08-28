package games

import "fmt"

// Basketball H.O.R.S.E — 2-6 players, turn-based, closed-form server-
// authoritative scoring (same trust model as Darts: no client-side physics
// engine needed to validate a shot — the server itself decides make/miss
// from a simple, deterministic formula that a client-side canvas animation
// merely renders the outcome of).
//
// Real H.O.R.S.E rules, digitally adapted for a distance+power aim model:
//   - The current shooter either takes a FREE shot (their own choice of
//     distance from the hoop, when no shot is currently "set") or must
//     MATCH the currently-set shot's distance (forced server-side, ignoring
//     whatever distance value the client submits — a challenger never gets
//     to pick an easier shot than the one being matched).
//   - A free shot that's MADE becomes the new set shot: every other
//     non-eliminated player, in turn order starting right after the
//     shooter, must attempt to match it, one at a time.
//   - A free shot that's MISSED sets nothing at all — turn just passes
//     normally to the next player, who gets their own free choice.
//   - A matching attempt that's MADE costs the challenger nothing. A
//     matching attempt that's MISSED gives that player the next letter of
//     H-O-R-S-E; spelling the whole word eliminates them.
//   - Once every remaining player has taken their one attempt at the
//     current set shot, the pending shot clears and turn returns to the
//     original setter for a fresh free shot — they stay "hot" for as long
//     as they keep making their own free shots. The moment a setter misses
//     their OWN free shot, no letters are handed out for it and turn moves
//     on to the next player in ordinary rotation, who becomes the new
//     setter candidate.
//   - The game ends the instant only one non-eliminated player remains;
//     they win outright (not decided by score/points).

const basketballHorseWord = "HORSE"

// basketballIdealPower/basketballTolerance are a deliberately simple,
// hand-tuned skill curve rather than anything physically simulated: a closer
// shot (distance near 0) needs less power and forgives a wider power window;
// a full three-point-range shot (distance near 1) needs much more power and
// only forgives a narrow window around it. Mirrors Darts' own
// dartsWobble-style "closed-form, no real physics needed" approach.
func basketballIdealPower(distance float64) float64 {
	return 0.3 + 0.6*distance
}

func basketballTolerance(distance float64) float64 {
	t := 0.15 - 0.08*distance
	if t < 0.03 {
		t = 0.03
	}
	return t
}

func basketballShotMade(distance, power float64) bool {
	diff := power - basketballIdealPower(distance)
	if diff < 0 {
		diff = -diff
	}
	return diff <= basketballTolerance(distance)
}

// ensureBasketballState lazily seeds per-player letters/eliminated maps —
// GameData starts as a fresh empty runtime map at game creation (never
// auto-seeded from initializeGameState's own return value, which only
// reaches the DB-persisted snapshot — the same gap this whole games package
// has documented repeatedly since Othello/Checkers), and this game needs
// real per-player-UserID-keyed state that initializeGameState(gameType,
// playerCount) has no way to construct (it doesn't know real user IDs yet).
func ensureBasketballState(gameState *GameSessionState) {
	if gameState.GameData["letters"] != nil {
		return
	}
	letters := map[string]interface{}{}
	eliminated := map[string]interface{}{}
	for _, p := range gameState.Players {
		key := fmt.Sprintf("%d", p.UserID)
		letters[key] = ""
		eliminated[key] = false
	}
	gameState.GameData["letters"] = letters
	gameState.GameData["eliminated"] = eliminated
	gameState.GameData["has_pending_shot"] = false
	gameState.GameData["set_distance"] = 0.0
	gameState.GameData["setter_id"] = float64(0)
	gameState.GameData["attempt_queue"] = []interface{}{}
}

func basketballLettersFor(gameState *GameSessionState, userID uint) string {
	letters, _ := gameState.GameData["letters"].(map[string]interface{})
	if letters == nil {
		return ""
	}
	s, _ := letters[fmt.Sprintf("%d", userID)].(string)
	return s
}

func basketballIsEliminated(gameState *GameSessionState, userID uint) bool {
	elim, _ := gameState.GameData["eliminated"].(map[string]interface{})
	if elim == nil {
		return false
	}
	b, _ := elim[fmt.Sprintf("%d", userID)].(bool)
	return b
}

// basketballRemainingPlayerIDs returns every player who hasn't yet spelled
// the whole word — used only for the win-condition check (exactly one left).
func basketballRemainingPlayerIDs(gameState *GameSessionState) []uint {
	var out []uint
	for _, p := range gameState.Players {
		if !basketballIsEliminated(gameState, p.UserID) {
			out = append(out, p.UserID)
		}
	}
	return out
}

// basketballNextActiveIndexFrom walks forward from fromIdx (exclusive),
// wrapping around, and returns the first player index that isn't already
// eliminated. Mirrors bowlingAdvanceToNextActivePlayer's own reasoning —
// players can drop out mid-game (elimination here, finishing all 10 frames
// there), so a plain "+1 mod N" can't be trusted to always land on someone
// still playing.
func basketballNextActiveIndexFrom(gameState *GameSessionState, fromIdx int) int {
	n := len(gameState.Players)
	for i := 1; i <= n; i++ {
		idx := (fromIdx + i) % n
		if !basketballIsEliminated(gameState, gameState.Players[idx].UserID) {
			return idx
		}
	}
	return fromIdx // unreachable in practice — the win check above always ends the game before this could matter
}

func (gm *GameManager) processBasketballMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	ensureBasketballState(gameState)

	// shoot_progress: a live, ~10Hz relay of the shooter's own ball position
	// while it's airborne (Ball.state === 'shot' on the sending client — see
	// BasketballGame.jsx), so spectators see the actual shot arc in
	// near-real-time instead of just a static "X is shooting…" placeholder
	// until the result lands. Mirrors bowling.go's own throw_progress relay
	// exactly: no authority over make/miss at all (that's still decided
	// purely by the final "shoot" move below), never persisted to the DB
	// (volatileRT in game_manager.go), and turn-gate-exempt so a straggling
	// packet arriving just after the turn has already passed isn't rejected.
	if moveType == "shoot_progress" {
		ball, ok := moveData["ball"].(map[string]interface{})
		if !ok {
			return false, nil, fmt.Errorf("missing ball")
		}
		gameState.GameData["shoot_progress"] = map[string]interface{}{"ball": ball}
		return false, nil, nil
	}

	if moveType != "shoot" {
		return false, nil, fmt.Errorf("unknown basketball move type: %s", moveType)
	}

	// The shot that's about to be resolved below supersedes any in-flight
	// relay snapshot — clear it so a late joiner's rehydration (or the next
	// shot's own first relay tick) never sees stale mid-flight ball data
	// sitting next to a shot that's already fully decided.
	delete(gameState.GameData, "shoot_progress")

	powerF, ok := moveData["power"].(float64)
	if !ok {
		return false, nil, fmt.Errorf("missing power")
	}
	if powerF < 0 || powerF > 1 {
		return false, nil, fmt.Errorf("power out of range")
	}

	hasPending, _ := gameState.GameData["has_pending_shot"].(bool)

	var distance float64
	if hasPending {
		// Forced match — deliberately ignores any distance the client sent,
		// so a challenger can never pick an easier shot than the one being
		// matched (see the package-level doc comment above).
		distance, _ = gameState.GameData["set_distance"].(float64)
	} else {
		distF, ok := moveData["distance"].(float64)
		if !ok {
			return false, nil, fmt.Errorf("missing distance")
		}
		if distF < 0 || distF > 1 {
			return false, nil, fmt.Errorf("distance out of range")
		}
		distance = distF
	}

	made := basketballShotMade(distance, powerF)

	gameState.GameData["last_result"] = map[string]interface{}{
		"shooter_id": float64(playerID),
		"distance":   distance,
		"power":      powerF,
		"made":       made,
		"was_match":  hasPending,
	}

	if !hasPending {
		// Free shot.
		if made {
			myIdx := -1
			for i, p := range gameState.Players {
				if p.UserID == playerID {
					myIdx = i
				}
			}
			var queue []interface{}
			n := len(gameState.Players)
			for i := 1; i < n; i++ {
				idx := (myIdx + i) % n
				p := gameState.Players[idx]
				if !basketballIsEliminated(gameState, p.UserID) {
					queue = append(queue, float64(p.UserID))
				}
			}
			if len(queue) == 0 {
				// No one else left to challenge (only possible in a 1-player
				// edge case that shouldn't reach this handler at all given
				// the >=2 player guard at game creation) — stay on the same
				// shooter for another free shot rather than crash.
				return false, nil, nil
			}
			gameState.GameData["has_pending_shot"] = true
			gameState.GameData["set_distance"] = distance
			gameState.GameData["setter_id"] = float64(playerID)
			gameState.GameData["attempt_queue"] = queue
			nextID := uint(queue[0].(float64))
			for i, p := range gameState.Players {
				if p.UserID == nextID {
					gameState.CurrentTurn = i
				}
			}
			return false, nil, nil
		}
		// Missed free shot — no challenge set, turn passes normally.
		gameState.CurrentTurn = basketballNextActiveIndexFrom(gameState, gameState.CurrentTurn)
		return false, nil, nil
	}

	// Matching attempt.
	if !made {
		letters, _ := gameState.GameData["letters"].(map[string]interface{})
		key := fmt.Sprintf("%d", playerID)
		cur, _ := letters[key].(string)
		newLetters := cur + string(basketballHorseWord[len(cur)])
		letters[key] = newLetters
		gameState.GameData["letters"] = letters

		if len(newLetters) >= len(basketballHorseWord) {
			elim, _ := gameState.GameData["eliminated"].(map[string]interface{})
			elim[key] = true
			gameState.GameData["eliminated"] = elim

			remaining := basketballRemainingPlayerIDs(gameState)
			if len(remaining) == 1 {
				winID := remaining[0]
				return true, &winID, nil
			}
		}
	}

	// This player's attempt at the current set shot is used up either way
	// (made or missed) — remove them from the queue and move to whoever's
	// next, or return the turn to the setter once nobody's left to attempt.
	queueRaw, _ := gameState.GameData["attempt_queue"].([]interface{})
	var newQueue []interface{}
	for _, v := range queueRaw {
		if uint(v.(float64)) != playerID {
			newQueue = append(newQueue, v)
		}
	}
	gameState.GameData["attempt_queue"] = newQueue

	if len(newQueue) > 0 {
		nextID := uint(newQueue[0].(float64))
		for i, p := range gameState.Players {
			if p.UserID == nextID {
				gameState.CurrentTurn = i
			}
		}
		return false, nil, nil
	}

	// Queue exhausted — clear the pending shot and hand the turn back to the
	// original setter for a fresh free shot. The setter can never appear in
	// their own attempt queue, so they're guaranteed to still be a valid,
	// non-eliminated player index here.
	gameState.GameData["has_pending_shot"] = false
	setterIDF, _ := gameState.GameData["setter_id"].(float64)
	setterID := uint(setterIDF)
	for i, p := range gameState.Players {
		if p.UserID == setterID {
			gameState.CurrentTurn = i
		}
	}
	return false, nil, nil
}
