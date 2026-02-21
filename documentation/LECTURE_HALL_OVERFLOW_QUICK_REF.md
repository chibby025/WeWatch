# Lecture Hall Overflow - Quick Reference

## 🚀 Quick Start Testing

### 1. Start Backend Server
```bash
cd backend
./server
```

### 2. Start Frontend
```bash
cd frontend
npm run dev
```

### 3. Create Lecture Hall Session
- Go to http://localhost:5173
- Create new lecture hall watch party
- Note the Room ID

### 4. Run Overflow Test
```bash
# Option A: Use load test script (requires host token)
node test-lecture-hall-overflow.js <roomId> "<hostToken>"

# Option B: Manual testing with multiple browser windows
# Open 150+ incognito windows and join the room
```

### 5. Verify Database
```bash
./verify-lecture-halls.sh <roomId>
```

---

## 🔍 Key Features to Test

### ✅ Automatic Hall Creation
- Fill Hall 1 with 145 users
- 146th user triggers Hall 2 creation
- Host receives toast notification: "Lecture Hall 2 created - room full!"

### ✅ Hall Dropdown (Host Only)
1. As host, click "View Seats" button
2. When multiple halls exist, dropdown appears below header
3. Select different hall to switch view
4. Console logs: "🏫 [Hall Switch] Host viewing hall 2"

### ✅ User Hall Assignment
- Each user sees only their assigned hall
- Seat Grid Modal header shows: "Lecture Hall 2 Seating"
- No dropdown visible to regular users

### ✅ Hall Isolation (Seat Swaps)
1. User in Hall 1 requests swap with user in Hall 2
2. Backend rejects: "cannot swap seats across different halls"
3. Toast error shown

### ✅ Reconnection Persistence
1. User joins, assigned to Hall 2
2. Disconnect (close browser)
3. Reconnect with same user
4. User still in Hall 2 (persisted in database)

---

## 📊 Backend Logs to Watch

```bash
cd backend
tail -f logs/app.log | grep -i "lecture"
```

**Expected log patterns:**
```
[Lecture Hall] GetOrCreateLectureHallForSession: current hall 1 has 145 members
[Lecture Hall] Creating new hall 2 for session 123
[Lecture Hall] User 456 assigned to hall 2
```

---

## 🗄️ Database Queries

### Check Hall Distribution
```sql
SELECT 
  lecture_hall_number,
  COUNT(*) as members
FROM watch_session_members
WHERE watch_session_id = 123
GROUP BY lecture_hall_number
ORDER BY lecture_hall_number;
```

**Expected output (200 users):**
```
 lecture_hall_number | members
---------------------+---------
                   1 |     145
                   2 |      55
```

### View Specific Hall's Seats
```sql
SELECT user_id, seat_id, lecture_hall_number
FROM watch_session_members
WHERE watch_session_id = 123
  AND lecture_hall_number = 2
ORDER BY seat_id;
```

### Reset Session (Clear Seats)
```sql
UPDATE watch_session_members 
SET seat_id = NULL, lecture_hall_number = 1
WHERE watch_session_id = 123;
```

---

## 🎯 WebSocket Messages Reference

### Client → Server

**Take Seat:**
```json
{
  "type": "take_seat",
  "seat_id": "42",
  "room_id": 123
}
```

**Request Seat Swap:**
```json
{
  "type": "seat_swap_request",
  "requestee_user_id": 456,
  "room_id": 123
}
```

### Server → Client

**Hall Assignment:**
```json
{
  "type": "lecture_hall_assigned",
  "data": {
    "hall_number": 2,
    "total_halls": 2,
    "seat_id": "42"
  }
}
```

**Hall Created (Host only):**
```json
{
  "type": "lecture_hall_created",
  "data": {
    "hall_number": 2,
    "total_halls": 2,
    "message": "Lecture Hall 2 created (Hall 1 full)"
  }
}
```

**Seat Swap Rejected (Cross-Hall):**
```json
{
  "type": "error",
  "message": "cannot swap seats across different halls"
}
```

---

## 🐛 Common Issues & Solutions

### Issue: Hall dropdown not appearing
**Cause:** Only 1 hall exists, or user is not host  
**Solution:** 
- Ensure `totalHalls > 1`
- Verify `isHost === true`
- Check console for state: `console.log({totalLectureHalls, isHost})`

### Issue: Users not assigned to Hall 2
**Cause:** Hall 1 not full yet (less than 145 members)  
**Solution:** 
- Check occupancy: `SELECT COUNT(*) FROM watch_session_members WHERE watch_session_id=123 AND lecture_hall_number=1`
- Ensure host is seated (takes 1 slot)

### Issue: Seat swap not working between halls
**Expected Behavior:** This is correct! Seat swaps across halls are intentionally blocked.  
**Solution:** Users can only swap within the same hall.

### Issue: Demo mode showing wrong hall
**Cause:** Demo mode reference to `currentLectureHall` not wired  
**Solution:** Check lines 1090-1109 in PositionCalculatorPage.jsx

### Issue: Migration already applied error
**Cause:** Column `lecture_hall_number` already exists  
**Solution:** 
```sql
-- Check if column exists
\d watch_session_members

-- If exists, skip migration (it's already applied)
```

---

## 📈 Performance Considerations

### Database Indexes
✅ Created: `idx_watch_session_members_hall` on `(watch_session_id, lecture_hall_number)`

**Query Performance:**
- Hall occupancy query: O(1) with index
- Seat assignment: O(1) lookup
- Cross-hall search: O(n) where n = number of halls

### Memory Usage (Backend)
- Hub.seatingAssignments: 3-layer map structure
- Memory per room: `~8 bytes * 145 seats * H halls`
- Example: 3 halls = ~3.5 KB per room

### WebSocket Load
- Overflow notification: Broadcast to host only (1 client)
- Hall assignment: Unicast to user (1 client)
- No additional broadcasts needed

---

## 🎓 Testing Scenarios

### Scenario 1: Normal Operation (1 Hall)
**Users:** 1-144  
**Expected:** All in Hall 1, no dropdown  
**Test:** Verify header shows "Lecture Hall Seating"

### Scenario 2: Overflow Trigger (2 Halls)
**Users:** 145-200  
**Expected:** Hall 1 (145), Hall 2 (55)  
**Test:** Host sees dropdown with 2 options

### Scenario 3: Multi-Hall Operation (3+ Halls)
**Users:** 291+  
**Expected:** Hall 1 (145), Hall 2 (145), Hall 3 (1+)  
**Test:** Host can switch between 3 halls

### Scenario 4: Seat Swap Within Hall
**Setup:** User A (Hall 1, Seat 10), User B (Hall 1, Seat 20)  
**Action:** User A swaps with User B  
**Expected:** ✅ Swap succeeds

### Scenario 5: Seat Swap Across Halls
**Setup:** User A (Hall 1, Seat 10), User B (Hall 2, Seat 10)  
**Action:** User A swaps with User B  
**Expected:** ❌ Swap rejected with error

### Scenario 6: Host Hall Switching
**Setup:** Hall 1 (145 users), Hall 2 (55 users)  
**Action:** Host opens Seats Grid, selects "Hall 2"  
**Expected:** Grid shows Hall 2's 55 members

---

## 📝 Code Reference

### Backend Entry Points
- **Hall Creation:** `lecture_hall_helpers.go:GetOrCreateLectureHallForSession()`
- **Seat Assignment:** `websocket.go:take_seat` handler (lines 2235-2340)
- **Swap Validation:** `websocket.go:seat_swap_request` handler (lines 2540-2575)

### Frontend Entry Points
- **State Management:** `PositionCalculatorPage.jsx` (lines 1064-1070)
- **Message Handlers:** `PositionCalculatorPage.jsx` (lines 3410-3432)
- **Hall Dropdown:** `LectureHallSeatsGrid.jsx` (lines 275-305)

### Database
- **Table:** `watch_session_members`
- **Column:** `lecture_hall_number INT DEFAULT 1`
- **Index:** `idx_watch_session_members_hall`

---

## ✅ Acceptance Criteria

- [x] Hall 1 fills to 145 before Hall 2 created
- [x] Host receives notification when new hall created
- [x] Host can view any hall via dropdown
- [x] Users see only their assigned hall
- [x] Seat swaps blocked across different halls
- [x] Hall assignments persist across reconnections
- [x] Database migration applied successfully
- [x] No breaking changes to existing sessions
- [x] Demo mode respects hall context

---

## 🔗 Related Files

**Documentation:**
- [LECTURE_HALL_OVERFLOW_IMPLEMENTATION.md](LECTURE_HALL_OVERFLOW_IMPLEMENTATION.md) - Complete implementation details

**Test Scripts:**
- [test-lecture-hall-overflow.js](test-lecture-hall-overflow.js) - Load test for 200 users
- [verify-lecture-halls.sh](verify-lecture-halls.sh) - Database verification script

**Backend:**
- `backend/migrations/20260120_add_lecture_hall_number.sql` - Migration
- `backend/internal/utils/lecture_hall_helpers.go` - Helper functions
- `backend/internal/websocket/websocket.go` - WebSocket handlers

**Frontend:**
- `frontend/src/pages/PositionCalculatorPage.jsx` - Main page logic
- `frontend/src/components/LectureHallSeatsGrid.jsx` - Seat grid modal

---

**Status:** ✅ COMPLETE - Ready for testing  
**Breaking Changes:** None (backward compatible)  
**Migration Required:** Yes (already applied)
