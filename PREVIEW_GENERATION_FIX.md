# Preview Generation Fix - Implementation Complete ✅

## Problem Summary
Preview generation system was not working in the "Watching Now" tab of the lobby when host played media. Backend logs showed:
- ✅ Media upload successful
- ✅ `playback_control` message received
- ❌ Session state (URL/type) NOT updated
- ❌ No `media_state_changed` broadcast to lobby
- ❌ No preview generation triggered

## Root Cause
The `playback_control` WebSocket message (sent by `VideoWatch.jsx` when host plays media) was only being broadcast to room participants. It was **not** triggering the preview generation system because:

1. No handler extracted media info from `playback_control`
2. No call to `mediaSwitchHandler.HandleMediaPlay()`
3. No `media_state_changed` broadcast to lobby (roomID=0)
4. No preview queue request

The preview infrastructure was **100% complete** but missing the WebSocket trigger mechanism.

## Solution Implemented
Added three new WebSocket message handlers in `backend/internal/handlers/websocket.go`:

### 1. `playback_control` Handler (Lines 4544-4598)
**Trigger**: When host plays uploaded media via VideoWatch component

**Actions**:
- Extracts media details (media_item_id, file_path, file_url)
- Determines if temporary or permanent media
- Calls `mediaSwitchHandler.HandleMediaPlay()` which:
  - Updates `watch_sessions` table (current_media_url, current_media_type)
  - Checks for cached preview (uses if available)
  - Queues preview generation via `preview_queue.QueuePreview()`
  - Starts 5-minute refresh timer
- **Broadcasts `media_state_changed` to lobby** (roomID=0)
- Broadcasts original message to room participants (for playback sync)

### 2. `screen_share_started` Handler (Lines 4600-4637)
**Trigger**: When LiveShare or WatchFrom screen sharing begins

**Actions**:
- Extracts session_id and sharing_source ("liveshare" or "watchfrom")
- Calls `mediaSwitchHandler.HandleMediaStateChanged()` which:
  - Updates `watch_sessions` table (is_screen_sharing_active=true)
  - Clears old upload previews
  - Stops refresh timer (WebRTC uses frame capture)
- **Broadcasts `media_state_changed` to lobby**
- Broadcasts original message to room participants

### 3. `screen_share_stopped` Handler (Lines 4639-4676)
**Trigger**: When screen sharing ends

**Actions**:
- Calls `mediaSwitchHandler.HandleMediaStateChanged()` with isActive=false
  - This internally calls `HandleMediaStop()` to clear preview
  - Updates `watch_sessions` table (is_screen_sharing_active=false)
- **Broadcasts `media_state_changed` to lobby**
- Broadcasts original message to room participants

### 4. `media_stop` Handler (Enhanced at Lines 4524-4542)
**Trigger**: When media playback stops

**Actions**:
- Calls `mediaSwitchHandler.HandleMediaStop()` to clear preview
- **Added lobby broadcast** for media_state_changed (was missing before)

## How Preview Generation Works Now

### Flow for Uploaded Media (Upload type):
```
1. Host clicks play in VideoWatch.jsx
   ↓
2. VideoWatch sends `playback_control` message
   ↓
3. Backend receives playback_control
   ↓
4. Handler extracts media_item_id, file_path
   ↓
5. Calls mediaSwitchHandler.HandleMediaPlay()
   ↓
6. Updates watch_sessions table with media URL/type
   ↓
7. Checks media_items.preview_url for cached preview
   ↓
8. If cached: broadcasts session_preview_updated to lobby immediately
   If not cached: queues preview_queue.QueuePreview()
   ↓
9. Preview queue generates GIF from video file (ffmpeg)
   ↓
10. Broadcasts session_preview_updated to lobby
    ↓
11. Starts 5-minute refresh timer
```

### Flow for LiveShare/WatchFrom (Screen Sharing):
```
1. User starts screen sharing
   ↓
2. Frontend sends `screen_share_started` message
   ↓
3. Backend receives screen_share_started
   ↓
4. Handler calls mediaSwitchHandler.HandleMediaStateChanged()
   ↓
5. Updates watch_sessions table (is_screen_sharing_active=true)
   ↓
6. Broadcasts media_state_changed to lobby
   ↓
7. Frontend calls /api/sessions/:id/request-frame-capture
   ↓
8. Backend sends capture_preview_frames to host
   ↓
9. Host captures frames and uploads via /upload-frames
   ↓
10. Backend saves frames, broadcasts session_preview_updated to lobby
```

## Lobby Integration
**LobbyPage.jsx** (frontend) listens for two WebSocket events:

1. **`media_state_changed`** (line 687-690):
   - Triggers `fetchSessionsData()` to refresh session list
   - Shows session in "Watching Now" tab

2. **`session_preview_updated`** (line 691-701):
   - Updates `sessionPreviews` state with new preview URL
   - Renders animated GIF preview in session card

## Preview Behaviors (All Implemented)

| Event | Session State | Preview Action | Lobby Notification |
|-------|--------------|----------------|-------------------|
| Upload media plays | current_media_type='upload' | Generate GIF, start 5-min timer | ✅ media_state_changed |
| Upload media pauses | (no change) | Keep preview | No broadcast |
| Upload media switches | Update media_id/path | Clear old, generate new | ✅ media_state_changed |
| Screen share starts | is_screen_sharing_active=true | Request frame capture | ✅ media_state_changed |
| Screen share stops | is_screen_sharing_active=false | Clear preview | ✅ media_state_changed |
| Session ends | (row deleted) | Cleanup all assets | (implicit via session list) |

## Testing Checklist
- [x] Backend handlers added without syntax errors
- [ ] Host plays uploaded media → preview appears in lobby "Watching Now"
- [ ] Preview refreshes every 5 minutes during playback
- [ ] Host switches media → new preview generated
- [ ] Host pauses media → preview stays visible
- [ ] Host stops media → preview clears
- [ ] LiveShare starts → frame capture preview appears
- [ ] LiveShare stops → preview clears
- [ ] WatchFrom starts → frame capture preview appears
- [ ] Multiple concurrent sessions each show correct preview

## Files Modified
1. **backend/internal/handlers/websocket.go**
   - Added `playback_control` handler (lines 4544-4598)
   - Added `screen_share_started` handler (lines 4600-4637)
   - Added `screen_share_stopped` handler (lines 4639-4676)
   - Enhanced `media_stop` handler with lobby broadcast (lines 4524-4542)

## Dependencies (Already Exist)
- ✅ `backend/internal/services/media_switch_handler.go` - Media type transition logic
- ✅ `backend/internal/services/preview_queue.go` - Async preview generation worker
- ✅ `backend/internal/handlers/session_preview.go` - Preview API endpoints
- ✅ `frontend/src/components/LobbyPage.jsx` - WebSocket event listeners

## Next Steps
1. Restart backend server to load new WebSocket handlers
2. Test preview generation with uploaded video
3. Test LiveShare screen sharing preview
4. Verify 5-minute refresh timer works
5. Test media switching (old preview clears, new generates)
6. Test multiple concurrent sessions

## Notes
- Preview generation is **async** (doesn't block playback)
- Cached previews (from media_items.preview_url) are used immediately
- 5-minute refresh captures current playback position
- Screen share previews use separate frame capture system (not ffmpeg)
- Lobby receives `media_state_changed` for ALL media events
- Session participants receive `playback_control` for playback sync
