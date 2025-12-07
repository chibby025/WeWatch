# RoomTV Media Upload Lifecycle & Technical Details

## 📹 Current State (Phase 1)

### What's Implemented
Currently, RoomTV supports **URL-based content only**. The UI shows an "Upload File" option, but it's **not yet implemented** on the backend.

### How It Works Now

1. **Host Creates Content**
   - Opens "Post to RoomTV" modal
   - Selects "Media/Link" type
   - Chooses "URL Link" option
   - Pastes video URL (e.g., YouTube, Vimeo, direct .mp4 link)
   - Sets display duration (5 mins - 24 hours)

2. **Backend Storage**
   ```sql
   room_tv_content table:
   - content_url: TEXT (stores the URL)
   - thumbnail_url: TEXT (optional)
   - starts_at: TIMESTAMP
   - ends_at: TIMESTAMP
   ```

3. **Database Size**: **~500 bytes per record**
   - Just metadata (URLs, timestamps, text)
   - **Zero video storage** - videos hosted externally

4. **Frontend Display**
   - RoomTV component receives `content_url`
   - Renders as clickable link: "View Content →"
   - Opens in new tab when clicked

5. **Auto-Cleanup**
   - Content expires when `ends_at < NOW()`
   - Query filters: `WHERE ends_at > NOW()`
   - No video files to delete

---

## 🚀 Full Implementation (Phase 2 - Not Yet Built)

### What Needs to Be Added

#### A. Backend File Upload Handler
```go
// In room_tv_handlers.go
func UploadTVMedia(c *gin.Context) {
    // 1. Receive multipart file
    file, err := c.FormFile("media")
    
    // 2. Validate file
    //    - Max size: 500MB
    //    - Types: video/mp4, video/webm, audio/mp3
    
    // 3. Generate unique filename
    filename := uuid.New().String() + filepath.Ext(file.Filename)
    
    // 4. Save to uploads/tv-content/
    filepath := "./uploads/tv-content/" + filename
    c.SaveUploadedFile(file, filepath)
    
    // 5. Return public URL
    publicURL := "/uploads/tv-content/" + filename
    c.JSON(200, gin.H{"url": publicURL})
}
```

#### B. Storage Structure
```
backend/
  uploads/
    tv-content/          # New folder for RoomTV media
      [uuid].mp4
      [uuid].webm
      [uuid].mp3
      ...
```

#### C. Database Updates
```sql
ALTER TABLE room_tv_content 
ADD COLUMN file_size BIGINT,      -- Bytes
ADD COLUMN file_type VARCHAR(50), -- 'video/mp4', 'audio/mp3'
ADD COLUMN is_uploaded BOOLEAN;   -- TRUE if uploaded, FALSE if URL
```

#### D. Frontend Video Player in RoomTV.jsx
```jsx
{content.data.is_uploaded ? (
  <video 
    src={content.data.content_url} 
    controls 
    className="w-full h-32 object-cover rounded-lg"
  />
) : (
  <a href={content.data.content_url} target="_blank">
    View Content →
  </a>
)}
```

---

## 💾 Storage & Space Calculations

### Per-File Storage
| File Type | Typical Size | Duration |
|-----------|-------------|----------|
| HD Video (1080p) | ~100-200 MB | 10 mins |
| SD Video (480p) | ~50-100 MB | 10 mins |
| Audio (MP3) | ~10 MB | 10 mins |
| Thumbnail (JPG) | ~200 KB | - |

### Database Storage
```
Per RoomTV Content Record:
- Metadata: ~500 bytes
- With file info: ~1 KB

1 million records = ~1 GB database space
```

### File Storage
```
Scenario 1: 100 active rooms, 1 video each
100 videos × 150 MB avg = 15 GB

Scenario 2: 1,000 rooms, 5 videos each
5,000 videos × 150 MB = 750 GB

Scenario 3: YouTube-style (URLs only)
10,000 content items × 1 KB = 10 MB
```

---

## 🎬 How Video Playback Works

### Option 1: Direct Upload (What You'd Build)

1. **Upload Flow**
   ```
   User selects file
   → Frontend: FormData with video
   → Backend: Save to /uploads/tv-content/
   → Database: Store file path
   → Frontend: Display video player
   ```

2. **Playback**
   - RoomTV renders `<video>` tag
   - Browser fetches from `/uploads/tv-content/[uuid].mp4`
   - Native HTML5 player (play, pause, volume controls)
   - All users see same video URL
   - **No synchronized playback** (each viewer controls own playback)

3. **Bandwidth**
   - Each viewer downloads video independently
   - 150 MB video × 10 viewers = 1.5 GB total bandwidth
   - Served directly from your backend

### Option 2: External URLs (Current Implementation)

1. **Host Flow**
   ```
   User pastes YouTube/Vimeo URL
   → Database: Store URL
   → RoomTV: Show "View Content →" link
   → Click opens new tab
   ```

2. **Playback**
   - Opens external platform (YouTube, Vimeo, etc.)
   - Leaves your app
   - No bandwidth cost to you
   - No storage cost to you

---

## ⚡ Recommended Approach

### For MVP/Funding Stage
**Use URLs Only (Current Implementation)**
- ✅ Zero storage costs
- ✅ Zero bandwidth costs  
- ✅ No file management complexity
- ✅ Hosts use YouTube/Vimeo/Streamable
- ✅ Fast to demo
- ❌ Less professional

### For Post-Funding (Phase 2)
**Add Direct Upload**
- ✅ Professional experience
- ✅ Keep users in-app
- ✅ Brand control
- ❌ Storage costs (~$0.02/GB/month on AWS S3)
- ❌ Bandwidth costs (~$0.09/GB on AWS)
- ❌ Need CDN for scale

---

## 🔧 Implementation Checklist (Phase 2)

### Backend (Go)
- [ ] Create `/uploads/tv-content/` directory
- [ ] Add `UploadTVMedia` handler
- [ ] File validation (size, type, virus scan)
- [ ] Generate unique filenames (UUID)
- [ ] Update RoomTVContent model (file_size, file_type, is_uploaded)
- [ ] Serve static files from `/uploads/tv-content/`
- [ ] Auto-delete expired files (cron job)

### Frontend (React)
- [ ] Update CreateTVContentModal file upload logic
- [ ] Add upload progress bar
- [ ] Handle large file uploads (chunking for 500MB+)
- [ ] Add video player to RoomTV component
- [ ] Thumbnail generation from video

### Database
- [ ] Migration: Add new columns to `room_tv_content`
- [ ] Index on `is_uploaded` for queries

### Infrastructure (Future)
- [ ] Move to AWS S3/Azure Blob for storage
- [ ] Add CloudFront/CDN for video delivery
- [ ] Implement HLS/DASH for adaptive streaming
- [ ] Add video transcoding (convert uploads to web-friendly formats)

---

## 📊 Cost Estimation (Phase 2)

### Storage
```
AWS S3 Standard:
$0.023 per GB/month

1,000 videos × 150 MB = 150 GB
150 GB × $0.023 = $3.45/month
```

### Bandwidth
```
AWS CloudFront:
$0.085 per GB (first 10 TB/month)

10 users watch 10 videos = 100 views
100 views × 150 MB = 15 GB
15 GB × $0.085 = $1.28/month
```

### Total Cost Example
```
1,000 active rooms, 100 viewers each:
Storage: $3.45/month (one-time per video)
Bandwidth: 10,000 views × 150 MB = 1,500 GB
1,500 GB × $0.085 = $127.50/month
```

---

## 🎯 Recommendation

**For Your Funding Pitch:**
Keep the current URL-based system. It's:
1. **Cost-effective**: Zero hosting costs
2. **Scalable**: No bandwidth limits
3. **Demo-ready**: Works perfectly for showing investors
4. **Professional**: YouTube embeds are standard

**After Funding:**
Build Phase 2 with:
- Direct upload to AWS S3
- CloudFront CDN delivery
- Video transcoding pipeline
- Thumbnail generation
- Synchronized playback (advanced feature)

---

## 🔐 Security Considerations

### For File Uploads (Phase 2)
1. **File Type Validation**
   ```go
   allowedTypes := map[string]bool{
       "video/mp4": true,
       "video/webm": true,
       "audio/mp3": true,
   }
   ```

2. **Size Limits**
   - Max 500 MB per file
   - Prevents server disk exhaustion

3. **Virus Scanning**
   - ClamAV integration
   - Reject suspicious files

4. **Access Control**
   - Only room hosts can upload
   - JWT auth required
   - Rate limiting (max 5 uploads/hour)

5. **Storage Quotas**
   - Free tier: 1 GB per user
   - Pro tier: 10 GB per user
   - Delete old content after 30 days

---

**Status**: Phase 1 (URLs) is **COMPLETE** ✅  
**Next**: Build Phase 2 after securing funding 💰
