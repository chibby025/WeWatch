# Lecture Hall Audio Routing System

## 📋 Overview

The lecture hall audio routing system enables realistic classroom dynamics with row-based conversations and teacher-controlled room-wide broadcasting. This document explains how audio is routed based on user roles and approval status.

## 🎯 Audio Routing Rules

### Mode 1: Lecture Mode (Default)

```
┌─────────────────────────────────────────────────────────┐
│                      LECTURE HALL                        │
│                                                          │
│  👨‍🏫 HOST (Teacher at Podium)                           │
│  ├─ Always broadcasts to: ALL STUDENTS                  │
│  └─ Hears: ALL STUDENTS (when speaking)                 │
│                                                          │
│  👨‍🎓 STUDENT (Default - Unmuted)                         │
│  ├─ Broadcasts to: ROW ONLY (8 students max)            │
│  ├─ Hears: HOST + STUDENTS IN SAME ROW                  │
│  └─ Audio scope: LOCAL (simulates whispers)             │
│                                                          │
│  🙋 STUDENT (Hand Raised - Approved)                    │
│  ├─ Broadcasts to: ENTIRE ROOM (all 145 users)          │
│  ├─ Hears: HOST + ALL STUDENTS                          │
│  └─ Audio scope: GLOBAL (presenting to class)           │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## 🔄 Audio Flow Diagram

```
STUDENT UNMUTES (Default):
┌─────────────┐
│  Student A  │ Unmutes mic
│  (Row 3)    │
└──────┬──────┘
       │
       ├─→ [Audio Stream] → Row 3 Students Only (8 max)
       │                    ├─ Student B (Row 3)
       │                    ├─ Student C (Row 3)
       │                    └─ ... (others in row)
       │
       └─→ [WebSocket] → 'user_speaking' message
                         └─ recipients: [row 3 user IDs]
                         └─ broadcast_scope: "row"

STUDENT WITH APPROVAL (Approved):
┌─────────────┐
│  Student A  │ 📢 Approved by host
│  (Row 3)    │
└──────┬──────┘
       │
       ├─→ [Audio Stream] → ALL STUDENTS + HOST (145 users)
       │                    ├─ Host
       │                    ├─ Student B (Row 1)
       │                    ├─ Student C (Row 2)
       │                    └─ ... (all 144 students)
       │
       └─→ [WebSocket] → 'user_speaking' message
                         └─ recipients: [all user IDs]
                         └─ broadcast_scope: "room"

HOST UNMUTES (Always):
┌─────────────┐
│    Host     │ Unmutes mic
│  (Teacher)  │
└──────┬──────┘
       │
       ├─→ [Audio Stream] → ALL STUDENTS (144 users)
       │                    ├─ Student A (Row 1)
       │                    ├─ Student B (Row 2)
       │                    └─ ... (all students)
       │
       └─→ [WebSocket] → 'user_speaking' message
                         └─ recipients: [all student IDs]
                         └─ broadcast_scope: "room"
```

## 📁 Implementation Components

### 1. useLectureHallAudio Hook

**Location:** `frontend/src/hooks/useLectureHallAudio.jsx`

**Purpose:** Manages microphone state and determines audio recipients based on role and approval status.

**Key Functions:**

#### `getAudioRecipients()`
Determines who should receive audio based on current state:

```javascript
// Host → Everyone
if (isHost) {
  return allUserIds;
}

// Student with approval → Everyone
if (hasHostApproval) {
  return allUserIds;
}

// Student default → Row only
const myRow = extractRow(mySeatId);
return usersInSameRow(myRow);
```

#### `broadcastAudioState(isEnabled)`
Sends WebSocket message with audio state and recipient list:

```javascript
{
  type: 'user_speaking',
  data: {
    user_id: authenticatedUserID,
    speaking: isEnabled,
    recipients: [array of user IDs],
    broadcast_scope: 'room' | 'row',
    session_id: sessionId,
  }
}
```

#### `toggleAudio()`
Toggles microphone and broadcasts state to recipients:
- Enables/disables audio track
- Calls `broadcastAudioState()`
- Logs scope (ROOM vs ROW)

**Exported API:**
```javascript
{
  hasMicPermission,      // Boolean
  isAudioActive,         // Boolean
  localStream,           // MediaStream
  audioDevices,          // Array of audio devices
  selectedAudioDeviceId, // String
  requestMicPermission,  // Function
  toggleAudio,           // Function
  changeAudioDevice,     // Function
  getAudioRecipients,    // Function
}
```

### 2. LectureHallPage Integration

**Location:** `frontend/src/pages/LectureHallPage.jsx`

**Audio State:**
```javascript
const [remoteAudioStates, setRemoteAudioStates] = useState({});
// Maps userId → boolean (speaking/muted)
```

**WebSocket Handler:**
```javascript
case 'user_speaking':
  // Update remote user's audio state
  setRemoteAudioStates(prev => ({
    ...prev,
    [data.user_id]: data.speaking === true
  }));
  break;
```

**Integration with useLectureHallAudio:**
```javascript
const {
  isAudioActive,
  toggleAudio,
  // ... other exports
} = useLectureHallAudio({
  isHost,
  hasHostApproval,
  userSeats,
  authenticatedUserID,
  roomMembers,
  approvedSpeakers,
  sendMessage,
  sessionId,
});
```

### 3. RemoteAudioPlayer Component

**Location:** `frontend/src/components/RemoteAudioPlayer.jsx`

**Purpose:** Plays remote user audio with filtering support.

**Props:**
```javascript
{
  stream: MediaStream,           // Remote audio stream
  userId: number,                // Remote user's ID
  currentUserId: number,         // Current user's ID
  getAudioRecipients: Function,  // Recipient filter function
  muted: boolean,                // Force mute this user
}
```

**Behavior:**
- Automatically plays remote audio stream
- Can mute based on filtering logic
- Respects server-side recipient filtering
- Cleanup on unmount

### 4. Backend WebSocket Handler

**Location:** `backend/internal/handlers/websocket.go`

**Message Type:** `user_speaking`

**Current Implementation:**
- Receives audio state from client
- Includes recipient list and broadcast scope
- Logs audio state changes

**Future Enhancement (Optional):**
Server-side filtering to only send audio to intended recipients:

```go
case "user_speaking":
  var audioData struct {
    UserID         uint     `json:"user_id"`
    Speaking       bool     `json:"speaking"`
    Recipients     []string `json:"recipients"`
    BroadcastScope string   `json:"broadcast_scope"`
    SessionID      string   `json:"session_id"`
  }
  
  // Parse data...
  
  // Option 1: Broadcast to all (client filters)
  client.hub.BroadcastToRoom(client.roomID, message, nil)
  
  // Option 2: Broadcast only to recipients (server filters)
  for _, recipientID := range audioData.Recipients {
    client.hub.BroadcastToUser(recipientID, client.roomID, message)
  }
```

## 🎓 Row Calculation Logic

### Seat ID Format

Lecture hall seats use format: `{seatId}` where:
- Seat 1-144: Students (8 rows × 18 seats)
- Seat 145: Host/teacher (special position)

### Row Extraction

For student seats, row is calculated from seat ID:

```javascript
// Row 1: Seats 1-18
// Row 2: Seats 19-36
// Row 3: Seats 37-54
// Row 4: Seats 55-72
// Row 5: Seats 73-90
// Row 6: Seats 91-108
// Row 7: Seats 109-126
// Row 8: Seats 127-144

function getRowFromSeatId(seatId) {
  if (seatId === 145) return 'host'; // Teacher
  return Math.ceil(seatId / 18); // 1-8
}

function getUsersInRow(row, userSeats) {
  return Object.entries(userSeats)
    .filter(([userId, seatId]) => {
      return getRowFromSeatId(seatId) === row;
    })
    .map(([userId]) => userId);
}
```

## 🔊 Audio States Visual Reference

### Student Audio Button States

```
┌──────────────────────────────────────┐
│  STATE 1: MUTED (Default)            │
│  ┌────────────────────────────────┐  │
│  │  🔇  Mic OFF                   │  │
│  │  Right-click: Raise Hand       │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  STATE 2: ROW TALK (Unmuted)         │
│  ┌────────────────────────────────┐  │
│  │  🎤  Row Talk                  │  │
│  │  Broadcasting to: Row 3 (8)    │  │
│  │  Right-click: Raise Hand       │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  STATE 3: HAND RAISED (Waiting)      │
│  ┌────────────────────────────────┐  │
│  │  🙋  Hand Raised               │  │
│  │  Waiting for approval...       │  │
│  │  Right-click: Lower Hand       │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  STATE 4: BROADCASTING (Approved)    │
│  ┌────────────────────────────────┐  │
│  │  📢  Broadcasting (Pulsing)    │  │
│  │  Broadcasting to: All (145)    │  │
│  │  Right-click: Lower Hand       │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

## 🧪 Testing Scenarios

### Scenario 1: Student Row Conversation
```
Setup:
- Student A (Row 3, Seat 37)
- Student B (Row 3, Seat 38)
- Student C (Row 5, Seat 73)

Test:
1. Student A unmutes
2. Student B should hear A ✅
3. Student C should NOT hear A ✅
4. Check 'user_speaking' message:
   - recipients includes Student B ID
   - recipients does NOT include Student C ID
   - broadcast_scope = "row"
```

### Scenario 2: Approved Student Broadcasting
```
Setup:
- Host (Seat 145)
- Student A (Row 3, Seat 37)
- Student B (Row 5, Seat 73)

Test:
1. Student A raises hand
2. Host approves
3. Student A unmutes
4. Student B should hear A ✅
5. Host should hear A ✅
6. Check 'user_speaking' message:
   - recipients includes ALL user IDs
   - broadcast_scope = "room"
```

### Scenario 3: Host Broadcasting
```
Setup:
- Host (Seat 145)
- Student A (Row 1, Seat 1)
- Student B (Row 8, Seat 144)

Test:
1. Host unmutes
2. Student A should hear host ✅
3. Student B should hear host ✅
4. Check 'user_speaking' message:
   - recipients includes ALL student IDs
   - broadcast_scope = "room"
```

### Scenario 4: Approval Revoked
```
Setup:
- Host (Seat 145)
- Student A (Row 3, Seat 37, approved)
- Student B (Row 5, Seat 73)

Test:
1. Student A is speaking to all (approved)
2. Host revokes approval
3. Student A receives 'speaker_revoked' message
4. Student A's next audio broadcast should be row-only
5. Student B should NOT hear A anymore ✅
6. Students in Row 3 should still hear A ✅
```

## 📊 Bandwidth Analysis

### Worst Case: No Raise Hand System (All Room-Wide)
- 145 users × 144 connections each = 20,880 audio streams
- Bandwidth per user: ~144 × 50kbps = 7.2 Mbps
- **NOT SCALABLE** ❌

### Best Case: Row-Based + Raise Hand System
- 8 rows × 18 students per row = 144 students
- Each row: ~8 students (18 / 3 columns × 3 columns with gaps)
- Bandwidth per student: ~8 × 50kbps = 400 kbps
- Host bandwidth: 144 × 50kbps = 7.2 Mbps (acceptable for teacher)
- Approved students: Same as host (7.2 Mbps) - but only 1-2 at a time
- **HIGHLY SCALABLE** ✅

### Bandwidth Savings:
- Regular student: 7.2 Mbps → 400 kbps = **95% reduction**
- Only approved speakers pay full bandwidth cost
- Typically 0-2 approved speakers at once
- System gracefully handles 145 users

## 🔐 Security Considerations

### Client-Side Filtering (Current)
```
Pros:
✅ Simple to implement
✅ Low server load
✅ Works with P2P WebRTC

Cons:
❌ Client receives all audio streams
❌ Client can bypass filtering
❌ Higher bandwidth usage
```

### Server-Side Filtering (Optional Enhancement)
```
Pros:
✅ Server enforces recipient rules
✅ Client only receives intended audio
✅ Lower client bandwidth
✅ More secure

Cons:
❌ Higher server load
❌ Server becomes audio relay
❌ Not P2P (star topology)
```

**Recommended:** Start with client-side filtering for simplicity. Add server-side filtering if security or bandwidth becomes a concern.

## 🚀 Future Enhancements

### 1. Audio Level Indicators
Show who's speaking with visual feedback:
```javascript
// In members modal
{members.map(member => (
  <div>
    {member.username}
    {audioStates[member.id] && (
      <span className="audio-wave-animation">🎤</span>
    )}
  </div>
))}
```

### 2. Spatial Audio
Add 3D audio positioning based on seat location:
```javascript
const audioContext = new AudioContext();
const panner = audioContext.createPanner();
panner.setPosition(seatX, seatY, seatZ);
```

### 3. Breakout Rooms
Allow teacher to create small group discussions:
```javascript
// Temporarily override row-based audio
setAudioMode('breakout');
setBreakoutGroups([
  [user1, user2, user3], // Group 1
  [user4, user5, user6], // Group 2
]);
```

### 4. Recording
Record lecture with teacher audio + approved student Q&A:
```javascript
const recordingRecipients = [
  hostId,
  ...Object.keys(approvedSpeakers)
];
startRecording(recordingRecipients);
```

## 📝 Code Quality Checklist

- ✅ Row calculation logic tested with 144 seats
- ✅ Host always broadcasts to all students
- ✅ Approved students broadcast to all
- ✅ Default students broadcast to row only
- ✅ Audio state tracked for all remote users
- ✅ WebSocket messages include recipient list
- ✅ Logging for debugging audio routing
- ✅ Cleanup on unmount (stop tracks)
- ✅ Device enumeration and switching
- ✅ iOS audio context workaround

---

**Implementation Date:** December 20, 2025  
**Status:** ✅ Audio Routing Complete  
**Next:** End-to-end testing with multiple users
