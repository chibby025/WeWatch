// WeWatch/backend/internal/utils/jwt.go
package utils

import (
	"fmt"
	"log"   // Import 'log' for logging messages
	"os"    // Import 'os' for accessing environment variables
	"time"  // Import 'time' for handling time-related data (used by jwt.RegisteredClaims)

	"github.com/golang-jwt/jwt/v5"
	"github.com/joho/godotenv"
	// "wewatch-backend/internal/models" // Comment out if not used in this file
)

// Define secret key variable. It will be initialized in init().
var jwtSecret []byte

// init function runs automatically when the package is imported.
func init() {
	log.Println("DEBUG: jwt.go init() function starting...")

	// --- LOAD .env FILE HERE AS WELL ---
	// This ensures env vars are available even if main.go hasn't run its load yet.
	// It's safe to call multiple times, subsequent calls have no effect if already loaded.
	err := godotenv.Load() // Add this line
	if err != nil {
		log.Printf("Info/Warning: jwt.go init: Error loading .env file: %v. Proceeding, vars might come from system env.", err)
		// Don't fail here, env vars might be set system-wide.
	} else {
		log.Println("DEBUG: jwt.go init: .env file loaded (if it existed).")
	}

	// --- Check and Load Variables ---
	// Debug: Print environment variables to check if .env was loaded
	dbHost := os.Getenv("DB_HOST")
	dbUser := os.Getenv("DB_USER")
	jwtSecretEnv := os.Getenv("JWT_SECRET")

	log.Printf("DEBUG: DB_HOST from env: '%s'", dbHost)
	log.Printf("DEBUG: DB_USER from env: '%s'", dbUser)
	log.Printf("DEBUG: JWT_SECRET from env length: %d", len(jwtSecretEnv)) // Log length, not value

	// Load the JWT secret from the environment variable
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		log.Fatal("FATAL: JWT_SECRET environment variable is required. Please check your .env file or system environment variables.")
		return // Redundant after log.Fatal, but explicit
	}
	jwtSecret = []byte(secret)
	log.Println("DEBUG: JWT secret loaded successfully from environment variable")
}

// Claims struct extends the standard JWT claims with our custom UserId field.
type Claims struct {
	UserId uint `json:"user_id"`
	jwt.RegisteredClaims
}

// GenerateJWT creates a new JWT token for a given user ID.
func GenerateJWT(userID uint) (string, error) {
	// Set expiration time (e.g., 24 hours from now)
	expirationTime := time.Now().Add(24 * time.Hour)

	// Create the Claims
	claims := &Claims{
		UserId: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			// In JWT, expiry time is expressed as a Unix timestamp
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			// Issuer, Subject, etc. can be added here if needed
		},
	}

	// Declare the token with the algorithm used for signing, and the claims
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	// Create the JWT string by signing it with the secret key
	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		log.Printf("Error signing JWT token: %v", err)
		return "", err
	}

	return tokenString, nil
}

// ValidateJWT parses and validates a JWT token string.
// It returns the user ID if the token is valid, or an error.
func ValidateJWT(tokenString string) (uint, error) {
	// Create a Claims instance to store the parsed claims
	claims := &Claims{}

	// Parse and validate the token using the secret
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		// Validate the signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		// Return the secret key for validation
		return jwtSecret, nil
	})

	if err != nil {
		log.Printf("Error parsing JWT token: %v", err)
		return 0, err // Return zero user ID and the error
	}

	// Check if the token is valid
	if !token.Valid {
		log.Println("Invalid JWT token")
		return 0, fmt.Errorf("invalid token")
	}

	// Return the user ID extracted from the claims
	return claims.UserId, nil
}
