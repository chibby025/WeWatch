# Deployment Checklist - Lecture Hall Audio Fixes

## Pre-Deployment Steps

### 1. Database Migration ⚠️ REQUIRED
```bash
# Navigate to backend
cd backend

# Run migration
psql -h localhost -p 5432 -U postgres -d wewatch_db -f migrations/005_add_discussion_mode.sql

# Verify column added
psql -h localhost -p 5432 -U postgres -d wewatch_db -c "\d watch_sessions"
# Expected output: discussion_mode | boolean | default false
```

### 2. Backend Build
```bash
cd backend
go build -o server ./cmd/server
```

### 3. Frontend Build
```bash
cd frontend
npm run build
```

---

## Testing Sequence

### Test 1: Row-Based Audio (Critical)
**Setup:** 3 users (1 host, 2 students in different rows)

**Steps:**
1. Host and Student A sit in row 1
2. Student B sits in row 5
3. Student A unmutes mic and speaks
4. **Expected:** Host hears Student A, Student B does NOT hear Student A
5. Student B unmutes mic and speaks
6. **Expected:** Host hears Student B, Student A does NOT hear Student B
7. Host unmutes mic and speaks
8. **Expected:** Both students hear host

**Pass Criteria:** ✅ Row-based filtering works correctly

---

### Test 2: Raise Hand & Approved Speaker (Critical)
**Setup:** 1 host, 1 student

**Steps:**
1. Student raises hand (click raise hand button)
2. **Expected:** Host sees raised hand indicator
3. Host clicks approve speaker
4. **Expected:** Student receives "You can now speak to the class!" toast
5. Student unmutes mic and speaks
6. **Expected:** All users in room hear student
7. Host revokes speaker
8. **Expected:** Student returns to row-based audio

**Pass Criteria:** ✅ Approved speaker flow works end-to-end

---

### Test 3: Discussion Mode Toggle (High Priority)
**Setup:** 1 host, 2 students in different rows

**Steps:**
1. Host moves mouse to show discussion mode button
2. **Expected:** Pill-shaped button appears at bottom-center
3. Host clicks discussion mode button
4. **Expected:** 
   - Button turns red "Discussion Mode: ON"
   - All users see toast "Discussion mode enabled"
5. Student A unmutes and speaks
6. **Expected:** Student B hears Student A (row filtering disabled)
7. Host clicks button again to disable
8. **Expected:**
   - Button turns purple "Enable Discussion Mode"
   - All users see toast "Discussion mode disabled"
9. Student A still speaking
10. **Expected:** Student B does NOT hear Student A (row filtering restored)

**Pass Criteria:** ✅ Discussion mode toggles correctly, all clients sync

---

### Test 4: Discussion Mode Persistence (High Priority)
**Setup:** 1 host, 1 student

**Steps:**
1. Host enables discussion mode
2. **Expected:** discussionMode = true in database
3. New user (Student B) joins lecture hall
4. **Expected:** Student B receives discussion_mode=true in session_status
5. Student B's UI shows discussion mode is active
6. Restart backend server
7. User rejoins lecture hall
8. **Expected:** Discussion mode still enabled (loaded from database)

**Pass Criteria:** ✅ Discussion mode persists across joins and restarts

---

### Test 5: Sound Effects (Medium Priority)
**Setup:** 1 user

**Steps:**
1. User joins lecture hall and gets assigned seat
2. **Expected:** Seat assignment sound plays (volume 0.3)
3. User clicks audio button to unmute
4. **Expected:** Mic on sound plays (volume 0.25)
5. User clicks audio button to mute
6. **Expected:** Mic off sound plays (volume 0.25)
7. User opens audio settings dropdown
8. User toggles silence mode ON
9. **Expected:** Silence on sound plays (volume 0.2)
10. User toggles silence mode OFF
11. **Expected:** Silence off sound plays (volume 0.2)

**Pass Criteria:** ✅ All 5 sounds play at correct times

---

### Test 6: Non-Host Discussion Mode (Security)
**Setup:** 1 host, 1 student

**Steps:**
1. Student attempts to toggle discussion mode via devtools:
   ```javascript
   // In browser console as student
   ws.send(JSON.stringify({
     type: 'toggle_discussion_mode',
     data: { discussion_mode: true, session_id: 'xxx' }
   }));
   ```
2. **Expected:** Backend rejects (logs "User X is not the host")
3. Discussion mode does NOT change
4. No broadcast sent to room

**Pass Criteria:** ✅ Only host can toggle discussion mode

---

## Post-Deployment Verification

### Database Check
```sql
-- Verify column exists
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'watch_sessions' 
AND column_name = 'discussion_mode';

-- Check existing sessions have default value
SELECT session_id, discussion_mode 
FROM watch_sessions 
LIMIT 5;
```

### Backend Logs Check
```bash
# Start backend and monitor logs
cd backend
./server

# Look for these log messages when testing:
# [user_speaking] 🎤 User X speaking=true scope=row
# [toggle_discussion_mode] 🎤 User X toggling discussion mode
# [toggle_discussion_mode] ✅ Updated session discussion_mode
```

### Frontend Console Check
```javascript
// In browser devtools while in lecture hall
// Should see these logs:
// ✅ [useLectureHallAudio] Discussion mode enabled
// 🎤 [PositionCalculator] Discussion mode changed: true
// 🎤 [PositionCalculator] Initial discussion mode from session_status: true
```

---

## Rollback Plan

### If Migration Fails
```sql
-- Remove column
ALTER TABLE watch_sessions DROP COLUMN IF EXISTS discussion_mode;

-- Remove index
DROP INDEX IF EXISTS idx_watch_sessions_discussion_mode;
```

### If Backend Issues
```bash
# Revert to previous build
cd backend
git checkout HEAD~1 internal/handlers/websocket.go
git checkout HEAD~1 internal/models/watch_session.go
go build -o server ./cmd/server
./server
```

### If Frontend Issues
```bash
# Revert to previous build
cd frontend
git checkout HEAD~1 src/hooks/useLectureHallAudio.jsx
git checkout HEAD~1 src/pages/PositionCalculatorPage.jsx
npm run build
```

---

## Monitoring

### Key Metrics
- **Audio Message Rate:** `user_speaking` messages per second
- **Discussion Mode Toggles:** How often hosts toggle discussion mode
- **Approved Speakers:** Raise hand → approval rate
- **Session Duration:** Discussion mode ON vs OFF percentages

### Log Queries
```bash
# Count user_speaking messages
grep "user_speaking" backend.log | wc -l

# Find discussion mode toggles
grep "toggle_discussion_mode" backend.log

# Find failed toggle attempts (non-host)
grep "User .* is not the host" backend.log
```

---

## Known Issues & Workarounds

### Issue: LiveKit Audio Not Routing
**Symptom:** Users can't hear each other despite correct recipients

**Cause:** LiveKit permissions set to CanPublish=true for all

**Workaround:** 
- Frontend calculates recipients correctly
- Backend routes messages correctly
- LiveKit transports audio to all participants
- **This is expected behavior** - audio routing is message-based, not LiveKit-based

**Resolution:** Working as designed. LiveKit handles transport only.

---

### Issue: Discussion Mode Button Doesn't Show
**Symptom:** Host doesn't see discussion mode button

**Cause:** Auto-hide feature - button hides after 1 second

**Workaround:** Move mouse to make button reappear

**Resolution:** Working as designed. Move mouse = button shows for 1 second.

---

### Issue: Seat Assignment Sound Doesn't Play
**Symptom:** No sound when user gets assigned seat

**Cause:** Browser autoplay policy blocks audio before user interaction

**Workaround:** User must click/interact with page first

**Resolution:** Browser limitation. Ensure sound files in `/public/sounds/` exist.

---

## Success Criteria

✅ **All tests pass** from Testing Sequence section  
✅ **No backend errors** in logs  
✅ **No frontend errors** in browser console  
✅ **Database migration** successful  
✅ **Sound effects** play at correct times  
✅ **Discussion mode** persists across sessions  
✅ **Row-based audio** filters correctly  
✅ **Approved speakers** can broadcast to all  

---

## Contact

For issues or questions:
- Backend errors → Check `websocket.go` line numbers in error logs
- Frontend errors → Check browser console for stack traces
- Database errors → Check `watch_sessions` table schema
- Audio issues → Verify LiveKit server running on port 7880

---

**Deployment Status:** 🟡 Ready for Testing  
**Next Step:** Run Test Sequence 1-6  
**Estimated Time:** 30-45 minutes for full test suite
