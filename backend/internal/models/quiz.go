// WeWatch/backend/internal/models/quiz.go
package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"time"
)

// Quiz represents a quiz created by a host in a lecture hall session
type Quiz struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	RoomID      uint           `gorm:"not null;index:idx_room_session" json:"room_id"`
	SessionID   string         `gorm:"type:varchar(36);not null;index:idx_room_session" json:"session_id"` // ✅ FIX: session_id is UUID string
	HostID      uint           `gorm:"not null;index:idx_host" json:"host_id"`
	Name        string         `gorm:"type:varchar(255);not null" json:"name"`
	Status      string         `gorm:"type:varchar(50);default:'draft';index:idx_status" json:"status"` // draft, in_progress, completed
	TimerEnabled bool          `gorm:"default:false" json:"timer_enabled"`
	TimerSeconds *int          `gorm:"default:null" json:"timer_seconds,omitempty"`
	Questions   QuestionList   `gorm:"type:jsonb;not null" json:"questions"`
	CreatedAt   time.Time      `json:"created_at"`
	PublishedAt *time.Time     `json:"published_at,omitempty"`
	EndedAt     *time.Time     `json:"ended_at,omitempty"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// QuizResponse represents a student's answer submission for a quiz
type QuizResponse struct {
	ID             uint         `gorm:"primaryKey" json:"id"`
	QuizID         uint         `gorm:"not null;index:idx_quiz;uniqueIndex:uq_quiz_user" json:"quiz_id"`
	UserID         uint         `gorm:"not null;index:idx_user;uniqueIndex:uq_quiz_user" json:"user_id"`
	Answers        AnswerList   `gorm:"type:jsonb;not null" json:"answers"`
	Score          int          `gorm:"not null" json:"score"`
	TotalQuestions int          `gorm:"not null" json:"total_questions"`
	SubmittedAt    time.Time    `gorm:"default:now()" json:"submitted_at"`
}

// Question represents a single quiz question
type Question struct {
	ID            int      `json:"id"`
	Type          string   `json:"type"` // "multiple_choice", "text_input"
	Question      string   `json:"question"`
	Options       []string `json:"options,omitempty"`        // For multiple choice
	CorrectAnswer string   `json:"correct_answer"`           // "A", "B", "C", "D" for MC, text for text_input
}

// Answer represents a student's answer to a question
type Answer struct {
	QuestionID int    `json:"question_id"`
	Answer     string `json:"answer"`
	IsCorrect  bool   `json:"is_correct"`
	TimeTaken  *int   `json:"time_taken,omitempty"` // Seconds taken to answer
}

// QuestionList is a custom type for JSONB array of questions
type QuestionList []Question

// Value implements driver.Valuer for database storage
func (ql QuestionList) Value() (driver.Value, error) {
	return json.Marshal(ql)
}

// Scan implements sql.Scanner for database retrieval
func (ql *QuestionList) Scan(value interface{}) error {
	if value == nil {
		*ql = QuestionList{}
		return nil
	}
	
	bytes, ok := value.([]byte)
	if !ok {
		return errors.New("failed to unmarshal QuestionList value")
	}
	
	return json.Unmarshal(bytes, ql)
}

// AnswerList is a custom type for JSONB array of answers
type AnswerList []Answer

// Value implements driver.Valuer for database storage
func (al AnswerList) Value() (driver.Value, error) {
	return json.Marshal(al)
}

// Scan implements sql.Scanner for database retrieval
func (al *AnswerList) Scan(value interface{}) error {
	if value == nil {
		*al = AnswerList{}
		return nil
	}
	
	bytes, ok := value.([]byte)
	if !ok {
		return errors.New("failed to unmarshal AnswerList value")
	}
	
	return json.Unmarshal(bytes, al)
}

// TableName specifies the table name for Quiz
func (Quiz) TableName() string {
	return "quizzes"
}

// TableName specifies the table name for QuizResponse
func (QuizResponse) TableName() string {
	return "quiz_responses"
}

// BeforeCreate validation hook
func (q *Quiz) BeforeCreate(tx *gorm.DB) error {
	// Validate status
	if q.Status != "draft" && q.Status != "in_progress" && q.Status != "completed" {
		q.Status = "draft"
	}
	
	// Validate questions exist
	if len(q.Questions) == 0 {
		return errors.New("quiz must have at least one question")
	}
	
	// Validate timer
	if q.TimerEnabled && (q.TimerSeconds == nil || *q.TimerSeconds <= 0) {
		return errors.New("timer_seconds must be positive when timer is enabled")
	}
	
	return nil
}

// ValidateQuestions checks if all questions have required fields
func (q *Quiz) ValidateQuestions() error {
	for i, question := range q.Questions {
		if question.Question == "" {
			return errors.New("question text cannot be empty")
		}
		
		if question.CorrectAnswer == "" {
			return errors.New("correct answer must be specified")
		}
		
		if question.Type == "multiple_choice" {
			if len(question.Options) < 2 {
				return errors.New("multiple choice questions must have at least 2 options")
			}
			// Validate correct answer is A, B, C, or D
			if question.CorrectAnswer != "A" && question.CorrectAnswer != "B" && 
			   question.CorrectAnswer != "C" && question.CorrectAnswer != "D" {
				return errors.New("multiple choice correct answer must be A, B, C, or D")
			}
			// Ensure enough options for the correct answer
			optionIndex := int(question.CorrectAnswer[0] - 'A')
			if optionIndex >= len(question.Options) {
				return errors.New("correct answer references non-existent option")
			}
		}
		
		// Assign ID if not set
		if question.ID == 0 {
			q.Questions[i].ID = i + 1
		}
	}
	
	return nil
}
