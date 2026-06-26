package games

import (
	"fmt"
)

func (gm *GameManager) processTriviaMove(gameState *GameSessionState, playerID uint, moveType string, moveData map[string]interface{}) (gameOver bool, winnerID *uint, err error) {
	hostID := gameState.GameSession.HostID

	switch moveType {
	case "trivia_question":
		if playerID != hostID {
			return false, nil, fmt.Errorf("only the host can send questions")
		}
		question, ok := moveData["question"]
		if !ok {
			return false, nil, fmt.Errorf("missing question data")
		}
		gameState.GameData["current_question"] = question
		gameState.GameData["answers"] = make(map[string]interface{})
		gameState.GameData["phase"] = "question"
		round, _ := gameState.GameData["round"].(float64)
		gameState.GameData["round"] = round + 1
		return false, nil, nil

	case "answer":
		answers, ok := gameState.GameData["answers"].(map[string]interface{})
		if !ok {
			answers = make(map[string]interface{})
		}
		playerIDStr := fmt.Sprintf("%d", playerID)
		if _, exists := answers[playerIDStr]; exists {
			return false, nil, fmt.Errorf("already answered this question")
		}
		answerIndex, ok := moveData["answer_index"]
		if !ok {
			return false, nil, fmt.Errorf("missing answer_index")
		}
		answers[playerIDStr] = answerIndex
		gameState.GameData["answers"] = answers
		return false, nil, nil

	case "reveal":
		if playerID != hostID {
			return false, nil, fmt.Errorf("only the host can reveal answers")
		}
		currentQuestion, ok := gameState.GameData["current_question"].(map[string]interface{})
		if !ok {
			return false, nil, fmt.Errorf("no active question to reveal")
		}
		correctIndex, _ := currentQuestion["correct_index"].(float64)
		answers, _ := gameState.GameData["answers"].(map[string]interface{})
		scores, ok := gameState.GameData["scores"].(map[string]interface{})
		if !ok {
			scores = make(map[string]interface{})
		}
		for pid, ai := range answers {
			if aiFloat, ok := ai.(float64); ok && aiFloat == correctIndex {
				current, _ := scores[pid].(float64)
				scores[pid] = current + 100
			}
		}
		gameState.GameData["scores"] = scores
		gameState.GameData["phase"] = "reveal"
		return false, nil, nil

	case "trivia_end":
		// Host-only, like trivia_question/reveal — covers both the "Show Results" path
		// (after the last round) and "End Game" (mid-session). Either way, the winner is
		// computed from whatever scores actually exist right now — never a forfeit-style
		// "the other player automatically wins", which doesn't even make sense once a
		// trivia game can have more than 2 players.
		if playerID != hostID {
			return false, nil, fmt.Errorf("only the host can end the game")
		}
		scores, _ := gameState.GameData["scores"].(map[string]interface{})
		var bestScore float64 = -1
		var winners []uint
		for _, p := range gameState.Players {
			s, _ := scores[fmt.Sprintf("%d", p.UserID)].(float64)
			if s > bestScore {
				bestScore = s
				winners = []uint{p.UserID}
			} else if s == bestScore {
				winners = append(winners, p.UserID)
			}
		}
		// A tie for first (including a 0-0 tie if no one ever scored) has no single
		// winner — winnerID stays nil and the frontend renders it as a draw.
		var winnerID *uint
		if len(winners) == 1 {
			winnerID = &winners[0]
		}
		gameState.GameData["phase"] = "ended"
		return true, winnerID, nil

	default:
		return false, nil, fmt.Errorf("unknown trivia move type: %s", moveType)
	}
}
