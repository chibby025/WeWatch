# Fullscreen Video Debug Guide

## 🔍 What We're Debugging

You reported that fullscreen video playback is **choppy** compared to the smooth 3D cinema screen. This guide explains what debug logs to check and how to interpret them.

## 📊 Debug Logs Added

### 1. **Video Metadata Comparison**
**Location:** `CinemaVideoPlayer.jsx`
**Trigger:** When video metadata loads
**What to check:**
```
📊 [CinemaVideoPlayer] Video metadata loaded: {
  playerType: 'FULLSCREEN' or '3D_CINEMA_SCREEN',
  videoWidth: 1920,
  videoHeight: 1080,
  duration: 120.5,
  videoCodec: 'h264',
  playbackRate: 1,
  readyState: 4,
  networkState: 2,
  muted: true/false,
  volume: 1
}
```

**What to look for:**
- ✅ Both should have same `videoWidth`, `videoHeight`, `playbackRate`
- ❌ If different resolution → one is loading lower quality
- ❌ If different `playbackRate` → speed mismatch causing choppiness

---

### 2. **Frame Rate Monitoring**
**Location:** `CinemaTheaterGLB.jsx` (3D screen) and `CinemaScene3DDemo.jsx` (fullscreen)

#### 3D Cinema Screen FPS:
```
🎬 [3D SCREEN FPS] 60.0 fps | Video: 1920x1080 | readyState: 4
```
Logs every **5 seconds** (reduced verbosity)

#### Fullscreen Video FPS:
```
🎬 [FULLSCREEN FPS] 30 fps | readyState: 4 | buffered: 45.3s
```
Logs every **1 second** while playing

**What to look for:**
- ✅ Both should be ~60 fps (or ~30 fps for 30fps video)
- ❌ If fullscreen shows **15 fps or lower** → rendering issue
- ❌ If fullscreen shows **intermittent drops** (60→30→15) → buffering/decode issue

---

### 3. **Video Element Comparison**
**Location:** `CinemaScene3DDemo.jsx`
**Trigger:** When fullscreen mode activates
```
🔍 [FULLSCREEN DEBUG] Video element comparison: {
  fullscreenVideo: {
    videoWidth: 1920,
    videoHeight: 1080,
    readyState: 4,
    paused: false,
    playbackRate: 1,
    src: 'http://localhost:8080/uploads/temp/...'
  },
  cinemaVideo: {
    videoWidth: 1920,
    videoHeight: 1080,
    readyState: 4,
    paused: false,
    playbackRate: 1,
    src: 'http://localhost:8080/uploads/temp/...'
  },
  resolution_match: true,
  playback_rate_match: true
}
```

**What to look for:**
- ✅ `resolution_match: true` and `playback_rate_match: true`
- ❌ If `false` → videos are using different sources/settings

---

### 4. **CSS Rendering Properties**
**Location:** `CinemaVideoPlayer.jsx` and `CinemaScene3DDemo.jsx`

```
🎬 [CinemaVideoPlayer] Video element CSS: {
  playerType: 'FULLSCREEN',
  dimensions: '1920x1080',
  objectFit: 'contain',
  display: 'block',
  transform: 'none',
  willChange: 'auto'
}

🖼️ [FULLSCREEN CONTAINER] CSS properties: {
  width: 1920,
  height: 1080,
  display: 'block',
  position: 'absolute',
  zIndex: 50
}
```

**What to look for:**
- ✅ `objectFit: 'contain'` → video maintains aspect ratio without stretching
- ❌ If `objectFit: 'cover'` or `'fill'` → might cause quality issues
- ❌ If `transform: 'scale(...)'` → CSS scaling can reduce quality

---

### 5. **Playback Sync Issues**
```
🔄 [FULLSCREEN SYNC] Time drift detected: 0.45s | Syncing to 10.2s
▶️ [FULLSCREEN SYNC] Resuming fullscreen playback
⏸️ [FULLSCREEN SYNC] Pausing fullscreen playback
```

**What to look for:**
- ❌ Frequent time drift messages → constant re-syncing can cause stuttering
- ❌ Multiple play/pause cycles → browser fighting for playback control

---

## 🧪 Testing Steps

### 1. **Upload a video to 3D cinema**
   - Watch the video on the 3D cinema screen (smooth)
   - Open browser console

### 2. **Press 'F' key or click screen to enter fullscreen**
   - Observe choppiness
   - Check console for:
     - `📊 [CinemaVideoPlayer] Video metadata loaded` (both FULLSCREEN and 3D_CINEMA_SCREEN)
     - `🎬 [FULLSCREEN FPS]` (should be ~60 fps)
     - `🔍 [FULLSCREEN DEBUG] Video element comparison`

### 3. **Compare FPS between 3D and Fullscreen**
   - 3D screen: `🎬 [3D SCREEN FPS] 60.0 fps`
   - Fullscreen: `🎬 [FULLSCREEN FPS] 60 fps`
   - If mismatch → we found the issue!

---

## 🔧 Reduced Log Verbosity

### Before (every frame):
```
💾 [Playback Persistence] Saved state: {...}  // ~60 times/second
🎤 [useCinemaAudio] Mic active - 1.20% amplitude  // ~60 times/second
```

### After (reduced):
```
💾 [Playback Persistence] Saved state: {...}  // Every 5 seconds only
🎤 [useCinemaAudio] Mic active - 1.20% amplitude  // Every 5 seconds only
```

---

## 🎯 Likely Causes of Choppiness

### 1. **Double Rendering**
   - **Symptom:** Both video elements playing simultaneously
   - **Check:** Look for "Time drift detected" messages
   - **Fix:** Pause 3D cinema video when fullscreen is active

### 2. **Resolution Mismatch**
   - **Symptom:** Fullscreen loads lower quality version
   - **Check:** Compare `videoWidth` in metadata logs
   - **Fix:** Ensure both use same video source

### 3. **CSS Transform/Scaling**
   - **Symptom:** Browser scaling video in CSS (lower quality)
   - **Check:** `objectFit` and `transform` in CSS logs
   - **Fix:** Use `object-contain` and avoid CSS transforms

### 4. **Buffering Issues**
   - **Symptom:** Low FPS with low `buffered` value
   - **Check:** `🎬 [FULLSCREEN FPS]` shows `buffered: 2.1s` (should be higher)
   - **Fix:** Preload video properly or adjust buffer settings

### 5. **Hardware Acceleration**
   - **Symptom:** FPS drops on one player but not the other
   - **Check:** Browser DevTools → Rendering → "Show paint rectangles"
   - **Fix:** Ensure both use `will-change: 'transform'` or GPU acceleration

---

## 📋 Next Steps

1. **Refresh the page** and upload a video
2. **Play the video** on 3D cinema screen
3. **Press 'F' key** to enter fullscreen
4. **Copy all console logs** from the moment you press F
5. **Share logs** with the patterns above to identify the issue

---

## 💡 Quick Fixes to Try

If you identify the issue, here are quick fixes:

### Fix 1: Pause 3D video when fullscreen is active
```jsx
useEffect(() => {
  const cinemaVideo = videoRef.current;
  if (isImmersiveMode && cinemaVideo) {
    cinemaVideo.pause(); // Pause hidden 3D video to save resources
  } else if (!isImmersiveMode && cinemaVideo && isPlaying) {
    cinemaVideo.play();
  }
}, [isImmersiveMode, isPlaying]);
```

### Fix 2: Add hardware acceleration to fullscreen video
```jsx
<video
  className="w-full h-full object-contain bg-black"
  style={{ 
    backgroundColor: '#000',
    willChange: 'transform', // GPU acceleration hint
  }}
/>
```

### Fix 3: Use SharedArrayBuffer for smoother video decoding
Add to `index.html`:
```html
<meta http-equiv="Cross-Origin-Embedder-Policy" content="require-corp">
<meta http-equiv="Cross-Origin-Opener-Policy" content="same-origin">
```

---

## 🚨 Red Flags to Watch For

- ❌ Fullscreen FPS consistently below 30
- ❌ Frequent "Time drift detected" messages (>5 per minute)
- ❌ Different video resolutions between 3D and fullscreen
- ❌ Multiple video elements playing simultaneously
- ❌ `readyState < 4` (video not fully loaded)

If you see any of these, **share the logs** and we'll fix the root cause!
