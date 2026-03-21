# Backend Integration Tests

Integration tests for WeWatch API endpoints with database interactions.

## 📁 Directory Structure

```
tests/backend/integration/
├── auth_flow_test.go       # Complete auth flow
├── payment_flow_test.go    # Token purchase → wallet credit
├── ticket_flow_test.go     # Event creation → ticket purchase
└── session_flow_test.go    # Session lifecycle
```

## 🚀 Running Tests

```bash
# Run all integration tests
cd ~/WeWatch/tests/backend/integration
go test ./... -v

# Run specific test
go test -run TestAuthFlow -v

# Run with race detection
go test ./... -race -v
```

## 🎯 Coverage Goal

**Target:** 40%+ integration coverage

**Critical flows:**
1. Auth flow (register → login → refresh)
2. Payment flow (purchase → credit → withdrawal)
3. Ticket flow (create event → RSVP/purchase → join)
4. Session flow (create → join → leave)

## ⚙️ Setup

Integration tests require:
- PostgreSQL running on localhost:5432
- Test database: `wewatch_test`
- Environment variables set

**Create test database:**
```bash
psql -h localhost -U postgres -c "CREATE DATABASE wewatch_test;"
psql -h localhost -U postgres -d wewatch_test -f backend/migrations/*.sql
```

## ✅ Test Checklist

- [ ] `auth_flow_test.go` - Full authentication cycle
- [ ] `payment_flow_test.go` - Complete payment process
- [ ] `ticket_flow_test.go` - Ticketing end-to-end
- [ ] `session_flow_test.go` - Session management

## 📝 Example Test Structure

```go
func TestPaymentFlow(t *testing.T) {
    // Setup test database
    db := setupTestDB()
    defer teardownTestDB(db)
    
    // Create test user
    user := createTestUser(db)
    
    // Purchase tokens
    response := purchaseTokens(user, 100)
    assert.Equal(t, 200, response.StatusCode)
    
    // Verify wallet updated
    wallet := getWallet(db, user.ID)
    assert.Equal(t, 10000, wallet.TokenBalance) // 100 tokens in cents
    
    // Verify transaction recorded
    tx := getTransaction(db, user.ID)
    assert.Equal(t, "purchase", tx.Type)
}
```
