# GitHub Actions CI/CD - Complete Guide

**Goal**: Automatically run tests every time you push code to GitHub  
**Why**: Catch bugs before they reach production  
**Time**: 30-45 minutes to set up

---

## 📚 Part 1: Understanding CI/CD

### What is CI/CD?

**CI = Continuous Integration**  
**CD = Continuous Deployment/Delivery**

**In plain English:**
- You push code to GitHub
- GitHub automatically tests your code
- If tests pass, GitHub automatically deploys to production

**Like a robot assistant:**
- You: Write code, push to GitHub
- Robot: Test code, find bugs, deploy if safe
- Result: No human errors, faster releases

---

### Real-World Example (Without CI/CD)

**Friday 5 PM:**
1. You: Change authentication code
2. You: Forget to run tests
3. You: Push to production
4. You: Go home for weekend

**Saturday 2 AM:**
5. User: Tries to login
6. App: Crashes (your change broke something)
7. You: Get angry email from boss
8. You: Fix bug remotely from home

**Total damage:** Angry users, lost revenue, ruined weekend

---

### Same Scenario (With CI/CD)

**Friday 5 PM:**
1. You: Change authentication code
2. You: Push to GitHub
3. GitHub Actions: Automatically runs tests
4. GitHub Actions: Tests FAIL (you broke auth)
5. GitHub: Sends notification "❌ Build failed"
6. You: Fix bug BEFORE pushing to production
7. You: Push fixed code
8. GitHub Actions: Tests PASS ✅
9. GitHub: Auto-deploys to production
10. You: Go home, sleep peacefully

**Total damage:** Zero. Bug caught before users saw it.

---

### Why Automation Matters

**Human testing (manual):**
- Remember to run tests? ❌ (you forget)
- Run ALL tests? ❌ (too slow, you skip some)
- Test on multiple OS? ❌ (too hard)
- Test every commit? ❌ (too time-consuming)

**Automated testing (CI/CD):**
- Remember to run tests? ✅ (automatic)
- Run ALL tests? ✅ (robots don't get bored)
- Test on multiple OS? ✅ (GitHub provides Windows/Mac/Linux)
- Test every commit? ✅ (happens in background)

---

## 📦 Part 2: Understanding GitHub Actions

### What is GitHub Actions?

**GitHub Actions** = GitHub's built-in CI/CD service

**Like hiring a robot developer:**
- Lives on GitHub's servers (not your computer)
- Watches your repository 24/7
- Runs tasks when you push code
- Free for public repos (2,000 minutes/month for private)

---

### How GitHub Actions Works

#### 1. You create workflow file (recipe for robot)

**File:** `.github/workflows/backend-tests.yml`

```yaml
name: Backend Tests

on:
  push:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Run tests
        run: go test ./...
```

**Translation:**
- "Hey GitHub, when I push to main branch"
- "Please run these steps on Ubuntu machine"
- "Download my code and run tests"

---

#### 2. You push code

```bash
git push origin main
```

---

#### 3. GitHub Actions activates

**What happens (in GitHub's datacenter):**
1. GitHub: "New push detected on main branch!"
2. GitHub: Creates fresh Ubuntu virtual machine
3. GitHub: Downloads your code into VM
4. GitHub: Runs your tests
5. GitHub: Reports results (pass/fail)
6. GitHub: Deletes VM (cleanup)

**Time:** 1-5 minutes (depending on test complexity)

---

### GitHub Actions Concepts

#### 1. **Workflow** = Complete automation recipe

Example: "Backend Tests" workflow, "Deploy to Production" workflow

**File location:** `.github/workflows/anything.yml`

**Trigger:** When to run (push, pull request, schedule, manual)

---

#### 2. **Job** = Major step in workflow

Example: "test" job, "build" job, "deploy" job

**Runs on:** Ubuntu/Windows/Mac virtual machine

**Can run in parallel:**
```yaml
jobs:
  backend-tests:   # Job 1 runs simultaneously
  frontend-tests:  # Job 2 runs simultaneously
  deploy:          # Job 3 waits for 1 and 2 to finish
    needs: [backend-tests, frontend-tests]
```

---

#### 3. **Step** = Individual command in job

Example: Install Go, Run tests, Upload results

**Types:**
- `run:` - Execute shell command
- `uses:` - Use pre-built action (like app from store)

---

#### 4. **Action** = Reusable component

**Pre-built actions (from GitHub Marketplace):**
- `actions/checkout@v3` - Download your code
- `actions/setup-go@v4` - Install Go
- `actions/upload-artifact@v3` - Save test results

**Like npm packages, but for CI/CD.**

---

### Visual Flow

```
┌─────────────────────────────────────────────────┐
│ Developer pushes code to GitHub                 │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│ GitHub Actions Workflow Triggered               │
│                                                  │
│  Job 1: Backend Tests (Ubuntu VM)               │
│  ┌──────────────────────────────────────────┐  │
│  │ Step 1: Checkout code                    │  │
│  │ Step 2: Setup Go 1.24                    │  │
│  │ Step 3: Start PostgreSQL                 │  │
│  │ Step 4: Run tests                        │  │
│  │   └─> go test ./tests/...                │  │
│  │ Step 5: Generate coverage                │  │
│  └──────────────────────────────────────────┘  │
│                                                  │
│  Job 2: Frontend Tests (Ubuntu VM)              │
│  ┌──────────────────────────────────────────┐  │
│  │ Step 1: Checkout code                    │  │
│  │ Step 2: Setup Node 20                    │  │
│  │ Step 3: npm install                      │  │
│  │ Step 4: npm test                         │  │
│  └──────────────────────────────────────────┘  │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│ Results Posted to GitHub                        │
│ ✅ All checks passed - Safe to merge            │
│ or                                              │
│ ❌ Tests failed - Do not merge                  │
└─────────────────────────────────────────────────┘
```

---

## 🔧 Part 3: Your Existing Workflow (Explained)

You already have `.github/workflows/backend-tests.yml`. Let me explain every line:

### Line-by-Line Breakdown

```yaml
name: Backend Tests
```
**Translation:** Workflow name shown on GitHub Actions page.

**Appears here:**
- GitHub repo → Actions tab → "Backend Tests" (in sidebar)
- Pull request checks → "Backend Tests" (passing/failing)

---

```yaml
on:
  push:
    branches: [ main, develop ]
    paths:
      - 'backend/**'
      - 'tests/backend/**'
      - '.github/workflows/backend-tests.yml'
```
**Translation:** When to run this workflow.

**Breaking down:**
- `push:` - Trigger on git push
- `branches: [ main, develop ]` - Only main and develop branches
- `paths:` - Only if these files changed

**Smart optimization:**
- Change frontend code → Don't run backend tests (saves time)
- Change backend code → Run backend tests ✅

**Example scenarios:**
```bash
# Scenario 1: Change frontend
git push  # Changes: frontend/src/App.jsx
# → Backend tests SKIPPED (no backend files changed)

# Scenario 2: Change backend
git push  # Changes: backend/handlers/auth.go
# → Backend tests RUN (backend/** path matched)

# Scenario 3: Change both
git push  # Changes: backend/handlers/auth.go, frontend/src/App.jsx
# → Backend tests RUN (backend/** matched, frontend ignored)
```

---

```yaml
pull_request:
  branches: [ main, develop ]
  paths:
    - 'backend/**'
    - 'tests/backend/**'
```
**Translation:** Also run on pull requests to main/develop.

**Why separate trigger?**
- `push:` - Your commits to main/develop
- `pull_request:` - Someone else's pull request

**Real workflow:**
1. You create feature branch: `feature/google-oauth`
2. You push commits to that branch (tests DON'T run yet)
3. You create pull request: `feature/google-oauth` → `main`
4. GitHub Actions runs tests on PR
5. If tests pass → Safe to merge ✅
6. If tests fail → Review needed ❌

---

```yaml
jobs:
  test:
    name: Run Backend Tests
    runs-on: ubuntu-latest
```
**Translation:** Create job named "test" on fresh Ubuntu VM.

**runs-on options:**
- `ubuntu-latest` - Ubuntu 22.04 (most common, fast)
- `ubuntu-20.04` - Older Ubuntu (if you need specific version)
- `windows-latest` - Windows Server
- `macos-latest` - macOS (slowest, use only if testing Mac-specific code)

---

```yaml
services:
  postgres:
    image: postgres:15
    env:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: testpass
      POSTGRES_DB: wewatch_test
```
**Translation:** Start PostgreSQL container before running tests.

**This is Docker inside GitHub Actions!**

**Why?** Your tests need database. GitHub provides PostgreSQL as "service container".

**How it works:**
1. GitHub starts Ubuntu VM
2. GitHub starts PostgreSQL container inside VM
3. Your tests connect to PostgreSQL
4. Tests finish
5. GitHub destroys everything (VM + container)

**Service containers = Test dependencies**

Common services:
- `postgres` - Database for backend tests
- `redis` - Cache for testing
- `elasticsearch` - Search for testing

---

```yaml
options: >-
  --health-cmd pg_isready
  --health-interval 10s
  --health-timeout 5s
  --health-retries 5
```
**Translation:** Wait for PostgreSQL to be ready before running tests.

**Why?**
- PostgreSQL container starts (1 second)
- Tests start immediately → **Connection refused** (PostgreSQL not ready yet)
- Tests fail ❌

**With healthcheck:**
- PostgreSQL starts (1 second)
- Healthcheck waits (2-3 seconds)
- Tests start after PostgreSQL ready ✅

**Same concept as docker-compose healthcheck!**

---

```yaml
ports:
  - 5433:5432
```
**Translation:** Expose PostgreSQL on port 5433 (not 5432).

**Why 5433?**  
GitHub Actions VM might have something on 5432. Use different port to avoid conflicts.

**Your tests connect to:** `localhost:5433` (not 5432)

---

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v4
```
**Translation:** Download your repository code into VM.

**Without this step:**
- VM has no code
- Tests can't run

**What `actions/checkout@v4` does:**
```bash
git clone https://github.com/yourname/wewatch.git
cd wewatch
git checkout <your-commit-sha>
```

**Pre-built action from GitHub:** https://github.com/actions/checkout

---

```yaml
- name: Set up Go
  uses: actions/setup-go@v5
  with:
    go-version: '1.24'
    cache: true
    cache-dependency-path: backend/go.sum
```
**Translation:** Install Go 1.24 on VM.

**What `actions/setup-go@v5` does:**
1. Download Go 1.24
2. Install on VM
3. Add to PATH
4. Cache go modules (for faster subsequent runs)

**cache: true** = Speed optimization
- First run: Downloads all dependencies (slow)
- Second run: Uses cached dependencies (fast)

**cache-dependency-path:** Which file to use as cache key
- If `go.sum` changes → Re-download dependencies
- If unchanged → Use cache

---

```yaml
- name: Install dependencies
  working-directory: backend
  run: go mod download
```
**Translation:** Download Go dependencies listed in go.mod.

**working-directory:** Like `cd backend` before running command

**Equivalent to:**
```bash
cd backend
go mod download
```

---

```yaml
- name: Run migrations
  working-directory: backend
  env:
    DATABASE_URL: postgres://postgres:testpass@localhost:5433/wewatch_test?sslmode=disable
  run: |
    go run cmd/migrate/main.go up
```
**Translation:** Run database migrations before tests.

**Why?**  
Fresh PostgreSQL has empty database. Tests expect tables to exist.

**env:** Set environment variable ONLY for this step

**run: |** = Multi-line command

---

```yaml
- name: Run tests with coverage
  working-directory: backend
  env:
    DATABASE_URL: postgres://postgres:testpass@localhost:5433/wewatch_test?sslmode=disable
  run: |
    go test ./tests/backend/... -v -coverprofile=coverage.out -covermode=atomic
```
**Translation:** Run all backend tests and generate coverage report.

**Breaking down flags:**
- `./tests/backend/...` - Run tests in this folder (recursively)
- `-v` - Verbose (show test names)
- `-coverprofile=coverage.out` - Save coverage data to file
- `-covermode=atomic` - Accurate coverage (counts each line)

**Output example:**
```
=== RUN   TestHashPassword
--- PASS: TestHashPassword (0.21s)
=== RUN   TestVerifyPassword
--- PASS: TestVerifyPassword (0.10s)
=== RUN   TestGenerateJWT
--- PASS: TestGenerateJWT (0.01s)
...
PASS
coverage: 45.2% of statements
```

---

```yaml
- name: Generate coverage report
  working-directory: backend
  run: |
    go tool cover -func=coverage.out
```
**Translation:** Display coverage report in terminal.

**Output:**
```
backend/internal/utils/password.go:15:   HashPassword      100.0%
backend/internal/utils/password.go:25:   VerifyPassword    100.0%
backend/internal/utils/jwt.go:12:        GenerateJWT        87.5%
backend/internal/handlers/auth.go:45:    RegisterHandler    45.2%
...
total:                                    (statements)       45.2%
```

**Shows:**
- Which functions tested
- Coverage per function
- Total coverage

---

```yaml
- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v3
  with:
    file: ./backend/coverage.out
    flags: backend
    name: backend-coverage
```
**Translation:** Upload coverage report to Codecov.io (optional service).

**What is Codecov?**
- Free service (for public repos)
- Shows coverage trends over time
- Adds badge to README: ![Coverage](https://codecov.io/gh/user/repo/badge.svg)
- Comments on pull requests with coverage changes

**Example PR comment:**
```
Coverage: 45.2% (+2.1%) 📈
Files changed: 3
+ auth.go: 45% → 67% (+22%) 🎉
+ jwt.go: 87% → 85% (-2%) ⚠️
```

**Optional:** You can remove this step if you don't want Codecov.

---

## 🎯 Part 4: Practical Exercise

Let's test your existing workflow!

### Step 1: Check if Workflow Exists

```bash
cd ~/WeWatch
ls .github/workflows/
```

**Expected:** `backend-tests.yml`

---

### Step 2: Make a Small Change

Let's trigger the workflow by changing a backend file:

```bash
# Add comment to any Go file
echo "// Test comment" >> backend/internal/utils/password.go
```

---

### Step 3: Commit and Push

```bash
git add backend/internal/utils/password.go
git commit -m "Test: Trigger GitHub Actions workflow"
git push origin main
```

---

### Step 4: Watch Workflow Run

1. Go to: https://github.com/YOUR_USERNAME/WeWatch/actions
2. See "Backend Tests" workflow running
3. Click on it to see live logs
4. Watch each step execute (like watching terminal in real-time)

**Timeline:**
- 0:00 - Workflow triggered
- 0:05 - VM created
- 0:10 - Code checked out
- 0:15 - Go installed
- 0:20 - PostgreSQL started
- 0:25 - Dependencies downloaded
- 0:30 - Tests running
- 0:45 - Tests finished
- 0:50 - Results uploaded

**Total time:** ~1 minute

---

### Step 5: Check Results

**If tests pass:**
- Green checkmark ✅ on commit
- Badge shows "passing"
- Safe to deploy

**If tests fail:**
- Red X ❌ on commit
- Email notification sent
- Review logs to find failure

---

## 🚀 Part 5: Adding Frontend Tests

Let's create workflow for frontend tests too:

```yaml
# .github/workflows/frontend-tests.yml
name: Frontend Tests

on:
  push:
    branches: [ main, develop ]
    paths:
      - 'frontend/**'
      - '.github/workflows/frontend-tests.yml'
  pull_request:
    branches: [ main, develop ]
    paths:
      - 'frontend/**'

jobs:
  test:
    name: Run Frontend Tests
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      
      - name: Install dependencies
        working-directory: frontend
        run: npm ci
      
      - name: Run tests
        working-directory: frontend
        run: npm test -- --passWithNoTests
      
      - name: Build check
        working-directory: frontend
        run: npm run build
```

**What this does:**
1. Install Node 20
2. Install npm dependencies
3. Run tests (if you have any)
4. Build production bundle (catches build errors)

**--passWithNoTests:** Don't fail if no tests exist yet (you'll add tests later)

---

## 📊 Part 6: Adding Status Badges to README

Make your portfolio look professional!

**Add to README.md:**

```markdown
# WeWatch

![Backend Tests](https://github.com/YOUR_USERNAME/WeWatch/workflows/Backend%20Tests/badge.svg)
![Frontend Tests](https://github.com/YOUR_USERNAME/WeWatch/workflows/Frontend%20Tests/badge.svg)
![Coverage](https://codecov.io/gh/YOUR_USERNAME/WeWatch/badge.svg)

Social streaming platform with 3D cinema...
```

**Result:**  
![Backend Tests](https://img.shields.io/badge/tests-passing-brightgreen)
![Frontend Tests](https://img.shields.io/badge/tests-passing-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-45%25-yellow)

**Why this matters:**
Recruiters see your README → See green badges → "This developer knows professional practices" → Interview invitation

---

## 🎓 Summary: What You Learned

### Docker
✅ What containers are (isolated environments)  
✅ How Dockerfiles work (build instructions)  
✅ Multi-stage builds (small production images)  
✅ Docker Compose (orchestrate multiple containers)  
✅ Networks and volumes (persistence and communication)

### GitHub Actions
✅ What CI/CD is (automated testing/deployment)  
✅ How workflows work (YAML configuration)  
✅ Jobs and steps (execution units)  
✅ Service containers (test dependencies)  
✅ Status badges (portfolio presentation)

### DevOps Mindset
✅ Automation > Manual work  
✅ Catch bugs early (before production)  
✅ Consistency (same environment everywhere)  
✅ Reproducibility (anyone can run your app)

---

## 🏆 Portfolio Impact

**Before DevOps:**
- "I built a web app"
- Manual testing
- Runs on my computer

**After DevOps:**
- "I built a production-ready platform with automated CI/CD"
- Automated testing on every commit
- Containerized deployment
- Runs anywhere (Docker)

**Salary difference:** $20k-$40k annually

---

## Next Steps

1. ✅ Understand Docker (you did this!)
2. ✅ Understand GitHub Actions (you did this!)
3. ⏳ Test docker-compose locally
4. ⏳ Add frontend workflow
5. ⏳ Add status badges to README
6. ⏳ Push to GitHub (portfolio complete!)

**Want to proceed with hands-on implementation?**
