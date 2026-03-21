# Lecture Hall Preview Testing Guide

## Quick Start

### Prerequisites
1. Backend running (`cd backend && go run main.go`)
2. Frontend running (`cd frontend && npm start`)
3. PostgreSQL running with migration applied
4. At least 2 users (host and member)

## Test Scenarios

### Test 1: Upload Video Preview
**Goal:** Verify GIF generation for uploaded videos

1. **Host**: Create lecture hall room, start session
2. **Host**: Click sidebar → Upload tab → Select video file
3. **Host**: Upload completes, video plays on blackboard
4. **Member**: Open LobbyPage (`/`)
5. **Member**: Wait 1 minute
6. **Member**: Verify preview shows:
   - Initially: 🎓 emoji
   - After 1min: Spinner → GIF of video

**Expected Backend Logs:**
```
[update_media_state] 📺 Updating media state for session ...
[update_media_state] ✅ Updated media state for session ... (1 rows)
```

**Expected Frontend Network:**
- WebSocket message: `{"type":"update_media_state","data":{...}}`
- HTTP POST: `/api/sessions/:id/generate-preview`

---

### Test 2: LiveShare Preview
**Goal:** Verify emoji fallback for live streams (until frame capture implemented)

1. **Host**: In lecture hall, click sidebar → LiveShare tab
2. **Host**: Select "Share Screen" → Allow browser permission
3. **Host**: Screen share appears on blackboard
4. **Member**: Open LobbyPage
5. **Member**: Verify preview shows:
   - 💻 emoji with "LiveShare Active" label
   - No spinner (preview generation skipped)

**Expected State:**
```javascript
session.is_screen_sharing_active = true
session.sharing_source = "liveshare"
session.current_media_type = "liveshare"
```

---

### Test 3: Watch From Preview
**Goal:** Verify emoji for Watch From feature

1. **Host**: In lecture hall, click sidebar → WatchFrom tab
2. **Host**: Enter platform URL (e.g., YouTube)
3. **Host**: Click "Start Watching"
4. **Member**: Open LobbyPage
5. **Member**: Verify preview shows:
   - 📺 emoji with "Watch From Active" label

**Expected State:**
```javascript
session.is_screen_sharing_active = true
session.sharing_source = "watchfrom"
session.current_media_type = "watchfrom"
```

---

### Test 4: Stop LiveShare, Restore Upload
**Goal:** Verify preview returns to upload GIF after stopping screen share

1. **Host**: Start with uploaded video playing
2. **Host**: Start LiveShare (video paused, screen share starts)
3. **Member**: Preview changes to 💻 emoji
4. **Host**: Stop LiveShare
5. **Host**: Uploaded video resumes
6. **Member**: Preview returns to GIF after 5min refresh

**Expected Behavior:**
- `handleEndScreenShare` restores `previousBlackboardStateRef`
- WebSocket sends `update_media_state` with restored upload URL
- Next preview generation cycle creates GIF

---

### Test 5: No Media Emoji
**Goal:** Verify emoji when no media is playing

1. **Host**: Start lecture hall, don't play any media
2. **Member**: Open LobbyPage
3. **Member**: Verify preview shows:
   - 🎓 emoji with "Lecture Hall" label
   - No preview generation attempts

**Expected State:**
```javascript
session.current_media_url = null
session.is_screen_sharing_active = false
```

---

### Test 6: Preview Refresh Interval
**Goal:** Verify 5-minute refresh cycle

1. **Host**: Play video in lecture hall
2. **Member**: Open LobbyPage, wait for initial preview (1min)
3. **Host**: Seek video to different timestamp
4. **Member**: Wait 5 minutes
5. **Member**: Verify preview updates with new timestamp

**Timing:**
- Initial: 1 minute after session starts
- Subsequent: Every 5 minutes

---

### Test 7: Session State Persistence
**Goal:** Verify state survives reconnection

1. **Host**: Upload video, starts playing
2. **Member**: Join session, see video
3. **Member**: Disconnect WebSocket (close browser, wait)
4. **Member**: Reconnect (reopen browser)
5. **Member**: Verify:
   - Video still shows on blackboard
   - LobbyPage preview still correct

**Expected:**
- Database stores `current_media_url`
- `session_status` on reconnect includes media state
- Preview generation works without re-upload

---

## Debugging

### Check WebSocket Messages
```javascript
// In browser console (PositionCalculatorPage)
// Look for:
{"type":"update_media_state","data":{...}}

// On LobbyPage:
{"type":"session_status","data":{
  "current_media_url":"...",
  "current_media_type":"upload",
  ...
}}
```

### Check Database State
```sql
-- View current media state for all sessions
SELECT 
  session_id,
  current_media_url,
  current_media_type,
  is_screen_sharing_active,
  sharing_source,
  started_at
FROM watch_sessions
WHERE ended_at IS NULL;
```

### Backend Logs to Monitor
```
[update_media_state] 📺 Updating media state for session ...
[client_ready] Session status includes: current_media_url, is_screen_sharing_active
```

### Frontend Logs to Monitor
```
🎬 [LobbyPage] Generating preview for session: ...
📺 [LobbyPage] Lecture hall ... has no media - showing emoji
⏭️ [LobbyPage] Skipping preview generation (requires frame capture)
📡 [Media State] Sent update_media_state for upload: ...
```

---

## Known Limitations

1. **LiveShare/WatchFrom GIF Generation:**
   - Currently shows emoji/loading state
   - Requires canvas frame capture implementation
   - See [LECTURE_HALL_PREVIEW_IMPLEMENTATION.md](LECTURE_HALL_PREVIEW_IMPLEMENTATION.md) for details

2. **Preview Latency:**
   - 1 minute initial delay
   - 5 minute refresh interval
   - Intentional to reduce server load

3. **Cinema/Video Watch:**
   - Still uses old player-based detection
   - Should be migrated to state-based detection (future enhancement)

---

## Success Criteria

✅ Upload videos show GIF previews  
✅ LiveShare/WatchFrom show emoji with correct labels  
✅ No media shows 🎓 emoji  
✅ Stopping screen share restores previous preview  
✅ Preview refreshes every 5 minutes  
✅ State persists across reconnections  
✅ No console errors  
✅ Backend migration applied successfully  

---

## Rollback Plan (If Needed)

```sql
-- Rollback migration
ALTER TABLE watch_sessions
DROP COLUMN current_media_url,
DROP COLUMN current_media_type,
DROP COLUMN is_screen_sharing_active,
DROP COLUMN sharing_source;
```

Then revert commits:
- `PositionCalculatorPage.jsx`
- `LobbyPage.jsx`
- `SessionPreview.jsx`
- `websocket.go`
- `watch_session.go`
