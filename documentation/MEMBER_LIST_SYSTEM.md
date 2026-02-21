# Lecture Hall Member List System

## Overview
This document explains how the member list works in the lecture hall (3D cinema), including how members are tracked, displayed in the taskbar, and synced between frontend and backend.

## Architecture

### Backend Components

#### 1. Database Table: `watch_session_members`
Stores membership records for active watch sessions.

**Key Fields:**
- `watch_session_id`: Links to the watch session
- `user_id`: The member's user ID
- `is_active`: Whether member is currently connected (true) or disconnected (false)
- `joined_at`: When member joined
- `left_at`: When member disconnected (NULL if active)

#### 2. WebSocket Connection Flow

```
User connects to /ws?room_id=X&session_id=Y
    ↓
1. Extract session_id from query params
    ↓
2. Find or create WatchSession in database
    ↓
3. Call JoinWatchSession() ← MUST HAPPEN FIRST!
    ├─ Creates/updates watch_session_members record
    ├─ Sets is_active = true
    └─ Removes left_at timestamp
    ↓
4. Register client in clientRegistry
    ├─ Check for duplicate connections
    └─ Clean up old client if found
    ↓
5. Start WebSocket pumps (readPump, writePump)
```

**CRITICAL:** `JoinWatchSession()` must be called **BEFORE** client registration. This ensures the member record is created even if the client is immediately replaced by a duplicate connection.

#### 3. API Endpoint: `/api/rooms/:id/active-session`

**Handler:** `GetActiveSessionHandler` in `rooms.go`

**Query:**
```sql
SELECT 
    wsm.user_id, 
    users.username, 
    wsm.is_active, 
    user_rooms.user_role
FROM watch_session_members wsm
JOIN users ON users.id = wsm.user_id
JOIN user_rooms ON user_rooms.user_id = wsm.user_id 
    AND user_rooms.room_id = ?
WHERE wsm.watch_session_id = ? 
    AND wsm.is_active = true
```

**Returns:**
```json
{
  "session_id": "uuid",
  "host_id": 7,
  "member_count": 2,
  "members": [
    {
      "user_id": 7,
      "username": "chibi",
      "is_active": true,
      "user_role": "host"
    },
    {
      "user_id": 5,
      "username": "test025",
      "is_active": true,
      "user_role": "member"
    }
  ]
}
```

#### 4. WebSocket Messages

**When User Joins:**
- Backend broadcasts `participant_join` to all clients in room:
```json
{
  "type": "participant_join",
  "data": {
    "userId": 5,
    "username": "test025"
  }
}
```

**When User Leaves:**
- Backend broadcasts `user_left` to all clients:
```json
{
  "type": "user_left",
  "data": {
    "userId": 5
  }
}
```

**Session Status (sent on connect):**
```json
{
  "type": "session_status",
  "data": {
    "isActive": true,
    "hostId": 7,
    "seating": {
      "145": 7,
      "2": 5
    },
    "seated_usernames": {
      "7": "chibi",
      "5": "test025"
    }
  }
}
```

### Frontend Components

#### 1. State Management

**Primary State:** `watchSessionMembers` (from API)
```javascript
const [watchSessionMembers, setWatchSessionMembers] = useState([]);
```

**Source:** `fetchWatchSessionMembers()` function
- Fetches from `/api/rooms/:id/active-session`
- Called on page load and every 5 seconds (polling)
- Updates when session starts/ends

**Example:**
```javascript
watchSessionMembers = [
  { user_id: 7, username: "chibi", is_active: true, user_role: "host" },
  { user_id: 5, username: "test025", is_active: true, user_role: "member" }
]
```

#### 2. Component: Taskbar

**Location:** `frontend/src/components/Taskbar.jsx`

**Member Count Display:**
```javascript
const memberCount = watchSessionMembers?.length || 0;

<FaUser /> {memberCount}
```

**Shows:** Total number of members (including host) from API data.

**Updates When:**
- `watchSessionMembers` changes (from API polling)
- Session starts/ends
- Members join/leave (detected by next API poll)

#### 3. Component: LectureHallMembersModal

**Location:** `frontend/src/components/modals/LectureHallMembersModal.jsx`

**Displays:** List of all members from `watchSessionMembers`

```javascript
{watchSessionMembers.map((member) => (
  <div key={member.user_id} className="member-item">
    <span>{member.username}</span>
    <span className={member.user_role === 'host' ? 'host-badge' : ''}>
      {member.user_role}
    </span>
    <button onClick={() => handleCycleSeat(member.user_id)}>
      View Seat
    </button>
  </div>
))}
```

**Features:**
- Shows username and role for each member
- Click "View Seat" to jump to their seat in 3D scene
- Modal opens when clicking member count in taskbar

#### 4. Avatar Generation

**Location:** `frontend/src/components/cinema/3d-cinema/avatars/LectureHallAvatarManager.jsx`

**Uses:** `userSeats` state (maps userId → seatId)
```javascript
userSeats = {
  7: 145,  // User 7 is in seat 145
  5: 2     // User 5 is in seat 2
}
```

**Process:**
1. Iterate through all 145 seats
2. Check if seat is occupied (exists in `userSeats`)
3. Get username from `userIdToUsername` mapping
4. Create avatar for occupied seats
5. Filter out current user (don't show your own avatar)

**Example:**
```javascript
const realUsers = useMemo(() => {
  const users = [];
  
  previewSeats.forEach((seatData, index) => {
    const seatId = index + 1;
    
    // Find which user is in this seat
    const userId = Object.keys(userSeats).find(
      uid => userSeats[uid] === seatId
    );
    
    if (userId) {
      users.push({
        userId: Number(userId),
        username: userIdToUsername[userId] || `User ${userId}`,
        position: seatData.position,
        rotation: seatData.rotation
      });
    }
  });
  
  return users;
}, [previewSeats, userSeats, userIdToUsername]);

// Filter out current user
const visibleUsers = realUsers.filter(user => user.userId !== currentUserId);
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  WebSocket Connect (with session_id)                            │
│         ↓                                                        │
│  JoinWatchSession()                                             │
│         ↓                                                        │
│  DB: INSERT/UPDATE watch_session_members                        │
│      SET is_active = true, left_at = NULL                       │
│         ↓                                                        │
│  Broadcast "participant_join" to all clients                    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                           ↓
                           ↓ (WebSocket message)
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  PositionCalculatorPage receives "participant_join"             │
│         ↓                                                        │
│  (Optional: Could update local state immediately)               │
│         ↓                                                        │
│  API Polling (every 5 seconds):                                 │
│         ↓                                                        │
│  GET /api/rooms/:id/active-session                              │
│         ↓                                                        │
│  Update watchSessionMembers state                               │
│         ↓                                                        │
│  ┌──────────────────────────────────────────┐                  │
│  │  Taskbar                                  │                  │
│  │  Shows: watchSessionMembers.length       │                  │
│  └──────────────────────────────────────────┘                  │
│         ↓                                                        │
│  ┌──────────────────────────────────────────┐                  │
│  │  LectureHallMembersModal                 │                  │
│  │  Maps over watchSessionMembers           │                  │
│  └──────────────────────────────────────────┘                  │
│         ↓                                                        │
│  ┌──────────────────────────────────────────┐                  │
│  │  LectureHallAvatarManager                │                  │
│  │  Uses userSeats to generate avatars      │                  │
│  └──────────────────────────────────────────┘                  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Common Issues & Fixes

### Issue 1: "0 members" shown when host connects

**Symptom:** Backend returns `member_count: 0` even though host is connected.

**Cause:** `JoinWatchSession()` was called AFTER client registration, so rapid duplicate connections would kill the client before it could create the member record.

**Fix:** Move `JoinWatchSession()` to be called BEFORE client registration (implemented in websocket.go).

### Issue 2: Avatars don't render for other users

**Symptom:** Each user only sees their own avatar (which gets filtered out, resulting in 0 visible avatars).

**Cause:** `userSeats` state is incomplete - each client only knows their own seat assignment.

**Solution:** Use WebSocket `request_seat_state` message to sync complete seating map:
1. Frontend sends `{ type: "request_seat_state" }` after WebSocket connects
2. Backend responds with `seat_state_refresh` containing full seating map
3. Frontend updates `userSeats` with complete data
4. Avatar generation now has all user positions

### Issue 3: Member count in taskbar vs modal mismatch

**Symptom:** Taskbar shows 2 members, modal shows 0 members.

**Cause:** Taskbar was using `Object.keys(userSeats).length` which only had current user, while modal used `watchSessionMembers` which had all members.

**Fix:** Changed taskbar to consistently use `watchSessionMembers.length`.

## Code Order of Execution (Critical!)

### Backend: WebSocketHandler Flow

```go
// 1. Extract session_id from query
sessionID := c.Query("session_id")

// 2. Find/create session in database
if sessionID != "" {
    DB.Where("session_id = ?", sessionID).First(&watchSession)
}

// 3. Create client object
client := &Client{
    userID:   authenticatedUserID,
    roomID:   roomID,
    streamID: sessionID,
}

// 4. ✅ JOIN SESSION FIRST! (Must happen before registration)
if sessionID != "" {
    hub.JoinWatchSession(sessionID, client)
    // Creates watch_session_members record with is_active=true
}

// 5. Register client (AFTER session join)
hub.clientRegistry[userID][roomID] = client

// 6. Clean up duplicate clients (safe now - member already created)
if oldClient != nil {
    hub.cleanupClientSync(oldClient)
}

// 7. Start pumps
go client.writePump()
go client.readPump()
```

**Why this order matters:**
If registration happens first, a duplicate connection can arrive and cleanup the client before `JoinWatchSession()` runs, resulting in no member record being created.

## Testing Checklist

- [ ] Start session as host → taskbar shows "1 member"
- [ ] Open members modal → shows host with "host" role
- [ ] Second user joins → taskbar updates to "2 members"
- [ ] Members modal shows both users
- [ ] Both users can see each other's avatars in 3D scene
- [ ] Click "View Seat" on member → camera jumps to their seat
- [ ] User disconnects → member count decreases
- [ ] User reconnects → member count increases

## Related Files

### Backend
- `backend/internal/handlers/websocket.go` - WebSocket connection handling, JoinWatchSession
- `backend/internal/handlers/rooms.go` - GetActiveSessionHandler (member list API)
- `backend/internal/models/watch_session.go` - WatchSession, WatchSessionMember models

### Frontend
- `frontend/src/pages/PositionCalculatorPage.jsx` - Main page, manages member state
- `frontend/src/components/Taskbar.jsx` - Displays member count
- `frontend/src/components/modals/LectureHallMembersModal.jsx` - Member list display
- `frontend/src/components/cinema/3d-cinema/avatars/LectureHallAvatarManager.jsx` - Avatar generation
- `frontend/src/hooks/useWebSocket.js` - WebSocket connection management

## Future Improvements

1. **Real-time Updates:** Instead of polling every 5 seconds, immediately update `watchSessionMembers` when receiving `participant_join`/`user_left` WebSocket messages.

2. **Member Heartbeat:** Backend sends periodic heartbeat to detect stale connections faster.

3. **Optimistic Updates:** Update member list in UI immediately when user joins, before API confirmation.

4. **Member Presence Indicators:** Show which members are actively viewing (camera position, idle status).

5. **Member Role Management:** Allow host to promote members to co-host, mute members, etc.

## Connection Resilience (Production-Ready)

### Problem: React StrictMode & Multiple Connections
In development, React's StrictMode intentionally double-mounts components to test resilience. This caused:
- Multiple WebSocket connections within milliseconds
- Race conditions with member record creation
- Duplicate cleanup causing connection loss

### Solution: Global Connection Pool
Implemented a global connection pool that:

1. **Reuses Connections:** If a connection already exists for a room/session, reuse it instead of creating new one
2. **Reference Counting:** Tracks how many components are using each connection
3. **Delayed Cleanup:** Waits 200ms before closing connections to handle StrictMode remounts
4. **Broadcast Updates:** All components sharing a connection receive WebSocket messages

**Key Code (`useWebSocket.js`):**
```javascript
// Global connection pool
const activeConnections = new Map(); // Key: "roomId-sessionId"

// When connecting
const connectionKey = `${roomId}-${sessionId || 'none'}`;

if (activeConnections.has(connectionKey)) {
  // ✅ REUSE existing connection
  poolEntry.refCount++;
  return existingConnection;
} else {
  // ✅ CREATE new connection
  const poolEntry = {
    ws: new WebSocket(url),
    refCount: 1,
    subscribers: new Set([...stateSetters]),
    cleanupTimer: null
  };
  activeConnections.set(connectionKey, poolEntry);
}
```

**Cleanup Strategy:**
```javascript
// On component unmount
poolEntry.refCount--;

if (poolEntry.refCount <= 0) {
  // ✅ DELAY cleanup for StrictMode remounts
  poolEntry.cleanupTimer = setTimeout(() => {
    if (poolEntry.refCount <= 0) {
      ws.close();
      activeConnections.delete(connectionKey);
    }
  }, 200); // 200ms delay
}
```

**Benefits:**
- ✅ Works with React StrictMode (development & testing)
- ✅ Single connection per room/session (production-ready)
- ✅ Automatic reconnection on network issues
- ✅ No duplicate member records in database
- ✅ Cleaner logs in development
