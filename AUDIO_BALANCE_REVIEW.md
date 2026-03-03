# Audio Balance Review - Host vs Member vs Media

## 🔍 **Issue Reported**
Users report that **host audio is louder than media being played**, suggesting audio imbalance between:
- **LiveKit participant audio** (host/members)
- **Uploaded media playback** (video/audio files)

---

## 📊 **Current Audio Configuration**

### 1. **LiveKit Participant Audio** (Host & Members)
**Location:** [frontend/src/components/cinema/ui/RemoteAudioPlayer.jsx](frontend/src/components/cinema/ui/RemoteAudioPlayer.jsx)

```jsx
// Line 102: Audio gain boost applied to ALL participants
const gainNode = audioContext.createGain();
gainNode.gain.value = 1.5; // ⚠️ BOOSTED BY 50%
source.connect(gainNode);
gainNode.connect(audioContext.destination);
```

**Settings:**
- **Base volume:** `audioElement.volume = 1.0` (line 91)
- **Gain boost:** `1.5x` (150% of base volume) via Web Audio API
- **Effective volume:** **150%** (1.0 × 1.5)
- **Applies to:** ALL participants (both host and members)

**Why the boost?**
- Initially added to ensure participant audio was audible
- Web Audio API allows gain > 1.0 (beyond browser's native volume limit)

---

### 2. **Uploaded Media Playback** (Video/Audio Files)
**Location:** [frontend/src/components/VolumeControl.jsx](frontend/src/components/VolumeControl.jsx)

```jsx
// Lines 20-23: Media volume applied (no boost)
videoRef.current.volume = isMuted ? 0 : volume;
videoRef.current.muted = isMuted;
```

**Settings:**
- **Default volume:** `1.0` (100% - retrieved from localStorage)
- **User-controllable:** Yes (slider 0-100%)
- **Gain boost:** **NONE** (standard HTML5 video volume only)
- **Effective volume:** **100%** (1.0 × 1.0)

---

## ⚖️ **The Audio Imbalance**

### **Volume Comparison Table**

| Audio Source | Base Volume | Gain Boost | Effective Volume | User Control |
|-------------|-------------|-----------|-----------------|--------------|
| **Host Audio** (LiveKit) | 1.0 (100%) | **1.5x** | **150%** | ❌ No |
| **Member Audio** (LiveKit) | 1.0 (100%) | **1.5x** | **150%** | ❌ No |
| **Uploaded Media** | 1.0 (100%) | None | **100%** | ✅ Yes (VolumeControl) |

### **Problem:**
- **Participant audio is 50% louder than media playback**
- This explains why users report host/member voices overpowering the video content
- No differentiation between host and member audio (both get same boost)

---

## 🎯 **Recommended Solutions**

### **Option 1: Remove Audio Boost (Simplest)**
**Restore natural audio balance:**

```jsx
// RemoteAudioPlayer.jsx - Line 102
gainNode.gain.value = 1.0; // Change from 1.5 to 1.0
```

**Pros:**
- Immediate fix
- Equal volume for all audio sources
- Users can adjust media volume if too quiet

**Cons:**
- Participant audio may be quieter (but natural)
- Users with bad mics may be harder to hear

---

### **Option 2: Add Media Boost (Match Levels)**
**Make media as loud as participant audio:**

```jsx
// VolumeControl.jsx - Add Web Audio API gain
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const source = audioContext.createMediaElementSource(videoRef.current);
const gainNode = audioContext.createGain();
gainNode.gain.value = 1.5; // Match participant boost
source.connect(gainNode);
gainNode.connect(audioContext.destination);
```

**Pros:**
- Maintains current participant audio levels
- Everything is equally loud

**Cons:**
- Both participant audio and media become louder (may clip/distort)
- More complex implementation

---

### **Option 3: Reduce Participant Boost (Balanced)**
**Lower participant audio boost to 1.2x (20% boost):**

```jsx
// RemoteAudioPlayer.jsx - Line 102
gainNode.gain.value = 1.2; // Reduce from 1.5 to 1.2
```

**Pros:**
- Subtle participant boost (helps with quiet mics)
- Less overpowering than current 50% boost
- Media remains at natural 100%

**Cons:**
- Still some imbalance (but much better)

---

### **Option 4: User-Controllable Gain (Best UX)**
**Add per-participant volume controls + global media/participant balance:**

```jsx
// Add state for global balance
const [participantVolume, setParticipantVolume] = useState(1.0);
const [mediaVolume, setMediaVolume] = useState(1.0);

// Apply to RemoteAudioPlayer
gainNode.gain.value = participantVolume;

// Apply to media
videoRef.current.volume = mediaVolume;
```

**Add UI controls:**
- Global slider: "Voice Volume" (0-200%)
- Global slider: "Media Volume" (0-200%)
- Per-participant sliders (like Zoom)

**Pros:**
- Users control their audio experience
- Works for all scenarios (loud mics, quiet media, etc.)
- Professional solution

**Cons:**
- More development work
- UI space needed

---

## 🎤 **Current Audio Levels Summary**

### **For All Watch Types (VideoWatch, 3D Cinema, Lecture Hall):**

1. **Host speaking:**
   - Microphone input → LiveKit → RemoteAudioPlayer
   - Volume: **150%** (1.0 base × 1.5 gain)
   - No user control

2. **Member speaking:**
   - Microphone input → LiveKit → RemoteAudioPlayer
   - Volume: **150%** (1.0 base × 1.5 gain)
   - No user control

3. **Uploaded video/audio playing:**
   - HTML5 `<video>` element → VolumeControl
   - Volume: **100%** (1.0, adjustable 0-100%)
   - User control: ✅ VolumeControl slider

4. **Screen share audio:**
   - Screen share with system audio → LiveKit (screen_share_audio)
   - Volume: **150%** (same as participant audio)
   - No user control

---

## 🔧 **Implementation Notes**

### **Where Audio is Processed:**

1. **Participant Audio (Host/Members):**
   - File: `frontend/src/components/cinema/ui/RemoteAudioPlayer.jsx`
   - Lines: 91-104 (gain node setup)
   - Applies to: All LiveKit audio tracks
   - Shared across all watch types

2. **Media Playback:**
   - File: `frontend/src/components/VolumeControl.jsx`
   - Lines: 20-23 (volume control)
   - Applies to: Uploaded video/audio files
   - Used in: CinemaVideoPlayer, CinemaScene3DDemo, PositionCalculatorPage

3. **Backend Token Generation:**
   - File: `backend/internal/utils/livekit.go`
   - No volume settings (volume is client-side only)
   - Token grants publishing/subscribing permissions

---

## 🎯 **Recommended Action**

**Quick Fix (Recommended):**
Change line 102 in RemoteAudioPlayer.jsx:

```jsx
gainNode.gain.value = 1.0; // Remove 50% boost
```

This will:
- ✅ Balance audio between participants and media
- ✅ Maintain natural audio levels
- ✅ Let users increase media volume if needed (VolumeControl already exists)
- ✅ Quick 1-line fix

---

## 📝 **Testing Checklist**

After implementing fix:

- [ ] Test host speaking vs media playback (3D Cinema)
- [ ] Test member speaking vs media playback (3D Cinema)
- [ ] Test in VideoWatch (2D mode)
- [ ] Test in Lecture Hall
- [ ] Test screen share with system audio
- [ ] Verify VolumeControl still works for media
- [ ] Test with quiet microphones (may need slight boost like 1.1-1.2x)
- [ ] Test with loud microphones (ensure no distortion)

---

## 🔍 **Additional Findings**

### **Audio Flow:**

```
┌─────────────────┐
│ Microphone      │ → getUserMedia() → MediaStream
└─────────────────┘
         ↓
┌─────────────────┐
│ LiveKit Publish │ → room.localParticipant.publishTrack()
└─────────────────┘
         ↓
┌─────────────────┐
│ LiveKit Server  │ → Forwarding to all participants
└─────────────────┘
         ↓
┌─────────────────┐
│ RemoteAudioPlayer│ → track.attach() → <audio> element
└─────────────────┘
         ↓
┌─────────────────┐
│ Web Audio API   │ → gainNode (1.5x boost) ⚠️ HERE IS THE ISSUE
└─────────────────┘
         ↓
┌─────────────────┐
│ Browser Output  │ → Speakers/Headphones
└─────────────────┘
```

```
┌─────────────────┐
│ Uploaded Media  │ → Video file from server
└─────────────────┘
         ↓
┌─────────────────┐
│ <video> element │ → videoRef.current
└─────────────────┘
         ↓
┌─────────────────┐
│ VolumeControl   │ → videoRef.current.volume = 1.0 (no boost)
└─────────────────┘
         ↓
┌─────────────────┐
│ Browser Output  │ → Speakers/Headphones
└─────────────────┘
```

---

## 🎵 **Summary**

**Current State:**
- ❌ Participant audio: 150% volume (boosted)
- ✅ Media playback: 100% volume (natural)
- ❌ **Imbalance: Voices 50% louder than media**

**Recommended Fix:**
- Change `gainNode.gain.value` from `1.5` to `1.0` in RemoteAudioPlayer.jsx
- This restores natural audio balance
- Users can adjust media volume up if needed (VolumeControl already exists)

**No Difference Between Host and Member Audio:**
- Both get the same 1.5x boost
- The issue is participant audio vs media audio, not host vs member

---

**Created:** 2026-03-03  
**Status:** Awaiting implementation decision
