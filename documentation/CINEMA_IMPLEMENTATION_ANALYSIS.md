# 🎬 Cinema 3D Implementation - Detailed Code Analysis

## How Cinema 3D Handles Video Successfully

---

## **1. Video Element Creation (CinemaScene3DDemo.jsx)**

### **The Hidden Video Element:**
```javascript
// Line 106-107
const videoRef = useRef(null);
const fullscreenVideoRef = useRef(null);
```

### **Creating the Video Element:**
```javascript
// Lines 575-630: ONE video element for 3D screen
useEffect(() => {
  const video = videoRef.current;
  if (!video) return;

  // Clean up previous stream
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
  video.src = '';

  const isScreenMode = (isHost && localScreenTrack?.mediaStreamTrack) || 
                       (!isHost && remoteScreenTrack?.mediaStreamTrack);
  const isUploadMode = currentMedia?.type === 'upload' && currentMedia.mediaUrl;

  video.pause();

  if (isScreenMode) {
    // Screen sharing mode
    const track = isHost ? localScreenTrack.mediaStreamTrack : remoteScreenTrack.mediaStreamTrack;
    const stream = new MediaStream([track]);
    video.srcObject = stream;
    video.muted = isHost;
    video.play().catch(e => console.warn("Play failed (screen share):", e));
    
  } else if (isUploadMode) {
    // Uploaded media mode
    const newUrl = currentMedia.mediaUrl;
    video.srcObject = null;
    video.src = newUrl;        // ✅ Load from URL
    video.muted = false;       // ✅ Audio enabled
    video.load();
    video.play().catch(e => console.warn("Play failed (upload):", e));
    
  } else {
    // No media
    video.srcObject = null;
    video.src = '';
  }

  return () => {
    video.removeEventListener('timeupdate', updateTime);
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
  };
}, [currentMedia, isHost, localScreenTrack, remoteScreenTrack]);
```

**Key Points:**
- ✅ Creates ONE `<video>` element via ref
- ✅ Loads from `currentMedia.mediaUrl`
- ✅ Audio enabled (`muted = false`)
- ✅ Simple load → play
- ✅ No sync loop

---

## **2. Passing Video to 3D Scene (CinemaScene3DDemo.jsx)**

### **Passing to CinemaScene3D:**
```javascript
// Lines 1860-1862
<CinemaScene3D
  videoElement={videoRef.current}  // ✅ Pass the hidden video element
  currentUserSeat={currentSeat}
  isViewLocked={isViewLocked}
  lightsOn={lightsOn}
  // ... other props
/>
```

### **Inside CinemaScene3D (passes to CinemaTheaterGLB):**
```javascript
// CinemaScene3D.jsx - Lines 700-750 (approximate)
<CinemaTheaterGLB 
  position={glbModelPosition} 
  videoElement={videoElement}  // ✅ Pass through
/>
```

---

## **3. Rendering Video in 3D (CinemaTheaterGLB.jsx)**

### **Creating VideoTexture:**
```javascript
// Lines 1-86
export default function CinemaTheaterGLB({ position = [0, 0, 0], videoElement }) {
  const { scene } = useGLTF('/models/cinema.glb');
  const videoPlaneRef = useRef();
  const videoTextureRef = useRef();

  useEffect(() => {
    if (!videoElement || !scene) return;

    // 1. Create plane geometry for screen
    const width = 4.8;
    const height = width * (9 / 16);
    const geometry = new THREE.PlaneGeometry(width, height);
    
    // 2. Create video texture from the video element
    const videoTexture = new THREE.VideoTexture(videoElement);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.encoding = THREE.sRGBEncoding;

    // 3. Create material with video texture
    const material = new THREE.MeshBasicMaterial({
      map: videoTexture,
      side: THREE.DoubleSide,
      toneMapped: false
    });

    // 4. Create mesh and position it
    const plane = new THREE.Mesh(geometry, material);
    const worldPos = new THREE.Vector3(-3.49, 3.95, 2.26);
    const localPos = new THREE.Vector3();
    localPos.subVectors(worldPos, new THREE.Vector3(...position));
    plane.position.copy(localPos);
    plane.rotation.y = Math.PI;

    // 5. Add to scene
    scene.add(plane);
    videoPlaneRef.current = plane;
    videoTextureRef.current = videoTexture;

    // 6. Manual animation loop for stream support
    let frameId;
    const animate = () => {
      if (videoTextureRef.current && videoElement) {
        const isStream = videoElement.srcObject instanceof MediaStream;
        const isPlaying = !videoElement.paused && videoElement.currentTime > 0;

        if (isStream && isPlaying) {
          videoTextureRef.current.needsUpdate = true;
        }
      }
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    // 7. Cleanup
    return () => {
      cancelAnimationFrame(frameId);
      scene.remove(plane);
      geometry.dispose();
      material.dispose();
      videoTexture.dispose();
    };
  }, [videoElement, scene, position]);

  // 8. Update texture every frame (for video files)
  useFrame(() => {
    if (
      videoTextureRef.current &&
      videoElement &&
      !videoElement.paused &&
      videoElement.readyState >= 2
    ) {
      videoTextureRef.current.needsUpdate = true;
    }
  });

  return (
    <group position={position}>
      <primitive object={scene} />
    </group>
  );
}
```

**Key Points:**
- ✅ Uses `THREE.VideoTexture` to render video on 3D plane
- ✅ Updates texture every frame via `useFrame`
- ✅ Additional RAF loop for MediaStream support
- ✅ Video element is external - created elsewhere

---

## **4. Fullscreen Video Player (CinemaVideoPlayer.jsx)**

### **Complete Implementation:**
```javascript
// Lines 1-131
const CinemaVideoPlayer = forwardRef(function CinemaVideoPlayer({
  track,
  isHost,
  localScreenTrack,
  mediaItem,
  isPlaying,
  onPlay,
  onPause,
  onEnded,
  onError,
  muted = false,
}, ref) {
  const videoRef = useRef(null);

  useImperativeHandle(ref, () => videoRef.current, []);

  // Load media source
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let stream = null;

    // Option 1: Screen share via LiveKit
    if ((isHost && localScreenTrack?.mediaStreamTrack) || 
        (!isHost && track?.mediaStreamTrack)) {
      const mediaStreamTrack = isHost 
        ? localScreenTrack.mediaStreamTrack 
        : track.mediaStreamTrack;
      stream = new MediaStream([mediaStreamTrack]);
      video.srcObject = stream;
      video.muted = muted !== undefined ? muted : isHost;
      video.play().catch(onError);
      return () => {
        if (video.srcObject) {
          video.srcObject.getTracks().forEach(t => t.stop());
          video.srcObject = null;
        }
      };
    }

    // Option 2: Uploaded media file
    else if (mediaItem?.mediaUrl) {
      console.log('📁 [CinemaVideoPlayer] Loading uploaded media:', mediaItem.mediaUrl);
      video.srcObject = null;
      video.src = mediaItem.mediaUrl;  // ✅ Load independently
      video.muted = muted !== undefined ? muted : false;
      
      const handleLoadError = (e) => {
        console.error('❌ [CinemaVideoPlayer] Video load error:', {
          error: e.target.error,
          networkState: e.target.networkState,
          readyState: e.target.readyState,
          src: e.target.src
        });
      };
      video.addEventListener('error', handleLoadError, { once: true });
      video.load();
      return () => {
        video.removeEventListener('error', handleLoadError);
        video.pause();
        video.src = '';
      };
    }

    // Option 3: No media
    else {
      video.srcObject = null;
      video.src = '';
    }
  }, [track, localScreenTrack, isHost, mediaItem]);

  // Handle play/pause
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.src) return;
    
    const handleCanPlay = () => {
      if (isPlaying) {
        video.play().catch((err) => {
          if (!err.message.includes('interrupted by a call to pause')) {
            console.warn('⚠️ [CinemaVideoPlayer] Play failed:', err.message);
            if (onError) onError(err);
          }
        });
      }
    };
    
    if (isPlaying) {
      if (video.readyState >= 3) {
        video.play().catch((err) => {
          if (!err.message.includes('interrupted by a call to pause')) {
            console.warn('⚠️ [CinemaVideoPlayer] Play failed:', err.message);
            if (onError) onError(err);
          }
        });
      } else {
        video.addEventListener('canplay', handleCanPlay, { once: true });
      }
    } else {
      video.pause();
    }
    
    return () => {
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, [isPlaying, onError]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      crossOrigin="anonymous"
      muted={muted}
      className="w-full h-full object-contain bg-black"
      onPlay={onPlay}
      onPause={onPause}
      onEnded={onEnded}
      onError={onError}
      style={{ backgroundColor: '#000' }}
    />
  );
});
```

**Key Points:**
- ✅ Creates its OWN `<video>` element
- ✅ Loads from `mediaItem.mediaUrl` INDEPENDENTLY
- ✅ Simple play/pause control
- ✅ NO sync with 3D screen video
- ✅ No requestAnimationFrame loop

---

## **5. Fullscreen Usage (CinemaScene3DDemo.jsx)**

### **Rendering Fullscreen Player:**
```javascript
// Lines 2194-2209
{isImmersiveMode && (
  <div className="absolute inset-0 z-50 bg-black">
    <CinemaVideoPlayer
      ref={fullscreenVideoRef}
      mediaItem={currentMedia}       // ✅ Pass media object
      isHost={isHost}
      track={remoteScreenTrack}
      localScreenTrack={localScreenTrack}
      isPlaying={isPlaying}
      onPlay={() => setIsPlaying(true)}
      onPause={() => setIsPlaying(false)}
      onError={handleError}
      muted={true}                   // ✅ Muted in fullscreen
    />
  </div>
)}
```

---

## **📊 Architecture Summary**

```
┌─────────────────────────────────────────────────────────────────┐
│                   CinemaScene3DDemo.jsx                         │
│                                                                 │
│  1. Create hidden <video> element via videoRef                 │
│  2. Load media into it (currentMedia.mediaUrl)                 │
│  3. Pass videoRef.current to CinemaScene3D                     │
│                                                                 │
│  ┌──────────────────┐         ┌──────────────────┐            │
│  │ Hidden Video El  │         │ Fullscreen Player│            │
│  │ (3D Screen)      │         │ (CinemaVideoPlayer)│           │
│  │                  │         │                  │            │
│  │ videoRef.current │         │ Creates own video│            │
│  │ Loaded: URL A    │         │ Loads: URL A     │            │
│  └────────┬─────────┘         └────────┬─────────┘            │
│           │                            │                       │
│           ▼                            ▼                       │
│   ┌──────────────┐           ┌──────────────┐                │
│   │CinemaTheaterGLB│          │ <video> tag  │                │
│   │VideoTexture  │           │ Independent  │                │
│   └──────────────┘           └──────────────┘                │
│                                                                 │
│  ✅ Both load SAME URL independently                           │
│  ✅ NO synchronization                                         │
│  ✅ Natural timing alignment                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## **🎯 Key Insights for Lecture Hall Implementation**

### **What Cinema Does RIGHT:**

1. **Independent Video Loading**
   - 3D screen: Hidden `<video>` element created in parent
   - Fullscreen: Own `<video>` element created in CinemaVideoPlayer
   - Both load from same `mediaUrl` independently

2. **No Synchronization**
   - No requestAnimationFrame loop
   - No time checking
   - No seeking
   - Videos naturally stay in sync

3. **Simple State Management**
   ```javascript
   const [currentMedia, setCurrentMedia] = useState(null);
   const [isPlaying, setIsPlaying] = useState(false);
   ```

4. **Media Object Structure**
   ```javascript
   const mediaItemWithUrl = {
     ...media,
     type: 'upload',
     mediaUrl: "http://localhost:8080/uploads/file.mp4",  // ✅ KEY!
     original_name: "video.mp4"
   };
   setCurrentMedia(mediaItemWithUrl);
   ```

5. **Prop Passing**
   ```javascript
   // To 3D Scene
   <CinemaScene3D videoElement={videoRef.current} />
   
   // To Fullscreen
   <CinemaVideoPlayer 
     mediaItem={currentMedia}  // Has mediaUrl property
     isPlaying={isPlaying}
     muted={true}
   />
   ```

### **What Lecture Hall Does WRONG:**

1. **Media Object Structure**
   ```javascript
   const mediaState = {
     file_url: mediaUrl,
     url: mediaUrl,
     // ❌ Missing mediaUrl property!
   };
   ```

2. **Active Synchronization**
   ```javascript
   // ❌ Continuous sync loop causing issues
   const syncLoop = () => {
     const boardTime = boardVideo.currentTime;
     const fullscreenTime = video.currentTime;
     const timeDiff = Math.abs(fullscreenTime - boardTime);
     
     if (timeDiff > 0.3) {
       video.currentTime = boardTime;  // ❌ Seeking
     }
     
     rafId = requestAnimationFrame(syncLoop);  // ❌ Every frame
   };
   ```

3. **Props Mismatch**
   ```javascript
   <LectureHallVideoPlayer
     media={blackboardMedia}  // ❌ Different prop name
     boardVideoRef={boardVideoRef}  // ❌ Sync reference
     // Missing: track, localScreenTrack, isHost
   />
   ```

---

## **✅ How to Fix Lecture Hall**

### **Option 1: Use CinemaVideoPlayer Directly (Recommended)**
```javascript
// In PositionCalculatorPage.jsx
import CinemaVideoPlayer from '../components/cinema/ui/CinemaVideoPlayer';

// Set up media with mediaUrl property
const mediaState = {
  file_url: mediaUrl,
  url: mediaUrl,
  mediaUrl: mediaUrl,  // ✅ Add this!
  type: data.type,
  title: data.title || 'Media',
  playing: true
};

// Use CinemaVideoPlayer for fullscreen
{isMediaFullscreen && (
  <div className="fixed inset-0 z-50 bg-black">
    <CinemaVideoPlayer
      ref={fullscreenVideoRef}
      mediaItem={blackboardMedia}  // Now has mediaUrl
      isPlaying={blackboardMedia?.playing !== false}
      onError={(err) => console.error('Video error:', err)}
      muted={false}  // Audio enabled in fullscreen
    />
  </div>
)}
```

### **Option 2: Update LectureHallVideoPlayer to Match**
```javascript
// Remove sync loop
// Add mediaUrl support
// Match CinemaVideoPlayer interface
```

---

## **🎬 Summary**

**Cinema's Success Formula:**
1. ✅ ONE hidden video for 3D screen (created in parent)
2. ✅ ONE independent video for fullscreen (created in CinemaVideoPlayer)
3. ✅ Both load same `mediaUrl` independently
4. ✅ NO synchronization - natural alignment
5. ✅ Simple play/pause control
6. ✅ Consistent prop naming (`mediaItem.mediaUrl`)

**Apply this exact pattern to Lecture Hall and it will work!**
