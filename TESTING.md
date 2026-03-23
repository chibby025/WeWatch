# WeWatch Backend Testing

[![Backend Tests](https://github.com/YOUR_USERNAME/WeWatch/actions/workflows/backend-tests.yml/badge.svg)](https://github.com/YOUR_USERNAME/WeWatch/actions/workflows/backend-tests.yml)

## 🧪 Test Coverage

This project includes comprehensive automated testing for critical backend components.

### Test Structure

```
backend/
├── internal/
│   ├── utils/
│   │   ├── jwt_test.go          # JWT token generation & validation
│   │   └── password_test.go     # Password hashing & verification
│   └── handlers/
│       ├── auth_handlers_test.go # Authentication API endpoints
│       └── payment_handlers_test.go # Wallet operations
```

### Testing Strategy

We use a **hybrid testing approach**:
- **Unit tests** - Located alongside code files (`*_test.go`)
- **Integration tests** - Also in `internal/` for API endpoint testing

## 📊 Test Statistics

- **Total Test Functions**: 10+
- **Total Test Cases**: 30+
- **Coverage Areas**: Authentication, Security, Database, API Endpoints
- **Test Types**: Unit, Integration, Security, Boundary, Negative

## 🚀 Running Tests Locally

### Prerequisites
```bash
cd backend
go mod download
```

### Run All Tests
```bash
go test ./...
```

### Run Specific Package Tests
```bash
# Utils tests (JWT, Password)
go test -v ./internal/utils

# Handler tests (API endpoints)
go test -v ./internal/handlers

# With coverage report
go test -cover ./internal/utils ./internal/handlers
```

### Run Individual Tests
```bash
# JWT tests only
go test -v ./internal/utils -run TestGenerateJWT

# Login tests only
go test -v ./internal/handlers -run TestLoginUser
```

## 📋 Test Coverage Details

### Utils Package (Unit Tests)
**JWT (`jwt_test.go`)**
- ✅ Token generation for different user IDs
- ✅ Token validation (valid & invalid tokens)
- ✅ Token tampering detection
- ✅ Different users get unique tokens
- ✅ Round-trip token verification

**Password (`password_test.go`)**
- ✅ Password hashing (bcrypt)
- ✅ Hash verification (correct/incorrect passwords)
- ✅ Password case sensitivity
- ✅ Invalid hash format handling
- ✅ Salt randomization verification

### Handlers Package (Integration Tests)
**Authentication (`auth_handlers_test.go`)**
- ✅ User registration with validation
- ✅ Duplicate email/username prevention
- ✅ Automatic wallet creation
- ✅ JWT token return on registration
- ✅ User login with credentials
- ✅ Password verification
- ✅ HTTP-only cookie management
- ✅ Invalid credentials handling

**Payments (`payment_handlers_test.go`)**
- ✅ Wallet access authorization
- ✅ User wallet retrieval

## 🎯 Test Methodology

### Table-Driven Testing
All tests use Go's table-driven pattern for scalability:
```go
tests := []struct {
    name           string
    input          InputType
    expectedOutput OutputType
    wantErr        bool
}{
    {"Valid case", validInput, expectedOutput, false},
    {"Error case", badInput, nil, true},
}
```

### Test Categories Covered
- **Positive Testing** - Happy path scenarios
- **Negative Testing** - Error handling and validation
- **Boundary Testing** - Edge cases and limits
- **Security Testing** - Authentication, authorization, encryption
- **Integration Testing** - API endpoints with database

### Database Testing
- Uses **in-memory SQLite** for fast, isolated tests
- Each test gets a fresh database instance
- No external dependencies required

## 🔧 CI/CD Integration

Tests run automatically on:
- Every push to `main`/`develop` branches
- Every pull request
- Changes to `backend/` directory

**GitHub Actions Workflow**: `.github/workflows/backend-tests.yml`

## 📈 Coverage Reports

Generate detailed coverage report:
```bash
cd backend
go test -coverprofile=coverage.out ./internal/utils ./internal/handlers
go tool cover -html=coverage.out -o coverage.html
```

Open `coverage.html` in browser to see line-by-line coverage.

## 🧑‍💻 Test-Driven Development

When adding new features:
1. Write test first (TDD approach)
2. Run test (it should fail)
3. Implement feature
4. Run test again (it should pass)
5. Refactor if needed

## 🔍 QA Best Practices Implemented

- **Isolated tests** - No shared state between tests
- **Clear naming** - Test names describe what they test
- **Comprehensive assertions** - Verify all aspects of output
- **Test fixtures** - Reusable test data setup
- **Mock external dependencies** - Database, HTTP requests
- **Security-first** - Extensive security testing

## 📚 Testing Resources

This testing suite demonstrates:
- Go testing best practices
- RESTful API testing
- Database integration testing
- Security testing (JWT, bcrypt)
- Table-driven test patterns
- Mock/stub patterns

---

**Note**: Replace `YOUR_USERNAME` in the badge URL with your GitHub username after pushing to GitHub.

## 🎓 For Portfolio/Interviews

This project showcases:
- Automated testing implementation
- CI/CD pipeline setup
- Unit & integration testing
- Security-focused QA approach
- Clean test architecture
- Production-ready code quality
