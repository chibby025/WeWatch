package utils_test

import (
	"testing"
	"wewatch-backend/internal/utils"
)

func TestHashPassword(t *testing.T) {
	tests := []struct {
		name     string
		password string
		wantErr  bool
	}{
		{
			name:     "Valid password",
			password: "SecurePass123!",
			wantErr:  false,
		},
		{
			name:     "Short password",
			password: "abc",
			wantErr:  false, // bcrypt doesn't enforce min length
		},
		{
			name:     "Long password",
			password: "ThisIsAVeryLongPasswordThatShouldStillWorkFine1234567890!@#$%^&*()",
			wantErr:  false,
		},
		{
			name:     "Empty password",
			password: "",
			wantErr:  false, // bcrypt allows empty strings
		},
		{
			name:     "Password with special characters",
			password: "P@ssw0rd!#$%^&*()",
			wantErr:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hash, err := utils.HashPassword(tt.password)
			
			if (err != nil) != tt.wantErr {
				t.Errorf("HashPassword() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if !tt.wantErr {
				// Verify the hash is not empty
				if hash == "" {
					t.Error("HashPassword() returned empty hash")
				}

				// Verify the hash is different from the password
				if hash == tt.password {
					t.Error("HashPassword() returned unhashed password")
				}

				// Verify the hash starts with bcrypt prefix
				if len(hash) < 10 || hash[:4] != "$2a$" {
					t.Errorf("HashPassword() returned invalid bcrypt hash: %s", hash[:10])
				}
			}
		})
	}
}

func TestCheckPasswordHash(t *testing.T) {
	// First, create a known password and its hash
	password := "MySecurePassword123!"
	hash, err := utils.HashPassword(password)
	if err != nil {
		t.Fatalf("Failed to hash password for testing: %v", err)
	}

	tests := []struct {
		name     string
		password string
		hash     string
		want     bool
	}{
		{
			name:     "Correct password",
			password: password,
			hash:     hash,
			want:     true,
		},
		{
			name:     "Incorrect password",
			password: "WrongPassword",
			hash:     hash,
			want:     false,
		},
		{
			name:     "Empty password",
			password: "",
			hash:     hash,
			want:     false,
		},
		{
			name:     "Case sensitive - wrong case",
			password: "mysecurepassword123!",
			hash:     hash,
			want:     false,
		},
		{
			name:     "Password with extra character",
			password: password + "x",
			hash:     hash,
			want:     false,
		},
		{
			name:     "Invalid hash format",
			password: password,
			hash:     "invalid_hash",
			want:     false,
		},
		{
			name:     "Empty hash",
			password: password,
			hash:     "",
			want:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := utils.CheckPasswordHash(tt.password, tt.hash)
			if got != tt.want {
				t.Errorf("CheckPasswordHash() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestHashPasswordConsistency(t *testing.T) {
	password := "ConsistencyTest123"
	
	// Hash the same password twice
	hash1, err1 := utils.HashPassword(password)
	hash2, err2 := utils.HashPassword(password)

	if err1 != nil || err2 != nil {
		t.Fatalf("HashPassword() failed: err1=%v, err2=%v", err1, err2)
	}

	// Hashes should be different (bcrypt uses random salt)
	if hash1 == hash2 {
		t.Error("HashPassword() returned identical hashes for same password (should use random salt)")
	}

	// But both should validate against the original password
	if !utils.CheckPasswordHash(password, hash1) {
		t.Error("First hash failed to validate against original password")
	}
	if !utils.CheckPasswordHash(password, hash2) {
		t.Error("Second hash failed to validate against original password")
	}
}
