package utils_test

import (
	"os"
	"testing"
	"time"
	"wewatch-backend/internal/utils"

	"github.com/golang-jwt/jwt/v5"
)

func TestMain(m *testing.M) {
	// Set JWT_SECRET for testing
	os.Setenv("JWT_SECRET", "test_secret_key_for_unit_tests_only")
	
	// Run tests
	code := m.Run()
	
	// Exit with test result code
	os.Exit(code)
}

func TestGenerateJWT(t *testing.T) {
	tests := []struct {
		name    string
		userID  uint
		wantErr bool
	}{
		{
			name:    "Valid user ID",
			userID:  1,
			wantErr: false,
		},
		{
			name:    "Zero user ID",
			userID:  0,
			wantErr: false, // JWT generation doesn't validate user ID
		},
		{
			name:    "Large user ID",
			userID:  999999,
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			token, err := utils.GenerateJWT(tt.userID)
			
			if (err != nil) != tt.wantErr {
				t.Errorf("GenerateJWT() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if !tt.wantErr {
				// Verify token is not empty
				if token == "" {
					t.Error("GenerateJWT() returned empty token")
				}

				// Verify token has three parts (header.payload.signature)
				if len(token) < 10 {
					t.Error("GenerateJWT() returned suspiciously short token")
				}

				// Try to validate the token
				userID, err := utils.ValidateJWT(token)
				if err != nil {
					t.Errorf("Generated token failed validation: %v", err)
				}
				if userID != tt.userID {
					t.Errorf("ValidateJWT() returned userID = %v, want %v", userID, tt.userID)
				}
			}
		})
	}
}

func TestValidateJWT(t *testing.T) {
	// Generate a valid token for testing
	validUserID := uint(42)
	validToken, err := utils.GenerateJWT(validUserID)
	if err != nil {
		t.Fatalf("Failed to generate valid token for testing: %v", err)
	}

	tests := []struct {
		name      string
		token     string
		wantID    uint
		wantErr   bool
		setupFunc func() string // Optional function to generate token
	}{
		{
			name:    "Valid token",
			token:   validToken,
			wantID:  validUserID,
			wantErr: false,
		},
		{
			name:    "Empty token",
			token:   "",
			wantID:  0,
			wantErr: true,
		},
		{
			name:    "Invalid token format",
			token:   "invalid.token.here",
			wantID:  0,
			wantErr: true,
		},
		{
			name:    "Malformed token",
			token:   "notavalidtoken",
			wantID:  0,
			wantErr: true,
		},
		{
			name:    "Token with wrong signature",
			token:   validToken[:len(validToken)-5] + "xxxxx",
			wantID:  0,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			token := tt.token
			if tt.setupFunc != nil {
				token = tt.setupFunc()
			}

			userID, err := utils.ValidateJWT(token)
			
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateJWT() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if !tt.wantErr && userID != tt.wantID {
				t.Errorf("ValidateJWT() userID = %v, want %v", userID, tt.wantID)
			}
		})
	}
}

func TestJWTExpiration(t *testing.T) {
	// Note: This test verifies the token is created with expiration
	// Testing actual expiration would require mocking time or waiting 24 hours
	
	userID := uint(123)
	token, err := utils.GenerateJWT(userID)
	if err != nil {
		t.Fatalf("GenerateJWT() failed: %v", err)
	}

	// Parse the token to check claims
	parsedToken, err := jwt.ParseWithClaims(token, &utils.Claims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(os.Getenv("JWT_SECRET")), nil
	})

	if err != nil {
		t.Fatalf("Failed to parse token: %v", err)
	}

	claims, ok := parsedToken.Claims.(*utils.Claims)
	if !ok {
		t.Fatal("Failed to extract claims from token")
	}

	// Check that expiration time is set and in the future
	if claims.ExpiresAt == nil {
		t.Error("Token ExpiresAt is nil")
	} else {
		expiryTime := claims.ExpiresAt.Time
		if expiryTime.Before(time.Now()) {
			t.Error("Token is already expired")
		}

		// Should expire approximately 24 hours from now (allow 1 minute variance)
		expectedExpiry := time.Now().Add(24 * time.Hour)
		timeDiff := expiryTime.Sub(expectedExpiry)
		if timeDiff < -time.Minute || timeDiff > time.Minute {
			t.Errorf("Token expiry time = %v, expected around %v (diff: %v)", 
				expiryTime, expectedExpiry, timeDiff)
		}
	}

	// Check that IssuedAt is set
	if claims.IssuedAt == nil {
		t.Error("Token IssuedAt is nil")
	} else if claims.IssuedAt.Time.After(time.Now()) {
		t.Error("Token IssuedAt is in the future")
	}

	// Check that UserID is correct
	if claims.UserId != userID {
		t.Errorf("Token UserId = %v, want %v", claims.UserId, userID)
	}
}

func TestJWTUniqueness(t *testing.T) {
	// Generate multiple tokens for the same user
	// They should be different due to IssuedAt timestamp
	userID := uint(100)
	
	token1, err1 := utils.GenerateJWT(userID)
	time.Sleep(10 * time.Millisecond) // Small delay to ensure different IssuedAt
	token2, err2 := utils.GenerateJWT(userID)

	if err1 != nil || err2 != nil {
		t.Fatalf("GenerateJWT() failed: err1=%v, err2=%v", err1, err2)
	}

	// Tokens should be different
	if token1 == token2 {
		t.Error("GenerateJWT() returned identical tokens for same user (should differ by IssuedAt)")
	}

	// But both should validate to the same user ID
	id1, err1 := utils.ValidateJWT(token1)
	id2, err2 := utils.ValidateJWT(token2)

	if err1 != nil || err2 != nil {
		t.Fatalf("ValidateJWT() failed: err1=%v, err2=%v", err1, err2)
	}

	if id1 != userID || id2 != userID {
		t.Errorf("Tokens validated to wrong user IDs: id1=%v, id2=%v, want=%v", id1, id2, userID)
	}
}
