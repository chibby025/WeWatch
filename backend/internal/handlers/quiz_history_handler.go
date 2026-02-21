package handlers

import (
	"encoding/json"
	"log"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/services"
)

// HandleQuizHistory processes user request for their quiz history
func (client *Client) HandleQuizHistory(msg WebSocketMessage) {
	var historyData struct {
		SessionID string `json:"session_id"` // ✅ FIX: session_id is UUID string, not uint
	}

	if m, ok := msg.Data.(map[string]interface{}); ok {
		if sessionID, ok := m["session_id"].(string); ok {
			historyData.SessionID = sessionID
		}
	}

	log.Printf("[quiz_history] 📚 User %d requesting quiz history for session %s", client.userID, historyData.SessionID)

	quizService := services.NewQuizService(DB)

	// ✅ Use GetQuizHistoryForSession which accepts session UUID string
	history, err := quizService.GetQuizHistoryForSession(historyData.SessionID, client.userID)
	if err != nil {
		log.Printf("[quiz_history] ❌ Error getting quiz history: %v", err)
		errorMsg := map[string]interface{}{
			"type":  "quiz_error",
			"error": "Failed to retrieve quiz history",
		}
		if errorBytes, e := json.Marshal(errorMsg); e == nil {
			select {
			case client.send <- OutgoingMessage{Data: errorBytes, IsBinary: false}:
			default:
			}
		}
		return
	}

	activeQuizzes := history["active_quizzes"].([]models.Quiz)
	completedSubmissions := history["completed_submissions"].([]map[string]interface{})

	log.Printf("[quiz_history] ✅ Found %d active quizzes, %d completed submissions", 
		len(activeQuizzes), len(completedSubmissions))

	// Send history to user
	historyMsg := map[string]interface{}{
		"type": "quiz_history",
		"data": history,
	}

	if historyBytes, err := json.Marshal(historyMsg); err == nil {
		select {
		case client.send <- OutgoingMessage{Data: historyBytes, IsBinary: false}:
			log.Printf("[quiz_history] 📤 Sent quiz history to user")
		default:
		}
	}
}
