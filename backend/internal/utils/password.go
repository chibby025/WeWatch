package utils

import (
	"golang.org/x/crypto/bcrypt"
	"log"
)

func HashPassword(password string) (string, error) {
	// Generate a salt and hash the password
	// The cost factor(12 here) determines how slow the hashing is.
	// Higher cost = more secure but slower. 10-12 is common.
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		log.Printf("Error hashing password: %v", err)
		return "", err
	}
	return string(bytes), nil
}

// CheckPasswordHash compares a plain text password with its bcrypt hash.
// Returns true if they match, false otherwise (or on error).
func CheckPasswordHash(password, hash string) bool {
    // Compare the provided password with the stored hash.
    err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
    // If the error is nil, the passwords matched.
    return err == nil
}