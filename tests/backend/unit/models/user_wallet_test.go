package models_test

import (
	"testing"
	"wewatch-backend/internal/models"
)

func TestUserWallet_AddTokens(t *testing.T) {
	tests := []struct {
		name               string
		initialBalance     int
		initialEarned      int
		tokensToAdd        int
		expectedBalance    int
		expectedEarned     int
	}{
		{
			name:            "Add tokens to empty wallet",
			initialBalance:  0,
			initialEarned:   0,
			tokensToAdd:     100,
			expectedBalance: 100,
			expectedEarned:  100,
		},
		{
			name:            "Add tokens to existing balance",
			initialBalance:  50,
			initialEarned:   50,
			tokensToAdd:     75,
			expectedBalance: 125,
			expectedEarned:  125,
		},
		{
			name:            "Add large amount",
			initialBalance:  1000,
			initialEarned:   2000,
			tokensToAdd:     5000,
			expectedBalance: 6000,
			expectedEarned:  7000,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			wallet := &models.UserWallet{
				TokenBalance:   tt.initialBalance,
				LifetimeEarned: tt.initialEarned,
			}

			wallet.AddTokens(tt.tokensToAdd)

			if wallet.TokenBalance != tt.expectedBalance {
				t.Errorf("TokenBalance = %d, want %d", wallet.TokenBalance, tt.expectedBalance)
			}
			if wallet.LifetimeEarned != tt.expectedEarned {
				t.Errorf("LifetimeEarned = %d, want %d", wallet.LifetimeEarned, tt.expectedEarned)
			}
		})
	}
}

func TestUserWallet_DeductTokens(t *testing.T) {
	tests := []struct {
		name            string
		initialBalance  int
		initialSpent    int
		tokensToDeduct  int
		expectedBalance int
		expectedSpent   int
		wantErr         bool
	}{
		{
			name:            "Deduct from sufficient balance",
			initialBalance:  100,
			initialSpent:    0,
			tokensToDeduct:  50,
			expectedBalance: 50,
			expectedSpent:   50,
			wantErr:         false,
		},
		{
			name:            "Deduct all tokens",
			initialBalance:  100,
			initialSpent:    200,
			tokensToDeduct:  100,
			expectedBalance: 0,
			expectedSpent:   300,
			wantErr:         false,
		},
		{
			name:            "Insufficient balance",
			initialBalance:  50,
			initialSpent:    0,
			tokensToDeduct:  100,
			expectedBalance: 50, // Should remain unchanged
			expectedSpent:   0,  // Should remain unchanged
			wantErr:         true,
		},
		{
			name:            "Deduct from empty wallet",
			initialBalance:  0,
			initialSpent:    0,
			tokensToDeduct:  10,
			expectedBalance: 0,
			expectedSpent:   0,
			wantErr:         true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			wallet := &models.UserWallet{
				TokenBalance:  tt.initialBalance,
				LifetimeSpent: tt.initialSpent,
			}

			err := wallet.DeductTokens(tt.tokensToDeduct)

			if (err != nil) != tt.wantErr {
				t.Errorf("DeductTokens() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if wallet.TokenBalance != tt.expectedBalance {
				t.Errorf("TokenBalance = %d, want %d", wallet.TokenBalance, tt.expectedBalance)
			}
			if wallet.LifetimeSpent != tt.expectedSpent {
				t.Errorf("LifetimeSpent = %d, want %d", wallet.LifetimeSpent, tt.expectedSpent)
			}

			// Verify error type for insufficient balance
			if tt.wantErr && err != models.ErrInsufficientBalance {
				t.Errorf("Expected ErrInsufficientBalance, got %v", err)
			}
		})
	}
}

func TestUserWallet_GetTokensAsFloat(t *testing.T) {
	tests := []struct {
		name         string
		tokenBalance int
		expected     float64
	}{
		{
			name:         "Zero tokens",
			tokenBalance: 0,
			expected:     0.0,
		},
		{
			name:         "Whole tokens",
			tokenBalance: 100,
			expected:     1.0,
		},
		{
			name:         "Fractional tokens",
			tokenBalance: 121,
			expected:     1.21,
		},
		{
			name:         "Large amount",
			tokenBalance: 500000,
			expected:     5000.0,
		},
		{
			name:         "Single unit",
			tokenBalance: 1,
			expected:     0.01,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			wallet := &models.UserWallet{
				TokenBalance: tt.tokenBalance,
			}

			got := wallet.GetTokensAsFloat()
			if got != tt.expected {
				t.Errorf("GetTokensAsFloat() = %f, want %f", got, tt.expected)
			}
		})
	}
}

func TestTokensToUnits(t *testing.T) {
	tests := []struct {
		name     string
		tokens   float64
		expected int
	}{
		{
			name:     "Zero tokens",
			tokens:   0.0,
			expected: 0,
		},
		{
			name:     "Whole token",
			tokens:   1.0,
			expected: 100,
		},
		{
			name:     "Fractional tokens",
			tokens:   1.5,
			expected: 150,
		},
		{
			name:     "Large amount",
			tokens:   100.99,
			expected: 10099,
		},
		{
			name:     "Small fraction",
			tokens:   0.01,
			expected: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := models.TokensToUnits(tt.tokens)
			if got != tt.expected {
				t.Errorf("TokensToUnits(%f) = %d, want %d", tt.tokens, got, tt.expected)
			}
		})
	}
}

func TestUserWallet_CanWithdraw(t *testing.T) {
	tests := []struct {
		name         string
		tokenBalance int
		minTokens    int
		want         bool
	}{
		{
			name:         "Balance exceeds minimum",
			tokenBalance: 1000,
			minTokens:    500,
			want:         true,
		},
		{
			name:         "Balance equals minimum",
			tokenBalance: 500,
			minTokens:    500,
			want:         true,
		},
		{
			name:         "Balance below minimum",
			tokenBalance: 400,
			minTokens:    500,
			want:         false,
		},
		{
			name:         "Zero balance",
			tokenBalance: 0,
			minTokens:    100,
			want:         false,
		},
		{
			name:         "Zero minimum",
			tokenBalance: 1,
			minTokens:    0,
			want:         true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			wallet := &models.UserWallet{
				TokenBalance: tt.tokenBalance,
			}

			if got := wallet.CanWithdraw(tt.minTokens); got != tt.want {
				t.Errorf("CanWithdraw() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestUserWallet_BeforeCreate(t *testing.T) {
	tests := []struct {
		name         string
		tokenBalance int
		wantErr      bool
	}{
		{
			name:         "Valid zero balance",
			tokenBalance: 0,
			wantErr:      false,
		},
		{
			name:         "Valid positive balance",
			tokenBalance: 100,
			wantErr:      false,
		},
		{
			name:         "Invalid negative balance",
			tokenBalance: -1,
			wantErr:      true,
		},
		{
			name:         "Invalid large negative balance",
			tokenBalance: -1000,
			wantErr:      true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			wallet := &models.UserWallet{
				TokenBalance: tt.tokenBalance,
			}

			err := wallet.BeforeCreate(nil) // DB is not used in the hook

			if (err != nil) != tt.wantErr {
				t.Errorf("BeforeCreate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestUserWallet_Integration(t *testing.T) {
	// Test a realistic workflow
	wallet := &models.UserWallet{
		UserID:         1,
		TokenBalance:   0,
		LifetimeEarned: 0,
		LifetimeSpent:  0,
	}

	// User purchases 1000 tokens (10.00 in float)
	wallet.AddTokens(1000)
	if wallet.TokenBalance != 1000 {
		t.Errorf("After purchase: TokenBalance = %d, want 1000", wallet.TokenBalance)
	}
	if wallet.LifetimeEarned != 1000 {
		t.Errorf("After purchase: LifetimeEarned = %d, want 1000", wallet.LifetimeEarned)
	}

	// User spends 250 tokens
	err := wallet.DeductTokens(250)
	if err != nil {
		t.Errorf("DeductTokens failed: %v", err)
	}
	if wallet.TokenBalance != 750 {
		t.Errorf("After spending: TokenBalance = %d, want 750", wallet.TokenBalance)
	}
	if wallet.LifetimeSpent != 250 {
		t.Errorf("After spending: LifetimeSpent = %d, want 250", wallet.LifetimeSpent)
	}

	// User earns 500 more tokens
	wallet.AddTokens(500)
	if wallet.TokenBalance != 1250 {
		t.Errorf("After earning: TokenBalance = %d, want 1250", wallet.TokenBalance)
	}
	if wallet.LifetimeEarned != 1500 {
		t.Errorf("After earning: LifetimeEarned = %d, want 1500", wallet.LifetimeEarned)
	}

	// Check withdrawal eligibility (minimum 1000 tokens = 10.00)
	if !wallet.CanWithdraw(1000) {
		t.Error("Should be able to withdraw with 1250 tokens")
	}

	// Convert to float for display
	floatBalance := wallet.GetTokensAsFloat()
	if floatBalance != 12.50 {
		t.Errorf("GetTokensAsFloat() = %f, want 12.50", floatBalance)
	}
}
