# RoomPage Redesign - Testing & Migration Plan

## Current Status: ✅ READY FOR TESTING

### Implementation Complete
- ✅ Backend endpoints implemented and running
- ✅ Frontend RoomPageNew.jsx fully integrated
- ✅ App.jsx route switched to RoomPageNew
- ✅ WebSocket real-time messaging working
- ✅ Database migration completed (room_messages table created)

### Servers Running
- Backend: http://localhost:8080
- Frontend: http://localhost:5173
- Database: PostgreSQL with room_messages table

---

## Testing Plan

### Phase 1: Room Hub Functionality ⭐ START HERE
**Goal:** Verify persistent room chat and presence

1. **Navigate to Room**
   - [ ] Go to lobby (http://localhost:5173/lobby)
   - [ ] Click on any room card
   - [ ] Verify redirects to /rooms/:id with RoomPageNew

2. **Room Info Display**
   - [ ] Verify room name shows in sticky header
   - [ ] Verify room description displays
   - [ ] Verify members list appears on right side
   - [ ] Verify "Begin Watch" button is visible

3. **Persistent Chat**
   - [ ] Type message in chat input at bottom
   - [ ] Press Enter or click Send
   - [ ] Verify message appears in chat area with your username
   - [ ] **Refresh the page** - verify message still there (persistent!)
   - [ ] Send 2-3 more messages

4. **Real-Time Sync**
   - [ ] Open second browser window (or incognito)
   - [ ] Login as different user (or same user)
   - [ ] Navigate to same room
   - [ ] In window 1: Send a message
   - [ ] In window 2: Verify message appears instantly (WebSocket)
   - [ ] In window 2: Send a message
   - [ ] In window 1: Verify message appears instantly

**✅ Pass Criteria:** Messages persist after refresh, sync in real-time across clients

---

### Phase 2: Session Creation (Video Watch)
**Goal:** Verify session creation flow with WatchTypeModal

1. **Begin Watch Flow**
   - [ ] Click "Begin Watch" button in room hub
   - [ ] Verify WatchTypeModal opens with 2 options
   - [ ] Select "Video Watch"
   - [ ] Verify toast shows "Starting Video Watch..."
   - [ ] Verify redirects to /watch/:roomId?session_id=xxx

2. **Active Session Banner**
   - [ ] Navigate back to room hub (/rooms/:id)
   - [ ] Verify yellow/blue banner appears at top saying "Active Watch Session"
   - [ ] Verify banner shows session type: "Video Watch"
   - [ ] Verify banner shows member count (at least 1 - you)
   - [ ] Verify "Join Session" button is visible

3. **Join Existing Session**
   - [ ] Click "Join Session" button on banner
   - [ ] Verify redirects back to /watch/:roomId
   - [ ] Verify you're in the same session

4. **End Session**
   - [ ] In VideoWatch, end the session (End Watch button)
   - [ ] Navigate back to room hub
   - [ ] Verify active session banner is gone
   - [ ] Verify room chat messages still visible (persistent)

**✅ Pass Criteria:** Session creation works, banner appears/disappears correctly, room chat persists

---

### Phase 3: 3D Cinema Session
**Goal:** Verify 3D Cinema session type works

1. **Create 3D Cinema Session**
   - [ ] From room hub, click "Begin Watch"
   - [ ] Select "3D Cinema" from modal
   - [ ] Verify redirects to /cinema-3d-demo/:roomId?session_id=xxx
   - [ ] Verify 3D environment loads

2. **Check Session Banner**
   - [ ] Navigate back to room hub
   - [ ] Verify banner shows "3D Cinema" as session type
   - [ ] Click "Join Session"
   - [ ] Verify returns to 3D cinema environment

**✅ Pass Criteria:** Both watch types create sessions correctly

---

### Phase 4: Multi-User Session Testing
**Goal:** Verify multiple users can interact properly

1. **Two Users - Same Room**
   - [ ] User A: Create session from room hub
   - [ ] User B: Navigate to same room
   - [ ] User B: Verify session banner appears
   - [ ] User B: Click "Join Session"
   - [ ] Verify both users in same watch experience

2. **Room Chat During Session**
   - [ ] User A: Go back to room hub while session active
   - [ ] User A: Send room chat message
   - [ ] User B: Go to room hub
   - [ ] User B: Verify sees the message
   - [ ] User B: Reply in room chat
   - [ ] User A: Verify sees reply in real-time

3. **Session End - Both Users**
   - [ ] User A: End session
   - [ ] User B: Verify session ended (gets redirected)
   - [ ] Both users: Go to room hub
   - [ ] Both users: Verify session banner is gone
   - [ ] Both users: Verify room chat history intact

**✅ Pass Criteria:** Multi-user session and room chat work independently

---

### Phase 5: Edge Cases
**Goal:** Test error handling and edge cases

1. **Duplicate Session Prevention**
   - [ ] User A: Create a session
   - [ ] User B: Try to create another session (click Begin Watch)
   - [ ] Verify gets conflict error or automatically joins existing session

2. **Offline/Reconnect**
   - [ ] In room hub, send a message
   - [ ] Disconnect WiFi for 5 seconds
   - [ ] Reconnect WiFi
   - [ ] Verify WebSocket reconnects automatically
   - [ ] Send another message - verify it works

3. **Leave and Rejoin Room**
   - [ ] Send 3 messages in room chat
   - [ ] Navigate away to lobby
   - [ ] Navigate back to same room
   - [ ] Verify all 3 messages still visible (persistent)

4. **Room vs Session Chat Separation**
   - [ ] Create a watch session
   - [ ] In VideoWatch or Cinema3D, send session chat message
   - [ ] Go back to room hub
   - [ ] Verify session chat message NOT in room chat (separate!)

**✅ Pass Criteria:** All edge cases handled gracefully

---

## Migration Plan (After Testing Passes)

### Step 1: Backup Old RoomPage
```bash
cd frontend/src/components
cp RoomPage.jsx RoomPage.jsx.backup
```

### Step 2: Delete Old RoomPage
```bash
rm RoomPage.jsx
```

### Step 3: Rename RoomPageNew
```bash
mv RoomPageNew.jsx RoomPage.jsx
```

### Step 4: Update App.jsx Import
```javascript
// Change this line in App.jsx:
import RoomPageNew from './components/RoomPageNew'; // ✅ NEW: Room hub redesign

// To this:
import RoomPage from './components/RoomPage';

// And change the route:
<ProtectedRoute><RoomPageNew /></ProtectedRoute>
// To:
<ProtectedRoute><RoomPage /></ProtectedRoute>
```

### Step 5: Verify and Commit
```bash
# Test that everything still works after rename
npm run dev

# If all good, commit
git add .
git commit -m "feat: Replace RoomPage with redesigned room hub

- Room hub now separates persistent room chat from session chat
- Active session banner shows when watch session is active
- Begin Watch modal for session type selection
- Real-time WebSocket messaging for room-level chat
- Removed video player from room hub (now a gateway)

Old RoomPage.jsx (1243 lines) replaced with cleaner RoomPage.jsx (453 lines)"
```

---

## Files Changed

### Backend
- `backend/internal/models/room_message.go` (NEW)
- `backend/internal/handlers/room_handlers.go` (NEW)
- `backend/cmd/server/main.go` (routes added)

### Frontend
- `frontend/src/components/RoomPageNew.jsx` (NEW)
- `frontend/src/App.jsx` (route switched)

### To Delete After Testing
- `frontend/src/components/RoomPage.jsx` (1243 lines - old design)

---

## Troubleshooting

### Issue: Messages not appearing
**Check:**
- Backend console: Look for "room_chat" broadcast logs
- Browser console: Check WebSocket connection status
- Network tab: Verify POST /api/rooms/:id/messages succeeds

### Issue: Session banner not showing
**Check:**
- GET /api/rooms/:id/active-session returns data
- Console logs in fetchActiveSession()
- Verify session was created (check backend logs)

### Issue: WebSocket disconnects
**Check:**
- Backend console: Look for WebSocket errors
- Token validity: Check sessionStorage.getItem('wewatch_ws_token')
- Browser console: Check ws.onclose messages

### Issue: Page breaks after rename
**Check:**
- Import statement in App.jsx matches filename
- Component export in RoomPage.jsx is correct
- No lingering references to RoomPageNew in code

---

## Architecture Comparison

### Old RoomPage (RoomPage.jsx - 1243 lines)
❌ Video player embedded in room page (bloated)
❌ Unclear separation between room and session
❌ Chat was session-specific, not persistent
❌ No visual indication of active sessions
❌ Complex state management with video player

### New Room Hub (RoomPageNew.jsx → RoomPage.jsx - 453 lines)
✅ Clean hub/gateway design (no video player)
✅ Clear separation: Room (persistent) vs Session (temporary)
✅ Persistent room chat (room_messages table)
✅ Active session banner with join functionality
✅ Simpler state management, focused on social hub

---

## Success Criteria

### Must Pass Before Migration:
1. ✅ Room chat persists after page refresh
2. ✅ Room chat syncs in real-time across clients
3. ✅ Session creation works for both video and 3D cinema
4. ✅ Active session banner appears/disappears correctly
5. ✅ Join session button works
6. ✅ Room chat separate from session chat
7. ✅ Multiple users can be in same room/session

### Nice to Have (Can Fix Later):
- User presence indicators (online/offline)
- Typing indicators in room chat
- Message timestamps formatting
- Avatar thumbnails in session banner

---

## Next Steps After Migration

1. **Add Features:**
   - Message reactions (emoji)
   - @mentions in room chat
   - Message search/filter
   - Room chat notifications

2. **Performance:**
   - Paginate room messages (load more)
   - Lazy load member list
   - Optimize WebSocket reconnection

3. **Polish:**
   - Loading skeletons
   - Empty states
   - Error boundaries
   - Better mobile responsive design

4. **Documentation:**
   - Update README with new architecture
   - Add WebSocket message format docs
   - Create user guide for room vs session chat
