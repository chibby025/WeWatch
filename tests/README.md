# WeWatch Testing Suite

Centralized testing directory for all WeWatch tests.

## 📁 Directory Structure

```
tests/
├── backend/              # Backend Go tests
│   ├── unit/            # Unit tests for handlers, models, utils
│   └── integration/     # API endpoint integration tests
├── frontend/            # Frontend tests
│   └── e2e/            # Cypress end-to-end tests
├── api/                # API testing (Postman collections, REST Client)
└── README.md           # This file
```

---

## 🧪 Backend Tests (`tests/backend/`)

### Unit Tests (`tests/backend/unit/`)
Test individual functions and handlers in isolation.

**Run all unit tests:**
```bash
cd ~/WeWatch/tests/backend/unit
go test ./... -v
```

**Run with coverage:**
```bash
go test ./... -cover -coverprofile=coverage.out
go tool cover -html=coverage.out
```

### Integration Tests (`tests/backend/integration/`)
Test complete API flows with database interactions.

**Run integration tests:**
```bash
cd ~/WeWatch/tests/backend/integration
go test ./... -v
```

**Note:** Integration tests require PostgreSQL running.

---

## 🌐 Frontend Tests (`tests/frontend/`)

### E2E Tests (`tests/frontend/e2e/`)
Cypress tests for full user flows.

**Run Cypress interactively:**
```bash
cd ~/WeWatch/frontend
npx cypress open
```

**Run headless:**
```bash
npx cypress run
```

---

## 🔌 API Tests (`tests/api/`)

Manual API testing collections for:
- Postman collections
- REST Client (.http files)
- cURL scripts

---

## 📊 Coverage Goals

| Test Type | Current | Target |
|-----------|---------|--------|
| Backend Unit | 0% | 60%+ |
| Backend Integration | 0% | 40%+ |
| Frontend E2E | 0% | Critical flows |

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
# Backend testing tools
cd ~/WeWatch/backend
go get github.com/stretchr/testify/assert
go get github.com/stretchr/testify/mock
go get github.com/DATA-DOG/go-sqlmock

# Frontend testing tools
cd ~/WeWatch/frontend
npm install --save-dev cypress
```

### 2. Run All Tests
```bash
# Backend
cd ~/WeWatch/tests/backend
go test ./... -v

# Frontend
cd ~/WeWatch/frontend
npx cypress run
```

### 3. View Coverage
```bash
cd ~/WeWatch/tests/backend
go test ./... -coverprofile=coverage.out
go tool cover -html=coverage.out
```

---

## ✅ Testing Checklist

### Backend Unit Tests
- [ ] Auth handlers (login, register, refresh)
- [ ] Payment handlers (purchase, withdrawal)
- [ ] Ticket handlers (RSVP, purchase, cancel)
- [ ] Session handlers (create, join, leave)
- [ ] User model validation
- [ ] Wallet operations
- [ ] Token calculations

### Backend Integration Tests
- [ ] Complete auth flow
- [ ] Payment flow (purchase → credit wallet)
- [ ] Ticket purchase flow
- [ ] Session lifecycle
- [ ] WebSocket connections

### Frontend E2E Tests
- [ ] User registration → login
- [ ] Token purchase flow
- [ ] Event creation
- [ ] Ticket purchase
- [ ] Join 3D cinema
- [ ] Chat functionality

---

## 📝 Writing Tests

### Backend Unit Test Template
```go
package unit

import (
    "testing"
    "github.com/stretchr/testify/assert"
)

func TestFunctionName(t *testing.T) {
    tests := []struct {
        name     string
        input    interface{}
        expected interface{}
        wantErr  bool
    }{
        {
            name:     "Valid input",
            input:    "test",
            expected: "expected",
            wantErr:  false,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result, err := FunctionName(tt.input)
            
            if tt.wantErr {
                assert.Error(t, err)
            } else {
                assert.NoError(t, err)
                assert.Equal(t, tt.expected, result)
            }
        })
    }
}
```

### Frontend E2E Test Template
```javascript
describe('Feature Name', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173')
  })

  it('should perform action successfully', () => {
    cy.get('[data-testid="button"]').click()
    cy.contains('Success').should('be.visible')
  })

  it('should show error for invalid input', () => {
    cy.get('[data-testid="input"]').type('invalid')
    cy.get('[data-testid="submit"]').click()
    cy.contains('Error').should('be.visible')
  })
})
```

---

## 🎯 CI/CD Integration

Tests run automatically on every push via GitHub Actions.

**Workflow:** `.github/workflows/test.yml`

---

**Last Updated:** March 21, 2026  
**Maintainer:** WeWatch Development Team
