# Lobby Chat Enhancements - Implementation Plan

## Overview
Upgrading lobby chat to match room chat features: attachments, voice notes, stickers, message actions, and friend management.

---

## 1. Database Schema Changes

### Update `lobby_chats` table
```sql
-- Add new columns for rich message types
ALTER TABLE lobby_chats 
ADD COLUMN message_type VARCHAR(20) DEFAULT 'text',
ADD COLUMN attachment_url TEXT,
ADD COLUMN attachment_name VARCHAR(255),
ADD COLUMN attachment_size BIGINT,
ADD COLUMN metadata JSONB,
ADD COLUMN edited BOOLEAN DEFAULT FALSE,
ADD COLUMN deleted_by_sender BOOLEAN DEFAULT FALSE,
ADD COLUMN deleted_by_recipient BOOLEAN DEFAULT FALSE;

-- Update existing deleted_at to support per-user deletion
-- Note: We'll use deleted_by_sender/deleted_by_recipient instead

-- Add index for message types
CREATE INDEX idx_lobby_chats_type ON lobby_chats(message_type);
```

**Message Types:**
- `text` - Regular text message
- `voice_note` - Audio recording
- `image` - Image attachment
- `video` - Video attachment
- `document` - PDF, DOCX, TXT, etc.
- `link` - Shared URL with preview
- `sticker` - Giphy/Tenor sticker
- `poll` - Yes/No or Multiple Choice poll

**Metadata JSONB Examples:**
```json
// Voice note
{
  "duration": 45,
  "waveform": [0.2, 0.5, 0.8, ...]
}

// Poll
{
  "question": "Pizza or Burgers?",
  "poll_type": "yes_no",
  "options": ["Yes", "No"],
  "votes": {
    "1": [user_id_1, user_id_2],
    "2": [user_id_3]
  },
  "total_votes": 3
}

// Link
{
  "url": "https://example.com",
  "title": "Example Site",
  "description": "Site description",
  "image": "https://example.com/og-image.jpg"
}

// Sticker
{
  "giphy_id": "abc123",
  "tenor_id": "xyz789",
  "provider": "giphy"
}
```

### Create `user_blocks` table
```sql
CREATE TABLE user_blocks (
    id SERIAL PRIMARY KEY,
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id),
    CONSTRAINT check_no_self_block CHECK (blocker_id != blocked_id)
);

CREATE INDEX idx_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX idx_user_blocks_blocked ON user_blocks(blocked_id);

COMMENT ON TABLE user_blocks IS 'Tracks blocked users - prevents messaging without unfriending';
```

---

## 2. File Upload Limits & Storage

### Local Storage Structure
```
backend/uploads/
  ├── lobby-images/
  │   └── {userId}/
  │       └── {timestamp}_{filename}.jpg
  ├── lobby-videos/
  │   └── {userId}/
  │       └── {timestamp}_{filename}.mp4
  ├── lobby-documents/
  │   └── {userId}/
  │       └── {timestamp}_{filename}.pdf
  └── lobby-voice-notes/
      └── {userId}/
          └── {timestamp}.webm
```

### File Size Limits
```go
const (
    MaxImageSize      = 5 * 1024 * 1024   // 5MB
    MaxVideoSize      = 50 * 1024 * 1024  // 50MB
    MaxDocumentSize   = 10 * 1024 * 1024  // 10MB
    MaxVoiceNoteSize  = 2 * 1024 * 1024   // 2MB
    MaxVoiceDuration  = 60                 // 60 seconds
)

var AllowedImageTypes = []string{"image/jpeg", "image/png", "image/gif", "image/webp"}
var AllowedVideoTypes = []string{"video/mp4", "video/webm", "video/quicktime"}
var AllowedDocTypes = []string{"application/pdf", "application/msword", 
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain"}
```

---

## 3. Backend Implementation

### New Go Files

#### `backend/internal/handlers/lobby_chat_attachments.go`
```go
package handlers

// Handles all attachment uploads for lobby chat

// UploadLobbyChatImageHandler - POST /api/lobby-chats/image
func UploadLobbyChatImageHandler(c *gin.Context) {
    // 1. Get user ID from auth
    // 2. Get recipient_id from form
    // 3. Parse multipart form (max 5MB)
    // 4. Validate image type (jpeg, png, gif, webp)
    // 5. Generate unique filename: {timestamp}_{uuid}.{ext}
    // 6. Create directory: uploads/lobby-images/{userId}/
    // 7. Save file
    // 8. Create lobby_chats record:
    //    - message_type: "image"
    //    - attachment_url: "/uploads/lobby-images/..."
    //    - attachment_name: original filename
    //    - attachment_size: file size in bytes
    // 9. Broadcast via WebSocket
    // 10. Return message object
}

// UploadLobbyChatVideoHandler - POST /api/lobby-chats/video
func UploadLobbyChatVideoHandler(c *gin.Context) {
    // Same as image but:
    // - Max 50MB
    // - Validate video types (mp4, webm, mov)
    // - Store in lobby-videos/
}

// UploadLobbyChatDocumentHandler - POST /api/lobby-chats/document
func UploadLobbyChatDocumentHandler(c *gin.Context) {
    // Same as image but:
    // - Max 10MB
    // - Validate doc types (pdf, docx, txt)
    // - Store in lobby-documents/
}

// UploadLobbyChatVoiceNoteHandler - POST /api/lobby-chats/voice-note
func UploadLobbyChatVoiceNoteHandler(c *gin.Context) {
    // 1. Accept audio blob (webm/ogg)
    // 2. Validate duration (max 60 seconds)
    // 3. Save to lobby-voice-notes/{userId}/{timestamp}.webm
    // 4. Store duration in metadata
    // 5. Broadcast via WebSocket
}
```

#### `backend/internal/handlers/lobby_chat_stickers.go`
```go
package handlers

// SendLobbyChatStickerHandler - POST /api/lobby-chats/sticker
func SendLobbyChatStickerHandler(c *gin.Context) {
    // Request body:
    // {
    //   "recipient_id": 123,
    //   "sticker_url": "https://media.giphy.com/...",
    //   "provider": "giphy",
    //   "sticker_id": "abc123"
    // }
    
    // 1. Validate sticker URL (must be from giphy.com or tenor.com)
    // 2. Create lobby_chats record:
    //    - message_type: "sticker"
    //    - attachment_url: sticker URL
    //    - metadata: {provider, sticker_id}
    // 3. Broadcast via WebSocket
}
```

#### `backend/internal/handlers/lobby_chat_polls.go`
```go
package handlers

// CreateLobbyChatPollHandler - POST /api/lobby-chats/poll
func CreateLobbyChatPollHandler(c *gin.Context) {
    // Request body:
    // {
    //   "recipient_id": 123,
    //   "question": "Pizza or Burgers?",
    //   "poll_type": "yes_no" | "multiple_choice",
    //   "options": ["Pizza", "Burgers"] // for multiple_choice
    // }
    
    // 1. Validate poll structure
    // 2. Create lobby_chats record:
    //    - message_type: "poll"
    //    - message: question
    //    - metadata: {poll_type, options, votes: {}}
    // 3. Broadcast via WebSocket
}

// VoteLobbyChatPollHandler - POST /api/lobby-chats/poll/:messageId/vote
func VoteLobbyChatPollHandler(c *gin.Context) {
    // Request body:
    // {
    //   "option_index": 0
    // }
    
    // 1. Get message from database
    // 2. Parse metadata.votes
    // 3. Remove user's previous vote (if any)
    // 4. Add new vote to option
    // 5. Update metadata in database
    // 6. Broadcast updated poll via WebSocket
}
```

#### `backend/internal/handlers/lobby_chat_actions.go`
```go
package handlers

// EditLobbyChatMessageHandler - PATCH /api/lobby-chats/:messageId
func EditLobbyChatMessageHandler(c *gin.Context) {
    // Request body: { "message": "edited text" }
    
    // 1. Verify user is sender
    // 2. Verify message type is "text"
    // 3. Update message, set edited=true
    // 4. Broadcast edit via WebSocket
}

// DeleteLobbyChatMessageHandler - DELETE /api/lobby-chats/:messageId
func DeleteLobbyChatMessageHandler(c *gin.Context) {
    // 1. Verify user is sender OR recipient
    // 2. If sender: set deleted_by_sender=true
    // 3. If recipient: set deleted_by_recipient=true
    // 4. If both deleted: set deleted_at timestamp
    // 5. Broadcast deletion via WebSocket
}

// ClearLobbyChatHandler - DELETE /api/lobby-chats/clear/:userId
func ClearLobbyChatHandler(c *gin.Context) {
    // 1. Get all messages between current user and target user
    // 2. For each message:
    //    - If current user is sender: deleted_by_sender=true
    //    - If current user is recipient: deleted_by_recipient=true
    // 3. Refresh conversation (should be empty for user)
}
```

#### `backend/internal/handlers/lobby_chat_blocks.go`
```go
package handlers

// BlockUserHandler - POST /api/lobby-chats/block/:userId
func BlockUserHandler(c *gin.Context) {
    // 1. Verify target user exists
    // 2. Create user_blocks record
    // 3. Return success
    // Note: Does NOT unfriend them
}

// UnblockUserHandler - DELETE /api/lobby-chats/block/:userId
func UnblockUserHandler(c *gin.Context) {
    // 1. Delete user_blocks record
    // 2. Return success
}

// GetBlockedUsersHandler - GET /api/lobby-chats/blocked
func GetBlockedUsersHandler(c *gin.Context) {
    // 1. Get all users blocked by current user
    // 2. Return list with user info
}

// CheckIfBlockedHandler - GET /api/lobby-chats/block-status/:userId
func CheckIfBlockedHandler(c *gin.Context) {
    // Returns: { "is_blocked": true/false, "blocked_by_me": true/false }
}
```

### Update Existing Handlers

#### `lobby_chats.go` - Update these functions:

**GetLobbyChatFriendsHandler:**
```go
// Add to SQL query:
WHERE friendships.status = 'accepted'
  AND NOT EXISTS (
    SELECT 1 FROM user_blocks 
    WHERE (blocker_id = ? AND blocked_id = users.id)
       OR (blocker_id = users.id AND blocked_id = ?)
  )
```

**SendLobbyChatMessageHandler:**
```go
// Add after recipient verification:
var blockCheck int64
db.Model(&UserBlock{}).Where(
    "(blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)",
    senderID, recipientID, recipientID, senderID,
).Count(&blockCheck)

if blockCheck > 0 {
    c.JSON(http.StatusForbidden, gin.H{
        "error": "Cannot send message - user blocked"
    })
    return
}
```

**GetLobbyChatMessagesHandler:**
```go
// Add to WHERE clause:
AND deleted_by_sender = FALSE AND deleted_by_recipient = FALSE
```

### Register New Routes

#### `backend/cmd/server/main.go`
```go
lobbyChats := protected.Group("/lobby-chats")
{
    // Existing routes
    lobbyChats.GET("/friends", handlers.GetLobbyChatFriendsHandler)
    lobbyChats.GET("/messages/:userId", handlers.GetLobbyChatMessagesHandler)
    lobbyChats.POST("/send", handlers.SendLobbyChatMessageHandler)
    
    // NEW: Attachments
    lobbyChats.POST("/image", handlers.UploadLobbyChatImageHandler)
    lobbyChats.POST("/video", handlers.UploadLobbyChatVideoHandler)
    lobbyChats.POST("/document", handlers.UploadLobbyChatDocumentHandler)
    lobbyChats.POST("/voice-note", handlers.UploadLobbyChatVoiceNoteHandler)
    
    // NEW: Stickers & Polls
    lobbyChats.POST("/sticker", handlers.SendLobbyChatStickerHandler)
    lobbyChats.POST("/poll", handlers.CreateLobbyChatPollHandler)
    lobbyChats.POST("/poll/:messageId/vote", handlers.VoteLobbyChatPollHandler)
    
    // NEW: Message Actions
    lobbyChats.PATCH("/:messageId", handlers.EditLobbyChatMessageHandler)
    lobbyChats.DELETE("/:messageId", handlers.DeleteLobbyChatMessageHandler)
    lobbyChats.DELETE("/clear/:userId", handlers.ClearLobbyChatHandler)
    
    // NEW: Blocking
    lobbyChats.POST("/block/:userId", handlers.BlockUserHandler)
    lobbyChats.DELETE("/block/:userId", handlers.UnblockUserHandler)
    lobbyChats.GET("/blocked", handlers.GetBlockedUsersHandler)
    lobbyChats.GET("/block-status/:userId", handlers.CheckIfBlockedHandler)
}
```

---

## 4. Frontend Implementation

### New Components to Create

#### `frontend/src/components/LobbyAttachModal.jsx`
```jsx
// Copy from RoomAttachModal.jsx
// Update API endpoints to lobby-chats
// Add video option alongside image/document/link/poll

const attachmentTypes = [
  { id: 'image', label: 'Images', icon: '🖼️', max: '5MB' },
  { id: 'video', label: 'Videos', icon: '🎥', max: '50MB' },
  { id: 'document', label: 'Documents', icon: '📄', max: '10MB' },
  { id: 'sticker', label: 'Stickers', icon: '😊', max: 'GIF' },
  { id: 'link', label: 'Links', icon: '🔗', max: 'URL' },
  { id: 'poll', label: 'Poll', icon: '📊', max: 'Vote' }
];
```

#### `frontend/src/components/LobbyStickerPicker.jsx`
```jsx
// Integration with Giphy SDK
import { GiphyFetch } from '@giphy/js-fetch-api';

const gf = new GiphyFetch('YOUR_GIPHY_API_KEY');

// Show trending stickers
// Search stickers
// Category tabs: Reactions, Animals, Food, etc.
// Click sticker → Send to chat
```

#### `frontend/src/components/LobbyPollCreator.jsx`
```jsx
// Poll type selector: Yes/No or Multiple Choice
// Question input
// Options list (for multiple choice)
// Create button → POST to /api/lobby-chats/poll
```

#### `frontend/src/components/LobbyPollDisplay.jsx`
```jsx
// Display poll question
// Show options with vote buttons
// Display results (percentage bars)
// Update in real-time when votes come via WebSocket
```

#### `frontend/src/components/LobbyMessageBubble.jsx`
```jsx
// Render different message types:
// - text: regular bubble
// - voice_note: audio player
// - image: thumbnail with lightbox
// - video: video player
// - document: file icon + download
// - sticker: large emoji/GIF
// - poll: interactive voting interface

// Message ellipsis menu (⋮) button
// - Edit (text only, if sender)
// - Delete (for sender)
// - Copy (text only)
```

### Update Existing Components

#### `frontend/src/components/LobbyPage.jsx`

**Add State:**
```jsx
// Voice recording
const [isRecording, setIsRecording] = useState(false);
const [recordingDuration, setRecordingDuration] = useState(0);
const [audioBlob, setAudioBlob] = useState(null);

// Modals
const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);
const [isStickerPickerOpen, setIsStickerPickerOpen] = useState(false);
const [isPollCreatorOpen, setIsPollCreatorOpen] = useState(false);

// Message actions
const [messageMenuOpen, setMessageMenuOpen] = useState(null);
const [editingMessageId, setEditingMessageId] = useState(null);

// Friend actions
const [friendMenuOpen, setFriendMenuOpen] = useState(null);
const [blockedUsers, setBlockedUsers] = useState([]);
```

**Add Functions:**
```jsx
// Copy from RoomPageNew.jsx:
const startRecording = async () => { ... };
const stopRecording = () => { ... };
const uploadVoiceNote = async (blob) => { ... };
const toggleAudioPlayback = (messageId, audioUrl) => { ... };

// New functions:
const handleAttachmentUpload = async (type, file) => { ... };
const handleStickerSend = async (stickerUrl, provider, stickerId) => { ... };
const handlePollCreate = async (pollData) => { ... };
const handlePollVote = async (messageId, optionIndex) => { ... };

const handleEditMessage = async (messageId, newText) => { ... };
const handleDeleteMessage = async (messageId) => { ... };
const handleClearChat = async (userId) => { ... };

const handleBlockFriend = async (userId) => { ... };
const handleUnblockFriend = async (userId) => { ... };
```

**Update Chat Input:**
```jsx
<div className="chat-input-container">
  {/* Voice note button */}
  <button onClick={handleVoiceNoteClick}>
    {isRecording ? <StopIcon /> : <MicrophoneIcon />}
  </button>
  
  {/* Attachment button */}
  <button onClick={() => setIsAttachModalOpen(true)}>
    <PaperClipIcon />
  </button>
  
  {/* Sticker button */}
  <button onClick={() => setIsStickerPickerOpen(true)}>
    😊
  </button>
  
  <input 
    value={newMessage} 
    onChange={(e) => setNewMessage(e.target.value)}
    placeholder="Type a message..."
  />
  
  <button onClick={handleSendMessage}>
    <PaperAirplaneIcon />
  </button>
</div>

{/* Recording UI */}
{isRecording && (
  <div className="recording-indicator">
    🔴 Recording... {recordingDuration}s
  </div>
)}
```

**Update Friends List:**
```jsx
{friendsList.map(friend => (
  <div key={friend.id} className="friend-item">
    <Avatar user={friend} />
    <div className="friend-info">
      <h4>{friend.username}</h4>
      {unreadCounts[friend.id] > 0 && (
        <span className="unread-badge">{unreadCounts[friend.id]}</span>
      )}
    </div>
    
    {/* NEW: Ellipsis menu */}
    <button 
      className="ellipsis-btn"
      onClick={() => setFriendMenuOpen(friend.id)}
    >
      ⋮
    </button>
    
    {friendMenuOpen === friend.id && (
      <div className="dropdown-menu">
        <button onClick={() => handleClearChat(friend.id)}>
          🗑️ Clear Chat
        </button>
        <button onClick={() => handleBlockFriend(friend.id)}>
          🚫 Block
        </button>
      </div>
    )}
  </div>
))}
```

**Update Message Display:**
```jsx
{chatMessages[selectedChatUser.id]?.map(msg => (
  <div key={msg.id} className={`message ${msg.sender_id === currentUser.id ? 'sent' : 'received'}`}>
    {/* NEW: Message ellipsis */}
    {msg.sender_id === currentUser.id && (
      <button 
        className="message-menu-btn"
        onClick={() => setMessageMenuOpen(msg.id)}
      >
        ⋮
      </button>
    )}
    
    {messageMenuOpen === msg.id && (
      <div className="dropdown-menu">
        {msg.message_type === 'text' && (
          <button onClick={() => startEditing(msg)}>✏️ Edit</button>
        )}
        <button onClick={() => handleDeleteMessage(msg.id)}>🗑️ Delete</button>
      </div>
    )}
    
    {/* Render message content based on type */}
    <LobbyMessageBubble message={msg} />
  </div>
))}
```

**Update WebSocket Handler:**
```jsx
case 'lobby_chat':
  const newMsg = data.data;
  
  // Handle all message types
  setChatMessages(prev => ({
    ...prev,
    [getUserIdFromMessage(newMsg)]: [
      ...(prev[getUserIdFromMessage(newMsg)] || []),
      newMsg
    ]
  }));
  
  // Handle special updates
  if (newMsg.message_type === 'poll' && newMsg.metadata?.votes) {
    // Update poll votes in real-time
  }
  break;

case 'lobby_chat_edit':
  // Update edited message
  break;

case 'lobby_chat_delete':
  // Remove deleted message
  break;

case 'lobby_chat_poll_vote':
  // Update poll results
  break;
```

---

## 5. Third-Party Integrations

### Giphy SDK Setup

**Install:**
```bash
npm install @giphy/js-fetch-api @giphy/react-components
```

**Get API Key:**
1. Sign up at https://developers.giphy.com/
2. Create app (free tier: 42 requests/hour)
3. Copy API key

**Frontend Config:**
```js
// frontend/src/config/giphy.js
export const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY || 'YOUR_KEY';
```

**Usage:**
```jsx
import { GiphyFetch } from '@giphy/js-fetch-api';
const gf = new GiphyFetch(GIPHY_API_KEY);

// Search stickers
const { data: stickers } = await gf.search('happy', { 
  type: 'stickers',
  limit: 20 
});

// Get trending
const { data: trending } = await gf.trending({ 
  type: 'stickers',
  limit: 20 
});
```

### Alternative: Tenor (Google)

**Free Tier:** Unlimited requests
**API:** https://tenor.com/gifapi/documentation

---

## 6. Migration Scripts

### `backend/migrations/20260206_lobby_chat_enhancements.sql`
```sql
-- Step 1: Add new columns to lobby_chats
ALTER TABLE lobby_chats 
ADD COLUMN message_type VARCHAR(20) DEFAULT 'text',
ADD COLUMN attachment_url TEXT,
ADD COLUMN attachment_name VARCHAR(255),
ADD COLUMN attachment_size BIGINT,
ADD COLUMN metadata JSONB,
ADD COLUMN edited BOOLEAN DEFAULT FALSE,
ADD COLUMN deleted_by_sender BOOLEAN DEFAULT FALSE,
ADD COLUMN deleted_by_recipient BOOLEAN DEFAULT FALSE;

-- Step 2: Create indexes
CREATE INDEX idx_lobby_chats_type ON lobby_chats(message_type);
CREATE INDEX idx_lobby_chats_sender_deleted ON lobby_chats(sender_id, deleted_by_sender);
CREATE INDEX idx_lobby_chats_recipient_deleted ON lobby_chats(recipient_id, deleted_by_recipient);

-- Step 3: Create user_blocks table
CREATE TABLE user_blocks (
    id SERIAL PRIMARY KEY,
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id),
    CONSTRAINT check_no_self_block CHECK (blocker_id != blocked_id)
);

CREATE INDEX idx_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX idx_user_blocks_blocked ON user_blocks(blocked_id);

-- Step 4: Add comments
COMMENT ON COLUMN lobby_chats.message_type IS 'Type: text, voice_note, image, video, document, link, sticker, poll';
COMMENT ON COLUMN lobby_chats.metadata IS 'JSON data for polls, stickers, voice note duration, etc.';
COMMENT ON TABLE user_blocks IS 'Blocks messaging without unfriending';

-- Step 5: Create upload directories (do this manually or via Go on startup)
-- mkdir -p uploads/lobby-images
-- mkdir -p uploads/lobby-videos
-- mkdir -p uploads/lobby-documents
-- mkdir -p uploads/lobby-voice-notes
```

---

## 7. Implementation Order (Step-by-Step)

### Phase 1: Foundation (Day 1)
1. ✅ Run database migration
2. ✅ Create upload directories
3. ✅ Add file size constants to backend
4. ✅ Create `UserBlock` model in Go
5. ✅ Update `LobbyChat` model with new fields

### Phase 2: Blocking (Day 1)
6. ✅ Implement `lobby_chat_blocks.go` handlers
7. ✅ Register block routes
8. ✅ Update friends/messages queries to check blocks
9. ✅ Test blocking functionality

### Phase 3: Voice Notes (Day 2)
10. ✅ Implement `UploadLobbyChatVoiceNoteHandler`
11. ✅ Copy voice recording logic from RoomPageNew to LobbyPage
12. ✅ Add microphone button to chat input
13. ✅ Add audio player to message bubbles
14. ✅ Test voice note recording/playback

### Phase 4: Image/Video/Document Uploads (Day 2-3)
15. ✅ Implement attachment upload handlers
16. ✅ Create `LobbyAttachModal` component
17. ✅ Add file input handling
18. ✅ Add thumbnail/preview rendering in messages
19. ✅ Test all attachment types

### Phase 5: Stickers (Day 3)
20. ✅ Get Giphy API key
21. ✅ Install Giphy SDK
22. ✅ Create `LobbyStickerPicker` component
23. ✅ Implement `SendLobbyChatStickerHandler`
24. ✅ Test sticker sending/receiving

### Phase 6: Polls (Day 4)
25. ✅ Create `LobbyPollCreator` component
26. ✅ Create `LobbyPollDisplay` component
27. ✅ Implement poll creation/voting handlers
28. ✅ Add real-time vote updates via WebSocket
29. ✅ Test both poll types (yes/no and multiple choice)

### Phase 7: Message Actions (Day 5)
30. ✅ Implement edit/delete handlers
31. ✅ Add ellipsis menu to message bubbles
32. ✅ Add edit mode for text messages
33. ✅ Implement clear chat functionality
34. ✅ Test all message actions

### Phase 8: Friend Actions (Day 5)
35. ✅ Add ellipsis menu to friends list
36. ✅ Implement clear chat confirmation modal
37. ✅ Implement block confirmation modal
38. ✅ Test friend management

### Phase 9: Polish (Day 6)
39. ✅ Add loading states for uploads
40. ✅ Add progress bars for video uploads
41. ✅ Add error handling for all actions
42. ✅ Add success toasts
43. ✅ Optimize WebSocket message handling

### Phase 10: Testing (Day 7)
44. ✅ Test with 2 users in different browsers
45. ✅ Test all attachment types
46. ✅ Test blocking scenarios
47. ✅ Test message editing/deletion
48. ✅ Test polls with multiple voters
49. ✅ Test WebSocket real-time updates
50. ✅ Load test with large files

---

## 8. File Structure Summary

### Backend Files to Create:
```
backend/
├── internal/
│   ├── handlers/
│   │   ├── lobby_chat_attachments.go    (NEW)
│   │   ├── lobby_chat_stickers.go       (NEW)
│   │   ├── lobby_chat_polls.go          (NEW)
│   │   ├── lobby_chat_actions.go        (NEW)
│   │   ├── lobby_chat_blocks.go         (NEW)
│   │   └── lobby_chats.go               (UPDATE)
│   └── models/
│       ├── lobby_chat.go                (UPDATE)
│       └── user_block.go                (NEW)
├── migrations/
│   └── 20260206_lobby_chat_enhancements.sql (NEW)
└── uploads/                             (NEW)
    ├── lobby-images/
    ├── lobby-videos/
    ├── lobby-documents/
    └── lobby-voice-notes/
```

### Frontend Files to Create:
```
frontend/
└── src/
    ├── components/
    │   ├── LobbyAttachModal.jsx         (NEW)
    │   ├── LobbyStickerPicker.jsx       (NEW)
    │   ├── LobbyPollCreator.jsx         (NEW)
    │   ├── LobbyPollDisplay.jsx         (NEW)
    │   ├── LobbyMessageBubble.jsx       (NEW)
    │   └── LobbyPage.jsx                (UPDATE)
    └── config/
        └── giphy.js                     (NEW)
```

---

## 9. Testing Checklist

### Attachments
- [ ] Upload image (under 5MB) ✅
- [ ] Upload image (over 5MB) → Error
- [ ] Upload video (under 50MB) ✅
- [ ] Upload video (over 50MB) → Error
- [ ] Upload PDF ✅
- [ ] Upload DOCX ✅
- [ ] Download document ✅
- [ ] View image in lightbox ✅
- [ ] Play video inline ✅

### Voice Notes
- [ ] Record voice note (10s) ✅
- [ ] Record voice note (60s) ✅
- [ ] Record voice note (over 60s) → Auto-stop
- [ ] Play voice note ✅
- [ ] Pause/resume voice note ✅
- [ ] Mic permission denied → Show error

### Stickers
- [ ] Search Giphy stickers ✅
- [ ] Send sticker ✅
- [ ] Receive sticker in real-time ✅
- [ ] View sticker (large size) ✅

### Polls
- [ ] Create yes/no poll ✅
- [ ] Create multiple choice poll (3 options) ✅
- [ ] Vote on poll ✅
- [ ] Change vote ✅
- [ ] See live results ✅
- [ ] Prevent voting after poll ends (optional)

### Message Actions
- [ ] Edit text message ✅
- [ ] Delete message (sender) ✅
- [ ] Delete message (disappears for sender only)
- [ ] Copy message text ✅
- [ ] Message shows "Edited" label ✅

### Friend Actions
- [ ] Clear chat → Confirmation modal ✅
- [ ] Clear chat → Messages deleted for me only ✅
- [ ] Block friend → Confirmation modal ✅
- [ ] Block friend → Can't send messages ✅
- [ ] Block friend → Still in friends list
- [ ] Unblock friend ✅

### Real-Time Updates
- [ ] User A sends message → User B sees instantly ✅
- [ ] User A votes on poll → User B sees vote update ✅
- [ ] User A edits message → User B sees edit ✅
- [ ] User A deletes message → User B sees deletion ✅

---

## 10. Future Enhancements (Phase 2)

### Advanced Features
- **Reactions**: Emoji reactions to messages (👍 ❤️ 😂 😮 😢)
- **Reply/Quote**: Reply to specific message with context
- **Typing Indicators**: "John is typing..."
- **Read Receipts**: Double checkmarks when read
- **Online Status**: Green dot when friend is online
- **Message Search**: Search conversation history
- **Link Previews**: Automatic preview for shared URLs
- **File Preview**: PDF viewer, image carousel
- **Voice Message Speed**: 1.5x, 2x playback
- **Message Forwarding**: Forward message to another friend
- **Multiple Recipients**: Send to multiple friends at once

### Security
- **Rate Limiting**: Max 30 messages/minute
- **Spam Detection**: Flag suspicious messages
- **Report User**: Report inappropriate content
- **Admin Moderation**: Review reported messages

### Performance
- **Message Pagination**: Load 50 messages at a time
- **Image Compression**: Compress images before upload
- **Video Transcoding**: Convert to WebM/MP4
- **CDN Integration**: Serve attachments from CDN
- **Lazy Loading**: Load images as you scroll

---

## 11. Cost Estimates

### Development Time
- **Backend**: ~20 hours (5 days × 4 hours)
- **Frontend**: ~24 hours (6 days × 4 hours)
- **Testing**: ~8 hours (2 days × 4 hours)
- **Total**: ~52 hours (~7 working days)

### API Costs (Free Tiers)
- **Giphy**: 42 requests/hour (free)
- **Tenor**: Unlimited (free)
- **Storage**: Local filesystem (free for now)

### Production Migration Costs
- **S3 Storage**: ~$0.023 per GB/month
- **CloudFront CDN**: ~$0.085 per GB transfer
- **Estimated**: $10-50/month (for 1000 active users)

---

## 12. Success Metrics

Track these after deployment:
- **Message Type Distribution**: % of text/voice/image/video/sticker/poll
- **Voice Note Usage**: How many users send voice notes?
- **Poll Engagement**: Average votes per poll
- **Sticker Usage**: Most popular stickers
- **Attachment Size**: Average file sizes
- **Block Rate**: % of friendships that end in blocks
- **Clear Chat Rate**: How often do users clear chats?

---

**Status**: 📋 READY FOR IMPLEMENTATION

**Priority**: HIGH - Completes social feature parity with room chat

**Estimated Completion**: 7 working days

**Next Step**: Run database migration, then start with Phase 1 (Blocking)
