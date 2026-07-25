# POST & DISCOVER TESTING GUIDE 🧪

Quick testing steps to verify the post/discover implementation is working correctly.

---

## ⚠️ IMPORTANT: Date of Birth Fix Applied

**Issue Fixed**: User details (including avatar and DOB status) are now properly fetched on login/register.

**Changes Made**:
- ✅ Backend now returns `has_date_of_birth` boolean in all auth responses
- ✅ Login response includes `avatar_url`, `bio`, and `has_date_of_birth`
- ✅ Register response includes `avatar_url` and `has_date_of_birth`
- ✅ `/api/auth/me` includes `has_date_of_birth` field
- ✅ Registration now navigates to `/lobby` (not `/login`) after success
- ✅ User data is cached in localStorage immediately after login/register

**What This Fixes**:
1. LobbyLeftSidebar will now show user avatar immediately
2. DOB prompt won't appear if user already provided it
3. Frontend knows DOB status without extra API calls
4. No more stale user data issues

---

## Prerequisites

1. **Backend Running**: `cd backend && go run cmd/server/main.go`
2. **Frontend Running**: `cd frontend && npm run dev`
3. **Database**: PostgreSQL with migrations applied
4. **User Account**: Logged in to WeWatch

---

## Test 1: Create a Post ✅

### Steps:
1. Navigate to lobby page
2. Click the **"Create"** button (top right)
3. Select **"Post"** option (pink gradient with video icon)
4. PostUploadModal should open

### Expected Result:
- Modal opens with file upload area
- "Drag and drop your file here" message visible

---

## Test 2: Upload Media ✅

### Steps:
1. In PostUploadModal, drag-drop OR click to select a file:
   - **Video**: MP4 (max 500MB, max 10 minutes)
   - **Image**: JPG/PNG (max 10MB)
   - **GIF**: Animated GIF (max 10MB)
2. File preview should appear
3. Enter title: "Test Post"
4. Enter description: "This is a test post"
5. Toggle privacy (public/private)
6. Click **"Upload"**

### Expected Result:
- Upload progress bar appears (0% → 100%)
- Success toast: "Post created successfully!"
- Modal closes

### What to Check:
- Console logs show: `✅ Post created with ID: X`
- Backend logs: `✅ [CreatePost] Post created`, `✅ [UploadPostMedia] Upload complete`

---

## Test 3: View Discover Feed ✅

### Steps:
1. In lobby, click **"Watching Now"** tab (3rd tab)
2. Click **"Discover"** sub-tab
3. Grid of posts should load

### Expected Result:
- Posts appear in 3-column grid (desktop)
- Each post shows:
  - Thumbnail image
  - Hover overlay with title, creator, stats
  - Video duration badge (if video)
  - View/like/comment counts

### What to Check:
- API call: `GET /api/posts?page=1&limit=12`
- Response contains posts array
- Console: `✅ [DiscoverFeed] Fetched X posts`

---

## Test 4: Infinite Scroll ✅

### Steps:
1. In Discover feed, scroll down to bottom
2. Continue scrolling past visible posts

### Expected Result:
- Loading spinner appears
- More posts load automatically
- New posts append to grid

### What to Check:
- API calls: `GET /api/posts?page=2&limit=12`, `page=3`, etc.
- No duplicate posts
- Smooth loading without layout shift

---

## Test 5: Open Post Viewer ✅

### Steps:
1. In Discover feed, click any post card
2. PostViewModal should open fullscreen

### Expected Result:
- Modal opens in fullscreen black background
- Media displays in center (video player or image)
- Right sidebar shows:
  - Creator info (avatar, username, date)
  - Title and description
  - Like button (heart icon)
  - Comment button (message icon)
  - Share button

### What to Check:
- Video auto-plays (if video)
- View tracked: `POST /api/posts/:id/view`
- Backend logs: `✅ [TrackPostView] View tracked`

---

## Test 6: Like a Post ✅

### Steps:
1. In PostViewModal, click **like button** (heart icon)
2. Button should turn red and fill
3. Likes count increments

### Expected Result:
- Heart icon: gray outline → red filled
- Count: N → N+1
- Optimistic update (instant UI change)

### What to Check:
- API call: `POST /api/posts/:id/like`
- Backend logs: `✅ [LikePost] Post X liked by user Y`
- Database: `post_likes` table has new row

### Bonus Test:
- Click heart again to unlike
- Heart returns to gray outline
- Count decrements: N+1 → N
- API: `DELETE /api/posts/:id/unlike`

---

## Test 7: Double-Tap Like ❤️

### Steps:
1. In PostViewModal, **double-click** on the video/image
2. Large heart animation should appear

### Expected Result:
- Big ❤️ pops up in center
- Post is liked (same as clicking button)
- Animation fades out after 0.8s

### What to Check:
- Heart animation plays
- Like button turns red
- Count increments

---

## Test 8: Add Comment ✅

### Steps:
1. In PostViewModal, click **comment button** (message icon)
2. Comments section expands
3. Type in comment input: "Great post!"
4. Click **send button** (paper plane icon)

### Expected Result:
- Comment input clears
- New comment appears at top of list
- Comment shows:
  - Your avatar
  - Your username
  - Comment text
  - Timestamp
- Comments count increments

### What to Check:
- API: `POST /api/posts/:id/comments`
- Response: `{ "comment": {...} }`
- Backend logs: `✅ [CreatePostComment] Comment created`

---

## Test 9: Delete Comment ✅

### Steps:
1. In comments section, find YOUR comment
2. Trash icon should appear next to it
3. Click trash icon
4. Confirm deletion

### Expected Result:
- Comment disappears from list
- Comments count decrements
- Success toast: "Comment deleted"

### What to Check:
- API: `DELETE /api/posts/comments/:id`
- Backend logs: `✅ [DeletePostComment] Comment deleted`
- Only YOUR comments have trash icon

---

## Test 10: Share Post ✅

### Steps:
1. In PostViewModal, click **share button** (share icon)
2. Native share dialog opens OR clipboard notification

### Expected Result:
- **Mobile/Native Share**: Share sheet with apps
- **Desktop/No Share API**: Toast "Link copied to clipboard!"

### What to Check:
- URL format: `http://localhost:5173/posts/:id`
- Clipboard contains correct URL

---

## Test 11: Navigate Back to Sessions ✅

### Steps:
1. Close PostViewModal (Escape key or X button)
2. Click **"Watching Now"** sub-tab
3. Active sessions should display

### Expected Result:
- Modal closes
- Sessions list renders
- Trailers section visible (if any)
- No discover grid visible

---

## Test 12: Record Watch Session (Host Only) 🎥

### Steps:
1. **Join or create a watch session** in cinema view
2. As the **host**, look for the **"Record Session"** button in LeftSidebar
3. Click **"Record Session"**
4. RecordingOptionsModal should open

### Expected Result:
- Modal displays 3 recording options:
  - **Full Canvas** (recommended) - Records everything
  - **Video Player Only** - Records just the video
  - **LiveShare Camera/Screen** - Records LiveShare feed
- Each option has icon, description, and radio button
- Info box shows recording limits (30min, 720p)

---

## Test 13: Start Recording ✅

### Steps:
1. In RecordingOptionsModal, select **"Full Canvas"**
2. Click **"Start Recording"** button
3. Modal closes

### Expected Result:
- Toast: "🔴 Recording started!"
- Record button changes to red with pulsing animation
- Timer shows: ⏱️ 00:00 / 30:00
- Console log: `✅ [Recording] Started`

### What to Check:
- MediaRecorder is capturing canvas stream
- Timer increments every second
- Button shows live recording state

---

## Test 14: Stop Recording ✅

### Steps:
1. While recording, click the **Record button** again (now shows timer)
2. Recording stops

### Expected Result:
- Toast: "Processing recording..."
- Button shows "Uploading X%"
- Progress bar animates 0% → 100%
- Success toast: "🎉 Recording posted successfully!"
- Button returns to "Record Session" state

### What to Check:
- API calls:
  1. `POST /api/posts` (create post entry)
  2. `POST /api/posts/:id/upload` (upload WebM file)
- Backend logs: `✅ [CreatePost]`, `✅ [UploadPostMedia]`
- Recording appears in Discover feed

---

## Test 15: Recording Time Limit ⏰

### Steps:
1. Start a recording
2. Wait for timer to reach **28:00**
3. Continue to **30:00**

### Expected Result:
- **At 28:00**: Warning toast "⏰ 2 minutes remaining!"
- **At 30:00**: Recording auto-stops
- Toast: "Recording stopped - 30 minute limit reached"
- Upload process starts automatically

---

## Test 16: View Recorded Session in Discover ✅

### Steps:
1. After recording uploads successfully
2. Navigate to **Discover tab**
3. Scroll to find your recording

### Expected Result:
- Recording appears with:
  - Thumbnail (if FFmpeg available, otherwise blank)
  - Title: "Watch Party Recording - [date]"
  - Your username as creator
  - Duration badge
  - View/like counts at 0

### What to Check:
- Post type: `recording` (in database)
- Room ID: Associated with session room
- Is public: true
- Click opens PostViewModal and plays video

---

## Test 17: Recording Appears in Profile Posts ✅

### Steps:
1. Click your avatar → Open UserProfileModal
2. Click **"📹 Posts"** tab
3. Your recording should appear in grid

### Expected Result:
- Recording shows in Instagram-style grid
- Click opens PostViewModal
- Can like/comment on own recording
- Shows in "All" and "Videos" filter

---

## Test 18: Responsive Layout 📱

### Steps:
1. Resize browser window to mobile width (< 640px)
2. Check Discover grid layout

### Expected Result:
- Grid changes to **1 column**
- Post cards stack vertically
- Viewer sidebar becomes full-width overlay
- Touch interactions work (tap to like)

### What to Check:
- Tailwind responsive classes active
- No horizontal scroll
- Text readable on small screens

---

## Common Issues & Solutions

### Issue: "Failed to load posts"
**Solution**: 
- Check backend is running: `http://localhost:8080/health`
- Verify database migrations applied
- Check browser console for API errors

### Issue: "Upload failed"
**Solution**:
- Check file size (500MB video, 10MB image)
- Verify file type (video/*, image/*)
- Check backend logs for validation errors
- Ensure `./uploads/posts/` directory exists

### Issue: "Unauthorized" errors
**Solution**:
- Verify you're logged in
- Check JWT token in cookies (dev tools)
- Try logging out and back in
- Check backend logs for auth errors

### Issue: "View not tracked"
**Solution**:
- Check database: `SELECT * FROM post_views;`
- Verify unique constraint not blocking
- Check backend logs: `✅ [TrackPostView]`

### Issue: No thumbnails for videos
**Solution**:
- BunnyCDN not configured? That's OK!
- Local storage fallback active
- Thumbnails won't generate locally (need FFmpeg)
- Images will still display

### Issue: "Canvas not found" error
**Solution**:
- Make sure you're in cinema/3D view (not lobby)
- Video must be playing for Video Only mode
- LiveShare must be active for LiveShare mode
- Try "Full Canvas" mode if others fail

### Issue: Recording stops immediately
**Solution**:
- Check browser permissions for camera/microphone
- Ensure canvas element is visible on page
- Check console for MediaRecorder errors
- Try different recording source

### Issue: Upload fails after recording
**Solution**:
- Check available disk space (recordings can be large)
- Verify backend is running and accessible
- Check network connection (large file upload)
- Look for errors in browser console and backend logs

---

## Database Verification

Check data was created correctly:

```sql
-- View posts
SELECT id, user_id, title, media_type, post_type, view_count, likes_count, comments_count 
FROM posts 
ORDER BY created_at DESC 
LIMIT 10;

-- View recordings specifically
SELECT id, title, post_type, room_id, duration, created_at
FROM posts
WHERE post_type = 'recording'
ORDER BY created_at DESC;

-- View likes
SELECT * FROM post_likes ORDER BY created_at DESC LIMIT 10;

-- View comments
SELECT c.id, c.content, u.username, c.created_at 
FROM post_comments c 
JOIN users u ON c.user_id = u.id 
ORDER BY c.created_at DESC 
LIMIT 10;

-- View tracking
SELECT * FROM post_views ORDER BY viewed_at DESC LIMIT 10;
```

---

## API Testing (Postman/cURL)

### Get Discover Feed
```bash
curl http://localhost:8080/api/posts?page=1&limit=12
```

### Create Post (requires auth)
```bash
curl -X POST http://localhost:8080/api/posts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Post",
    "description": "Testing API",
    "media_type": "image",
    "post_type": "upload",
    "is_public": true
  }'
```

### Like Post
```bash
curl -X POST http://localhost:8080/api/posts/1/like \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Add Comment
```bash
curl -X POST http://localhost:8080/api/posts/1/comments \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Great post!"}'
```

---

## Performance Benchmarks

### Expected Response Times:
- `GET /api/posts` (discover feed): < 200ms
- `GET /api/posts/:id` (single post): < 50ms
- `POST /api/posts/:id/like`: < 100ms
- `GET /api/posts/:id/comments`: < 150ms

### File Upload Times (local storage):
- 10MB image: ~1-2 seconds
- 100MB video: ~10-20 seconds
- 500MB video: ~50-90 seconds

---

## Success Criteria ✅

Phase 2 (Post & Discover) is working if:
- [x] Posts upload successfully
- [x] Discover feed loads and displays posts
- [x] Infinite scroll loads more posts
- [x] Post viewer opens and displays media
- [x] Like/unlike functionality works
- [x] Comments can be added/deleted
- [x] Views are tracked (1 per user per day)
- [x] Share functionality works
- [x] Responsive layout on mobile
- [x] No console errors
- [x] Backend logs show success messages

Phase 2 (Session Recording) is working if:
- [ ] Record button appears for host only
- [ ] RecordingOptionsModal opens with 3 source options
- [ ] Recording starts and timer counts up
- [ ] Recording can be stopped manually
- [ ] Recording auto-stops at 30 minutes
- [ ] Warning appears at 28 minutes
- [ ] Upload progress shows during processing
- [ ] Recording appears in Discover feed
- [ ] Recording appears in user profile Posts tab
- [ ] Recorded video plays correctly in PostViewModal
- [ ] Canvas/video/LiveShare capture works

---

## Next Steps After Testing

If all tests pass:
1. ✅ Mark Phase 1 & 2 complete (Upload + Discover + Recording)
2. 📊 Add analytics dashboard for creators
3. 💰 Implement paid post monetization (price field already in DB)
4. 🔍 Build search functionality for posts
5. 🔔 Add notifications when followed creators post
6. 🎨 Add post editing (trim, filters, effects)

**Happy Testing! 🚀**
