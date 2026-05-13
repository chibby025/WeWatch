# LiveShare & VideoWatch End-to-End Testing Guide
**Date**: May 8, 2026  
**Status**: Pre-Withdrawal Testing - Final Phase  
**Platform**: LetsWatchOut

---

## 🎯 Testing Objective

Complete end-to-end testing of LiveShare and VideoWatch systems before proceeding to withdrawal testing. This is the final validation phase for core platform functionality.

---

## ✅ System Status Check (Pre-Test)

### **Infrastructure Verified:**
- ✅ **LiveKit Server**: Running on `localhost:7880` (Docker container: `bold_nash`)
- ✅ **Backend Go Server**: Running on `localhost:8080`
- ✅ **Frontend Dev Server**: Vite running (React app)
- ✅ **Database**: PostgreSQL connected
- ✅ **WebSocket**: Real-time messaging operational

### **LiveKit Configuration:**
```yaml
# livekit.yaml
Port: 7880
API Key: dev-key
WebRTC Ports: 50000-50100
Max Participants: 100
Empty Timeout: 300s
```

### **Environment Variables Required:**
```bash
# Backend (.env)
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=dev-key
LIVEKIT_API_SECRET=a77cf9f63f8e47f9fdd9d1550e129731
DATABASE_URL=postgresql://...
```

---

## 📋 Testing Scope

### **1. VideoWatch Core Features**
- [ ] Session creation (host)
- [ ] Session joining (guests)
- [ ] Video playback sync
- [ ] Pause/resume sync
- [ ] Seek sync
- [ ] Playlist management
- [ ] Media upload
- [ ] WebSocket real-time messages

### **2. LiveShare System (5 Modes)**
- [ ] **Regular Mode**: Basic camera/screen sharing
- [ ] **Podcast Mode**: Title + logo + guest support
- [ ] **Church Mode**: Bible verse overlay + presentation mode
- [ ] **Show Mode**: Branded studio setup with guest
- [ ] **News Mode**: Solo anchor with lower thirds

### **3. LiveKit Audio/Video**
- [ ] Camera track publishing
- [ ] Screen share track publishing
- [ ] Audio track publishing
- [ ] Remote participant video rendering
- [ ] Remote participant audio playback
- [ ] Track mute/unmute
- [ ] Device switching (camera/mic)

### **4. LiveShare Features**
- [ ] Mode selection wizard
- [ ] Share type selection (camera/screen/both)
- [ ] Layout selection (solo/split/screen-share)
- [ ] Guest invitation
- [ ] Guest permission grant/revoke
- [ ] Guest kick functionality
- [ ] Graphics overlays (lower third, banner, ticker)
- [ ] Break mode (pause/resume)
- [ ] Mute all members toggle

---

## 🧪 Test Plan

### **Phase 1: VideoWatch Basic Flow (30 minutes)**

#### **Test 1.1: Host Creates Session**
**Steps:**
1. Navigate to `/room/:roomId`
2. Click "Create Watch Session"
3. Select privacy (Public/Private)
4. Upload media file OR use instant watch
5. Click "Start Session"

**Expected Results:**
- ✅ Session created successfully
- ✅ Redirected to `/room/:roomId/cinema/:sessionId`
- ✅ Video player loads
- ✅ Media plays immediately (if instant watch)
- ✅ Taskbar appears with host controls
- ✅ LeftSidebar shows upload/liveshare/watchfrom tabs

**Verification:**
```javascript
// Console logs to watch:
console.log("✅ Session created:", sessionId);
console.log("✅ WebSocket connected");
console.log("✅ LiveKit room joined:", roomId);
```

---

#### **Test 1.2: Guest Joins Session**
**Steps:**
1. Open new incognito browser (or different account)
2. Navigate to `/room/:roomId`
3. See active session in RoomPageNew
4. Click "Join Session"

**Expected Results:**
- ✅ Redirected to VideoWatch page
- ✅ Video sync with host (same timestamp)
- ✅ Chat visible
- ✅ LiveKit audio connection established
- ✅ Guest sees host's video if LiveShare active

**Verification:**
```javascript
// Guest console logs:
console.log("✅ Joined session:", sessionId);
console.log("✅ Current time synced:", videoRef.current.currentTime);
console.log("✅ LiveKit connected:", isLiveKitConnected);
```

---

#### **Test 1.3: Video Sync (Host Controls)**
**Steps:**
1. Host pauses video
2. Guest should auto-pause
3. Host seeks to 1:30
4. Guest should jump to 1:30
5. Host resumes
6. Guest should auto-resume

**Expected Results:**
- ✅ All actions sync within 200ms
- ✅ WebSocket messages broadcast correctly
- ✅ No desync between host/guest

**Debug Commands:**
```javascript
// In browser console (both host/guest):
console.log("Current time:", videoRef.current.currentTime);
console.log("Is playing:", !videoRef.current.paused);
```

---

### **Phase 2: LiveShare Regular Mode (45 minutes)**

#### **Test 2.1: Host Starts LiveShare (Camera Only)**
**Steps:**
1. Host in active session
2. Click LeftSidebar → "LiveShare" tab
3. Click "Start LiveShare"
4. LiveShareWizard opens:
   - **Step 1 (Mode)**: Select "Regular"
   - **Step 2 (Share Type)**: Select "Camera Only"
   - Allow camera permission
   - Select camera device
   - **Step 3 (Layout)**: Select "Solo View"
5. Click "Complete"

**Expected Results:**
- ✅ Camera preview shows in wizard
- ✅ LiveKit track publishes successfully
- ✅ `liveShareMode` state set to "regular"
- ✅ `onLiveShareModeSelect('regular', 'camera')` called
- ✅ WebSocket broadcasts `liveshare_mode_selected` message
- ✅ GraphicsRenderer initializes (even if no overlays yet)
- ✅ Host sees own camera in VideoTiles
- ✅ Guest sees host's camera in VideoTiles

**Verification:**
```javascript
// Host console:
console.log("✅ LiveShare mode:", liveShareMode); // 'regular'
console.log("✅ LiveKit tracks published:", localParticipant.tracks.size);
console.log("✅ Camera track:", localParticipant.getTrack(Track.Source.Camera));

// Guest console:
console.log("✅ Remote participants:", remoteParticipants.length); // Should be 1+
console.log("✅ Host video track:", remoteParticipant.getTrack(Track.Source.Camera));
```

---

#### **Test 2.2: Host Switches to Screen Share**
**Steps:**
1. In LiveShare tab, click "Switch Type" button
2. Select "Screen Only"
3. Allow screen share permission
4. Select window/screen to share

**Expected Results:**
- ✅ Camera track unpublished
- ✅ Screen track published
- ✅ WebSocket broadcasts `liveshare_type_selected` with `share_type: 'screen'`
- ✅ Guest sees screen share (NOT camera anymore)
- ✅ Layout auto-switches to "Screen Share" if applicable

**Verification:**
```javascript
// Host console:
console.log("✅ Screen track:", localParticipant.getTrack(Track.Source.ScreenShare));
console.log("✅ Camera track removed:", !localParticipant.getTrack(Track.Source.Camera));

// Guest console:
console.log("✅ Remote screen track visible");
```

---

#### **Test 2.3: Host Switches to Both (Screen + Camera PIP)**
**Steps:**
1. Click "Switch Type" → "Screen + Camera"
2. Allow both permissions

**Expected Results:**
- ✅ Both tracks published simultaneously
- ✅ Guest sees split-view (screen + camera PIP)
- ✅ Layout auto-switches to "Split View"

**Verification:**
```javascript
// Host console:
console.log("✅ Camera track:", localParticipant.getTrack(Track.Source.Camera));
console.log("✅ Screen track:", localParticipant.getTrack(Track.Source.ScreenShare));
console.log("✅ Total published tracks:", localParticipant.tracks.size); // Should be 2+
```

---

### **Phase 3: LiveShare Podcast Mode (60 minutes)**

#### **Test 3.1: Host Starts Podcast with Setup**
**Steps:**
1. End previous LiveShare (if active)
2. Click "Start LiveShare" → LiveShareWizard
3. **Step 1 (Mode)**: Select "Podcast"
4. **Step 2 (Setup)**:
   - Enter title: "The DevOps Podcast"
   - Upload logo image (PNG/JPG)
   - Customize title color: `#FF6B9D` (pink)
   - Title size: `28px`
   - Title weight: `Bold (700)`
   - Logo size: `120px`
   - Logo position: `X: 20, Y: 85`
   - **Guest**: Select a member from dropdown
   - **Mute All Members**: Toggle ON
5. **Step 3 (Share Type)**: Select "Camera Only"
6. **Step 4 (Layout)**: Select "Split View" (host + guest)
7. Click "Complete"

**Expected Results:**
- ✅ WebSocket sends `liveshare_mode_selected`:
  ```json
  {
    "type": "liveshare_mode_selected",
    "mode": "podcast",
    "layout": "split-view",
    "config": {
      "title": "The DevOps Podcast",
      "logo_url": "http://localhost:8080/uploads/liveshare/...",
      "guest_id": 123,
      "title_style": { "color": "#FF6B9D", "size": 28, ... },
      "logo_style": { "size": 120, "x": 20, "y": 85 }
    }
  }
  ```
- ✅ Guest receives permission grant notification
- ✅ All non-guest members muted (WebSocket `mute_all_members_liveshare` sent)
- ✅ GraphicsRenderer renders title + logo overlay on canvas
- ✅ Host + guest appear in split-view layout

**Verification:**
```javascript
// Host console:
console.log("✅ LiveShare mode:", liveShareMode); // 'podcast'
console.log("✅ Podcast config:", podcastConfig); // Title, logo, guest, styling
console.log("✅ GraphicsRenderer active:", !!graphicsRendererRef.current);
console.log("✅ Canvas overlay visible:", document.querySelector('canvas[data-graphics-layer]'));

// Selected guest console:
console.log("✅ Permission granted:", hasLiveSharePermission); // true
console.log("✅ Can join LiveShare");

// Other members console:
console.log("✅ Muted by host:", isMutedByLiveShare); // true (if implemented)
```

---

#### **Test 3.2: Guest Joins Podcast**
**Steps:**
1. Guest (invited member) clicks "Join LiveShare" button
2. Guest wizard opens:
   - **Step 1 (Share Type)**: Select "Camera Only"
   - Allow camera permission
   - **Step 2 (Layout)**: Auto-selected "Split View"
3. Click "Complete"

**Expected Results:**
- ✅ WebSocket sends `liveshare_guest_join`:
  ```json
  {
    "type": "liveshare_guest_join",
    "share_type": "camera"
  }
  ```
- ✅ Guest's camera track publishes to LiveKit
- ✅ Host sees guest's video in split-view
- ✅ All viewers see both host + guest
- ✅ Title + logo overlay persists

**Verification:**
```javascript
// Guest console:
console.log("✅ LiveShare guest active:", isGuest); // true
console.log("✅ Guest share type:", guestShareType); // 'camera'
console.log("✅ LiveKit track published:", localParticipant.getTrack(Track.Source.Camera));

// Host console:
console.log("✅ Active guest:", liveShareGuest); // { id, user_id, status: 'active' }
console.log("✅ Remote participants:", remoteParticipants.length); // Should include guest
```

---

#### **Test 3.3: Host Adds Lower Third Graphic**
**Steps:**
1. Host opens "Studio Controls" (if visible in LiveShare tab)
2. Click "Add Lower Third"
3. Enter:
   - **Name**: "Chinweokwu Chibuzor"
   - **Title**: "Founder, LetsWatchOut"
   - **Duration**: 10 seconds
4. Click "Show"

**Expected Results:**
- ✅ WebSocket sends `graphics_update`:
  ```json
  {
    "type": "graphics_update",
    "action": "show",
    "graphic_type": "lower_third",
    "content": {
      "name": "Chinweokwu Chibuzor",
      "title": "Founder, LetsWatchOut"
    },
    "duration": 10
  }
  ```
- ✅ Backend saves to `liveshare_graphics` table
- ✅ GraphicsRenderer adds overlay to canvas
- ✅ All viewers see lower third for 10 seconds
- ✅ Graphic fades out after 10s

**Verification:**
```javascript
// All viewers console:
console.log("✅ Graphics active:", graphicsRendererRef.current.activeGraphics);
console.log("✅ Lower third visible");
```

---

#### **Test 3.4: Host Starts Break**
**Steps:**
1. Host clicks "Start Break" button
2. Break screen appears with:
   - "We'll be right back" message
   - Optional logo
   - Optional countdown timer

**Expected Results:**
- ✅ WebSocket sends `liveshare_break_started`
- ✅ Host's camera track muted (`cameraShareTrackRef.current.mute()`)
- ✅ GraphicsRenderer renders break screen overlay (full canvas)
- ✅ All viewers see break screen (no camera feed)
- ✅ Host can still see controls

**Verification:**
```javascript
// Host console:
console.log("✅ Break active:", isOnBreak); // true
console.log("✅ Camera track muted:", cameraShareTrackRef.current.isMuted); // true

// Viewers console:
console.log("✅ Break screen visible");
console.log("✅ No video feed displayed");
```

---

#### **Test 3.5: Host Ends Break**
**Steps:**
1. Host clicks "End Break"

**Expected Results:**
- ✅ WebSocket sends `liveshare_break_ended`
- ✅ Camera track unmuted
- ✅ Break screen removed from GraphicsRenderer
- ✅ Video feed resumes for all viewers

**Verification:**
```javascript
// Host console:
console.log("✅ Break ended:", !isOnBreak);
console.log("✅ Camera track unmuted:", !cameraShareTrackRef.current.isMuted);
```

---

#### **Test 3.6: Host Kicks Guest**
**Steps:**
1. Host clicks "Kick Guest" button (in LiveShare tab)
2. Confirm kick

**Expected Results:**
- ✅ WebSocket sends `liveshare_kick_guest` → guest
- ✅ Guest's LiveKit tracks unpublished
- ✅ Guest removed from split-view
- ✅ Layout reverts to "Solo View" (host only)
- ✅ Guest sees notification: "You've been removed from LiveShare"

**Verification:**
```javascript
// Host console:
console.log("✅ Guest kicked:", !liveShareGuest);
console.log("✅ Layout reverted:", selectedLayout); // 'solo-view'

// Guest console:
console.log("✅ LiveShare ended for guest");
console.log("✅ Tracks unpublished");
```

---

### **Phase 4: Church Mode (45 minutes)**

#### **Test 4.1: Host Starts Church Mode**
**Steps:**
1. Start LiveShare → Select "Church" mode
2. Setup:
   - Title: "Sunday Service - Grace Chapel"
   - Upload church logo
   - No guest (solo)
3. Share type: "Camera Only"
4. Layout: "Solo View"
5. Complete

**Expected Results:**
- ✅ Church mode active
- ✅ Title + logo overlay renders (church-themed styling)
- ✅ "Bible Verse" button appears in Studio Controls
- ✅ "Presentation Mode" button appears

**Verification:**
```javascript
// Host console:
console.log("✅ LiveShare mode:", liveShareMode); // 'church'
console.log("✅ Church config:", podcastConfig); // Title, logo
```

---

#### **Test 4.2: Host Shows Bible Verse**
**Steps:**
1. Click "Show Bible Verse"
2. Enter:
   - **Verse**: "John 3:16"
   - **Text**: "For God so loved the world..."
3. Click "Show"

**Expected Results:**
- ✅ WebSocket sends `bible_verse_update`:
  ```json
  {
    "type": "bible_verse_update",
    "action": "show",
    "verse": "John 3:16",
    "text": "For God so loved the world..."
  }
  ```
- ✅ Backend saves to `watch_sessions.bible_verse_content`
- ✅ BibleOverlay component renders verse on screen
- ✅ All viewers see verse overlay
- ✅ Verse persists until hidden

**Verification:**
```javascript
// All viewers console:
console.log("✅ Bible verse visible:", bibleVerseContent);
```

---

#### **Test 4.3: Host Hides Bible Verse**
**Steps:**
1. Click "Hide Bible Verse"

**Expected Results:**
- ✅ WebSocket sends `bible_verse_update` with `action: 'hide'`
- ✅ Backend clears `bible_verse_content`
- ✅ BibleOverlay removed from screen

---

#### **Test 4.4: Host Switches to Presentation Mode**
**Steps:**
1. Click "Presentation Mode"
2. Upload PowerPoint/PDF file
3. File converts to images (backend handles conversion)

**Expected Results:**
- ✅ WebSocket sends `liveshare_type_selected` with `share_type: 'presentation'`
- ✅ Presentation slides appear as media queue
- ✅ Host can navigate slides (next/previous)
- ✅ Camera appears as PIP (picture-in-picture)

---

### **Phase 5: News Mode (30 minutes)**

#### **Test 5.1: Host Starts News Mode (Solo)**
**Steps:**
1. Start LiveShare → Select "News" mode
2. Setup:
   - Title: "WeWatch News Tonight"
   - Upload news desk logo
3. Share type: "Camera Only"
4. Layout: "Solo View" (no guest option for news)
5. Complete

**Expected Results:**
- ✅ News mode active (no guest invitation UI)
- ✅ Title renders with news-themed styling
- ✅ "Lower Third" and "Ticker" buttons available

**Verification:**
```javascript
// Host console:
console.log("✅ LiveShare mode:", liveShareMode); // 'news'
console.log("✅ Guest UI hidden"); // News is solo-only
```

---

#### **Test 5.2: Host Adds Ticker**
**Steps:**
1. Click "Add Ticker"
2. Enter ticker text: "Breaking: LetsWatchOut launches in 12 African countries"
3. Set scroll speed: Medium

**Expected Results:**
- ✅ WebSocket sends `graphics_update` with `graphic_type: 'ticker'`
- ✅ GraphicsRenderer adds scrolling ticker at bottom of screen
- ✅ Ticker scrolls continuously until removed

---

### **Phase 6: Show Mode (30 minutes)**

#### **Test 6.1: Host Starts Show Mode with Guest**
**Steps:**
1. Start LiveShare → Select "Show" mode
2. Setup:
   - Title: "The Founder's Circle"
   - Upload show logo
   - Select guest
3. Share type: "Both" (screen + camera)
4. Layout: "Split View"
5. Complete

**Expected Results:**
- ✅ Show mode active
- ✅ Host + guest in split-view
- ✅ Screen share available (for slides/demos)
- ✅ Title + logo overlay renders

---

### **Phase 7: Edge Cases & Error Handling (30 minutes)**

#### **Test 7.1: Network Interruption**
**Steps:**
1. Host in active LiveShare
2. Disconnect WiFi for 10 seconds
3. Reconnect

**Expected Results:**
- ✅ WebSocket reconnects automatically
- ✅ LiveKit tracks resume
- ✅ State syncs after reconnection
- ✅ No data loss

---

#### **Test 7.2: Guest Loses Permission Mid-Stream**
**Steps:**
1. Host grants permission to guest
2. Guest joins LiveShare
3. Host revokes permission

**Expected Results:**
- ✅ WebSocket sends `liveshare_permission_revoked`
- ✅ Guest's tracks unpublish immediately
- ✅ Guest UI updates: "Permission revoked"
- ✅ Guest can no longer share

---

#### **Test 7.3: Session Ends While LiveShare Active**
**Steps:**
1. Host in active LiveShare (Podcast mode)
2. Host ends session

**Expected Results:**
- ✅ WebSocket sends `session_ended`
- ✅ LiveKit room closed
- ✅ All participants disconnected
- ✅ Graphics cleanup (`CleanupLiveShareAssets` called)
- ✅ Uploaded logos/graphics deleted from disk
- ✅ `liveshare_graphics` and `liveshare_media_queue` tables cleaned
- ✅ All users redirected to RoomPageNew

**Verification:**
```javascript
// Backend logs:
"🧹 [Session] Cleaning up session ID X"
"🗑️ [LiveShare] Deleted all graphics for session X"
"✅ [Session] Session ended successfully"
```

---

## 🐛 Common Issues & Debugging

### **Issue 1: Camera Permission Denied**
**Symptoms**: "Camera permission denied" error in wizard  
**Solution**:
1. Check browser console for permission error
2. Go to browser settings → Site permissions → Camera → Allow
3. Restart browser if needed

### **Issue 2: LiveKit Connection Failed**
**Symptoms**: "Failed to connect to LiveKit" error  
**Debug**:
```bash
# Check LiveKit logs
docker logs bold_nash

# Check backend logs for LIVEKIT_URL
grep "LIVEKIT_URL" ~/WeWatch/backend/.env

# Test LiveKit directly
curl http://localhost:7880
```

### **Issue 3: Graphics Not Rendering**
**Symptoms**: Lower thirds/banners not visible  
**Debug**:
```javascript
// In browser console:
console.log("GraphicsRenderer ref:", graphicsRendererRef.current);
console.log("Active graphics:", graphicsRendererRef.current?.activeGraphics);
console.log("Canvas element:", document.querySelector('canvas[data-graphics-layer]'));
```

### **Issue 4: WebSocket Messages Not Received**
**Symptoms**: State changes not syncing  
**Debug**:
```javascript
// In browser console:
console.log("WebSocket connected:", isConnected);
console.log("Last message:", messages[messages.length - 1]);
console.log("Session ID:", sessionId);

// Check backend logs:
tail -f ~/WeWatch/backend/logs/websocket.log
```

---

## ✅ Success Criteria

### **VideoWatch Tests (10/10 passed):**
- [ ] Session creation works
- [ ] Guest joins successfully
- [ ] Video sync accurate (<200ms)
- [ ] Playlist management functional
- [ ] Media upload works
- [ ] WebSocket real-time updates
- [ ] Session end cleanup complete
- [ ] Ticket enforcement working
- [ ] Private session privacy respected
- [ ] Ghost mode hides attendees

### **LiveShare Tests (15/15 passed):**
- [ ] All 5 modes selectable
- [ ] Wizard flow completes
- [ ] Camera publishing works
- [ ] Screen share publishing works
- [ ] Both tracks work simultaneously
- [ ] Guest invitation works
- [ ] Guest join works
- [ ] Graphics overlays render
- [ ] Break mode works
- [ ] Bible verse works (church)
- [ ] Presentation mode works (church)
- [ ] Ticker works (news)
- [ ] Lower third works
- [ ] Layout switching works
- [ ] Session end cleanup complete

### **Performance Criteria:**
- [ ] Video latency < 200ms
- [ ] Audio latency < 150ms
- [ ] Frame rate ≥ 24 FPS
- [ ] No memory leaks (heap size stable)
- [ ] CPU usage < 60% (laptop) / < 40% (desktop)

---

## 📊 Testing Log Template

```markdown
### Test Session: [Date/Time]
**Tester**: Chinweokwu Chibuzor  
**Browser**: Chrome 120 / Firefox 122 / Safari 17  
**OS**: Windows 11 / macOS 14 / Ubuntu 22.04  

#### Tests Completed:
- [x] VideoWatch: Session creation ✅
- [x] VideoWatch: Guest join ✅
- [x] VideoWatch: Video sync ✅
- [ ] LiveShare: Regular mode
- [ ] LiveShare: Podcast mode
- ...

#### Issues Found:
1. **Issue**: Lower third not rendering on mobile
   - **Severity**: Medium
   - **Steps to Reproduce**: ...
   - **Expected**: ...
   - **Actual**: ...

#### Performance Metrics:
- **Video latency**: 120ms ✅
- **Audio latency**: 90ms ✅
- **CPU usage**: 35% ✅
- **Memory usage**: 450MB ✅
```

---

## 🚀 Next Steps After Testing

1. **Fix All Bugs**: Address issues found during E2E testing
2. **Withdrawal Testing**: Proceed to withdrawal flow testing (KYC → Flutterwave)
3. **Production Deployment**: Deploy to Railway (backend) + Vercel (frontend)
4. **Load Testing**: 100+ concurrent users in LiveShare
5. **Mobile App Testing**: Capacitor build + Play Store submission

---

## 📞 Support

**Questions during testing?**
- Check browser console logs (F12)
- Check backend logs: `tail -f ~/WeWatch/backend/logs/*.log`
- Check LiveKit logs: `docker logs bold_nash`
- Review WebSocket messages in Network tab (WS filter)

**Critical Bugs?**
- Document in GitHub Issues
- Add "P0" label for blockers
- Include browser, OS, steps to reproduce

---

**Status**: Ready for Testing ✅  
**Last Updated**: May 8, 2026  
**Next Review**: After E2E testing completion
