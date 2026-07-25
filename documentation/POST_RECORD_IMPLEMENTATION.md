# Post & Recording Feature Implementation Plan
**Date:** April 27, 2026  
**Status:** Planning Phase  
**Goal:** Transform WeWatch into "Twitch meets TikTok for Watch Parties" - Social congregation app for creator monetization

---

## 🎯 Core Concept
- **Watching Now Tab:** Live watch sessions (existing)
- **Discover Tab:** User posts/recordings (NEW)
- Posts linked to Users who are linked to Rooms (1:many)
- Host-controlled recording (30min max @ 720p)
- Monetization-ready (paid posts infrastructure, pricing later)

---

## 📊 Database Schema

### **Posts Table**
```sql
CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL, -- Optional: context where post was created
    title VARCHAR(255) NOT NULL,
    description TEXT,
    video_url TEXT, -- BunnyCDN URL for video posts
    thumbnail_url TEXT, -- Poster/thumbnail
    media_type VARCHAR(20) NOT NULL, -- 'video', 'image', 'gif'
    post_type VARCHAR(20) NOT NULL, -- 'recording', 'upload'
    duration INTEGER, -- Seconds (for videos)
    resolution VARCHAR(10), -- '720p', '1080p', etc.
    view_count INTEGER DEFAULT 0,
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    is_paid BOOLEAN DEFAULT false,
    price DECIMAL(10,2), -- Future: price in dollars
    is_public BOOLEAN DEFAULT true, -- Private posts
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP -- Soft delete
);

CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_is_public ON posts(is_public);
```

### **Post Likes Table**
```sql
CREATE TABLE post_likes (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

CREATE INDEX idx_post_likes_post_id ON post_likes(post_id);
CREATE INDEX idx_post_likes_user_id ON post_likes(user_id);
```

### **Post Comments Table**
```sql
CREATE TABLE post_comments (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_comment_id INTEGER REFERENCES post_comments(id) ON DELETE CASCADE, -- For replies
    content TEXT NOT NULL,
    likes_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP -- Soft delete
);

CREATE INDEX idx_post_comments_post_id ON post_comments(post_id);
CREATE INDEX idx_post_comments_user_id ON post_comments(user_id);
CREATE INDEX idx_post_comments_parent ON post_comments(parent_comment_id);
```

### **Post Views Table** (for analytics)
```sql
CREATE TABLE post_views (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Nullable for anonymous views
    ip_address VARCHAR(45), -- For rate limiting
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_post_views_post_id ON post_views(post_id);
CREATE INDEX idx_post_views_created_at ON post_views(created_at);
```

---

## 🏗️ Implementation Phases

### **PHASE 1: Database & Backend Foundation**
**Timeline:** Day 1-2

#### Backend Tasks:
1. **Create Migrations**
   - `010_create_posts_table.sql`
   - `011_create_post_likes_table.sql`
   - `012_create_post_comments_table.sql`
   - `013_create_post_views_table.sql`

2. **Create Models** (`backend/internal/models/`)
   - `post.go` - Post struct with associations
   - `post_like.go` - PostLike struct
   - `post_comment.go` - PostComment struct
   - `post_view.go` - PostView struct

3. **Create API Endpoints** (`backend/internal/handlers/posts.go`)
   ```go
   // Post CRUD
   POST   /api/posts                    // Create post (upload)
   GET    /api/posts                    // Get discover feed (paginated, randomized)
   GET    /api/posts/:id                // Get single post
   PUT    /api/posts/:id                // Update post (owner only)
   DELETE /api/posts/:id                // Delete post (owner only)
   
   // User posts
   GET    /api/users/:id/posts          // Get user's posts (profile view)
   
   // Room posts
   GET    /api/rooms/:id/posts          // Get posts created in room context
   
   // Engagement
   POST   /api/posts/:id/like           // Like post
   DELETE /api/posts/:id/unlike         // Unlike post
   POST   /api/posts/:id/view           // Track view
   
   // Comments (future)
   GET    /api/posts/:id/comments       // Get comments
   POST   /api/posts/:id/comments       // Add comment
   ```

4. **BunnyCDN Integration**
   - Create storage zone for posts: `wewatch-posts`
   - Add upload helpers in `backend/internal/utils/bunny_cdn.go`

---

### **PHASE 2: Recording Feature (Frontend)**
**Timeline:** Day 3-4

#### Recording UI in LeftSidebar
1. **Add Record Button** (`frontend/src/components/cinema/ui/LeftSidebar.jsx`)
   - Position: After Games button (last button)
   - Visible: Host only
   - Icon: 🔴 or Camera icon

2. **Recording Selection Modal** (NEW: `RecordingOptionsModal.jsx`)
   ```jsx
   Options:
   - Full Canvas (everything visible)
   - Video Player Only
   - LiveShare Camera/Screen
   - Audio: Include/Exclude
   ```

3. **Recording Controller** (NEW: `useSessionRecorder.js` hook)
   ```javascript
   - MediaRecorder API setup
   - Canvas capture (for Full Canvas mode)
   - Video element capture (for Player Only)
   - LiveKit track capture (for LiveShare)
   - Chunk management (5-minute chunks)
   - Max duration: 30 minutes @ 720p
   - Auto-stop at 30min
   - Progress indicator
   ```

4. **Recording UI States**
   ```
   - Idle → Show "Start Recording" button
   - Recording → Show timer + "Stop Recording" button
   - Processing → Show "Uploading..." progress
   - Complete → Show "View Post" button
   ```

5. **Upload Logic**
   ```javascript
   - Record in WebM format (browser native)
   - Upload chunks to backend as they complete
   - Backend uploads to BunnyCDN
   - Create Post entry with video_url
   - Generate thumbnail from first frame
   ```

---

### **PHASE 3: Post Upload Feature**
**Timeline:** Day 5-6

#### CreateNewModal Update
1. **Add "Post" Option** (`frontend/src/components/CreateNewModal.jsx`)
   ```jsx
   Current:
   - Instant Watch
   - Create Room
   
   NEW:
   - Post (NEW OPTION)
     - Opens PostUploadModal
   - Watch Session (Replaces "Instant Watch")
     - Opens to Instant Watch flow
     - Then shows Create Room option
   ```

2. **PostUploadModal** (NEW: `PostUploadModal.jsx`)
   ```jsx
   Features:
   - Drag & drop or file select
   - Accept: video/*, image/*, .gif
   - Video: 10min max @ 1080p (portrait or landscape)
   - Image: 1080x1920 max (TikTok standard)
   - GIF: 10MB max
   - Preview before upload
   - Title input (required, max 255 chars)
   - Description input (optional, max 2000 chars)
   - Privacy toggle (Public/Private)
   - Room association dropdown (optional)
   ```

3. **Upload Flow**
   ```javascript
   - Validate file type/size
   - Generate thumbnail (video: first frame, image: itself)
   - Chunked upload to backend
   - Backend uploads to BunnyCDN
   - Create Post entry
   - Redirect to post view or user profile
   ```

---

### **PHASE 4: Discover Feed**
**Timeline:** Day 7-8

#### Lobby Page Updates
1. **Watching Now Tab Enhancement** (`frontend/src/components/LobbyPage.jsx`)
   ```jsx
   Current: Single view (live sessions)
   
   NEW: Sub-tabs
   - [Watching Now] - Live sessions (existing)
   - [Discover] - User posts (NEW)
   ```

2. **Discover Feed Component** (NEW: `DiscoverFeed.jsx`)
   ```jsx
   Features:
   - Infinite scroll (like TikTok For You)
   - Post cards in grid (3 columns desktop, 2 mobile, 1 tiny screens)
   - Each card shows:
     * Thumbnail/video
     * Title
     * Creator avatar + username
     * View count
     * Like count
     * Duration (for videos)
     * "PAID" badge (if is_paid, even though no price yet)
   - Click card → Open PostViewModal
   ```

3. **Feed Algorithm**
   ```javascript
   Phase 1 (MVP): Randomized
   - Fetch 20 posts at a time
   - Random order (ORDER BY RANDOM())
   - Filter by content rating (respect user's age)
   
   Phase 2 (Future): Smart algorithm
   - User interests (based on watch history)
   - Engagement score (views + likes)
   - Recency boost
   ```

4. **PostViewModal** (NEW: `PostViewModal.jsx`)
   ```jsx
   Features:
   - Fullscreen video player (or image viewer)
   - Creator info (avatar, username, follow button)
   - Like button (double-tap or button)
   - Comment button (future)
   - Share button
   - View count
   - Description (expandable)
   - "Watch in Room" button (if post.room_id exists)
   - TikTok-style swipe (future: swipe up for next post)
   ```

---

### **PHASE 5: Profile Integration**
**Timeline:** Day 9-10

#### UserProfileModal Updates
1. **Add Tabs** (`frontend/src/components/UserProfileModal.jsx`)
   ```jsx
   Current: Single view (user info)
   
   NEW: Tabs
   - [ℹ️ Info] - Bio, stats (existing)
   - [📹 Posts] - User's posts grid (NEW)
   - [🎬 Rooms] - Rooms they host (existing)
   ```

2. **Posts Grid Component** (NEW: `PostsGrid.jsx`)
   ```jsx
   Features:
   - Instagram-style grid (3 columns)
   - Square thumbnails
   - Hover: Show view/like counts
   - Click: Open PostViewModal
   - Infinite scroll
   - Empty state: "No posts yet"
   - Filter: All/Videos/Images
   ```

#### RoomPageEditModal Updates
1. **Add Posts Tab** (`frontend/src/components/RoomPageEditModal.jsx`)
   ```jsx
   Current: Room settings only
   
   NEW: Tabs
   - [ℹ️ Info] - Room settings (existing)
   - [📹 Posts] - Posts created in this room context (NEW)
   ```

2. **Room Posts Grid**
   - Same as PostsGrid
   - Filter: Posts where `post.room_id = room.id`

---

## 🎨 UI/UX Specifications

### **Recording Button (LeftSidebar)**
```
Location: Bottom section, after Games button
Style: 
- Idle: Gray circle with red dot (🔴)
- Recording: Pulsing red circle + timer
- Processing: Spinner + "Uploading..."
Size: 48x48px
Tooltip: "Record Session (Host Only)"
```

### **Post Card (Discover Feed)**
```
Dimensions: 
- Desktop: 320x400px
- Mobile: 48vw x 60vw
- Tiny: 100vw x 125vw

Layout:
┌─────────────────┐
│   Thumbnail     │ 70% height
│   (or video)    │
├─────────────────┤
│ 👤 Username     │ 10% height
│ 💬 Title (2ln)  │
│ 👁️ Views ❤️ Likes│ 10% height
└─────────────────┘
```

### **PostViewModal**
```
Fullscreen modal (like TikTok video view)
- Video/image takes full height
- Overlay UI on sides (mobile) or right (desktop)
- Semi-transparent controls
- Swipe up for next post (future)
```

---

## 🔒 Security & Validation

### **Upload Restrictions**
```javascript
Video:
- Max duration: 10 minutes
- Max file size: 500MB
- Allowed formats: mp4, webm, mov
- Max resolution: 1920x1080 (1080p)
- Aspect ratios: 16:9, 9:16, 1:1

Image:
- Max resolution: 1920x1080
- Max file size: 10MB
- Allowed formats: jpg, png, webp

GIF:
- Max file size: 10MB
- Max dimensions: 1920x1080
```

### **Recording Restrictions**
```javascript
- Max duration: 30 minutes (enforced client-side)
- Resolution: 1280x720 (720p, enforced)
- Format: WebM (VP9 codec)
- Auto-stop at 30min with warning at 28min
```

### **Rate Limiting**
```
- Post creation: 5 per hour per user
- Recording: 10 per day per user
- Uploads: 100MB per minute per user
```

---

## 📈 Analytics & Metrics

### **Track These Metrics**
```
Posts:
- Total posts created
- Posts by type (recording vs upload)
- Average views per post
- Average likes per post
- Engagement rate (likes/views)

Recording:
- Sessions recorded
- Average recording duration
- Recording completion rate
- Failed recordings

Users:
- Users with posts
- Average posts per user
- Top creators (by views/likes)

Performance:
- Upload success rate
- Average upload time
- Storage usage (BunnyCDN)
```

---

## 🚀 Deployment Checklist

### **Backend**
- [ ] Run migrations (posts, likes, comments, views tables)
- [ ] Create BunnyCDN storage zone `wewatch-posts`
- [ ] Add BunnyCDN credentials to env vars
- [ ] Update API routes
- [ ] Test post CRUD endpoints
- [ ] Test upload flow

### **Frontend**
- [ ] Add Recording button to LeftSidebar
- [ ] Implement recording logic (MediaRecorder)
- [ ] Update CreateNewModal with Post option
- [ ] Build PostUploadModal
- [ ] Add Discover sub-tab to Watching Now
- [ ] Build DiscoverFeed component
- [ ] Build PostViewModal
- [ ] Update UserProfileModal with tabs
- [ ] Update RoomPageEditModal with tabs
- [ ] Test upload flow (video/image/gif)
- [ ] Test recording flow
- [ ] Test discover feed infinite scroll

### **Testing**
- [ ] Upload 10min video (max duration)
- [ ] Upload 1080p image (max resolution)
- [ ] Upload 10MB GIF (max size)
- [ ] Record 30min session (max duration)
- [ ] Test recording different sources (canvas, player, LiveShare)
- [ ] Test discover feed pagination
- [ ] Test post likes/views
- [ ] Test profile posts grid
- [ ] Test room posts grid
- [ ] Mobile responsiveness

---

## 💰 Cost Estimates (BunnyCDN)

### **Storage**
```
Assume:
- Average post: 100MB (5min @ 720p)
- 1000 posts/month = 100GB
- BunnyCDN storage: $0.01/GB/month

Monthly: 100GB × $0.01 = $1/month
```

### **Bandwidth**
```
Assume:
- Average post view: 100MB download
- 10,000 views/month = 1TB bandwidth
- BunnyCDN bandwidth: $0.01/GB

Monthly: 1000GB × $0.01 = $10/month
```

### **Total: ~$11/month for 1000 posts + 10,000 views**
Extremely affordable. Even at 100x scale: $1,100/month.

---

## 🔮 Future Enhancements (Not in MVP)

### **Phase 2 (Post-Launch)**
1. **Comments System**
   - Add comment UI to PostViewModal
   - Threaded replies (parent_comment_id)
   - Like comments
   - Mention users (@username)

2. **Paid Posts**
   - Enable price setting
   - Payment flow (buy post access)
   - Creator earnings dashboard
   - Payout system integration

3. **Advanced Recording**
   - Edit recording before posting (trim, add text)
   - Add music/sound effects
   - Filters and effects
   - Multiple camera angles

4. **Discovery Algorithm**
   - User interest profiling
   - Engagement-based ranking
   - "For You" personalized feed
   - "Following" feed (posts from followed users)

5. **Social Features**
   - Follow/unfollow users
   - Share posts to other platforms
   - Embed posts on external sites
   - Post collections/playlists

6. **Analytics Dashboard**
   - Post performance metrics
   - Audience demographics
   - Revenue tracking (for paid posts)
   - Growth insights

---

## 📝 Notes & Decisions

### **Why 720p for Recordings?**
- Balance between quality and file size
- 30min @ 720p ≈ 1.5GB (manageable)
- 30min @ 1080p ≈ 3GB (too large)
- Most users watch on mobile (720p sufficient)

### **Why 10min for Uploads?**
- Standard for social platforms (TikTok: 10min, Instagram Reels: 90sec, YouTube Shorts: 60sec)
- Keeps content consumable
- Reduces bandwidth costs
- Can increase later based on usage

### **Why Randomized Feed Initially?**
- Simple to implement
- Fair to all creators (no algorithm bias)
- Good for testing engagement
- Can A/B test algorithms later

### **Why Comments Table Now?**
- Easier to add infrastructure early
- Minimal cost (just schema)
- UI can come later
- Avoids migration headaches

---

## 🎯 Success Criteria

### **MVP Launch (Week 1-2)**
- [ ] Users can record 30min sessions @ 720p
- [ ] Users can upload videos/images/GIFs
- [ ] Discover feed shows posts (randomized)
- [ ] Posts show view counts and likes
- [ ] User profiles show posts grid
- [ ] Room profiles show posts grid
- [ ] Mobile responsive
- [ ] No critical bugs

### **Post-Launch Metrics (Week 3-4)**
- [ ] 100+ posts created
- [ ] 10+ recordings made
- [ ] 1000+ post views
- [ ] 100+ post likes
- [ ] 50%+ upload success rate
- [ ] <5% bug reports

### **Growth Targets (Month 1-3)**
- [ ] 1000+ posts
- [ ] 100+ active creators
- [ ] 10,000+ post views
- [ ] Average 5+ posts per creator
- [ ] <2% churn rate for creators

---

## ⚠️ Risks & Mitigations

### **Risk: Copyright Issues (DMCA)**
**Mitigation:**
- ToS requires users certify they own content
- DMCA takedown process in place
- Report content feature
- Content moderation (manual review for now)

### **Risk: Storage Costs**
**Mitigation:**
- Delete abandoned posts (no views in 90 days)
- Compress videos server-side (FFmpeg)
- Limit uploads per user (5/hour)
- Monitor storage usage (alerts at thresholds)

### **Risk: Low Engagement**
**Mitigation:**
- Promote feature to existing users (email campaign)
- Incentivize creators (badges, featured posts)
- Cross-promote posts in live sessions
- Share best posts on social media

### **Risk: Recording Failures**
**Mitigation:**
- Client-side validation before recording
- Chunk-based upload (resume on failure)
- Fallback recording methods (video-only if canvas fails)
- Clear error messages + retry logic

---

## 🛠️ Technical Debt to Address

1. **Video Compression** - Server-side FFmpeg processing (reduce file sizes)
2. **Thumbnail Generation** - Auto-generate from video frame (first/middle frame)
3. **Content Moderation** - Automated scanning (NSFW detection)
4. **Search** - Full-text search for posts (Elasticsearch or Postgres FTS)
5. **Notifications** - Notify followers when creator posts
6. **Analytics** - More detailed engagement metrics

---

## 🏁 Conclusion

This implementation transforms WeWatch from a watch party platform into a **full-fledged social creator platform**. The "Twitch meets TikTok" model positions us uniquely:

- **Live watch parties** (core differentiator)
- **On-demand content** (creator library)
- **Monetization** (paid posts, future)
- **Social features** (likes, comments, follows)

**Total effort:** 10-14 days for MVP  
**Cost:** ~$10-50/month at launch scale  
**Risk:** Low (incremental feature, doesn't break existing)  
**Upside:** High (creator retention, viral growth, monetization)

---

**Status:** Ready to implement  
**Next Step:** Phase 1 - Database & Backend Foundation  
**Start Date:** TBD  
**Owner:** Development Team
