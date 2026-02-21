# Leave Call Investigation Summary - January 4, 2026

## Problem Statement
Member clicks "Leave Call" button → Avatar disappears BUT member count stays at 2 (should drop to 1)

## Root Cause Discovered
**Auto-reconnect triggered because `disconnect()` was never called**

### Evidence from Member Console (15:05:20)
```javascript
🔍 [useWebSocket] onclose reconnect check: refCount=1, reconnectAttempts=0/5
useWebSocket: 🔄 Attempting reconnect 1/5 for 108-5c56ef32-...
```

**This proves:**
- `disconnect()` was NOT called
- `refCount` remained at 1 (should be 0)
- `reconnectAttempts` remained at 0 (should be 5)
- Auto-reconnect condition was met → reconnection triggered

### Timeline of Events (Backend Logs)
```
15:05:20.xxx - Backend: leave_session received & processed ✅
15:05:20.xxx - Backend: leave_acknowledged sent ✅
15:05:20.xxx - Backend: WebSocket closed normally
15:05:20.536 - Backend: NEW CONNECTION (0.5s later) WITH session_id 🔴
15:05:20.536 - Backend: "✅ REACTIVATED existing member record" 🔴
15:05:20.915 - Backend: NEW CONNECTION (0.9s later) WITHOUT session_id ✅
15:05:22.972 - Backend: NEW CONNECTION (2.9s later) WITH session_id 🔴
```

### Why Avatar Disappears But Count Doesn't
1. **Avatar removal (WORKS):**
   - `seat_released` message received
   - `userSeats[5]` deleted
   - Avatar rendering checks `userSeats[userId]` → not found → no render ✅

2. **Count update (BROKEN):**
   - `user_left` received → `watchSessionMembers` count 2→1 ✅
   - 100ms later: `participant_join` received (from reactivation) 🔴
   - Host adds user back → count 1→2 🔴
   - Taskbar displays `watchSessionMembers.length` = 2 🔴

## Critical Mystery - Code Not Executing

### Current Setup
- **URL:** `http://localhost:5173/position-calculator/classroom?room_id=108&session_id=...`
- **Component:** PositionCalculatorPage (CONFIRMED by App.jsx routing)
- **Implementation:** Event-driven leave with acknowledgment system (COMPLETE)

### Expected Logs from handleExit (Line 2673-2677)
```javascript
console.log('🚨🚨🚨 [handleExit] ===== FUNCTION ENTRY =====');
console.log('🚨 [handleExit] disconnect exists?', !!disconnect, typeof disconnect);
console.log('🚨 [handleExit] sendMessage exists?', !!sendMessage, typeof sendMessage);
console.log('🚨 [handleExit] currentUser:', currentUser?.id);
console.log('🚨 [handleExit] isHost:', isHost);
```

### Actual Logs from Member Console
**NONE OF THESE LOGS APPEARED** ❌

### Yet Backend Shows
```
[readPump][DEBUG] TextMessage received: {"type":"leave_session","user_id":5}
```
**leave_session WAS sent somehow!** 🤔

## Current Implementation (PositionCalculatorPage)

### handleExit Function (Lines 2672-2760)
```javascript
const handleExit = async () => {
  console.log('🚨🚨🚨 [handleExit] ===== FUNCTION ENTRY =====');
  
  const confirmExit = window.confirm(
    isHost 
      ? 'End this watch session for everyone?'
      : 'Leave lecture hall?'
  );
  
  if (!confirmExit) return;
  
  try {
    if (isHost && finalSessionId) {
      // Host ends session for everyone
      await endWatchSession(roomId, finalSessionId);
    } else {
      // Member: Send leave_session and wait for acknowledgment
      if (sendMessage && currentUser && waitForAcknowledgment) {
        sendMessage({
          type: 'leave_session',
          user_id: currentUser.id
        });
        
        // ✅ EVENT-DRIVEN: Wait for backend acknowledgment
        await waitForAcknowledgment('leave_session', 2000);
      }
    }
    
    // ✅ Gracefully close WebSocket (prevents auto-reconnect)
    if (disconnect) {
      await disconnect();
    }
    
    // Navigate to room page
    navigate(`/rooms/${roomId}`);
  } catch (error) {
    console.error('Failed to leave/end session:', error);
  }
};
```

### useWebSocket disconnect() (Lines 570-620)
```javascript
const disconnect = useCallback(() => {
  console.log('🚨 [useWebSocket] disconnect() CALLED - START');
  return new Promise((resolve) => {
    const key = connectionKeyRef.current;
    const poolEntry = activeConnections.get(key);
    
    // ✅ CRITICAL: Disable auto-reconnect
    reconnectAttemptRef.current = MAX_RECONNECT_ATTEMPTS; // Set to 5
    poolEntry.refCount = 0; // Set to 0
    
    poolEntry.ws.close(1000, 'User disconnected');
    resolve();
  });
}, []);
```

**Expected behavior:** When disconnect() is called:
- refCount → 0
- reconnectAttempts → 5
- onclose handler sees these values → DOES NOT reconnect

**Actual behavior:** disconnect() never called:
- refCount stays at 1
- reconnectAttempts stays at 0
- onclose handler sees reconnect conditions met → RECONNECTS

## Possible Causes

### 1. Browser Cache (MOST LIKELY)
- Firefox serving old JavaScript bundle
- React Fast Refresh not updating module
- Service Worker caching old code

### 2. Vite Dev Server Cache
- Module cache not invalidated
- HMR (Hot Module Replacement) not working
- Build artifacts stale

### 3. Console Filtering
- Firefox console filtering [PositionCalculatorPage] logs
- Log level set to hide debug messages
- Extension interfering with console

### 4. React Component State
- Component not re-rendering with new code
- StrictMode causing double execution issues
- Context provider not updating

## Action Plan After Restart

### 1. Clear All Caches
```bash
# In frontend directory
rm -rf node_modules/.vite
rm -rf dist
npm run build  # Or just restart dev server
```

### 2. Hard Refresh Browser
- Firefox: Ctrl + Shift + R
- Also: Open DevTools → Network tab → Check "Disable cache"

### 3. Verify Code Loaded
- Open Firefox DevTools → Sources tab
- Navigate to `PositionCalculatorPage.jsx`
- Search for "🚨🚨🚨 [handleExit] ===== FUNCTION ENTRY ====="
- Confirm line 2673 exists

### 4. Test Again
1. Start session with host + member
2. Member clicks Leave Call
3. **FIRST check:** Did you see the window.confirm dialog?
   - YES → handleExit is executing, check logs
   - NO → handleExit not being called at all!

### 5. Debug Logging Checkpoints
If you see the confirm dialog but NO logs:
- Add `alert("handleExit START")` at line 2673
- Check Firefox console settings (gear icon)
- Try Chrome/Edge to compare

If you DON'T see the confirm dialog:
- Taskbar isn't calling onLeaveCall
- Check Taskbar component loaded correctly
- Verify props being passed

## Expected Success Criteria

### Member Console Should Show:
```
🚨🚨🚨 [handleExit] ===== FUNCTION ENTRY =====
🚨 [handleExit] disconnect exists? true function
🚨 [handleExit] sendMessage exists? true function
👋 [PositionCalculatorPage] Participant leaving
🚨 [BEFORE sendMessage] About to send leave_session
🚨 [AFTER sendMessage] Message sent
⏳ [PositionCalculatorPage] Waiting for leave_acknowledged...
✅ [PositionCalculatorPage] Leave acknowledged
🚨🚨🚨 [handleExit] ABOUT TO CALL disconnect()
🔌 [PositionCalculatorPage] Disconnecting WebSocket
🚨 [BEFORE disconnect()] Calling disconnect now
🚨 [useWebSocket] disconnect() CALLED - START
🚫 [useWebSocket] Disabled auto-reconnect (set attempts to 5)
🚫 [useWebSocket] Set refCount to 0
🔌 [useWebSocket] Closing WebSocket
✅ [useWebSocket] WebSocket closed
```

### Backend Logs Should Show:
```
[readPump] TextMessage received: {"type":"leave_session","user_id":5}
[leave_session] ✅ Marked user 5 as inactive
[leave_session] 📢 Broadcasted user_left
[leave_session] ✅ Sent leave_acknowledged
WebSocket error: websocket: close 1000 (normal)
[readPump] 🛑 Exiting read loop for user 5
Hub: Client unregistered from room 108
```

### Backend Should NOT Show (after 5 seconds):
```
❌ NO: "🔌🔌🔌 WebSocketHandler CALLED" with session_id
❌ NO: "✅ REACTIVATED existing member record"
❌ NO: "[Hub] Enqueue BroadcastToRoom participant_join"
```

### Host UI Should Show:
- Member count drops from 2 to 1 ✅
- Member count STAYS at 1 (no increase back to 2) ✅
- Member avatar disappears ✅

## Files to Check After Restart

### 1. PositionCalculatorPage.jsx
- Line 2672: `const handleExit = async () => {`
- Line 2673: Entry log exists
- Line 2712-2719: Event-driven leave with waitForAcknowledgment
- Line 2733: disconnect() call
- Line 3297: `onLeaveCall={handleExit}` passed to Taskbar

### 2. useWebSocket.js
- Line 570: `const disconnect = useCallback(() => {`
- Line 587: `reconnectAttemptRef.current = MAX_RECONNECT_ATTEMPTS;`
- Line 591: `poolEntry.refCount = 0;`
- Line 379: onclose reconnect check logs

### 3. Taskbar.jsx
- Line 321: `await onLeaveCall();` called on button click

### 4. backend/internal/handlers/websocket.go
- Lines 3238-3248: leave_session handler sends leave_acknowledged

## Questions to Answer After Restart

1. **Does window.confirm dialog appear when clicking Leave Call?**
   - YES → handleExit executing, check console logs
   - NO → handleExit not being called, debug Taskbar

2. **Do you see "🚨🚨🚨 [handleExit] ===== FUNCTION ENTRY =====" in console?**
   - YES → Code loaded correctly, continue flow
   - NO → Browser cache issue, check Sources tab

3. **Does backend receive leave_session message?**
   - YES → Frontend sending correctly
   - NO → sendMessage not working

4. **Does backend send leave_acknowledged back?**
   - YES → Backend processing correctly
   - NO → Backend handler broken

5. **Do you see disconnect() logs in console?**
   - YES → disconnect executing, check refCount values
   - NO → disconnect not being called or logged

6. **Does auto-reconnect still happen?**
   - YES → disconnect() didn't reset refCount/reconnectAttempts
   - NO → SUCCESS! ✅

## Alternative: LectureHallPage Issue

**NOTE:** Initially suspected LectureHallPage being used, but routing confirmed PositionCalculatorPage. However, if issues persist, verify:

```javascript
// App.jsx line 135
<Route path="/position-calculator/classroom" element={
  <ProtectedRoute><PositionCalculatorPage /></ProtectedRoute>
} />

// NOT this:
<Route path="/lecture-hall/:roomId" element={
  <ProtectedRoute><LectureHallPage /></ProtectedRoute>
} />
```

## Contact Points

**Files Modified Previously:**
- `frontend/src/hooks/useWebSocket.js` - Added waitForAcknowledgment, disconnect fixes
- `frontend/src/pages/PositionCalculatorPage.jsx` - Added event-driven leave flow
- `backend/internal/handlers/websocket.go` - Added leave_acknowledged message

**No Changes Needed in LectureHallPage** - It's not being used for classroom mode.

## Next Steps After System Restart

1. **Start Dev Server:**
   ```bash
   cd frontend
   npm run dev
   ```

2. **Start Backend:**
   ```bash
   cd backend
   go run main.go
   ```

3. **Open Firefox with DevTools:**
   - F12 to open DevTools
   - Go to Console tab
   - Click gear icon → Enable all log levels
   - Check "Disable cache" in Network tab

4. **Test Flow:**
   - Host starts classroom session
   - Member joins session
   - Both see each other (count = 2)
   - Member clicks Leave Call
   - **Look for window.confirm dialog!**
   - **Look for handleExit entry log!**
   - Check member count (should drop to 1 and STAY at 1)
   - Check backend logs (should see NO REACTIVATION)

5. **If Issues Persist:**
   - Try Chrome/Edge instead of Firefox
   - Add `alert("handleExit called")` at line 2673
   - Check browser extensions (ad blockers, etc.)
   - Verify no service workers running

## Summary

**What we know:**
- ✅ Code implementation is correct
- ✅ Event-driven acknowledgment system complete
- ✅ Backend sends leave_acknowledged
- ❌ Frontend code not executing (no logs)
- ❌ disconnect() never called
- 🔴 Auto-reconnect happening due to refCount=1, reconnectAttempts=0

**Most likely cause:** Browser/dev server cache serving old code

**Solution:** System restart + cache clear + hard refresh

**Success indicator:** See all the logs listed in "Expected Success Criteria" section above

Good luck! 🍀 When you're back, start testing and check for that first log: 
```
🚨🚨🚨 [handleExit] ===== FUNCTION ENTRY =====
```

If you see it → We're on the right track!
If you don't → We need to investigate why handleExit isn't being called.
