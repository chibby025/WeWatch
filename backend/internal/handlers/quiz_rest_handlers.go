// WeWatch/backend/internal/handlers/quiz_rest_handlers.go
package handlers

import (
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/services"
)

// GetSessionQuizzes returns all quizzes for a session (host view)
// GET /api/quizzes/session/:session_id
func GetSessionQuizzes(c *gin.Context) {
	sessionIDStr := c.Param("session_id")
	
	// Extract user ID from context (set by AuthMiddleware)
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	
	log.Printf("[GetSessionQuizzes] Fetching quizzes for session: %s, user: %v", sessionIDStr, userID)
	
	quizService := services.NewQuizService(DB)
	
	// Get all quizzes for this session
	quizzes, err := quizService.GetQuizzesBySession(sessionIDStr)
	if err != nil {
		log.Printf("[GetSessionQuizzes] Error fetching quizzes: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch quizzes"})
		return
	}
	
	log.Printf("[GetSessionQuizzes] Found %d quizzes", len(quizzes))
	c.JSON(http.StatusOK, quizzes)
}

// GetQuizHistory returns quiz history for a student (active quizzes + completed submissions)
// GET /api/quizzes/session/:session_id/history
func GetQuizHistory(c *gin.Context) {
	sessionIDStr := c.Param("session_id")
	
	// Extract user ID from context (set by AuthMiddleware)
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	
	userID := userIDInterface.(uint)
	log.Printf("[GetQuizHistory] Fetching quiz history for session: %s, user: %d", sessionIDStr, userID)
	
	quizService := services.NewQuizService(DB)
	
	// Get quiz history (active quizzes + user's submissions)
	history, err := quizService.GetQuizHistoryForSession(sessionIDStr, userID)
	if err != nil {
		log.Printf("[GetQuizHistory] Error fetching quiz history: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch quiz history"})
		return
	}
	
	// ✅ FIX: Correct type assertions for logging
	activeQuizzes, _ := history["active_quizzes"].([]models.Quiz)
	completedSubmissions, _ := history["completed_submissions"].([]map[string]interface{})
	log.Printf("[GetQuizHistory] Found %d active quizzes, %d completed submissions", 
		len(activeQuizzes), 
		len(completedSubmissions))
	c.JSON(http.StatusOK, history)
}

// GetQuizProgress returns real-time progress for a quiz (host only)
// GET /api/quizzes/:quiz_id/progress
func GetQuizProgressREST(c *gin.Context) {
	quizIDStr := c.Param("quiz_id")
	quizID, err := strconv.ParseUint(quizIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid quiz ID"})
		return
	}
	
	// Extract user ID from context (set by AuthMiddleware)
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	
	userID := userIDInterface.(uint)
	log.Printf("[GetQuizProgress] Fetching progress for quiz: %d, user: %d", quizID, userID)
	
	quizService := services.NewQuizService(DB)
	
	// Get quiz progress
	progress, err := quizService.GetQuizProgress(uint(quizID), userID)
	if err != nil {
		log.Printf("[GetQuizProgress] Error fetching progress: %v", err)
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	
	log.Printf("[GetQuizProgress] Progress fetched successfully")
	c.JSON(http.StatusOK, progress)
}
