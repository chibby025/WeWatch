# WeWatch Testing Strategy & Coverage Plan

## 🎯 Overview
This testing plan is designed to strategically increase test coverage from 0.2% to meaningful levels by focusing on:
- **Critical business logic** (payments, auth, wallets)
- **Data integrity** (model validations)
- **Core features** (rooms, sessions, ticketing)
- **Security** (authentication & authorization)

## 📊 Test Organization

### Backend Tests (`tests/backend/`)

```
tests/backend/
├── unit/
│   ├── utils/          # Utility function tests (password hashing, JWT)
│   ├── models/         # Model validation and business logic
│   └── handlers/       # HTTP handler tests
└── integration/        # End-to-end API flow tests
```

## ✅ Current Test Coverage

### Utils (Foundation Layer) ✓
- [x] `password_test.go` - Password hashing & verification
- [x] `jwt_test.go` - JWT token generation & validation

### Models (Data Layer) ✓
- [x] `user_test.go` - User role validation
- [x] `user_wallet_test.go` - Wallet operations (add/deduct tokens)
- [x] `validation_test.go` - Model validation rules

### Handlers (API Layer) ✓
- [x] `auth_handler_test.go` - Registration & login flows

## 🚀 Running Tests

### Run All Tests
```bash
cd ~/WeWatch
go test ./tests/backend/... -v
```

### Run with Coverage
```bash
go test ./tests/backend/... -coverprofile=coverage.out
go tool cover -html=coverage.out -o coverage.html
```

### Run Specific Test Suite
```bash
# Utils only
go test ./tests/backend/unit/utils/... -v

# Models only
go test ./tests/backend/unit/models/... -v

# Handlers only
go test ./tests/backend/unit/handlers/... -v
```

### Run Single Test
```bash
go test ./tests/backend/unit/utils/... -v -run TestHashPassword
```

## 📈 Coverage Goals

### Phase 1: Foundation (Current) - Target: 15-20%
- ✅ Core utilities (password, JWT)
- ✅ Critical models (User, UserWallet)
- ✅ Authentication handlers

### Phase 2: Business Logic - Target: 30-35%
- [ ] Payment handlers
- [ ] Wallet transaction flows
- [ ] Room creation & management
- [ ] Session ticketing logic

### Phase 3: Integration - Target: 45-50%
- [ ] Complete user registration → room creation → ticketing flow
- [ ] Payment → wallet → withdrawal flow
- [ ] Multi-user interaction scenarios

## 🎓 Test Writing Guidelines

### 1. Unit Tests
Focus on isolated functionality:
```go
func TestFunction(t *testing.T) {
    tests := []struct {
        name    string
        input   Type
        want    Type
        wantErr bool
    }{
        // Test cases
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := Function(tt.input)
            // Assertions
        })
    }
}
```

### 2. Handler Tests
Use table-driven tests with mock DB:
```go
func TestHandler(t *testing.T) {
    router := setupTestRouter()
    db, mock := setupMockDB(t)
    handlers.DB = db
    
    // Setup mock expectations
    // Make request
    // Assert response
}
```

### 3. Integration Tests
Test complete flows:
```go
func TestUserJourneyFlow(t *testing.T) {
    // 1. Register user
    // 2. Login
    // 3. Create room
    // 4. Purchase tickets
    // Assert end state
}
```

## 🔧 CI/CD Integration

### GitHub Actions (Recommended)
Create `.github/workflows/test.yml`:
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-go@v4
        with:
          go-version: '1.24'
      - run: go test ./tests/backend/... -v -coverprofile=coverage.out
      - run: go tool cover -func=coverage.out
```

## 📝 Best Practices

1. **Test Names**: Use descriptive names that explain what's being tested
2. **Isolation**: Each test should be independent
3. **Cleanup**: Always clean up resources (close connections, etc.)
4. **Mocking**: Use sqlmock for database tests to avoid real DB dependency
5. **Coverage**: Aim for 80%+ on critical paths (auth, payments, wallets)

## 🐛 Debugging Failed Tests

```bash
# Run with verbose output
go test ./tests/backend/... -v

# Run specific failing test
go test ./tests/backend/unit/handlers/... -v -run TestRegisterHandler_Success

# Show detailed test output
go test ./tests/backend/... -v -count=1  # Disable cache
```

## 📊 Measuring Impact

### Generate Coverage Report
```bash
# Terminal summary
go test ./tests/backend/... -cover

# HTML report
go test ./tests/backend/... -coverprofile=coverage.out
go tool cover -html=coverage.out

# Per-package breakdown
go test ./tests/backend/... -coverprofile=coverage.out
go tool cover -func=coverage.out
```

### Coverage Badges
Use services like [Codecov](https://codecov.io/) or [Coveralls](https://coveralls.io/) to display coverage badges in your README.

## 🎯 Job Application Strategy

### Highlight These Skills:
1. **Test-Driven Development** - Show understanding of TDD principles
2. **Table-Driven Tests** - Idiomatic Go testing pattern
3. **Mocking & Isolation** - Using sqlmock for database independence
4. **Coverage Metrics** - Demonstrating measurable improvement
5. **CI/CD Integration** - Automated testing pipeline knowledge

### Portfolio Talking Points:
- "Increased test coverage from 0.2% to X% by implementing strategic test suite"
- "Designed table-driven tests covering edge cases and error handling"
- "Implemented mock database testing to enable fast, isolated unit tests"
- "Created comprehensive wallet testing ensuring financial transaction integrity"

## 📚 Additional Resources

- [Go Testing Documentation](https://golang.org/pkg/testing/)
- [sqlmock Documentation](https://github.com/DATA-DOG/go-sqlmock)
- [Testify (assertion library)](https://github.com/stretchr/testify)
- [Go Testing Best Practices](https://golang.org/doc/effective_go#testing)

---

**Last Updated**: March 2026
**Test Coverage**: Tracking from 0.2% → Target 50%+
