# Upload System Improvements for Poor Network (Nigeria)

## Current Issues
1. **No cancel functionality** - Users can't stop ongoing uploads
2. **Large file handling** - 1GB files timeout or fail
3. **Network interruptions** - Upload restarts from 0% on disconnect
4. **Poor progress feedback** - User doesn't know upload speed/ETA

---

## Why Google Drive URL Upload Failed

### The Problem
When we tried to stream Google Drive videos directly:
```javascript
// Frontend tried this:
<video src="https://drive.google.com/uc?id=FILE_ID" />
```

**Result:** ❌ **CORS Error + 403 Forbidden**

### Why It Failed

#### 1. **CORS (Cross-Origin Resource Sharing)**
- Google Drive intentionally blocks cross-origin video embedding
- Missing header: `Access-Control-Allow-Origin`
- Browser blocks the request for security

#### 2. **Authentication Required**
- Direct download links require Google authentication
- No session cookies = 403 Forbidden
- Anti-piracy measure by Google

### How Rave (and Similar Apps) Do It

Rave **DOES NOT** use direct URL streaming. They use:

#### **Method 1: Google Drive API (Authenticated)**
```javascript
// Rave's approach (simplified):
1. User authenticates with Google OAuth
2. App gets access token
3. Backend fetches file via Google Drive API
4. Streams to users with proper authentication

// Code example:
const drive = google.drive({ version: 'v3', auth: oAuth2Client });
const response = await drive.files.get({
  fileId: 'FILE_ID',
  alt: 'media'  // Download as media, not metadata
}, { responseType: 'stream' });
```

**Pros:**
- Works with proper authentication
- No CORS issues (server-side request)
- Can handle private files

**Cons:**
- Requires Google OAuth integration
- Complex backend proxy needed
- May violate Google Drive ToS for public streaming
- Bandwidth costs (proxying through your server)

#### **Method 2: Screen Sharing (What We Recommend)**
```javascript
// Our current solution:
1. User opens Google Drive in browser
2. Plays video normally (authenticated in their Google account)
3. Screen shares the browser tab via LiveKit
4. Everyone sees the video (peer-to-peer, no bandwidth costs)
```

**Pros:**
- ✅ Works with ANY platform (Netflix, YouTube, Google Drive)
- ✅ No CORS issues (not downloading, just sharing screen)
- ✅ Legal (user has access, just sharing their screen)
- ✅ Zero bandwidth costs (peer-to-peer via LiveKit)
- ✅ Already implemented in "Watch From" tab

**Cons:**
- Requires decent upload speed from host
- Quality depends on host's screen resolution

---

## Recommended Solutions for Upload System

### 1. **Chunked Upload with Resume (Tus Protocol)**

**Implementation:**
```bash
# Install Tus (resumable upload library)
npm install tus-js-client
```

```javascript
// frontend/src/services/uploadService.js
import * as tus from 'tus-js-client';

export const uploadWithResume = (file, roomId, sessionId, onProgress, onSuccess, onError) => {
  const upload = new tus.Upload(file, {
    endpoint: `${API_BASE_URL}/api/rooms/${roomId}/upload/resumable`,
    retryDelays: [0, 3000, 5000, 10000, 20000], // Retry on network errors
    chunkSize: 5 * 1024 * 1024, // 5MB chunks (good for poor networks)
    metadata: {
      filename: file.name,
      filetype: file.type,
      roomId: roomId.toString(),
      sessionId: sessionId || '',
    },
    onError: (error) => {
      console.error('Upload failed:', error);
      onError(error);
    },
    onProgress: (bytesUploaded, bytesTotal) => {
      const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
      onProgress(percentage, bytesUploaded, bytesTotal);
    },
    onSuccess: () => {
      console.log('Upload complete!');
      onSuccess();
    },
  });

  upload.start();
  
  return upload; // Return for cancel functionality
};
```

**Backend (Go with Tus Server):**
```go
// backend/internal/handlers/resumable_upload.go
import (
    "github.com/tus/tusd/pkg/filestore"
    "github.com/tus/tusd/pkg/handler"
)

func SetupResumableUpload(router *gin.Engine) {
    store := filestore.New("./uploads/temp")
    composer := handler.NewStoreComposer()
    store.UseIn(composer)
    
    tusHandler, err := handler.NewHandler(handler.Config{
        BasePath:              "/api/rooms/:roomId/upload/resumable",
        StoreComposer:         composer,
        MaxSize:               1024 * 1024 * 1024, // 1GB
        NotifyCompleteUploads: true,
    })
    
    if err != nil {
        panic(err)
    }
    
    // Handle completed uploads
    go func() {
        for {
            event := <-tusHandler.CompleteUploads
            // Move file to final location, create database record
            handleCompletedUpload(event.Upload.ID, event.Upload.MetaData)
        }
    }()
    
    router.POST("/api/rooms/:roomId/upload/resumable", gin.WrapH(tusHandler))
    router.HEAD("/api/rooms/:roomId/upload/resumable/:id", gin.WrapH(tusHandler))
    router.PATCH("/api/rooms/:roomId/upload/resumable/:id", gin.WrapH(tusHandler))
}
```

**Benefits:**
- ✅ Uploads resume after network interruption
- ✅ 5MB chunks = reliable on poor connections
- ✅ Automatic retries with exponential backoff
- ✅ Can pause and resume later

---

### 2. **Cancel Upload Functionality**

**Frontend Update:**
```javascript
// LeftSidebar.jsx
const [uploading, setUploading] = useState(false);
const [uploadProgress, setUploadProgress] = useState(0);
const uploadControllerRef = useRef(null); // Track active upload

const handleFileUpload = async (files) => {
  if (!files?.length || !roomId) return;
  
  const file = files[0];
  
  // Size warnings
  if (file.size > 1024 * 1024 * 1024) { // 1GB
    const confirm = window.confirm(
      `This file is ${(file.size / 1024 / 1024 / 1024).toFixed(2)}GB. ` +
      `Upload may take a long time on slow connections. Continue?`
    );
    if (!confirm) return;
  }

  setUploading(true);
  setUploadProgress(0);

  try {
    // Using Tus for resumable uploads
    const upload = uploadWithResume(
      file,
      roomId,
      sessionId,
      (percent, uploaded, total) => {
        setUploadProgress(percent);
        // Show speed and ETA
        const speed = calculateSpeed(uploaded);
        const eta = calculateETA(uploaded, total, speed);
        console.log(`Progress: ${percent}% | Speed: ${speed}MB/s | ETA: ${eta}`);
      },
      () => {
        onUploadComplete();
        setUploading(false);
        setUploadProgress(0);
      },
      (error) => {
        console.error('Upload error:', error);
        alert('Upload failed. Progress saved - you can retry later.');
        setUploading(false);
      }
    );
    
    uploadControllerRef.current = upload; // Save for cancel
    
  } catch (err) {
    console.error("Upload failed:", err);
    setUploading(false);
  }
};

const handleCancelUpload = () => {
  if (uploadControllerRef.current) {
    uploadControllerRef.current.abort(); // Tus abort
    setUploading(false);
    setUploadProgress(0);
    alert('Upload cancelled. Progress saved - you can resume later.');
  }
};
```

**UI Update:**
```jsx
{uploading && (
  <div className="bg-gray-800 p-4 rounded-lg">
    <div className="flex justify-between mb-2">
      <span className="text-white">Uploading...</span>
      <button
        onClick={handleCancelUpload}
        className="text-red-500 hover:text-red-400 font-medium"
      >
        Cancel
      </button>
    </div>
    <div className="bg-gray-700 h-2 rounded-full overflow-hidden">
      <div
        className="bg-blue-500 h-2 rounded-full transition-all"
        style={{ width: `${uploadProgress}%` }}
      />
    </div>
    <div className="flex justify-between mt-1 text-sm text-gray-400">
      <span>{uploadProgress}%</span>
      <span>{estimatedTimeRemaining}</span>
    </div>
  </div>
)}
```

---

### 3. **Video Compression Before Upload**

**Implementation:**
```javascript
// frontend/src/utils/videoCompression.js
import { FFmpeg } from '@ffmpeg/ffmpeg';

export const compressVideo = async (file, onProgress) => {
  const ffmpeg = new FFmpeg();
  await ffmpeg.load();

  ffmpeg.on('progress', ({ progress }) => {
    onProgress(progress * 100);
  });

  // Write file to FFmpeg's virtual filesystem
  await ffmpeg.writeFile('input.mp4', await file.arrayBuffer());

  // Compress: 720p, H.264, reduce bitrate
  await ffmpeg.exec([
    '-i', 'input.mp4',
    '-vf', 'scale=-2:720', // 720p (maintains aspect ratio)
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '28', // Compression level (18-28, higher = smaller)
    '-c:a', 'aac',
    '-b:a', '128k',
    'output.mp4'
  ]);

  // Read compressed file
  const data = await ffmpeg.readFile('output.mp4');
  
  return new File(
    [data.buffer],
    file.name.replace(/\.\w+$/, '_compressed.mp4'),
    { type: 'video/mp4' }
  );
};
```

**Usage:**
```javascript
const handleFileUpload = async (files) => {
  const file = files[0];
  
  // Offer compression for large files
  if (file.size > 100 * 1024 * 1024) { // >100MB
    const compress = window.confirm(
      `File is ${(file.size / 1024 / 1024).toFixed(2)}MB. ` +
      `Compress to 720p before upload? (Faster upload, lower quality)`
    );
    
    if (compress) {
      setCompressing(true);
      const compressed = await compressVideo(file, setCompressionProgress);
      setCompressing(false);
      
      console.log(`Compressed: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressed.size / 1024 / 1024).toFixed(2)}MB`);
      file = compressed;
    }
  }
  
  // Continue with upload...
};
```

---

### 4. **Quality Presets for Users**

```jsx
// LeftSidebar.jsx
const [uploadQuality, setUploadQuality] = useState('original');

<div className="mb-4">
  <label className="text-white font-medium mb-2 block">Upload Quality</label>
  <select
    value={uploadQuality}
    onChange={(e) => setUploadQuality(e.target.value)}
    className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg"
  >
    <option value="original">Original (No compression)</option>
    <option value="high">High (1080p, ~500MB/hour)</option>
    <option value="medium">Medium (720p, ~300MB/hour) ⭐ Recommended</option>
    <option value="low">Low (480p, ~150MB/hour) 🌍 Best for slow networks</option>
  </select>
  <p className="text-gray-400 text-sm mt-1">
    Lower quality = faster upload, smaller file size
  </p>
</div>
```

---

### 5. **File Size Recommendations**

Update UI hints:
```jsx
<div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-3 mb-4">
  <p className="text-yellow-200 text-sm">
    📊 <strong>Recommended file sizes for Nigeria networks:</strong>
  </p>
  <ul className="text-yellow-200 text-sm mt-2 space-y-1">
    <li>• <strong>Short clips (1-5 min):</strong> Up to 50MB</li>
    <li>• <strong>Medium videos (5-15 min):</strong> 50-150MB</li>
    <li>• <strong>Long videos (15-30 min):</strong> 150-300MB</li>
    <li>• <strong>Movies/Full content:</strong> Use "Watch From" tab (screen share)</li>
  </ul>
</div>
```

---

## Implementation Priority

### Phase 1: Quick Wins (1-2 days)
1. ✅ **Cancel upload button** - Easy, immediate impact
2. ✅ **Better progress UI** - Speed, ETA, size uploaded
3. ✅ **File size warnings** - Educate users before upload
4. ✅ **Quality preset selector** - Let users choose compression

### Phase 2: Network Resilience (3-5 days)
1. ✅ **Chunked uploads** - 5MB chunks with retry logic
2. ✅ **Resume capability** - Continue after disconnect
3. ✅ **Tus protocol integration** - Battle-tested solution

### Phase 3: Advanced (1-2 weeks)
1. ✅ **Client-side compression** - FFmpeg.wasm for video compression
2. ✅ **Background uploads** - Continue upload if user navigates away
3. ✅ **Upload queue** - Multiple files with priorities

---

## Google Drive Alternative

If you still want Google Drive integration:

### Option 1: OAuth + Server Proxy (Complex)
```javascript
// Backend proxies authenticated requests
// Requires Google Cloud project, OAuth consent screen
// May violate Google Drive ToS for public streaming
```

### Option 2: Direct Download Link (Limited)
```javascript
// Only works for publicly shared files
// User must set "Anyone with link can view"
// Still has CORS issues for video embedding
```

### Option 3: Screen Share (Current, Best)
```javascript
// Already implemented in "Watch From" tab
// Works perfectly, zero config needed
// Legal, no ToS violations
```

**Recommendation:** Keep screen share approach. It's the most reliable and legal solution.

---

## Summary

### Current Issues:
- ❌ No cancel functionality
- ❌ No resume after disconnect
- ❌ Poor feedback on progress
- ❌ Large files timeout

### Recommended Solutions:
1. ✅ **Chunked uploads with Tus protocol** - Resume after disconnect
2. ✅ **Cancel button** - Stop uploads anytime
3. ✅ **Quality presets** - Let users choose compression
4. ✅ **Better progress UI** - Speed, ETA, size
5. ✅ **File size warnings** - Educate users

### Google Drive:
- **Why it failed:** CORS + Authentication required
- **How Rave does it:** Google Drive API with OAuth (complex, bandwidth costs)
- **Our solution:** Screen share via "Watch From" tab (simpler, legal, free)

Would you like me to implement any of these solutions? I'd recommend starting with:
1. Cancel upload button (15 minutes)
2. Better progress UI with speed/ETA (30 minutes)
3. File size warnings and quality selector (30 minutes)
4. Then move to chunked uploads with Tus (2-3 days)
