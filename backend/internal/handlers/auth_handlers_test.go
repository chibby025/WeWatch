package handlers

import (
    "bytes"
    "encoding/json"
    "net/http/httptest"
    "testing"
    "github.com/gin-gonic/gin"
    "github.com/stretchr/testify/assert"
    "gorm.io/driver/sqlite"
    "gorm.io/gorm"
    "wewatch-backend/internal/models"
)

// setupTestDB creates an in-memory SQLite database for testing
func setupTestDB() *gorm.DB {
    db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
    if err != nil {
        panic("failed to connect to test database: " + err.Error())
    }
    
    // Auto-migrate all models
    db.AutoMigrate(&models.User{}, &models.UserWallet{})
    
    return db
}

func TestRegisterUser(t *testing.T) {
    // Set up test cases (table-driven testing)
    tests := []struct {
        name           string
        requestBody    map[string]interface{}
        expectedStatus int
        expectedError  string
    }{
        {
            name: "Valid registration",
            requestBody: map[string]interface{}{
                "email":    "test@example.com",
                "password": "SecurePass123!",
                "username": "testuser",
            },
            expectedStatus: 201,
            expectedError:  "",
        },
        {
            name: "Missing email",
            requestBody: map[string]interface{}{
                "password": "SecurePass123!",
                "username": "testuser",
            },
            expectedStatus: 400,
            expectedError:  "Email",
        },
        {
            name: "Weak password",
            requestBody: map[string]interface{}{
                "email":    "test@example.com",
                "password": "123",
                "username": "testuser",
            },
            expectedStatus: 400,
            expectedError:  "Password",
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // Setup test database
            DB = setupTestDB()
            
            // Setup Gin
            gin.SetMode(gin.TestMode)
            router := gin.New()
            router.POST("/register", RegisterHandler)

            // Create request
            body, _ := json.Marshal(tt.requestBody)
            req := httptest.NewRequest("POST", "/register", bytes.NewBuffer(body))
            req.Header.Set("Content-Type", "application/json")
            
            // Record response
            w := httptest.NewRecorder()
            router.ServeHTTP(w, req)

            // Assertions
            assert.Equal(t, tt.expectedStatus, w.Code)
            
            if tt.expectedError != "" {
                var response map[string]interface{}
                json.Unmarshal(w.Body.Bytes(), &response)
                assert.Contains(t, response["error"], tt.expectedError)
            }
        })
    }
}

func TestLoginUser(t *testing.T) {
    // Similar structure for login tests
    t.Run("Valid login", func(t *testing.T) {
        // Test code...
    })
    
    t.Run("Invalid credentials", func(t *testing.T) {
        // Test code...
    })
}