package games

import (
	"fmt"
	"math/rand"
	"strings"
	"time"
)

// Draw & Guess: one player (the drawer) is given a secret word and draws it on a
// shared canvas; everyone else races to guess it via text. Simultaneous game (all
// guessers act at once) — added to simultaneousGames in game_manager.go.
//
// Hidden information: the current word, shown only to the drawer via a private
// "draw_word" message (sendDrawerWord in websocket_handler.go, BroadcastJSONToUser).
// The public GameData never contains current_word — only the letter count / mask.
//
// Canvas strokes do NOT go through make_move — they use the relay_packet path
// (handleRelayPacket), which is far cheaper for a ~real-time stroke stream. This
// file only handles the turn/scoring logic.
//
// Phases: "waiting" (between rounds) → "drawing" (drawer draws, guessers guess) →
//         "reveal" (word shown, scores tallied) → loop until every player has drawn
//         once → game over (highest scorer wins).

const drawGuessRoundMs = 60000 // 60s per round, matched by the frontend timer

var drawGuessWords = []string{
	"apple", "bicycle", "castle", "dragon", "elephant", "flower", "guitar", "house",
	"island", "jacket", "kangaroo", "ladder", "mountain", "notebook", "octopus",
	"pizza", "queen", "rocket", "snowman", "tree", "umbrella", "volcano", "whale",
	"xylophone", "yacht", "zebra", "airplane", "balloon", "camera", "dolphin",
	"engine", "fountain", "giraffe", "hammer", "igloo", "jellyfish", "kite", "lion",
	"mushroom", "necklace", "orange", "pumpkin", "rainbow", "sandwich", "telescope",
	"unicorn", "violin", "windmill", "anchor", "butterfly",
}

func drawGuessInitialState() map[string]interface{} {
	return map[string]interface{}{
		"phase":          "waiting",
		"round":          0,
		"scores":         map[string]interface{}{},
		"current_drawer": nil,
		"word_length":    0,
	}
}

func ensureDrawGuessState(gameState *GameSessionState) {
	if gameState.GameData["phase"] == nil {
		for k, v := range drawGuessInitialState() {
			gameState.GameData[k] = v
		}
	}
}

func drawGuessScores(gameState *GameSessionState) map[string]interface{} {
	if m, ok := gameState.GameData["scores"].(map[string]interface{}); ok {
		return m
	}
	m := map[string]interface{}{}
	gameState.GameData["scores"] = m
	return m
}

func drawGuessAddScore(gameState *GameSessionState, userID uint, points float64) {
	scores := drawGuessScores(gameState)
	key := fmt.Sprintf("%d", userID)
	cur, _ := scores[key].(float64)
	scores[key] = cur + points
	gameState.GameData["scores"] = scores
}

func drawGuessCorrectGuessers(gameState *GameSessionState) map[string]interface{} {
	if m, ok := gameState.GameData["correct_guessers"].(map[string]interface{}); ok {
		return m
	}
	m := map[string]interface{}{}
	gameState.GameData["correct_guessers"] = m
	return m
}

// drawGuessNextDrawerIndex rotates through players by round index (0-based round in
// GameData drives player index).
func drawGuessNextDrawerIndex(gameState *GameSessionState) int {
	round, _ := gameState.GameData["round"].(float64)
	return int(round) % len(gameState.Players)
}

func (gm *GameManager) processDrawGuessMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	ensureDrawGuessState(gameState)
	hostID := gameState.GameSession.HostID

	switch moveType {
	case "start_round":
		if playerID != hostID {
			return false, nil, fmt.Errorf("only the host can start a round")
		}
		drawerIdx := drawGuessNextDrawerIndex(gameState)
		drawer := gameState.Players[drawerIdx]
		word := drawGuessWords[rand.Intn(len(drawGuessWords))]

		gameState.GameData["current_word"] = word // stripped from broadcasts (see below)
		gameState.GameData["word_length"] = len(word)
		gameState.GameData["current_drawer"] = float64(drawer.UserID)
		gameState.GameData["phase"] = "drawing"
		gameState.GameData["guesses"] = map[string]interface{}{}
		gameState.GameData["correct_guessers"] = map[string]interface{}{}
		gameState.GameData["round_start_ms"] = float64(time.Now().UnixMilli())

		// The private word delivery to the drawer is handled by the caller
		// (handleGameMove → sendDrawerWord) after this move is processed, since only
		// the WS handler has access to the hub/room to send a single-user message.
		return false, nil, nil

	case "guess":
		phase, _ := gameState.GameData["phase"].(string)
		if phase != "drawing" {
			return false, nil, fmt.Errorf("not in the guessing phase")
		}
		drawerF, _ := gameState.GameData["current_drawer"].(float64)
		if uint(drawerF) == playerID {
			return false, nil, fmt.Errorf("the drawer can't guess")
		}
		text, _ := moveData["text"].(string)
		word, _ := gameState.GameData["current_word"].(string)

		correctGuessers := drawGuessCorrectGuessers(gameState)
		guesserKey := fmt.Sprintf("%d", playerID)
		if _, already := correctGuessers[guesserKey]; already {
			return false, nil, fmt.Errorf("you already guessed it")
		}

		if strings.EqualFold(strings.TrimSpace(text), strings.TrimSpace(word)) {
			// Speed-based score: 100 at t=0, decaying to 0 over 60s.
			startMs, _ := gameState.GameData["round_start_ms"].(float64)
			elapsed := float64(time.Now().UnixMilli()) - startMs
			guesserPoints := 100.0 * (1.0 - elapsed/float64(drawGuessRoundMs))
			if guesserPoints < 10 {
				guesserPoints = 10 // floor so a correct late guess still rewards something
			}
			drawGuessAddScore(gameState, playerID, guesserPoints)

			// Drawer gets 50 per correct guess.
			drawGuessAddScore(gameState, uint(drawerF), 50)

			correctGuessers[guesserKey] = true
			gameState.GameData["correct_guessers"] = correctGuessers

			// Auto-advance to reveal once every non-drawer has guessed correctly.
			nonDrawers := len(gameState.Players) - 1
			if len(correctGuessers) >= nonDrawers && nonDrawers > 0 {
				gameState.GameData["phase"] = "reveal"
			}
		}
		// The raw text isn't stored publicly (would leak partial hints / spam) —
		// only the correct/incorrect outcome affects state. The frontend shows the
		// guesser their own result locally.
		return false, nil, nil

	case "end_round":
		if playerID != hostID {
			return false, nil, fmt.Errorf("only the host can end the round")
		}
		gameState.GameData["phase"] = "reveal"
		return false, nil, nil

	case "next_round":
		if playerID != hostID {
			return false, nil, fmt.Errorf("only the host can advance rounds")
		}
		round, _ := gameState.GameData["round"].(float64)
		nextRound := int(round) + 1
		gameState.GameData["round"] = float64(nextRound)

		// Every player has drawn once → end the game, highest scorer wins.
		if nextRound >= len(gameState.Players) {
			scores := drawGuessScores(gameState)
			var best float64 = -1
			var winners []uint
			for _, p := range gameState.Players {
				s, _ := scores[fmt.Sprintf("%d", p.UserID)].(float64)
				if s > best {
					best = s
					winners = []uint{p.UserID}
				} else if s == best {
					winners = append(winners, p.UserID)
				}
			}
			gameState.GameData["phase"] = "ended"
			var wid *uint
			if len(winners) == 1 {
				wid = &winners[0]
			}
			return true, wid, nil
		}

		gameState.GameData["phase"] = "waiting"
		delete(gameState.GameData, "current_word")
		gameState.GameData["current_drawer"] = nil
		return false, nil, nil

	default:
		return false, nil, fmt.Errorf("unknown draw_guess move type: %s", moveType)
	}
}

// drawGuessPublicState returns a copy of GameData with the secret current_word
// stripped — used when broadcasting to the whole room so guessers never receive the
// answer. The drawer gets the word separately via sendDrawerWord.
func drawGuessPublicState(gameData map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(gameData))
	for k, v := range gameData {
		if k == "current_word" {
			continue
		}
		out[k] = v
	}
	return out
}
