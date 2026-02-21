# Cinema LiveShare Black Screen Fix

## Problem
Cinema LiveShare camera was showing a black screen despite successful LiveKit publishing. PositionCalculator LiveShare worked perfectly with the same setup.

## Root Cause
**Cinema reused existing video elements** created during component mount for LiveShare camera streams. These elements had `autoplay: true` already set, so when `srcObject` was changed to the LiveKit stream, the browser didn't trigger autoplay again (already fired once).

**PositionCalculator's BlackboardWithMedia** creates **fresh video elements** every time a new MediaStream is provided, ensuring autoplay works correctly.

## Comparison

### Before (Broken Approach)
```javascript
// Mount: Create video elements ONCE
useEffect(() => {
  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = false;
  document.body.appendChild(video);
  videoRef.current = video;
}, []);

// LiveShare: Reuse existing element
if (videoRef.current) {
  videoRef.current.srcObject = cameraStream; // ❌ Autoplay won't fire again!
  setTimeout(() => videoRef.current.play(), 100); // ❌ Doesn't fix the issue
}
```

### After (Working Approach - Like PositionCalculator)
```javascript
// LiveShare: Create FRESH video element
const video = document.createElement('video');
video.srcObject = cameraStream;
video.autoplay = true; // ✅ Fresh element, autoplay will trigger
video.playsInline = true;
video.muted = true;
video.style.cssText = 'position: absolute; width: 1px; height: 1px; opacity: 0;';
document.body.appendChild(video);
liveShareVideoRef.current = video; // ✅ Store separately

video.play().catch(err => console.warn('Play failed:', err));
```

## Changes Made

### 1. Added New Refs for LiveShare Video Elements
```javascript
const liveShareVideoRef = useRef(null); // Main screen LiveShare video
const liveShareCameraVideoRef = useRef(null); // PIP LiveShare camera
```

### 2. Updated `handleStartLiveShare` - Create Fresh Video Elements
```javascript
// ✅ CREATE FRESH VIDEO ELEMENTS (like PositionCalculator BlackboardWithMedia)
if (mode === 'camera') {
  const video = document.createElement('video');
  video.srcObject = cameraStream;
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.style.cssText = 'position: absolute; width: 1px; height: 1px; opacity: 0;';
  document.body.appendChild(video);
  liveShareVideoRef.current = video;
  
  video.play().catch(err => console.warn('Play failed:', err));
}
```

### 3. Updated `handleEndLiveShare` - Clean Up LiveShare Elements
```javascript
// ✅ Clean up LiveShare video elements
if (liveShareVideoRef.current) {
  liveShareVideoRef.current.pause();
  liveShareVideoRef.current.srcObject = null;
  if (document.body.contains(liveShareVideoRef.current)) {
    document.body.removeChild(liveShareVideoRef.current);
  }
  liveShareVideoRef.current = null;
}
```

### 4. Updated CinemaScene3D Props - Use Correct Video Element
```javascript
<CinemaScene3D
  videoElement={liveShareVideoRef.current || videoRef.current} // ✅ Prioritize LiveShare
  cameraVideoElement={liveShareCameraVideoRef.current || cameraVideoRef.current}
  // ... other props
/>
```

## Why This Fixes The Issue

1. **Fresh autoplay**: New video elements trigger autoplay properly
2. **Clean separation**: LiveShare videos don't interfere with regular video playback
3. **Proper cleanup**: Old LiveShare elements are removed when session ends
4. **3D texture sync**: CinemaScene3D receives the correct video element reference

## Testing
1. Start Cinema room
2. Click "Start LiveShare" → "Camera Only"
3. **Expected**: Camera displays in cinema screen (not black)
4. Click "End LiveShare"
5. **Expected**: Clean transition back to normal state

## Architecture Lesson
**PositionCalculator's BlackboardWithMedia** uses React component lifecycle to manage video elements:
- Creates fresh elements when media changes
- Properly handles cleanup
- Separates concerns (component manages its own video lifecycle)

**Cinema should consider**:
- Creating a `CinemaVideoPlayer` component similar to `BlackboardWithMedia`
- Moving video element management to component lifecycle
- Reducing imperative DOM manipulation in favor of React patterns
