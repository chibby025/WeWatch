# Backend Unit Tests

Unit tests for WeWatch backend handlers, models, and utilities.

## 📁 Directory Structure

```
tests/backend/unit/
├── handlers/           # Handler function tests
│   ├── auth_test.go
│   ├── payment_test.go
│   ├── ticket_test.go
│   └── session_test.go
├── models/            # Model validation tests
│   ├── user_test.go
│   ├── wallet_test.go
│   └── transaction_test.go
└── utils/             # Utility function tests
    └── token_converter_test.go
```

## 🚀 Running Tests

```bash
# Run all unit tests
cd ~/WeWatch/tests/backend/unit
go test ./... -v

# Run specific test file
go test ./handlers/auth_test.go -v

# Run with coverage
go test ./... -cover

# Generate HTML coverage report
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out
```

## 🎯 Coverage Goal

**Target:** 60%+ test coverage

**Priority areas:**
1. Payment handlers (critical for revenue)
2. Auth handlers (security)
3. Ticket handlers (core feature)
4. Wallet operations (financial accuracy)

## ✅ Test Checklist

### Handlers
- [ ] `auth_test.go` - Registration, login, token refresh
- [ ] `payment_test.go` - Token purchase, withdrawals
- [ ] `ticket_test.go` - RSVP, ticket purchase, cancellation
- [ ] `session_test.go` - Create, join, leave sessions

### Models
- [ ] `user_test.go` - Validation, password hashing
- [ ] `wallet_test.go` - Token operations, balance checks
- [ ] `transaction_test.go` - Transaction recording

### Utils
- [ ] `token_converter_test.go` - Currency conversions

## 📝 Example Test

See `handlers/auth_test.go` for complete example.
