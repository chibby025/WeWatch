# LiveShare Screen Share Flow - 3D Cinema

## Overview
Screen sharing in 3D Cinema uses **LiveKit** for real-time video streaming. The host captures their screen and publishes it via LiveKit, while members subscribe to receive the video feed.

---

## Host Flow (Publishing)

### 1. User Clicks "Screen Share" in LeftSidebar
**File**: `LeftSidebar.jsx` (Line ~537)
```javascript
onStartScreenShare('screen', 'liveshare');
```

### 2. CinemaScene3DDemo Handles Start
**File**: `CinemaScene3DDemo.jsx` (Lines 3071-3289) - `handleStartLiveShare`

**Step 2a: Capture Screen**
```javascript
const screenStream = await navigator.mediaDevices.getDisplayMedia({
  video: { cursor: "always" },
  audio: false
});
```

**Step 2b: Publish to LiveKit**
```javascript
// Extract video track
const screenTrack = screenStream.getVideoTracks()[0];

// Create LocalVideoTrack
const localTrack = new LocalVideoTrack(screenTrack, {
  name: 'screen-share'
});

// Publish with ScreenShare source
await localParticipant.publishTrack(localTrack, {
  source: Track.Source.ScreenShare  // 🔑 KEY: This marks it as screen share
});

// Store reference
setLocalScreenTrack(localTrack);
```

**Step 2c: Create Local Video Element**
```javascript
const videoElement = document.createElement('video');
videoElement.srcObject = screenStream;
videoElement.muted = true;
videoElement.autoplay = true;
await videoElement.play();
```

**Step 2d: Update State**
```javascript
setCurrentMedia({
  stream: screenStream,
  type: 'liveshare',
  source: 'liveshare',
  mediaUrl: null  // No URL for LiveShare
});
```

**Step 2e: Send WebSocket Message**
```javascript
sendMessage({
  type: 'update_room_status',
  data: {
    is_screen_sharing: true,
    screen_sharing_user_id: currentUser.id,
    currently_playing: 'Live sharing screen',
    coming_next: ''
  }
});
```

---

## Member Flow (Subscribing)

### 3. LiveKit Detects Remote Track Publication
**File**: `CinemaScene3DDemo.jsx` (Lines 1769-1822)

**Step 3a: Room Events Listen**
```javascript
room.on(RoomEvent.TrackPublished, handleTrackPublished);
room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
room.on(RoomEvent.TrackUnpublished, handleTrackUnpublished);
```

**Step 3b: Track Published Event**
```javascript
const handleTrackPublished = (publication, participant) => {
  // Fired when host publishes screen share
  console.log('Track published:', publication.source); // 'screen_share'
  checkRemoteTracks();
};
```

**Step 3c: Track Subscribed Event** (Most Important!)
```javascript
const handleTrackSubscribed = (track, publication, participant) => {
  // Fired when member receives the actual video track
  console.log('Track subscribed:', {
    source: publication.source,  // 'screen_share'
    trackId: track.sid,
    enabled: track.isEnabled
  });
  checkRemoteTracks();
};
```

### 4. Detect and Store Remote Track
**File**: `CinemaScene3DDemo.jsx` (Lines ~1778-1820)

```javascript
const checkRemoteTracks = () => {
  // Get all remote participants
  const participants = Array.from(room.remoteParticipants.values());
  
  // Get all video track publications
  const allPubs = participants.flatMap(p => 
    Array.from(p.videoTrackPublications.values())
  );
  
  // Find screen share track (published with Track.Source.ScreenShare)
  const screenPub = allPubs.find(pub => 
    pub.source === Track.Source.ScreenShare
  );
  
  // Extract the actual track
  const screenTrack = screenPub?.track || null;
  
  // Store in state
  setRemoteScreenTrack(screenTrack); // 🔑 KEY: This triggers re-render
};
```

### 5. Pass Track to CinemaVideoPlayer
**File**: `CinemaScene3DDemo.jsx` (Line ~4015)

```javascript
<CinemaVideoPlayer
  ref={fullscreenVideoRef}
  mediaItem={currentMedia}
  isHost={isHost}
  track={remoteScreenTrack || remoteCameraTrack}  // 🔑 Pass remote track
  localScreenTrack={localScreenTrack}
  isPlaying={isPlaying}
  onPlay={() => setIsPlaying(true)}
  onPause={() => setIsPlaying(false)}
  onError={handleError}
  muted={true}
/>
```

### 6. CinemaVideoPlayer Renders Video
**File**: `CinemaVideoPlayer.jsx` (Lines 30-65)

```javascript
useEffect(() => {
  const video = videoRef.current;
  if (!video) return;
  
  // For members: Attach remote track
  if (!isHost && track?.mediaStreamTrack) {
    console.log('MEMBER: Attaching remote screen share');
    
    // Create MediaStream from LiveKit track
    const mediaStreamTrack = track.mediaStreamTrack;
    const stream = new MediaStream([mediaStreamTrack]);
    
    // Attach to <video> element
    video.srcObject = stream;
    video.muted = true;
    
    // Start playback
    video.play().catch(onError);
  }
}, [track, isHost]);
```

---

## Data Flow Diagram

```
HOST                                    MEMBER
-----                                   ------
1. Click "Screen Share"
   ↓
2. Capture screen (getUserDisplayMedia)
   ↓
3. Publish to LiveKit
   (Track.Source.ScreenShare)
   ↓
4. LiveKit Server  ───────────────────→ 5. TrackPublished event fires
   ↓                                    ↓
   ├─ Video data ─────────────────────→ 6. TrackSubscribed event fires
   ↓                                    ↓
                                        7. checkRemoteTracks() finds track
                                        ↓
                                        8. setRemoteScreenTrack(track)
                                        ↓
                                        9. Re-render with new track
                                        ↓
                                        10. CinemaVideoPlayer receives track
                                        ↓
                                        11. Attach track.mediaStreamTrack
                                        ↓
                                        12. video.srcObject = stream
                                        ↓
                                        13. video.play()
                                        ↓
                                        14. 🎬 Video displays on screen
```

---

## Key State Variables

### Host States
```javascript
const [localScreenTrack, setLocalScreenTrack] = useState(null);
// Contains: LocalVideoTrack published to LiveKit

const [currentMedia, setCurrentMedia] = useState(null);
// Contains: { stream, type: 'liveshare', source: 'liveshare' }
```

### Member States
```javascript
const [remoteScreenTrack, setRemoteScreenTrack] = useState(null);
// Contains: RemoteVideoTrack from LiveKit subscription

const [remoteCameraTrack, setRemoteCameraTrack] = useState(null);
// Contains: RemoteVideoTrack for camera-only mode
```

---

## LiveKit Track Sources

```javascript
Track.Source.ScreenShare  // Screen sharing (screen capture)
Track.Source.Camera       // Camera only (webcam)
Track.Source.Microphone   // Audio only
```

When publishing, the `source` parameter tells LiveKit what type of track it is, allowing members to filter and handle different track types appropriately.

---

## Common Issues & Debugging

### Issue: Member doesn't see screen share

**Check 1: Is track being published?**
```javascript
// Host console should show:
"✅ [LiveShare] Screen track acquired: TR_xxx"
```

**Check 2: Is member receiving TrackSubscribed event?**
```javascript
// Member console should show:
"🎬 [LIVESHARE MEMBER] Track subscribed: { source: 'screen_share', ... }"
```

**Check 3: Is track being stored in state?**
```javascript
// Member console should show:
"✅ [LIVESHARE MEMBER] Screen share track SET: { trackSid: 'TR_xxx', ... }"
```

**Check 4: Is track being passed to CinemaVideoPlayer?**
```javascript
// Member console should show:
"🎥 [LIVESHARE MEMBER] Passing track to CinemaVideoPlayer: { type: 'screen', ... }"
```

**Check 5: Is video element receiving track?**
```javascript
// Member console should show:
"🎬 [CinemaVideoPlayer LIVESHARE] MEMBER: Attaching track { trackId: 'xxx', ... }"
```

**Check 6: Is video playing?**
```javascript
// Member console should show:
"✅ [CinemaVideoPlayer LIVESHARE] MEMBER: Video playing { videoWidth: 1920, videoHeight: 1080 }"
```

### Issue: Video element is black

- **Check**: `track.mediaStreamTrack.readyState` should be `'live'`
- **Check**: `video.videoWidth` and `video.videoHeight` should be > 0
- **Check**: Browser autoplay policy (might need user interaction)
- **Check**: CORS issues if serving from different domain

---

## File Reference

### Main Files
1. **LeftSidebar.jsx** - UI for starting LiveShare
2. **CinemaScene3DDemo.jsx** - Main component
   - `handleStartLiveShare()` - Publish logic (host)
   - Remote track detection - Subscribe logic (member)
3. **CinemaVideoPlayer.jsx** - Video rendering
   - Handles both local and remote tracks
   - Creates MediaStream from LiveKit tracks

### State Flow
```
Host: capture → publish → localScreenTrack
Member: subscribe → remoteScreenTrack → CinemaVideoPlayer → video.srcObject
```

---

## Comparison: Upload vs LiveShare

### Upload (Works)
```javascript
// Direct file URL
video.src = "http://localhost:8080/uploads/video.mp4";
video.play();
```

### LiveShare (Real-time streaming)
```javascript
// MediaStream from LiveKit
const stream = new MediaStream([track.mediaStreamTrack]);
video.srcObject = stream;
video.play();
```

**Key Difference**: LiveShare uses `srcObject` (stream) instead of `src` (URL).

---

## Next Steps for Debugging

1. Check member console for all `[LIVESHARE MEMBER]` logs
2. Verify `TrackSubscribed` event fires
3. Confirm `remoteScreenTrack` state is set
4. Check if track has valid `mediaStreamTrack`
5. Verify video element dimensions (not 0x0)
6. Test browser autoplay permissions
