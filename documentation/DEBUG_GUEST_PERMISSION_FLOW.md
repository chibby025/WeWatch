# Debug: Guest Permission Not Showing

## Expected Flow

```
1. Host selects guest from dropdown
   ↓
2. Frontend sends WebSocket: liveshare_grant_permission
   ↓
3. Backend updates database
   ↓
4. Backend broadcasts: liveshare_permission_granted (to specific user)
   ↓
5. Guest receives message
   ↓
6. Guest sets hasLiveSharePermission = true
   ↓
7. LeftSidebar shows "Join as Co-Host" button
```

---

## Debug Steps (Follow in Order)

### Step 1: Host Selects Guest
**Action:** Host opens LiveShare tab, selects guest from dropdown

**Expected Console Logs (Host):**
```javascript
🎙️ [GRANT PERMISSION] Host selecting guest: {
  guestId: 123,
  guestUsername: "John",
  sessionId: "abc-123"
}
📤 [GRANT PERMISSION] Sending WebSocket message: {
  type: "liveshare_grant_permission",
  data: { userId: 123 }
}
```

**❌ If you see:**
```javascript
❌ [GRANT PERMISSION] sendMessage function not available!
```
**Fix:** Check that `sendMessage` prop is passed to LiveShareManager from VideoWatch

---

### Step 2: Backend Receives Message
**Action:** Check backend logs

**Expected Backend Logs:**
```bash
🎬 [LiveShare] Handling message: liveshare_grant_permission from user 456
🎙️ [GRANT PERMISSION] Host 456 granting permission to user 123 in session abc-123
💾 [GRANT PERMISSION] Database updated - rows affected: 1
📤 [GRANT PERMISSION] Broadcasting to user 123 in room room-abc-123
✅ [GRANT PERMISSION] Permission granted successfully to user 123
```

**❌ If you DON'T see these logs:**
- WebSocket message not reaching backend
- Check WebSocket connection status
- Check if message handler is registered

**❌ If you see database error:**
```bash
❌ [GRANT PERMISSION] Database error: ...
```
- Check database connection
- Check `liveshare_participants` table exists
- Check session_id is valid

---

### Step 3: Guest Receives Message
**Action:** Check guest's browser console

**Expected Console Logs (Guest):**
```javascript
✅ [PERMISSION GRANTED] Received permission: {
  userId: 123,
  hasPermission: true,
  messageData: { hasPermission: true }
}
🎙️ [PERMISSION GRANTED] Setting hasLiveSharePermission = true
```

**❌ If you DON'T see these logs:**
- Message not reaching guest's browser
- Check WebSocket connection on guest side
- Check that guest is in the same room
- Check `BroadcastToUser` function in backend

---

### Step 4: LeftSidebar Updates
**Action:** Check guest's browser console for LeftSidebar logs

**Expected Console Logs (Guest):**
```javascript
📊 [LeftSidebar] Permission state: {
  isHost: false,
  hasLiveSharePermission: true,  // ← Should be TRUE now
  availableTabs: ['upload', 'liveshare'],  // ← Should include 'liveshare'
  currentUserId: 123,
  currentUserName: "John"
}
```

**Expected UI (Guest):**
- LiveShare tab should appear in sidebar
- Switch to LiveShare tab
- See green box: "✓ You've been invited as co-host!"
- See button: "Join as Co-Host 🎙️"

**❌ If hasLiveSharePermission is still false:**
- State not updating
- Check if VideoWatch is passing the prop correctly
- Check React DevTools for state value

---

## Common Issues & Fixes

### Issue 1: sendMessage not defined
**Symptom:** Console shows `❌ sendMessage function not available!`

**Fix:**
```javascript
// In VideoWatch.jsx, check that sendMessage is passed:
<LiveShareManager
  sendMessage={sendMessage}  // ← Make sure this exists
  ...
/>
```

---

### Issue 2: Guest not in same room
**Symptom:** Backend broadcasts but guest doesn't receive

**Fix:**
- Check that both host and guest have same `roomId`
- Check WebSocket connection status for guest
- Check browser console for WebSocket errors

---

### Issue 3: State not updating
**Symptom:** Guest receives message but UI doesn't update

**Fix:**
```javascript
// Check if setHasLiveSharePermission is called
// In VideoWatch.jsx, search for:
case "liveshare_permission_granted":
  setHasLiveSharePermission(true);  // ← Must be here
```

---

### Issue 4: Database not updating
**Symptom:** Backend error: `rows affected: 0`

**Fix:**
```sql
-- Check table exists
SELECT * FROM liveshare_participants 
WHERE session_id = 'YOUR_SESSION_ID';

-- If empty, check session_id matches
SELECT session_id FROM watch_sessions WHERE id = YOUR_ID;
```

---

## Quick Test Checklist

Open two browser tabs side by side:

**Tab 1 (Host):**
- [ ] Open browser console (F12)
- [ ] Login as user 1
- [ ] Create/join session
- [ ] Go to LiveShare tab
- [ ] Select guest from dropdown
- [ ] See logs: `🎙️ [GRANT PERMISSION] Host selecting guest`
- [ ] See logs: `📤 [GRANT PERMISSION] Sending WebSocket message`

**Tab 2 (Guest):**
- [ ] Open browser console (F12)
- [ ] Login as user 2 (different user)
- [ ] Join same session
- [ ] Wait for permission...
- [ ] See logs: `✅ [PERMISSION GRANTED] Received permission`
- [ ] See logs: `📊 [LeftSidebar] Permission state` with `hasLiveSharePermission: true`
- [ ] See LiveShare tab appear
- [ ] Click LiveShare tab
- [ ] See green "Join as Co-Host" button

**Backend Terminal:**
- [ ] See logs: `🎙️ [GRANT PERMISSION] Host ... granting permission to user ...`
- [ ] See logs: `💾 [GRANT PERMISSION] Database updated`
- [ ] See logs: `📤 [GRANT PERMISSION] Broadcasting to user ...`
- [ ] See logs: `✅ [GRANT PERMISSION] Permission granted successfully`

---

## If Still Not Working

### 1. Check WebSocket Connection
```javascript
// In guest's console, run:
console.log('WebSocket readyState:', window.ws?.readyState);
// Should be 1 (OPEN)
```

### 2. Check Room ID
```javascript
// In both tabs, run:
console.log('Room ID:', /* access your roomId variable */);
// Should be EXACTLY the same
```

### 3. Check User IDs
```javascript
// In both tabs, run:
console.log('User ID:', /* access your currentUser.id */);
// Should be DIFFERENT (host ≠ guest)
```

### 4. Manual Test
```javascript
// In guest's console, manually trigger:
setHasLiveSharePermission(true);
// Then check if LiveShare tab appears
// If YES: WebSocket message not reaching
// If NO: React state/prop passing issue
```

---

## Next Steps After Debug

Once you see the exact log where it breaks:

1. **If breaks at Step 1:** Frontend sendMessage issue
2. **If breaks at Step 2:** WebSocket/Backend routing issue
3. **If breaks at Step 3:** BroadcastToUser not working
4. **If breaks at Step 4:** React state propagation issue

Share the **exact console output** from both tabs and backend, and I can pinpoint the issue!
