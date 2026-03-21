# Session Preview Testing Guide

## Quick Start Testing

### 1. Start the Application
```bash
# Terminal 1 - Backend
cd backend
go run cmd/server/main.go

# Terminal 2 - Frontend  
cd frontend
npm run dev
```

### 2. Create a Test Session
1. Navigate to Lobby page
2. Create a new room or use existing room
3. Upload a video file (MP4 recommended)
4. Start a watch session
5. Return to Lobby page

### 3. Verify Preview Generation

**Expected Behavior Timeline:**

**T+0 seconds (Immediate):**
- Session card appears in "Watching Now" tab
- SessionPreview shows **emoji state**:
  - 🎭 for 3D Cinema
  - 🎬 for other types
  - Gradient purple/pink background
  - Label: "Cinema Experience" or "Watch Session"

**T+60 seconds (1 minute):**
- SessionPreview transitions to **loading state**
- Shows spinner with "Generating preview..." text
- Backend receives POST request to `/api/sessions/{id}/generate-preview`
- Console logs: `[GenerateSessionPreview] Starting generation...`

**T+65-75 seconds:**
- Backend extracts poster frame at 5 seconds
- Backend generates 30-second GIF (5fps, 320px width)
- Preview files created in `backend/uploads/previews/`
- Files: 
  - `session_{id}_poster.jpg`
  - `session_{id}_preview_{timestamp}.gif`

**T+75+ seconds:**
- SessionPreview transitions to **poster state**
- Shows static poster image
- Overlay: "Generating GIF preview..."
- Frontend receives poster_url in API response

**T+90-120 seconds:**
- SessionPreview transitions to **GIF state**
- Animated 30-second preview loops
- Shows current playback from video
- No overlay text

**T+5 minutes:**
- Automatic regeneration triggered
- Same process repeats (loading → poster → GIF)
- New GIF file created with updated timestamp
- Preview shows current playback position

**T+10 minutes, T+15 minutes, etc:**
- Preview regenerates every 5 minutes
- Always shows recent playback state

## Detailed Test Cases

### Test Case 1: Single Session Preview
**Steps:**
1. Create room, upload video, start session
2. Navigate to Lobby → "Watching Now" tab
3. Wait and observe state changes

**Expected Results:**
- ✅ Emoji appears immediately
- ✅ Loading spinner at 1 minute
- ✅ Poster image appears (~1-2 min)
- ✅ GIF animates (~1.5-2.5 min)
- ✅ GIF refreshes at 6 minutes

**Check Backend Logs:**
```
🎬 [GenerateSessionPreview] Starting generation for session_123
📸 [GenerateSessionPreview] Poster created: /uploads/session_123_poster.jpg
🎥 [GenerateSessionPreview] GIF created: /uploads/previews/session_123_preview_1234567890.gif
✅ [GenerateSessionPreview] Preview generated successfully
```

**Check Frontend Console:**
```
SessionPreview: isGenerating=true, entering loading state
SessionPreview: posterUrl received, entering poster state  
SessionPreview: previewUrl received, entering gif state
```

### Test Case 2: Multiple Concurrent Sessions
**Steps:**
1. Create 3 different rooms
2. Start sessions in all 3 rooms
3. Navigate to Lobby → "Watching Now"
4. Observe all 3 sessions

**Expected Results:**
- ✅ All 3 show emojis immediately
- ✅ All 3 generate previews at ~1 min mark
- ✅ Each session has unique preview GIF
- ✅ All refresh independently every 5 min
- ✅ No crosstalk between sessions

**Verify Files:**
```bash
ls -la backend/uploads/previews/
# Should see:
# session_abc_preview_1234567890.gif
# session_def_preview_1234567891.gif  
# session_ghi_preview_1234567892.gif
```

### Test Case 3: Session End Cleanup
**Steps:**
1. Start a session with video
2. Wait for GIF to generate
3. Verify files exist: `ls backend/uploads/previews/`
4. End the session (host leaves)
5. Check files again

**Expected Results:**
- ✅ Before end: Files exist in previews folder
- ✅ After end: Files deleted automatically
- ✅ Backend logs: `🗑️ [CleanupSessionPreviews] Deleted: session_123_preview_*.gif`
- ✅ Frontend: Session removed from "Watching Now"

**Cleanup Verification:**
```bash
# Before ending session
ls backend/uploads/previews/ | grep session_abc
# Output: session_abc_preview_1234567890.gif

# End the session from UI

# After ending session  
ls backend/uploads/previews/ | grep session_abc
# Output: (empty - no files)
```

### Test Case 4: Auto-Timeout Cleanup
**Steps:**
1. Start session as host
2. Wait for preview to generate
3. Disconnect host (close tab/browser)
4. Wait 60+ minutes (or reduce timeout in code for testing)
5. Check preview files

**Expected Results:**
- ✅ Session auto-ends after timeout
- ✅ Preview files cleaned up automatically
- ✅ Backend logs: `🤖 AutoEndSession called for session_123`
- ✅ Backend logs: `✅ Deleted: session_123_preview_*.gif`

### Test Case 5: Fallback States
**Steps:**
1. Start session
2. Before 1 minute: Disconnect network
3. Reconnect after 2 minutes
4. Observe SessionPreview behavior

**Expected Results:**
- ✅ Emoji state persists during network disconnect
- ✅ On reconnect: Attempts to load poster
- ✅ If poster fails: Stays in emoji state
- ✅ Console logs: `SessionPreview: Image load error, falling back to emoji`

### Test Case 6: Play Icon Navigation
**Steps:**
1. Go to Lobby → "Rooms" tab
2. Find room card with active session (green pulse icon)
3. Click the animated play icon

**Expected Results:**
- ✅ Tab switches to "Watching Now"
- ✅ Session card visible with preview
- ✅ No page reload

### Test Case 7: Lobby Navigation Cleanup
**Steps:**
1. Start 2 sessions
2. Go to Lobby → "Watching Now"
3. Wait for previews to start generating
4. Navigate away from lobby (go to a room)
5. Check browser dev tools → Console

**Expected Results:**
- ✅ No memory leaks
- ✅ Intervals/timeouts cleared
- ✅ Console logs: `useEffect cleanup: clearing intervals for session_*`
- ✅ No API calls after leaving lobby

### Test Case 8: Different Video Formats
**Test with:**
- MP4 (H.264)
- WebM
- MKV
- AVI
- MOV

**Expected Results:**
- ✅ All formats generate posters
- ✅ All formats generate GIFs
- ✅ Fallback to poster if GIF generation fails
- ✅ Error logged but UI stays functional

## Browser DevTools Checks

### Network Tab
**At T+1 minute:**
```
POST /api/sessions/abc123/generate-preview
Request: { source: "upload", current_time: "5" }
Response: { poster_url: "...", preview_url: "...", session_id: "abc123" }
Status: 200 OK
```

**At T+6 minutes, T+11 minutes (every 5 min):**
```
POST /api/sessions/abc123/generate-preview
(Same request, new preview_url with updated timestamp)
```

### Console Tab
**Expected Logs:**
```javascript
// State transitions
SessionPreview: loadState changed to 'loading'
SessionPreview: loadState changed to 'poster'  
SessionPreview: loadState changed to 'gif'

// API calls
generateSessionPreview: Starting for session_abc123
generateSessionPreview: Preview generated, posterUrl=/uploads/session_abc123_poster.jpg

// Cleanup
useEffect cleanup: Clearing timeout for session_abc123
useEffect cleanup: Clearing interval for session_abc123
```

**No Errors:**
```javascript
// These should NOT appear:
❌ SessionPreview: Image load error
❌ generateSessionPreview: Error calling API
❌ Uncaught TypeError...
```

## Backend Verification

### Check Preview Files
```bash
# List all preview files
ls -lh backend/uploads/previews/

# Expected output:
# session_abc123_preview_1234567890.gif  (500KB - 2MB)
# session_def456_preview_1234567891.gif
```

### Check File Sizes
```bash
# GIF should be reasonable size
du -h backend/uploads/previews/session_*.gif

# Typical sizes:
# 500KB - 1MB: Good compression, simple video
# 1MB - 2MB: Normal for complex scenes
# >5MB: Possible issue, check FFmpeg settings
```

### Backend Logs
**Successful Generation:**
```
🎬 [GenerateSessionPreview] Starting generation for session_abc123
📁 [GenerateSessionPreview] Media file: /uploads/movie.mp4
📸 [GenerateSessionPreview] Generating poster at 5 seconds...
✅ [GenerateSessionPreview] Poster created: /uploads/session_abc123_poster.jpg
🎥 [GenerateSessionPreview] Generating GIF preview (30s, 5fps)...
✅ [GenerateSessionPreview] GIF created: /uploads/previews/session_abc123_preview_1234567890.gif
✅ [GenerateSessionPreview] Preview generated successfully
```

**Cleanup on End:**
```
🔴 [EndWatchSessionHandler] Session abc123 ended by host
🗑️ [CleanupSessionPreviews] Pattern: session_abc123_*
🗑️ [CleanupSessionPreviews] Found 2 files to delete
✅ [CleanupSessionPreviews] Deleted: session_abc123_preview_1234567890.gif
✅ [CleanupSessionPreviews] Deleted: session_abc123_poster.jpg
```

## Performance Testing

### Load Test: 10 Concurrent Sessions
**Setup:**
```bash
# Create 10 rooms, start 10 sessions
# Monitor server resources
htop  # Watch CPU/Memory
```

**Expected:**
- ✅ CPU spike during FFmpeg generation (normal)
- ✅ Memory stays stable (~100-200MB per session during generation)
- ✅ All previews generate within 2-3 minutes
- ✅ Server remains responsive

**Red Flags:**
- ❌ CPU stays at 100% for >5 minutes
- ❌ Memory continuously increases
- ❌ API requests timeout
- ❌ GIF generation fails

### Storage Test: Preview Accumulation
**Setup:**
```bash
# Start 10 sessions
# Let them run for 30 minutes (6 refreshes each)
# Check disk usage
du -sh backend/uploads/previews/
```

**Expected:**
- ✅ Each session: ~1-2MB per preview GIF
- ✅ Old previews NOT deleted until session ends (by design)
- ✅ 10 sessions × 7 GIFs (1 initial + 6 refreshes) = ~70-140MB
- ✅ After ending all: Folder size drops to 0

## Troubleshooting

### Issue: Preview Not Generating
**Symptoms:**
- Emoji shows, but never transitions to loading
- 1 minute passes, no API call

**Check:**
1. Open browser console: Look for `setupPreviewGeneration` call
2. Check network tab: Is POST request being sent?
3. Verify session exists in `filteredSessions` array
4. Check `sessionPreviews` state in React DevTools

**Fix:**
- Ensure `useEffect` dependency array includes `sessions`
- Verify session has `session_id` field

### Issue: GIF Not Displaying
**Symptoms:**
- Poster loads, but GIF never appears
- Stays in "Generating GIF preview..." state

**Check:**
1. Backend logs: Was GIF actually created?
2. Check file exists: `ls backend/uploads/previews/session_*_preview_*.gif`
3. Check file size: Should be >100KB
4. Check browser console: Any image load errors?
5. Network tab: Is GIF URL returning 200 OK?

**Fix:**
- Verify FFmpeg command succeeded
- Check file permissions: `chmod 644 backend/uploads/previews/*.gif`
- Test GIF URL directly in browser

### Issue: Preview Not Cleaning Up
**Symptoms:**
- Session ended, but GIF files still exist
- Preview files accumulate over time

**Check:**
1. Backend logs: `CleanupSessionPreviews` called?
2. Verify cleanup code in `EndWatchSessionHandler` and `AutoEndSession`
3. Check file glob pattern: `session_{id}_*`

**Fix:**
- Ensure cleanup called AFTER transaction commit
- Verify session_id format matches file naming
- Check file permissions (deletion requires write access)

### Issue: Memory Leak on Frontend
**Symptoms:**
- Browser tab memory grows over time
- Browser becomes slow after multiple sessions

**Check:**
1. React DevTools → Profiler: Are components unmounting?
2. Console logs: Are intervals being cleared?
3. `previewIntervalsRef.current`: Should be empty after leaving lobby

**Fix:**
- Verify `useEffect` cleanup function runs
- Check `clearTimeout` and `clearInterval` calls
- Use React DevTools to inspect component lifecycle

## Success Criteria

✅ **Core Functionality:**
- [ ] Emoji displays immediately for new sessions
- [ ] Preview generates at 1-minute mark
- [ ] GIF animates and loops correctly
- [ ] Refreshes every 5 minutes
- [ ] Cleanup removes files on session end

✅ **UI/UX:**
- [ ] State transitions are smooth (no flashing)
- [ ] Loading spinner shows progress feedback
- [ ] Fallbacks work (emoji → poster → GIF)
- [ ] Play icon navigates to "Watching Now"
- [ ] Session cards have consistent height

✅ **Performance:**
- [ ] No memory leaks on frontend
- [ ] Backend CPU returns to idle after generation
- [ ] Multiple sessions don't block each other
- [ ] Storage cleanup prevents disk fill

✅ **Robustness:**
- [ ] Network errors don't crash UI
- [ ] Invalid video formats fallback gracefully
- [ ] Missing files don't break session cards
- [ ] Concurrent generations don't interfere

## Automated Test Commands

```bash
# Backend unit test (when implemented)
cd backend
go test ./internal/handlers -v -run TestGeneratePreviewGIF
go test ./internal/handlers -v -run TestCleanupSessionPreviews

# Frontend component test (when implemented)
cd frontend  
npm test SessionPreview.test.jsx
npm test LobbyPage.test.jsx

# Integration test (when implemented)
npm run test:e2e -- session-preview.spec.js
```

## Manual Checklist

Before deploying to production:

- [ ] Test with MP4, WebM, MKV video formats
- [ ] Test with 1, 5, 10 concurrent sessions
- [ ] Test cleanup on manual session end
- [ ] Test cleanup on auto-timeout (60+ min)
- [ ] Test fallback states (network errors)
- [ ] Test lobby navigation (verify cleanup)
- [ ] Test play icon navigation
- [ ] Monitor CPU/memory during generation
- [ ] Verify disk space doesn't fill up
- [ ] Check browser console for errors
- [ ] Test on Chrome, Firefox, Safari
- [ ] Test on mobile devices

## Notes

- **FFmpeg Dependency**: Ensure `ffmpeg` is installed and in PATH
- **Timing**: 1-minute delay allows video to start before capture
- **Quality**: 5fps/320px balances file size and preview quality
- **Storage**: Preview GIFs deleted on session end (not persisted)
- **Refresh**: 5-minute interval keeps previews current without overloading server
- **Fallback**: Progressive enhancement ensures something always displays

## Support

If tests fail or issues arise, check:
1. [SESSION_PREVIEW_IMPLEMENTATION.md](./SESSION_PREVIEW_IMPLEMENTATION.md) for implementation details
2. Backend logs for FFmpeg errors
3. Frontend console for API/state errors
4. Browser DevTools Network tab for failed requests
