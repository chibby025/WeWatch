# WeWatch E2E Testing - Quick Start Guide

## 🚀 Setup (5 minutes)

### 1. Install Playwright

```bash
cd ~/WeWatch/frontend
npm install -D @playwright/test
npx playwright install
```

### 2. Verify Installation

```bash
npx playwright --version
```

Expected: `Version 1.48.0` or higher

---

## 🎯 Running Tests

### Quick Test (30 seconds)

```bash
cd ~/WeWatch/frontend

# Ensure backend is running on http://localhost:8080
# Ensure frontend is running on http://localhost:5173

# Run all tests
npm run test
```

### Run with Visual UI (Recommended)

```bash
npm run test:ui
```

This opens an interactive UI where you can:
- See all test files
- Run individual tests
- Watch tests execute in real-time
- Debug failures

### Run in Headed Mode (See Browser)

```bash
npm run test:headed
```

### Debug a Specific Test

```bash
npm run test:debug tests/e2e/auth/login.spec.js
```

---

## 📋 Prerequisites

### Backend Must Be Running

```bash
cd ~/WeWatch/backend
go run cmd/server/main.go
```

Verify: `curl http://localhost:8080/api/health`

### Frontend Must Be Running

```bash
cd ~/WeWatch/frontend
npm run dev
```

Verify: Open `http://localhost:5173` in browser

### Test Users Must Exist

**Option 1: Manual Registration**

1. Go to `http://localhost:5173/register`
2. Register user:
   - Email: `testhost1@example.com`
   - Username: `testhost1`
   - Password: `Test1234!`
   - Date of Birth: `1990-01-01`
3. Logout
4. Register second user:
   - Email: `testviewer1@example.com`
   - Username: `testviewer1`
   - Password: `Test1234!`
   - Date of Birth: `1995-05-15`

**Option 2: SQL Insert** (if seeder doesn't exist)

```sql
-- Connect to database
psql -h localhost -p 5432 -U postgres -d wewatch_db

-- Insert test users (password: Test1234! hashed)
INSERT INTO users (email, username, password_hash, date_of_birth, created_at)
VALUES
('testhost1@example.com', 'testhost1', '$2a$10$...', '1990-01-01', NOW()),
('testviewer1@example.com', 'testviewer1', '$2a$10$...', '1995-05-15', NOW());
```

---

## ✅ Test Coverage

### Implemented (13 tests)

✅ **Authentication**
- Login with valid credentials
- Login with invalid password
- Logout
- Redirect to login (protected routes)

✅ **Session Management**
- Create free instant watch
- Create paid session with ticket
- Create lecture hall
- End session
- Search sessions

✅ **Real-time Features**
- WebSocket connection
- Chat message broadcast
- Reconnection after disconnect

✅ **LiveShare**
- Start LiveShare camera mode
- Enable lower third graphic
- Enable ticker
- Start break mode
- End LiveShare

### Pending (10 hours of work)

⏳ **Upload Tests** (2 hours)
- Video upload (small file)
- Network-aware compression
- Invalid file rejection

⏳ **Payment Tests** (3 hours)
- Initialize payment
- Successful payment (mock Paystack)
- Failed payment handling

⏳ **Age Restriction** (1 hour)
- Under 13 blocked
- 18+ content blocks 17-year-olds

⏳ **Social Features** (2 hours)
- Send friend request
- Lobby chat

⏳ **3D Cinema** (1 hour)
- Seat selection
- Spatial audio

⏳ **Filters** (1 hour)
- Content rating filter
- Search functionality

---

## 🐛 Troubleshooting

### "Page not found" errors

**Cause:** Frontend not running

**Fix:**
```bash
cd ~/WeWatch/frontend
npm run dev
```

### "Invalid credentials" errors

**Cause:** Test users don't exist

**Fix:** Register test users manually (see Prerequisites)

### "WebSocket connection failed"

**Cause:** Backend not running or WebSocket endpoint issue

**Fix:**
```bash
# Verify backend is running
curl http://localhost:8080/api/health

# Check WebSocket URL in browser console
```

### Flaky tests (pass sometimes, fail sometimes)

**Cause:** Timing issues, network latency

**Fix:**
1. Increase timeouts in test files
2. Use `await page.waitForTimeout(1000)` before critical actions
3. Use `await expect(...).toBeVisible({ timeout: 10000 })`

### Playwright browsers not installed

**Cause:** Browsers not downloaded

**Fix:**
```bash
npx playwright install
```

---

## 📊 Viewing Reports

### HTML Report

After tests complete:

```bash
npm run test:report
```

This opens a beautiful HTML report with:
- Test results (pass/fail)
- Screenshots of failures
- Video recordings of failed tests
- Execution timeline

### JUnit XML (for CI/CD)

Located at: `test-results/junit.xml`

---

## 🔄 CI/CD (GitHub Actions)

### Activate Workflow

The E2E testing workflow is already created at:
`.github/workflows/e2e-tests.yml`

It runs automatically on:
- Push to `main` or `dev` branches
- Pull requests

### View Results

1. Go to your GitHub repo
2. Click "Actions" tab
3. See test runs and reports

### Disable Workflow

If you want to disable:

```yaml
# In .github/workflows/e2e-tests.yml
# Comment out the 'on:' triggers or delete the file
```

---

## 📚 Next Steps

### Immediate (Today)

1. ✅ Run `npm run test:ui` to see tests in action
2. ✅ Verify all 13 tests pass on your machine
3. ✅ Read `frontend/tests/README.md` for detailed docs

### This Week

4. Implement upload tests (TC-UPLOAD-001, TC-UPLOAD-003)
5. Implement payment tests (mock Paystack)
6. Implement age restriction tests

### Next Week

7. Increase test coverage to 25+ tests
8. Add performance tests (K6 load testing)
9. Add visual regression tests (screenshot comparison)

---

## 🎓 Learning Resources

- [Playwright Docs](https://playwright.dev)
- [QA_PORTFOLIO_MASTER_PLAN.md](../../QA_PORTFOLIO_MASTER_PLAN.md)
- [TESTING_STRATEGY.md](../../tests/TESTING_STRATEGY.md)
- [LIVESHARE_REFINEMENT_PLAN.md](../../documentation/LIVESHARE_REFINEMENT_PLAN.md)

---

**Status:** E2E Testing Framework Complete ✅  
**Next:** Run tests and implement pending test cases  
**Est. Time to Full Coverage:** 10-15 hours
