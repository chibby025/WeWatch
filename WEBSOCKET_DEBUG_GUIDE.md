# WebSocket Duplicate Connection Debugging Guide

## Problem Summary
The backend logs show that user 7's WebSocket connection is being recreated every ~2 seconds, causing:
- Duplicate connection detection
- Old connection cleanup
- Race conditions leading to "send on closed channel" panic

## Root Cause Analysis

### Primary Suspect: wsToken Dependency
The `useWebSocket` hook has `wsToken` in its dependency array:
```javascript
useEffect(() => {
  // ... connection logic
}, [roomId, wsToken]); // ⚠️ PROBLEM!
```

**Why this causes issues:**
1. If `useAuth` hook re-renders and returns a different `wsToken` reference (even with same value)
2. The useWebSocket effect triggers
3. Old WebSocket is cleaned up
4. New WebSocket connection is created
5. Backend sees duplicate → cleanup loop starts

### Secondary Suspects:
1. **Component remounting**: Check if `VideoWatch` is being unmounted/remounted repeatedly
2. **Multiple auth hook instances**: Check if `useAuth` is called multiple times in component tree
3. **Token regeneration**: Check if auth API is being called repeatedly

## Debug Logs Added

### Frontend Logging:
1. **VideoWatch.jsx**:
   - Component mount/unmount tracking
   - wsToken change tracking with counter

2. **useAuth.js**:
   - Effect trigger tracking
   - API call logging
   - wsToken set operations

3. **useWebSocket.js**:
   - Effect trigger tracking with dependencies
   - connectWebSocket call tracking with stack trace
   - Connection state transitions

### Backend Logging:
- WebSocketHandler entry point with timestamps
- Request headers for connection tracking

## How to Read the Logs

### Look for these patterns:

#### 1. Token Changes
```
🔍🔍🔍 [VideoWatch] wsToken CHANGED #1:
  old: "abc123..."
  new: "xyz789..."
```
**If you see this repeatedly** → Auth hook is regenerating tokens

#### 2. Effect Triggers
```
🔍 [useWebSocket] Effect TRIGGERED #timestamp:
  roomId: 108
  wsToken: "abc..."
  isConnectingRef: false
```
**Count how many times this fires** → Should be ONCE per component mount

#### 3. Component Mounting
```
🏁🏁🏁 [VideoWatch-timestamp] COMPONENT MOUNTED
```
**If you see multiple mounts** → Component is being recreated

#### 4. Auth Hook Triggers
```
🔍🔍🔍 [useAuth] Effect TRIGGERED #timestamp
```
**Should only fire ONCE** → If multiple, something is triggering re-renders

## Expected vs Actual Flow

### EXPECTED (Normal):
```
1. VideoWatch mounts
2. useAuth runs once → gets token
3. useWebSocket runs once → connects
4. Connection stays open until unmount
```

### ACTUAL (Broken):
```
1. VideoWatch mounts
2. useAuth runs
3. useWebSocket connects
4. (2 seconds later) useWebSocket effect re-triggers ❌
5. Old connection cleanup
6. New connection created
7. Repeat steps 4-6 forever
```

## Testing Instructions

1. **Start backend with logging:**
   ```bash
   cd backend
   go run cmd/server/main.go
   ```

2. **Start frontend:**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Open browser console and filter logs:**
   - Chrome DevTools → Console
   - Filter: `🔍` or `VideoWatch` or `useAuth` or `useWebSocket`

4. **Reproduce the issue:**
   - Login as user (e.g., chibi)
   - Navigate to room 108
   - **Wait and observe** for 30 seconds

5. **Collect logs:**
   - Frontend console logs
   - Backend terminal logs
   - Look for the patterns described above

## What to Look For

### Critical Questions:
1. **How many times does VideoWatch mount?**
   - Answer: Count `🏁🏁🏁 COMPONENT MOUNTED` logs
   - Expected: 1
   - If > 1: Component is remounting (parent re-rendering?)

2. **How many times does useAuth effect trigger?**
   - Answer: Count `🔍🔍🔍 [useAuth] Effect TRIGGERED` logs
   - Expected: 1
   - If > 1: Something is causing auth hook to re-run

3. **How many times does wsToken change?**
   - Answer: Count `🔍🔍🔍 [VideoWatch] wsToken CHANGED` logs
   - Expected: 0 (should be stable after initial set)
   - If > 0: Token is being regenerated

4. **How many times does useWebSocket effect trigger?**
   - Answer: Count `🔍 [useWebSocket] Effect TRIGGERED` logs
   - Expected: 1-2 (initial mount + token set)
   - If > 2: Dependencies are changing

5. **Are connections happening every 2 seconds?**
   - Answer: Check timestamps between `🔌🔌🔌 WebSocketHandler CALLED` logs
   - If ~2000ms interval: Confirms reconnection loop

## Potential Fixes

### Fix 1: Remove wsToken from useWebSocket dependencies (RECOMMENDED)
```javascript
// useWebSocket.js
useEffect(() => {
  if (!wsToken) return; // Wait for token
  reconnectAttemptRef.current = 0;
  const cleanup = connectWebSocket();
  return cleanup;
}, [roomId]); // ✅ Only reconnect when roomId changes
```

### Fix 2: Memoize wsToken in VideoWatch
```javascript
// VideoWatch.jsx
const stableWsToken = useMemo(() => wsToken, [wsToken]); // Already implemented
```

### Fix 3: Use a ref to track if already connected
```javascript
// useWebSocket.js
const hasConnectedRef = useRef(false);
useEffect(() => {
  if (hasConnectedRef.current) return;
  hasConnectedRef.current = true;
  const cleanup = connectWebSocket();
  return () => {
    hasConnectedRef.current = false;
    if (cleanup) cleanup();
  };
}, [roomId]);
```

## Next Steps

1. Run the test with logging enabled
2. Share the console logs (first 100 lines after page load)
3. Share the backend logs (connections section)
4. Identify which pattern matches the logs
5. Apply the appropriate fix based on findings

## Notes
- The `stableTokenRef` approach in VideoWatch.jsx was supposed to fix this, but the useWebSocket hook still has wsToken in deps
- The backend duplicate detection is working correctly - it's the frontend causing rapid reconnections
- The panic "send on closed channel" happens when a message arrives during cleanup
