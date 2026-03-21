package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"wewatch-backend/internal/handlers"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"

	"github.com/gin-gonic/gin"
	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func setupTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	return gin.Default()
}

func setupMockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	// Create mock database
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("Failed to create mock DB: %v", err)
	}

	// Create GORM DB with mock
	gormDB, err := gorm.Open(postgres.New(postgres.Config{
		Conn: db,
	}), &gorm.Config{})
	
	if err != nil {
		t.Fatalf("Failed to open GORM DB: %v", err)
	}

	return gormDB, mock
}

func TestRegisterHandler_Success(t *testing.T) {
	// Setup
	router := setupTestRouter()
	db, mock := setupMockDB(t)
	handlers.DB = db

	// Mock expectations
	mock.ExpectQuery(`SELECT \* FROM "users"`).
		WithArgs("test@example.com", "testuser").
		WillReturnError(gorm.ErrRecordNotFound) // User doesn't exist

	mock.ExpectBegin()
	mock.ExpectQuery(`INSERT INTO "users"`).
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), "testuser", "test@example.com", sqlmock.AnyArg(), "/avatars/default.png", "", "user", sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))
	mock.ExpectCommit()

	// Mock wallet creation
	mock.ExpectBegin()
	mock.ExpectQuery(`INSERT INTO "user_wallets"`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))
	mock.ExpectCommit()

	// Setup request
	router.POST("/api/auth/register", handlers.RegisterHandler)
	
	payload := map[string]string{
		"username": "testuser",
		"email":    "test@example.com",
		"password": "password123",
	}
	jsonPayload, _ := json.Marshal(payload)
	
	req, _ := http.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBuffer(jsonPayload))
	req.Header.Set("Content-Type", "application/json")
	
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assertions
	if w.Code != http.StatusCreated {
		t.Errorf("Expected status 201, got %d. Body: %s", w.Code, w.Body.String())
	}

	// Verify mock expectations
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("Unfulfilled expectations: %v", err)
	}
}

func TestRegisterHandler_DuplicateUser(t *testing.T) {
	router := setupTestRouter()
	db, mock := setupMockDB(t)
	handlers.DB = db

	// Mock: User already exists
	existingUser := sqlmock.NewRows([]string{"id", "username", "email"}).
		AddRow(1, "testuser", "test@example.com")
	
	mock.ExpectQuery(`SELECT \* FROM "users"`).
		WithArgs("test@example.com", "testuser").
		WillReturnRows(existingUser)

	router.POST("/api/auth/register", handlers.RegisterHandler)
	
	payload := map[string]string{
		"username": "testuser",
		"email":    "test@example.com",
		"password": "password123",
	}
	jsonPayload, _ := json.Marshal(payload)
	
	req, _ := http.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBuffer(jsonPayload))
	req.Header.Set("Content-Type", "application/json")
	
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Should return 409 Conflict
	if w.Code != http.StatusConflict {
		t.Errorf("Expected status 409, got %d", w.Code)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("Unfulfilled expectations: %v", err)
	}
}

func TestRegisterHandler_InvalidInput(t *testing.T) {
	router := setupTestRouter()
	router.POST("/api/auth/register", handlers.RegisterHandler)

	tests := []struct {
		name    string
		payload map[string]interface{}
		wantStatus int
	}{
		{
			name: "Missing username",
			payload: map[string]interface{}{
				"email":    "test@example.com",
				"password": "password123",
			},
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "Missing email",
			payload: map[string]interface{}{
				"username": "testuser",
				"password": "password123",
			},
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "Missing password",
			payload: map[string]interface{}{
				"username": "testuser",
				"email":    "test@example.com",
			},
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "Invalid email format",
			payload: map[string]interface{}{
				"username": "testuser",
				"email":    "invalid-email",
				"password": "password123",
			},
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "Password too short",
			payload: map[string]interface{}{
				"username": "testuser",
				"email":    "test@example.com",
				"password": "12345",
			},
			wantStatus: http.StatusBadRequest,
		},
		{
			name: "Username too short",
			payload: map[string]interface{}{
				"username": "ab",
				"email":    "test@example.com",
				"password": "password123",
			},
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			jsonPayload, _ := json.Marshal(tt.payload)
			req, _ := http.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBuffer(jsonPayload))
			req.Header.Set("Content-Type", "application/json")
			
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("%s: Expected status %d, got %d", tt.name, tt.wantStatus, w.Code)
			}
		})
	}
}

func TestLoginHandler_Success(t *testing.T) {
	// Set JWT secret for testing
	os.Setenv("JWT_SECRET", "test_secret_for_login")

	router := setupTestRouter()
	db, mock := setupMockDB(t)
	handlers.DB = db

	// Hash a password for testing
	hashedPassword, _ := utils.HashPassword("password123")

	// Mock: Find user by email
	userRow := sqlmock.NewRows([]string{"id", "username", "email", "password_hash", "role"}).
		AddRow(1, "testuser", "test@example.com", hashedPassword, "user")
	
	mock.ExpectQuery(`SELECT \* FROM "users"`).
		WithArgs("test@example.com").
		WillReturnRows(userRow)

	router.POST("/api/auth/login", handlers.LoginHandler)
	
	payload := map[string]string{
		"email":    "test@example.com",
		"password": "password123",
	}
	jsonPayload, _ := json.Marshal(payload)
	
	req, _ := http.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(jsonPayload))
	req.Header.Set("Content-Type", "application/json")
	
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Should return 200 OK
	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	// Check response contains token
	var response map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &response)
	
	if _, exists := response["token"]; !exists {
		t.Error("Response should contain 'token' field")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("Unfulfilled expectations: %v", err)
	}
}

func TestLoginHandler_InvalidCredentials(t *testing.T) {
	router := setupTestRouter()
	db, mock := setupMockDB(t)
	handlers.DB = db

	// Hash a different password
	hashedPassword, _ := utils.HashPassword("correctpassword")

	// Mock: Find user by email
	userRow := sqlmock.NewRows([]string{"id", "username", "email", "password_hash", "role"}).
		AddRow(1, "testuser", "test@example.com", hashedPassword, "user")
	
	mock.ExpectQuery(`SELECT \* FROM "users"`).
		WithArgs("test@example.com").
		WillReturnRows(userRow)

	router.POST("/api/auth/login", handlers.LoginHandler)
	
	payload := map[string]string{
		"email":    "test@example.com",
		"password": "wrongpassword", // Wrong password
	}
	jsonPayload, _ := json.Marshal(payload)
	
	req, _ := http.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(jsonPayload))
	req.Header.Set("Content-Type", "application/json")
	
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Should return 401 Unauthorized
	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401, got %d", w.Code)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("Unfulfilled expectations: %v", err)
	}
}

func TestLoginHandler_UserNotFound(t *testing.T) {
	router := setupTestRouter()
	db, mock := setupMockDB(t)
	handlers.DB = db

	// Mock: User not found
	mock.ExpectQuery(`SELECT \* FROM "users"`).
		WithArgs("nonexistent@example.com").
		WillReturnError(gorm.ErrRecordNotFound)

	router.POST("/api/auth/login", handlers.LoginHandler)
	
	payload := map[string]string{
		"email":    "nonexistent@example.com",
		"password": "password123",
	}
	jsonPayload, _ := json.Marshal(payload)
	
	req, _ := http.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(jsonPayload))
	req.Header.Set("Content-Type", "application/json")
	
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Should return 401 Unauthorized
	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401, got %d", w.Code)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("Unfulfilled expectations: %v", err)
	}
}
