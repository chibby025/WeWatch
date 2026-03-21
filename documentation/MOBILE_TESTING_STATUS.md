# Mobile Testing Status - January 26, 2026

## 🎯 What We've Implemented

### 1. RoomPageNew Mobile Optimizations ✅
- **Sticky Header & Input**: Header and input box stay fixed on mobile while chat scrolls
- **Compact Chat Messages**: Username and time on same line (2-line format)
- **Optimized Input Size**: Smaller icons (6x6 for sticker/mic, 12x12 for send) with compact padding
- **RoomTV Integration**: RoomTV is now part of the header (seamless layout)
- **Begin Watch Button Logic**:
  - Host: Can click to start session
  - Members: See greyed-out disabled version (opacity-30)
  - Non-members: Don't see it (only see "Join Room" button)

### 2. 3D Cinema Mobile Optimizations ✅
- **TouchViewControls**: Left/right 15% touch zones for looking around
- **MobileCinemaTutorial**: One-time tutorial with localStorage persistence
- **RotateDevicePrompt**: Portrait mode warning overlay
- **Orientation Lock**: Forces landscape mode on mobile
- **Taskbar Auto-hide**: Tap bottom 15% to reveal, auto-hides after 4 seconds
- **forwardRef Integration**: CinemaScene3D exposes triggerViewPreset for touch controls

### 3. Files Modified
- `frontend/src/components/RoomPageNew.jsx`
- `frontend/src/components/cinema/3d-cinema/CinemaScene3DDemo.jsx`
- `frontend/src/components/cinema/3d-cinema/CinemaScene3D.jsx`
- `frontend/src/components/cinema/3d-cinema/TouchViewControls.jsx` (new)
- `frontend/src/components/cinema/3d-cinema/MobileCinemaTutorial.jsx` (new)
- `frontend/src/components/cinema/3d-cinema/RotateDevicePrompt.jsx` (new)

---

## 🔧 Current System Configuration

### Ports
- **Frontend (Vite)**: `http://localhost:5173`
- **Backend (Go)**: `http://localhost:8080`
- **Ngrok Inspector**: `http://localhost:4040`

### Current Ngrok URLs (will change after restart)
- **Frontend**: `https://04988d292ed9.ngrok-free.app`
- **Backend**: `https://333955b0fa4a.ngrok-free.app`

### Environment File
Location: `frontend/.env.local`
```env
# Local development (when accessing via localhost)
VITE_API_BASE_URL=http://localhost:8080

# Ngrok backend URL (when accessing via ngrok from external devices)
VITE_NGROK_BACKEND_URL=https://333955b0fa4a.ngrok-free.app
```

---

## 🚀 Steps to Restart & Test After System Reboot

### 1. Start Backend
```bash
cd ~/WeWatch/backend
./main
```
**Wait for**: "Server starting on :8080"

### 2. Start Frontend
```bash
cd ~/WeWatch/frontend
npm run dev
```
**Wait for**: "VITE v7.1.1 ready" on port 5173

### 3. Start Ngrok
```bash
cd ~/WeWatch
bash start-ngrok.sh
```
**Look for**: New frontend and backend URLs

### 4. Update Frontend Environment
The script should auto-update, but if not:
```bash
cat > ~/WeWatch/frontend/.env.local << 'EOF'
VITE_API_BASE_URL=http://localhost:8080
VITE_NGROK_BACKEND_URL=https://[NEW_BACKEND_URL]
EOF
```
Replace `[NEW_BACKEND_URL]` with the backend URL from ngrok output.

### 5. Restart Frontend (to pick up new backend URL)
```bash
pkill -f "vite"
cd ~/WeWatch/frontend
npm run dev
```

---

## 📱 Mobile Testing Checklist

### Test on Phone (Samsung S22 Ultra)
Use the **frontend ngrok URL** (e.g., `https://xxxxx.ngrok-free.app`)

#### RoomPageNew Tests
1. **Login & Navigation**
   - [ ] Can log in successfully
   - [ ] Can navigate to a room

2. **Sticky Layout**
   - [ ] Header stays at top when scrolling chat
   - [ ] Input box stays at bottom when scrolling chat
   - [ ] RoomTV appears seamlessly below header
   - [ ] Chat messages scroll between header and input

3. **Chat Messages**
   - [ ] Username and time appear on same line
   - [ ] Messages are compact (not 3 lines)
   - [ ] Can send messages
   - [ ] Messages appear in chat

4. **Begin Watch Button**
   - [ ] As host: Can see and click "Begin Watch"
   - [ ] As member: See greyed-out "Begin Watch" (can't click)
   - [ ] As non-member: Only see "Join Room" button

5. **Mobile Input**
   - [ ] Icons are appropriately sized
   - [ ] Input fits width without overflow
   - [ ] Emoji picker works

#### 3D Cinema Tests (if you start a watch session)
1. **Orientation**
   - [ ] Portrait mode shows "Rotate Device" prompt
   - [ ] Landscape mode loads cinema properly

2. **Tutorial**
   - [ ] First time: Tutorial shows after 1 second
   - [ ] Can dismiss tutorial
   - [ ] Second time: Tutorial doesn't show (localStorage)

3. **Touch Controls**
   - [ ] Tap left 15% of screen: Camera looks left
   - [ ] Tap right 15% of screen: Camera looks right
   - [ ] Touch zones visible on initial touch
   - [ ] Zones auto-fade after 3 seconds

4. **Taskbar**
   - [ ] Taskbar hidden by default on mobile
   - [ ] Tap bottom 15% of screen: Taskbar appears
   - [ ] Taskbar auto-hides after 4 seconds

---

## 🐛 Known Issues & Fixes

### Issue: Ngrok shows 503 or blank page
**Cause**: Ports mismatch or services not running
**Fix**:
```bash
# Check what's running
ss -tulpn | grep -E ':(5173|8080)'

# Restart frontend if needed
pkill -f "vite"
cd ~/WeWatch/frontend
npm run dev
```

### Issue: Can't connect to backend
**Cause**: `.env.local` has old ngrok URL
**Fix**: Update `.env.local` with new backend URL and restart frontend

### Issue: Vite won't start on 5173
**Cause**: Port already in use
**Fix**:
```bash
pkill -9 node
pkill -9 npm
cd ~/WeWatch/frontend
npm run dev
```

---

## 🔍 Quick Verification Commands

### Check if services are running
```bash
ss -tulpn | grep -E ':(5173|8080|4040)'
```

### Get current ngrok URLs
```bash
curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*"' | cut -d'"' -f4
```

### Test frontend locally
```bash
curl -I http://localhost:5173
```

### Test backend locally
```bash
curl http://localhost:8080/api/health
```

---

## 📝 Test Results Template

Use this to document your findings:

```
Date: ___________
Device: Samsung S22 Ultra
Browser: Chrome

✅ PASSED:
- [ ] Login works
- [ ] Sticky header/input
- [ ] Chat scrolls correctly
- [ ] RoomTV seamless
- [ ] Compact messages
- [ ] Begin Watch button (host/member logic)

❌ FAILED:
- Issue: ___________
  Steps to reproduce: ___________

📱 CINEMA (if tested):
- [ ] Orientation lock
- [ ] Tutorial (first time)
- [ ] Touch controls
- [ ] Taskbar toggle

💡 NOTES:
___________
```

---

## 🎯 Next Steps After Testing

1. **If RoomPage works**: Test 3D cinema mobile features
2. **If issues found**: Document specific problems
3. **If all works**: Consider testing on other devices/browsers

---

## 📞 Emergency Commands

If everything breaks:
```bash
# Nuclear option - kill everything and restart
pkill -9 node; pkill -9 npm; pkill ngrok
sleep 3
cd ~/WeWatch/backend && ./main &
sleep 2
cd ~/WeWatch/frontend && npm run dev &
sleep 3
cd ~/WeWatch && bash start-ngrok.sh
```

---

**Good luck with testing! 🚀**
