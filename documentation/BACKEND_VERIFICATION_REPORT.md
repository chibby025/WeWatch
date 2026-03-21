# Backend Verification Report - Audio System & Discussion Mode

## Executive Summary

After analyzing the backend WebSocket handlers (websocket.go), I've verified the audio routing implementation and identified what's missing for complete integration.

---

## Q5: Backend Audio Routing - ⚠️ **PARTIALLY IMPLEMENTED**

### Current Status
**Finding:** Backend has `user_audio_state` handler but **NO `user_speaking` handler**

### What Exists in Backend (Line 1541-1577 in websocket.go):

```go
if msg.Type == "user_audio_state" {
    var audioData struct {
        UserID            uint   `json:"userId"`
        IsAudioActive     bool   `json:"isAudioActive"`
        IsSeatedMode      bool   `json:"isSeatedMode"`
        IsGlobalBroadcast bool   `json:"isGlobalBroadcast"`
        Row               *int   `json:"row"`
    }
    
    // Decide who receives the audio state
    recipients := []uint{}
    
    if !audioData.IsSeatedMode || audioData.IsGlobalBroadcast {
        // Broadcast to ALL users in room
        recipients = client.hub.GetAllUserIDsInRoom(client.roomID)
    } else if audioData.Row != nil {
        // Only send to users in the same row
        recipients = client.hub.GetUserIDsInRow(client.roomID, *audioData.Row)
    }
    
    // Send only to relevant users
    if len(recipients) > 0 {
        client.hub.BroadcastToUsers(recipients, OutgoingMessage{
            Data: message,
            IsBinary: false,
        })
    }
    return // Do NOT broadcast to whole room
}
```

### What Frontend Sends (useLectureHallAudio.jsx line 119):

```javascript
sendMessage({
  type: 'user_speaking',  // ❌ Backend doesn't handle this type
  data: {
    user_id: authenticatedUserID,
    speaking: isEnabled,
    recipients,
    broadcast_scope: broadcastScope,
    discussion_mode: discussionMode,
    session_id: sessionId,
  },
});
```

### **CRITICAL ISSUE:**
- **Frontend sends:** `user_speaking` message
- **Backend expects:** `user_audio_state` message
- **Result:** Message is broadcast to entire room by default handler (line 2756: "Broadcast all other message types to room")

### **IMPACT:**
- Audio routing WORKS but NOT as intended
- All audio state broadcasts go to everyone in room
- Row-based filtering is BYPASSED
- Discussion mode flag is IGNORED by backend

### **SOLUTION NEEDED:**

**Option 1: Change Frontend to Match Backend**
Update `useLectureHallAudio.jsx` to send `user_audio_state` instead of `user_speaking`:

```javascript
sendMessage({
  type: 'user_audio_state',  // ✅ Match backend handler
  userId: authenticatedUserID,
  isAudioActive: isEnabled,
  isSeatedMode: !discussionMode,  // When discussion mode ON, seatedMode OFF
  isGlobalBroadcast: isHost || hasHostApproval || discussionMode,
  row: myRow,  // Calculated from seat ID
});
```

**Option 2: Add `user_speaking` Handler to Backend**
Add new handler to websocket.go that uses the `recipients` array directly:

```go
if msg.Type == "user_speaking" {
    var speakingData struct {
        UserID          uint     `json:"user_id"`
        Speaking        bool     `json:"speaking"`
        Recipients      []uint   `json:"recipients"`
        BroadcastScope  string   `json:"broadcast_scope"`
        DiscussionMode  bool     `json:"discussion_mode"`
        SessionID       string   `json:"session_id"`
    }
    
    // Parse the data
    if m, ok := msg.Data.(map[string]interface{}); ok {
        // Parse fields...
    }
    
    // Send to specified recipients
    if len(speakingData.Recipients) > 0 {
        client.hub.BroadcastToUsers(speakingData.Recipients, OutgoingMessage{
            Data: message,
            IsBinary: false,
        })
    }
    return
}
```

---

## Q6: Approved Speakers Flow - ✅ **FULLY IMPLEMENTED**

### Backend Handlers Confirmed:

#### 1. **raise_hand** (Lines 2536-2590) ✅
```go
if msg.Type == "raise_hand" {
    // Student raises hand
    // Backend sends notification to HOST ONLY
    client.hub.BroadcastToUser(session.HostID, client.roomID, handMsg)
}
```

**Flow:**
1. Student clicks "Raise Hand"
2. Frontend sends `raise_hand` message with `{user_id, username, seat_id, session_id}`
3. Backend validates session exists
4. Backend sends `raise_hand` notification to **host only**

#### 2. **lower_hand** (Lines 2592-2628) ✅
```go
if msg.Type == "lower_hand" {
    // Student lowers hand
    // Backend sends notification to HOST ONLY
    client.hub.BroadcastToUser(session.HostID, client.roomID, lowerMsg)
}
```

**Flow:**
1. Student clicks "Lower Hand"
2. Frontend sends `lower_hand` message with `{user_id, session_id}`
3. Backend validates session exists
4. Backend sends `lower_hand` notification to **host only**

#### 3. **approve_speaker** (Lines 2630-2690) ✅
```go
if msg.Type == "approve_speaker" {
    // Host approves speaker
    // 1. Verify sender is host
    // 2. Send approval to specific student
    client.hub.BroadcastToUser(approveData.TargetUserID, ...)
    // 3. Broadcast to ALL room members
    client.hub.BroadcastToRoom(client.roomID, approvedMsg, nil)
}
```

**Flow:**
1. Host clicks "Approve Speaker" for a student
2. Frontend sends `approve_speaker` message with `{target_user_id, session_id}`
3. Backend verifies sender is the host
4. Backend sends `hand_raised_response: {approved: true}` to **student only**
5. Backend broadcasts `speaker_approved: {user_id}` to **entire room**

#### 4. **revoke_speaker** (Lines 2691-2756) ✅
```go
if msg.Type == "revoke_speaker" {
    // Host revokes speaker
    // 1. Verify sender is host
    // 2. Send revoke to specific student
    client.hub.BroadcastToUser(revokeData.TargetUserID, ...)
    // 3. Broadcast to ALL room members
    client.hub.BroadcastToRoom(client.roomID, revokedMsg, nil)
}
```

**Flow:**
1. Host clicks "Revoke Speaker" for a student
2. Frontend sends `revoke_speaker` message with `{target_user_id, session_id}`
3. Backend verifies sender is the host
4. Backend sends `hand_raised_response: {approved: false}` to **student only**
5. Backend broadcasts `speaker_revoked: {user_id}` to **entire room**

### Frontend Integration Points:

**PositionCalculatorPage.jsx** needs to handle these messages (around line 596-620):

```javascript
case 'hand_raised_response':
  // Update hasHostApproval state
  if (data.approved) {
    setHasHostApproval(true);
  } else {
    setHasHostApproval(false);
    setHandRaised(false);
  }
  break;

case 'speaker_approved':
  // Update approvedSpeakers state for UI indication
  setApprovedSpeakers(prev => ({
    ...prev,
    [data.user_id]: true
  }));
  break;

case 'speaker_revoked':
  // Remove from approvedSpeakers
  setApprovedSpeakers(prev => {
    const updated = { ...prev };
    delete updated[data.user_id];
    return updated;
  });
  break;
```

**STATUS:** ✅ Backend is COMPLETE. Frontend needs to add message handlers.

---

## Q7: RemoteAudioPlayer Integration - ❌ **NOT INTEGRATED**

### Finding:
**PositionCalculatorPage.jsx does NOT import or use RemoteAudioPlayer component**

### Current Situation:
```bash
grep_search result: No matches found for "RemoteAudioPlayer"
```

### What's Missing:
1. **Import:** No import statement for RemoteAudioPlayer
2. **Usage:** Component not rendered anywhere in PositionCalculatorPage
3. **State:** No tracking of remote audio streams

### Expected Integration:

```javascript
import RemoteAudioPlayer from '../components/RemoteAudioPlayer';

// In component body:
const [remoteStreams, setRemoteStreams] = useState({}); // userId -> MediaStream

// Inside JSX return:
{Object.entries(remoteStreams).map(([userId, stream]) => (
  <RemoteAudioPlayer
    key={userId}
    stream={stream}
    userId={parseInt(userId)}
    currentUserId={currentUser?.id}
    getAudioRecipients={getAudioRecipients}
    muted={isSilenceMode}
  />
))}
```

### Why It's Not Working Yet:
- **Audio is LiveKit-based** (not pure WebRTC peer-to-peer)
- **LiveKit handles audio playback** through its own components
- **RemoteAudioPlayer** would be used for filtering/muting specific users
- Currently **silence mode** would mute ALL remote audio, not just specific users

### **ACTION NEEDED:**
1. Verify if LiveKit integration is being used for audio
2. If yes: RemoteAudioPlayer may not be needed (LiveKit handles playback)
3. If no: Implement WebRTC peer connections and integrate RemoteAudioPlayer

---

## Q10: WebSocket Backend Message - ❌ **NOT IMPLEMENTED**

### Finding:
**Backend has NO handler for `toggle_discussion_mode` message**

### What Happens Now:
```go
// Line 2756 in websocket.go - Default handler
log.Printf("[handleMessage] 📢 Broadcasting message type '%s' to room %d", msg.Type, client.roomID)
client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: message, IsBinary: false}, client)
```

**Result:** Message is broadcast to all room members, but no server-side state tracking.

### What Frontend Sends (PositionCalculatorPage.jsx):

```javascript
sendMessage({
  type: 'toggle_discussion_mode',
  data: {
    discussion_mode: newMode,
    session_id: sessionId,
  },
});
```

### **IMPACT:**
- ✅ **All clients receive the message** (via default broadcast)
- ❌ **Backend doesn't track discussion mode state**
- ❌ **New joiners won't know if discussion mode is active**
- ❌ **Session status doesn't include discussion_mode flag**

### **SOLUTION OPTIONS:**

#### Option 1: Backend Tracks Discussion Mode State (RECOMMENDED)

Add handler to websocket.go:

```go
if msg.Type == "toggle_discussion_mode" {
    var discussionData struct {
        DiscussionMode bool   `json:"discussion_mode"`
        SessionID      string `json:"session_id"`
    }

    // Parse data
    if m, ok := msg.Data.(map[string]interface{}); ok {
        if dm, ok := m["discussion_mode"].(bool); ok {
            discussionData.DiscussionMode = dm
        }
        if sid, ok := m["session_id"].(string); ok {
            discussionData.SessionID = sid
        }
    }

    // Verify sender is host
    var session models.WatchSession
    if err := DB.Where("session_id = ?", discussionData.SessionID).First(&session).Error; err != nil {
        log.Printf("[toggle_discussion_mode] ❌ Session not found: %v", err)
        return
    }

    if session.HostID != client.userID {
        log.Printf("[toggle_discussion_mode] ❌ User %d is not the host", client.userID)
        return
    }

    // Update session metadata (add discussion_mode to watch_sessions table)
    // OR store in hub memory: hub.sessionDiscussionMode[sessionID] = discussionData.DiscussionMode

    // Broadcast to all room members
    discussionMsg := map[string]interface{}{
        "type": "discussion_mode_changed",
        "data": map[string]interface{}{
            "discussion_mode": discussionData.DiscussionMode,
            "session_id":      discussionData.SessionID,
        },
    }

    if msgBytes, err := json.Marshal(discussionMsg); err == nil {
        client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
        log.Printf("[toggle_discussion_mode] 📢 Broadcasted discussion mode change to room %d", client.roomID)
    }
    return
}
```

Then update `session_status` message to include discussion_mode flag (line 1447 in websocket.go):

```go
statusMsg := WebSocketMessage{
    Type: "session_status",
    Data: map[string]interface{}{
        "session_id":       watchSession.SessionID,
        "host_id":          watchSession.HostID,
        "members":          activeMembers,
        "started_at":       watchSession.StartedAt,
        "seating":          filteredSeatingMap,
        "seated_usernames": seatedUsernames,
        "discussion_mode":  hub.sessionDiscussionMode[watchSession.SessionID], // ✅ Add this
    },
}
```

#### Option 2: Client-Side Only (CURRENT - Works but Limited)

**How it works now:**
1. Host toggles discussion mode
2. Frontend sends `toggle_discussion_mode` message
3. Backend broadcasts to all clients via default handler
4. All clients receive message and update local state

**Limitations:**
- New joiners won't know discussion mode state
- No server-side validation
- Host could disconnect and discussion mode state is lost

---

## Additional Backend Issues Found

### 1. **Message Handler at Line 2756 - Too Broad**
```go
// Default: Broadcast all other message types to room
client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: message, IsBinary: false}, client)
```

**Issue:** Any unhandled message type gets broadcast to entire room.

**Impact:**
- `user_speaking` messages go to everyone (bypassing row-based filtering)
- `toggle_discussion_mode` messages are broadcast (but not processed server-side)
- Potential security issue if sensitive messages are accidentally broadcast

**Recommendation:** Add explicit handlers for all expected message types and log warnings for unknown types.

---

## Summary of Findings

| Question | Status | Details |
|----------|--------|---------|
| **Q5: Audio Routing** | ⚠️ PARTIAL | Backend has `user_audio_state` handler, but frontend sends `user_speaking`. Mismatch causes full-room broadcast. |
| **Q6: Approved Speakers** | ✅ COMPLETE | All handlers implemented: `raise_hand`, `lower_hand`, `approve_speaker`, `revoke_speaker`. Frontend needs message handlers. |
| **Q7: RemoteAudioPlayer** | ❌ NOT USED | Component exists but not integrated. Likely using LiveKit for audio playback instead. |
| **Q10: Discussion Mode** | ⚠️ PARTIAL | Message broadcasts to all clients, but no server-side state tracking. New joiners won't know state. |

---

## Immediate Action Items

### 🔴 **CRITICAL (Breaks Audio Routing):**
1. **Fix message type mismatch:**
   - Either change frontend from `user_speaking` to `user_audio_state`
   - Or add `user_speaking` handler to backend
   - Current row-based audio filtering is BYPASSED

### 🟡 **HIGH PRIORITY (Missing Functionality):**
2. **Add frontend message handlers** for approved speakers flow:
   - `hand_raised_response` → Update `hasHostApproval`
   - `speaker_approved` → Update `approvedSpeakers` state
   - `speaker_revoked` → Remove from `approvedSpeakers`

3. **Add discussion mode backend handler:**
   - Track discussion mode state server-side
   - Include in `session_status` for new joiners
   - Validate only host can toggle

### 🟢 **LOW PRIORITY (Nice to Have):**
4. **Verify LiveKit audio integration:**
   - Confirm audio playback is through LiveKit
   - Determine if RemoteAudioPlayer is needed
   - Document audio architecture decision

5. **Tighten default message handler:**
   - Add explicit handlers for all message types
   - Log warnings for unknown message types
   - Remove overly broad broadcast fallback

---

## Testing Checklist

- [ ] **Row-Based Audio:** Fix message type, test 2+ students in same row can hear each other
- [ ] **Approval Flow:** Test raise hand → host approves → student broadcasts to room
- [ ] **Discussion Mode:** Test host toggles → all clients receive update → new joiners see state
- [ ] **Sound Effects:** Verify all 5 sounds play at correct times
- [ ] **Backend Validation:** Verify only host can toggle discussion mode
- [ ] **Seat Assignment:** Verify seat sound plays when user joins

