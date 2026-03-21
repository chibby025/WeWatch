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

// setupTicketTestDB creates test database with required tables
func setupTicketTestDB() *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		panic("failed to connect to test database: " + err.Error())
	}

	// Migrate all required models
	db.AutoMigrate(
		&models.User{},
		&models.UserWallet{},
		&models.WatchSession{},
		&models.SessionTicket{},
	)

	return db
}

func TestPurchaseTicketValidation(t *testing.T) {
	tests := []struct {
		name           string
		requestBody    map[string]interface{}
		expectedStatus int
		expectedError  string
	}{
		{
			name: "Missing payment method",
			requestBody: map[string]interface{}{
				"gift_to_user_id": nil,
			},
			expectedStatus: 400,
			expectedError:  "payment_method",
		},
		{
			name: "Invalid payment method",
			requestBody: map[string]interface{}{
				"payment_method": "bitcoin",
			},
			expectedStatus: 400,
			expectedError:  "payment_method",
		},
		{
			name: "Paystack without payment token",
			requestBody: map[string]interface{}{
				"payment_method": "paystack",
			},
			expectedStatus: 400,
			expectedError:  "Payment token required",
		},
		{
			name: "Stripe without payment token",
			requestBody: map[string]interface{}{
				"payment_method": "stripe",
			},
			expectedStatus: 400,
			expectedError:  "Payment token required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Setup test database
			db := setupTicketTestDB()

			// Create test session
			session := models.WatchSession{
				SessionTitle:          "Test Movie",
				HostID:                1,
				TicketPriceTokens:     500,
				TicketingEnabled:      true,
				IsActive:              true,
			}
			db.Create(&session)

			// Setup Gin
			gin.SetMode(gin.TestMode)
			router := gin.New()

			// Mock authentication middleware
			router.Use(func(c *gin.Context) {
				c.Set("user_id", uint(1))
				c.Next()
			})

			router.POST("/api/sessions/:id/tickets/purchase", PurchaseSessionTicketHandler(db))

			// Create request
			body, _ := json.Marshal(tt.requestBody)
			req := httptest.NewRequest("POST", "/api/sessions/1/tickets/purchase", bytes.NewBuffer(body))
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
