# Quiz Cleanup & Export Implementation Plan

## Problem Statement
Quizzes from previous sessions persist and appear in new sessions. Need to:
1. **Delete all quizzes** when a session ends (host leaves)
2. **Export quiz results** before deletion so users can save data
3. **Clear quiz state** from frontend sessionStorage

---

## Current State Analysis

### 1. Leave Call Flow (Frontend)
**File:** `frontend/src/pages/PositionCalculatorPage.jsx` (Lines 5630-5700)

```javascript
const handleExit = async () => {
  if (isHost && finalSessionId) {
    // Host ends session for everyone
    await endWatchSession(roomId, finalSessionId);
    toast.success('Watch session ended');
  } else {
    // Participant sends leave_session message
    sendMessage({ type: 'leave_session', user_id: currentUser.id });
    await waitForAcknowledgment('leave_session', 2000);
  }
  
  // Disconnect WebSocket
  await disconnect();
  
  // Navigate to room
  navigate(`/rooms/${roomId}`);
}
```

**Current Behavior:**
- ✅ Ends watch session
- ✅ Deletes temporary media
- ✅ Deletes chat messages
- ✅ Deletes RoomTV content
- ❌ **Does NOT delete quizzes**
- ❌ **Does NOT clear quiz sessionStorage**

---

### 2. Backend Session Cleanup
**File:** `backend/internal/handlers/rooms.go` (Lines 700-850)

```go
func AutoEndSession(sessionID string) error {
  // Current cleanup:
  // ✅ Mark session as ended
  // ✅ Delete temporary media files
  // ✅ Mark members as inactive
  // ✅ Delete session chat messages & reactions
  // ✅ Delete RoomTV content
  // ❌ MISSING: Delete quizzes
  
  tx.Commit()
}
```

**Cleanup Sequence:**
1. Fetch session from DB
2. Check if instant watch (temporary room)
3. Start transaction
4. Delete temporary media (files + DB records)
5. Mark members inactive
6. Delete chat messages & reactions
7. Delete RoomTV content
8. **Need to add: Delete quizzes**
9. Commit transaction

---

### 3. Quiz Data Structure
**Backend:** `backend/internal/models/quiz.go`

```go
type Quiz struct {
  ID          uint
  RoomID      uint
  SessionID   uint          // ← Session-specific
  HostID      uint
  Name        string
  Status      string        // draft, in_progress, completed
  Questions   QuestionList
  CreatedAt   time.Time
  PublishedAt *time.Time
  EndedAt     *time.Time
  DeletedAt   gorm.DeletedAt // Soft delete
}

type QuizResponse struct {
  ID             uint
  QuizID         uint
  UserID         uint
  Answers        AnswerList
  Score          int
  TotalQuestions int
  SubmittedAt    time.Time
}
```

**Key Points:**
- Quizzes are **session-specific** (have `SessionID`)
- Currently use **soft delete** (DeletedAt field)
- Quiz responses are linked via `QuizID`
- Need to delete **both** quizzes AND responses

---

### 4. Existing Quiz Deletion
**File:** `backend/internal/services/quiz_service.go`

```go
// DeleteQuiz soft deletes a quiz and its responses (host only)
func (s *QuizService) DeleteQuiz(quizID uint, hostID uint) error {
  var quiz models.Quiz
  
  // Verify ownership
  if quiz.HostID != hostID {
    return errors.New("only the quiz creator can delete it")
  }
  
  // Can only delete drafts
  if quiz.Status != "draft" {
    return errors.New("only draft quizzes can be deleted")
  }
  
  return s.db.Delete(&quiz).Error // Soft delete
}
```

**Limitations:**
- Only allows deleting **drafts**
- Requires **host verification**
- Uses **soft delete** (keeps in DB with DeletedAt)
- Doesn't handle bulk deletion by session

---

## Implementation Plan

### Phase 1: Export Quiz Results (Before Deletion)

#### A. Frontend: Export Button in QuizManagementModal
**File:** `frontend/src/components/cinema/modals/QuizManagementModal.jsx`

**Add Export Functionality:**
```javascript
const exportQuizResults = (quiz) => {
  // Fetch full quiz data with responses
  sendMessage?.({
    type: 'quiz_export_request',
    data: { quiz_id: quiz.id }
  });
};

// When export data received:
const handleExportData = (data) => {
  const exportData = {
    quiz: data.quiz,
    responses: data.responses,
    statistics: {
      total_submissions: data.submitted_count,
      average_score: data.average_score,
      pass_rate: data.pass_rate
    },
    exported_at: new Date().toISOString()
  };
  
  // Download as JSON
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
    type: 'application/json' 
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `quiz_${quiz.name}_results.json`;
  a.click();
  URL.revokeObjectURL(url);
};
```

**UI Changes:**
- Add **"📊 Export Results"** button to completed quiz cards
- Add **"📥 Export All"** button at top of completed section
- Show download progress indicator

#### B. Backend: Export Quiz Data API
**New File:** `backend/internal/handlers/quiz_export_handler.go`

```go
func (client *Client) HandleQuizExportRequest(msg WebSocketMessage) {
  var exportData struct {
    QuizID uint `json:"quiz_id"`
  }
  
  // Parse request
  json.Unmarshal(msg.Data, &exportData)
  
  quizService := services.NewQuizService(DB)
  
  // Get full quiz with responses
  quiz, _ := quizService.GetQuiz(exportData.QuizID)
  responses, _ := quizService.GetQuizResponses(exportData.QuizID, client.userID)
  
  // Calculate statistics
  stats := calculateQuizStats(responses, quiz)
  
  // Send export data
  exportMsg := map[string]interface{}{
    "type": "quiz_export_data",
    "data": map[string]interface{}{
      "quiz": quiz,
      "responses": responses,
      "submitted_count": len(responses),
      "average_score": stats.AverageScore,
      "pass_rate": stats.PassRate,
    },
  }
  
  sendToClient(client, exportMsg)
}
```

---

### Phase 2: Backend Quiz Cleanup

#### A. Add DeleteQuizzesBySession to QuizService
**File:** `backend/internal/services/quiz_service.go`

```go
// DeleteQuizzesBySession deletes all quizzes for a session (hard delete)
func (s *QuizService) DeleteQuizzesBySession(sessionID uint) error {
  log.Printf("🗑️ [QuizService] Deleting quizzes for session %d", sessionID)
  
  // Find all quizzes for this session
  var quizzes []models.Quiz
  if err := s.db.Where("session_id = ?", sessionID).Find(&quizzes).Error; err != nil {
    return fmt.Errorf("failed to fetch quizzes: %v", err)
  }
  
  log.Printf("📝 [QuizService] Found %d quizzes to delete", len(quizzes))
  
  for _, quiz := range quizzes {
    // Delete all responses for this quiz
    result := s.db.Where("quiz_id = ?", quiz.ID).Delete(&models.QuizResponse{})
    log.Printf("🗑️ Deleted %d responses for quiz %d", result.RowsAffected, quiz.ID)
    
    // Delete the quiz itself (hard delete with Unscoped)
    if err := s.db.Unscoped().Delete(&quiz).Error; err != nil {
      log.Printf("⚠️ Failed to delete quiz %d: %v", quiz.ID, err)
      return err
    }
    
    log.Printf("✅ Deleted quiz %d: %s", quiz.ID, quiz.Name)
  }
  
  return nil
}
```

**Key Points:**
- Uses `Unscoped()` for **hard delete** (permanently removes)
- Deletes **responses first**, then quiz
- Loops through all quizzes for session
- Returns error if any deletion fails

#### B. Integrate into AutoEndSession
**File:** `backend/internal/handlers/rooms.go`

**Add after RoomTV deletion (Line ~850):**
```go
// ✅ DELETE QUIZZES AND RESPONSES FOR THIS SESSION
log.Printf("🗑️ [AutoEndSession] Deleting quizzes for session %s", sessionID)
quizService := services.NewQuizService(DB)
if err := quizService.DeleteQuizzesBySession(session.ID); err != nil {
  log.Printf("⚠️ AutoEndSession: Failed to delete quizzes: %v", err)
  // Don't rollback transaction - continue with other cleanup
} else {
  log.Printf("✅ AutoEndSession: Deleted all quizzes for session %s", sessionID)
}
```

**Why After Transaction?**
- Quiz deletion is **not critical** for session integrity
- If it fails, we still want to end the session
- Can be retried later with a cleanup job

---

### Phase 3: Frontend Quiz State Cleanup

#### A. Clear SessionStorage on Leave
**File:** `frontend/src/pages/PositionCalculatorPage.jsx`

**Add to handleExit before navigate:**
```javascript
const handleExit = async () => {
  // ... existing code ...
  
  // ✅ Clear quiz state from sessionStorage
  console.log('🗑️ [handleExit] Clearing quiz state from sessionStorage');
  sessionStorage.removeItem(STORAGE_KEYS.QUIZZES);
  sessionStorage.removeItem(STORAGE_KEYS.ACTIVE_QUIZ);
  sessionStorage.removeItem(STORAGE_KEYS.QUIZ_RESULTS);
  sessionStorage.removeItem(STORAGE_KEYS.QUIZ_PROGRESS);
  sessionStorage.removeItem(STORAGE_KEYS.QUIZ_HISTORY);
  
  // Clear quiz answer drafts (localStorage)
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('quiz_answers_')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
  console.log('✅ [handleExit] Cleared quiz state:', keysToRemove.length, 'answer drafts');
  
  // Disconnect WebSocket
  await disconnect();
  
  // Navigate to room
  navigate(`/rooms/${roomId}`);
}
```

#### B. Clear State Variables
**Add state reset:**
```javascript
// Reset quiz state before navigation
setQuizzes([]);
setActiveQuiz(null);
setQuizResults(null);
setQuizProgress(null);
setQuizHistory({ active_quizzes: [], completed_submissions: [] });
```

---

## Testing Checklist

### Export Functionality
- [ ] Export single completed quiz → JSON file downloads
- [ ] Export all quizzes → Combined JSON file downloads
- [ ] Export includes: quiz questions, all responses, statistics
- [ ] Export works for quizzes with 0 submissions
- [ ] Export button disabled while loading

### Quiz Deletion (Backend)
- [ ] Host ends session → All quizzes deleted from DB
- [ ] Quiz responses deleted before quiz
- [ ] Hard delete (Unscoped) removes from DB permanently
- [ ] Deletion logs appear in backend console
- [ ] Deletion doesn't block other cleanup operations

### State Cleanup (Frontend)
- [ ] Leave call → sessionStorage cleared
- [ ] Leave call → localStorage quiz answers cleared
- [ ] State variables reset to defaults
- [ ] New session doesn't show old quizzes
- [ ] No quiz data persists after refresh

### Edge Cases
- [ ] Host leaves with active quiz → Students see quiz ended
- [ ] Student leaves with unsaved answers → Answers lost (expected)
- [ ] Export then delete → Data preserved in downloaded file
- [ ] Multiple quizzes → All deleted correctly
- [ ] Session ends during quiz → No orphaned data

---

## Migration Strategy

### Order of Implementation
1. ✅ **Phase 1A** - Export button UI (no backend needed yet)
2. ✅ **Phase 1B** - Backend export handler
3. ✅ **Phase 2A** - DeleteQuizzesBySession service
4. ✅ **Phase 2B** - Integrate into AutoEndSession
5. ✅ **Phase 3** - Frontend state cleanup
6. ✅ **Testing** - Full end-to-end verification

### Rollback Plan
If issues arise:
1. Comment out quiz deletion from AutoEndSession
2. Quizzes will persist (current behavior)
3. Can manually clean DB with SQL: `DELETE FROM quizzes WHERE session_id IN (SELECT id FROM watch_sessions WHERE ended_at IS NOT NULL);`

---

## Future Enhancements

### Option 1: Quiz Archive (User Profile)
- Store completed quiz results in user's profile
- Allow viewing past quiz history
- Export from profile page anytime

### Option 2: Room-Level Quiz Bank
- Save quizzes at room level (not session)
- Reuse quizzes across sessions
- Version control for quiz updates

### Option 3: Quiz Analytics Dashboard
- Aggregate statistics across all sessions
- Track student performance over time
- Export to CSV for further analysis

---

## Files to Modify

### Frontend
1. `frontend/src/pages/PositionCalculatorPage.jsx`
   - Add sessionStorage cleanup to handleExit
   - Add state reset before navigation

2. `frontend/src/components/cinema/modals/QuizManagementModal.jsx`
   - Add export button to completed quiz cards
   - Add export all button
   - Add WebSocket listener for export data

### Backend
1. `backend/internal/services/quiz_service.go`
   - Add `DeleteQuizzesBySession(sessionID uint)` method

2. `backend/internal/handlers/rooms.go`
   - Add quiz deletion to `AutoEndSession` function
   - Add logging for quiz cleanup

3. `backend/internal/handlers/quiz_export_handler.go` (NEW)
   - Create `HandleQuizExportRequest` function
   - Add statistics calculation

4. `backend/internal/handlers/websocket.go`
   - Register `quiz_export_request` message handler

---

## Summary

**Current Issue:** Quizzes persist across sessions, causing confusion

**Solution:**
1. **Export** - Allow hosts/students to save quiz results before deletion
2. **Delete** - Remove all quizzes + responses when session ends
3. **Clear** - Reset frontend state to prevent stale data

**Impact:**
- ✅ Clean slate for each new session
- ✅ Users can preserve important quiz data
- ✅ Database stays lean (no orphaned quizzes)
- ✅ Better UX (no confusion from old quizzes)

**Timeline:** ~4-6 hours of development + testing
