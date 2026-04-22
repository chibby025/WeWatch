# WeWatch E2E Tests - README

## 📦 Installation & Setup

### 1. Install Playwright

```bash
cd ~/WeWatch/frontend
npm install -D @playwright/test
npx playwright install
```

This installs:
- Playwright test runner
- Chromium, Firefox, WebKit browsers

### 2. Verify Installation

```bash
npx playwright --version
```

Expected output: `Version 1.x.x`

---

## 🚀 Running Tests

### Run All Tests

```bash
cd ~/WeWatch/frontend
npx playwright test
```

### Run Specific Test File

```bash
# Auth tests only
npx playwright test tests/e2e/auth/login.spec.js

# Session tests only
npx playwright test tests/e2e/session/create-session.spec.js

# LiveShare tests only
npx playwright test tests/e2e/liveshare/graphics.spec.js

# Real-time tests only
npx playwright test tests/e2e/realtime/websocket.spec.js
```

### Run with UI (Interactive Mode)

```bash
npx playwright test --ui
```

### Run in Headed Mode (See Browser)

```bash
npx playwright test --headed
```

### Run Specific Browser

```bash
# Chromium only
npx playwright test --project=chromium

# Firefox only
npx playwright test --project=firefox

# Mobile Chrome
npx playwright test --project=mobile-chrome
```

### Debug Mode

```bash
# Run with debugger (pauses at breakpoints)
npx playwright test --debug

# Run specific test in debug mode
npx playwright test tests/e2e/auth/login.spec.js --debug
```

---

## 📊 Viewing Test Reports

### HTML Report (Recommended)

```bash
# Generate and open HTML report
npx playwright show-report
```

### JUnit XML Report

Located at: `test-results/junit.xml`

---

## 🎯 Test Structure

```
frontend/tests/
├── fixtures/
│   ├── auth.fixture.js          # Authenticated page fixture
│   └── test-data.js             # Test data constants
├── page-objects/
│   ├── LoginPage.js             # Login page interactions
│   ├── LobbyPage.js             # Lobby/dashboard interactions
│   └── SessionCreationModal.js  # Session creation modal
└── e2e/
    ├── auth/
    │   └── login.spec.js        # Login, logout tests
    ├── session/
    │   └── create-session.spec.js  # Session creation tests
    ├── realtime/
    │   └── websocket.spec.js    # WebSocket connection tests
    └── liveshare/
        └── graphics.spec.js     # LiveShare modes & graphics
```

---

## ✅ Test Coverage

### Critical Paths (Implemented)

| Test Case ID | Feature | Status |
|-------------|---------|--------|
| TC-AUTH-001 | Login with valid credentials | ✅ |
| TC-AUTH-003 | Login with invalid password | ✅ |
| TC-AUTH-004 | Logout functionality | ✅ |
| TC-SESSION-001 | Create free instant watch | ✅ |
| TC-SESSION-002 | Create paid session | ✅ |
| TC-SESSION-004 | Create lecture hall | ✅ |
| TC-SESSION-006 | End session | ✅ |
| TC-REALTIME-001 | WebSocket connection | ✅ |
| TC-REALTIME-004 | Chat message broadcast | ✅ |
| TC-LIVESHARE-001 | Start LiveShare camera mode | ✅ |
| TC-LIVESHARE-002 | Enable lower third graphic | ✅ |
| TC-LIVESHARE-003 | Enable ticker | ✅ |
| TC-LIVESHARE-004 | Start break mode | ✅ |

### Pending Test Cases (Not Yet Implemented)

| Priority | Feature | Est. Time |
|----------|---------|-----------|
| High | Video upload (chunked) | 2 hours |
| High | Payment (Paystack integration) | 3 hours |
| Medium | Age restriction validation | 1 hour |
| Medium | Friend requests & chat | 2 hours |
| Medium | 3D cinema seat selection | 1 hour |
| Low | Content rating filters | 30 min |

---

## ⚙️ Prerequisites for Testing

### Backend Must Be Running

```bash
cd ~/WeWatch/backend
go run cmd/server/main.go
```

Expected: Backend running on `http://localhost:8080`

### Frontend Must Be Running

```bash
cd ~/WeWatch/frontend
npm run dev
```

Expected: Frontend running on `http://localhost:5173`

### Database Must Be Running

```bash
# PostgreSQL should be running
sudo service postgresql status
```

### Test Users Must Exist

**Option 1: Manual Registration**
- Register `testhost1@example.com` with password `Test1234!`
- Register `testviewer1@example.com` with password `Test1234!`

**Option 2: Seed Database** (if seeder exists)
```bash
cd ~/WeWatch/backend
go run cmd/seed/main.go
```

---

## 🔧 Troubleshooting

### Issue: Tests Fail with "Page not found"

**Cause:** Frontend not running on `http://localhost:5173`

**Fix:**
```bash
cd ~/WeWatch/frontend
npm run dev
```

### Issue: Login tests fail with "Invalid credentials"

**Cause:** Test users don't exist in database

**Fix:** Manually register test users or run seeder

### Issue: WebSocket tests fail

**Cause:** Backend WebSocket endpoint not accessible

**Fix:**
1. Verify backend is running: `curl http://localhost:8080/api/health`
2. Check WebSocket URL in frontend code

### Issue: Playwright browsers not installed

**Cause:** Browsers not downloaded

**Fix:**
```bash
npx playwright install
```

### Issue: Tests are flaky (pass sometimes, fail sometimes)

**Cause:** Network latency, slow machine, async timing issues

**Fix:**
1. Increase timeouts in `playwright.config.js`
2. Use `page.waitForTimeout()` sparingly
3. Use `await expect(...).toBeVisible({ timeout: 10000 })`

---

## 📝 Writing New Tests

### Example: Test Session Filtering

```javascript
import { test, expect } from '../../fixtures/auth.fixture.js';
import { LobbyPage } from '../../page-objects/LobbyPage.js';

test.describe('Session Filtering', () => {
  test('TC-LOBBY-002: Filter by content rating', async ({ authenticatedPage: page }) => {
    const lobbyPage = new LobbyPage(page);
    
    await lobbyPage.goto();
    
    // Click 18+ filter
    await page.click('button:has-text("18+")');
    
    // Verify only 18+ sessions visible
    const sessionCards = page.locator('.session-card');
    const count = await sessionCards.count();
    
    for (let i = 0; i < count; i++) {
      const card = sessionCards.nth(i);
      const rating = await card.locator('.rating-badge').textContent();
      expect(rating).toBe('18+');
    }
  });
});
```

### Key Principles

1. **Use Page Objects** - Don't use raw selectors in tests
2. **Use Fixtures** - Reuse authenticated state with `authenticatedPage`
3. **Use Test Data** - Import from `test-data.js`, don't hardcode
4. **Clear Names** - Test names should explain what's being tested
5. **Assertions** - Always verify expected outcome with `expect()`

---

## 🔄 CI/CD Integration

### GitHub Actions (Coming Soon)

Create `.github/workflows/e2e-tests.yml`:

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: cd frontend && npm ci
      
      - name: Install Playwright browsers
        run: npx playwright install --with-deps
      
      - name: Run E2E tests
        run: cd frontend && npx playwright test
      
      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: frontend/playwright-report/
```

---

## 📚 Resources

- [Playwright Documentation](https://playwright.dev)
- [QA_PORTFOLIO_MASTER_PLAN.md](../../QA_PORTFOLIO_MASTER_PLAN.md) - Full test strategy
- [LIVESHARE_REFINEMENT_PLAN.md](../../documentation/LIVESHARE_REFINEMENT_PLAN.md) - LiveShare feature specs
- [TESTING_STRATEGY.md](../TESTING_STRATEGY.md) - Backend testing strategy

---

## 🎯 Next Steps

1. ✅ Playwright setup complete
2. ✅ Critical path tests implemented (auth, sessions, LiveShare)
3. ⏳ Add video upload tests
4. ⏳ Add payment tests (Paystack mocking)
5. ⏳ Add age restriction tests
6. ⏳ Add CI/CD GitHub Actions workflow

**Status:** E2E Testing Foundation Complete ✅  
**Next:** Implement pending test cases from QA_PORTFOLIO_MASTER_PLAN.md
