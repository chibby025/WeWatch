# Quiz Session Status Integration - Backend Changes Needed

## Problem
When a user joins a session AFTER a quiz has been published, they don't see the quiz in the left sidebar. The quiz is only sent via WebSocket broadcast, not stored in the session state.

## Solution
Add active quiz information to the session status endpoint so late joiners can see published quizzes.

---

## Backend Changes Required

### 1. Add Quiz Fields to Session Status Response

**File:** `backend/internal/handlers/rooms.go` - `GetActiveSessionHandler`

**Current Response:**
```json
{
  "session_id": "uuid",
  "room_id": 108,
  "watch_type": "classroom",
  "class_type": "lecture_hall",
  "started_at": "...",
  "status": "active"
}
```

**New Response (add active_quiz field):**
```json
{
  "session_id": "uuid",
  "room_id": 108,
  "watch_type": "classroom",
  "class_type": "lecture_hall",
  "started_at": "...",
  "status": "active",
  "active_quiz": {
    "quiz_id": 14,
    "name": "Quiz Name",
    "status": "in_progress",
    "published_at": "2025-12-30T21:38:59Z",
    "timer_enabled": false,
    "timer_seconds": null,
    "total_questions": 5
  }
}
```

**Implementation:**
```go
// In GetActiveSessionHandler, before sending response:

// Check for active quiz in this session
var activeQuiz *models.Quiz
h.DB.Where("session_id = ? AND status = ?", session.ID, "in_progress").
    First(&activeQuiz)

sessionResponse := map[string]interface{}{
    "session_id":  session.SessionID,
    "room_id":     session.RoomID,
    "watch_type":  session.WatchType,
    "class_type":  session.ClassType,
    "started_at":  session.StartedAt,
    "status":      "active",
}

// Add active quiz if exists
if activeQuiz != nil {
    sessionResponse["active_quiz"] = map[string]interface{}{
        "quiz_id":        activeQuiz.ID,
        "name":          activeQuiz.Name,
        "status":        activeQuiz.Status,
        "published_at":  activeQuiz.PublishedAt,
        "timer_enabled": activeQuiz.TimerEnabled,
        "timer_seconds": activeQuiz.TimerSeconds,
        "total_questions": len(activeQuiz.Questions),
    }
}

c.JSON(http.StatusOK, sessionResponse)
```

### 2. Update Quiz Model to Store Session ID

**Current Quiz Model:**
```go
type Quiz struct {
    ID            uint
    RoomID        int
    SessionID     string  // UUID string - needs to link to WatchSession.SessionID
    HostID        int
    Name          string
    Status        string  // "draft", "in_progress", "completed"
    // ...
}
```

**Verify:**
- Quiz.SessionID should be storing the session UUID (not integer ID)
- When publishing quiz, verify session is still active
- When session ends, auto-end any in_progress quizzes

### 3. Handle Session End

**File:** `backend/internal/handlers/websocket.go` - Session end handler

**Add logic to auto-end quizzes:**
```go
// When session ends, end all active quizzes
func endSessionQuizzes(db *gorm.DB, sessionID string) {
    db.Model(&models.Quiz{}).
        Where("session_id = ? AND status = ?", sessionID, "in_progress").
        Updates(map[string]interface{}{
            "status": "completed",
            "ended_at": time.Now(),
        })
}
```

---

## Frontend Changes (Already Implemented)

### Session Status Handler

**File:** `frontend/src/pages/PositionCalculatorPage.jsx`

**Update to handle active_quiz in session status:**
```javascript
case 'session_status':
  console.log('📡 Session status:', data);
  setSessionStatus(data);
  
  // If session has active quiz, show it in sidebar
  if (data.active_quiz && !isHost) {
    setActiveQuiz(data.active_quiz);
  }
  break;
```

---

## Testing Steps

1. **Host creates and publishes quiz**
   - Verify quiz_published broadcast works
   - Verify session status now includes active_quiz

2. **Student joins AFTER quiz published**
   - Student calls `/api/rooms/{id}/active-session`
   - Response should include active_quiz object
   - Frontend should display "Take Quiz" button

3. **Student requests quiz**
   - Student clicks "Take Quiz"
   - Sends `quiz_request` with quiz_id from session status
   - Receives quiz_data without correct answers

4. **Host ends session**
   - All in_progress quizzes should auto-complete
   - Verify quiz status updated to "completed"

---

## Database Query to Check Current State

```sql
-- See which quizzes are active
SELECT q.id, q.name, q.status, q.session_id, ws.session_id as session_uuid, ws.ended_at
FROM quizzes q
LEFT JOIN watch_sessions ws ON q.session_id = ws.session_id::text
WHERE q.status = 'in_progress'
ORDER BY q.created_at DESC;

-- Check if session_id matches
SELECT 
  q.id as quiz_id,
  q.session_id as quiz_session_field,
  ws.id as session_int_id,
  ws.session_id as session_uuid
FROM quizzes q
JOIN watch_sessions ws ON q.room_id = ws.room_id AND ws.ended_at IS NULL
WHERE q.id = 14;
```

---

## Priority: HIGH
Without this change, late joiners cannot participate in quizzes, breaking the core functionality.
