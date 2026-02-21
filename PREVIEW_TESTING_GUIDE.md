# Preview Generation - Quick Test Guide

## Prerequisites
1. Backend server running (with updated websocket.go handlers)
2. Frontend running
3. Two browser windows:
   - **Window 1**: Host (create session and play media)
   - **Window 2**: Lobby watcher (stay on lobby "Watching Now" tab)

## Test 1: Uploaded Media Preview
**Expected**: Animated GIF preview appears in lobby when host plays video

### Steps:
1. **Window 1** (Host):
   - Create new watch session
   - Upload a video file
   - Click play on the uploaded video

2. **Window 2** (Lobby Watcher):
   - Stay on lobby home page
   - Click "Watching Now" tab
   - **Expected**: Session appears with animated GIF preview
   - **Expected**: Preview shows first 3 seconds of video looping

### Backend Logs to Watch:
```
[playback_control] 🎮 Command=play, MediaID=115, FilePath=/path/to/video.mp4
[playback_control] 🎬 Triggering preview for session=abc123, media=115, temp=false
[MediaSwitch] Handling media_play for session abc123
[PreviewQueue] Queued preview generation for session abc123
[playback_control] 📢 Broadcasted media_state_changed to lobby for session abc123
[PreviewQueue] Generated preview GIF for session abc123
[PreviewQueue] Broadcasted session_preview_updated to lobby
```

### Frontend Console Logs:
```
📡 [Lobby] Received media_state_changed for session abc123
🔄 [Lobby] Fetching updated session list
📡 [Lobby] Received session_preview_updated
✅ [Lobby] Preview URL updated: /uploads/previews/abc123_preview.gif
```

## Test 2: Preview Refresh (5-minute timer)
**Expected**: Preview regenerates with current playback position every 5 minutes

### Steps:
1. **Window 1**: Keep video playing past 5 minutes
2. **Window 2**: Watch preview - should update to show current position

### Backend Logs:
```
[PreviewQueue] 🔄 5-minute timer triggered for session abc123
[PreviewQueue] Regenerating preview from timestamp 300 seconds
[PreviewQueue] Broadcasted session_preview_updated
```

## Test 3: Media Switching
**Expected**: Old preview clears, new preview generates when switching media

### Steps:
1. **Window 1**: Play first video (wait for preview to appear in lobby)
2. **Window 1**: Stop first video, play different video
3. **Window 2**: Preview should update to show new video

### Backend Logs:
```
[MediaSwitch] 🔄 Type change detected: upload → upload (different media ID)
[MediaSwitch] 🧹 Clearing old upload preview for session abc123
[MediaSwitch] Handling media_play for session abc123 (new media)
[PreviewQueue] Queued preview generation
```

## Test 4: Pause Behavior
**Expected**: Preview stays visible when host pauses

### Steps:
1. **Window 1**: Play video (preview appears)
2. **Window 1**: Pause video
3. **Window 2**: Preview should remain visible (not clear)

### Note:
- Pause does NOT send `media_stop` message
- Preview stays visible but refresh timer pauses
- When resumed, timer continues

## Test 5: Stop/Clear Behavior
**Expected**: Preview clears when media stops completely

### Steps:
1. **Window 1**: Play video (preview appears)
2. **Window 1**: Stop video (back to media list)
3. **Window 2**: Session should disappear from "Watching Now" or show as "No media playing"

### Backend Logs:
```
[media_stop] ⏹️ Media stop event: session=abc123
[MediaSwitch] Handling media_stop for session abc123
[MediaSwitch] 🧹 Session abc123 media stopped, preview cleared
[media_stop] 📢 Broadcasted media_state_changed to lobby
```

## Test 6: LiveShare Screen Sharing (if implemented)
**Expected**: Frame capture preview appears when screen sharing starts

### Steps:
1. **Window 1**: Start screen sharing (LiveShare or WatchFrom)
2. **Window 2**: Preview should show live frames from screen share

### Backend Logs:
```
[screen_share_started] 📺 Screen sharing started: session=abc123, source=liveshare
[MediaSwitch] Handling media_state_changed (source: liveshare, active: true)
[screen_share_started] 📢 Broadcasted media_state_changed to lobby
[FrameCapture] Requesting frames from host
```

## Test 7: Multiple Concurrent Sessions
**Expected**: Each session shows correct preview independently

### Steps:
1. **Window 1**: Create session A, play video X
2. **Window 3**: Create session B, play video Y
3. **Window 2** (Lobby): Should see both sessions with different previews

### Check:
- Session A preview shows video X
- Session B preview shows video Y
- No mix-up between sessions

## Quick Verification Commands

### Check session state in database:
```sql
SELECT session_id, current_media_url, current_media_type, 
       is_screen_sharing_active, sharing_source, preview_url
FROM watch_sessions
WHERE is_active = true;
```

### Check media preview cache:
```sql
SELECT id, original_name, preview_url, poster_url
FROM media_items
ORDER BY created_at DESC
LIMIT 10;
```

### Check preview queue status:
```bash
# Backend logs should show:
grep "PreviewQueue" backend.log | tail -20
```

## Troubleshooting

### Issue: Preview not appearing
**Check**:
1. Backend logs for `[playback_control] 🎮 Command=play`
2. Backend logs for `[PreviewQueue] Queued preview generation`
3. Frontend console for `media_state_changed` event
4. Network tab for `/api/sessions` response (should include preview_url)

### Issue: Preview not updating
**Check**:
1. 5-minute timer logs: `grep "5-minute timer" backend.log`
2. Frontend WebSocket connection status
3. LobbyPage useEffect dependencies

### Issue: Preview shows wrong video
**Check**:
1. Session state: `current_media_id` matches expected media
2. Media switch logs: Type change detection
3. Preview URL: Should be unique per session

## Success Criteria
✅ Preview appears within 5-10 seconds of playing media
✅ Preview loops smoothly (GIF animation)
✅ Preview shows first 3 seconds of video
✅ Preview updates every 5 minutes during playback
✅ Preview clears when media stops
✅ New preview generates when switching media
✅ Multiple sessions work independently
✅ No console errors or backend panics
