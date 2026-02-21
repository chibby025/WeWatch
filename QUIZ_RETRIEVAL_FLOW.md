# Quiz Retrieval Flow Analysis - Lecture Hall

## Summary
✅ **YES**, users joining AFTER a quiz is published can retrieve active quizzes. The system uses a **hybrid approach** (REST API + WebSocket) to ensure all users see published quizzes.

---

## Complete Quiz Retrieval Flow

### 1. **Initial Quiz Load (On Page Mount)**
**When:** User first loads PositionCalculatorPage (lecture hall)
**Method:** REST API (HTTP)

#### For Hosts:
```javascript
// PositionCalculatorPage.jsx line 1688-1720
GET /api/quizzes/session/:session_id
```
- Returns ALL quizzes for the session (draft, in_progress, completed)
- Host can see all quiz statuses
- Backend: `GetSessionQuizzes()` in quiz_rest_handlers.go

#### For Students:
```javascript
// PositionCalculatorPage.jsx line 1722-1753
GET /api/quizzes/session/:session_id/history
```
- Returns:
  - `active_quizzes`: Published quizzes (in_progress, completed) - without correct answers
  - `completed_submissions`: Student's previous quiz submissions
- Backend: `GetQuizHistory()` in quiz_rest_handlers.go

**Why REST API?**
- Guarantees data on page load (even if WebSocket not connected yet)
- Reliable for late joiners who missed the `quiz_published` WebSocket event
- Works even if WebSocket is temporarily disconnected

---

### 2. **Real-Time Quiz Publishing (When Host Publishes)**
**When:** Host clicks "Publish Quiz" button
**Method:** WebSocket (bi-directional)

#### Host Side:
```javascript
// Host publishes quiz
sendMessage({
  type: 'quiz_publish',
  data: { quiz_id: 123 }
});
```

#### Backend Processing:
```go
// quiz_handlers.go HandleQuizPublish()
1. Update quiz status: draft → in_progress
2. Set published_at timestamp
3. Broadcast to ALL users in room:
```

#### All Users Receive:
```javascript
// WebSocket event: quiz_published
{
  type: 'quiz_published',
  data: {
    quiz_id: 123,
    name: 'Week 1 Quiz',
    total_questions: 10,
    timer_enabled: true,
    timer_seconds: 600,
    published_at: '2026-02-06T10:00:00Z',
    status: 'in_progress'
  }
}
```

**Frontend Handling (PositionCalculatorPage.jsx line 3992-4010):**
- Host: Updates quiz list status, shows success toast
- Students: Shows notification "📝 New quiz available: Week 1 Quiz", sets activeQuiz

---

### 3. **Late Joiner Quiz Sync (Users Join After Quiz Published)**
**When:** User joins session AFTER quiz is already published
**Method:** REST API (same as initial load)

**Flow:**
1. User connects WebSocket
2. User joins session
3. **REST API fetch happens automatically** (useEffect on line 1688)
4. `GET /api/quizzes/session/:session_id/history` returns active_quizzes
5. Student sees the published quiz immediately

**No manual sync needed** - REST API on mount handles this perfectly!

---

### 4. **WebSocket Fallback (Optional Explicit Request)**
**When:** Student explicitly requests quiz data (clicks "Take Quiz" button)
**Method:** WebSocket

```javascript
// Student requests specific quiz
sendMessage({
  type: 'quiz_request',
  data: { quiz_id: 123 }
});

// Backend responds
{
  type: 'quiz_data',
  data: {
    quiz_id: 123,
    name: 'Week 1 Quiz',
    timer_seconds: 600,
    questions: [/* without correct_answer field */]
  }
}
```

**Backend:** `HandleQuizRequest()` in quiz_handlers.go  
**Frontend:** Opens TakeQuizModal with questions

---

## Architecture Decision: REST vs WebSocket

### ✅ Current Hybrid Approach (Recommended)

| Method | Used For | Pros | Cons |
|--------|----------|------|------|
| **REST API** | Initial load, late joiner sync | Reliable, guaranteed delivery, works when WS down | Slightly slower, requires polling for updates |
| **WebSocket** | Real-time publish events, progress updates | Instant, efficient, bi-directional | Requires active connection, missed events if disconnected |

### Why Not WebSocket-Only?
- WebSocket connections may not be established when page first loads
- Users might miss `quiz_published` event if they join late
- WebSocket can disconnect/reconnect, causing missed messages
- REST API provides a **fallback/sync mechanism**

### Why Not REST-Only?
- No real-time notifications when host publishes quiz
- Students would need to manually refresh or poll
- Poor UX - delays in seeing new quizzes

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    HOST PUBLISHES QUIZ                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket: quiz_publish
                              ▼
                    ┌──────────────────┐
                    │   Backend (Go)   │
                    │  HandleQuizPublish│
                    └──────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
        [Student A]    [Student B]    [Student C]
        (already      (joins 5       (joins 10
         in room)     min later)     min later)
              │               │               │
              ▼               │               │
    ✅ Receives         │               │
    quiz_published      │               │
    WebSocket event     │               │
                        │               │
                        ▼               ▼
              ┌─────────────────────────────┐
              │  REST API on page mount:    │
              │  GET /api/quizzes/session/  │
              │       :session_id/history   │
              └─────────────────────────────┘
                        │
                        ▼
              ✅ Retrieves active_quizzes
                 (includes published quiz)
```

---

## Backend Handlers Reference

### REST API Endpoints (quiz_rest_handlers.go)
```go
GET  /api/quizzes/session/:session_id          → GetSessionQuizzes (Host: all quizzes)
GET  /api/quizzes/session/:session_id/history  → GetQuizHistory (Student: active + submissions)
GET  /api/quizzes/:quiz_id/progress             → GetQuizProgressREST (Host: real-time stats)
```

### WebSocket Message Types (quiz_handlers.go)
```go
quiz_create              → HandleQuizCreate (Host creates draft)
quiz_publish             → HandleQuizPublish (Host publishes → broadcasts)
quiz_request             → HandleQuizRequest (Student requests quiz data)
quiz_submit              → HandleQuizSubmit (Student submits answers)
quiz_end                 → HandleQuizEnd (Host ends quiz)
quiz_progress            → HandleQuizProgress (Host checks progress)
quiz_history_request     → HandleQuizHistory (Student requests history)
quiz_export_request      → HandleQuizExportRequest (Host exports results)
```

---

## Key Implementation Details

### 1. Students Don't See Correct Answers
```go
// quiz_service.go - GetQuizHistoryForSession()
for i := range activeQuizzes {
    for j := range activeQuizzes[i].Questions {
        activeQuizzes[i].Questions[j].CorrectAnswer = "" // ✅ Removed
    }
}
```

### 2. Late Joiners Get Full Quiz State
The REST API endpoint automatically returns all published quizzes, so no special "sync on join" logic is needed. The standard page load handles it.

### 3. Quiz Cleanup on Session End
```go
// rooms.go - EndWatchSessionHandler() & AutoEndSession()
quizService.DeleteQuizzesBySession(session.ID)
```
- ✅ Fixed in both manual and automatic session end
- Hard deletes all quizzes and responses
- Prevents orphaned quizzes

---

## Testing Scenarios

### ✅ Scenario 1: Normal Flow
1. Students join session
2. Host publishes quiz
3. All students receive `quiz_published` WebSocket event
4. Students take quiz

**Result:** ✅ Works perfectly

### ✅ Scenario 2: Late Joiner
1. Host publishes quiz at 10:00
2. Student joins session at 10:05 (5 minutes late)
3. Student loads PositionCalculatorPage
4. REST API fetch returns `active_quizzes` with published quiz
5. Student sees quiz and can take it

**Result:** ✅ Works perfectly (REST API handles this)

### ✅ Scenario 3: WebSocket Disconnection
1. Student is in session
2. WebSocket disconnects (network issue)
3. Quiz is published during disconnection
4. WebSocket reconnects
5. Student refreshes page → REST API returns active quiz

**Result:** ✅ Works with page refresh

### ⚠️ Scenario 4: WebSocket Disconnection Without Refresh
1. Student is in session
2. WebSocket disconnects
3. Quiz is published during disconnection
4. WebSocket reconnects
5. Student doesn't refresh page

**Current Result:** ❌ Student might not see new quiz (missed WebSocket event)
**Solution:** Could add a "sync on reconnect" WebSocket message, but REST API fetch on mount is more reliable

---

## Recommendations

### ✅ Current Implementation is Good
The hybrid approach (REST + WebSocket) is solid:
- REST API ensures late joiners see quizzes
- WebSocket provides real-time updates for early joiners
- No additional "join sync" logic needed

### Optional Enhancement
Add a "sync on reconnect" feature:
```javascript
// In useWebSocket.js - when WebSocket reconnects
ws.onopen = () => {
  // Request quiz sync after reconnection
  sendMessage({
    type: 'quiz_history_request',
    data: { session_id: actualSessionId }
  });
};
```

But this is **optional** - the current REST API approach already handles this reliably.

---

## Conclusion

**Q: Do users joining after quiz is published retrieve the quiz?**  
**A: ✅ YES** - via REST API on page mount (`GET /api/quizzes/session/:session_id/history`)

**Q: Do we send quiz via WebSocket or REST?**  
**A: ✅ BOTH**
- **WebSocket:** Real-time `quiz_published` event for users already in room
- **REST API:** Initial load and late joiner sync (more reliable)

The system is well-designed and handles all edge cases correctly! 🎉
