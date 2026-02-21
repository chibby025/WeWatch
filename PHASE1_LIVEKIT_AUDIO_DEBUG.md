# 🔍 Phase 1: LiveKit Audio State Debugging & Speaker Identification

**Date:** January 13, 2026  
**Status:** ✅ Implemented - Ready for Testing  
**Goal:** Understand audio flow, mute states, and speaker identification before implementing selective subscription

---

## 📋 What Was Implemented

### 1. **LiveKitAudioDebugPanel Component** (`/frontend/src/components/LiveKitAudioDebugPanel.jsx`)

A real-time visual debug panel that shows:

- **Local User Info:** Your seat, role (host/approved/student), mic status
- **Audio Level Meter:** Real-time visualization of your mic input
- **Expected Recipients:** Who should hear you based on your role/seat
- **LiveKit Track Publications:** All published audio tracks with their states
  - `track.enabled` (local mute state)
  - `publication.isMuted` (server-side mute state)
  - `publication.isSubscribed` (subscription status)
- **Active Speakers:** Real-time list of who LiveKit detects as speaking
- **Remote Audio States:** WebSocket broadcast of who is unmuted/muted

### 2. **Enhanced Console Logging**

Added detailed console logs that fire when you toggle your microphone:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎤 [PHASE 1 DEBUG] Audio State Change Detected
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 User Info:
   ID: 7
   Seat: 37 (Row 3)
   Role: 🎓 STUDENT

🎙️ Local Audio State:
   isAudioActive: true ✅ UNMUTED
   audioTrack.enabled: true
   audioTrack.muted: false
   audioTrack.readyState: live

📡 LiveKit Publication:
   publication.isMuted: false
   publication.trackSid: TR_ABCD1234

🎯 Expected Recipients: 8 users
   Scope: 📍 Row 3 only (~8-18 students)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🧪 Phase 1 Testing Checklist

### Test Environment Setup

You need **3 browser windows** (or tabs in incognito mode):

1. **Teacher (Host)** - User who starts the session (seat 145)
2. **Student A (Row 1)** - Regular student (e.g., seat 1-18)
3. **Student B (Row 5)** - Student in different row (e.g., seat 73-90)

### Test Scenarios

#### ✅ Test 1: Verify Debug Panel Appears

**Steps:**
1. Open PositionCalculatorPage (lecture hall mode)
2. Join session with LiveKit audio
3. Look for **"🔍 Audio Debug Panel"** in top-right corner

**Expected:**
- Panel shows your user info, seat, role
- Audio level meter shows green bars when you speak
- "Expected Recipients" shows correct count

---

#### ✅ Test 2: Host Audio State Detection

**Setup:** Open as **Teacher (Host)**

**Steps:**
1. Click Audio button to unmute
2. Open browser console (F12)
3. Look for Phase 1 debug log

**Expected Console Output:**
```
📍 User Info:
   Role: 👨‍🏫 HOST
   
🎙️ Local Audio State:
   isAudioActive: true ✅ UNMUTED
   audioTrack.enabled: true
   
🎯 Expected Recipients: 144 users
   Scope: 🌐 ALL students (host always broadcasts to everyone)
```

**In Debug Panel:**
- Shows "👨‍🏫 Host" role
- Expected Recipients: "ALL X students"
- Track Publications shows YOUR track with `track.enabled: true ✅`

---

#### ✅ Test 3: Student Audio State Detection (Regular)

**Setup:** Open as **Student (NOT approved)**

**Steps:**
1. Click Audio button to unmute
2. Check console and debug panel

**Expected Console Output:**
```
📍 User Info:
   Role: 🎓 STUDENT
   Seat: 37 (Row 3)
   
🎙️ Local Audio State:
   isAudioActive: true ✅ UNMUTED
   audioTrack.enabled: true
   
🎯 Expected Recipients: 8 users
   Scope: 📍 Row 3 only (~8-18 students)
```

**In Debug Panel:**
- Shows "🎓 Student" role
- Expected Recipients: "Row only (X users)"
- Broadcasting scope: "Row X only"

---

#### ✅ Test 4: Approved Speaker Audio State

**Setup:** 
1. Student raises hand
2. Host approves via Members modal

**Steps:**
1. After approval, student unmutes
2. Check console and debug panel

**Expected Console Output:**
```
📍 User Info:
   Role: 📢 APPROVED
   
🎙️ Local Audio State:
   isAudioActive: true ✅ UNMUTED
   
🎯 Expected Recipients: 145 users
   Scope: 🌐 ALL users (approved speaker)
```

**In Debug Panel:**
- Role changes to "📢 Approved Speaker"
- Expected Recipients: "ALL X users (approved)"

---

#### ✅ Test 5: Mute/Unmute State Changes

**Setup:** Any user with microphone permission

**Steps:**
1. Unmute microphone (click Audio button)
2. Check debug panel - should show `✅ UNMUTED`
3. Mute microphone (click Audio button again)
4. Check debug panel - should show `🔇 MUTED`

**Expected:**
- `isAudioActive` toggles: `true` → `false`
- `audioTrack.enabled` toggles: `true` → `false`
- `publication.isMuted` toggles: `false` → `true`
- Audio level meter stops showing green bars when muted

---

#### ✅ Test 6: Active Speaker Detection

**Setup:** 2 users in same LiveKit room

**Steps:**
1. User A unmutes and speaks into mic
2. User B opens debug panel
3. Look at "🎤 Active Speakers (LiveKit)" section

**Expected:**
- User B's debug panel shows User A in active speakers list
- Audio level bar moves as User A speaks
- When User A stops speaking, they disappear from list

**Key Question to Answer:**
- ❓ Does `isSpeaking` fire when track is **muted** (`track.enabled = false`)?
- ❓ Or does LiveKit only detect speaking when track is **unmuted**?

---

#### ✅ Test 7: Track Publication Status

**Setup:** Multiple users in room

**Steps:**
1. Open debug panel
2. Look at "📡 LiveKit Track Publications" section
3. Toggle your mic on/off

**Expected:**
- YOUR track shows `isLocal: true`
- When muted: `Track.enabled: false ❌`, `Published: 🔇 MUTED`
- When unmuted: `Track.enabled: true ✅`, `Published: 🔊 UNMUTED`
- Remote users' tracks show `Subscribed: YES ✅` (because `autoSubscribe: true`)

---

#### ✅ Test 8: Remote Audio States (WebSocket)

**Setup:** 2 users in room

**Steps:**
1. User A unmutes
2. User B opens debug panel
3. Look at "📻 Remote Audio States (WebSocket)" section

**Expected:**
- User B sees User A with status `🔊 Speaking`
- When User A mutes, status changes to `🔇 Muted`

---

## 🎯 Key Questions Phase 1 Should Answer

### 1. **Does Muting Stop LiveKit `isSpeaking` Events?**

**Test:** 
- User A publishes track and mutes (`track.enabled = false`)
- User A speaks loudly into mic
- Check if User B sees User A in "Active Speakers"

**Expected Answer:**
- ✅ **YES, muting stops `isSpeaking`** - LiveKit only detects audio when `track.enabled = true`
- ❌ **NO, still fires** - Need to add manual `track.enabled` checks in selective subscription

---

### 2. **Is Audio Actually Transmitted When Muted?**

**Test:**
- User A mutes (`track.enabled = false`)
- User A speaks
- User B checks if they hear anything

**Expected:**
- ✅ **No audio transmitted** - `track.enabled = false` stops audio at source
- Audio element exists but receives no data (silence)

---

### 3. **What's the Difference Between `track.enabled` and `publication.isMuted`?**

**Test:**
- Toggle mic on/off multiple times
- Watch debug panel values

**Expected:**
```
Local Control (Browser):
  track.enabled: false → true → false (instant toggle)
  
Server State (LiveKit):
  publication.isMuted: true → false → true (may lag slightly)
```

**Key Insight:**
- `track.enabled` = **local mute** (instant, controls audio input)
- `publication.isMuted` = **server-side state** (synced by LiveKit)
- Both should stay in sync automatically

---

### 4. **Who Can Hear Whom Right Now?**

**Test:**
- Open 3 windows: Host, Student Row 1, Student Row 5
- Host unmutes → All students should hear
- Student Row 1 unmutes → Only Row 1 students should hear
- Student Row 5 unmutes → Only Row 5 students should hear

**Current State (No Selective Subscription Yet):**
- ❌ Everyone hears everyone (autoSubscribe: true)
- This is WRONG for lecture hall - needs Phase 2 filtering

**Expected After Phase 2:**
- ✅ Row-based filtering works
- ✅ Host broadcasts to all
- ✅ Approved speakers broadcast to all

---

## 📊 Debug Panel Sections Explained

### 1. **📍 Local User**
Shows your identity and current mic status. Audio level meter should move when you speak (if unmuted).

### 2. **🎯 Expected Recipients**
This is what **should** happen based on your role:
- Host: ALL students
- Approved speaker: ALL users
- Regular student: Row only

**Note:** This is the GOAL. Right now, everyone hears everyone because we haven't implemented selective subscription yet.

### 3. **📡 LiveKit Track Publications**
Shows all audio tracks in the room:
- **Track.enabled:** Local mute state (what YOU control)
- **Published:** Server-side mute state (what LiveKit sees)
- **Subscribed:** Whether you're receiving this track

### 4. **🎤 Active Speakers (LiveKit)**
Real-time list of who LiveKit detects as speaking. Uses voice activity detection (VAD).

### 5. **📻 Remote Audio States (WebSocket)**
Shows who is unmuted according to WebSocket messages. Should match LiveKit state.

---

## 🐛 Troubleshooting

### Debug Panel Doesn't Appear
- Check browser console for errors
- Verify `isLivekitConnected = true`
- Verify `livekitRoom` object exists

### Audio Level Meter Always Zero
- Check microphone permissions (browser should prompt)
- Verify `localStream` has audio track
- Try speaking louder (threshold is ~30/255)

### No Remote Speakers Detected
- Verify other user is unmuted
- Check other user's console for "Track published" message
- Ensure both users are in same LiveKit room

### Track Publications Show Wrong State
- Check if `track.enabled` matches `publication.isMuted`
- If mismatched, LiveKit sync may be delayed (wait 1-2 seconds)
- Refresh page if state is permanently wrong

---

## 🚀 Next Steps (Phase 2)

After Phase 1 testing confirms:
1. ✅ Mute states are working correctly
2. ✅ Speaker detection is accurate
3. ✅ Track publications show correct status

**Then implement Phase 2: Selective Subscription**

```javascript
// Pseudocode for Phase 2
room.on('trackPublished', (publication, participant) => {
  const remoteUserId = getUserIdFromParticipant(participant);
  const remoteSeat = userSeats[remoteUserId];
  const myRow = getRowFromSeat(mySeatId);
  const theirRow = getRowFromSeat(remoteSeat);
  
  // Decide whether to subscribe
  const shouldSubscribe = 
    isHost(participant) ||                    // Always hear host
    hasApproval(remoteUserId) ||              // Always hear approved speakers
    (myRow === theirRow && myColumn === theirColumn); // Hear same row+column
  
  publication.setSubscribed(shouldSubscribe);
});
```

---

## 📝 Test Results Template

Use this template to document your findings:

```markdown
### Test Date: [DATE]
### Tester: [YOUR NAME]

#### Test 1: Debug Panel
- ✅ / ❌ Panel appears
- ✅ / ❌ Shows correct user info
- ✅ / ❌ Audio level meter works

#### Test 2: Host Audio
- ✅ / ❌ Shows "HOST" role
- ✅ / ❌ Expected recipients: ALL students
- ✅ / ❌ track.enabled matches unmute state

#### Test 3: Student Audio
- ✅ / ❌ Shows "STUDENT" role
- ✅ / ❌ Expected recipients: Row only
- ✅ / ❌ Scope shows correct row number

#### Test 4: Approved Speaker
- ✅ / ❌ Role changes to "APPROVED"
- ✅ / ❌ Expected recipients: ALL users

#### Test 5: Mute/Unmute
- ✅ / ❌ isAudioActive toggles correctly
- ✅ / ❌ track.enabled changes instantly
- ✅ / ❌ publication.isMuted syncs

#### Test 6: Active Speakers
- ✅ / ❌ Other users appear when speaking
- ✅ / ❌ Disappear when silent
- **KEY:** Muted users trigger isSpeaking? YES / NO

#### Test 7: Track Publications
- ✅ / ❌ Local track shows isLocal: true
- ✅ / ❌ Remote tracks show Subscribed: YES
- ✅ / ❌ Mute state updates correctly

#### Test 8: Remote Audio States
- ✅ / ❌ WebSocket broadcasts received
- ✅ / ❌ States match LiveKit publications

### Key Findings:
- [Write your observations here]
- [Any unexpected behaviors?]
- [Does muting stop isSpeaking events?]
```

---

## 🔗 Related Files

- **Debug Panel:** `/frontend/src/components/LiveKitAudioDebugPanel.jsx`
- **Implementation:** `/frontend/src/pages/PositionCalculatorPage.jsx` (lines 1340-1500)
- **Audio Hook:** `/frontend/src/hooks/useLectureHallAudio.jsx`
- **LiveKit Hook:** `/frontend/src/hooks/useLiveKitRoom.js`

---

**Status:** Ready for testing! Open PositionCalculatorPage and start Phase 1 testing.
