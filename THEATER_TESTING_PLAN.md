# Phase 10: Multi-Theater System Testing Plan

## Testing Environment Setup
- ✅ Backend: Running on port 8080
- ✅ Frontend: Running on port 5173
- ✅ Database: PostgreSQL connected
- ✅ No compilation errors

---

## Test Scenarios

### **Test 1: Single Theater Baseline** ✅
**Goal:** Verify theater system works with < 42 users

**Steps:**
1. Create a new 3D Cinema session as Host
2. Join with 2-3 additional users
3. Have all users take seats

**Expected Results:**
- ✅ All users auto-assigned to Theater 1
- ✅ No theater badges in chat (only 1 theater)
- ✅ SeatGrid shows all users
- ✅ Right-click Seats icon → Theater Overview shows 1 theater
- ✅ Host sees occupancy: "3/42 seats"

---

### **Test 2: Theater Auto-Creation** ⏳
**Goal:** Verify Theater 2 auto-creates when Theater 1 fills

**Steps:**
1. Simulate 42 users filling Theater 1 seats
2. Have 43rd user join and take a seat

**Expected Results:**
- ✅ Backend creates Theater 2 automatically
- ✅ Host receives toast: "🎭 Theater 2 created! 42 users in Theater 1"
- ✅ User 43 assigned to Theater 2
- ✅ User 43 receives toast: "Assigned to Theater 2"
- ✅ Theater Overview shows 2 theaters
- ✅ Theater 1: 42/42 (Full, red bar)
- ✅ Theater 2: 1/42 (Active, green bar)

**Database Verification:**
```sql
-- Check theaters created
SELECT id, theater_number, occupied_seats, max_seats FROM theaters WHERE watch_session_id = ?;

-- Check user assignments
SELECT user_id, theater_id, seat_row, seat_col FROM user_theater_assignments WHERE watch_session_id = ?;
```

---

### **Test 3: Chat Theater Badges** ⏳
**Goal:** Verify theater badges appear when 2+ theaters exist

**Steps:**
1. With 2 theaters active (from Test 2)
2. Have users from different theaters send chat messages

**Expected Results:**
- ✅ Theater badges appear in chat: `[T1]`, `[T2]`
- ✅ Badge colors match theater number (T1=blue, T2=green)
- ✅ Hover tooltip shows full theater name
- ✅ MessageItem and CinemaScene3D chat both show badges

---

### **Test 4: Members Modal Theater Display** ⏳
**Goal:** Verify MembersModal shows theater assignments

**Steps:**
1. Open Members modal (click Members icon)
2. Verify theater info for each user

**Expected Results:**
- ✅ Theater badge displayed: `[T1]` or `[T2]`
- ✅ Seat location shown: "Row A, Seat 5"
- ✅ Badge color matches theater
- ✅ Users without seats show no theater info

---

### **Test 5: Theater Overview Dashboard** ⏳
**Goal:** Verify host can view and manage theaters

**Steps:**
1. As host, right-click Seats icon
2. Theater Overview modal opens
3. Rename Theater 1 to "VIP Theater"
4. Close and reopen modal

**Expected Results:**
- ✅ Modal shows all theaters
- ✅ Occupancy bars display correctly
- ✅ Theater 1: 42/42 (100%, red bar)
- ✅ Theater 2: 1/42 (2%, green bar)
- ✅ Click ✏️ to rename works
- ✅ Name persists after modal close/reopen
- ✅ API call: `PUT /api/theaters/:id/name`

---

### **Test 6: SeatGrid Theater Dropdown** ⏳
**Goal:** Verify host can view different theater seat grids

**Steps:**
1. As host, left-click Seats icon
2. Verify dropdown appears in SeatGrid header
3. Select Theater 1 from dropdown
4. Switch to Theater 2

**Expected Results:**
- ✅ Dropdown shows: "VIP Theater (42/42)", "Theater 2 (1/42)"
- ✅ Selecting Theater 1 shows 42 occupied seats
- ✅ Selecting Theater 2 shows 1 occupied seat
- ✅ Non-host users don't see dropdown (only their theater)

---

### **Test 7: Broadcast Request System** ⏳
**Goal:** Verify non-host users can request broadcast permission

**Steps:**
1. As non-host user in Theater 2
2. Open Members modal
3. Click "🎤 Request Broadcast" button
4. As host, check for notification

**Expected Results:**
- ✅ User sees toast: "Broadcast request sent to host"
- ✅ Host receives toast: "User requesting broadcast permission"
- ✅ Host sees orange pulsing "🎤 Request" badge on user in Members modal
- ✅ WebSocket message: `broadcast_request` sent to host
- ✅ Backend logs show request received

---

### **Test 8: Grant/Revoke Broadcast** ⏳
**Goal:** Verify host can grant/revoke broadcast permissions

**Steps:**
1. As host, open Members modal
2. Click broadcast icon for requesting user (orange pulsing)
3. User receives permission
4. Click again to revoke

**Expected Results:**
- ✅ Click 1: User receives toast: "You can now broadcast to the whole room!"
- ✅ Members modal shows "🔊 Whole Room" for user
- ✅ WebSocket message: `broadcast_granted` broadcast to all
- ✅ Database: `can_broadcast = true` in `watch_session_members`
- ✅ Click 2: User receives toast: "Your broadcast permission was revoked"
- ✅ WebSocket message: `broadcast_revoked` broadcast to all
- ✅ Database: `can_broadcast = false`

---

### **Test 9: Cross-Theater Communication** ⏳
**Goal:** Verify users in different theaters can see each other in UI

**Steps:**
1. User in Theater 1 sends chat message
2. User in Theater 2 receives message
3. Check Members modal from both theaters

**Expected Results:**
- ✅ Theater 1 user's message has `[T1]` badge
- ✅ Theater 2 user sees the message
- ✅ Members modal shows all users across theaters
- ✅ Each user has correct theater badge
- ✅ Theater Overview shows accurate occupancy

---

### **Test 10: Host Leave Call (Session End)** ⏳
**Goal:** Verify host leaving ends session for all users

**Steps:**
1. With users in both Theater 1 and Theater 2
2. Host clicks "Leave Call"
3. Check all users redirected

**Expected Results:**
- ✅ All users redirected to home/lobby
- ✅ Session marked as ended in database
- ✅ All WebSocket connections closed
- ✅ Database: `watch_sessions.ended_at` populated
- ✅ Database: All `watch_session_members.is_active = false`

---

## Database Verification Queries

```sql
-- Check theaters for a session
SELECT 
    t.id,
    t.theater_number,
    t.custom_name,
    t.occupied_seats,
    t.max_seats,
    t.created_at
FROM theaters t
WHERE t.watch_session_id = <SESSION_ID>
ORDER BY t.theater_number;

-- Check user theater assignments
SELECT 
    uta.user_id,
    u.username,
    t.theater_number,
    uta.seat_row,
    uta.seat_col,
    uta.created_at
FROM user_theater_assignments uta
JOIN users u ON u.id = uta.user_id
JOIN theaters t ON t.id = uta.theater_id
WHERE uta.watch_session_id = <SESSION_ID>
ORDER BY t.theater_number, uta.seat_row, uta.seat_col;

-- Check broadcast permissions
SELECT 
    wsm.user_id,
    u.username,
    wsm.can_broadcast,
    wsm.is_active
FROM watch_session_members wsm
JOIN users u ON u.id = wsm.user_id
WHERE wsm.watch_session_id = <SESSION_ID>;

-- Check broadcast requests (if using BroadcastRequest model)
SELECT 
    br.user_id,
    u.username,
    br.status,
    br.message,
    br.created_at
FROM broadcast_requests br
JOIN users u ON u.id = br.user_id
WHERE br.watch_session_id = <SESSION_ID>;
```

---

## Known Limitations & Edge Cases

### **Limitations:**
1. **Manual Testing Required:** Need multiple browser windows/devices to simulate 42+ users
2. **Load Testing:** Performance with 84+ concurrent users (2 full theaters) not tested
3. **Network Latency:** WebSocket delay with high user count not measured

### **Edge Cases to Test:**
1. User disconnects mid-session (does seat release? theater occupancy update?)
2. Host promotes another user (do theater permissions transfer?)
3. User switches seats within same theater (does assignment update?)
4. User tries to swap seats across theaters (should fail)
5. Theater 1 users leave, Theater 2 becomes primary (does numbering stay?)

---

## Testing Progress

| Test | Status | Notes |
|------|--------|-------|
| 1. Single Theater Baseline | ⏳ | Need to create session |
| 2. Theater Auto-Creation | ⏳ | Requires 43 users |
| 3. Chat Theater Badges | ⏳ | After Test 2 |
| 4. Members Modal Display | ⏳ | After Test 2 |
| 5. Theater Overview Dashboard | ⏳ | Host feature |
| 6. SeatGrid Dropdown | ⏳ | Host feature |
| 7. Broadcast Request | ⏳ | Non-host feature |
| 8. Grant/Revoke Broadcast | ⏳ | Host feature |
| 9. Cross-Theater Communication | ⏳ | After Test 2 |
| 10. Host Leave Call | ⏳ | Final test |

---

## Next Steps

1. **Basic Smoke Test:** Create session, verify 1 theater works
2. **Database Simulation:** Insert 42 fake users into Theater 1
3. **Real User Test:** Join with 43rd real user, verify Theater 2 creation
4. **Feature Walkthrough:** Test all UI components (badges, modals, etc.)
5. **Load Testing:** Simulate high user count for performance validation

---

## Testing Commands

```bash
# Start backend (if not running)
cd ~/WeWatch/backend && go run cmd/server/main.go

# Start frontend (if not running)
cd ~/WeWatch/frontend && npm run dev

# Watch backend logs
tail -f ~/WeWatch/backend/logs.txt

# Database access
psql -U postgres -d wewatch_db

# Check running processes
ps aux | grep -E "(main|vite)"
```
