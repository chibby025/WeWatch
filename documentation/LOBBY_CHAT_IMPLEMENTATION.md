# Lobby Chat Implementation Guide

## Overview
Persistent chat system that lets users continue conversations outside watch sessions, creating "sticky" social connections similar to real-world cinema interactions.

## Frontend Implementation ✅

### Features Added
- **Third Tab**: "Chats" tab alongside "Rooms" and "Watching Now"
- **Friends List**: Shows all users you've interacted with
- **Direct Messaging**: One-on-one persistent conversations
- **Real-time Updates**: WebSocket integration for instant message delivery
- **Unread Counts**: Visual badges showing unread messages per conversation
- **Message History**: All messages stored persistently in database
- **Auto-scroll**: Smooth scrolling to latest messages

### UI Components

#### Chat Tab Navigation
```jsx
<button onClick={() => setActiveTab('chats')}>
  Chats
  {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
</button>
```

#### Chat Layout
- **Left Panel**: Friends list with avatars, names, and unread badges
- **Right Panel**: Full chat interface with messages and input

### State Management
```javascript
const [friendsList, setFriendsList] = useState([]);
const [selectedChatUser, setSelectedChatUser] = useState(null);
const [chatMessages, setChatMessages] = useState({});
const [unreadCounts, setUnreadCounts] = useState({});
```

### WebSocket Integration
Real-time message delivery via lobby WebSocket:
```javascript
case 'lobby_chat':
  // Add message to chat
  // Update unread count if chat not open
  // Play notification sound (optional)
```

---

## Backend Implementation Required

### Database Schema

#### Create `lobby_chats` table
```sql
CREATE TABLE lobby_chats (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP,
    
    -- Indexes for performance
    INDEX idx_sender (sender_id),
    INDEX idx_recipient (recipient_id),
    INDEX idx_conversation (sender_id, recipient_id, created_at DESC)
);
```

### Go Model

**File**: `backend/internal/models/lobby_chat.go`
```go
package models

import (
    "time"
)

type LobbyChat struct {
    ID          uint       `gorm:"primarykey" json:"id"`
    SenderID    uint       `json:"sender_id"`
    RecipientID uint       `json:"recipient_id"`
    Message     string     `json:"message"`
    CreatedAt   time.Time  `json:"created_at"`
    ReadAt      *time.Time `json:"read_at,omitempty"`
    
    // Relations
    Sender      User `gorm:"foreignKey:SenderID" json:"sender,omitempty"`
    Recipient   User `gorm:"foreignKey:RecipientID" json:"recipient,omitempty"`
}
```

### API Endpoints

#### 1. Get Friends List
**GET** `/api/lobby-chats/friends`

Returns users who have chatted with current user or are in same rooms.

```go
func GetLobbyChatFriendsHandler(c *gin.Context) {
    userID := c.GetUint("userID")
    
    var friends []User
    
    // Get all unique users who have chatted with current user
    DB.Raw(`
        SELECT DISTINCT users.*
        FROM users
        WHERE users.id IN (
            SELECT sender_id FROM lobby_chats WHERE recipient_id = ?
            UNION
            SELECT recipient_id FROM lobby_chats WHERE sender_id = ?
        )
        AND users.id != ?
        ORDER BY users.username
    `, userID, userID, userID).Scan(&friends)
    
    c.JSON(http.StatusOK, gin.H{"friends": friends})
}
```

#### 2. Get Chat Messages
**GET** `/api/lobby-chats/messages/:userId`

Returns all messages between current user and specified user.

```go
func GetLobbyChatMessagesHandler(c *gin.Context) {
    currentUserID := c.GetUint("userID")
    otherUserID := c.Param("userId")
    
    var messages []LobbyChat
    
    // Get all messages between these two users
    DB.Where(
        "(sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)",
        currentUserID, otherUserID, otherUserID, currentUserID,
    ).Order("created_at ASC").Find(&messages)
    
    // Mark messages as read
    DB.Model(&LobbyChat{}).
        Where("sender_id = ? AND recipient_id = ? AND read_at IS NULL", otherUserID, currentUserID).
        Update("read_at", time.Now())
    
    c.JSON(http.StatusOK, gin.H{"messages": messages})
}
```

#### 3. Send Chat Message
**POST** `/api/lobby-chats/send`

Sends message and broadcasts via WebSocket.

**Request Body**:
```json
{
  "recipient_id": 123,
  "message": "Hey! Want to watch a movie later?"
}
```

```go
func SendLobbyChatMessageHandler(c *gin.Context) {
    senderID := c.GetUint("userID")
    
    var req struct {
        RecipientID uint   `json:"recipient_id" binding:"required"`
        Message     string `json:"message" binding:"required,max=1000"`
    }
    
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    
    // Create chat message
    chat := LobbyChat{
        SenderID:    senderID,
        RecipientID: req.RecipientID,
        Message:     req.Message,
    }
    
    if err := DB.Create(&chat).Error; err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send message"})
        return
    }
    
    // Load sender info
    DB.Preload("Sender").First(&chat, chat.ID)
    
    // Broadcast via WebSocket to both users
    BroadcastToUsers([]uint{senderID, req.RecipientID}, WebSocketMessage{
        Type: "lobby_chat",
        Data: chat,
    })
    
    c.JSON(http.StatusOK, chat)
}
```

### Register Routes

**File**: `backend/cmd/server/main.go`

```go
// Lobby chat routes (authenticated)
lobbyChats := api.Group("/lobby-chats", middleware.AuthMiddleware())
{
    lobbyChats.GET("/friends", handlers.GetLobbyChatFriendsHandler)
    lobbyChats.GET("/messages/:userId", handlers.GetLobbyChatMessagesHandler)
    lobbyChats.POST("/send", handlers.SendLobbyChatMessageHandler)
}
```

### WebSocket Broadcasting

**File**: `backend/internal/websocket/broadcast.go`

```go
// Broadcast message to specific users
func BroadcastToUsers(userIDs []uint, message WebSocketMessage) {
    for _, userID := range userIDs {
        if clients, ok := userConnections[userID]; ok {
            for client := range clients {
                client.WriteJSON(message)
            }
        }
    }
}
```

---

## User Experience Flow

### Initial Setup
1. User joins rooms and participates in watch sessions
2. During sessions, users interact via room/session chat
3. After session ends, users can continue conversation in lobby

### Ongoing Usage
1. User opens lobby → Clicks "Chats" tab
2. Sees list of all people they've chatted with
3. Clicks on a friend → Opens full chat history
4. Types message → Sends → Friend receives instantly via WebSocket
5. Unread badge shows number of unread messages per friend

### Sticky Behavior
- **Persistence**: All messages saved to database
- **History**: Full conversation history always available
- **Continuity**: Users return to ongoing conversations
- **Discovery**: Meet someone in cinema → Chat them later in lobby

---

## Testing Checklist

### Frontend Tests
- [ ] Chat tab appears in navigation
- [ ] Unread count badge shows correct number
- [ ] Friends list loads correctly
- [ ] Clicking friend opens chat window
- [ ] Messages display in correct order (chronological)
- [ ] Sending message updates UI immediately
- [ ] Receiving message updates UI via WebSocket
- [ ] Unread count decreases when opening chat
- [ ] Auto-scroll works when new message arrives
- [ ] Empty states show friendly messages

### Backend Tests
- [ ] Friends list endpoint returns correct users
- [ ] Messages endpoint returns conversation history
- [ ] Send endpoint creates message in database
- [ ] WebSocket broadcasts to both sender and recipient
- [ ] Read receipts update correctly
- [ ] Pagination works for long conversations (future)
- [ ] Rate limiting prevents spam (future)

### Integration Tests
- [ ] User A sends message → User B receives instantly
- [ ] Both users see same conversation history
- [ ] Unread counts sync across devices
- [ ] Messages persist after page reload
- [ ] Chat works while in watch session
- [ ] Chat works after leaving watch session

---

## Security Considerations

### Authorization
- Users can only view/send messages to users they've interacted with
- Cannot spam arbitrary user IDs
- Rate limiting on message sending (recommend 30 msgs/minute)

### Content Moderation
- Message length limit: 1000 characters
- Profanity filter (optional)
- Report/block functionality (future)
- Admin moderation tools (future)

### Privacy
- Messages only visible to sender and recipient
- No group chat leakage
- Delete message functionality (future)
- Clear conversation history (future)

---

## Future Enhancements

### Phase 2 Features
- **Group Chats**: Chat with multiple people from same room
- **Rich Media**: Share images, GIFs, emojis
- **Voice Messages**: Record and send audio clips
- **Typing Indicators**: Show when friend is typing
- **Online Status**: Green dot for active users
- **Message Reactions**: Like, heart, laugh emoji reactions

### Phase 3 Features
- **Video/Voice Calls**: Direct call from chat window
- **Screen Sharing**: Share screen with friend
- **File Sharing**: Send documents, videos
- **Chat Themes**: Customize chat appearance
- **Message Search**: Find old messages by keyword
- **Archive Chats**: Hide old conversations

---

## Performance Optimization

### Database
- Index on `(sender_id, recipient_id, created_at DESC)`
- Paginate messages (load 50 at a time)
- Archive messages older than 6 months

### Caching
- Cache friends list (5 minutes TTL)
- Cache unread counts (Redis)
- Lazy load message history

### WebSocket
- Debounce typing indicators
- Compress message payloads
- Reconnect on disconnect

---

## Migration Script

**File**: `backend/migrations/create_lobby_chats_table.sql`

```sql
-- Create lobby_chats table
CREATE TABLE IF NOT EXISTS lobby_chats (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP,
    CONSTRAINT check_different_users CHECK (sender_id != recipient_id)
);

-- Create indexes for performance
CREATE INDEX idx_lobby_chats_sender ON lobby_chats(sender_id);
CREATE INDEX idx_lobby_chats_recipient ON lobby_chats(recipient_id);
CREATE INDEX idx_lobby_chats_conversation ON lobby_chats(sender_id, recipient_id, created_at DESC);
CREATE INDEX idx_lobby_chats_unread ON lobby_chats(recipient_id, read_at) WHERE read_at IS NULL;

-- Add comment
COMMENT ON TABLE lobby_chats IS 'Persistent direct messages between users in the lobby, creating sticky social connections outside of watch sessions';
```

---

## Documentation Updates

### User Guide
Add section: "Chatting with Friends in the Lobby"
- How to find friends
- How to start conversations
- How to see message history
- Notification settings

### API Documentation
Add endpoints to API reference:
- GET `/api/lobby-chats/friends`
- GET `/api/lobby-chats/messages/:userId`
- POST `/api/lobby-chats/send`

---

## Success Metrics

### Engagement
- **Daily Active Chatters**: Users sending ≥1 lobby message/day
- **Return Rate**: % of users who return to continue conversation
- **Messages Per Session**: Average messages sent per lobby visit
- **Friend Connections**: Average friends per user

### Stickiness
- **Day 7 Retention**: % users chatting 7 days after first message
- **Conversation Length**: Average messages per conversation
- **Response Rate**: % of messages that get replies
- **Cross-Session Chats**: % of session participants who chat later

---

## Deployment Steps

### 1. Database
```bash
# Run migration
psql -U postgres -d wewatch_db -f migrations/create_lobby_chats_table.sql
```

### 2. Backend
```bash
# Build and restart
cd backend
go build -o server cmd/server/main.go
./server
```

### 3. Frontend
```bash
# Already implemented - just restart
cd frontend
npm run dev
```

### 4. Testing
1. Create 2 test accounts
2. Join same room with both
3. Start watch session
4. Chat during session
5. End session
6. Open Chats tab
7. Continue conversation
8. Verify real-time delivery

---

## Support

For questions or issues:
1. Check WebSocket connection status
2. Verify database migration ran successfully
3. Check browser console for errors
4. Check backend logs for API errors
5. Test with 2 browsers side-by-side

---

**Status**: Frontend Complete ✅ | Backend Pending ⏳

**Priority**: High - This is a core differentiator for social stickiness

**Estimated Backend Work**: 3-4 hours
