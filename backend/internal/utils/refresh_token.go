package utils

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

// GenerateRefreshToken returns a cryptographically random 32-byte token as a hex string,
// plus the SHA-256 hash of that token (stored in DB — never the plaintext).
func GenerateRefreshToken() (plaintext string, hash string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		err = fmt.Errorf("failed to generate refresh token: %w", err)
		return
	}
	plaintext = hex.EncodeToString(b)
	hash = HashRefreshToken(plaintext)
	return
}

// HashRefreshToken returns the hex-encoded SHA-256 hash of a refresh token plaintext.
func HashRefreshToken(plaintext string) string {
	sum := sha256.Sum256([]byte(plaintext))
	return hex.EncodeToString(sum[:])
}
