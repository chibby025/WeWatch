package games

import "fmt"

// Bowling — 2-6 players, turn-based, perfect information. Real Bullet
// (Ammo.js) rigid-body physics runs on the CURRENT THROWER's own device only
// (bowling pin physics is chaotic/non-deterministic across machines, so —
// same trust model this package already uses for Pool's live shot relay —
// only one client's simulation is ever authoritative for a given throw).
// The client reports just one integer once its local physics settles: how
// many pins fell on that throw. The server never re-simulates physics; it
// validates the report against how many pins were actually still standing
// (see pinsRemainingInFrame below) and applies the same official scoring
// rules a real bowling scoresheet uses.
//
// The frame/scoring state machine below is a direct, deliberately
// line-for-line port of a real, working implementation
// (github.com/iliagrigorevdev/bowling, GPL-3.0, js/scores.js) — preserved
// structurally rather than rewritten from a fresh understanding of bowling's
// rules, specifically to avoid introducing a subtle 10th-frame/strike-chain
// bug that a "cleaner" rewrite could easily get wrong.

const bowlingFrameCount = 10

const (
	bowlingFrameNone = iota
	bowlingFrameStrike
	bowlingFrameSpare
	bowlingFrameClosed
)

// BowlingScores is the per-player scoring state — kept in a real Go struct
// (not GameData's map[string]interface{} soup) since the frame-transition
// logic below is intricate enough that plain typed fields are worth it.
// Stored directly under GameData["scores"] and broadcast as-is (bowling has
// no hidden information, so no separate public/private mirror is needed).
type BowlingScores struct {
	FrameStates  [bowlingFrameCount]int    `json:"frame_states"`
	ThrowResults [bowlingFrameCount][3]int `json:"throw_results"`
	FrameResults [bowlingFrameCount]int    `json:"frame_results"`
	Score        int                       `json:"score"`
	FrameNumber  int                       `json:"frame_number"`
	ThrowNumber  int                       `json:"throw_number"`
	GameOver     bool                      `json:"game_over"`
	PinsStanding int                       `json:"pins_standing"` // pins still up for the throw about to happen
}

func newBowlingScores() *BowlingScores {
	return &BowlingScores{PinsStanding: 10}
}

func (s *BowlingScores) getResult(throwNum int) int {
	return s.ThrowResults[s.FrameNumber][throwNum]
}

func (s *BowlingScores) getFrameResult() int {
	return s.getResult(0) + s.getResult(1)
}

func (s *BowlingScores) getLastFrameResult() int {
	return s.getResult(0) + s.getResult(1) + s.getResult(2)
}

func (s *BowlingScores) addScore(frameNumber, score int) {
	s.Score += score
	s.FrameStates[frameNumber] = bowlingFrameClosed
	s.FrameResults[frameNumber] = s.Score
}

func (s *BowlingScores) closeFrame(state int) {
	s.FrameStates[s.FrameNumber] = state
	if s.FrameNumber < bowlingFrameCount-1 {
		s.FrameNumber++
		s.ThrowNumber = 0
		s.PinsStanding = 10
	} else {
		s.GameOver = true
	}
}

func (s *BowlingScores) setThrowResult(result int) {
	s.ThrowResults[s.FrameNumber][s.ThrowNumber] = result
}

// AddThrowResult applies one throw's pin count, mirroring scores.js's
// addThrowResult exactly (including the triple/double-strike carry-forward
// cases) and returns an error if the game's already over or the reported
// pin count couldn't have happened given how many pins were actually
// standing (pinsRemainingInFrame is maintained alongside the ported
// control-flow itself, since the same frame/throw branches that decide
// strike/spare/close also determine when the rack resets to a fresh 10).
func (s *BowlingScores) AddThrowResult(result int) error {
	if s.GameOver {
		return fmt.Errorf("game over")
	}
	if result < 0 || result > 10 {
		return fmt.Errorf("invalid throw result: %d", result)
	}
	if result > s.PinsStanding {
		return fmt.Errorf("can't knock down %d pins — only %d standing", result, s.PinsStanding)
	}

	s.ThrowResults[s.FrameNumber][s.ThrowNumber] = result

	prevState := bowlingFrameClosed
	if s.FrameNumber > 0 {
		prevState = s.FrameStates[s.FrameNumber-1]
	}
	prevPrevState := bowlingFrameClosed
	if s.FrameNumber > 1 {
		prevPrevState = s.FrameStates[s.FrameNumber-2]
	}

	if s.FrameNumber < bowlingFrameCount-1 {
		if s.ThrowNumber == 0 {
			// First throw of a regular frame.
			if prevState == bowlingFrameSpare {
				s.addScore(s.FrameNumber-1, 10+result)
			}
			if result == 10 {
				if prevState == bowlingFrameStrike && prevPrevState == bowlingFrameStrike {
					s.addScore(s.FrameNumber-2, 30)
				}
				s.setThrowResult(result)
				s.closeFrame(bowlingFrameStrike)
			} else {
				if prevState == bowlingFrameStrike && prevPrevState == bowlingFrameStrike {
					s.addScore(s.FrameNumber-2, 20+result)
				}
				s.setThrowResult(result)
				s.ThrowNumber++
				s.PinsStanding = 10 - result
			}
		} else {
			// Second throw of a regular frame.
			if prevState == bowlingFrameStrike {
				s.addScore(s.FrameNumber-1, 10+s.getFrameResult())
			}
			if s.getFrameResult() == 10 {
				s.setThrowResult(result)
				s.closeFrame(bowlingFrameSpare)
			} else {
				s.setThrowResult(result)
				s.addScore(s.FrameNumber, s.getFrameResult())
				s.closeFrame(bowlingFrameClosed)
			}
		}
	} else {
		// 10th (last) frame.
		if s.ThrowNumber == 0 {
			if prevState == bowlingFrameStrike && prevPrevState == bowlingFrameStrike {
				if result == 10 {
					s.addScore(s.FrameNumber-2, 30)
				} else {
					s.addScore(s.FrameNumber-2, 20+result)
				}
			} else if prevState == bowlingFrameSpare {
				s.addScore(s.FrameNumber-1, 10+result)
			}
			s.setThrowResult(result)
			s.ThrowNumber++
			if result == 10 {
				s.PinsStanding = 10 // strike — fresh rack for the bonus throw
			} else {
				s.PinsStanding = 10 - result
			}
		} else if s.ThrowNumber == 1 {
			if prevState == bowlingFrameStrike {
				if s.getFrameResult() == 20 {
					s.addScore(s.FrameNumber-1, 30)
				} else {
					s.addScore(s.FrameNumber-1, 10+s.getFrameResult())
				}
			}
			s.setThrowResult(result)
			if s.getFrameResult() >= 10 {
				s.ThrowNumber++
				if s.getResult(0) == 10 {
					// Strike on throw 1 — throw 2 was already a fresh rack;
					// throw 3's standing pins depend on whether throw 2 also
					// cleared it.
					if result == 10 {
						s.PinsStanding = 10
					} else {
						s.PinsStanding = 10 - result
					}
				} else {
					// throw1+throw2 == 10 (spare) — fresh rack for throw 3.
					s.PinsStanding = 10
				}
			} else {
				s.addScore(s.FrameNumber, s.getFrameResult())
				s.closeFrame(bowlingFrameClosed)
			}
		} else {
			// Third (bonus) throw of the 10th frame.
			s.addScore(s.FrameNumber, s.getLastFrameResult())
			s.setThrowResult(result)
			s.closeFrame(bowlingFrameClosed)
		}
	}

	return nil
}

// Bowling is perfect-information (every player's scoresheet is legitimately
// visible to everyone) — unlike Crazy Eights/Rebus Round/etc., there's no
// hidden-state reason to keep an internal field separate from a broadcast
// mirror. GameData["scores"] IS the real, live *BowlingScores for each
// player, broadcast as-is; encoding/json marshals a *struct stored inside a
// map[string]interface{} correctly via reflection, same as every other
// typed value this package already stores directly in GameData.
func ensureBowlingState(gameState *GameSessionState) {
	if gameState.GameData["scores"] != nil {
		return
	}
	scores := map[string]interface{}{}
	for _, p := range gameState.Players {
		scores[fmt.Sprintf("%d", p.UserID)] = newBowlingScores()
	}
	gameState.GameData["scores"] = scores
}

// bowlingScoresFor fetches a player's *BowlingScores from GameData.
// GameData is only ever mutated in-process within one server run (never
// reloaded from the DB mid-session — see game_manager.go's own documented
// "purely in-memory" convention), so within a single move this is always
// the exact same Go struct pointer ensureBowlingState set.
func bowlingScoresFor(gameState *GameSessionState, playerID uint) (*BowlingScores, error) {
	scores, _ := gameState.GameData["scores"].(map[string]interface{})
	if scores == nil {
		return nil, fmt.Errorf("bowling state not initialized")
	}
	key := fmt.Sprintf("%d", playerID)
	switch v := scores[key].(type) {
	case *BowlingScores:
		return v, nil
	default:
		return nil, fmt.Errorf("no bowling scores for player %d", playerID)
	}
}

func (gm *GameManager) processBowlingMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	ensureBowlingState(gameState)

	switch moveType {
	case "throw":
		pinsF, ok := moveData["pins_down"].(float64)
		if !ok {
			return false, nil, fmt.Errorf("missing pins_down")
		}
		scores, err := bowlingScoresFor(gameState, playerID)
		if err != nil {
			return false, nil, err
		}
		frameNumberBefore := scores.FrameNumber
		if err := scores.AddThrowResult(int(pinsF)); err != nil {
			return false, nil, err
		}

		// The thrower's own client-side physics is the only place that knows
		// which SPECIFIC pins are still standing (the server only ever sees
		// an aggregate pins-down count — see AddThrowResult) — this bitmask
		// (bit i set = pin i standing, matching bowlingPhysics.js's own
		// PIN_POSITIONS-indexed convention) is what lets a spectator with no
		// local physics render the correct rack layout between throws,
		// rather than just a "how many are up" number. Optional: an older
		// client omitting it just leaves whatever mask was already broadcast
		// (harmless — the very next throw from the same/any thrower will
		// include a fresh one).
		if maskF, ok := moveData["pin_mask"].(float64); ok {
			gameState.GameData["pin_mask"] = int(maskF)
		}
		// This throw has fully settled — any in-flight throw_progress
		// snapshot is now stale (the ball/pins it described have already
		// resolved to whatever pin_mask above now says). Clearing it stops a
		// late-joining spectator from ever rendering a frozen mid-air ball
		// that nothing will ever update again, mirroring pool.go's identical
		// delete(...,"live_ball_positions") on its own final "shot" move.
		delete(gameState.GameData, "throw_progress")

		// closeFrame (called from inside AddThrowResult) is the ONLY place
		// that either advances FrameNumber (a regular frame closing) or
		// flips GameOver (the 10th frame's own final resolution, which
		// never advances FrameNumber since it's already the last index) —
		// so this single check correctly distinguishes "this player's frame
		// just closed" from "they still owe another throw in the SAME
		// frame," regardless of whether it closed via a strike (frame 1's
		// only throw), a completed second throw, or the 10th frame's
		// 2nd/3rd throw. Deliberately NOT the same thing as "is this
		// player's whole 10-frame game over" (scores.GameOver alone) — a
		// strike on frame 1 correctly closes that frame and passes the
		// turn, even though the player obviously still has 9 more frames
		// to go; conflating the two was a real bug caught by
		// TestBowlingStrikeAdvancesTurnImmediately.
		frameClosed := scores.FrameNumber != frameNumberBefore || scores.GameOver
		if !frameClosed {
			// Same frame still in progress (e.g. a non-strike first throw,
			// or the 10th frame's own extra throws) — CurrentTurn stays put.
			// Bowling is registered in game_manager.go's selfManagedTurn, so
			// there's no generic "+1 mod N" advance to cancel out here
			// (unlike dominoes/darts/othello's decrement-trick games) — this
			// function is the sole owner of CurrentTurn for this game type.
			return false, nil, nil
		}

		// Frame closed — hand the turn to the next player who hasn't
		// already finished all 10 frames (see bowlingAdvanceToNextActivePlayer's
		// own doc comment for why this can't be a plain mod-N cycle: players
		// finish at very different paces depending on how many strikes they
		// roll, so a naive cycle would eventually hand a finished player
		// another turn and hit AddThrowResult's own "game over" rejection).
		gm.bowlingAdvanceToNextActivePlayer(gameState)

		if !scores.GameOver {
			// This player's frame closed but their own 10-frame game isn't
			// finished yet.
			return false, nil, nil
		}

		// This player has finished all 10 frames. If everyone has, the game
		// ends now (highest total score wins, tie is a draw).
		allDone := true
		for _, p := range gameState.Players {
			ps, err := bowlingScoresFor(gameState, p.UserID)
			if err != nil || !ps.GameOver {
				allDone = false
				break
			}
		}
		if allDone {
			return true, bowlingWinnerByScore(gameState), nil
		}
		return false, nil, nil

	case "throw_progress":
		return processBowlingThrowProgress(gameState, moveData)

	default:
		return false, nil, fmt.Errorf("unknown bowling move type: %s", moveType)
	}
}

// bowlingAdvanceToNextActivePlayer moves CurrentTurn forward to the next
// player who hasn't already finished all 10 frames, wrapping around the
// player list. If every player has finished, CurrentTurn is left unchanged
// — the caller's own allDone check ends the game in that case, so where
// CurrentTurn points no longer matters.
func (gm *GameManager) bowlingAdvanceToNextActivePlayer(gameState *GameSessionState) {
	n := len(gameState.Players)
	for i := 1; i <= n; i++ {
		idx := (gameState.CurrentTurn + i) % n
		scores, err := bowlingScoresFor(gameState, gameState.Players[idx].UserID)
		if err == nil && !scores.GameOver {
			gameState.CurrentTurn = idx
			return
		}
	}
}

// processBowlingThrowProgress relays a live, in-progress throw snapshot (the
// active thrower's own ball/pin transforms, sampled from their local Ammo.js
// simulation at a throttled rate — see BowlingGame.jsx's sendThrowProgress)
// straight into GameData for the standard broadcastGameStateLocked path to
// fan out. Purely cosmetic — the receiving room members' own passive scene
// only ever DRAWS these positions, never runs physics on them, so there's
// nothing here to validate: a malformed/missing field just means that one
// frame's spectator render is a no-op, never a state-corruption risk. Same
// trust model as pool.go's processPoolShotProgress, which this mirrors.
func processBowlingThrowProgress(gameState *GameSessionState, moveData map[string]interface{}) (bool, *uint, error) {
	progress := map[string]interface{}{}
	if ball, ok := moveData["ball"]; ok {
		progress["ball"] = ball
	}
	if pins, ok := moveData["pins"]; ok {
		progress["pins"] = pins
	}
	gameState.GameData["throw_progress"] = progress
	return false, nil, nil
}

func bowlingWinnerByScore(gameState *GameSessionState) *uint {
	best := -1
	var bestID uint
	tied := false
	for _, p := range gameState.Players {
		scores, err := bowlingScoresFor(gameState, p.UserID)
		if err != nil {
			continue
		}
		if scores.Score > best {
			best = scores.Score
			bestID = p.UserID
			tied = false
		} else if scores.Score == best {
			tied = true
		}
	}
	if tied || best < 0 {
		return nil
	}
	return &bestID
}
