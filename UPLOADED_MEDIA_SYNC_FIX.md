# Uploaded Media Sync Fix - Member Join Issues

## Problem Analysis

### Issues Reported
1. **Members not in sync** when joining mid-playback
2. **Media stops and replays** from beginning instead of continuing stream

### Root Causes

#### Issue 1: Unnecessary Video Reloads
**Location:** Line 772 in CinemaScene3DDemo.jsx

```javascript
video.src = mediaUrl; // ❌ Unconditional reload
```

**Problem:** Every time `currentMedia` changes (even if it's the same video), the video src is reset. This causes:
- Browser aborts current download/buffer
- New HTTP range request starts from position 0
- Video rebuffers from beginning
- Disrupts mid-stream playback

**Sequence:**
1. Member receives `playback_control` message
2. `setCurrentMedia` is called with same video
3. useEffect fires (line 723)
4. `video.src = mediaUrl` **reloads the entire video**
5. Previous buffer is lost
6. Video starts downloading from 0:00 again

#### Issue 2: Seek Before Load
**Location:** Lines 2547-2556 (playback_control handler)

```javascript
// ❌ OLD: Seek attempted BEFORE video loads
setCurrentMedia(...);  // Triggers useEffect
setIsPlaying(...);

if (videoRef.current && adjustedTime > 0) {
  videoRef.current.currentTime = adjustedTime; // ❌ Runs immediately
}
```

**Problem:** The seek happens BEFORE the useEffect loads the video:

**Incorrect Sequence:**
```
1. playback_control message received
2. Seek attempted (line 2544) ← Too early!
3. setCurrentMedia called
4. [React schedules re-render]
5. useEffect fires (line 723)
6. video.src is set ← Seek position lost!
7. Video loads from beginning
```

**Evidence from Logs:**
```
CinemaScene3DDemo.jsx:2520 ⏱️ Playback control received
CinemaScene3DDemo.jsx:2544 ✅ Seeked to adjusted time: 45.04  ← Happens first
CinemaScene3DDemo.jsx:754 🎬 Loading uploaded media: ...      ← Then loads
CinemaScene3DDemo.jsx:777 ✅ Video data loaded                ← Seek lost!
```

## Solutions Implemented

### Fix 1: Conditional Video Src Loading

**Changed:**
```javascript
// ✅ NEW: Only reload if src actually changed
const needsReload = video.src !== mediaUrl;
if (needsReload) {
  console.log('🔄 [Media Loading] Setting new video src:', mediaUrl);
  video.src = mediaUrl;
} else {
  console.log('✅ [Media Loading] Video already loaded, skipping src reload');
}
```

**Benefits:**
- Prevents unnecessary video reloads
- Maintains buffer when same video is playing
- Allows seamless mid-stream seeks
- Reduces bandwidth usage

### Fix 2: Pending Seek Architecture

**Added State:**
```javascript
const [pendingSeekTime, setPendingSeekTime] = useState(null);
```

**Modified playback_control Handler:**
```javascript
case "playback_control":
  // Calculate adjusted time with latency compensation
  const adjustedTime = (msg.seek_time || 0) + (latency / 1000);
  
  // 🎯 Store pending seek, don't apply yet
  setPendingSeekTime(adjustedTime);
  
  // Update media state (triggers useEffect)
  setCurrentMedia(...);
  setIsPlaying(msg.command === "play");
  // ❌ Removed immediate seek attempt
```

**Modified handleLoadedData:**
```javascript
const handleLoadedData = () => {
  console.log('✅ [Media Loading] Video data loaded');
  
  // 🎯 Apply pending seek AFTER video is ready
  if (pendingSeekTime !== null && pendingSeekTime > 0) {
    console.log(`🎯 Applying pending seek: ${pendingSeekTime}s`);
    video.currentTime = pendingSeekTime;
    setPendingSeekTime(null); // Clear after applying
  }
  
  if (isPlaying) {
    video.play().catch(err => console.error('Failed to play:', err));
  }
};
```

**Correct Sequence:**
```
1. playback_control message received
2. setPendingSeekTime(45.04) ← Store for later
3. setCurrentMedia(...) ← Triggers useEffect
4. [React re-renders]
5. useEffect fires
6. video.src checked (same? skip reload)
7. handleLoadedData fires
8. video.currentTime = 45.04 ← Applied at correct time!
9. video.play()
```

## How Uploaded Media Works

### Host Flow
1. **User selects media** from LeftSidebar
2. **Media loads** into `<video>` element (line 772)
3. **Host plays** video locally
4. **Periodic sync broadcast** every 30s (line 850):
   ```javascript
   sendMessage({
     type: "playback_control",
     command: "seek",
     seek_time: currentSeekTime,
     timestamp: Date.now()
   });
   ```

### Member Join Flow (FIXED)

#### On Join:
1. **Member connects** to WebSocket
2. **Request state** (500ms delay, line 692):
   ```javascript
   sendMessage({
     type: 'request_playback_state',
     requester_id: currentUser.id,
     timestamp: Date.now()
   });
   ```

3. **Host responds** (line 2482):
   ```javascript
   // Only host responds for upload media
   if (isHost && currentMedia.type === 'upload') {
     sendMessage({
       type: 'playback_control',
       command: isPlaying ? 'play' : 'pause',
       seek_time: videoRef.current.currentTime,
       timestamp: Date.now()
     });
   }
   ```

#### Member Receives Response:
1. **playback_control received** (line 2515)
2. **Latency compensation** calculated:
   ```javascript
   const latency = Date.now() - msg.timestamp;
   const adjustedTime = msg.seek_time + (latency / 1000);
   ```
3. **Store pending seek**: `setPendingSeekTime(adjustedTime)`
4. **Set media**: `setCurrentMedia({ mediaUrl, ... })`
5. **useEffect fires** (line 723)
6. **Check if reload needed**: `video.src !== mediaUrl`
7. **Load video** (only if new src)
8. **Apply seek** when ready (handleLoadedData)
9. **Start playback**

### Ongoing Sync

#### Host Periodic Updates (every 30s):
```javascript
setInterval(() => {
  sendMessage({
    type: "playback_control",
    command: "seek",
    seek_time: Math.floor(videoRef.current.currentTime)
  });
}, 30000);
```

#### Member Receives Updates:
- If **same video**: No reload, just seek to new time
- If **different video**: Reload src, then seek
- **Latency compensation** applied to all seeks

## What Members Need for Sync

### On Join:
1. ✅ **Media URL** (file_path + base URL)
2. ✅ **Current timestamp** (seek_time)
3. ✅ **Play/pause state** (command)
4. ✅ **Latency compensation** (timestamp diff)
5. ✅ **Media metadata** (ID, original_name)

### Continuous Sync:
1. ✅ **Periodic seek updates** (every 30s from host)
2. ✅ **HTTP range requests** (browser handles automatically)
3. ✅ **Same video element** (no unnecessary reloads)

## HTTP Range Requests (How Streaming Works)

### Browser Behavior:
```
Request 1: GET /video.mp4
           Range: bytes=0-1023
           
Response:  206 Partial Content
           Content-Range: bytes 0-1023/1048576

Request 2: GET /video.mp4
           Range: bytes=1024-2047
           
Response:  206 Partial Content
           Content-Range: bytes 1024-2047/1048576
```

### With Seek:
```javascript
video.currentTime = 45; // Jump to 45 seconds

Browser calculates byte offset:
offset = (45 seconds) × (bitrate) / 8

Request: GET /video.mp4
         Range: bytes=500000-501023  ← Starts from new position
```

### Why Reloading Breaks Streaming:
```
// ❌ OLD CODE
video.src = mediaUrl; // Reset src

// Browser:
1. Abort current downloads
2. Clear buffer
3. Reset playback position to 0
4. Start downloading from byte 0
5. Seek applied, but initial buffer lost
6. Results in stuttering/rebuffering
```

```
// ✅ NEW CODE
if (video.src !== mediaUrl) {
  video.src = mediaUrl; // Only reload if different
}

// Browser:
1. Keep current downloads active
2. Maintain buffer
3. New seek just requests different byte range
4. Smooth transition
```

## Testing the Fix

### Test Case 1: Member Joins Mid-Playback
**Steps:**
1. Host starts playing uploaded video
2. Let it play for ~30 seconds
3. Member joins the cinema session
4. Observe member's video position

**Expected:**
- ✅ Member sees video at ~30s (with latency compensation)
- ✅ Video continues playing smoothly
- ✅ No replay from beginning
- ✅ Console shows "Video already loaded, skipping src reload"

### Test Case 2: Periodic Sync Updates
**Steps:**
1. Both host and member watching
2. Wait for 30-second periodic update
3. Check member's console logs

**Expected:**
- ✅ Member receives playback_control
- ✅ Seek applied without reload (same src)
- ✅ Video continues smoothly
- ✅ Console: "Video already loaded, skipping src reload"

### Test Case 3: Different Video
**Steps:**
1. Host switches to different uploaded video
2. Member should receive new playback_control

**Expected:**
- ✅ Member loads new video (src changed)
- ✅ Console: "Setting new video src"
- ✅ Seeks to correct position after load
- ✅ Plays from host's current position

## Backend Behavior

### WebSocket Message Flow:
```
Member → Backend: request_playback_state
Backend → All in Room: request_playback_state (broadcast)
Host → Backend: playback_control (response)
Backend → Member: playback_control (delivered)
```

### HTTP Video Serving:
```go
// Backend serves video with range support
[GIN] 2026/02/07 - 21:19:19 | 206 | 96.820242ms | GET "/uploads/temp/video.mp4"
```

- **206 Partial Content**: Range requests supported ✅
- Browser automatically requests chunks as needed
- No backend changes required for this fix

## Key Improvements

### Before:
- ❌ Video reloaded on every state update
- ❌ Seek applied before video ready
- ❌ Members saw stuttering/replaying
- ❌ Unnecessary bandwidth usage

### After:
- ✅ Video reloaded only when src changes
- ✅ Seek applied after video ready
- ✅ Smooth mid-playback joins
- ✅ Efficient buffer management

## Additional Notes

### Why 500ms Delay for State Request?
```javascript
setTimeout(() => {
  sendMessage({ type: 'request_playback_state' });
}, 500);
```

- Gives host time to establish WebSocket connection
- Ensures session_status message is processed first
- Prevents race conditions

### Latency Compensation:
```javascript
const latency = Date.now() - msg.timestamp;
const adjustedTime = msg.seek_time + (latency / 1000);
```

**Example:**
- Host at 30.00s sends message (timestamp: T)
- Network delay: 200ms
- Member receives at T + 200ms
- Host now at ~30.20s
- **Adjusted seek**: 30.00 + 0.20 = 30.20s ✅

### Why Store Pending Seek in State?
- React state updates are asynchronous
- useEffect runs AFTER state updates complete
- pendingSeekTime ensures seek happens at right time
- Clean separation of concerns

## Files Modified
- `CinemaScene3DDemo.jsx`:
  - Added `pendingSeekTime` state (line 332)
  - Modified playback_control handler (line 2515)
  - Added conditional src reload (line 772)
  - Modified handleLoadedData (line 783)
  - Updated useEffect dependencies (line 837)
