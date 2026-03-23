package utils

import (
    "testing"
)

func TestGenerateJWT(t *testing.T) {
    tests := []struct {
        name    string
        userID  uint
        wantErr bool
    }{
        {"Valid user ID", 1, false},
        {"Zero user ID", 0, false},
        {"Large user ID", 999999, false},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            token, err := GenerateJWT(tt.userID)
            
            if (err != nil) != tt.wantErr {
                t.Errorf("GenerateJWT() error = %v, wantErr %v", err, tt.wantErr)
                return
            }

            if !tt.wantErr {
                if token == "" {
                    t.Error("GenerateJWT() returned empty token")
                }
                if len(token) < 10 {
                    t.Error("GenerateJWT() returned suspiciously short token")
                }
                userID, err := ValidateJWT(token)
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
    validUserID := uint(42)
    validToken, err := GenerateJWT(validUserID)
    if err != nil {
        t.Fatalf("Failed to generate valid token for testing: %v", err)
    }

    tests := []struct {
        name    string
        token   string
        wantID  uint
        wantErr bool
    }{
        {"Valid token", validToken, validUserID, false},
        {"Empty token", "", 0, true},
        {"Invalid token format", "invalid.token.here", 0, true},
        {"Malformed token", "notavalidtoken", 0, true},
        {"Token with wrong signature", validToken[:len(validToken)-5] + "xxxxx", 0, true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            userID, err := ValidateJWT(tt.token)
            
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

func TestJWTForDifferentUsers(t *testing.T) {
    user1, user2 := uint(100), uint(200)
    
    token1, err := GenerateJWT(user1)
    if err != nil {
        t.Fatalf("GenerateJWT() failed for user1: %v", err)
    }

    token2, err := GenerateJWT(user2)
    if err != nil {
        t.Fatalf("GenerateJWT() failed for user2: %v", err)
    }

    if token1 == token2 {
        t.Error("Different users got identical tokens")
    }

    validatedID1, err := ValidateJWT(token1)
    if err != nil {
        t.Errorf("Token1 validation failed: %v", err)
    }
    if validatedID1 != user1 {
        t.Errorf("Token1 validated to wrong user: got %v, want %v", validatedID1, user1)
    }

    validatedID2, err := ValidateJWT(token2)
    if err != nil {
        t.Errorf("Token2 validation failed: %v", err)
    }
    if validatedID2 != user2 {
        t.Errorf("Token2 validated to wrong user: got %v, want %v", validatedID2, user2)
    }
}

func TestJWTRoundTrip(t *testing.T) {
    tests := []struct {
        name   string
        userID uint
    }{
        {"User 1", 1},
        {"User 999", 999},
        {"User 12345", 12345},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            token, err := GenerateJWT(tt.userID)
            if err != nil {
                t.Fatalf("GenerateJWT() failed: %v", err)
            }

            retrievedID, err := ValidateJWT(token)
            if err != nil {
                t.Errorf("ValidateJWT() failed: %v", err)
            }

            if retrievedID != tt.userID {
                t.Errorf("Round trip failed: sent %v, got %v", tt.userID, retrievedID)
            }
        })
    }
}