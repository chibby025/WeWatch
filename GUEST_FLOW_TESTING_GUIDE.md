# Guest Flow Testing Guide

## Testing on Single System

### Camera Conflict Issue ⚠️
**Problem:** If host and guest both try to use the same physical camera, the second one will fail.

**Solutions:**

#### Option 1: Virtual Camera (Recommended)
1. **Install OBS Studio** (free)
2. **Enable Virtual Camera:**
   - OBS → Settings → Video → Start Virtual Camera
   - Browser will see "OBS Virtual Camera" as separate device
3. **Test Setup:**
   - Host uses real camera
   - Guest uses OBS Virtual Camera
   - Both work simultaneously

#### Option 2: Host Camera, Guest Screen
```
Host: Select "Camera" → Uses physical camera
Guest: Select "Screen" → Shares screen/window
Result: 2 streams, Split View layout
```

#### Option 3: Chrome DevTools Fake Camera
1. **Open Chrome DevTools** (F12)
2. **Three dots menu → More tools → Sensors**
3. **Override video input → fake_camera_0.y4m**
4. **Test Setup:**
   - Tab 1 (Host): Use fake camera
   - Tab 2 (Guest): Use real camera or another fake

#### Option 4: Phone as Guest
```
Host: Desktop browser with camera
Guest: Phone browser with phone camera
Result: Different devices, no conflict
```

---

## Testing Scenarios

### Scenario 1: Basic Guest Join (Camera + Camera)
**Setup:** Use Option 1 or 4 above

1. **Host:** Login, create session, Go Live
2. **Host:** Select guest from dropdown
3. **Guest:** Click "Join as Co-Host 🎙️"
4. **Guest:** Camera pre-selected, click "Accept & Go Live"

**Expected Results:**
- ✅ Guest invitation popup shows host name
- ✅ Camera is pre-selected
- ✅ Layout auto-switches to **Split View**
- ✅ Both cameras visible to members
- ✅ Host sees toast: "Guest joined - switched to split view"

**Database Check:**
```sql
SELECT user_id, role, share_type, status, joined_at 
FROM liveshare_participants 
WHERE session_id = 'YOUR_SESSION_ID';

-- Should show:
-- host: role=host, share_type=camera, status=active
-- guest: role=guest, share_type=camera, status=active
```

---

### Scenario 2: Guest Screen Share
**Setup:** Any option

1. **Host:** Go Live with camera
2. **Guest:** Accept invitation, select "Screen"
3. **Guest:** Choose window/screen to share

**Expected Results:**
- ✅ Layout auto-switches to **Split View**
- ✅ Host camera on one side, guest screen on other
- ✅ Members see both streams

**Database Check:**
```sql
-- Guest should have share_type=screen
SELECT share_type FROM liveshare_participants 
WHERE session_id = 'YOUR_SESSION_ID' AND role = 'guest';
```

---

### Scenario 3: Host "Both" + Guest Camera
**Setup:** Use Option 1 or 4

1. **Host:** Go Live, select "Screen + Camera"
2. **Guest:** Accept invitation, select "Camera"

**Expected Results:**
- ✅ Layout auto-switches to **Panel View**
- ✅ 3 total streams (host camera + host screen + guest camera)
- ✅ Panel layout: cameras on top, screen on bottom

---

### Scenario 4: Mid-Stream Share Type Switch
**Setup:** Guest already live with camera

1. **Guest:** Click "Switch Share Type"
2. **Guest:** Select "Screen"
3. **Guest:** Choose screen to share

**Expected Results:**
- ✅ Modal shows current type disabled (Camera)
- ✅ Guest stream stops and restarts with screen
- ✅ Layout recalculates if needed
- ✅ Host sees toast: "Guest switched to screen - layout updated"

**WebSocket Check:**
```javascript
// Should see in browser console:
🔄 [VideoWatch HOST] Guest switched to: screen
🎨 [VideoWatch HOST] Auto-switching to layout: split-view
```

**Database Check:**
```sql
-- Guest share_type should update
SELECT share_type FROM liveshare_participants 
WHERE session_id = 'YOUR_SESSION_ID' AND role = 'guest';
-- Should be 'screen' now
```

---

### Scenario 5: Guest Leaves
**Setup:** Guest is live

1. **Guest:** Close tab OR stop sharing
2. **Wait 2-3 seconds**

**Expected Results:**
- ✅ Guest state clears automatically
- ✅ Host layout reverts to smart default:
  - Host camera only → Solo View
  - Host screen only → Screen Share
  - Host both → Split View
- ✅ Host sees toast: "Guest left - layout restored"
- ✅ Database updated with left_at timestamp

**Database Check:**
```sql
SELECT status, left_at FROM liveshare_participants 
WHERE session_id = 'YOUR_SESSION_ID' AND role = 'guest';
-- Should show: status=left, left_at=[timestamp]
```

**Frontend Check:**
```javascript
// Guest state should clear
isGuest: false
guestShareType: null
showGuestSwitchType: false
```

---

### Scenario 6: "Both" Option Disabled for Guest
**Setup:** Guest receives permission

1. **Guest:** Click "Join as Co-Host 🎙️"
2. **Guest:** Look at invitation popup options

**Expected Results:**
- ✅ Only 2 options visible: Camera, Screen
- ✅ "Screen + Camera" option NOT visible
- ✅ Camera is pre-selected

---

### Scenario 7: Multiple Guests (Future)
**Current Status:** Only 1 guest supported

**Test:**
1. **Host:** Grant permission to User A
2. **User A:** Joins successfully
3. **Host:** Try to grant permission to User B

**Expected Results:**
- ⚠️ Current implementation: User B can also join (no enforcement)
- 🚀 Future: Show warning "Only 1 guest allowed"

---

## WebSocket Message Flow

### Guest Joins
```
1. Guest clicks "Accept"
   Frontend → Backend: liveshare_guest_joined
   {
     guestShareType: "camera",
     suggestedLayout: "split-view"
   }

2. Backend updates database
   liveshare_participants: status=active, share_type=camera

3. Backend broadcasts to room
   Backend → All Members: liveshare_guest_joined
   
4. Host receives and applies layout
   setSelectedLiveShareLayout("split-view")
```

### Guest Switches Type
```
1. Guest clicks new type
   Frontend → Backend: liveshare_guest_switched_type
   {
     newShareType: "screen",
     suggestedLayout: "split-view"
   }

2. Backend updates database
   liveshare_participants: share_type=screen

3. Backend broadcasts to room
   Backend → All Members: liveshare_guest_switched_type
   
4. Host receives and applies layout
```

### Guest Leaves
```
1. Guest stops sharing (detected by useEffect)
   Frontend → Backend: liveshare_guest_left
   {
     defaultLayout: "solo-view"
   }

2. Backend updates database
   liveshare_participants: status=left, left_at=NOW()

3. Backend broadcasts to room
   Backend → All Members: liveshare_guest_left
   
4. Host receives and reverts layout
```

---

## Browser Console Checks

### Host Console
```javascript
// When guest joins
🎙️ [VideoWatch HOST] Guest joined with share type: camera
🎨 [VideoWatch HOST] Auto-switching to layout: split-view
💾 [VideoWatch HOST] Saving previous layout: solo-view

// When guest switches
🔄 [VideoWatch HOST] Guest switched to: screen
🎨 [VideoWatch HOST] Auto-switching to layout: split-view

// When guest leaves
👋 [VideoWatch HOST] Guest left
🎨 [VideoWatch HOST] Reverting to layout: solo-view
```

### Guest Console
```javascript
// When joining
🎙️ [Guest] Accepting invitation with share type: camera
🎨 [Guest] Auto-selected layout: split-view

// When switching
🔄 [Guest] Switching from camera to screen

// When leaving
👋 [LiveShareManager GUEST] Guest stopped sharing - notifying host
🎨 [LiveShareManager GUEST] Suggesting default layout: solo-view
✅ [LiveShareManager GUEST] Guest state cleared
```

### Backend Logs
```bash
# Guest joins
🎬 [LiveShare] Handling message: liveshare_guest_joined from user 123
🎙️ [LiveShare] Guest 123 joined with type: camera, suggested layout: split-view
✅ [LiveShare] Guest joined broadcast sent

# Guest switches
🎬 [LiveShare] Handling message: liveshare_guest_switched_type from user 123
🔄 [LiveShare] Guest 123 switched to: screen, suggested layout: split-view
✅ [LiveShare] Guest switch type broadcast sent

# Guest leaves
🎬 [LiveShare] Handling message: liveshare_guest_left from user 123
👋 [LiveShare] Guest 123 left, suggested default layout: solo-view
✅ [LiveShare] Guest left broadcast sent, database cleaned up
```

---

## Known Limitations

### Single System Testing
- **Camera Conflict:** Browser can't share camera between tabs
- **Solution:** Use virtual camera, screen share, or phone

### Performance
- **3 Streams:** Panel view with 3 streams is CPU intensive
- **Test on strong system** or reduce video quality

### Browser Support
- **Chrome/Edge:** Full support
- **Firefox:** Full support
- **Safari:** May have camera permission issues

---

## Troubleshooting

### Guest Can't Join
**Check:**
1. Guest has permission granted (database)
2. No console errors
3. WebSocket connection active
4. Camera/screen permissions granted

**Fix:**
```sql
-- Manually grant permission
INSERT INTO liveshare_participants (session_id, user_id, role, status, granted_at)
VALUES ('session-id', 123, 'guest', 'granted', NOW())
ON CONFLICT (session_id, user_id) DO UPDATE SET status = 'granted';
```

### Layout Not Switching
**Check:**
1. Host receives WebSocket message
2. Console shows layout change
3. `selectedLiveShareLayout` state updates

**Fix:**
```javascript
// Manually set layout in console
window.setSelectedLiveShareLayout("split-view")
```

### Guest State Doesn't Clear
**Check:**
1. `liveShareContentMode` becomes null
2. useEffect detects change
3. WebSocket message sent

**Fix:**
```javascript
// Manually clear in console
setIsGuest(false);
setGuestShareType(null);
```

### Database Not Updating
**Check:**
1. Backend logs show SQL execution
2. No database errors
3. Session ID matches

**Fix:**
```bash
# Check backend logs
docker-compose logs -f backend | grep LiveShare

# Check database
psql -d wewatch_db -c "SELECT * FROM liveshare_participants WHERE session_id = 'YOUR_ID';"
```

---

## Success Criteria ✅

- [ ] Guest receives invitation popup
- [ ] Camera is pre-selected
- [ ] "Both" option not visible for guests
- [ ] Guest joins with one click
- [ ] Layout auto-switches to correct view
- [ ] Host sees toast notifications
- [ ] Both streams broadcast to members
- [ ] Guest can switch share type mid-stream
- [ ] Layout recalculates on switch
- [ ] Guest leave detected automatically
- [ ] Host layout reverts on guest leave
- [ ] Database updates correctly
- [ ] WebSocket messages broadcast
- [ ] No console errors
- [ ] Works on Chrome, Firefox, Edge

---

## Post-Testing

### If All Tests Pass
1. Mark feature as production-ready
2. Update user documentation
3. Create video tutorial
4. Monitor logs for first 24 hours

### If Tests Fail
1. Check browser console
2. Check backend logs
3. Check database state
4. Review WebSocket messages
5. Report specific scenario that failed

---

**Last Updated:** April 20, 2026  
**Status:** Ready for Testing  
**Tester:** Chibuzor
