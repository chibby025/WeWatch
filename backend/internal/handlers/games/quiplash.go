package games

import (
	"fmt"
	"math/rand"
)

// Quiplash-style fill-in-the-blank party game.
// Phase machine:
//   "answering"  — host shows a prompt, players type funny answers (timer-based in frontend)
//   "voting"     — all answers revealed anonymously, players vote for funniest (can't vote own)
//   "reveal"     — scores updated, winner of this round shown
//   "ended"      — game over, final scores displayed
//
// move_types:
//   answer  { text: "my answer" }              (during answering phase)
//   vote    { answer_index: 2 }                (during voting phase, index into answers[])
//   next    {}                                 (host-only: advance to next prompt)
//   end     {}                                 (host-only: end game early)
//
// All answers are public during voting+reveal — no hidden state needed.
// Scores accumulate across rounds (1 point per vote received).

var quiplashPrompts = []string{
	"The worst thing to shout on a first date",
	"A rejected superhero power",
	"The world's worst pizza topping",
	"What aliens would say if they landed in your living room",
	"A terrible name for a baby",
	"The worst password anyone could use",
	"A bad opening line for a horror movie",
	"Something you should never say to your boss",
	"The most useless superpower",
	"A terrible idea for a TV show",
	"The worst thing to find in your cereal",
	"A really bad life motto",
	"Something that would ruin a wedding",
	"The worst thing your GPS could say",
	"A terrible name for a restaurant",
	"Something you don't want to hear from your doctor",
	"The worst movie sequel nobody asked for",
	"A bad name for a pet goldfish",
	"The worst pickup line ever",
	"Something that should never be added to a theme park",
	"A terrible life hack",
	"The worst gift to give your mum",
	"Something you shouldn't text your boss at 3am",
	"The world's worst ice cream flavour",
	"A bad reason to call an ambulance",
	"The worst thing to put on your CV",
	"A terrible app idea",
	"Something that belongs in a haunted house but isn't scary",
	"The worst thing to say when breaking up with someone",
	"A bad name for a bank",
}

const quiplashRoundsDefault = 5

func quiplashInitialState(numPlayers int) map[string]interface{} {
	rounds := quiplashRoundsDefault
	if numPlayers > 6 {
		rounds = 3
	}

	// Shuffle prompt order.
	order := rand.Perm(len(quiplashPrompts))
	orderF := make([]float64, len(order))
	for i, v := range order {
		orderF[i] = float64(v)
	}

	scores := make(map[string]interface{}, numPlayers)
	return map[string]interface{}{
		"phase":          "answering",
		"round":          1.0,
		"total_rounds":   float64(rounds),
		"prompt_order":   orderF,
		"current_prompt": quiplashPrompts[order[0]],
		"answers":        []interface{}{},
		"votes":          map[string]interface{}{},
		"scores":         scores,
	}
}

func (gm *GameManager) processQuiplashMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	ensureQuiplashState(gameState, len(gameState.Players))

	phase, _ := gameState.GameData["phase"].(string)
	hostID := gameState.Players[0].UserID

	switch moveType {
	case "answer":
		if phase != "answering" {
			return false, nil, fmt.Errorf("not in answering phase")
		}
		text, _ := moveData["text"].(string)
		if len(text) == 0 {
			return false, nil, fmt.Errorf("answer cannot be empty")
		}
		if len(text) > 200 {
			text = text[:200]
		}

		answers := quiplashAnswers(gameState)
		playerKey := fmt.Sprintf("%d", playerID)

		// Update or add answer.
		found := false
		for i, a := range answers {
			if am, ok := a.(map[string]interface{}); ok {
				if am["player_id"] == playerKey {
					answers[i] = map[string]interface{}{"player_id": playerKey, "text": text}
					found = true
					break
				}
			}
		}
		if !found {
			answers = append(answers, map[string]interface{}{"player_id": playerKey, "text": text})
		}
		gameState.GameData["answers"] = answers

		// Auto-advance to voting once all players have answered.
		if len(answers) >= len(gameState.Players) {
			gameState.GameData["phase"] = "voting"
		}

		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil

	case "vote":
		if phase != "voting" {
			return false, nil, fmt.Errorf("not in voting phase")
		}
		idxF, ok := moveData["answer_index"].(float64)
		if !ok {
			return false, nil, fmt.Errorf("answer_index required")
		}
		answerIdx := int(idxF)
		answers := quiplashAnswers(gameState)
		if answerIdx < 0 || answerIdx >= len(answers) {
			return false, nil, fmt.Errorf("invalid answer_index")
		}

		// Can't vote for your own answer.
		playerKey := fmt.Sprintf("%d", playerID)
		if am, ok := answers[answerIdx].(map[string]interface{}); ok {
			if am["player_id"] == playerKey {
				return false, nil, fmt.Errorf("cannot vote for your own answer")
			}
		}

		votes := quiplashVotes(gameState)
		votes[playerKey] = answerIdx
		gameState.GameData["votes"] = votes

		// Auto-reveal once everyone (except answerers of un-voteable answers) voted.
		if len(votes) >= len(gameState.Players) {
			quiplashApplyVotes(gameState)
			gameState.GameData["phase"] = "reveal"
		}

		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil

	case "next":
		if playerID != hostID {
			return false, nil, fmt.Errorf("only the host can advance")
		}
		roundF, _ := gameState.GameData["round"].(float64)
		totalF, _ := gameState.GameData["total_rounds"].(float64)
		round := int(roundF)
		total := int(totalF)

		if round >= total {
			// Final round done — end game, compute winner from scores.
			gameState.GameData["phase"] = "ended"
			wid := quiplashWinner(gameState)
			return true, wid, nil
		}

		// Advance to next prompt.
		round++
		orderRaw := gameState.GameData["prompt_order"].([]interface{})
		promptIdx := int(orderRaw[round-1].(float64))

		gameState.GameData["round"] = float64(round)
		gameState.GameData["current_prompt"] = quiplashPrompts[promptIdx]
		gameState.GameData["phase"] = "answering"
		gameState.GameData["answers"] = []interface{}{}
		gameState.GameData["votes"] = map[string]interface{}{}

		gameState.CurrentTurn = (gameState.CurrentTurn - 1 + len(gameState.Players)) % len(gameState.Players)
		return false, nil, nil

	case "end":
		if playerID != hostID {
			return false, nil, fmt.Errorf("only the host can end the game")
		}
		gameState.GameData["phase"] = "ended"
		wid := quiplashWinner(gameState)
		return true, wid, nil

	default:
		return false, nil, fmt.Errorf("unknown move type: %s", moveType)
	}
}

func quiplashApplyVotes(gameState *GameSessionState) {
	answers := quiplashAnswers(gameState)
	votes := quiplashVotes(gameState)
	scores := quiplashScores(gameState)

	// Tally votes → credit points to answer authors.
	voteTally := make([]int, len(answers))
	for _, idx := range votes {
		if i, ok := idx.(float64); ok && int(i) < len(answers) {
			voteTally[int(i)]++
		}
		if i, ok := idx.(int); ok && i < len(answers) {
			voteTally[i]++
		}
	}
	for i, count := range voteTally {
		if am, ok := answers[i].(map[string]interface{}); ok {
			pid, _ := am["player_id"].(string)
			existing, _ := scores[pid].(float64)
			scores[pid] = existing + float64(count)
		}
	}
	gameState.GameData["scores"] = scores

	// Annotate answers with their vote count for the reveal UI.
	for i, a := range answers {
		if am, ok := a.(map[string]interface{}); ok {
			am["vote_count"] = voteTally[i]
			answers[i] = am
		}
	}
	gameState.GameData["answers"] = answers
}

func quiplashWinner(gameState *GameSessionState) *uint {
	scores := quiplashScores(gameState)
	var bestID string
	var bestScore float64 = -1
	tied := false
	for pid, raw := range scores {
		s, _ := raw.(float64)
		if s > bestScore {
			bestScore = s
			bestID = pid
			tied = false
		} else if s == bestScore {
			tied = true
		}
	}
	if tied || bestID == "" {
		return nil
	}
	for _, p := range gameState.Players {
		if fmt.Sprintf("%d", p.UserID) == bestID {
			uid := p.UserID
			return &uid
		}
	}
	return nil
}

func ensureQuiplashState(gameState *GameSessionState, numPlayers int) {
	if gameState.GameData["phase"] == nil {
		for k, v := range quiplashInitialState(numPlayers) {
			gameState.GameData[k] = v
		}
	}
}

func quiplashAnswers(gameState *GameSessionState) []interface{} {
	raw := gameState.GameData["answers"]
	if a, ok := raw.([]interface{}); ok {
		return a
	}
	return []interface{}{}
}

func quiplashVotes(gameState *GameSessionState) map[string]interface{} {
	raw := gameState.GameData["votes"]
	if m, ok := raw.(map[string]interface{}); ok {
		return m
	}
	return map[string]interface{}{}
}

func quiplashScores(gameState *GameSessionState) map[string]interface{} {
	raw := gameState.GameData["scores"]
	if m, ok := raw.(map[string]interface{}); ok {
		return m
	}
	return map[string]interface{}{}
}
