package utils

import "wewatch-backend/internal/encrypt"

// EncryptField, DecryptField, HMACField, EncryptionConfigured are thin wrappers
// around the encrypt package so existing callers in the handlers layer don't need updating.

func EncryptField(plaintext string) (string, error)  { return encrypt.Field(plaintext) }
func DecryptField(encoded string) (string, error)    { return encrypt.Decrypt(encoded) }
func HMACField(value string) (string, error)         { return encrypt.HMAC(value) }
func EncryptionConfigured() bool                     { return encrypt.Configured() }
