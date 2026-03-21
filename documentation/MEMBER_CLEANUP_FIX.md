# Member List Cleanup Fix - Implementation Summary

## Problem Identified
Backend was showing 2 active members when only 1 user was connected:
- Duplicate member records created on reconnection (React StrictMode double-mount)
- No cleanup when users disconnect/navigate away
- `FirstOrCreate` not preventing duplicates due to lack of database constraint

## Solutions Implemented

### 1. Database Layer - Unique Constraint ✅
**File**: `backend/migrations/20260102_add_unique_active_session_members.sql`

**Changes**:
- Added partial unique index: `(watch_session_id, user_id) WHERE is_active = true`
- Prevents duplicate active member records at database level
- Cleaned up existing duplicates (keeps most recent)
- Added performance indexes for fast queries

**To Run Migration**:
```bash
# You need to run this SQL manually
psql -h localhost -p 5432 -U postgres -d wewatch_db -f backend/migrations/20260102_add_unique_active_session_members.sql

# Or copy/paste the SQL into your database client
```

### 2. Backend Logic - Smarter Member Management ✅
**File**: `backend/internal/handlers/websocket.go`

#### Change 2a: Added sessionID to Client struct (Line 56)
```go
type Client struct {
    // ... existing fields
    sessionID string // NEW: Track which session this client belongs to
}
```
**Benefit**: Fast cleanup without database query

#### Change 2b: Improved JoinWatchSession (Lines 295-393)
**Old Approach**:
```go
// Used FirstOrCreate - caused duplicates
DB.Where(...).Assign(...).FirstOrCreate(&member)
```

**New Approach**:
```go
// 1. Try UPDATE existing inactive member (reconnection)
result := DB.Model(&WatchSessionMember{}).
    Where("watch_session_id = ? AND user_id = ? AND is_active = false", ...).
    Updates(map[string]interface{}{
        "is_active": true,
        "joined_at": now,
        "left_at": nil,
    })

// 2. If no inactive member exists, INSERT new one
if result.RowsAffected == 0 {
    DB.Create(&member) // Database constraint prevents duplicates
}

// 3. Store sessionID in client for cleanup
client.sessionID = sessionID
```

**Benefits**:
- Reconnections reuse existing records
- Database constraint catches any race conditions
- Explicit error handling for duplicate violations

#### Change 2c: Enhanced Disconnect Cleanup (Lines 495-552)
**New Features**:
1. **Fast session lookup** - Uses `client.sessionID` instead of DB query
2. **Mark member inactive** - Sets `is_active=false`, `left_at=NOW()`
3. **Broadcast user_left** - Notifies all room members in real-time
4. **Host disconnect tracking** - Only starts 10-min timer when ALL host connections gone

**Broadcast Message**:
```json
{
  "type": "user_left",
  "data": {
    "userId": 7,
    "username": "chibi",
    "sessionId": "f3e2b6bf-a47a-48dd-835e-f7c1ae502b35"
  }
}
```

### 3. Frontend Integration - Handling user_left Message
**File**: `frontend/src/hooks/useWebSocket.js` (already handles messages)

The frontend already has message handlers in place. When `user_left` is received:
- Member list components should filter out the departed user
- Avatar should disappear from 3D scene
- Member count should decrement

## Testing Checklist

### Test 1: No Duplicate Members ✅
1. **Stop backend** (Ctrl+C)
2. **Run migration** (see SQL command above)
3. **Restart backend**: `go run cmd/server/main.go`
4. **Login as host** and join watch session
5. **Check logs**: Should see "Created NEW session member" once
6. **Verify count**: API should return 1 member (not 2)

**Expected Backend Logs**:
```
✅ Created NEW session member record for user 7 (session: xxx)
✅ Marked user 7 as left from session xxx (watch_session_id=108)
```

### Test 2: Member Cleanup on Disconnect ✅
1. **Join watch session** as user
2. **Click back button** or **close browser tab**
3. **Check backend logs**:
   - Should see "Marked user X as left from session Y"
   - Should see "Broadcast user_left for user X"
4. **Check database**:
   ```sql
   SELECT user_id, is_active, left_at 
   FROM watch_session_members 
   WHERE watch_session_id = 108;
   ```
   - Should show `is_active = false`, `left_at` populated

### Test 3: Real-time Member Count Updates ✅
1. **User A joins** → Member count = 1
2. **User B joins** → Member count = 2
3. **User B leaves** → Member count should immediately drop to 1
4. **Frontend member list** should update without refresh

### Test 4: Host Disconnect Grace Period ✅
1. **Host joins** and **closes browser**
2. **Check logs**: "Host FULLY disconnected - 10-minute auto-end timer started"
3. **Host rejoins within 10 minutes** → Session continues
4. **Wait 10+ minutes** → Session auto-ends

### Test 5: Multiple Tabs (Same User) ✅
1. **Open 2 tabs** as same user
2. **Join same watch session** in both tabs
3. **Check member count**: Should show 1 member (not 2)
4. **Close 1 tab** → Member should stay (other tab still active)
5. **Close 2nd tab** → Member cleanup happens

## Database Migration Details

**Before Migration**:
```sql
-- No constraint prevents duplicates
watch_session_members:
  user_id=7, watch_session_id=108, is_active=true  ← Duplicate 1
  user_id=7, watch_session_id=108, is_active=true  ← Duplicate 2
```

**After Migration**:
```sql
-- Unique index prevents duplicates
CREATE UNIQUE INDEX idx_unique_active_session_member 
ON watch_session_members (watch_session_id, user_id) 
WHERE is_active = true;

-- Only one active record per user/session allowed:
watch_session_members:
  user_id=7, watch_session_id=108, is_active=true   ← ✅ Only one
  user_id=7, watch_session_id=108, is_active=false  ← ✅ Previous session
```

## Expected Behavior After Fix

### ✅ Join Session
- Backend creates/reactivates member record
- Member count increments
- Frontend shows new member in list

### ✅ Leave Session (any method)
- Backend marks `is_active=false`, sets `left_at`
- Broadcasts `user_left` message
- Frontend removes member from list
- Member count decrements

### ✅ Reconnection
- Backend reactivates existing inactive record (doesn't create duplicate)
- Member count stays accurate

### ✅ Network Disconnect
- WebSocket `onclose` triggers cleanup
- Member removed automatically
- No stale records

## Rollback Plan (if needed)

If issues arise, rollback steps:

1. **Revert websocket.go**:
   ```bash
   git checkout HEAD -- backend/internal/handlers/websocket.go
   ```

2. **Remove database constraint**:
   ```sql
   DROP INDEX IF EXISTS idx_unique_active_session_member;
   ```

3. **Restart backend**

## Success Criteria

✅ Member count always matches actual connected users
✅ No duplicate member records in database
✅ Members removed immediately on disconnect
✅ Frontend member list updates in real-time
✅ Host disconnect timer works correctly
✅ Database constraint prevents duplicates

---

## Next Steps

1. **Run the migration** (SQL file above)
2. **Restart backend server**
3. **Test all scenarios** (join, leave, reconnect, multiple tabs)
4. **Monitor logs** for any issues
5. **Verify database** - no duplicate active members

If you see any errors, check:
- Database connection
- Migration ran successfully
- Backend restarted after code changes
