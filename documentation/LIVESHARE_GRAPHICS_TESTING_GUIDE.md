# LiveShare Graphics System - Testing Guide

## ✅ Implementation Complete (March 26, 2026)

The LiveShare graphics system is now fully integrated across both VideoWatch and 3D Cinema environments. All graphics controls broadcast in real-time to all viewers via WebSocket.

---

## 🎨 What Was Implemented

### **Core Integration**
1. **GraphicsRenderer.js** - Canvas-based overlay renderer (60fps)
2. **VideoWatch.jsx** - Graphics canvas + WebSocket listener
3. **CinemaScene3DDemo.jsx** - Graphics canvas + WebSocket listener  
4. **LiveShareManager.jsx** - WebSocket broadcasting for all graphics

### **Supported Graphics Types**
- ✅ **Lower Third** - Name/title banner (bottom-left)
- ✅ **Logo Bug** - Corner watermark (top-right)
- ✅ **Media Queue** - Images overlay (center, fullscreen)
- 🚧 **Ticker** - Scrolling headlines (backend ready, UI pending)
- 🚧 **Banner** - Breaking news bar (backend ready, UI pending)

---

## 🧪 Testing Instructions

### **Setup: Start LiveShare Session**

1. **Navigate to any room as HOST**
   ```
   http://localhost:5173/room/YOUR_ROOM_ID
   ```

2. **Open LiveShare Tab**
   - Click hamburger menu (top-left)
   - Select "LiveShare" tab

3. **Select Podcast Mode**
   - Click "Podcast" mode button
   - Enter title: "My Tech Podcast"
   - Upload logo image (<500KB)
   - Select guest (optional)
   - Click "Start Podcast"

4. **Choose Share Type**
   - Select "Camera Only" (easiest for testing)
   - Allow camera access
   - Camera should appear fullscreen

---

## 📋 Test Cases

### **Test 1: Lower Third Banner**

**What to test:** Name/title banner appears at bottom-left

**Steps:**
1. Scroll down in LiveShare tab to "Graphics Controls"
2. Enter Name: "John Doe"
3. Enter Title: "Software Engineer"
4. Click "Toggle Lower Third" button

**Expected Result:**
- Blue banner appears at bottom-left corner
- Shows name "John Doe" (bold, large)
- Shows title "Software Engineer" (smaller, below name)
- Red accent bar on left edge

**Multi-Viewer Test:**
- Open same room in incognito window (as viewer)
- Toggle lower third as host
- Viewer should see banner appear/disappear instantly

---

### **Test 2: Logo Bug Watermark**

**What to test:** Corner watermark logo displays

**Steps:**
1. In "Graphics Controls" section
2. Click "Upload Logo Bug" button
3. Select small image (<500KB recommended)
4. Wait for upload

**Expected Result:**
- Logo appears in top-right corner
- Stays visible throughout stream
- Scales appropriately (not too large)
- Semi-transparent (doesn't obstruct main content)

**Multi-Viewer Test:**
- Viewer should see logo appear immediately after upload

---

### **Test 3: Media Queue (Images)**

**What to test:** Queued images display on demand

**Steps:**
1. In "Media Queue" section
2. Click "Upload Media" button
3. Select 1-2 images (<5MB each)
4. Wait for uploads to complete
5. Click "Play" button on an image

**Expected Result:**
- Image displays fullscreen with dark overlay
- Centered on screen
- Scaled to fit (maintains aspect ratio)
- Other viewers see image simultaneously

**Known Limitations:**
- Video playback not yet implemented (images only)
- Max 5 items in queue
- Image persists until manually cleared

---

### **Test 4: Graphics Sync Across Viewers**

**What to test:** Real-time synchronization

**Setup:**
1. Host window: Start podcast + enable camera
2. Viewer window: Open same room in incognito mode

**Steps:**
1. As HOST: Toggle lower third ON
2. As VIEWER: Confirm banner appears
3. As HOST: Upload logo bug
4. As VIEWER: Confirm logo appears
5. As HOST: Play queued image
6. As VIEWER: Confirm image displays
7. As HOST: Toggle lower third OFF
8. As VIEWER: Confirm banner disappears

**Expected Result:**
- All graphics changes appear on viewer within 100-500ms
- No page refresh needed
- Graphics layer smoothly over video feed

---

### **Test 5: Graphics in 3D Cinema**

**What to test:** Graphics work in 3D environment

**Steps:**
1. Create/join a 3D Cinema room
2. Click "Enter 3D Cinema" button
3. Once inside 3D theater, start LiveShare podcast
4. Toggle lower third, upload logo bug
5. Exit fullscreen, re-enter

**Expected Result:**
- Graphics render correctly in 3D environment
- Canvas overlay appears above WebGL canvas
- Graphics persist when toggling fullscreen
- No Z-index conflicts with 3D scene

---

## 🐛 Debugging

### **Console Logs to Check**

**VideoWatch initialization:**
```
🎨 [VideoWatch] Initializing GraphicsRenderer
```

**Graphics update received:**
```
🎨 [VideoWatch] Graphics update received: { type: "lower_third", active: true, ... }
```

**LiveShareManager broadcast:**
```
🎨 [LiveShareManager] Lower third update broadcast: { ... }
```

**3D Cinema initialization:**
```
🎨 [CinemaScene3D] Initializing GraphicsRenderer
```

### **Common Issues**

**Graphics don't appear:**
- Check browser console for errors
- Verify LiveShare mode is NOT 'regular' (graphics disabled in regular mode)
- Ensure WebSocket connection is established
- Check canvas element exists in DOM

**Graphics lag/delay:**
- Network latency (normal: 100-500ms)
- Check WebSocket messages in Network tab
- Verify render loop is running (60fps)

**Logo bug doesn't show after upload:**
- Check file size (<500KB)
- Verify upload succeeded (green toast message)
- Check backend logs for upload errors
- Ensure `sendMessage` prop passed to LiveShareManager

---

## 🔍 Advanced Testing

### **Performance Test**

**Scenario:** Multiple graphics active simultaneously

**Steps:**
1. Enable lower third
2. Upload logo bug
3. Play queued image
4. Monitor FPS in browser DevTools

**Expected:**
- Render loop maintains 60fps
- No dropped frames
- Canvas size: 1920x1080
- CPU usage: <10% increase

### **Stress Test**

**Scenario:** Rapid graphics toggling

**Steps:**
1. Toggle lower third ON/OFF rapidly (10 times)
2. Upload 5 images to media queue quickly
3. Play/stop images in rapid succession

**Expected:**
- No memory leaks
- All updates render correctly
- No duplicate layers
- Canvas clears properly between changes

---

## 📊 Implementation Status

| Feature | Backend | UI Controls | Rendering | Broadcasting | Status |
|---------|---------|-------------|-----------|--------------|--------|
| Lower Third | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Logo Bug | ✅ | ✅ | ✅ | ✅ | **COMPLETE** |
| Media Queue | ✅ | ✅ | ✅ (images) | ✅ | **COMPLETE** |
| Ticker | ✅ | ❌ | ✅ | ❌ | 60% |
| Banner | ✅ | ❌ | ✅ | ❌ | 60% |
| Layout Selector | ❌ | ❌ | ❌ | ❌ | 0% |

---

## 🚀 Next Steps (Future Enhancements)

1. **Ticker/Headlines UI** (Task 5)
   - Add input field in LiveShareManager
   - Wire to existing `renderTicker()` function
   - Test scrolling animation

2. **Banner UI** (Task 5)
   - Add banner text input + toggle button
   - Wire to existing `renderBanner()` function
   - Test breaking news display

3. **Layout Selector Modal** (Task 6)
   - 6 layout options: fullscreen camera, fullscreen screen, split 50/50, PIP screen, PIP camera, news anchor
   - Modal appears after type selection
   - Apply CSS transforms to video elements

4. **Video Queue Playback**
   - Replace canvas approach with `<video>` element overlay
   - Add playback controls (play/pause/stop)
   - Sync video timing across viewers

5. **Theme Customization**
   - Color picker for lower third background
   - Font selection for text overlays
   - Size/position adjustments for logo bug

---

## 📝 Technical Details

### **Architecture**

```
Host clicks "Toggle Lower Third" in LiveShareManager
    ↓
1. State updates (lowerThirdActive = true)
    ↓
2. REST API saves to database (persistence)
    ↓
3. WebSocket broadcasts: { type: 'liveshare_graphics_update', data: { graphic } }
    ↓
4. All viewers receive message (VideoWatch/CinemaScene3D useEffect)
    ↓
5. GraphicsRenderer.addLayer() called
    ↓
6. Render loop draws graphic on canvas at 60fps
    ↓
7. Lower third appears over video for all viewers! 🎉
```

### **File Locations**

- **Renderer**: `frontend/src/utils/GraphicsRenderer.js`
- **VideoWatch Integration**: `frontend/src/components/cinema/VideoWatch.jsx` (lines 44, 365-367, 467-520, 3692-3700)
- **3D Cinema Integration**: `frontend/src/components/cinema/3d-cinema/CinemaScene3DDemo.jsx` (lines 48, 681-683, 1917-1970, 6188-6194)
- **Controls**: `frontend/src/components/cinema/ui/LiveShareManager.jsx` (lines 42, 283-337, 406-441, 390-428)
- **Backend API**: `backend/internal/handlers/liveshare_handlers.go`

### **WebSocket Message Format**

```json
{
  "type": "liveshare_graphics_update",
  "data": {
    "graphic": {
      "type": "lower_third",
      "content": {
        "name": "John Doe",
        "title": "Software Engineer"
      },
      "position": "bottom-left",
      "active": true,
      "z_index": 10
    }
  }
}
```

---

## ✅ Sign-Off

**Implementation Date:** March 26, 2026  
**Developer:** GitHub Copilot  
**Status:** Core functionality complete, ready for testing  
**Next Milestone:** Add ticker/banner UI controls (Task 5)

---

**Questions or Issues?** Check browser console for detailed logs with 🎨 emoji prefix.
