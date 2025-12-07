# RoomPage Redesign - Implementation Checklist

## ✅ Completed
- Created new simplified RoomPageNew.jsx (no video player)
- Sticky header with room info and action buttons
- Active session banner with thumbnail and join button
- Room-level persistent chat UI
- Presence indicators (members in room vs in session)

## 🔧 Backend Endpoints Needed

### 1. Room Messages (Persistent Chat)
```go
// GET /api/rooms/:id/messages
// Returns all messages for the room
// Response: { messages: [...] }

// POST /api/rooms/:id/messages
// Creates a new room message
// Body: { message: string }
// Response: { message: {...} }
```

### 2. Active Session Info
```go
// GET /api/rooms/:id/active-session
// Returns current active session if any
// Response: {
//   session: {
//     session_id: string,
//     watch_type: string,
//     media_title: string,
//     media_poster: string,
//     host_username: string,
//     host_id: int,
//     started_at: timestamp,
//     members: [user_id, ...]
//   }
// }
```

### 3. Room Members
```go
// GET /api/rooms/:id/members
// Returns list of all room members
// Response: { members: [{id, username, avatar_url}, ...] }
```

### 4. Create Watch Session
```go
// POST /api/rooms/:id/sessions
// Creates a new watch session
// Body: { watch_type: "video" | "3d_cinema" }
// Response: { session_id: string, watch_type: string }
```

## 📡 WebSocket Updates Needed

### Room-Level WebSocket Messages
The existing `/api/rooms/:id/ws` endpoint needs to support:

**Outgoing (Server → Client):**
- `room_chat`: New persistent message
- `user_joined`: User joined room
- `user_left`: User left room  
- `session_started`: Watch session created
- `session_ended`: Watch session ended
- `session_members_update`: Members joined/left session

**Incoming (Client → Server):**
- `room_chat_message`: Send persistent chat message
- (Existing watch session messages stay in session WebSocket)

## 🗄️ Database Schema Additions

### room_messages Table
```sql
CREATE TABLE room_messages (
  id SERIAL PRIMARY KEY,
  room_id INT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_room_messages_room (room_id),
  INDEX idx_room_messages_created (created_at)
);
```

### room_members Table (if not exists)
```sql
CREATE TABLE room_members (
  id SERIAL PRIMARY KEY,
  room_id INT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(room_id, user_id),
  INDEX idx_room_members_room (room_id)
);
```

## 🎨 Frontend Routes Update

Update App.jsx to use new RoomPage:
```jsx
import RoomPageNew from './components/RoomPageNew';

// Replace old route
<Route path="/rooms/:id" element={
  <ProtectedRoute><RoomPageNew /></ProtectedRoute>
} />
```

## 📋 Next Steps Priority

### Phase 1 - Core Functionality (Now)
1. Create room_messages table migration
2. Implement POST/GET /api/rooms/:id/messages endpoints
3. Implement GET /api/rooms/:id/active-session endpoint
4. Update WebSocket handler for room_chat messages
5. Test new RoomPage with backend

### Phase 2 - Enhanced Features (Next)
6. Add member list sidebar
7. Implement "Next Up" media queue display
8. Add typing indicators
9. Add message reactions
10. Add user presence (online/offline status)

### Phase 3 - Polish (Later)
11. Add media manager for hosts
12. Add schedule event modal
13. Add notification system for scheduled events
14. Add room settings panel
15. Add dark mode support

## 🔄 Migration Strategy

**Option A: Gradual Migration (Recommended)**
1. Keep old RoomPage as RoomPageOld.jsx
2. Deploy new RoomPageNew.jsx at /rooms-new/:id
3. Test thoroughly
4. Switch routes once stable
5. Remove old RoomPage

**Option B: Direct Replace**
1. Backup old RoomPage
2. Replace immediately
3. Fix issues as they arise

## 📝 Notes

- **Video Player Removed**: Only in watch sessions (VideoWatch.jsx, CinemaScene3DDemo.jsx)
- **Chat Persistence**: Room chat persists, session chat is ephemeral
- **Session Banner**: Shows only when active session exists
- **Presence**: Real-time updates via WebSocket
- **Ads Support**: Can add to VideoWatch player using Video.js plugins or Google IMA SDK

## 🎯 Design Decisions

✅ **Decided:**
- Room chat continues during sessions (YES)
- Thumbnail for session banner (not video loop)
- Begin Watch shows modal first (not auto-create)
- Presence indicators (members in room vs session)
- No "Next Up" display if no media scheduled
- Host-only "Show Media" button

🔮 **Future Considerations:**
- Voice channels
- Screen sharing in room
- Room customization (themes, banners)
- Media preview loop (can add later)
- Pinned messages
- Message search
