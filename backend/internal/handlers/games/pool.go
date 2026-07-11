package games

import (
	"fmt"
	"math"
)

// 8-ball pool — turn-based. Physics runs on the frontend canvas; the backend
// validates legality and tracks state: whose turn, which balls are pocketed,
// ball-type assignment (solids/stripes), fouls, and win condition.
//
// State layout inside GameData:
//   pocketed        []int   — ball IDs already sunk (1-15 = coloured, 0 = cue)
//   p0_type         string  — "" | "solids" | "stripes"  (assigned on first legal pocket)
//   p1_type         string  — "" | "solids" | "stripes"
//   breaking        bool    — true on the opening break shot (special foul rules)
//   open_table      bool    — true until first legal non-cue ball pocketed after break
//   eight_potted    bool    — true when 8-ball (ball 8) sunk (game over)
//   last_foul       string  — reason for the most recent foul ("" if clean)
//   last_pocketed   []int   — balls pocketed on the most recent shot
//   cue_pos_x/y     float64 — cue ball position after the shot (from client)
//
// Ball IDs: 1-7 = solids, 8 = eight-ball, 9-15 = stripes, 0 = cue ball.
//
// Move types sent by the frontend:
//   shot  — { pocketed: [id,...], cue_scratched: bool, cue_x: float, cue_y: float,
//             first_contact: id }
//         The client runs physics and reports what happened; server validates
//         and advances state. Perfect for a social game — no authoritative
//         physics server needed.

func (gm *GameManager) processPoolMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	// Lazy-init
	if _, ok := gameState.GameData["breaking"]; !ok {
		gameState.GameData["breaking"] = true
		gameState.GameData["open_table"] = true
		gameState.GameData["pocketed"] = []interface{}{}
		gameState.GameData["p0_type"] = ""
		gameState.GameData["p1_type"] = ""
		gameState.GameData["eight_potted"] = false
		gameState.GameData["last_foul"] = ""
		gameState.GameData["last_pocketed"] = []interface{}{}
		gameState.GameData["cue_pos_x"] = 0.25
		gameState.GameData["cue_pos_y"] = 0.5
	}

	if moveType != "shot" {
		return false, nil, fmt.Errorf("unknown pool move type: %s", moveType)
	}

	playerIdx := gameState.CurrentTurn
	opponentIdx := 1 - playerIdx
	_ = opponentIdx

	// Parse client shot report
	pocketedRaw, _ := moveData["pocketed"].([]interface{})
	cueScratch, _ := moveData["cue_scratched"].(bool)
	cueX, _ := moveData["cue_x"].(float64)
	cueY, _ := moveData["cue_y"].(float64)
	firstContactF, _ := moveData["first_contact"].(float64)
	firstContact := int(firstContactF)

	var pocketedIDs []int
	for _, v := range pocketedRaw {
		if f, ok := v.(float64); ok {
			pocketedIDs = append(pocketedIDs, int(f))
		}
	}

	// Existing pocketed set
	existingRaw, _ := gameState.GameData["pocketed"].([]interface{})
	alreadyPocketed := make(map[int]bool)
	for _, v := range existingRaw {
		if f, ok := v.(float64); ok {
			alreadyPocketed[int(f)] = true
		}
	}

	breaking, _ := gameState.GameData["breaking"].(bool)
	openTable, _ := gameState.GameData["open_table"].(bool)
	p0Type, _ := gameState.GameData["p0_type"].(string)
	p1Type, _ := gameState.GameData["p1_type"].(string)
	myType := p0Type
	if playerIdx == 1 {
		myType = p1Type
	}

	foul := ""
	pocketTurn := false // did the player legally pocket one of their own balls?

	// --- Foul detection ---

	// Scratch (cue ball sunk)
	if cueScratch {
		foul = "scratch"
	}

	// On break: no foul if nothing pocketed (legal dry break).
	// After break: first contact must be one of your own balls (or either type on open table).
	if !breaking && foul == "" {
		if firstContact == 0 {
			foul = "no_first_contact"
		} else if !openTable && myType != "" {
			ballType := poolBallType(firstContact)
			if ballType != myType && ballType != "eight" {
				foul = "wrong_first_contact"
			}
		}
	}

	// Filter newly pocketed (exclude cue ball — handled as scratch)
	var newlyPocketed []int
	for _, id := range pocketedIDs {
		if id == 0 {
			continue // cue ball already flagged as scratch above
		}
		if !alreadyPocketed[id] {
			newlyPocketed = append(newlyPocketed, id)
		}
	}

	// Eight-ball sunk
	eightPotted := false
	for _, id := range newlyPocketed {
		if id == 8 {
			eightPotted = true
		}
	}

	if eightPotted {
		// Sinking the 8 ends the game — legal only when all your own balls are cleared.
		myBalls := poolPlayerBalls(myType)
		allCleared := true
		for _, b := range myBalls {
			if !alreadyPocketed[b] {
				allCleared = false
				break
			}
		}
		if !allCleared || foul != "" {
			// Illegal 8-pot: opponent wins.
			oppID := &gameState.Players[opponentIdx].UserID
			gameState.GameData["eight_potted"] = true
			gameState.GameData["last_foul"] = "early_eight"
			return true, oppID, nil
		}
		// Legal 8-pot: current player wins.
		myID := &gameState.Players[playerIdx].UserID
		gameState.GameData["eight_potted"] = true
		return true, myID, nil
	}

	// Assign ball types on first non-cue pocket after break (open table)
	if openTable && foul == "" && !breaking {
		for _, id := range newlyPocketed {
			if id == 8 {
				continue
			}
			bt := poolBallType(id)
			if bt == "solids" || bt == "stripes" {
				if playerIdx == 0 {
					p0Type = bt
					p1Type = poolOppositeType(bt)
				} else {
					p1Type = bt
					p0Type = poolOppositeType(bt)
				}
				gameState.GameData["p0_type"] = p0Type
				gameState.GameData["p1_type"] = p1Type
				openTable = false
				gameState.GameData["open_table"] = false
				break
			}
		}
		// Re-read myType after assignment
		if playerIdx == 0 {
			myType = p0Type
		} else {
			myType = p1Type
		}
	}

	// Did the player legally pocket one of their own balls?
	if foul == "" {
		for _, id := range newlyPocketed {
			if id == 8 {
				continue
			}
			if openTable || poolBallType(id) == myType {
				pocketTurn = true
				break
			}
		}
	}

	// Merge newly pocketed into the set
	for _, id := range newlyPocketed {
		alreadyPocketed[id] = true
	}
	pocketedList := make([]interface{}, 0, len(alreadyPocketed))
	for id := range alreadyPocketed {
		pocketedList = append(pocketedList, float64(id))
	}

	newlyPocketedIface := make([]interface{}, len(newlyPocketed))
	for i, id := range newlyPocketed {
		newlyPocketedIface[i] = float64(id)
	}

	gameState.GameData["pocketed"] = pocketedList
	gameState.GameData["last_pocketed"] = newlyPocketedIface
	gameState.GameData["last_foul"] = foul
	gameState.GameData["breaking"] = false
	gameState.GameData["cue_pos_x"] = math.Max(0, math.Min(1, cueX))
	gameState.GameData["cue_pos_y"] = math.Max(0, math.Min(1, cueY))

	// Turn logic: player keeps the table on a legal pocket; otherwise turn passes.
	// pool is in selfManagedTurn — game_manager does NOT apply the +1 advance.
	// We must advance CurrentTurn ourselves when the turn should change.
	if foul != "" {
		gameState.GameData["ball_in_hand"] = true
		// Turn passes to opponent on a foul.
		gameState.CurrentTurn = (gameState.CurrentTurn + 1) % len(gameState.Players)
	} else if pocketTurn {
		// Legal pocket — same player stays (leave CurrentTurn unchanged).
		gameState.GameData["ball_in_hand"] = false
	} else {
		gameState.GameData["ball_in_hand"] = false
		// Miss — turn passes normally.
		gameState.CurrentTurn = (gameState.CurrentTurn + 1) % len(gameState.Players)
	}

	return false, nil, nil
}

// poolBallType returns "solids", "stripes", or "eight".
func poolBallType(id int) string {
	if id == 8 {
		return "eight"
	}
	if id >= 1 && id <= 7 {
		return "solids"
	}
	return "stripes"
}

// poolOppositeType returns the other ball type.
func poolOppositeType(t string) string {
	if t == "solids" {
		return "stripes"
	}
	return "solids"
}

// poolPlayerBalls returns the ball IDs (1-7 or 9-15) for a given type.
func poolPlayerBalls(t string) []int {
	if t == "solids" {
		return []int{1, 2, 3, 4, 5, 6, 7}
	}
	if t == "stripes" {
		return []int{9, 10, 11, 12, 13, 14, 15}
	}
	return nil
}
