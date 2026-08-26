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
//   ball_positions  map[string]{x,y} — fractional (0-1) resting position of every
//                   ball still on the table after the shot, keyed by ball ID as a
//                   string. This is the single source of truth non-shooting clients
//                   use to redraw the table — without it, only pocketed-ball IDs and
//                   the cue ball were ever synced, so every other ball silently kept
//                   whatever position it happened to be at locally, drifting further
//                   from the real table every shot. A ball absent from this map (and
//                   not newly pocketed either) means "off table, not yet placed" —
//                   used for the cue ball during ball-in-hand.
//   live_ball_positions  map[string]{x,y,vx,vy} — ephemeral, in-progress snapshot
//                   while a shot is still rolling on the shooter's device (see
//                   processPoolShotProgress). Purely cosmetic — the receiving
//                   side uses it to animate the balls smoothly via velocity-
//                   based extrapolation instead of only ever seeing the final
//                   teleport. Never read for foul/turn/win logic, and always
//                   deleted the moment the real "shot" report lands.
//
// Ball IDs: 1-7 = solids, 8 = eight-ball, 9-15 = stripes, 0 = cue ball.
//
// Move types sent by the frontend:
//   shot  — { pocketed: [id,...], cue_scratched: bool, cue_x: float, cue_y: float,
//             first_contact: id, ball_positions: {"id": {x,y}, ...} }
//         The client runs physics and reports what happened; server validates
//         and advances state. Perfect for a social game — no authoritative
//         physics server needed.
//   shot_progress — { live_ball_positions: {"id": {x,y,vx,vy}, ...} }
//         Sent ~10/sec by the shooter's own device while the balls are still
//         rolling, purely a live visual relay for everyone else — see
//         processPoolShotProgress. Registered as volatile in game_manager.go
//         (like ping_pong's state_sync), so it never touches the DB.

// poolInitialGameData is the full starting GameData for a fresh pool game —
// called from two places: GameManager.StartGame (so the very FIRST
// game_started broadcast, before any shot has ever happened, already
// carries the correct rack — see the real bug this closes, documented on
// ball_positions below) and, as a defensive fallback, processPoolMove's own
// lazy-init (the established pattern this whole games package uses
// elsewhere for the same "GameData is a fresh empty runtime map, never
// auto-seeded from initializeGameState" gap — see the Othello/Checkers
// history in CLAUDE.md).
func poolInitialGameData() map[string]interface{} {
	return map[string]interface{}{
		"breaking":      true,
		"open_table":    true,
		"pocketed":      []interface{}{},
		"p0_type":       "",
		"p1_type":       "",
		"eight_potted":  false,
		"last_foul":     "",
		"last_pocketed": []interface{}{},
		"cue_pos_x":     0.25,
		"cue_pos_y":     0.5,
		// Real bug, confirmed by reading the embedded engine's own bridge
		// script (wewatch-bridge.js): on sync_state, any ball whose ID is
		// absent from ball_positions is treated as "already pocketed" and
		// moved off-table — there is no "no data yet, trust your own rack"
		// case. Leaving this map empty at game start (the original
		// behavior) meant the very first sync — sent the instant the
		// iframe reports ready, before any shot has ever happened — told
		// the engine all 15 balls were gone, hiding the entire rack and
		// leaving only the cue ball visible/interactive. Seeded here with
		// the real initial 8-ball triangle rack instead, so the first sync
		// is genuinely correct rather than "nothing yet".
		"ball_positions": poolInitialRack(),
	}
}

func (gm *GameManager) processPoolMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	// Lazy-init — defensive fallback only; StartGame (game_manager.go) is
	// the primary seeding path now, see poolInitialGameData's own comment.
	if _, ok := gameState.GameData["breaking"]; !ok {
		for k, v := range poolInitialGameData() {
			gameState.GameData[k] = v
		}
	}

	// Live, in-progress shot relay — cosmetic only, no foul/turn/win logic
	// touched. See processPoolShotProgress's own doc comment for the full
	// design (paired with game_manager.go's volatileRT entry, this move type
	// skips the DB move-history + game_state persistence writes since it's a
	// high-frequency, purely transient visual stream, not a real move).
	if moveType == "shot_progress" {
		return processPoolShotProgress(gameState, moveData)
	}

	// Live aim/cue-stick relay — a 100% opaque passthrough of the embedded
	// engine's own serialised AimEvent (see wewatch-bridge.js's
	// installBroadcastRelay/handleGameEvent and container.ts's
	// ensureWatchAimController/pushIncomingGameEvent). WeWatch's backend
	// never parses this payload — it has no reason to, since foul/turn/win
	// is decided exclusively by the "shot" case below regardless of what a
	// player was aiming at along the way. Registered alongside shot_progress
	// in game_manager.go's volatileRT/isVolatile gate, so this never touches
	// the DB either.
	if moveType == "game_event" {
		gameState.GameData["aim_event"] = moveData["payload"]
		return false, nil, nil
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

	// Every ball still active on the shooter's table after their simulation
	// settled — the authoritative position data every other client applies.
	// Malformed/missing entries are simply skipped (that ball just won't be
	// repositioned this round rather than erroring the whole shot out).
	ballPositionsRaw, _ := moveData["ball_positions"].(map[string]interface{})
	ballPositions := parsePoolBallPositions(ballPositionsRaw, false)

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

	// Assign ball types on first non-cue pocket after break (open table).
	// Deliberately runs BEFORE the eight-ball legality check below — a shot
	// that establishes AND/OR clears the shooter's own group in the very
	// same stroke as potting the 8-ball needs myType (and openTable)
	// already resolved for that check to judge it correctly.
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

	// Merge newly pocketed into the set and persist the shooter's reported
	// final board (positions/cue/pocketed list) UNCONDITIONALLY, before the
	// eight-ball win/loss check below — deliberately moved ahead of that
	// check (was previously below it, reached only on a non-eight-ball
	// shot). Both eight-ball branches below `return` immediately once the
	// win/loss is decided; with this block still below them, a game-ending
	// 8-ball shot would decide the winner correctly but never actually
	// persist the fact that the 8-ball (and anything else pocketed in that
	// same stroke) left the table — a real, confirmed bug where the losing/
	// winning player's OPPONENT correctly saw who won, but their own board
	// kept showing the 8-ball (and e.g. a game-winning last money-ball)
	// still sitting on the table, since sync_state's ball_positions payload
	// never updated for that final shot.
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
	gameState.GameData["ball_positions"] = ballPositions
	// A late joiner's rehydration reads GameData wholesale — never leave a
	// stale mid-shot snapshot sitting next to the now-fresh authoritative
	// positions once the real, final report has landed. aim_event is cleared
	// for the same reason: it's not a late-join concern (isVolatile already
	// keeps it out of the persisted GameSession.GameState this rehydration
	// reads from), but a stale aim angle from whoever's turn just ended
	// would otherwise ride along on every ordinary "shot" broadcast from now
	// on until the next aim_event happens to overwrite it.
	delete(gameState.GameData, "live_ball_positions")
	delete(gameState.GameData, "aim_event")

	if eightPotted {
		// Illegal in two cases: any other foul already happened this shot,
		// or the table is STILL open — meaning no group has ever been
		// established for anyone (not even by this same shot, checked just
		// above), so there's no "own group" that could possibly have been
		// cleared. Real 8-ball rules: the 8 can only be legally sunk once a
		// player's own group is both established and fully cleared — this
		// is the fix for a real, confirmed bug where an open-table 8-ball
		// pot was always ruled a legal win (myType=="" made
		// poolPlayerBalls return an empty slice, so the old "all cleared"
		// loop below never ran and silently defaulted to "cleared").
		illegal8 := foul != "" || openTable
		if !illegal8 {
			myBalls := poolPlayerBalls(myType)
			// Check against alreadyPocketed, which by this point already
			// has newlyPocketed merged in above — legally clearing your
			// last remaining ball and potting the 8 in the same stroke is
			// a real, common, legal win.
			for _, b := range myBalls {
				if !alreadyPocketed[b] {
					illegal8 = true
					break
				}
			}
		}
		if illegal8 {
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

// poolInitialRack returns the standard 8-ball triangle rack (balls 1-15) in
// the same fractional (0-1) table coordinates the frontend/engine use
// (cue ball excluded — its own default lives separately in cue_pos_x/y
// above, at fx≈0.244, matching this same coordinate space). Not hand-
// computed: extracted directly from the real deployed engine's own
// Rack.eightBall() geometry (src/utils/rack.ts in the tailuge/billiards
// fork) via a live Playwright session reading window.container.table.balls
// right after construction — the exact same real positions a fresh table
// actually starts with, including the engine's own tiny per-ball jitter
// baked in as a one-time snapshot (cosmetically identical to a real rack;
// not worth re-deriving per game the way e.g. Wordsmith's tile bag needs
// genuine per-game randomness for fairness — a pool rack's starting
// position has no fairness stakes either way).
func poolInitialRack() map[string]interface{} {
	return map[string]interface{}{
		"1":  map[string]interface{}{"x": 0.7559, "y": 0.4999},
		"2":  map[string]interface{}{"x": 0.7765, "y": 0.5248},
		"3":  map[string]interface{}{"x": 0.8385, "y": 0.4018},
		"4":  map[string]interface{}{"x": 0.8180, "y": 0.5247},
		"5":  map[string]interface{}{"x": 0.7973, "y": 0.4512},
		"6":  map[string]interface{}{"x": 0.8387, "y": 0.5487},
		"7":  map[string]interface{}{"x": 0.8179, "y": 0.5737},
		"8":  map[string]interface{}{"x": 0.7973, "y": 0.5001},
		"9":  map[string]interface{}{"x": 0.8178, "y": 0.4755},
		"10": map[string]interface{}{"x": 0.8178, "y": 0.4263},
		"11": map[string]interface{}{"x": 0.7765, "y": 0.4754},
		"12": map[string]interface{}{"x": 0.8386, "y": 0.4510},
		"13": map[string]interface{}{"x": 0.8386, "y": 0.5000},
		"14": map[string]interface{}{"x": 0.7972, "y": 0.5492},
		"15": map[string]interface{}{"x": 0.8387, "y": 0.5981},
	}
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

// parsePoolBallPositions clamps and validates a raw {id: {x,y[,vx,vy]}} map
// exactly as the "shot" handler already did inline — factored out so
// processPoolShotProgress (below) can reuse the identical clamping/
// malformed-entry-skipping behavior instead of a second, potentially
// drifting copy. Malformed/missing entries are simply skipped (that ball
// just won't be included this round, same "don't error the whole report
// out over one bad entry" policy the original inline version already had).
// Velocity fields are read but NOT clamped to [0,1] the way position is —
// clamping a delta the same way as an absolute coordinate would be wrong;
// a stray huge value is harmless since the frontend's own extrapolation cap
// already bounds how far wrong it could ever visually drift.
func parsePoolBallPositions(raw map[string]interface{}, withVelocity bool) map[string]interface{} {
	out := map[string]interface{}{}
	for idStr, posRaw := range raw {
		posMap, ok := posRaw.(map[string]interface{})
		if !ok {
			continue
		}
		px, okX := posMap["x"].(float64)
		py, okY := posMap["y"].(float64)
		if !okX || !okY {
			continue
		}
		entry := map[string]interface{}{
			"x": math.Max(0, math.Min(1, px)),
			"y": math.Max(0, math.Min(1, py)),
		}
		if withVelocity {
			if vx, ok := posMap["vx"].(float64); ok {
				entry["vx"] = vx
			}
			if vy, ok := posMap["vy"].(float64); ok {
				entry["vy"] = vy
			}
		}
		out[idStr] = entry
	}
	return out
}

// processPoolShotProgress relays a live, in-progress shot snapshot (the
// shooter's own device, sent roughly every ~100ms while the balls are still
// rolling — see wewatch-bridge.js's sendShotProgress) to every other
// connected client, purely cosmetic — no foul/turn/win logic is touched,
// which stays exclusively owned by the "shot" case above once the shot
// genuinely settles. Registered as volatile in game_manager.go's
// ProcessMove (gated to gameType=="pool"), so — like ping_pong's
// state_sync/air_hockey's mallet_move before it — this never creates a
// game_moves row and never persists gameState.GameData to the DB; it only
// flows through the same atomic broadcastGameStateLocked every other move
// already uses, so every client sees it in the correct order relative to
// any other pool move.
func processPoolShotProgress(gameState *GameSessionState, moveData map[string]interface{}) (bool, *uint, error) {
	liveRaw, _ := moveData["live_ball_positions"].(map[string]interface{})
	gameState.GameData["live_ball_positions"] = parsePoolBallPositions(liveRaw, true)
	return false, nil, nil
}
