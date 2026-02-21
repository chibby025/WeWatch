# Quick Test Guide - LiveShare/WatchFrom Frame Capture

## Quick Start (5 minutes)

### Setup
1. Terminal 1: `cd backend && go run cmd/server/main.go`
2. Terminal 2: `cd frontend && npm start`
3. Create 2 browser windows (Host + Viewer)

---

## Test 1: LiveShare Screen Share (2 minutes)

**Host Window**:
1. Login → Create lecture hall room → Start session
2. Click sidebar (left edge) → LiveShare tab
3. Click "Share Screen" → Select window → Share
4. **Wait 30 seconds** (frame capture happens automatically)

**Viewer Window**:
1. Login → Go to Lobby page (`/`)
2. **Wait 1 minute** after session starts
3. Look for lecture hall session card
4. **Expected**: Loading spinner → GIF preview appears

**Success**: GIF shows 6 frames from screen share

---

## Test 2: LiveShare Camera Only (2 minutes)

**Host Window**:
1. Same session, LiveShare tab
2. Click "Share Camera" → Allow permission
3. **Wait 30 seconds**

**Viewer Window**:
1. Already on Lobby page
2. Preview updates automatically
3. **Expected**: GIF shows 6 frames from camera

---

## Test 3: WatchFrom (YouTube) (2 minutes)

**Host Window**:
1. Same session, WatchFrom tab
2. Enter: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
3. Click "Start Watching"
4. **Wait 30 seconds**

**Viewer Window**:
1. Lobby page refreshes preview
2. **Expected**: GIF shows 6 frames from YouTube video

---

## Debugging

### Backend Logs (Terminal 1)
Look for these messages:

✅ **Success**:
```
📸 [RequestFrameCapture] Request received for session: abc-123
📡 [RequestFrameCapture] Sending capture request to room 5 (source: liveshare)
📥 [UploadSessionFrames] Received 6 frames for session abc-123
💾 [UploadSessionFrames] Saved 6 frames to /uploads/temp/frames/abc-123
🎬 [UploadSessionFrames] Generating GIF from pattern: ...
✅ [UploadSessionFrames] Preview generated: /uploads/previews/session_abc-123_preview_123.gif
📡 [UploadSessionFrames] Broadcasted preview update to lobby
```

❌ **Errors**:
```
❌ [RequestFrameCapture] Session not found: abc-123
❌ [UploadSessionFrames] GIF generation failed: ...
```

---

### Frontend Console (Browser F12)

**Host Window** (PositionCalculatorPage):
```
📸 [PositionCalculator] Received request to capture frames for preview
📸 [Frame Capture] Starting frame capture for preview
🎥 [Frame Capture] Using blackboard video element
🖼️ [Frame Capture] Canvas size: 320 x 180
📷 [Frame Capture] Captured frame 1/6
📷 [Frame Capture] Captured frame 2/6
...
📷 [Frame Capture] Captured frame 6/6
✅ [Frame Capture] Captured 6 frames, uploading...
✅ [Frame Capture] Frames uploaded successfully: { preview_url: "...", ... }
```

**Viewer Window** (LobbyPage):
```
🎬 [LobbyPage] Generating preview for session: abc-123
🔍 [LobbyPage] Session media state: { ... current_media_type: "liveshare", ... }
📸 [LobbyPage] Requesting frame capture for abc-123 (source: liveshare)
✅ [LobbyPage] Frame capture requested for abc-123
🖼️ [LobbyPage] Session preview updated: { session_id: "abc-123", preview_url: "..." }
```

---

## Common Issues

### Issue 1: Preview shows emoji only
**Symptom**: Emoji (💻 or 📺) instead of GIF

**Causes**:
1. Frame capture not triggered (check backend logs)
2. Host disconnected before capture completed
3. No video element found (blackboard media not active)

**Fix**: Wait 5 minutes for retry, or restart LiveShare

---

### Issue 2: "No video element found to capture from"
**Symptom**: Console error in host window

**Causes**:
1. `boardVideoRef.current` is null
2. Media hasn't fully loaded yet
3. Wrong video element target

**Fix**: Ensure media is playing on blackboard before capture request

---

### Issue 3: GIF generation failed
**Symptom**: Backend error during ffmpeg

**Causes**:
1. ffmpeg not installed: `sudo apt install ffmpeg`
2. Invalid frame files
3. Disk space full

**Fix**: Check backend logs for ffmpeg error details

---

## Verification Checklist

After testing, verify:

- [ ] LiveShare screen share → GIF preview
- [ ] LiveShare camera only → GIF preview
- [ ] WatchFrom (YouTube) → GIF preview
- [ ] Preview updates after 5 minutes
- [ ] Multiple sessions show different previews
- [ ] Preview files cleaned up after session ends
- [ ] No memory leaks (check Task Manager)
- [ ] Backend CPU < 10% during idle
- [ ] Frontend CPU < 5% during idle

---

## Performance Metrics

**Expected Timings**:
- Frame capture: 30 seconds
- Frame upload: 1-2 seconds
- GIF generation: 2-5 seconds
- Total: ~35-40 seconds from trigger to display

**File Sizes**:
- Single frame (JPEG): ~15-30 KB
- All frames (6 total): ~100-200 KB
- Final GIF: ~200-500 KB

---

## Quick Cleanup

If testing leaves orphaned files:

```bash
# Remove all preview files
rm -rf backend/uploads/previews/*

# Remove temp frame folders
rm -rf backend/uploads/temp/frames/*
```

---

## Next Steps After Testing

1. **If successful**: Mark tests as passed in JIRA/GitHub
2. **If issues found**: Document in GitHub Issues with:
   - Console logs (both windows)
   - Backend logs
   - Screenshot of preview card
   - Steps to reproduce

3. **Deploy to staging**: Merge PR and deploy
4. **Monitor production**: Check logs for errors after deployment

---

## Emergency Rollback

If production issues occur:

1. Revert commits:
   - `git revert HEAD~3` (last 3 commits)
2. Redeploy backend + frontend
3. Preview system falls back to emoji display
4. No data loss (database unchanged)

---

## Support

**Internal Testing**: Tag `@dev-team` in Slack  
**Production Issues**: Create P1 incident ticket  
**Questions**: Check [LECTURE_HALL_FRAME_CAPTURE_IMPLEMENTATION.md](LECTURE_HALL_FRAME_CAPTURE_IMPLEMENTATION.md)
