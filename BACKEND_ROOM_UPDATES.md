# Backend Room Page Redesign Updates

## Summary
Implemented backend support for the new RoomPage redesign that separates room hub functionality from watch session functionality. This allows rooms to be persistent social spaces with their own chat, presence, and session management.

## Changes Made

### 1. New Database Model: RoomMessage
**File**: `backend/internal/models/room_message.go`
- Created new model for persistent room-level chat (separate from ephemeral session chat)
- Fields: `RoomID`, `UserID`, `Username`, `Message`, `CreatedAt`
- Relationships: Belongs to Room and User with CASCADE delete
- Added to migration in `main.go`

### 2. New REST Endpoints
**File**: `backend/internal/handlers/room_handlers.go` (NEW)

#### Helper Function:
- `CreateWatchSessionWithType(roomID, hostID, watchType)` - Creates a new watch session with specified type

#### REST Handlers:
1. **GetRoomMessages** - `GET /api/rooms/:id/messages`
   - Returns all persistent room messages with usernames
   - Ordered by creation time (oldest first)

2. **CreateRoomMessage** - `POST /api/rooms/:id/messages`
   - Saves message to database
   - Broadcasts to all room members via WebSocket
   - Body: `{"message": "string"}`

3. **GetActiveSession** - `GET /api/rooms/:id/active-session-details`
   - Returns active session with:
     - session_id, watch_type, host info
     - member count and member IDs
     - started_at timestamp
   - Returns `{"session": null}` if no active session

4. **CreateWatchSession** - `POST /api/rooms/:id/sessions`
   - Creates new watch session for a room
   - Validates watch_type ("video" or "3d_cinema")
   - Checks for existing active sessions
   - Broadcasts "session_started" to all room members
   - Body: `{"watch_type": "video"}`

### 3. Route Registration
**File**: `backend/cmd/server/main.go`

Added new routes to the protected roomGroup:
```go
// Room-level persistent chat
roomGroup.GET("/:id/messages", handlers.GetRoomMessages)
roomGroup.POST("/:id/messages", handlers.CreateRoomMessage)

// Session management
roomGroup.GET("/:id/active-session-details", handlers.GetActiveSession)
roomGroup.POST("/:id/sessions", handlers.CreateWatchSession)
```

### 4. WebSocket Integration
**Existing**: `hub.BroadcastToRoom()` method already exists in `websocket.go`

The new handlers use the existing WebSocket infrastructure:
- `CreateRoomMessage` broadcasts `room_chat` messages
- `CreateWatchSession` broadcasts `session_started` events
- All messages sent as JSON with `{type, data}` structure

## Database Migration

The new `room_messages` table will be created automatically on backend restart due to:
```go
&models.RoomMessage{} // Added to AutoMigrate in main.go
```

### Table Schema:
```sql
CREATE TABLE room_messages (
    id SERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP
);
```

## WebSocket Message Format

### Outgoing (Server → Client)

#### Room Chat Message:
```json
{
  "type": "room_chat",
  "data": {
    "id": 123,
    "user_id": 456,
    "username": "alice",
    "message": "Hello everyone!",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

#### Session Started:
```json
{
  "type": "session_started",
  "data": {
    "session_id": "uuid-here",
    "watch_type": "video",
    "host_id": 789
  }
}
```

## Architecture Decision

**Separation of Concerns**:
- **Room Chat** (`room_messages`) - Persistent, survives across sessions
- **Session Chat** (`chat_messages`) - Ephemeral, tied to specific watch sessions
- **WebSocket** - Dual-level:
  - Room-level: presence, room chat, session notifications
  - Session-level: watch sync, playback control, ephemeral chat

## Testing Checklist

- [ ] Backend compiles successfully ✅ (DONE)
- [ ] Database migration creates `room_messages` table
- [ ] GET `/api/rooms/:id/messages` returns empty array for new rooms
- [ ] POST `/api/rooms/:id/messages` saves and broadcasts messages
- [ ] GET `/api/rooms/:id/active-session-details` returns null when no session
- [ ] POST `/api/rooms/:id/sessions` creates session and broadcasts
- [ ] WebSocket clients receive `room_chat` messages
- [ ] WebSocket clients receive `session_started` events
- [ ] Frontend RoomPageNew.jsx can fetch and display room messages
- [ ] Frontend can create new sessions from room hub

## Next Steps

1. Start backend server
2. Test new endpoints with Postman/curl
3. Update frontend RoomPageNew.jsx to use new endpoints
4. Test WebSocket message broadcasting
5. Switch App.jsx route to use RoomPageNew
6. End-to-end testing of room hub → session flow

## Notes

- `GetRoomMembersHandler` already exists and is registered at `/:id/members` - no duplicate needed
- Used existing `hub.BroadcastToRoom()` method - no changes to WebSocket infrastructure needed
- Module name is `wewatch-backend` (lowercase) - all imports fixed
- Field names verified: MediaItem uses `OriginalName`, not `Title`
- WatchSession doesn't track current media (media tracking happens at room/client level)
