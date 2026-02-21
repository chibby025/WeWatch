# Quiz System Technical Specification

## 📋 Document Information

**Feature:** Interactive Quiz System for Lecture Hall  
**Version:** 1.0  
**Date:** December 30, 2025  
**Status:** 🚧 Implementation in Progress  
**Priority:** High  

---

## 🎯 Overview

The Quiz System enables hosts (teachers) to create and publish interactive quizzes during lecture hall sessions. Students receive real-time notifications, answer questions within optional time limits, and receive instant feedback with auto-graded scores. All quiz data and scores persist in the database for later review.

---

## 🏗️ Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     QUIZ SYSTEM ARCHITECTURE                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │  Frontend (React) │ ◄─WS──► │ Backend (Go)    │         │
│  │                  │         │                  │         │
│  │ • Quiz Creation  │         │ • Quiz Storage  │         │
│  │ • Quiz Taking    │         │ • Auto-Grading  │         │
│  │ • Results View   │         │ • WebSocket Hub │         │
│  │ • History Tab    │         │ • Validation    │         │
│  └──────────────────┘         └─────────┬────────┘         │
│                                          │                   │
│                                   ┌──────▼────────┐         │
│                                   │   PostgreSQL  │         │
│                                   │               │         │
│                                   │ • quizzes     │         │
│                                   │ • quiz_resp   │         │
│                                   └───────────────┘         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 💾 Database Schema

### Table: `quizzes`

```sql
CREATE TABLE quizzes (
  id SERIAL PRIMARY KEY,
  room_id INT NOT NULL REFERENCES rooms(id),
  session_id INT NOT NULL REFERENCES watch_sessions(id),
  host_id INT NOT NULL REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft', -- draft | in_progress | completed
  timer_enabled BOOLEAN DEFAULT FALSE,
  timer_seconds INT DEFAULT NULL,
  questions JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  published_at TIMESTAMP DEFAULT NULL,
  ended_at TIMESTAMP DEFAULT NULL,
  
  INDEX idx_room_session (room_id, session_id),
  INDEX idx_status (status),
  INDEX idx_host (host_id)
);
```

### Table: `quiz_responses`

```sql
CREATE TABLE quiz_responses (
  id SERIAL PRIMARY KEY,
  quiz_id INT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id),
  answers JSONB NOT NULL,
  score INT NOT NULL,
  total_questions INT NOT NULL,
  submitted_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE (quiz_id, user_id), -- One attempt per user per quiz
  INDEX idx_quiz (quiz_id),
  INDEX idx_user (user_id)
);
```

### JSONB Structure Examples

#### `quizzes.questions` Format:

```json
{
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "question": "What is 2 + 2?",
      "options": ["3", "4", "5", "6"],
      "correct_answer": "B"
    },
    {
      "id": 2,
      "type": "text_input",
      "question": "What is the capital of France?",
      "correct_answer": "Paris"
    }
  ]
}
```

#### `quiz_responses.answers` Format:

```json
{
  "answers": [
    {
      "question_id": 1,
      "answer": "B",
      "is_correct": true,
      "time_taken": 12
    },
    {
      "question_id": 2,
      "answer": "paris",
      "is_correct": true,
      "time_taken": 8
    }
  ]
}
```

---

## 🔌 WebSocket API

### Message Types

#### 1. Quiz Creation (Host → Backend)

```json
{
  "type": "quiz_create",
  "data": {
    "room_id": 123,
    "session_id": 456,
    "name": "Math Quiz",
    "questions": [
      {
        "id": 1,
        "type": "multiple_choice",
        "question": "What is 2 + 2?",
        "options": ["3", "4", "5", "6"],
        "correct_answer": "B"
      }
    ],
    "timer_enabled": true,
    "timer_seconds": 300
  }
}
```

**Backend Response:**
```json
{
  "type": "quiz_created",
  "data": {
    "quiz_id": 789,
    "status": "draft"
  }
}
```

#### 2. Quiz Publishing (Host → Backend → All Students)

**Host sends:**
```json
{
  "type": "quiz_publish",
  "data": {
    "quiz_id": 789
  }
}
```

**Backend validates & broadcasts:**
```json
{
  "type": "quiz_published",
  "data": {
    "quiz_id": 789,
    "name": "Math Quiz",
    "total_questions": 5,
    "timer_enabled": true,
    "timer_seconds": 300,
    "published_at": "2025-12-30T10:30:00Z"
  }
}
```

**Effect:** All students' quiz buttons become active

#### 3. Quiz Request (Student → Backend)

```json
{
  "type": "quiz_request",
  "data": {
    "quiz_id": 789
  }
}
```

**Backend Response (questions without answers):**
```json
{
  "type": "quiz_data",
  "data": {
    "quiz_id": 789,
    "name": "Math Quiz",
    "timer_seconds": 300,
    "questions": [
      {
        "id": 1,
        "type": "multiple_choice",
        "question": "What is 2 + 2?",
        "options": ["3", "4", "5", "6"]
      },
      {
        "id": 2,
        "type": "text_input",
        "question": "What is the capital of France?"
      }
    ]
  }
}
```

#### 4. Answer Submission (Student → Backend)

```json
{
  "type": "quiz_submit",
  "data": {
    "quiz_id": 789,
    "answers": [
      {
        "question_id": 1,
        "answer": "B",
        "time_taken": 12
      },
      {
        "question_id": 2,
        "answer": "Paris",
        "time_taken": 8
      }
    ]
  }
}
```

**Backend grades & responds:**
```json
{
  "type": "quiz_results",
  "data": {
    "quiz_id": 789,
    "score": 5,
    "total": 5,
    "percentage": 100,
    "answers": [
      {
        "question_id": 1,
        "is_correct": true,
        "your_answer": "B"
      },
      {
        "question_id": 2,
        "is_correct": true,
        "your_answer": "Paris",
        "correct_answer": "Paris"
      }
    ]
  }
}
```

#### 5. Quiz Progress (Backend → Host Only)

**Sent every 5 seconds during active quiz:**
```json
{
  "type": "quiz_progress",
  "data": {
    "quiz_id": 789,
    "submitted_count": 8,
    "total_students": 12,
    "time_remaining": 180,
    "submissions": [
      {
        "user_id": 5,
        "username": "Alice",
        "submitted_at": "2025-12-30T10:32:15Z",
        "score": 4
      }
    ]
  }
}
```

#### 6. Quiz End (Host → Backend → All)

**Host sends:**
```json
{
  "type": "quiz_end",
  "data": {
    "quiz_id": 789
  }
}
```

**Backend broadcasts:**
```json
{
  "type": "quiz_ended",
  "data": {
    "quiz_id": 789,
    "total_submissions": 10,
    "average_score": 4.2,
    "ended_at": "2025-12-30T10:35:00Z"
  }
}
```

---

## 🎨 UI Components

### 1. Taskbar Button

**File:** `frontend/src/components/Taskbar.jsx`

**Location:** Between "Members" and "Settings" buttons

**Props:**
```javascript
{
  icon: '/icons/quiz.svg',
  label: 'Quiz',
  onClick: handleOpenQuiz,
  badge: hasActiveQuiz ? 1 : 0,
  isEnabled: true
}
```

**States:**
- **Host:** Always blue/active
- **Students:** 
  - Default: Gray (no active quiz)
  - Active quiz: Blue with notification badge

---

### 2. LeftSidebar Quiz Button

**File:** `frontend/src/components/cinema/ui/LeftSidebar.jsx`

**Location:** Upload tab, below drag-and-drop area

**Layout:**
```jsx
<div className="p-4 bg-[#D9D9D9]/10 rounded-xl mb-4">
  <button
    onClick={handleQuizClick}
    disabled={!isHost && !hasActiveQuiz}
    className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-colors ${
      isHost || hasActiveQuiz
        ? 'bg-[#444AF7]/25 hover:bg-[#444AF7]/30'
        : 'bg-gray-700/50 cursor-not-allowed opacity-50'
    }`}
  >
    📝 {isHost ? 'Manage Quizzes' : hasActiveQuiz ? 'Take Quiz' : 'No Active Quiz'}
  </button>
</div>
```

---

### 3. Quiz Management Modal (Host)

**File:** `frontend/src/components/cinema/modals/QuizManagementModal.jsx`

**Trigger:** Host clicks "Quiz" button

**Layout:**
```
╔════════════════════════════════════════╗
║  Quiz Management                    [X]║
╠════════════════════════════════════════╣
║                                        ║
║  [+ Create New Quiz]                   ║
║                                        ║
║  ┌──────────────────────────────────┐ ║
║  │ Quiz History                     │ ║
║  │ ────────────────────────────────│ ║
║  │ Name      │Status  │Avg │Actions│ ║
║  │ ────────────────────────────────│ ║
║  │ Math Quiz │Done    │8/10│View   │ ║
║  │ Science   │Draft   │ -  │Edit|Del│║
║  │ History   │Active  │7/10│End    │ ║
║  └──────────────────────────────────┘ ║
║                                        ║
║                          [Close]       ║
╚════════════════════════════════════════╝
```

**Features:**
- Create new quiz button
- Table of past/current quizzes
- Quick actions per quiz
- Status indicators (Draft/Active/Completed)

---

### 4. Make Quiz Modal (Host)

**File:** `frontend/src/components/cinema/modals/MakeQuizModal.jsx`

**Trigger:** Host clicks "Create New Quiz"

**Layout:**
```
╔════════════════════════════════════════╗
║  Create Quiz                        [X]║
╠════════════════════════════════════════╣
║                                        ║
║  Quiz Name: [____________________]     ║
║                                        ║
║  ⏱️ Timer: [✓] Enable  [____] minutes ║
║                                        ║
║  ────────────────────────────────────║
║                                        ║
║  Question 1                      [Del] ║
║  ┌────────────────────────────────┐   ║
║  │ Type: [▼ Multiple Choice    ]  │   ║
║  │                                │   ║
║  │ Question:                      │   ║
║  │ [__________________________]   │   ║
║  │                                │   ║
║  │ A: [______________________]    │   ║
║  │ B: [______________________]    │   ║
║  │ C: [______________________]    │   ║
║  │ D: [______________________]    │   ║
║  │                                │   ║
║  │ Correct: (•) A ( ) B ( ) C ( ) D│   ║
║  └────────────────────────────────┘   ║
║                                        ║
║  [+ Add Question]                      ║
║                                        ║
║  ────────────────────────────────────║
║                                        ║
║  [Save as Draft]      [Publish Quiz]  ║
╚════════════════════════════════════════╝
```

**Features:**
- Dynamic question type selector
- Add/remove questions
- Real-time validation
- Save draft or publish immediately

---

### 5. Take Quiz Modal (Student)

**File:** `frontend/src/components/cinema/modals/TakeQuizModal.jsx`

**Trigger:** Student clicks "Quiz" button when quiz active

**Layout:**
```
╔════════════════════════════════════════╗
║  Math Quiz                 🕐 4:23  [X]║
╠════════════════════════════════════════╣
║                                        ║
║  Question 1 of 5                       ║
║                                        ║
║  What is 2 + 2?                        ║
║                                        ║
║  ( ) A. 3                              ║
║  (•) B. 4    ← Selected                ║
║  ( ) C. 5                              ║
║  ( ) D. 6                              ║
║                                        ║
║  ────────────────────────────────────║
║                                        ║
║  Progress: ●●●○○  (3/5 answered)      ║
║                                        ║
║  [< Previous]  [Next >]  [Submit All] ║
║                                        ║
╚════════════════════════════════════════╝
```

**Features:**
- Timer countdown (if enabled)
- Question navigation
- Progress indicator
- Unsaved answers warning
- Auto-submit on timer expiry

---

### 6. Quiz Results Modal (Student)

**File:** `frontend/src/components/cinema/modals/QuizResultsModal.jsx`

**Trigger:** After submitting quiz

**Layout:**
```
╔════════════════════════════════════════╗
║  Quiz Results                       [X]║
╠════════════════════════════════════════╣
║                                        ║
║       🎉 You scored 4 out of 5!       ║
║             Score: 80%                 ║
║                                        ║
║  ────────────────────────────────────║
║                                        ║
║  ✅ Question 1: Correct                ║
║     What is 2 + 2?                     ║
║     Your answer: B (4) ✓               ║
║                                        ║
║  ✅ Question 2: Correct                ║
║     Capital of France?                 ║
║     Your answer: Paris ✓               ║
║                                        ║
║  ❌ Question 3: Incorrect              ║
║     What is π?                         ║
║     Your answer: 3.14                  ║
║     Correct answer: 3.14159            ║
║                                        ║
║  ────────────────────────────────────║
║                                        ║
║  Time taken: 3:42 / 5:00              ║
║                                        ║
║                        [Close]         ║
╚════════════════════════════════════════╝
```

**Features:**
- Overall score display
- Per-question feedback
- Show correct answers for wrong questions
- Time taken statistics

---

### 7. Quiz History Tab (Lobby)

**File:** `frontend/src/components/cinema/ui/LeftSidebar.jsx` (Lobby version)

**Location:** New tab in lobby left sidebar

**Layout:**
```
╔════════════════════════════╗
║ Upload │ Quiz History      ║
╠════════════════════════════╣
║                            ║
║  Past Quizzes              ║
║  ──────────────────────── ║
║                            ║
║  📝 Math Quiz              ║
║  Dec 29, 2025              ║
║  Avg Score: 7.5/10         ║
║  Submissions: 12/15        ║
║  [View Details]            ║
║  ──────────────────────── ║
║                            ║
║  📝 Science Quiz           ║
║  Dec 28, 2025              ║
║  Avg Score: 8/10           ║
║  Submissions: 10/15        ║
║  [View Details]            ║
║                            ║
╚════════════════════════════╝
```

---

## 🔐 Security & Validation

### Backend Validation Checks

```go
// Quiz Creation
- User is host of the room ✓
- Quiz name is not empty ✓
- At least 1 question exists ✓
- All questions have correct answers ✓
- Timer value is valid (if enabled) ✓

// Quiz Publishing
- User is host ✓
- Quiz exists and is in draft status ✓
- Session is still active ✓

// Quiz Submission
- User is in the session ✓
- Quiz is published and active ✓
- User hasn't already submitted ✓
- All question IDs match quiz ✓

// Quiz Grading
- Answers are validated server-side ✓
- Case-insensitive text matching ✓
- Exact match for multiple choice ✓
```

### Rate Limiting

```go
// Prevent spam
- Quiz creation: 1 per minute per host
- Quiz submission: 1 per quiz per user
- Quiz progress updates: 1 per 5 seconds
```

---

## ⚡ Performance Optimizations

### 1. Database Queries
```sql
-- Use indexes for common queries
CREATE INDEX idx_quiz_status ON quizzes(status);
CREATE INDEX idx_quiz_session ON quizzes(session_id);
CREATE INDEX idx_response_quiz ON quiz_responses(quiz_id);
```

### 2. WebSocket Broadcasting
```go
// Only send progress updates to host
if user.ID == quiz.HostID {
    sendProgressUpdate(user, quizProgress)
}

// Batch notifications instead of per-user
broadcastToSession(sessionID, quizPublishedMessage)
```

### 3. Frontend Optimization
```javascript
// Debounce answer saving
const debouncedSaveAnswer = useMemo(
  () => debounce(saveAnswerToState, 500),
  []
);

// Lazy load quiz history
const { data: quizHistory } = useQuery(
  ['quizHistory', roomId],
  fetchQuizHistory,
  { enabled: isQuizHistoryTabOpen }
);
```

---

## 📊 Data Flow Diagrams

### Quiz Creation Flow

```
Host                    Frontend                Backend              Database
│                          │                       │                     │
├─ Click "Create Quiz"────►│                       │                     │
│                          ├─ Show Modal           │                     │
│                          │                       │                     │
├─ Fill form & click────►  │                       │                     │
│  "Publish Quiz"          │                       │                     │
│                          ├─ quiz_publish ────────►│                     │
│                          │                       ├─ Validate           │
│                          │                       ├─ Save ─────────────►│
│                          │                       │                     ├─ INSERT
│                          │                       │                     │
│                          │                       ├─ quiz_published ────┤
│                          │◄─ quiz_published ─────┤                     │
├─◄ Modal closes ──────────┤                       │                     │
│                          │                       │                     │
                           │                       │                     │
Students                   │                       │                     │
│                          │                       │                     │
├─◄ Button activates ──────┤◄─ quiz_published ─────┤                     │
```

### Quiz Taking Flow

```
Student                 Frontend                Backend              Database
│                          │                       │                     │
├─ Click "Quiz" ──────────►│                       │                     │
│                          ├─ quiz_request ────────►│                     │
│                          │                       ├─ Fetch ────────────►│
│                          │                       │                     ├─ SELECT
│                          │◄─ quiz_data ──────────┤◄────────────────────┤
│                          │   (no answers)        │                     │
├─◄ Show modal ────────────┤                       │                     │
│                          │                       │                     │
├─ Answer questions ──────►│                       │                     │
│                          ├─ Save to state        │                     │
│                          │                       │                     │
├─ Click "Submit" ────────►│                       │                     │
│                          ├─ quiz_submit ─────────►│                     │
│                          │                       ├─ Grade answers      │
│                          │                       ├─ Save ─────────────►│
│                          │                       │                     ├─ INSERT
│                          │◄─ quiz_results ───────┤◄────────────────────┤
├─◄ Show results ──────────┤                       │                     │
```

---

## 🧪 Testing Checklist

### Unit Tests

- [ ] Quiz validation (empty name, no questions, invalid timer)
- [ ] Answer grading (case-insensitive, exact match)
- [ ] Timer countdown logic
- [ ] Progress calculation

### Integration Tests

- [ ] Quiz creation → database save
- [ ] Quiz publishing → WebSocket broadcast
- [ ] Answer submission → grading → response save
- [ ] Quiz end → cleanup

### E2E Tests

- [ ] Host creates quiz → Students receive notification
- [ ] Student submits answers → Receives results
- [ ] Timer expires → Auto-submit
- [ ] Host views leaderboard
- [ ] Quiz history persists after session ends

---

## 📝 Implementation Phases

### Phase 1: Foundation (Days 1-3) ✅ Ready to Start
- [x] Database schema creation
- [ ] Backend WebSocket handlers
- [ ] Quiz model and validation
- [ ] API endpoints for CRUD operations

### Phase 2: Host Interface (Days 4-6)
- [ ] Quiz Management Modal
- [ ] Make Quiz Modal
- [ ] Question type components
- [ ] Draft save functionality

### Phase 3: Student Interface (Days 7-9)
- [ ] Take Quiz Modal
- [ ] Question rendering
- [ ] Answer submission
- [ ] Results display

### Phase 4: Polish & Features (Days 10-12)
- [ ] Quiz History tab
- [ ] Real-time progress monitoring
- [ ] Notifications and animations
- [ ] Error handling

---

## 🐛 Known Limitations & Future Enhancements

### MVP Limitations
- One quiz attempt per student (no retakes)
- Text grading is case-insensitive exact match only
- No partial credit for text answers
- No question randomization
- No image/media in questions

### Future Enhancements
- Quiz templates (reusable question banks)
- Image/video in questions
- Drag-and-drop/matching question types
- Partial credit scoring
- Question randomization
- Export quiz results as CSV
- Quiz analytics dashboard

---

## 📞 Support & Troubleshooting

### Common Issues

**Issue:** Quiz button not activating for students  
**Solution:** Verify WebSocket connection, check quiz status in database

**Issue:** Timer not syncing across users  
**Solution:** Use server-side timer, send periodic sync messages

**Issue:** Auto-grading fails for text answers  
**Solution:** Check case-insensitive comparison, trim whitespace

**Issue:** Quiz modal not closing after submission  
**Solution:** Verify state update after receiving quiz_results message

---

**Document Version:** 1.0  
**Status:** 🚧 Implementation Starting  
**Next Update:** After Phase 1 completion  
**Maintained By:** WeWatch Development Team
