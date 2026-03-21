# Frontend E2E Tests

Cypress end-to-end tests for WeWatch frontend user flows.

## 📁 Directory Structure

```
tests/frontend/e2e/
├── auth.cy.js          # Registration, login, logout
├── payment.cy.js       # Token purchase flow
├── events.cy.js        # Event creation and management
├── tickets.cy.js       # Ticket purchase and RSVP
├── cinema.cy.js        # 3D cinema experience
└── chat.cy.js          # Real-time chat
```

## 🚀 Running Tests

```bash
# Run Cypress interactively (with UI)
cd ~/WeWatch/frontend
npx cypress open

# Run headless (CI mode)
npx cypress run

# Run specific test file
npx cypress run --spec "cypress/e2e/auth.cy.js"

# Run with specific browser
npx cypress run --browser chrome
```

## 📦 Installation

```bash
cd ~/WeWatch/frontend
npm install --save-dev cypress

# Open Cypress for first time (creates config)
npx cypress open
```

This creates:
- `cypress/` folder in frontend directory
- `cypress.config.js`
- Example test files (can delete)

## ⚙️ Configuration

**File:** `frontend/cypress.config.js`

```javascript
import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
  },
  env: {
    apiUrl: 'http://localhost:8080/api'
  }
})
```

## ✅ Test Checklist

### Critical Flows
- [ ] `auth.cy.js` - User registration and login
- [ ] `payment.cy.js` - Token purchase flow
- [ ] `tickets.cy.js` - Event ticket purchase
- [ ] `events.cy.js` - Create and manage events

### Secondary Flows
- [ ] `cinema.cy.js` - Join 3D cinema session
- [ ] `chat.cy.js` - Send messages and reactions

## 📝 Custom Commands

**File:** `frontend/cypress/support/commands.js`

```javascript
// Login command
Cypress.Commands.add('login', (email, password) => {
  cy.visit('/login')
  cy.get('input[name="email"]').type(email)
  cy.get('input[name="password"]').type(password)
  cy.get('button[type="submit"]').click()
  cy.url().should('include', '/dashboard')
})

// Check token balance
Cypress.Commands.add('getTokenBalance', () => {
  return cy.get('[data-testid="token-balance"]').invoke('text')
})
```

**Usage:**
```javascript
cy.login('test@example.com', 'password')
cy.getTokenBalance().should('contain', '100')
```

## 🎯 Best Practices

1. **Use data-testid attributes:**
   ```jsx
   <button data-testid="buy-tokens-btn">Buy Tokens</button>
   ```
   ```javascript
   cy.get('[data-testid="buy-tokens-btn"]').click()
   ```

2. **Clean up after tests:**
   ```javascript
   afterEach(() => {
     cy.clearCookies()
     cy.clearLocalStorage()
   })
   ```

3. **Use fixtures for test data:**
   ```javascript
   cy.fixture('user.json').then((user) => {
     cy.login(user.email, user.password)
   })
   ```

## 📊 Coverage Goal

**Target:** All critical user flows covered

**Priority:**
1. Auth (register, login) - Highest
2. Payment (token purchase) - Highest
3. Ticketing (buy ticket) - High
4. Events (create event) - Medium
5. Cinema (join session) - Medium

## 🎬 Example Test

```javascript
describe('Token Purchase Flow', () => {
  beforeEach(() => {
    cy.login('test@example.com', 'SecurePass123!')
  })

  it('should purchase 100 tokens successfully', () => {
    cy.visit('/payment')
    
    cy.get('[data-testid="token-package-100"]').click()
    cy.get('[data-testid="payment-method-paystack"]').click()
    cy.get('[data-testid="confirm-purchase"]').click()
    
    cy.url().should('include', 'paystack.com')
  })
})
```

## 🚨 Notes

- Tests require both backend and frontend servers running
- Cypress runs in Electron browser by default
- Test database recommended for data isolation
- Screenshots/videos saved in `cypress/screenshots` and `cypress/videos`
