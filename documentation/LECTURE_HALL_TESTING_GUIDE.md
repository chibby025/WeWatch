# Lecture Hall Testing Guide

## 📊 Implementation & Testing Status

### ✅ COMPLETED & TESTED (December 21, 2025)

#### Backend Implementation
- ✅ Database migration 021: Added `class_type` column to `watch_sessions` table
- ✅ JWT token validation in `auth.go` before returning ws_token
- ✅ WebSocket handlers: raise_hand, approve_speaker, revoke_speaker, leave_session

#### Frontend Core Features
- ✅ Lecture hall 3D scene with 145-seat layout (144 students + 1 teacher)
- ✅ Seat assignment system (host at seat 145, students at seats 1-144)
- ✅ Host camera position: X: 9.36, Y: 29.70, Z: -222.55
- ✅ Host camera orientation: Faces students (toward positive Z direction)
- ✅ 3D model loading: `/models/lecture_hall.glb`
- ✅ WebSocket connection with proper JWT authentication
- ✅ Dedicated Raise Hand button in taskbar (students only, between Members and Settings)
- ✅ Keyboard controls: WASD (forward/back/left/right) + CV (down/up)
- ✅ View lock/unlock toggle (L key)

#### Taskbar & UI
- ✅ Defensive coding for all taskbar button handlers
- ✅ Taskbar buttons: Audio, Video, Chat, Seats, Members, Share Room, Raise Hand, Settings, Leave
- ✅ Raise hand button shows 🙋 when raised, pulses while waiting for approval
- ✅ Missing handlers implemented: handleOpenChat, handleSeatsClick, handleShareRoom

#### Leave/Exit Logic
- ✅ Complete handleExit implementation with confirmation dialog
- ✅ Host ending session: Confirmation prompt "End this lecture hall session for everyone?"
- ✅ Session end API call: POST `/api/rooms/watch-sessions/{sessionId}/end`
- ✅ Cleanup: Audio stop, WebSocket disconnect, sessionStorage clear
- ✅ Navigation: Redirects to `/rooms/{roomId}` (plural, not /room/)
- ✅ Student leave: Just exits without ending session for others

#### Bug Fixes Applied
- ✅ Fixed 3D model path from `/3d-models/` to `/models/`
- ✅ Fixed useWebSocket parameters (wsToken from sessionStorage, not session_id UUID)
- ✅ Fixed W/S key reversal (W moves forward/z+, S moves backward/z-)
- ✅ Fixed camera target direction (z + 10 instead of z - 10 to face students)
- ✅ Fixed OrbitControls target update in useEffect for consistent initial view
- ✅ Fixed navigation route from `/room/` to `/rooms/`

### 🔄 IMPLEMENTED BUT NOT TESTED

#### Audio System
- ⏳ Row-based audio routing (students in same row hear each other)
- ⏳ Host broadcasts to all students
- ⏳ Audio device selection
- ⏳ useLectureHallAudio hook with getAudioRecipients function

#### Raise Hand System
- ⏳ Student raises hand (backend ready, UI implemented)
- ⏳ Host receives notification badge on Members button
- ⏳ Quick approval popup with approve/deny buttons
- ⏳ Host approves speaker → student broadcasts to all
- ⏳ Host revokes permission
- ⏳ Student lowers hand manually

#### Members Modal
- ⏳ LectureHallMembersModal component exists
- ⏳ View all participants with seat numbers
- ⏳ "🙋 Raised Hands" section (expandable)
- ⏳ "📢 Currently Broadcasting" section
- ⏳ Mute individual students
- ⏳ "Mute All Students" button

### ❌ NOT YET IMPLEMENTED

#### Chat System
- ❌ Chat modal UI (handleOpenChat shows console message placeholder)
- ❌ Send messages functionality
- ❌ Message display/history

#### Additional Features
- ❌ Seat swap notifications (backend ready, UI partially implemented)
- ❌ Emote sounds integration (loaded but not tested)
- ❌ Avatar position updates for remote participants
- ❌ Video camera support (currently disabled for lecture hall)

### 🐛 KNOWN ISSUES
- None currently blocking testing

### 📝 NEXT TESTING PRIORITIES
1. **Audio Routing** - Test row-based audio and host broadcast
2. **Raise Hand System** - Full flow from raise → approve → broadcast → revoke
3. **Members Modal** - All sections and functionality
4. **Chat System** - Requires implementation first
5. **Seat Swapping** - Request/accept/decline flow

---

## 🧪 Complete Testing Checklist

This guide provides step-by-step instructions for testing all lecture hall features including raise hand system, audio routing, and seat management.

## 🛠️ Test Environment Setup

### Requirements
- 3+ browser windows (Chrome/Firefox/Edge recommended)
- 3 separate user accounts OR use incognito mode with different logins
- Working microphone for each window
- Stable internet connection
- Backend server running on localhost:8080
- Frontend dev server running on localhost:5173

### Test Accounts
```
User 1: Host/Teacher
- Email: teacher@test.com
- Role: Host

User 2: Student A
- Email: student1@test.com
- Role: Student

User 3: Student B
- Email: student2@test.com
- Role: Student
```

### Browser Setup
```
Window 1: Chrome (User 1 - Teacher)
Window 2: Chrome Incognito (User 2 - Student A)
Window 3: Firefox (User 3 - Student B)
```

---

## 📋 Test Suite 1: Session Creation & Seating

### Test 1.1: Create Lecture Hall Session
**User:** Teacher (Window 1)

**Steps:**
1. Navigate to `/room/{roomId}`
2. Click "Start Watch Session"
3. Select "Classroom" watch type
4. In ClassTypeModal, select "Lecture Hall (145 seats)"
5. Complete pricing modal if applicable
6. Click "Start Session"

**Expected Result:**
- ✅ Redirected to `/lecture-hall/{roomId}?session_id={sessionId}`
- ✅ 3D lecture hall loads
- ✅ Teacher assigned to seat 145 (gold marker at podium)
- ✅ Camera view facing students
- ✅ "👨‍🏫 Host Position" badge visible top-left

### Test 1.2: Student Joins Session
**User:** Student A (Window 2), Student B (Window 3)

**Steps:**
1. Navigate to same room URL
2. Join active session (should see session in room page)
3. Click join button

**Expected Result:**
- ✅ Student A assigned to available seat (1-144)
- ✅ Student B assigned to different available seat
- ✅ Seat info shows: "🎓 Seat #{number}, Row X, Column Y"
- ✅ Camera view appropriate for seat position
- ✅ Other participants' avatars visible
- ✅ Toast notification: "Student A joined" (in teacher window)

### Test 1.3: Verify Seating Assignments
**User:** All users

**Steps:**
1. Each user checks their seat badge (top-left)
2. Teacher checks Members modal
3. Verify all seats are unique

**Expected Result:**
- ✅ Teacher: Seat 145
- ✅ Student A: Seat 1-144 (unique)
- ✅ Student B: Seat 1-144 (unique, different from A)
- ✅ Members modal shows all 3 users with seat numbers

---

## 📋 Test Suite 2: Audio Routing (Row-Based)

### Test 2.1: Default Row-Based Audio
**Users:** Student A (Row 1), Student B (Row 5)

**Setup:**
- Ensure Student A is in Row 1 (seats 1-18)
- Ensure Student B is in Row 5 (seats 73-90)
- If not, use seat swapping to arrange

**Steps:**
1. Student A clicks Audio button (unmute)
2. Student A speaks: "Testing row audio from Row 1"
3. Student B listens
4. Student B clicks Audio button (unmute)
5. Student B speaks: "Testing row audio from Row 5"

**Expected Result:**
- ✅ Student A audio button shows "🎤 Row Talk" (green)
- ✅ Student B does NOT hear Student A ❌
- ✅ Student B audio button shows "🎤 Row Talk" (green)
- ✅ Student A does NOT hear Student B ❌
- ✅ Both see "Row Talk" subtitle on audio button
- ✅ WebSocket logs show broadcast_scope: "row"

### Test 2.2: Same Row Audio
**Users:** Student A, Student C (both Row 1)

**Setup:**
- Both students in Row 1 (seats 1-18)

**Steps:**
1. Student A unmutes and speaks
2. Student C listens
3. Student C unmutes and speaks
4. Student A listens

**Expected Result:**
- ✅ Student C HEARS Student A ✅
- ✅ Student A HEARS Student C ✅
- ✅ Audio button shows "🎤 Row Talk" for both
- ✅ Members modal shows both with "🎤 Speaking - Row 1"

### Test 2.3: Teacher Broadcasts to All
**Users:** Teacher, Student A, Student B

**Steps:**
1. Teacher clicks Audio button (unmute)
2. Teacher speaks: "Good morning class, testing audio"
3. Student A listens
4. Student B listens

**Expected Result:**
- ✅ Student A HEARS teacher ✅
- ✅ Student B HEARS teacher ✅
- ✅ Teacher audio button shows "🎤 Mic ON"
- ✅ Subtitle shows: "Broadcasting to All (2)" or similar
- ✅ WebSocket logs show broadcast_scope: "room"
- ✅ All students hear regardless of row

---

## 📋 Test Suite 3: Raise Hand System

### Test 3.1: Student Raises Hand
**Users:** Student A

**Steps:**
1. Student A right-clicks Audio button
2. Observe audio button change
3. Click Audio Settings dropdown
4. Verify button text

**Expected Result:**
- ✅ Audio button changes to 🙋 yellow emoji
- ✅ Subtitle shows "🙋 Hand Raised"
- ✅ Audio settings dropdown shows "🙋 Lower Hand" button
- ✅ Explanatory text: "⏳ Waiting for host approval..."
- ✅ Teacher window shows toast: "🙋 Student A raised their hand"

### Test 3.2: Teacher Sees Notification
**Users:** Teacher

**Steps:**
1. Check Members button in taskbar
2. Observe badge

**Expected Result:**
- ✅ Members button shows 🙋 badge with "1"
- ✅ Members button pulses for attention
- ✅ Subtitle shows "🙋 1" below button

### Test 3.3: Quick Approval Popup
**Users:** Teacher

**Steps:**
1. Click Members button (with raised hands pending)
2. Observe popup
3. Verify popup contents

**Expected Result:**
- ✅ Popup appears at bottom center
- ✅ Header: "🙋 Raised Hands (1)"
- ✅ Entry shows: Avatar, "Student A", "Seat #X"
- ✅ Two buttons: "[✓ Approve]" "[✗]"
- ✅ Footer button: "View All in Members Modal"

### Test 3.4: Host Approves Speaker
**Users:** Teacher, Student A

**Steps:**
1. Teacher clicks "✓ Approve" in quick popup
2. Student A observes changes
3. Teacher checks Members modal

**Expected Result:**
- ✅ Popup entry removes Student A
- ✅ Badge count decrements to 0
- ✅ Popup auto-closes (if last hand)
- ✅ Student A sees green banner: "📢 Broadcasting to All"
- ✅ Student A audio button changes to 📢 gold speaker (pulsing)
- ✅ Subtitle: "📢 Broadcasting"
- ✅ Audio settings shows: "📢 You're broadcasting to everyone"
- ✅ Members modal "📢 Currently Broadcasting" section shows Student A
- ✅ Toast notification: "Host approved your request to speak"

### Test 3.5: Approved Student Broadcasts
**Users:** Student A (approved), Student B (different row)

**Steps:**
1. Student A unmutes microphone
2. Student A speaks: "Testing approved broadcast"
3. Student B listens
4. Teacher listens

**Expected Result:**
- ✅ Student B HEARS Student A ✅
- ✅ Teacher HEARS Student A ✅
- ✅ Audio button shows 📢 gold speaker (pulsing)
- ✅ Members modal shows "🎤 Broadcasting" for Student A
- ✅ WebSocket logs show broadcast_scope: "room"
- ✅ All users in room receive audio (145 potential recipients)

### Test 3.6: Multiple Raised Hands
**Users:** Student A, Student B, Student C

**Steps:**
1. Student A raises hand
2. Student B raises hand
3. Student C raises hand
4. Teacher checks Members button
5. Teacher opens quick popup

**Expected Result:**
- ✅ Badge shows "🙋 3"
- ✅ Popup lists all 3 students with seat numbers
- ✅ Scrollable if more than 5 students
- ✅ Each has independent Approve/Deny buttons
- ✅ Toast notifications for each raise

### Test 3.7: Host Denies Request
**Users:** Teacher, Student B

**Steps:**
1. Student B has hand raised
2. Teacher clicks "✗" deny button
3. Student B observes changes

**Expected Result:**
- ✅ Student B removed from popup list
- ✅ Badge count decrements
- ✅ Student B audio button returns to normal (🔇 or 🎤)
- ✅ Student B sees toast: "Request denied" or similar
- ✅ No approval granted

### Test 3.8: Student Lowers Hand
**Users:** Student A

**Steps:**
1. Student A has hand raised (not yet approved)
2. Student A right-clicks Audio button OR clicks "Lower Hand" in settings
3. Teacher observes changes

**Expected Result:**
- ✅ Audio button returns to normal (🔇 or 🎤)
- ✅ Subtitle returns to "Mic OFF" or "Row Talk"
- ✅ Teacher's badge count decrements
- ✅ Student A removed from teacher's popup

### Test 3.9: Host Revokes Permission
**Users:** Teacher, Student A (currently approved)

**Steps:**
1. Student A is approved and broadcasting
2. Teacher opens Members modal
3. Teacher goes to "📢 Currently Broadcasting" section
4. Teacher clicks "🚫 Revoke" button for Student A
5. Student A observes changes

**Expected Result:**
- ✅ Student A sees toast: "Host revoked broadcast permission"
- ✅ Audio button changes from 📢 to 🎤 (row talk)
- ✅ Subtitle changes to "Row Talk" or "Mic OFF"
- ✅ Audio settings shows default state
- ✅ Members modal moves Student A out of "Broadcasting" section
- ✅ Student A's audio now row-based only
- ✅ Students in other rows stop hearing Student A

---

## 📋 Test Suite 4: Members Modal

### Test 4.1: Open Members Modal
**Users:** Teacher

**Steps:**
1. Click Members button (without raised hands)
2. Observe modal contents

**Expected Result:**
- ✅ Modal opens with 3 sections
- ✅ Header: "Lecture Hall Participants (3)"
- ✅ "🔇 Mute All Students" button visible
- ✅ Teacher section at top (yellow background)
- ✅ Teacher shows "👨‍🏫 Teacher" badge
- ✅ "📢 Broadcasts to everyone" status

### Test 4.2: Raised Hands Section
**Users:** Teacher (with Student A's hand raised)

**Steps:**
1. Student A raises hand
2. Teacher opens modal
3. Click "🙋 Raised Hands" section to expand

**Expected Result:**
- ✅ Section shows badge "1" with pulse animation
- ✅ Expands to show Student A
- ✅ Shows avatar, name, seat number
- ✅ "[✓ Approve]" and "[✗]" buttons present
- ✅ Empty state if no hands: "No students have raised their hands"

### Test 4.3: Currently Broadcasting Section
**Users:** Teacher (with Student A approved)

**Steps:**
1. Student A is approved
2. Teacher opens modal
3. Click "📢 Currently Broadcasting" section

**Expected Result:**
- ✅ Section shows badge with count
- ✅ Expands to show Student A
- ✅ Shows audio status: "🎤 Speaking" or "🔇 Muted"
- ✅ Seat number and "Broadcasts to all" text
- ✅ "[🔇 Mute]" button (if speaking)
- ✅ "[🚫 Revoke]" button
- ✅ Empty state if none: "No students currently broadcasting"

### Test 4.4: All Students Section
**Users:** Teacher

**Steps:**
1. Teacher opens modal
2. Click "👥 All Students" section
3. Review student list

**Expected Result:**
- ✅ Shows all students (2 in this test)
- ✅ Each shows avatar, name, seat number
- ✅ Audio status: "🎤 Broadcasting", "🎤 Row Talk", or "🔇 Muted"
- ✅ Visual indicators: 🙋 (hand raised), 📢 (can broadcast)
- ✅ Message button for each student
- ✅ Empty state if no students: "No students in session"

### Test 4.5: Footer Info
**Users:** Teacher

**Steps:**
1. Scroll to bottom of modal
2. Read footer information

**Expected Result:**
- ✅ Shows two info boxes
- ✅ "Default Audio Mode: 💬 Row-based conversations"
- ✅ "Approved Students: 📢 Broadcast to everyone"

---

## 📋 Test Suite 5: Audio Settings Dropdown

### Test 5.1: Student View (Default)
**Users:** Student A (no approval)

**Steps:**
1. Right-click Audio button
2. Observe dropdown contents

**Expected Result:**
- ✅ Microphone device selector
- ✅ "Watch in Silence" checkbox
- ✅ Divider line
- ✅ "🙋 Raise Hand to Speak to All" button (blue)
- ✅ Explanation: "💬 Default: Speak to your row only"

### Test 5.2: Student View (Hand Raised)
**Users:** Student A (hand raised, not approved)

**Steps:**
1. Student A raises hand
2. Right-click Audio button
3. Observe dropdown contents

**Expected Result:**
- ✅ "🙋 Lower Hand" button (yellow)
- ✅ Explanation: "⏳ Waiting for host approval..."
- ✅ No "Raise Hand" button

### Test 5.3: Student View (Approved)
**Users:** Student A (approved by host)

**Steps:**
1. Student A is approved
2. Right-click Audio button
3. Observe dropdown contents

**Expected Result:**
- ✅ Green banner: "📢 Broadcasting to All"
- ✅ Banner text: "Host approved your request. Everyone can hear you!"
- ✅ "🙋 Lower Hand" button (to cancel broadcast)
- ✅ Explanation: "📢 Your mic broadcasts to everyone"

### Test 5.4: Host View
**Users:** Teacher

**Steps:**
1. Right-click Audio button
2. Observe dropdown contents

**Expected Result:**
- ✅ Microphone device selector
- ✅ "Watch in Silence" checkbox
- ✅ NO raise hand section (host always broadcasts)
- ✅ Standard audio controls only

---

## 📋 Test Suite 6: Seat Swapping

### Test 6.1: Request Seat Swap
**Users:** Student A, Student B

**Steps:**
1. Student A notes current seat
2. Student A clicks on Student B's avatar in 3D scene
3. Student B receives notification

**Expected Result:**
- ✅ Popup appears for Student B
- ✅ Shows: "Student A wants to swap seats"
- ✅ Shows: "Seat #X ↔️ Seat #Y"
- ✅ "[✓ Accept]" and "[✗ Decline]" buttons

### Test 6.2: Accept Swap
**Users:** Student A, Student B

**Steps:**
1. Student B clicks "✓ Accept"
2. Both students observe changes

**Expected Result:**
- ✅ Student A moves to Student B's old seat
- ✅ Student B moves to Student A's old seat
- ✅ Seat badges update immediately
- ✅ Camera positions update
- ✅ Avatar positions update in 3D scene
- ✅ Toast notifications: "Swap successful"
- ✅ Row audio routing updates (if different rows)

### Test 6.3: Decline Swap
**Users:** Student A, Student B

**Steps:**
1. Student A requests swap
2. Student B clicks "✗ Decline"

**Expected Result:**
- ✅ Popup closes for Student B
- ✅ Student A sees toast: "Swap declined"
- ✅ No seats change
- ✅ Both remain in original positions

---

## 📋 Test Suite 7: 3D Scene Interaction

### Test 7.1: Camera Controls
**Users:** Any user

**Steps:**
1. Press V key to unlock camera
2. Use WASD keys to move
3. Use mouse to look around
4. Press C key to lock camera

**Expected Result:**
- ✅ "🔓 View Unlocked" badge appears
- ✅ Camera moves with WASD
- ✅ Mouse rotates view
- ✅ C key locks back to seat view
- ✅ "🔒 View Locked" badge appears

### Test 7.2: Emotes
**Users:** Any user

**Steps:**
1. Press keys 1-5 for emotes
2. Observe own avatar
3. Other users observe

**Expected Result:**
- ✅ Avatar plays emote animation
- ✅ Other users see animation
- ✅ Emote lasts ~2 seconds
- ✅ Available emotes: Wave, Clap, Thumbs Up, Point, Nod

### Test 7.3: Seat Markers Toggle
**Users:** Any user

**Steps:**
1. Click seat marker toggle in taskbar
2. Observe 3D scene

**Expected Result:**
- ✅ Colored spheres appear at seat positions
- ✅ Red/Green/Blue coding for debugging
- ✅ Gold marker at seat 145 (host position)
- ✅ Toggle off removes markers

### Test 7.4: Lights Toggle
**Users:** Any user

**Steps:**
1. Click lights toggle in taskbar
2. Observe lighting changes

**Expected Result:**
- ✅ Classroom lights brighten (daytime mode)
- ✅ Or dim (evening mode)
- ✅ Visibility adjusts appropriately

---

## 📋 Test Suite 8: Connection & Stability

### Test 8.1: WebSocket Connection
**Users:** All users

**Steps:**
1. Open browser DevTools
2. Go to Network tab → WS
3. Observe WebSocket connection

**Expected Result:**
- ✅ WebSocket connects to ws://localhost:8080/ws
- ✅ Connection status shows "🔄 Connecting..." then "✓ Connected"
- ✅ No error messages in console
- ✅ Messages flowing (client_ready, session_status, etc.)

### Test 8.2: Disconnect & Reconnect
**Users:** Student A

**Steps:**
1. Student A connected and seated
2. Close browser tab
3. Reopen and rejoin session

**Expected Result:**
- ✅ Teacher sees toast: "Student A left"
- ✅ Student A rejoins successfully
- ✅ Seat reassigned (may be different)
- ✅ Teacher sees toast: "Student A joined"
- ✅ Members list updates

### Test 8.3: Session End
**Users:** Teacher

**Steps:**
1. Teacher clicks Leave button
2. Select "End session for all"
3. Students observe

**Expected Result:**
- ✅ All students see toast: "Session has ended"
- ✅ All students redirected to room page after 2 seconds
- ✅ Session marked as ended in database
- ✅ Cannot rejoin ended session

---

## 📋 Test Suite 9: Error Handling

### Test 9.1: Microphone Permission Denied
**Users:** Any user

**Steps:**
1. Block microphone in browser settings
2. Click Audio button
3. Observe error

**Expected Result:**
- ✅ Alert: "Microphone access is required"
- ✅ Audio button remains in "No permission" state
- ✅ Cannot unmute
- ✅ Prompt to check browser settings

### Test 9.2: Invalid Session ID
**Users:** Any user

**Steps:**
1. Navigate to /lecture-hall/{roomId}?session_id=invalid
2. Observe error

**Expected Result:**
- ✅ Error message or redirect
- ✅ Cannot join invalid session
- ✅ User redirected to room page

### Test 9.3: Session Already Ended
**Users:** Any user

**Steps:**
1. Try to join session that has ended
2. Observe error

**Expected Result:**
- ✅ Error: "This watch session has ended"
- ✅ Prompt to start new session
- ✅ Cannot connect to ended session

---

## 📊 Performance Benchmarks

### Expected Metrics

**Audio Latency:**
- Local (same row): < 100ms
- Room-wide: < 200ms
- Acceptable: < 500ms

**WebSocket Messages:**
- Message delivery: < 50ms
- State updates: Immediate (< 100ms)

**3D Rendering:**
- FPS: 60fps (smooth)
- Avatar load time: < 2 seconds
- Seat marker rendering: < 1 second

**Memory Usage:**
- Per user: < 200MB
- Teacher (with 144 students): < 500MB

**Bandwidth Usage:**
- Student (row audio): ~400 kbps
- Student (approved): ~7 Mbps
- Teacher: ~7 Mbps

---

## 🐛 Known Issues & Workarounds

### Issue 1: Audio Echo
**Symptom:** User hears their own voice
**Cause:** Multiple browser windows on same computer
**Workaround:** Use headphones or different physical devices

### Issue 2: Avatar Not Loading
**Symptom:** Avatar appears as placeholder
**Cause:** Model loading delay
**Workaround:** Wait 5 seconds, refresh if persists

### Issue 3: Seat Assignment Conflict
**Symptom:** Two users show same seat number
**Cause:** Race condition on join
**Workaround:** One user leaves and rejoins

---

## ✅ Final Validation Checklist

Before marking testing complete, verify:

**Core Features:**
- [ ] 3 users can join lecture hall simultaneously
- [ ] Teacher assigned to seat 145
- [ ] Students assigned to seats 1-144
- [ ] Members modal shows all participants

**Audio Routing:**
- [ ] Students in same row can hear each other
- [ ] Students in different rows cannot hear each other
- [ ] Teacher broadcasts to all students
- [ ] Approved students broadcast to all

**Raise Hand System:**
- [ ] Students can raise hands
- [ ] Teacher sees badge notification
- [ ] Quick popup shows pending requests
- [ ] Teacher can approve/deny
- [ ] Approved students broadcast to room
- [ ] Teacher can revoke permissions

**UI/UX:**
- [ ] Audio button shows correct states (4 states)
- [ ] Members modal shows 3 sections correctly
- [ ] Seat badges display correctly
- [ ] Toast notifications appear at right times

**Stability:**
- [ ] No console errors
- [ ] WebSocket stays connected
- [ ] Can disconnect and reconnect
- [ ] Session ends gracefully

---

**Testing Completed:** _______________  
**Tested By:** _______________  
**Issues Found:** _______________  
**Status:** [ ] Pass [ ] Fail [ ] Needs Fixes
