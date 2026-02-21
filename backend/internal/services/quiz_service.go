// WeWatch/backend/internal/services/quiz_service.go
package services

import (
	"errors"
	"strings"
	"time"
	"wewatch-backend/internal/models"
	"gorm.io/gorm"
)

// QuizService handles business logic for quizzes
type QuizService struct {
	db *gorm.DB
}

// NewQuizService creates a new quiz service
func NewQuizService(db *gorm.DB) *QuizService {
	return &QuizService{db: db}
}

// CreateQuiz creates a new quiz (draft status)
func (s *QuizService) CreateQuiz(quiz *models.Quiz) error {
	// Validate questions
	if err := quiz.ValidateQuestions(); err != nil {
		return err
	}
	
	// Ensure draft status on creation
	quiz.Status = "draft"
	quiz.PublishedAt = nil
	quiz.EndedAt = nil
	
	return s.db.Create(quiz).Error
}

// PublishQuiz publishes a draft quiz to students
func (s *QuizService) PublishQuiz(quizID uint, hostID uint) error {
	var quiz models.Quiz
	
	// Find quiz and verify ownership
	if err := s.db.First(&quiz, quizID).Error; err != nil {
		return err
	}
	
	if quiz.HostID != hostID {
		return errors.New("only the quiz creator can publish it")
	}
	
	if quiz.Status != "draft" {
		return errors.New("only draft quizzes can be published")
	}
	
	// Update status
	now := time.Now()
	quiz.Status = "in_progress"
	quiz.PublishedAt = &now
	
	return s.db.Save(&quiz).Error
}

// GetQuiz retrieves a quiz by ID
func (s *QuizService) GetQuiz(quizID uint) (*models.Quiz, error) {
	var quiz models.Quiz
	if err := s.db.First(&quiz, quizID).Error; err != nil {
		return nil, err
	}
	return &quiz, nil
}

// GetQuizWithoutAnswers returns quiz questions without correct answers (for students)
func (s *QuizService) GetQuizWithoutAnswers(quizID uint) (*models.Quiz, error) {
	quiz, err := s.GetQuiz(quizID)
	if err != nil {
		return nil, err
	}
	
	// Remove correct answers from questions
	for i := range quiz.Questions {
		quiz.Questions[i].CorrectAnswer = ""
	}
	
	return quiz, nil
}

// SubmitQuizAnswers grades and saves student answers
func (s *QuizService) SubmitQuizAnswers(quizID uint, userID uint, answers []models.Answer) (*models.QuizResponse, error) {
	// Get quiz
	quiz, err := s.GetQuiz(quizID)
	if err != nil {
		return nil, err
	}
	
	// Check quiz is active
	if quiz.Status != "in_progress" {
		return nil, errors.New("quiz is not active")
	}
	
	// Check if user already submitted
	var existingResponse models.QuizResponse
	if err := s.db.Where("quiz_id = ? AND user_id = ?", quizID, userID).First(&existingResponse).Error; err == nil {
		return nil, errors.New("you have already submitted answers for this quiz")
	}
	
	// Grade answers
	gradedAnswers, score := s.GradeAnswers(quiz, answers)
	
	// Create response
	response := &models.QuizResponse{
		QuizID:         quizID,
		UserID:         userID,
		Answers:        gradedAnswers,
		Score:          score,
		TotalQuestions: len(quiz.Questions),
	}
	
	if err := s.db.Create(response).Error; err != nil {
		return nil, err
	}
	
	return response, nil
}

// GradeAnswers grades student answers against correct answers
func (s *QuizService) GradeAnswers(quiz *models.Quiz, answers []models.Answer) (models.AnswerList, int) {
	score := 0
	gradedAnswers := make([]models.Answer, 0, len(answers))
	
	// Create map of questions for quick lookup
	questionMap := make(map[int]models.Question)
	for _, q := range quiz.Questions {
		questionMap[q.ID] = q
	}
	
	// Grade each answer
	for _, answer := range answers {
		question, exists := questionMap[answer.QuestionID]
		if !exists {
			// Invalid question ID
			answer.IsCorrect = false
			gradedAnswers = append(gradedAnswers, answer)
			continue
		}
		
		isCorrect := false
		
		switch question.Type {
		case "multiple_choice":
			// Exact match for multiple choice (A, B, C, D)
			isCorrect = strings.TrimSpace(answer.Answer) == question.CorrectAnswer
			
		case "text_input":
			// Case-insensitive, trimmed match for text input
			studentAnswer := strings.TrimSpace(strings.ToLower(answer.Answer))
			correctAnswer := strings.TrimSpace(strings.ToLower(question.CorrectAnswer))
			isCorrect = studentAnswer == correctAnswer
		}
		
		if isCorrect {
			score++
		}
		
		answer.IsCorrect = isCorrect
		gradedAnswers = append(gradedAnswers, answer)
	}
	
	return gradedAnswers, score
}

// EndQuiz marks a quiz as completed
func (s *QuizService) EndQuiz(quizID uint, hostID uint) error {
	var quiz models.Quiz
	
	// Find quiz and verify ownership
	if err := s.db.First(&quiz, quizID).Error; err != nil {
		return err
	}
	
	if quiz.HostID != hostID {
		return errors.New("only the quiz creator can end it")
	}
	
	if quiz.Status != "in_progress" {
		return errors.New("only active quizzes can be ended")
	}
	
	// Update status
	now := time.Now()
	quiz.Status = "completed"
	quiz.EndedAt = &now
	
	return s.db.Save(&quiz).Error
}

// GetQuizResponses retrieves all responses for a quiz (host only)
func (s *QuizService) GetQuizResponses(quizID uint, hostID uint) ([]models.QuizResponse, error) {
	// Verify host ownership
	var quiz models.Quiz
	if err := s.db.First(&quiz, quizID).Error; err != nil {
		return nil, err
	}
	
	if quiz.HostID != hostID {
		return nil, errors.New("only the quiz creator can view responses")
	}
	
	var responses []models.QuizResponse
	if err := s.db.Where("quiz_id = ?", quizID).Order("score DESC, submitted_at ASC").Find(&responses).Error; err != nil {
		return nil, err
	}
	
	return responses, nil
}

// GetUserQuizHistory retrieves all quizzes for a session
func (s *QuizService) GetUserQuizHistory(sessionID uint, userID uint) ([]models.Quiz, error) {
	var quizzes []models.Quiz
	if err := s.db.Where("session_id = ? AND (host_id = ? OR status = ?)", sessionID, userID, "completed").
		Order("created_at DESC").Find(&quizzes).Error; err != nil {
		return nil, err
	}
	
	return quizzes, nil
}

// GetQuizzesBySession retrieves all quizzes for a session (by session ID string)
func (s *QuizService) GetQuizzesBySession(sessionID string) ([]models.Quiz, error) {
	// ✅ FIX: Query directly by session_id UUID string
	var quizzes []models.Quiz
	if err := s.db.Where("session_id = ?", sessionID).Order("created_at DESC").Find(&quizzes).Error; err != nil {
		return nil, err
	}
	
	return quizzes, nil
}

// GetQuizHistoryForSession returns quiz history for a student (active quizzes + completed submissions)
func (s *QuizService) GetQuizHistoryForSession(sessionID string, userID uint) (map[string]interface{}, error) {
	// ✅ FIX: Query directly by session_id UUID string, no need to lookup watch_sessions table
	// Get active/in-progress quizzes (only in_progress - students can take these)
	var activeQuizzes []models.Quiz
	if err := s.db.Where("session_id = ? AND status = ?", sessionID, "in_progress").
		Order("created_at DESC").Find(&activeQuizzes).Error; err != nil {
		return nil, err
	}
	
	// Remove correct answers from active quizzes (students shouldn't see them)
	for i := range activeQuizzes {
		for j := range activeQuizzes[i].Questions {
			activeQuizzes[i].Questions[j].CorrectAnswer = ""
		}
	}
	
	// Get user's completed submissions
	submissions, err := s.GetUserQuizSubmissions(sessionID, userID)
	if err != nil {
		submissions = []map[string]interface{}{} // Empty array if error
	}
	
	return map[string]interface{}{
		"active_quizzes":         activeQuizzes,
		"completed_submissions":  submissions,
	}, nil
}

// GetQuizProgress returns real-time progress for host
func (s *QuizService) GetQuizProgress(quizID uint, hostID uint) (map[string]interface{}, error) {
	// Verify host ownership
	var quiz models.Quiz
	if err := s.db.First(&quiz, quizID).Error; err != nil {
		return nil, err
	}
	
	if quiz.HostID != hostID {
		return nil, errors.New("only the quiz creator can view progress")
	}
	
	// Count total responses
	var responseCount int64
	s.db.Model(&models.QuizResponse{}).Where("quiz_id = ?", quizID).Count(&responseCount)
	
	// Calculate average score
	var avgScore float64
	s.db.Model(&models.QuizResponse{}).Where("quiz_id = ?", quizID).Select("AVG(score)").Scan(&avgScore)
	
	// Calculate time remaining
	var timeRemaining *int
	if quiz.TimerEnabled && quiz.TimerSeconds != nil && quiz.PublishedAt != nil {
		elapsed := int(time.Since(*quiz.PublishedAt).Seconds())
		remaining := *quiz.TimerSeconds - elapsed
		if remaining < 0 {
			remaining = 0
		}
		timeRemaining = &remaining
	}
	
	return map[string]interface{}{
		"quiz_id":          quizID,
		"submitted_count":  responseCount,
		"average_score":    avgScore,
		"time_remaining":   timeRemaining,
	}, nil
}

// DeleteQuiz soft deletes a quiz and its responses (host only)
func (s *QuizService) DeleteQuiz(quizID uint, hostID uint) error {
	var quiz models.Quiz
	
	// Find quiz and verify ownership
	if err := s.db.First(&quiz, quizID).Error; err != nil {
		return err
	}
	
	if quiz.HostID != hostID {
		return errors.New("only the quiz creator can delete it")
	}
	
	// Can only delete drafts
	if quiz.Status != "draft" {
		return errors.New("only draft quizzes can be deleted")
	}
	
	return s.db.Delete(&quiz).Error
}

// DeleteQuizzesBySession hard deletes all quizzes and responses for a session (automatic cleanup)
func (s *QuizService) DeleteQuizzesBySession(sessionID string) error {
	var quizzes []models.Quiz
	
	// Find all quizzes for this session
	if err := s.db.Where("session_id = ?", sessionID).Find(&quizzes).Error; err != nil {
		return err
	}
	
	if len(quizzes) == 0 {
		return nil // No quizzes to delete
	}
	
	// Delete responses first, then quizzes (foreign key constraint)
	for _, quiz := range quizzes {
		// Hard delete all responses for this quiz (Unscoped)
		if err := s.db.Unscoped().Where("quiz_id = ?", quiz.ID).Delete(&models.QuizResponse{}).Error; err != nil {
			return err
		}
		
		// Hard delete the quiz itself (Unscoped)
		if err := s.db.Unscoped().Delete(&quiz).Error; err != nil {
			return err
		}
	}
	
	return nil
}

// GetUserQuizSubmissions retrieves all quiz submissions for a user in a session
func (s *QuizService) GetUserQuizSubmissions(sessionID string, userID uint) ([]map[string]interface{}, error) {
	var responses []models.QuizResponse
	
	// Get all responses for this user in quizzes from this session
	if err := s.db.Joins("JOIN quizzes ON quizzes.id = quiz_responses.quiz_id").
		Where("quizzes.session_id = ? AND quiz_responses.user_id = ?", sessionID, userID).
		Find(&responses).Error; err != nil {
		return nil, err
	}
	
	// Build result with quiz details
	result := make([]map[string]interface{}, 0, len(responses))
	for _, response := range responses {
		// Get quiz details
		var quiz models.Quiz
		if err := s.db.First(&quiz, response.QuizID).Error; err != nil {
			continue
		}
		
		percentage := float64(response.Score) / float64(response.TotalQuestions) * 100
		
		result = append(result, map[string]interface{}{
			"quiz_id":         response.QuizID,
			"quiz_name":       quiz.Name,
			"score":           response.Score,
			"total_questions": response.TotalQuestions,
			"percentage":      percentage,
			"answers":         response.Answers,
			"submitted_at":    response.SubmittedAt,
			"status":          quiz.Status,
		})
	}
	
	return result, nil
}
