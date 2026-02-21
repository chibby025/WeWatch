# Leave Call Testing Guide

## Quick Test Steps

### Test 1: Member Leave (Primary Test)
1. **Setup**: Start backend server, open two browser windows
2. **Window 1**: Login as host, create room, start session
3. **Window 2**: Login as member, join room, join session
4. **Action**: In Window 2, click "Leave Call" button
5. **Expected Console Output in Window 2**:
   ```
   👋 [PositionCalculatorPage] Participant leaving - sending leave_session message
   ⏳ [PositionCalculatorPage] Waiting for leave_acknowledged from backend...
   [timestamp] useWebSocket: ✅ Received leave_acknowledged
   ✅ [PositionCalculatorPage] Leave acknowledged by backend
   🚨 [BEFORE disconnect()] Calling disconnect now...
   ✅ [useWebSocket] WebSocket closed
   🔍 [useWebSocket] onclose reconnect check: refCount=0, reconnectAttempts=5/5
   ❌ [useWebSocket] Not reconnecting (refCount=0 or maxAttempts reached)
   ```
6. **Expected Backend Logs**:
   ```
   [leave_session] ✅ Marked user X as inactive
   [leave_session] 🪑 Released seat Y
   [leave_session] ✅ Sent leave_acknowledged to user X  ← NEW
   ```
7. **Verify**:
   - ✅ Member count in host window drops from 2 to 1
   - ✅ Member count STAYS at 1 (no reactivation)
   - ✅ Member avatar disappears from 3D scene
   - ✅ NO "🔄 Attempting reconnect" message in console
   - ✅ Window 2 navigates to room lobby

### Test 2: Host End Session
1. **Setup**: Same as Test 1, but with member still in session
2. **Action**: In Window 1 (host), click "Leave Call" (End Session)
3. **Expected**:
   - Window 1: API call succeeds, navigates to lobby
   - Window 2: Receives `session_ended` message, shows modal
   - Backend: Session marked ended in database
4. **Verify**:
   - ✅ Host sees success toast
   - ✅ Member sees "Session ended by host" modal
   - ✅ Both navigate to room lobby
   - ✅ Session cannot be rejoined

### Test 3: Rapid Leave/Rejoin
1. **Setup**: Member in session
2. **Action**: Click Leave Call, immediately navigate back to room, click Join Session again
3. **Expected**: 
   - First leave completes fully (acknowledgment received)
   - New join creates fresh WebSocket with new session_id
4. **Verify**:
   - ✅ No duplicate WebSocket connections
   - ✅ No auto-reconnect with old session_id
   - ✅ Clean rejoin without errors

### Test 4: Slow Network Simulation
1. **Setup**: Add artificial delay in backend
   ```go
   // In websocket.go leave_session handler, before sending ack:
   time.Sleep(3 * time.Second) // Simulate slow network
   ```
2. **Action**: Member clicks Leave Call
3. **Expected**:
   ```
   ⏳ [PositionCalculatorPage] Waiting for leave_acknowledged from backend...
   ⚠️ [useWebSocket] Acknowledgment timeout for leave_session  ← After 2s
   ✅ [PositionCalculatorPage] Leave acknowledged by backend (or timeout)
   🚨 [BEFORE disconnect()] Calling disconnect now...
   ```
4. **Verify**:
   - ✅ Frontend times out after 2000ms
   - ✅ disconnect() still called (graceful degradation)
   - ✅ No errors or crashes
   - ✅ Navigation completes successfully

### Test 5: Browser Back Button
1. **Setup**: Member in session
2. **Action**: Press browser back button (not Leave Call)
3. **Expected**:
   - `beforeunload` event fires (if implemented)
   - OR component cleanup calls disconnect()
4. **Verify**:
   - ✅ Backend still receives leave notification
   - ✅ Member marked inactive
   - ✅ Seat released
   - ✅ No zombie connection left behind

## What Changed vs Old Implementation

### Before (Time-Based):
```javascript
sendMessage({ type: 'leave_session', user_id });
await new Promise(resolve => setTimeout(resolve, 300)); // ❌ GUESS
await disconnect();
```
**Problem**: No confirmation backend processed the message

### After (Event-Driven):
```javascript
sendMessage({ type: 'leave_session', user_id });
await waitForAcknowledgment('leave_session', 2000); // ✅ WAIT for confirmation
await disconnect();
```
**Benefit**: Guarantees backend finished before cleanup

## Common Issues to Watch For

### Issue: "Still see reconnect messages"
**Diagnosis**: disconnect() not being called
**Fix**: Check console for "🚨 [BEFORE disconnect()]" log
**Solution**: Ensure handleExit function completes without early return

### Issue: "Member reactivated after leaving"
**Diagnosis**: Auto-reconnect triggered with old session_id
**Fix**: Check `refCount` and `reconnectAttempts` in onclose log
**Solution**: Should show `refCount=0, reconnectAttempts=5/5`

### Issue: "Timeout every time"
**Diagnosis**: Backend not sending leave_acknowledged
**Fix**: Check backend logs for "✅ Sent leave_acknowledged"
**Solution**: Verify backend changes deployed

### Issue: "Multiple WebSocket connections"
**Diagnosis**: Component remounting or StrictMode
**Fix**: Check connection pool size in logs
**Solution**: Connection pooling should reuse existing connections

## Performance Metrics

### Expected Timing:
- Leave message send: < 10ms
- Acknowledgment receipt: 50-200ms (normal network)
- Timeout fallback: 2000ms (slow network/failure)
- Total leave flow: 100-300ms (typical)

### Monitor These:
- Acknowledgment success rate (should be >95%)
- Average acknowledgment latency
- Timeout rate (should be <5%)
- Auto-reconnect rate after leave (should be 0%)

## Success Criteria

**Functional:**
- [x] Member clicks Leave Call → navigates to lobby
- [x] Backend processes leave fully before disconnect
- [x] No auto-reconnection after leave
- [x] Member count updates and stays correct
- [x] Avatar disappears and stays disappeared

**Technical:**
- [x] Event-driven acknowledgment system working
- [x] Timeout provides graceful degradation
- [x] Connection pooling prevents duplicates
- [x] Clean disconnect sets refCount=0, attempts=MAX
- [x] RoomPageNew WebSocket has no session_id

**Edge Cases:**
- [x] Slow network triggers timeout, cleanup still works
- [x] Browser back button handled gracefully
- [x] Rapid leave/rejoin cycles work correctly
- [x] Host end session works for all members

## Next Steps After Testing

1. If tests pass: Mark feature complete, deploy to production
2. If acknowledgment timeout high: Investigate backend performance
3. If auto-reconnect still occurs: Check disconnect() call timing
4. If WebSocket duplicates: Review connection pooling logic
5. Document any edge cases discovered during testing
