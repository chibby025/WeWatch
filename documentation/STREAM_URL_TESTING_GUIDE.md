# Stream URL Feature - Testing Guide

## Overview
The Stream URL feature allows users to add videos from cloud storage (Google Drive, Dropbox, OneDrive) or direct video URLs to their cinema playlist without uploading files.

## Implementation Status
✅ **Frontend**: Complete (LeftSidebar.jsx)
✅ **Backend Handler**: Complete (media_stream.go)
✅ **URL Utilities**: Complete (stream_urls.go)
✅ **Database Model**: Complete (TemporaryMediaItem with IsStream + OriginalStreamURL fields)
✅ **Migration**: Applied (20260127_add_stream_url_fields.sql)
✅ **Route**: Registered (POST /api/rooms/:id/media/stream)
✅ **Compilation**: Successful (46MB binary)

---

## Testing Checklist

### 1. Google Drive Public Links
**Test Case 1a: Standard share link**
```
URL: https://drive.google.com/file/d/1ABC123XYZ/view?usp=sharing
Expected: Converts to https://drive.google.com/uc?export=download&id=1ABC123XYZ
Result: Should add to playlist and stream successfully
```

**Test Case 1b: Already converted link**
```
URL: https://drive.google.com/uc?export=download&id=1ABC123XYZ
Expected: Uses as-is (already in direct format)
Result: Should add to playlist
```

**How to test:**
1. Open cinema room
2. Click "🔗 URL" button in left sidebar
3. Paste Google Drive public video link
4. Click "Add to Playlist"
5. Verify video appears in playlist
6. Verify video plays when selected
7. Check Network tab → Should stream from drive.google.com

---

### 2. Dropbox Public Links
**Test Case 2a: Share link with dl=0**
```
URL: https://www.dropbox.com/s/abc123/video.mp4?dl=0
Expected: Converts to https://www.dropbox.com/s/abc123/video.mp4?dl=1
Result: Forces direct download, should stream
```

**Test Case 2b: Share link without dl parameter**
```
URL: https://www.dropbox.com/s/abc123/video.mp4
Expected: Adds ?dl=1 parameter
Result: Should stream directly
```

**How to test:**
1. Open cinema room
2. Click "🔗 URL" button
3. Paste Dropbox public video link
4. Click "Add to Playlist"
5. Verify video appears in playlist
6. Verify video plays
7. Check Network tab → Should stream from dropbox.com with dl=1

---

### 3. Direct Video URLs
**Test Case 3a: Direct mp4 link**
```
URL: https://example.com/video.mp4
Expected: Uses as-is (direct video file)
Result: Should stream directly
```

**Test Case 3b: HLS stream**
```
URL: https://example.com/stream.m3u8
Expected: Uses as-is (HLS manifest)
Result: Should work with HLS-compatible players
```

**Supported formats:** .mp4, .webm, .ogg, .mov, .m3u8, .avi, .mkv, .flv, .wmv, .m4v

**How to test:**
1. Find a direct video URL (e.g., from a CDN or public video hosting)
2. Open cinema room
3. Click "🔗 URL" button
4. Paste direct video URL
5. Click "Add to Playlist"
6. Verify video plays

---

### 4. Error Handling

**Test Case 4a: Invalid URL format**
```
URL: not-a-url
Expected: Error "Invalid URL format. Must be http or https."
Result: Red error message, no API call
```

**Test Case 4b: Non-video URL**
```
URL: https://example.com/document.pdf
Expected: Error "URL must point to a video file (mp4, webm, m3u8, etc.)"
Result: API returns 400 error, red error message shown
```

**Test Case 4c: Private/404 URL**
```
URL: https://example.com/private-video.mp4 (inaccessible)
Expected: Error "Unable to access the video URL. Please ensure it's a public link."
Result: API returns 403 error, fallback prompt shows after 2 seconds
```

**Test Case 4d: Missing room ID**
```
Action: API call without room ID parameter
Expected: Error "Room ID is required"
Result: 400 error
```

**How to test:**
1. Try each invalid URL type listed above
2. Verify frontend shows appropriate error messages
3. For private/404 URLs, verify fallback prompt appears: "It seems the URL couldn't be accessed. Would you like to upload the file instead?"

---

### 5. Database Verification

**After adding a stream URL, verify database record:**
```sql
SELECT id, file_name, original_name, file_path, is_stream, original_stream_url, room_id, uploader_id 
FROM temporary_media_items 
WHERE is_stream = true 
ORDER BY created_at DESC 
LIMIT 5;
```

**Expected columns:**
- `is_stream` = `true`
- `original_stream_url` = Original URL pasted by user
- `file_path` = Converted direct stream URL
- `file_size` = 0 (unknown for streams)
- `mime_type` = "video/mp4" (default)

**SQL Query:**
```bash
PGPASSWORD=Chibby psql -h localhost -U postgres -d wewatch_db -c "SELECT id, file_name, is_stream, original_stream_url FROM temporary_media_items WHERE is_stream = true;"
```

---

### 6. WebSocket Broadcast Verification

**When stream URL is added, WebSocket should broadcast:**
```json
{
  "type": "media_added",
  "media_id": 123,
  "file_path": "https://drive.google.com/uc?export=download&id=ABC123",
  "file_name": "/file/d/ABC123/view",
  "original_name": "https://drive.google.com/file/d/ABC123/view?usp=sharing",
  "is_stream": true,
  "original_stream_url": "https://drive.google.com/file/d/ABC123/view?usp=sharing",
  "uploader_id": 456,
  "created_at": "2026-01-27T17:30:00Z",
  "session_id": "session-xyz-789"
}
```

**How to verify:**
1. Open browser DevTools → Network tab → WS filter
2. Add stream URL via frontend
3. Check WebSocket frames for `media_added` message
4. Verify all fields present
5. Verify other room members receive the message

---

### 7. Frontend UI/UX Testing

**Test Case 7a: Button layout**
- Two buttons side-by-side: "Browse Files" + "🔗 URL"
- Equal width (flex-1)
- Same styling

**Test Case 7b: URL input field**
- Hidden by default
- Expands when "🔗 URL" clicked
- Collapses when "🔗 URL" clicked again
- Enter key submits

**Test Case 7c: Loading states**
- "Add to Playlist" button shows "Adding..." with spinner while loading
- Button disabled during API call
- Input disabled during API call

**Test Case 7d: Success behavior**
- Success message shows briefly
- URL input clears
- Input field collapses back
- Video appears in playlist

**Test Case 7e: Error display**
- Red error message appears below input
- Error clears when user types in input
- Fallback prompt appears after 2 seconds for 403 errors

---

### 8. Integration Testing

**Test Case 8a: Multi-user scenario**
1. User A opens cinema room
2. User B joins same room
3. User A adds stream URL
4. Verify User B sees video appear in playlist via WebSocket
5. User B plays the stream URL
6. Verify video streams correctly for User B

**Test Case 8b: Playlist management**
1. Add 3 stream URLs to playlist
2. Add 2 uploaded files to playlist
3. Verify all 5 items appear in order
4. Verify stream URLs have `is_stream: true` flag
5. Verify uploaded files have `is_stream: false`
6. Delete stream URL from playlist
7. Verify removal works correctly

**Test Case 8c: Session cleanup**
1. Add stream URL to cinema session
2. End session
3. Verify TemporaryMediaItem is soft-deleted (deleted_at timestamp set)

---

### 9. Performance Testing

**Test Case 9a: URL validation speed**
- Timeout set to 10 seconds max
- Most accessible URLs should validate in 1-3 seconds

**Test Case 9b: Large video streaming**
- Test with 2GB+ video file
- Should stream without uploading entire file
- Playback should start quickly (no waiting for full upload)

**Test Case 9c: Poor network simulation**
- Simulate slow network (Chrome DevTools → Network → Slow 3G)
- Add stream URL
- Verify URL validation completes (may take longer)
- Verify video streams (may buffer, but should work)

---

### 10. Security Testing

**Test Case 10a: Authentication**
```bash
# Without auth token (should fail)
curl -X POST http://localhost:8080/api/rooms/1/media/stream \
  -H "Content-Type: application/json" \
  -d '{"stream_url": "https://example.com/video.mp4"}'
```
Expected: 401 Unauthorized

**Test Case 10b: XSS attempt**
```
URL: javascript:alert('xss')
Expected: Rejected by URL parser (not http/https scheme)
Result: "Invalid URL format" error
```

**Test Case 10c: SQL injection attempt**
```
URL: https://example.com/video.mp4'; DROP TABLE temporary_media_items;--
Expected: Safely handled by GORM parameterized queries
Result: URL treated as literal string, no SQL injection
```

---

## Manual Testing Steps

### Quick Test (5 minutes)
1. **Start backend server**
   ```bash
   cd backend
   go run cmd/server/main.go
   ```

2. **Start frontend dev server**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Open cinema room**
   - Navigate to http://localhost:5173
   - Login
   - Create or join cinema room

4. **Test stream URL**
   - Click "🔗 URL" button in left sidebar
   - Paste a public Google Drive video link
   - Click "Add to Playlist"
   - Verify video appears and plays

5. **Check database**
   ```bash
   PGPASSWORD=Chibby psql -h localhost -U postgres -d wewatch_db -c "SELECT * FROM temporary_media_items WHERE is_stream = true LIMIT 1;"
   ```

---

## Sample Test URLs

**Google Drive (you'll need your own public video):**
1. Upload a video to Google Drive
2. Right-click → Share → Change to "Anyone with the link"
3. Copy link (format: https://drive.google.com/file/d/FILE_ID/view?usp=sharing)

**Dropbox (you'll need your own public video):**
1. Upload video to Dropbox
2. Right-click → Share → Create link
3. Copy link (format: https://www.dropbox.com/s/ID/video.mp4?dl=0)

**Direct URLs (public examples):**
```
https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4
https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_10MB.mp4
```

---

## Expected Backend Logs

**Successful stream URL addition:**
```
🔗 HandleStreamURL CALLED
HandleStreamURL: Room ID: 1, User ID: 5, Stream URL: https://drive.google.com/file/d/ABC123/view
HandleStreamURL: Original URL: https://drive.google.com/file/d/ABC123/view, Direct URL: https://drive.google.com/uc?export=download&id=ABC123
✅ HandleStreamURL: Stream URL added successfully. Media ID: 42
✅ HandleStreamURL: Broadcasted media_added message to room 1
```

**Failed URL access:**
```
🔗 HandleStreamURL CALLED
HandleStreamURL: URL is not accessible: https://example.com/private.mp4
```

---

## Troubleshooting

### Issue: "URL is not accessible" error for public Google Drive link
**Solution:** 
- Ensure Google Drive sharing is set to "Anyone with the link"
- Try using `gdown` or browser to verify link is publicly accessible
- Google may rate-limit direct downloads; try again later

### Issue: Video added to playlist but won't play
**Solution:**
- Check browser console for CORS errors
- Verify video format is supported by browser
- Try different browser (Chrome, Firefox)
- Check if cloud provider requires authentication

### Issue: WebSocket message not received by other users
**Solution:**
- Check WebSocket connection in DevTools → Network → WS
- Verify Hub is properly initialized in main.go
- Check backend logs for broadcast confirmation
- Verify users are in same room ID

### Issue: Database migration not applied
**Solution:**
```bash
cd backend
PGPASSWORD=Chibby psql -h localhost -U postgres -d wewatch_db -f migrations/20260127_add_stream_url_fields.sql
```

---

## Future Enhancements
- [ ] OAuth support for private cloud files
- [ ] Thumbnail extraction from stream URLs
- [ ] Video metadata extraction (duration, resolution)
- [ ] Bandwidth tracking per stream URL
- [ ] CDN caching for frequently accessed URLs
- [ ] Support for YouTube, Vimeo, etc. (requires player embed)

---

## Summary
✅ All implementation complete
✅ Database migration applied
✅ Backend compiles successfully
✅ Route registered and protected
⏳ Ready for end-to-end testing

**Next Step:** Start both servers and run through Quick Test (5 minutes)
