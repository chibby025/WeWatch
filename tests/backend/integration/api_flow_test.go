package integration_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"wewatch-backend/internal/handlers"
	"wewatch-backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var testDB *gorm.DB

// TestMain sets up the test database
func TestMain(m *testing.M) {
	// Set test environment
	os.Setenv("JWT_SECRET", "test_secret_for_integration_tests")
	
	// Setup test database (use a separate test database)
	// For now, we'll skip actual DB setup and focus on the test structure
	// In production, you'd use docker-compose for test DB
	
	code := m.Run()
	os.Exit(code)
}

// setupTestDB creates a test database connection
// NOTE: This requires a running PostgreSQL instance
// You can use Docker: docker run -d -p 5433:5432 -e POSTGRES_PASSWORD=testpass postgres
func setupTestDB() *gorm.DB {
	// Check if test DB is available
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		// Default test database connection
		dsn = "host=localhost user=postgres password=testpass dbname=wewatch_test port=5433 sslmode=disable"
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	
	if err != nil {
		// Skip integration tests if DB not available
		return nil
	}

	// Auto-migrate test schema
	db.AutoMigrate(
		&models.User{},
		&models.UserWallet{},
		&models.Room{},
		&models.WatchSession{},
	)

	return db
}

// cleanupTestDB removes all test data
func cleanupTestDB(db *gorm.DB) {
	if db == nil {
		return
	}
	
	db.Exec("TRUNCATE users, user_wallets, rooms, watch_sessions CASCADE")
}

func setupRouter(db *gorm.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.Default()
	handlers.DB = db
	
	// Auth routes
	router.POST("/api/auth/register", handlers.RegisterHandler)
	router.POST("/api/auth/login", handlers.LoginHandler)
	
	// Protected routes (would need auth middleware)
	// router.POST("/api/rooms", middleware.AuthMiddleware(), handlers.CreateRoom)
	
	return router
}

func TestUserRegistrationAndLoginFlow(t *testing.T) {
	db := setupTestDB()
	if db == nil {
		t.Skip("Test database not available - skipping integration test")
	}
	defer cleanupTestDB(db)

	router := setupRouter(db)

	// Step 1: Register a new user
	t.Run("Register new user", func(t *testing.T) {
		payload := map[string]string{
			"username": "integrationtest",
			"email":    "integration@test.com",
			"password": "testpass123",
		}
		jsonPayload, _ := json.Marshal(payload)

		req, _ := http.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBuffer(jsonPayload))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("Registration failed: status=%d, body=%s", w.Code, w.Body.String())
		}

		var response map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &response)

		if _, exists := response["user"]; !exists {
			t.Error("Response should contain user data")
		}
	})

	// Step 2: Verify user exists in database
	t.Run("Verify user in database", func(t *testing.T) {
		var user models.User
		err := db.Where("email = ?", "integration@test.com").First(&user).Error
		if err != nil {
			t.Fatalf("User not found in database: %v", err)
		}

		if user.Username != "integrationtest" {
			t.Errorf("Username = %s, want 'integrationtest'", user.Username)
		}
	})

	// Step 3: Verify wallet was created
	t.Run("Verify wallet creation", func(t *testing.T) {
		var user models.User
		db.Where("email = ?", "integration@test.com").First(&user)

		var wallet models.UserWallet
		err := db.Where("user_id = ?", user.ID).First(&wallet).Error
		if err != nil {
			t.Fatalf("Wallet not found: %v", err)
		}

		if wallet.TokenBalance != 0 {
			t.Errorf("Initial balance should be 0, got %d", wallet.TokenBalance)
		}
	})

	// Step 4: Login with credentials
	t.Run("Login with valid credentials", func(t *testing.T) {
		payload := map[string]string{
			"email":    "integration@test.com",
			"password": "testpass123",
		}
		jsonPayload, _ := json.Marshal(payload)

		req, _ := http.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(jsonPayload))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Login failed: status=%d, body=%s", w.Code, w.Body.String())
		}

		var response map[string]interface{}
		json.Unmarshal(w.Body.Bytes(), &response)

		if _, exists := response["token"]; !exists {
			t.Error("Response should contain JWT token")
		}

		if _, exists := response["user"]; !exists {
			t.Error("Response should contain user data")
		}
	})

	// Step 5: Try to register duplicate user
	t.Run("Reject duplicate registration", func(t *testing.T) {
		payload := map[string]string{
			"username": "integrationtest",
			"email":    "integration@test.com",
			"password": "testpass123",
		}
		jsonPayload, _ := json.Marshal(payload)

		req, _ := http.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBuffer(jsonPayload))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusConflict {
			t.Errorf("Expected status 409 for duplicate user, got %d", w.Code)
		}
	})

	// Step 6: Login with wrong password
	t.Run("Reject invalid password", func(t *testing.T) {
		payload := map[string]string{
			"email":    "integration@test.com",
			"password": "wrongpassword",
		}
		jsonPayload, _ := json.Marshal(payload)

		req, _ := http.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBuffer(jsonPayload))
		req.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("Expected status 401 for wrong password, got %d", w.Code)
		}
	})
}

func TestMultipleUsersScenario(t *testing.T) {
	db := setupTestDB()
	if db == nil {
		t.Skip("Test database not available - skipping integration test")
	}
	defer cleanupTestDB(db)

	router := setupRouter(db)

	// Register multiple users
	users := []struct {
		username string
		email    string
		password string
	}{
		{"user1", "user1@test.com", "pass123"},
		{"user2", "user2@test.com", "pass456"},
		{"user3", "user3@test.com", "pass789"},
	}

	for i, user := range users {
		t.Run(fmt.Sprintf("Register user %d", i+1), func(t *testing.T) {
			payload := map[string]string{
				"username": user.username,
				"email":    user.email,
				"password": user.password,
			}
			jsonPayload, _ := json.Marshal(payload)

			req, _ := http.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewBuffer(jsonPayload))
			req.Header.Set("Content-Type", "application/json")

			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			if w.Code != http.StatusCreated {
				t.Errorf("User %d registration failed: %d", i+1, w.Code)
			}
		})
	}

	// Verify all users and wallets exist
	t.Run("Verify all users created", func(t *testing.T) {
		var count int64
		db.Model(&models.User{}).Count(&count)
		
		if count != 3 {
			t.Errorf("Expected 3 users, found %d", count)
		}
	})

	t.Run("Verify all wallets created", func(t *testing.T) {
		var count int64
		db.Model(&models.UserWallet{}).Count(&count)
		
		if count != 3 {
			t.Errorf("Expected 3 wallets, found %d", count)
		}
	})
}

// Example: Test wallet operations (if you have wallet handlers)
func TestWalletOperationsFlow(t *testing.T) {
	db := setupTestDB()
	if db == nil {
		t.Skip("Test database not available - skipping integration test")
	}
	defer cleanupTestDB(db)

	// Create test user
	user := models.User{
		Username:     "wallettest",
		Email:        "wallet@test.com",
		PasswordHash: "hashed",
	}
	db.Create(&user)

	// Create wallet
	wallet := models.UserWallet{
		UserID:       user.ID,
		TokenBalance: 1000,
	}
	db.Create(&wallet)

	t.Run("Add tokens to wallet", func(t *testing.T) {
		var w models.UserWallet
		db.First(&w, wallet.ID)

		w.AddTokens(500)
		db.Save(&w)

		// Reload from DB
		db.First(&w, wallet.ID)
		
		if w.TokenBalance != 1500 {
			t.Errorf("Expected balance 1500, got %d", w.TokenBalance)
		}
		if w.LifetimeEarned != 500 {
			t.Errorf("Expected lifetime earned 500, got %d", w.LifetimeEarned)
		}
	})

	t.Run("Deduct tokens from wallet", func(t *testing.T) {
		var w models.UserWallet
		db.First(&w, wallet.ID)

		err := w.DeductTokens(300)
		if err != nil {
			t.Fatalf("DeductTokens failed: %v", err)
		}
		db.Save(&w)

		// Reload from DB
		db.First(&w, wallet.ID)
		
		if w.TokenBalance != 1200 {
			t.Errorf("Expected balance 1200, got %d", w.TokenBalance)
		}
		if w.LifetimeSpent != 300 {
			t.Errorf("Expected lifetime spent 300, got %d", w.LifetimeSpent)
		}
	})

	t.Run("Cannot deduct more than balance", func(t *testing.T) {
		var w models.UserWallet
		db.First(&w, wallet.ID)

		err := w.DeductTokens(2000)
		if err != models.ErrInsufficientBalance {
			t.Error("Should return ErrInsufficientBalance")
		}

		// Balance should remain unchanged
		db.First(&w, wallet.ID)
		if w.TokenBalance != 1200 {
			t.Errorf("Balance should remain 1200, got %d", w.TokenBalance)
		}
	})
}
