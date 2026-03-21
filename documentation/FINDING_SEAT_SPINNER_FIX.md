# Finding Seat Spinner Fix - Mutex Deadlock & Session Validation

## Problem Analysis

The "finding seat" spinner was caused by TWO issues:

### 1. **Mutex Deadlock (Critical)**
**Symptom:** WebSocket connections hanging with log showing:
```
[WebSocketHandler] 🔐 Attempting to lock hub.mutex (client 0xc0001fecd0)...
```
But never seeing "✅ ACQUIRED hub.mutex lock".

**Root Cause:** WebSocketHandler was manually locking `hub.mutex` instead of using the Hub's registration channel. This created a race condition where:
- Hub.Run() goroutine might be processing broadcasts/unregisters (holding mutex)
- WebSocketHandler tries to lock the same mutex → DEADLOCK
- All subsequent WebSocket connections block forever
- Seat assignment messages never get processed

**Fix:** Changed WebSocketHandler to use `hub.register` channel instead of direct mutex locking:
```go
// ❌ OLD: Direct mutex locking (causes deadlock)
hub.mutex.Lock()
hub.rooms[roomID][client] = true
hub.mutex.Unlock()

// ✅ NEW: Use registration channel (non-blocking)
select {
case hub.register <- client:
    log.Printf("✅ Client enqueued for registration")
case <-time.After(100 * time.Millisecond):
    hub.register <- client // fallback blocking send
}
```

### 2. **Stale Session ID (Secondary)**
**Symptom:** Frontend attempting to reconnect with ended session IDs:
```
❌ WebSocket connection rejected: session 1964baf6-5455-48d2-9295-52803eea8c20 has ended
```

**Root Cause:** Sessions only had `ended_at` timestamp to track active state. No explicit boolean flag made queries inconsistent.

**Fix:** Added `is_active` boolean field to `watch_sessions` table:
- Set `is_active = true` when session created
- Set `is_active = false` when session ended
- Check `is_active = true AND ended_at IS NULL` for active sessions

## Changes Made

### 1. Database Migration
**File:** `backend/migrations/20260306_add_is_active_to_watch_sessions.sql`
```sql
ALTER TABLE watch_sessions 
ADD COLUMN is_active BOOLEAN DEFAULT TRUE;

UPDATE watch_sessions 
SET is_active = FALSE 
WHERE ended_at IS NOT NULL;

CREATE INDEX idx_watch_sessions_is_active ON watch_sessions(is_active);
CREATE INDEX idx_watch_sessions_room_active ON watch_sessions(room_id, is_active);
```

**Status:** ✅ Applied successfully (851 rows updated)

### 2. Model Update
**File:** `backend/internal/models/watch_session.go`
```go
type WatchSession struct {
    // ... existing fields ...
    EndedAt   *time.Time `json:"ended_at,omitempty"`
    IsActive  bool      `gorm:"default:true;index:idx_watch_sessions_is_active" json:"is_active"` // NEW
    Members   []WatchSessionMember `json:"members"`
}
```

### 3. WebSocket Handler Fixes
**File:** `backend/internal/handlers/websocket.go`

**A) Session Validation (before WebSocket upgrade):**
```go
// ✅ Check both is_active AND ended_at
if err := DB.Where("session_id = ?", sessionID).First(&session).Error; err == nil {
    if !session.IsActive || session.EndedAt != nil {
        log.Printf("❌ WebSocket connection rejected: session %s is not active", sessionID)
        c.JSON(http.StatusGone, gin.H{
            "error":   "session_ended",
            "message": "This watch session has ended. Please start a new session.",
        })
        return
    }
}
```

**B) Mutex Deadlock Fix:**
```go
// ✅ Use Hub registration channel instead of direct mutex lock
select {
case hub.register <- client:
    log.Printf("[WebSocketHandler] ✅ Client enqueued for registration")
case <-time.After(100 * time.Millisecond):
    hub.register <- client // blocking fallback
}
time.Sleep(10 * time.Millisecond) // Brief wait for registration
```

**C) Session Query Updates:**
```go
// OLD: Only checked ended_at
DB.Where("session_id = ? AND ended_at IS NULL", sessionID)

// NEW: Check both is_active AND ended_at
DB.Where("session_id = ? AND ended_at IS NULL AND is_active = ?", sessionID, true)
```

### 4. Session Creation Updates
**Files:** 
- `backend/internal/handlers/room_handlers.go`
- `backend/internal/handlers/websocket.go`

**All session creation now explicitly sets `is_active = true`:**
```go
session := models.WatchSession{
    SessionID: sessionID,
    RoomID:    roomID,
    HostID:    hostID,
    WatchType: watchType,
    StartedAt: time.Now(),
    IsActive:  true, // ✅ Explicit active flag
}
```

### 5. Session Ending Updates
**File:** `backend/internal/handlers/rooms.go` (EndWatchSessionHandler)

**Now sets both flags when ending:**
```go
session.EndedAt = &now
session.IsActive = false // ✅ Set active flag to false
if err := tx.Save(&session).Error; err != nil {
    // ...
}
log.Printf("✅ Marked session as ended (is_active=false, ended_at=%v)", now)
```

### 6. Query Updates Across Codebase
Updated all active session queries to check `is_active`:
- `WebSocketHandler` - Session lookup during connection
- `Hub.Run()` - Unregister session cleanup
- `CreateWatchSession` - Check for existing active session
- `GetActiveSessionHandler` - List active sessions
- `CheckRoomSessionActive` - Verify session state

## Testing Checklist

✅ **Database Migration:**
- [x] Column added successfully
- [x] Indexes created
- [x] Existing sessions updated (851 ended sessions → is_active=false, 1 active → is_active=true)

⚠️ **Backend Testing Needed:**
- [ ] Start a new 3D cinema session
- [ ] Verify seat assignment works (no spinner)
- [ ] End the session
- [ ] Verify `is_active` is set to false
- [ ] Try to reconnect with ended session ID → should be rejected
- [ ] Start a new session → should succeed

⚠️ **Mutex Deadlock Testing:**
- [ ] Multiple users joining simultaneously
- [ ] Users joining while broadcasts are happening
- [ ] No more "Attempting to lock hub.mutex" without "ACQUIRED" logs

## Files Modified

1. `backend/migrations/20260306_add_is_active_to_watch_sessions.sql` - NEW
2. `backend/internal/models/watch_session.go`
3. `backend/internal/handlers/websocket.go`
4. `backend/internal/handlers/room_handlers.go`
5. `backend/internal/handlers/rooms.go`

## Summary

The "finding seat" spinner was caused by a **mutex deadlock** in the WebSocket connection handler. The deadlock prevented any WebSocket messages (including seat assignments) from being processed. 

We fixed this by:
1. **Removing direct mutex locking** in WebSocketHandler
2. **Using Hub's registration channel** (proper concurrency pattern)
3. **Adding `is_active` field** for explicit session state tracking
4. **Updating all session queries** to check both `is_active` and `ended_at`

The `is_active` field provides a clear, indexed boolean flag that prevents using stale/ended sessions and makes queries more efficient.

## Next Steps

1. **Restart the backend** to load new code
2. **Test seat assignment** in 3D cinema
3. **Monitor logs** for mutex-related warnings
4. **Verify** no more hanging connections
