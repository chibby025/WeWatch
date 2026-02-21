// WeWatch/backend/internal/handlers/quiz_handlers.go
package handlers

import (
	"encoding/json"
	"log"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/services"
)

// HandleQuizCreate processes quiz creation by host
func (client *Client) HandleQuizCreate(msg WebSocketMessage) {
	var quizData struct {
		RoomID       uint                 `json:"room_id"`
		SessionID    string               `json:"session_id"` // ✅ FIX: session_id is UUID string, not uint
		Name         string               `json:"name"`
		Questions    []models.Question    `json:"questions"`
		TimerEnabled bool                 `json:"timer_enabled"`
		TimerSeconds *int                 `json:"timer_seconds"`
	}

	// Parse data
	if m, ok := msg.Data.(map[string]interface{}); ok {
		if rid, ok := m["room_id"].(float64); ok {
			quizData.RoomID = uint(rid)
		}
		if sid, ok := m["session_id"].(string); ok {
			quizData.SessionID = sid
		}
		if name, ok := m["name"].(string); ok {
			quizData.Name = name
		}
		if timerEnabled, ok := m["timer_enabled"].(bool); ok {
			quizData.TimerEnabled = timerEnabled
		}
		if timerSeconds, ok := m["timer_seconds"].(float64); ok {
			seconds := int(timerSeconds)
			quizData.TimerSeconds = &seconds
		}

		// Parse questions
		if questions, ok := m["questions"].([]interface{}); ok {
			for _, q := range questions {
				if qMap, ok := q.(map[string]interface{}); ok {
					question := models.Question{}
					if id, ok := qMap["id"].(float64); ok {
						question.ID = int(id)
					}
					if qType, ok := qMap["type"].(string); ok {
						question.Type = qType
					}
					if qText, ok := qMap["question"].(string); ok {
						question.Question = qText
					}
					if correctAns, ok := qMap["correct_answer"].(string); ok {
						question.CorrectAnswer = correctAns
					}

					// Parse options for multiple choice
					if opts, ok := qMap["options"].([]interface{}); ok {
						question.Options = make([]string, len(opts))
						for i, opt := range opts {
							if optStr, ok := opt.(string); ok {
								question.Options[i] = optStr
							}
						}
					}

					quizData.Questions = append(quizData.Questions, question)
				}
			}
		}
	}

	log.Printf("[quiz_create] 📝 Host %d creating quiz '%s' with %d questions", 
		client.userID, quizData.Name, len(quizData.Questions))

	// Create quiz service
	quizService := services.NewQuizService(DB)

	// Create quiz
	quiz := &models.Quiz{
		RoomID:       quizData.RoomID,
		SessionID:    quizData.SessionID,
		HostID:       client.userID,
		Name:         quizData.Name,
		Questions:    quizData.Questions,
		TimerEnabled: quizData.TimerEnabled,
		TimerSeconds: quizData.TimerSeconds,
	}

	if err := quizService.CreateQuiz(quiz); err != nil {
		log.Printf("[quiz_create] ❌ Error creating quiz: %v", err)
		errorMsg := map[string]interface{}{
			"type":  "quiz_error",
			"error": err.Error(),
		}
		if errorBytes, err := json.Marshal(errorMsg); err == nil {
			select {
			case client.send <- OutgoingMessage{Data: errorBytes, IsBinary: false}:
			default:
			}
		}
		return
	}

	log.Printf("[quiz_create] ✅ Quiz created with ID %d", quiz.ID)

	// Send confirmation to host with full quiz object
	responseMsg := map[string]interface{}{
		"type": "quiz_created",
		"data": quiz, // Send the full quiz object
	}

	if responseBytes, err := json.Marshal(responseMsg); err == nil {
		select {
		case client.send <- OutgoingMessage{Data: responseBytes, IsBinary: false}:
			log.Printf("[quiz_create] 📤 Sent confirmation to host")
		default:
			log.Printf("[quiz_create] ⚠️ Failed to send confirmation (buffer full)")
		}
	}
}

// HandleQuizPublish processes quiz publishing by host
func (client *Client) HandleQuizPublish(msg WebSocketMessage) {
	var publishData struct {
		QuizID uint `json:"quiz_id"`
	}

	if m, ok := msg.Data.(map[string]interface{}); ok {
		if qid, ok := m["quiz_id"].(float64); ok {
			publishData.QuizID = uint(qid)
		}
	}

	log.Printf("[quiz_publish] 📢 Host %d publishing quiz %d", client.userID, publishData.QuizID)

	quizService := services.NewQuizService(DB)

	// Publish quiz
	if err := quizService.PublishQuiz(publishData.QuizID, client.userID); err != nil {
		log.Printf("[quiz_publish] ❌ Error publishing quiz: %v", err)
		errorMsg := map[string]interface{}{
			"type":  "quiz_error",
			"error": err.Error(),
		}
		if errorBytes, err := json.Marshal(errorMsg); err == nil {
			select {
			case client.send <- OutgoingMessage{Data: errorBytes, IsBinary: false}:
			default:
			}
		}
		return
	}

	// Get full quiz data
	quiz, err := quizService.GetQuiz(publishData.QuizID)
	if err != nil {
		log.Printf("[quiz_publish] ❌ Error retrieving quiz: %v", err)
		return
	}

	log.Printf("[quiz_publish] ✅ Quiz %d published successfully", publishData.QuizID)

	// Broadcast to all users in room
	broadcastMsg := map[string]interface{}{
		"type": "quiz_published",
		"data": map[string]interface{}{
			"quiz_id":         quiz.ID,
			"name":            quiz.Name,
			"total_questions": len(quiz.Questions),
			"timer_enabled":   quiz.TimerEnabled,
			"timer_seconds":   quiz.TimerSeconds,
			"published_at":    quiz.PublishedAt,
			"status":          quiz.Status,
		},
	}

	if broadcastBytes, err := json.Marshal(broadcastMsg); err == nil {
		client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: broadcastBytes, IsBinary: false}, nil)
		log.Printf("[quiz_publish] 📢 Broadcasted quiz_published to room %d", client.roomID)
	}
}

// HandleQuizRequest processes student request for quiz data
func (client *Client) HandleQuizRequest(msg WebSocketMessage) {
	var requestData struct {
		QuizID uint `json:"quiz_id"`
	}

	if m, ok := msg.Data.(map[string]interface{}); ok {
		if qid, ok := m["quiz_id"].(float64); ok {
			requestData.QuizID = uint(qid)
		}
	}

	log.Printf("[quiz_request] 📋 User %d requesting quiz %d", client.userID, requestData.QuizID)

	quizService := services.NewQuizService(DB)

	// Get quiz without answers (for students)
	quiz, err := quizService.GetQuizWithoutAnswers(requestData.QuizID)
	if err != nil {
		log.Printf("[quiz_request] ❌ Error retrieving quiz: %v", err)
		errorMsg := map[string]interface{}{
			"type":  "quiz_error",
			"error": "Quiz not found",
		}
		if errorBytes, err := json.Marshal(errorMsg); err == nil {
			select {
			case client.send <- OutgoingMessage{Data: errorBytes, IsBinary: false}:
			default:
			}
		}
		return
	}

	// Send quiz data to student
	responseMsg := map[string]interface{}{
		"type": "quiz_data",
		"data": map[string]interface{}{
			"quiz_id":       quiz.ID,
			"name":          quiz.Name,
			"timer_seconds": quiz.TimerSeconds,
			"questions":     quiz.Questions, // Correct answers already removed
		},
	}

	if responseBytes, err := json.Marshal(responseMsg); err == nil {
		select {
		case client.send <- OutgoingMessage{Data: responseBytes, IsBinary: false}:
			log.Printf("[quiz_request] 📤 Sent quiz data to user %d", client.userID)
		default:
			log.Printf("[quiz_request] ⚠️ Failed to send quiz data (buffer full)")
		}
	}
}

// HandleQuizSubmit processes student answer submission
func (client *Client) HandleQuizSubmit(msg WebSocketMessage) {
	var submitData struct {
		QuizID  uint            `json:"quiz_id"`
		Answers []models.Answer `json:"answers"`
	}

	if m, ok := msg.Data.(map[string]interface{}); ok {
		if qid, ok := m["quiz_id"].(float64); ok {
			submitData.QuizID = uint(qid)
		}

		// Parse answers
		if answers, ok := m["answers"].([]interface{}); ok {
			for _, a := range answers {
				if aMap, ok := a.(map[string]interface{}); ok {
					answer := models.Answer{}
					if qid, ok := aMap["question_id"].(float64); ok {
						answer.QuestionID = int(qid)
					}
					if ans, ok := aMap["answer"].(string); ok {
						answer.Answer = ans
					}
					if timeTaken, ok := aMap["time_taken"].(float64); ok {
						tt := int(timeTaken)
						answer.TimeTaken = &tt
					}
					submitData.Answers = append(submitData.Answers, answer)
				}
			}
		}
	}

	log.Printf("[quiz_submit] 📝 User %d submitting %d answers for quiz %d", 
		client.userID, len(submitData.Answers), submitData.QuizID)

	quizService := services.NewQuizService(DB)

	// Submit and grade answers
	response, err := quizService.SubmitQuizAnswers(submitData.QuizID, client.userID, submitData.Answers)
	if err != nil {
		log.Printf("[quiz_submit] ❌ Error submitting answers: %v", err)
		errorMsg := map[string]interface{}{
			"type":  "quiz_error",
			"error": err.Error(),
		}
		if errorBytes, err := json.Marshal(errorMsg); err == nil {
			select {
			case client.send <- OutgoingMessage{Data: errorBytes, IsBinary: false}:
			default:
			}
		}
		return
	}

	log.Printf("[quiz_submit] ✅ User %d scored %d/%d on quiz %d", 
		client.userID, response.Score, response.TotalQuestions, submitData.QuizID)

	// Send results to student
	percentage := float64(response.Score) / float64(response.TotalQuestions) * 100
	resultMsg := map[string]interface{}{
		"type": "quiz_results",
		"data": map[string]interface{}{
			"quiz_id":    response.QuizID,
			"score":      response.Score,
			"total":      response.TotalQuestions,
			"percentage": percentage,
			"answers":    response.Answers,
		},
	}

	if resultBytes, err := json.Marshal(resultMsg); err == nil {
		select {
		case client.send <- OutgoingMessage{Data: resultBytes, IsBinary: false}:
			log.Printf("[quiz_submit] 📤 Sent results to user %d", client.userID)
		default:
			log.Printf("[quiz_submit] ⚠️ Failed to send results (buffer full)")
		}
	}

	// Notify host of submission (progress update)
	quiz, _ := quizService.GetQuiz(submitData.QuizID)
	if quiz != nil && quiz.HostID > 0 {
		// Get user info
		var user models.User
		username := "Unknown"
		if err := DB.First(&user, client.userID).Error; err == nil {
			username = user.Username
		}

		// Recalculate average score after this submission
		progress, _ := quizService.GetQuizProgress(submitData.QuizID, quiz.HostID)
		newAverageScore := 0.0
		if progress != nil {
			if avgScore, ok := progress["average_score"].(float64); ok {
				newAverageScore = avgScore
			}
		}

		progressMsg := map[string]interface{}{
			"type": "quiz_submission_received",
			"data": map[string]interface{}{
				"quiz_id":           response.QuizID,
				"user_id":           client.userID,
				"username":          username,
				"score":             response.Score,
				"total":             response.TotalQuestions,
				"new_average_score": newAverageScore,
			},
		}

		if progressBytes, err := json.Marshal(progressMsg); err == nil {
			client.hub.BroadcastToUser(quiz.HostID, client.roomID, OutgoingMessage{Data: progressBytes, IsBinary: false})
			log.Printf("[quiz_submit] 📢 Notified host of submission")
		}
	}
}

// HandleQuizEnd processes host ending a quiz
func (client *Client) HandleQuizEnd(msg WebSocketMessage) {
	var endData struct {
		QuizID uint `json:"quiz_id"`
	}

	if m, ok := msg.Data.(map[string]interface{}); ok {
		if qid, ok := m["quiz_id"].(float64); ok {
			endData.QuizID = uint(qid)
		}
	}

	log.Printf("[quiz_end] 🏁 Host %d ending quiz %d", client.userID, endData.QuizID)

	quizService := services.NewQuizService(DB)

	// End quiz
	if err := quizService.EndQuiz(endData.QuizID, client.userID); err != nil {
		log.Printf("[quiz_end] ❌ Error ending quiz: %v", err)
		errorMsg := map[string]interface{}{
			"type":  "quiz_error",
			"error": err.Error(),
		}
		if errorBytes, err := json.Marshal(errorMsg); err == nil {
			select {
			case client.send <- OutgoingMessage{Data: errorBytes, IsBinary: false}:
			default:
			}
		}
		return
	}

	// Get responses count and average
	responses, _ := quizService.GetQuizResponses(endData.QuizID, client.userID)
	totalSubmissions := len(responses)
	var avgScore float64
	if totalSubmissions > 0 {
		totalScore := 0
		for _, resp := range responses {
			totalScore += resp.Score
		}
		avgScore = float64(totalScore) / float64(totalSubmissions)
	}

	log.Printf("[quiz_end] ✅ Quiz %d ended. Submissions: %d, Avg: %.2f", 
		endData.QuizID, totalSubmissions, avgScore)

	// Broadcast to all users
	endMsg := map[string]interface{}{
		"type": "quiz_ended",
		"data": map[string]interface{}{
			"quiz_id":           endData.QuizID,
			"total_submissions": totalSubmissions,
			"average_score":     avgScore,
		},
	}

	if endBytes, err := json.Marshal(endMsg); err == nil {
		client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: endBytes, IsBinary: false}, nil)
		log.Printf("[quiz_end] 📢 Broadcasted quiz_ended to room %d", client.roomID)
	}
}

// HandleQuizProgress processes host request for quiz progress
func (client *Client) HandleQuizProgress(msg WebSocketMessage) {
	var progressData struct {
		QuizID uint `json:"quiz_id"`
	}

	if m, ok := msg.Data.(map[string]interface{}); ok {
		if qid, ok := m["quiz_id"].(float64); ok {
			progressData.QuizID = uint(qid)
		}
	}

	quizService := services.NewQuizService(DB)

	// Get progress
	progress, err := quizService.GetQuizProgress(progressData.QuizID, client.userID)
	if err != nil {
		log.Printf("[quiz_progress] ❌ Error getting progress: %v", err)
		return
	}

	// Send progress to host
	progressMsg := map[string]interface{}{
		"type": "quiz_progress",
		"data": progress,
	}

	if progressBytes, err := json.Marshal(progressMsg); err == nil {
		select {
		case client.send <- OutgoingMessage{Data: progressBytes, IsBinary: false}:
			log.Printf("[quiz_progress] 📊 Sent progress to host")
		default:
		}
	}
}

// HandleQuizExportRequest processes quiz export requests
func (client *Client) HandleQuizExportRequest(msg WebSocketMessage) {
	var exportData struct {
		QuizID uint `json:"quiz_id"`
	}

	// Parse quiz_id from request
	if m, ok := msg.Data.(map[string]interface{}); ok {
		if qid, ok := m["quiz_id"].(float64); ok {
			exportData.QuizID = uint(qid)
		}
	}

	if exportData.QuizID == 0 {
		log.Printf("[quiz_export] ❌ Invalid quiz_id")
		return
	}

	log.Printf("[quiz_export] 📥 User %d requesting export for quiz %d", client.userID, exportData.QuizID)

	quizService := services.NewQuizService(DB)

	// Get quiz data (verify ownership/access)
	quiz, err := quizService.GetQuiz(exportData.QuizID)
	if err != nil {
		log.Printf("[quiz_export] ❌ Error fetching quiz: %v", err)
		return
	}

	// Verify user has permission (host only for now)
	if quiz.HostID != client.userID {
		log.Printf("[quiz_export] ❌ User %d not authorized to export quiz %d", client.userID, exportData.QuizID)
		return
	}

	// Get all quiz responses
	responses, err := quizService.GetQuizResponses(exportData.QuizID, client.userID)
	if err != nil {
		log.Printf("[quiz_export] ❌ Error fetching responses: %v", err)
		responses = []models.QuizResponse{} // Empty array if error
	}

	// ✅ Enrich responses with usernames
	type ResponseWithUsername struct {
		models.QuizResponse
		Username string `json:"username"`
	}
	
	enrichedResponses := make([]ResponseWithUsername, 0, len(responses))
	for _, resp := range responses {
		var user models.User
		username := "Anonymous"
		if err := DB.First(&user, resp.UserID).Error; err == nil {
			username = user.Username
		}
		enrichedResponses = append(enrichedResponses, ResponseWithUsername{
			QuizResponse: resp,
			Username:     username,
		})
	}

	// Calculate statistics
	totalSubmissions := len(responses)
	var totalScore float64
	passCount := 0

	for _, resp := range responses {
		totalScore += float64(resp.Score)
		// Consider 60% as passing (adjust as needed)
		percentage := (float64(resp.Score) / float64(resp.TotalQuestions)) * 100
		if percentage >= 60.0 {
			passCount++
		}
	}

	averageScore := 0.0
	if totalSubmissions > 0 {
		averageScore = totalScore / float64(totalSubmissions)
	}

	passRate := 0.0
	if totalSubmissions > 0 {
		passRate = (float64(passCount) / float64(totalSubmissions)) * 100
	}

	// Build export data response
	exportResponse := map[string]interface{}{
		"type": "quiz_export_data",
		"data": map[string]interface{}{
			"quiz":              quiz,
			"responses":         enrichedResponses,
			"submitted_count":   totalSubmissions,
			"average_score":     averageScore,
			"pass_rate":         passRate,
			"total_questions":   len(quiz.Questions),
		},
	}

	// Send export data to client
	if exportBytes, err := json.Marshal(exportResponse); err == nil {
		select {
		case client.send <- OutgoingMessage{Data: exportBytes, IsBinary: false}:
			log.Printf("[quiz_export] ✅ Sent export data for quiz %d to user %d", exportData.QuizID, client.userID)
		default:
			log.Printf("[quiz_export] ⚠️ Failed to send export data, channel full")
		}
	}
}
