# 🎥 LiveShare Testing Guide

## Overview
Test the collaborative broadcasting feature that allows hosts to grant members permission to share their screen/camera alongside the host.

---

## Test Prerequisites
- ✅ Backend server running on port 8080
- ✅ Frontend dev server running on port 5173
- ✅ At least 2 browser sessions (1 host + 1 member)
- ✅ Camera/screen share permissions enabled in browser

---

## Test Scenario 1: Cinema Mode - Regular Broadcast

### Host Actions:
1. **Create/Join Cinema Session**
   - Navigate to a room with Cinema watch type
   - Start a watch session (becomes host)
   - Verify LiveShare tab appears in left sidebar

2. **Select Broadcast Mode**
   - Click LiveShare tab in sidebar
   - Click "Start LiveShare" button
   - Select **"Regular"** mode (host + 1 guest)
   - Click "Continue"

3. **Select Share Type**
   - Choose Camera, Screen, or Both
   - If Camera: select device from dropdown
   - Click "Start Sharing"
   - Verify camera preview appears (if camera selected)

4. **Grant Permission to Member**
   - Verify Guest Manager UI appears
   - See list of session members
   - Click "Grant" button next to a member's name
   - Verify member status shows "Permission Granted" with pending badge

### Member Actions:
1. **Join Session**
   - Join the same cinema session as a regular member
   - Initially: LiveShare tab NOT visible

2. **Receive Permission**
   - Wait for host to grant permission
   - Verify toast notification: "You have been granted LiveShare permission! 🎥"
   - Verify LiveShare tab now appears in sidebar

3. **Join LiveShare**
   - Click LiveShare tab
   - Verify message: "You have been granted LiveShare permission!"
   - Click "Join Live" button
   - Select share type (Camera/Screen/Both)
   - If Camera: select device
   - Click "Start Sharing"

4. **Verify Broadcast**
   - Verify your camera/screen preview appears
   - Verify status changes to "Live" in host's Guest Manager

### Expected Results:
- ✅ Host sees own camera/screen in cinema
- ✅ Host sees guest camera/screen in secondary position
- ✅ Member sees both host and own streams
- ✅ All other session members see both streams
- ✅ Audio from both sources mixed properly

---

## Test Scenario 2: Podcast Mode (2 Cameras)

### Host Actions:
1. Start LiveShare
2. Select **"Podcast"** mode
3. Select **"Camera"** as share type
4. Grant permission to 1 member

### Member Actions:
1. Join with Camera only
2. Verify side-by-side camera layout

### Expected Results:
- ✅ Two camera feeds visible (host + guest)
- ✅ Audio from both participants
- ✅ Cannot add more than 1 guest (capacity limit)

---

## Test Scenario 3: Permission Management

### Revoke Permission Test:
1. Host grants permission to Member A
2. Member A does NOT join yet (status: pending)
3. Host clicks "Revoke" button
4. Verify Member A receives toast: "Your LiveShare permission was revoked 🔒"
5. Verify Member A's LiveShare tab disappears

### Kick Active Guest Test:
1. Host grants permission to Member B
2. Member B joins and starts sharing (status: active)
3. Host clicks "Kick" button
4. Verify Member B's stream ends immediately
5. Verify Member B receives toast: "You were removed from LiveShare 🚫"
6. Verify Member B's LiveShare tab disappears

---

## Test Scenario 4: Guest Leaves

1. Host grants permission to Member C
2. Member C joins and shares camera
3. Member C clicks "End Sharing" button
4. Verify host receives toast: "Guest left LiveShare 👋"
5. Verify guest slot becomes available for new member

---

## Test Scenario 5: Solo Modes

### News Mode Test:
1. Host selects **"News"** mode
2. Verify Guest Manager shows: "Solo broadcasting mode - no guests allowed"
3. Verify no Grant buttons visible
4. Host starts sharing screen
5. Verify only host's screen visible (no guest slot)

### Standup Mode Test:
1. Host selects **"Standup"** mode
2. Verify same solo behavior as News mode
3. Typically used for presentations/announcements

---

## Test Scenario 6: State Persistence

### Refresh Test:
1. Host starts LiveShare with mode selected
2. Member A has permission granted (not joined yet)
3. Host refreshes page
4. Verify:
   - ✅ Broadcast mode restored from database
   - ✅ Member A still has permission
   - ✅ LiveShare tab still visible for Member A

### Disconnect/Reconnect Test:
1. Host disconnects WiFi temporarily
2. Reconnect WiFi
3. Verify LiveShare state recovers correctly

---

## Test Scenario 7: Multiple Sessions

1. Create Session 1 in Room A
2. Create Session 2 in Room B
3. Host A grants permission to Member X in Session 1
4. Verify Member X only sees LiveShare tab in Session 1
5. Verify Session 2 members don't see Member X's permission

---

## Test Scenario 8: Edge Cases

### Case 1: Guest Joins Before Host Starts
1. Host grants permission but hasn't started sharing yet
2. Member tries to join
3. Verify appropriate error handling

### Case 2: Camera/Mic Permissions Denied
1. Member tries to join with Camera
2. Browser blocks camera access
3. Verify error message appears
4. Verify fallback to screen share option

### Case 3: Network Issues
1. Host starts sharing
2. Member joins
3. Simulate poor network (Chrome DevTools → Network → Slow 3G)
4. Verify graceful degradation

---

## Expected WebSocket Messages

### Host Starts (Mode Selection):
```json
{
  "type": "liveshare_mode_selected",
  "data": {
    "session_id": 123,
    "mode": "regular",
    "host_id": 1
  }
}
```

### Host Grants Permission:
```json
{
  "type": "liveshare_permission_granted",
  "data": {
    "session_id": 123,
    "host_id": 1,
    "guest_id": 2,
    "guest_username": "Alice",
    "mode": "regular"
  }
}
```

### Member Joins:
```json
{
  "type": "liveshare_guest_joined",
  "data": {
    "session_id": 123,
    "guest_id": 2,
    "guest_username": "Alice",
    "share_type": "camera",
    "position": 1
  }
}
```

### Host Kicks Guest:
```json
{
  "type": "liveshare_guest_kicked",
  "data": {
    "session_id": 123,
    "host_id": 1,
    "guest_id": 2
  }
}
```

---

## Database Verification

### Check LiveShare State:
```sql
-- View current session mode
SELECT id, liveshare_mode 
FROM watch_sessions 
WHERE id = [SESSION_ID];

-- View active participants
SELECT * 
FROM liveshare_participants 
WHERE session_id = [SESSION_ID] 
ORDER BY created_at DESC;
```

### Expected Database State After Test:
```sql
-- Session with mode set
watch_sessions.liveshare_mode = 'regular' (or 'podcast', 'interview', etc.)

-- Participant record
liveshare_participants:
- session_id: 123
- user_id: 2
- role: 'guest'
- status: 'active' (or 'granted', 'left')
- share_type: 'camera' (or 'screen', 'both')
- position: 1
- joined_at: timestamp
```

---

## REST API Verification

### Get LiveShare State:
```bash
curl http://localhost:8080/api/sessions/123/liveshare-state
```

### Expected Response:
```json
{
  "mode": "regular",
  "guest": {
    "userId": 2,
    "username": "Alice",
    "status": "active",
    "shareType": "camera",
    "position": 1,
    "grantedAt": "2026-03-04T10:30:00Z",
    "joinedAt": "2026-03-04T10:31:00Z"
  }
}
```

---

## Known Issues to Watch For
- ⚠️ Camera preview may not show on iOS Safari (use Screen Share instead)
- ⚠️ Multiple camera devices may require explicit selection
- ⚠️ WebRTC connections may fail on restrictive networks (corporate firewalls)
- ⚠️ Screen share may show black screen if app window selected (browser limitation)

---

## Success Criteria
✅ All 5 broadcast modes selectable
✅ Permission grant/revoke works instantly
✅ Guest can join and share successfully
✅ Kick functionality works immediately
✅ State persists across page refreshes
✅ Toast notifications appear for all actions
✅ Both streams visible in cinema
✅ Audio mixing works correctly
✅ Database records created/updated properly
✅ REST API returns correct state

---

## Debugging Tools
- Browser DevTools → Network tab → Filter "ws" (WebSocket messages)
- Browser DevTools → Console → Search "LiveShare"
- Backend logs → Search "LIVESHARE"
- Database queries → Check liveshare_participants table
- React DevTools → Check component props/state

---

## After Testing: Refactoring Notes
Once testing is complete and feature works correctly, refactor code based on `watchType`:
- Extract LiveShare logic into hooks (useLiveShare.js)
- Create separate components for Cinema vs Classroom vs VideoWatch
- Unify modal flows across watch types
- Add TypeScript types for LiveShare state
- Add comprehensive error boundaries
- Optimize WebSocket message handling
- Add loading states for all async operations
