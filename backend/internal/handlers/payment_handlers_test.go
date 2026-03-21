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

// setupPaymentTestDB creates test database for payment tests
func setupPaymentTestDB() *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		panic("failed to connect to test database: " + err.Error())
	}

	// Migrate required models
	db.AutoMigrate(
		&models.User{},
		&models.UserWallet{},
		&models.TokenTransaction{},
	)

	return db
}

func TestPurchaseTokensValidation(t *testing.T) {
	tests := []struct {
		name           string
		requestBody    map[string]interface{}
		expectedStatus int
		expectedError  string
	}{
		{
			name: "Missing amount",
			requestBody: map[string]interface{}{
				"payment_method": "stripe",
				"payment_token":  "tok_visa",
				"currency":       "USD",
			},
			expectedStatus: 400,
			expectedError:  "amount",
		},
		{
			name: "Amount below minimum (less than 10)",
			requestBody: map[string]interface{}{
				"amount":         5,
				"payment_method": "stripe",
				"payment_token":  "tok_visa",
				"currency":       "USD",
			},
			expectedStatus: 400,
			expectedError:  "min",
		},
		{
			name: "Amount above maximum (more than 10000)",
			requestBody: map[string]interface{}{
				"amount":         15000,
				"payment_method": "stripe",
				"payment_token":  "tok_visa",
				"currency":       "USD",
			},
			expectedStatus: 400,
			expectedError:  "max",
		},
		{
			name: "Missing payment method",
			requestBody: map[string]interface{}{
				"amount":        100,
				"payment_token": "tok_visa",
				"currency":      "USD",
			},
			expectedStatus: 400,
			expectedError:  "payment_method",
		},
		{
			name: "Invalid payment method",
			requestBody: map[string]interface{}{
				"amount":         100,
				"payment_method": "bitcoin",
				"payment_token":  "tok_visa",
				"currency":       "USD",
			},
			expectedStatus: 400,
			expectedError:  "payment_method",
		},
		{
			name: "Missing payment token",
			requestBody: map[string]interface{}{
				"amount":         100,
				"payment_method": "stripe",
				"currency":       "USD",
			},
			expectedStatus: 400,
			expectedError:  "payment_token",
		},
		{
			name: "Missing currency",
			requestBody: map[string]interface{}{
				"amount":         100,
				"payment_method": "stripe",
				"payment_token":  "tok_visa",
			},
			expectedStatus: 400,
			expectedError:  "currency",
		},
		{
			name: "Invalid currency",
			requestBody: map[string]interface{}{
				"amount":         100,
				"payment_method": "stripe",
				"payment_token":  "tok_visa",
				"currency":       "EUR",
			},
			expectedStatus: 400,
			expectedError:  "currency",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup test database
			db := setupPaymentTestDB()

			// Create test user
			user := models.User{
				Username: "testuser",
				Email:    "test@example.com",
			}
			db.Create(&user)

			// Setup Gin
			gin.SetMode(gin.TestMode)
			router := gin.New()

			// Mock authentication middleware
			router.Use(func(c *gin.Context) {
				c.Set("user", &user)
				c.Next()
			})

			router.POST("/api/tokens/purchase", PurchaseTokensHandler(db))

			// Create request
			body, _ := json.Marshal(tt.requestBody)
			req := httptest.NewRequest("POST", "/api/tokens/purchase", bytes.NewBuffer(body))
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

func TestGetUserWalletHandler(t *testing.T) {
	tests := []struct {
		name           string
		userID         string
		authUserID     uint
		expectedStatus int
	}{
		{
			name:           "Invalid user ID format",
			userID:         "abc",
			authUserID:     1,
			expectedStatus: 400,
		},
		{
			name:           "Access other user's wallet (forbidden)",
			userID:         "2",
			authUserID:     1,
			expectedStatus: 403,
		},
		{
			name:           "Valid request (own wallet)",
			userID:         "1",
			authUserID:     1,
			expectedStatus: 200,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup test database
			db := setupPaymentTestDB()

			// Create test user
			user := models.User{
				Username: "testuser",
				Email:    "test@example.com",
			}
			db.Create(&user)

			// Setup Gin
			gin.SetMode(gin.TestMode)
			router := gin.New()

			// Mock authentication middleware with specified user ID
			router.Use(func(c *gin.Context) {
				mockUser := &models.User{}
				mockUser.ID = tt.authUserID
				c.Set("user", mockUser)
				c.Next()
			})

			router.GET("/api/wallet/:userId", GetUserWalletHandler(db))

			// Create request
			req := httptest.NewRequest("GET", "/api/wallet/"+tt.userID, nil)

			// Record response
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// Assertions
			assert.Equal(t, tt.expectedStatus, w.Code)
		})
	}
}
