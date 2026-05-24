// Package encrypt provides AES-256-GCM field-level encryption and HMAC-based
// searchable hashing. It has no dependencies on other internal packages, so it
// can be safely imported by both models and handlers without creating cycles.
package encrypt

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"io"
	"os"
)

// Field encrypts plaintext using AES-256-GCM.
// Returns a base64-encoded string: 12-byte nonce || ciphertext || 16-byte tag.
// Reads the key from ENCRYPTION_KEY env var (must be 64 hex chars = 32 bytes).
func Field(plaintext string) (string, error) {
	key, err := loadKey()
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decodes and decrypts a base64-encoded AES-256-GCM ciphertext produced by Field.
func Decrypt(encoded string) (string, error) {
	key, err := loadKey()
	if err != nil {
		return "", err
	}

	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", errors.New("ciphertext too short")
	}

	nonce, ct := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}

// HMAC returns a hex-encoded HMAC-SHA256 of the value, keyed by ENCRYPTION_KEY.
// Used for deterministic searchable lookups without exposing the plaintext.
func HMAC(value string) (string, error) {
	key, err := loadKey()
	if err != nil {
		return "", err
	}

	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(value))
	return hex.EncodeToString(mac.Sum(nil)), nil
}

// Configured reports whether ENCRYPTION_KEY is present and valid.
func Configured() bool {
	_, err := loadKey()
	return err == nil
}

func loadKey() ([]byte, error) {
	raw := os.Getenv("ENCRYPTION_KEY")
	if raw == "" {
		return nil, errors.New("ENCRYPTION_KEY environment variable is not set")
	}
	key, err := hex.DecodeString(raw)
	if err != nil {
		return nil, errors.New("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)")
	}
	if len(key) != 32 {
		return nil, errors.New("ENCRYPTION_KEY must decode to exactly 32 bytes for AES-256")
	}
	return key, nil
}
