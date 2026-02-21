# 🔊 Audio System Comparison: 3D Cinema vs Lecture Hall

**Created:** January 25, 2026  
**Purpose:** Compare LiveKit audio implementations between 3D Cinema and Lecture Hall

---

## 📋 Quick Summary

| Feature | **3D Cinema** | **Lecture Hall** |
|---------|---------------|------------------|
| **LiveKit Connection** | ✅ Yes (`useLiveKitRoom`) | ✅ Yes (`useLiveKitRoom`) |
| **Auto-Subscribe** | ✅ `true` (default) | ⚙️ **Conditional** (`false` for default mode, `true` for discussion mode) |
| **Selective Subscription** | ❌ No | ✅ Yes (row-based audio filtering) |
| **Audio Hook** | ❌ None (basic state management) | ✅ `useLectureHallAudio` (comprehensive) |
| **Audio Modes** | 1 mode (everyone hears everyone) | 2 modes (default row-based, discussion all-to-all) |
| **Mic Permission** | Manual | Auto-requested (Zoom-style) |
| **Silence Mode** | ✅ Yes (blocks mic audio, allows screen share audio) | ❌ No |
| **Row-Based Audio** | ❌ No | ✅ Yes (row + column groups) |
| **Host Broadcast** | Same as everyone | ✅ Always broadcasts to ALL students |
| **Raise Hand System** | ❌ No | ✅ Yes (host approval for room-wide speaking) |

---

## 🏗️ Architecture Comparison

### **3D Cinema Architecture**

```
CinemaScene3DDemo.jsx
├── useLiveKitRoom(roomId, currentUser)  // No autoSubscribe parameter → defaults to true
│   └── Room.connect({ autoSubscribe: true })  // Everyone auto-subscribes to everyone
├── RemoteAudioPlayer (component)
│   ├── Listens to RoomEvent.TrackSubscribed
│   ├── Auto-creates <audio> elements for ALL remote participants
│   └── Silence mode: blocks participant mics, allows screen share audio
└── Basic audio state management
    ├── isAudioActive (boolean)
    ├── isSilenceMode (boolean)
    └── Manual mic permission request
```

### **Lecture Hall Architecture**

```
PositionCalculatorPage.jsx (Lecture Hall implementation)
├── useLectureHallAudio() hook  // 🎯 Main difference
│   ├── Auto-requests mic permission (Zoom-style)
│   ├── getRowFromSeatId() - determines row/column from seat ID
│   ├── getAudioRecipients() - calculates who should hear this user
│   └── Row-based audio logic (row + column groups)
│
├── useLiveKitRoom(roomId, currentUser, shouldAutoSubscribe)
│   ├── shouldAutoSubscribe = !isLectureHall || discussionMode
│   │   ├── Discussion mode: true → everyone auto-subscribes
│   │   └── Default mode: false → selective subscription
│   └── Room.connect({ autoSubscribe: false/true })
│
└── 🎯 Selective Subscription Effect (runs when autoSubscribe: false)
    ├── Listens to RoomEvent.TrackPublished
    ├── For each new audio track:
    │   ├── Parse speaker's userId from participant.identity
    │   ├── Calculate shouldSubscribe based on:
    │   │   ├── Discussion mode? → subscribe to all
    │   │   ├── Speaker is host? → subscribe
    │   │   ├── Speaker is approved? → subscribe
    │   │   └── Same row AND column? → subscribe
    │   └── publication.setSubscribed(shouldSubscribe)
    └── Updates subscriptions when mode/seats change
```

---

## 🔑 Key Differences

### **1. Auto-Subscribe Strategy**

#### 3D Cinema
```javascript
// CinemaScene3DDemo.jsx line 322
const { room } = useLiveKitRoom(roomId, currentUser);
// No third parameter → autoSubscribe defaults to TRUE

// useLiveKitRoom.js line 164
await newRoom.connect(url, token, {
  autoSubscribe: true,  // ✅ Always true for cinema
});
```
**Result:** Everyone automatically subscribes to everyone's audio tracks.

#### Lecture Hall
```javascript
// PositionCalculatorPage.jsx lines 1768-1772
const shouldAutoSubscribe = !isLectureHall || discussionMode;
// Logic:
// - Discussion mode: true (auto-subscribe to all)
// - Default mode: false (selective subscription)

const { room } = useLiveKitRoom(roomId, currentUser, shouldAutoSubscribe);

// useLiveKitRoom.js line 159
await newRoom.connect(url, token, {
  autoSubscribe: autoSubscribe,  // ⚙️ Conditional based on mode
});
```
**Result:** Conditional auto-subscribe based on lecture hall mode.

---

### **2. Selective Subscription Implementation**

#### 3D Cinema
```javascript
// ❌ NO SELECTIVE SUBSCRIPTION LOGIC
// RemoteAudioPlayer.jsx just creates audio elements for ALL subscribed tracks
```

#### Lecture Hall
```javascript
// PositionCalculatorPage.jsx lines 2560-2700
useEffect(() => {
  // 🎯 Only runs when autoSubscribe: false (lecture hall default mode)
  
  const shouldSubscribeToSpeaker = (speakerUserId) => {
    // Discussion mode: everyone hears everyone
    if (discussionMode) return true;
    
    // Host in default mode: doesn't hear anyone (broadcast only)
    if (isHost && !discussionMode) return false;
    
    const mySeatId = userSeatsRef.current[myUserId];
    const speakerSeatId = userSeatsRef.current[speakerUserId];
    
    // Always hear host (seat 145)
    if (speakerSeatId === 145) return true;
    
    // Always hear approved speakers
    if (approvedSpeakers[speakerUserId]) return true;
    
    // Default: Same row AND column only
    const myLocation = getRowFromSeatId(mySeatId);
    const speakerLocation = getRowFromSeatId(speakerSeatId);
    
    return myLocation.row === speakerLocation.row 
        && myLocation.column === speakerLocation.column;
  };
  
  // Listen for new tracks
  livekitRoom.on(RoomEvent.TrackPublished, (publication, participant) => {
    if (publication.kind !== 'audio') return;
    
    const speakerUserId = parseInt(participant.identity.split('-')[1]);
    const shouldSubscribe = shouldSubscribeToSpeaker(speakerUserId);
    
    publication.setSubscribed(shouldSubscribe);  // 🎯 Selective subscription
  });
  
}, [livekitRoom, discussionMode, approvedSpeakers, userSeats]);
```

**Key Method:** `publication.setSubscribed(true/false)` - manually control subscription per track.

---

### **3. Audio Hooks**

#### 3D Cinema
```javascript
// ❌ NO DEDICATED AUDIO HOOK
// Basic state management in CinemaScene3DDemo.jsx:
const [isAudioActive, setIsAudioActive] = useState(false);
const [isSilenceMode, setIsSilenceMode] = useState(false);

// Manual mic permission request (no auto-request)
```

#### Lecture Hall
```javascript
// ✅ COMPREHENSIVE AUDIO HOOK
// useLectureHallAudio.jsx
const {
  hasMicPermission,
  isAudioActive,
  localStream,
  audioDevices,
  selectedAudioDeviceId,
  discussionMode,
  requestMicPermission,  // Auto-called on mount (Zoom-style)
  toggleAudio,
  changeAudioDevice,
  getAudioRecipients,    // Returns array of user IDs who should hear me
  toggleDiscussionMode,   // Host only
  getRowFromSeatId,      // Seat → {row, column} mapping
} = useLectureHallAudio({
  isHost,
  hasHostApproval,
  userSeats,
  authenticatedUserID,
  watchSessionMembers,
  approvedSpeakers,
  sendMessage,
  sessionId,
  lectureHallSeats,
});
```

**Features:**
- ✅ Auto-requests mic permission on mount (like Zoom/Meet)
- ✅ Starts muted by default (prevents feedback)
- ✅ Audio level monitoring (detects if mic is working)
- ✅ Device enumeration and switching
- ✅ Row/column-based audio recipient calculation
- ✅ WebSocket broadcast of audio state to others

---

### **4. Audio Modes**

#### 3D Cinema
**Single Mode:** Everyone hears everyone (no filtering).

```
User A (Row 1) → Can hear → User B (Row 3)
User B (Row 3) → Can hear → User A (Row 1)
Host           → Can hear → Everyone
Everyone       → Can hear → Host
```

**Silence Mode:** Special case that blocks participant mics but allows screen share audio.

#### Lecture Hall
**Default Mode (Selective Subscription):**
```
Host (Seat 145)     → Broadcasts to → ALL students
Students            → Can hear → Host only (+ approved speakers)
Student A (Row 1-A) → Can hear → Students in Row 1-A only
Student B (Row 2-B) → Can hear → Students in Row 2-B only
```

**Discussion Mode (Auto-Subscribe):**
```
Everyone → Can hear → Everyone (same as Cinema)
```

**Raise Hand System:**
```
Student clicks "Raise Hand" 
  → Host receives request
  → Host approves
  → Student's hasHostApproval = true
  → Student now broadcasts to ALL (like host)
```

---

## 📊 Subscription Flow Diagrams

### **Cinema: Auto-Subscribe (Simple)**

```
┌─────────────┐
│ User Joins  │
└──────┬──────┘
       │
       ▼
┌──────────────────────────┐
│ LiveKit connects with    │
│ autoSubscribe: true      │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│ For every remote participant:    │
│   - Auto-subscribe to audio      │
│   - RemoteAudioPlayer creates    │
│     <audio> element               │
└──────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│ User hears ALL participants      │
│ (no filtering)                   │
└──────────────────────────────────┘
```

### **Lecture Hall: Selective Subscription (Complex)**

```
┌─────────────────────┐
│ User Joins          │
│ (gets assigned seat)│
└──────┬──────────────┘
       │
       ▼
┌────────────────────────────────┐
│ Check mode:                    │
│  - Discussion? autoSubscribe=T │
│  - Default?    autoSubscribe=F │
└──────┬─────────────────────────┘
       │
       ├──── Discussion Mode ────────────┐
       │                                 │
       ▼                                 ▼
┌──────────────────────────┐   ┌────────────────────────┐
│ autoSubscribe: TRUE      │   │ autoSubscribe: FALSE   │
│ (same as Cinema)         │   │ (Selective)            │
└──────────────────────────┘   └────────┬───────────────┘
                                        │
                                        ▼
                        ┌───────────────────────────────┐
                        │ RoomEvent.TrackPublished      │
                        │ fires for each new track      │
                        └────────┬──────────────────────┘
                                 │
                                 ▼
                   ┌─────────────────────────────────┐
                   │ Parse speaker's userId           │
                   │ from participant.identity       │
                   └────────┬────────────────────────┘
                            │
                            ▼
                   ┌─────────────────────────────────┐
                   │ Calculate shouldSubscribe:      │
                   │  - Speaker is host? → YES       │
                   │  - Speaker approved? → YES      │
                   │  - Same row+column? → YES       │
                   │  - Otherwise → NO               │
                   └────────┬────────────────────────┘
                            │
                            ▼
                   ┌─────────────────────────────────┐
                   │ publication.setSubscribed(bool) │
                   └────────┬────────────────────────┘
                            │
                            ▼
                   ┌─────────────────────────────────┐
                   │ User hears FILTERED audio       │
                   │ (only row-mates + host)         │
                   └─────────────────────────────────┘
```

---

## 🔧 Row-Based Audio Logic (Lecture Hall Only)

### Seat Layout
```
Lecture Hall: 144 student seats + 1 host seat (145)

Column 1: Seats 1-40   (8 rows × 5 seats)
Column 2: Seats 41-104 (8 rows × 8 seats)
Column 3: Seats 105-144 (8 rows × 5 seats)
Host:     Seat 145
```

### `getRowFromSeatId()` Function
```javascript
// useLectureHallAudio.jsx lines 82-128
const getRowFromSeatId = (seatId) => {
  if (seatId === 145 || seatId === '145') return 'host';
  
  const seatNumber = parseInt(seatId);
  let row, column;
  
  if (seatNumber <= 40) {
    // Column 1
    row = Math.floor((seatNumber - 1) / 5);
    column = 1;
  } else if (seatNumber <= 104) {
    // Column 2
    row = Math.floor((seatNumber - 41) / 8);
    column = 2;
  } else {
    // Column 3
    row = Math.floor((seatNumber - 105) / 5);
    column = 3;
  }
  
  return { row, column };
};
```

### `isInSameRowGroup()` Helper
```javascript
// Exported for use in subscription logic
export const isInSameRowGroup = (seatId1, seatId2, getRowFromSeatIdFn) => {
  const seat1Info = getRowFromSeatIdFn(seatId1);
  const seat2Info = getRowFromSeatIdFn(seatId2);
  
  // Must match BOTH row AND column for isolated groups
  return seat1Info.row === seat2Info.row 
      && seat1Info.column === seat2Info.column;
};
```

**Example:**
- Seat 5 (Row 0, Column 1) can hear Seats 1-5 (Row 0, Column 1)
- Seat 5 **cannot** hear Seat 45 (Row 0, Column 2) - different column!
- All students can hear Seat 145 (host)

---

## 🎯 What Cinema is Missing

### **Missing Features** (that Lecture Hall has):

1. ❌ **Selective Subscription**
   - Cinema subscribes to EVERYONE
   - Could benefit from row-based audio (users in Row 1 only hear Row 1)

2. ❌ **Audio Hook Architecture**
   - Cinema has scattered audio state management
   - Should consolidate into `useCinemaAudio()` hook

3. ❌ **Auto Mic Permission**
   - Cinema requires manual mic request
   - Lecture Hall auto-requests on mount (better UX)

4. ❌ **Discussion Mode Toggle**
   - Cinema has no mode switching
   - Could add "Party Mode" (all rows hear each other)

5. ❌ **Row-Based Audio Filtering**
   - Cinema has 6 rows but no audio filtering
   - Users in Row 1 can hear users in Row 6 (may cause chaos)

6. ❌ **Broadcast Permissions**
   - No "raise hand" or approval system
   - Could add "Request to Speak to All" feature

7. ❌ **Audio Level Monitoring**
   - No detection if mic is working
   - Lecture Hall uses Web Audio API to monitor amplitude

---

## 💡 Recommendations for Cinema

### **Option 1: Keep Simple (Current)**
**Pros:**
- Simple architecture
- Works for small groups (< 20 people)
- No complexity

**Cons:**
- Doesn't scale to 42+ users
- Audio chaos in large sessions

---

### **Option 2: Add Row-Based Audio (Like Lecture Hall)**

**Implementation Steps:**

1. **Create `useCinemaAudio()` hook** (inspired by `useLectureHallAudio`)
   ```javascript
   const useCinemaAudio = ({
     isHost,
     userSeats,        // userId -> seatId (e.g., "0-0")
     authenticatedUserId,
     roomMembers,
     sendMessage,
     sessionId,
   }) => {
     // Auto-request mic permission
     // Calculate row from seat key ("0-0" → row 0)
     // Implement getAudioRecipients() for row-based filtering
   };
   ```

2. **Pass `autoSubscribe: false` to `useLiveKitRoom()`**
   ```javascript
   const shouldAutoSubscribe = false; // Force selective subscription
   const { room } = useLiveKitRoom(roomId, currentUser, shouldAutoSubscribe);
   ```

3. **Add selective subscription effect** (copy from Lecture Hall)
   ```javascript
   useEffect(() => {
     const shouldSubscribeToSpeaker = (speakerUserId) => {
       const myRow = getRowFromSeat(userSeats[myUserId]);
       const speakerRow = getRowFromSeat(userSeats[speakerUserId]);
       return myRow === speakerRow; // Only hear same row
     };
     
     livekitRoom.on(RoomEvent.TrackPublished, (publication, participant) => {
       const shouldSubscribe = shouldSubscribeToSpeaker(speakerUserId);
       publication.setSubscribed(shouldSubscribe);
     });
   }, [livekitRoom, userSeats]);
   ```

4. **Add "Party Mode" button** (toggle all-rows audio)
   ```javascript
   const [partyMode, setPartyMode] = useState(false);
   
   const togglePartyMode = () => {
     setPartyMode(!partyMode);
     // When enabled, subscribe to all participants
   };
   ```

**Benefits:**
- ✅ Reduces audio chaos (6 rows × 7 seats = ~7 people per row)
- ✅ Better for large groups (42 users)
- ✅ Host can still broadcast to all rows
- ✅ Optional "Party Mode" for all-rows audio

---

### **Option 3: Hybrid (Default All + Manual Row Selection)**

**Features:**
- Default: Everyone hears everyone (current behavior)
- Add UI: "Mute Other Rows" button
- When enabled: Apply row-based filtering

**Best for:** Keeping simple default + advanced option for power users.

---

## 🧪 Testing Comparison

### **Cinema Testing** (Simple)
```
1. Join session
2. Click Audio button → mic permission prompt
3. Speak → everyone hears (no filtering)
4. Enable Silence Mode → blocks mics, allows screen share
```

### **Lecture Hall Testing** (Complex)
```
Default Mode:
1. Join session → auto mic permission (muted)
2. Get assigned seat (e.g., Seat 23 → Row 2, Column 2)
3. Click Audio → unmute
4. Speak → Only Row 2-Column 2 students hear you
5. Host speaks → Everyone hears host

Discussion Mode:
1. Host clicks "Enable Discussion Mode"
2. All students now hear ALL other students
3. Audio becomes like Cinema (everyone-to-everyone)

Raise Hand:
1. Student clicks "Raise Hand"
2. Host sees request notification
3. Host clicks "Approve"
4. Student now broadcasts to ALL (like host)
```

---

## 📁 File Structure Comparison

### **Cinema Files**
```
frontend/src/
├── components/cinema/
│   ├── 3d-cinema/
│   │   └── CinemaScene3DDemo.jsx  // Main component, basic audio state
│   └── ui/
│       └── RemoteAudioPlayer.jsx  // Auto-creates <audio> elements
└── hooks/
    └── useLiveKitRoom.js          // LiveKit connection (autoSubscribe=true)
```

### **Lecture Hall Files**
```
frontend/src/
├── pages/
│   ├── PositionCalculatorPage.jsx    // Lecture hall page
│   └── LectureHallPage.jsx           // Older lecture hall page
├── hooks/
│   ├── useLiveKitRoom.js             // LiveKit connection (conditional autoSubscribe)
│   └── useLectureHallAudio.jsx       // 🎯 Comprehensive audio hook
└── utils/
    └── (row calculation logic in hook)
```

---

## 🔍 Code Examples

### **Cinema: Simple Auto-Subscribe**
```javascript
// CinemaScene3DDemo.jsx
const { room } = useLiveKitRoom(roomId, currentUser);  // autoSubscribe=true (default)

// RemoteAudioPlayer.jsx
useEffect(() => {
  const handleTrackSubscribed = (track, publication, participant) => {
    if (track.kind === 'audio') {
      const audioElement = track.attach();  // Create <audio> element
      audioElement.autoplay = true;
      document.body.appendChild(audioElement);
    }
  };
  
  room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
}, [room]);
```

### **Lecture Hall: Selective Subscription**
```javascript
// PositionCalculatorPage.jsx

// 1. Conditional autoSubscribe
const shouldAutoSubscribe = !isLectureHall || discussionMode;
const { room } = useLiveKitRoom(roomId, currentUser, shouldAutoSubscribe);

// 2. Selective subscription effect (when autoSubscribe=false)
useEffect(() => {
  const handleTrackPublished = (publication, participant) => {
    if (publication.kind !== 'audio') return;
    
    const speakerUserId = parseInt(participant.identity.split('-')[1]);
    const shouldSubscribe = shouldSubscribeToSpeaker(speakerUserId);
    
    publication.setSubscribed(shouldSubscribe);  // 🎯 Manual control
  };
  
  room.on(RoomEvent.TrackPublished, handleTrackPublished);
}, [room, userSeats, discussionMode]);

// 3. Audio hook
const { getRowFromSeatId, getAudioRecipients } = useLectureHallAudio({
  isHost,
  userSeats,
  authenticatedUserID,
  lectureHallSeats,
});
```

---

## 🎓 Summary

| Aspect | Cinema | Lecture Hall |
|--------|--------|--------------|
| **Complexity** | ⭐ Simple | ⭐⭐⭐⭐ Complex |
| **Scalability** | Good for < 20 users | Good for 100+ users |
| **Audio Filtering** | None | Row + Column based |
| **Modes** | 1 (all-to-all) | 2 (default, discussion) |
| **Hook Architecture** | ❌ Scattered | ✅ Centralized (`useLectureHallAudio`) |
| **Auto Mic Request** | ❌ Manual | ✅ Auto (Zoom-style) |
| **Selective Subscribe** | ❌ No | ✅ Yes (`publication.setSubscribed()`) |
| **Best For** | Small watch parties | Large classes/lectures |

---

## 🚀 Next Steps

### **For Cinema Improvement:**
1. ✅ **Keep current simple behavior** for small groups
2. 🎯 **Add optional row-based mode** for large sessions
3. 🎨 **Create `useCinemaAudio()` hook** to consolidate audio logic
4. 🔧 **Add "Party Mode" toggle** for all-rows audio
5. 📊 **Test with 42 concurrent users** to measure audio chaos

### **For Lecture Hall:**
1. ✅ Current implementation is solid
2. 🔍 Consider adding visual indicators for row groups
3. 📈 Monitor performance with 144+ users

---

**Conclusion:** Lecture Hall has a **much more sophisticated audio system** with selective subscription, row-based filtering, and comprehensive audio management. Cinema keeps it simple with auto-subscribe-all, which works well for small groups but may need improvement for larger sessions (42 users).
