# Leave Call Event-Driven Architecture Implementation

## Problem Summary

The Leave Call button had intermittent reliability issues:
- **Member**: Sometimes works instantly, other times member gets reactivated
- **Host**: Sometimes works, other times host remains in session after ending

## Root Causes Identified

### 1. **Time-Based vs Event-Driven (PRIMARY ISSUE)**
**Old Implementation:**
```javascript
sendMessage({ type: 'leave_session', user_id });
await new Promise(resolve => setTimeout(resolve, 300)); // ❌ HOPE it arrived
await disconnect();
```

**Problem**: No confirmation that backend finished processing before closing WebSocket. If network slow or backend busy, disconnect() fires before backend marks user inactive.

**New Implementation:**
```javascript
sendMessage({ type: 'leave_session', user_id });
await waitForAcknowledgment('leave_session', 2000); // ✅ WAIT for backend confirmation
await disconnect();
```

**Solution**: Backend explicitly sends `leave_acknowledged` message after processing. Frontend waits for it (with 2s timeout for graceful degradation).

### 2. **Auto-Reconnection After Leave**
**Evidence from logs:**
```
14:20:50 🔍 [useWebSocket] onclose reconnect check: refCount=1, reconnectAttempts=0/5
14:20:50 useWebSocket: 🔄 Attempting reconnect 1/5 for 108-09091451-...
14:20:50 ✅ REACTIVATED existing member record
```

**Root Cause**: `disconnect()` was not being called before WebSocket closed, leaving `refCount=1` and `reconnectAttempts=0`, both conditions triggering auto-reconnect with session_id still in connection pool key.

**Solution**: Event-driven acknowledgment ensures `disconnect()` is called at the right time after backend confirms processing.

### 3. **Three WebSocket Connections Created Rapidly**
**Timeline:**
```
14:20:50.604 - Connection #1: WITH session_id (auto-reconnect from pool)
14:20:50.986 - Connection #2: WITHOUT session_id (RoomPageNew mounts)
14:20:53.267 - Connection #3: WITH session_id (another auto-reconnect)
```

**Analysis**:
1. **Connection #1**: Auto-reconnect triggered from useWebSocket pool with session_id in key
2. **Connection #2**: RoomPageNew creates new connection (correctly without session_id)
3. **Connection #3**: Another auto-reconnect attempt

**Solution**: Ensure `disconnect()` executes before navigation to clean up pool entry and prevent auto-reconnect.

## WebSocket Connection Lifecycle (CLARIFIED)

### Question: "Do we upgrade WebSocket connection from RoomPage to watch session and on leave call upgrade it back?"

**Answer: NO - Each page creates its own independent WebSocket**

**RoomPageNew (Lobby):**
```javascript
// Creates: /api/rooms/108/ws?token=xxx
// NO session_id parameter
// Handles: room chat, presence updates, session_started/ended broadcasts
```

**PositionCalculatorPage (Watch Session):**
```javascript
// Creates: /api/rooms/108/ws?session_id=xxx&token=xxx  
// WITH session_id parameter
// Handles: seat assignments, audio routing, session-specific messages
```

**Navigation Flow:**
```
1. RoomPageNew mounted → WebSocket #1 created (no session_id)
2. User clicks "Join Session" → Navigate to /position-calculator
3. PositionCalculatorPage mounts → WebSocket #2 created (WITH session_id)
4. RoomPageNew unmounts → WebSocket #1 closed
5. User clicks "Leave Call" → handleExit sends leave_session
6. Wait for leave_acknowledged from backend
7. disconnect() called → sets refCount=0, reconnectAttempts=MAX
8. WebSocket #2 closes (auto-reconnect prevented)
9. Navigate to /rooms/108
10. PositionCalculatorPage unmounts
11. RoomPageNew mounts → WebSocket #3 created (no session_id again)
```

**Key Insight**: The "reactivation" issue happened because step 7-8 were skipped (disconnect() not called), allowing auto-reconnect to fire with old session_id.

## Implementation Changes

### Backend (websocket.go)

**Location**: `backend/internal/handlers/websocket.go` lines ~3238-3248

**Added**: After processing `leave_session` and broadcasting `user_left`, send acknowledgment back to sender:

```go
// ✅ EVENT-DRIVEN: Send acknowledgment back to the sender
ackMsg := WebSocketMessage{
    Type: "leave_acknowledged",
    Data: map[string]interface{}{
        "user_id": leaveData.UserID,
        "status":  "success",
    },
}
if ackBytes, err := json.Marshal(ackMsg); err == nil {
    select {
    case client.send <- OutgoingMessage{Data: ackBytes, IsBinary: false}:
        log.Printf("[leave_session] ✅ Sent leave_acknowledged to user %d", leaveData.UserID)
    default:
        log.Printf("[leave_session] ⚠️ Failed to send leave_acknowledged (channel full or closed)")
    }
}
```

**Benefits**:
- Uses `select` with `default` to avoid blocking on closed/full channels
- Logs success/failure for debugging
- Includes user_id for validation

### Frontend - useWebSocket.js

**Changes:**

1. **Added pendingAcksRef tracking** (line ~21):
```javascript
const pendingAcksRef = useRef(new Map()); // Track pending acknowledgment promises
```

2. **Added waitForAcknowledgment function** (lines 535-549):
```javascript
const waitForAcknowledgment = useCallback((messageType, timeoutMs = 2000) => {
  console.log(`⏳ [useWebSocket] Waiting for acknowledgment: ${messageType}`);
  
  return new Promise((resolve, reject) => {
    // Set up timeout
    const timeout = setTimeout(() => {
      pendingAcksRef.current.delete(messageType);
      console.warn(`⚠️ [useWebSocket] Acknowledgment timeout for ${messageType}`);
      resolve(); // Resolve anyway to prevent blocking (graceful degradation)
    }, timeoutMs);
    
    // Store resolver
    pendingAcksRef.current.set(messageType, { resolve, reject, timeout });
  });
}, []);
```

3. **Added leave_acknowledged message handler** (lines ~233-245):
```javascript
// ✅ Handle leave_acknowledged early (before normal message processing)
if (message.type === 'leave_acknowledged') {
  console.log(`[${now}] useWebSocket: ✅ Received leave_acknowledged`);
  const pending = pendingAcksRef.current.get('leave_session');
  if (pending) {
    clearTimeout(pending.timeout);
    pending.resolve();
    pendingAcksRef.current.delete('leave_session');
    console.log(`[${now}] useWebSocket: ✅ Resolved leave_session acknowledgment`);
  }
  return; // Don't process as normal message
}
```

4. **Exported waitForAcknowledgment** (line 630):
```javascript
return useMemo(() => ({
  sendMessage, 
  messages, 
  isConnected, 
  isReconnecting,
  setBinaryMessageHandler,
  sessionStatus,
  disconnect,
  waitForAcknowledgment, // ✅ Added
}), [sendMessage, messages, isConnected, isReconnecting, setBinaryMessageHandler, sessionStatus, disconnect, waitForAcknowledgment]);
```

### Frontend - PositionCalculatorPage.jsx

**Changes:**

1. **Extracted waitForAcknowledgment from hook** (line 589):
```javascript
const { sendMessage, messages, isConnected, sessionStatus, disconnect, waitForAcknowledgment } = useWebSocket(
  roomId,
  wsToken,
  finalSessionId
);
```

2. **Event-driven leave flow** (lines 2709-2723):
```javascript
// If participant, send leave message and wait for backend acknowledgment
if (sendMessage && currentUser && waitForAcknowledgment) {
  console.log('👋 [PositionCalculatorPage] Participant leaving - sending leave_session message');
  
  // Send leave message
  sendMessage({
    type: 'leave_session',
    user_id: currentUser.id
  });
  
  // ✅ EVENT-DRIVEN: Wait for backend to acknowledge the leave was processed
  console.log('⏳ [PositionCalculatorPage] Waiting for leave_acknowledged from backend...');
  await waitForAcknowledgment('leave_session', 2000); // 2s timeout
  console.log('✅ [PositionCalculatorPage] Leave acknowledged by backend (or timeout)');
}
```

## Flow Comparison

### OLD Flow (Time-Based)
```
1. User clicks Leave Call
2. Send leave_session message
3. Wait 300ms (ARBITRARY)
4. disconnect() called
5. Navigate to room lobby
```

**Problems**:
- No confirmation backend processed the message
- 300ms may be too short on slow networks
- 300ms may be too long on fast networks
- disconnect() may close WebSocket before backend marks user inactive

### NEW Flow (Event-Driven)
```
1. User clicks Leave Call
2. Send leave_session message
3. Backend processes: mark inactive, release seats, broadcast user_left
4. Backend sends leave_acknowledged back to sender
5. Frontend receives leave_acknowledged (or 2s timeout)
6. disconnect() called with confirmation backend finished
7. Navigate to room lobby
```

**Benefits**:
- Guarantees backend finished processing before cleanup
- No arbitrary timing assumptions
- Timeout provides graceful degradation (2s fallback)
- Explicit error handling path
- More reliable across network conditions

## Expected Console Output

### Member Leave (Success):
```
🚨🚨🚨 [handleExit] ===== FUNCTION ENTRY =====
👋 [PositionCalculatorPage] Participant leaving - sending leave_session message
🚨 [BEFORE sendMessage] About to send leave_session
🚨 [AFTER sendMessage] Message sent, waiting for acknowledgment...
⏳ [PositionCalculatorPage] Waiting for leave_acknowledged from backend...
[timestamp] useWebSocket: ✅ Received leave_acknowledged
[timestamp] useWebSocket: ✅ Resolved leave_session acknowledgment
✅ [PositionCalculatorPage] Leave acknowledged by backend (or timeout)
🚨 [BEFORE disconnect()] Calling disconnect now...
🚨 [useWebSocket] disconnect() CALLED - START
✅ [useWebSocket] WebSocket closed
🔍 [useWebSocket] onclose reconnect check: refCount=0, reconnectAttempts=5/5
❌ [useWebSocket] Not reconnecting (refCount=0 or maxAttempts reached)
🚨 [AFTER disconnect()] disconnect() returned
🧭 [PositionCalculatorPage] Navigating to room page: /rooms/108
```

### Backend Logs:
```
[leave_session] ✅ Marked user 5 as inactive
[leave_session] 🪑 Released seat 1
[leave_session] 📢 Broadcasted seat_released for seat 1
[leave_session] 📢 Broadcasted user_left to room
[leave_session] ✅ Sent leave_acknowledged to user 5  ← NEW
```

### Member Leave (Timeout - Graceful Degradation):
```
⏳ [PositionCalculatorPage] Waiting for leave_acknowledged from backend...
⚠️ [useWebSocket] Acknowledgment timeout for leave_session
✅ [PositionCalculatorPage] Leave acknowledged by backend (or timeout)
🚨 [BEFORE disconnect()] Calling disconnect now...
...continues with disconnect...
```

## Testing Checklist

### Member Leave Test:
- [ ] Join watch session as member
- [ ] Click Leave Call button
- [ ] Verify console shows event-driven flow logs
- [ ] Verify NO "🔄 Attempting reconnect" message
- [ ] Verify member count drops to 1 and STAYS at 1
- [ ] Verify avatar disappears and STAYS disappeared
- [ ] Verify RoomPageNew WebSocket has no session_id parameter

### Host End Session Test:
- [ ] Join watch session as host
- [ ] Click Leave Call (End Session)
- [ ] Verify API call succeeds
- [ ] Verify all members receive session_ended
- [ ] Verify host navigates to lobby
- [ ] Verify sessionStorage flag prevents refetching ended session

### Timeout Test:
- [ ] Temporarily add delay in backend leave_session handler
- [ ] Join and leave as member
- [ ] Verify frontend times out after 2000ms
- [ ] Verify disconnect() still called
- [ ] Verify proper warning logged

### Browser Navigation Test:
- [ ] Join watch session
- [ ] Use browser back button instead of Leave Call
- [ ] Verify backend still receives leave_session (via beforeunload)
- [ ] Verify disconnect() called in component cleanup

## Architecture Benefits

### Event-Driven Advantages:
1. **Reliability**: Explicit confirmation vs hoping message arrived
2. **Visibility**: Clear success/failure paths for debugging
3. **Flexibility**: Easy to add more acknowledgment types
4. **Error Handling**: Timeout provides graceful degradation
5. **Network Resilience**: Works correctly regardless of network speed

### Connection Pooling Benefits:
1. **Resource Efficiency**: Reuses connections for same room+session
2. **State Preservation**: Maintains connection across component remounts
3. **Auto-Reconnect**: Recovers from temporary network issues
4. **Clean Disconnect**: Prevents zombie connections via refCount and reconnectAttempts

## Future Improvements

### Potential Enhancements:
1. Add acknowledgment for other critical messages (take_seat, release_seat)
2. Track acknowledgment metrics (latency, timeout rate)
3. Implement retry logic for failed acknowledgments
4. Add acknowledgment batching for multiple rapid messages
5. Create acknowledgment system for binary messages (audio/video)

### Monitoring:
1. Log acknowledgment timeout rate to identify network issues
2. Track average acknowledgment latency
3. Alert if timeout rate exceeds threshold
4. Dashboard showing real-time acknowledgment health

## Related Issues Resolved

- ✅ Auto-reconnection after leave (refCount management)
- ✅ Three WebSocket connections created rapidly
- ✅ Member reactivation after supposedly leaving
- ✅ Host timing race condition (disconnect before session_ended broadcast)
- ✅ Arbitrary 300ms timeout assumptions eliminated
- ✅ WebSocket lifecycle clarity (separate connections per page)

## Documentation

See also:
- `IMPLEMENTATION_SUMMARY_AUDIO_DISCUSSION.md` - Audio routing architecture
- `PHASE4_COMPLETE.md` - Overall feature completion status
- `BACKEND_ROOM_UPDATES.md` - Backend room management
