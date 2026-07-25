# Session Preview Improvements - TikTok-Quality Upgrade

**Date:** April 9, 2026  
**Status:** 🔄 Planning Phase  
**Goal:** Transform GIF-based previews into TikTok-quality video clips with audio

---

## Current Implementation (Baseline)

### Technical Specs
- **Format:** Animated GIF
- **Resolution:** 640px width (fixed)
- **Frame Rate:** 12 fps
- **Duration:** 30 seconds
- **Audio:** ❌ None
- **File Size:** ~2-3 MB
- **Color Depth:** 256 colors (8-bit palette)
- **Quality:** Dithered, banded, choppy

### Generation Pipeline
```bash
# Current FFmpeg command (backend/internal/utils/ffmpeg.go)
ffmpeg -ss {startTime} -i {input} -t 30 \
  -vf "fps=12,scale=640:-1:flags=lanczos,palettegen" \
  -loop 0 output.gif
```

### Refresh Logic
- **Development:** 1 minute interval
- **Production:** 5 minute interval
- **Trigger:** Event-driven (media state changes via WebSocket)
- **Source:** Current playback position in uploaded media or LiveShare/WatchFrom modes

---

## Planned Improvements

### 1. ✅ Audio Support - MP4/WebM Migration

**Objective:** Enable audio in previews for TikTok-like "clip" experience

**Why:**
- Audio + visuals > visuals alone
- Better engagement (users hear what's happening)
- Matches modern short-form video platforms (TikTok, Reels, Shorts)

**Implementation:**
- Switch from GIF → MP4 (H.264 + AAC audio)
- Fallback: WebM (VP9 + Opus) for broader compatibility
- Maintain all current logic (timing, refresh intervals, event triggers)
- Use current playback time from uploaded media or LiveShare/WatchFrom streams

**Technical Specs:**
| Parameter | Value |
|-----------|-------|
| Container | MP4 (primary), WebM (fallback) |
| Video Codec | H.264 (libx264) |
| Audio Codec | AAC @ 96 kbps |
| Duration | 30 seconds |
| Source Time | Current playback position (dynamic) |

**Expected Output:**
```bash
ffmpeg -ss {currentTime} -i {input} -t 30 \
  -c:v libx264 -crf 26 -preset fast \
  -vf "fps=24,scale=720:-1:flags=lanczos" \
  -c:a aac -b:a 96k \
  -movflags +faststart \
  output.mp4
```

---

### 2. ✅ TikTok-Quality Visuals

**Objective:** Match TikTok's visual quality (smooth, vibrant, professional)

**Upgrades:**

| Aspect | Current (GIF) | New (MP4) | Improvement |
|--------|--------------|-----------|-------------|
| **Colors** | 256 (8-bit) | 16.7M (24-bit) | ✅ No banding, true colors |
| **Frame Rate** | 12 fps | 24 fps | ✅ Smooth motion |
| **Compression** | Lossless | H.264 (optimized) | ✅ Better quality, smaller size |
| **Gradients** | Dithered/noisy | Clean | ✅ Professional look |
| **File Size** | 2-3 MB | 1.5-2.5 MB | ✅ Smaller + better |

**Target Specs:**
- **Resolution:** 720px (see #3 for adaptive)
- **Frame Rate:** 24 fps
- **Bitrate:** 1.5 Mbps (variable)
- **Audio:** 96 kbps AAC
- **CRF:** 26 (quality factor)

---

### 3. ✅ Adaptive Resolution (Network-Aware)

**Objective:** Serve appropriate quality based on user's network speed

**TikTok's Strategy:**

| Network Type | Resolution | Video Bitrate | Audio Bitrate | File Size (30s) | Target Users |
|--------------|-----------|---------------|---------------|-----------------|--------------|
| **WiFi** | 1080p (1920x1080) | 3 Mbps | 128 kbps | ~12 MB | High-speed |
| **4G/LTE** | 720p (1280x720) | 1.5 Mbps | 96 kbps | ~6 MB | Standard mobile |
| **3G** | 540p (960x540) | 800 kbps | 64 kbps | ~3 MB | Slower mobile |
| **2G** | 360p (640x360) | 400 kbps | 48 kbps | ~1.5 MB | Very slow (fallback) |

**Planned Implementation:**

| Network | Resolution | Notes |
|---------|-----------|-------|
| **3G** | 640px (540p) | Current baseline, kept for compatibility |
| **4G** | 720px (720p) | Sweet spot for mobile |
| **WiFi** | 1080px (1080p) | Full quality |

**Low-Quality Source Handling:**
**Question for discussion:** If source media is low quality (e.g., 480p upload), what resolution should preview be?

Options:
- A. **Match source** (don't upscale): 480p source → 480p preview
- B. **Fixed minimum** (always upscale to 540p for consistency)
- C. **Cap at source** (use lower of [source_res, network_target])

**Recommendation:** Option C (don't upscale beyond source quality)
```
Example:
- Source: 480p upload
- Network: WiFi (expects 1080p)
- Result: 480p preview (max available)
```

**Detection Method:**
```javascript
// Frontend detects network type
const networkType = navigator.connection?.effectiveType;
// '4g', '3g', '2g', 'slow-2g', 'wifi'

// Request appropriate quality
fetch(`/api/sessions/${sessionId}/preview?quality=${networkType}`);
```

**Backend Generation:**
```bash
# Detect source resolution first
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height \
  -of csv=p=0 input.mp4

# Generate multiple versions
# 1080p (WiFi)
ffmpeg -i input.mp4 -vf "scale=1920:1080" -b:v 3M -b:a 128k preview_1080p.mp4

# 720p (4G)
ffmpeg -i input.mp4 -vf "scale=1280:720" -b:v 1.5M -b:a 96k preview_720p.mp4

# 540p (3G)
ffmpeg -i input.mp4 -vf "scale=960:540" -b:v 800k -b:a 64k preview_540p.mp4
```

---

### 4. ✅ Adaptive Aspect Ratio (Portrait/Landscape Handling)

**Objective:** Fix cropping issues in portrait mode, match TikTok behavior

**Current Issue:**
- `object-cover` crops video to fill container
- Portrait screens (9:19) crop 40-50% of landscape video (16:9) width
- Users miss important content on edges

**TikTok's Approach:**

| Source Aspect Ratio | TikTok Behavior | Visual Result |
|---------------------|----------------|---------------|
| **Portrait (9:16)** | Full screen, no crop | ✅ Fills display |
| **Landscape (16:9)** | Pillarbox (black bars left/right) | 📏 Shows full video |
| **Square (1:1)** | Pillarbox (black bars top/bottom) | 📏 Shows full video |

**Implementation Plan:**

**Option A: Detect & Apply Pillarboxing (Recommended)**
```javascript
// SessionPreview.jsx
const [aspectRatio, setAspectRatio] = useState(null);

useEffect(() => {
  const video = document.createElement('video');
  video.src = previewUrl;
  video.onloadedmetadata = () => {
    const ratio = video.videoWidth / video.videoHeight;
    setAspectRatio(ratio);
  };
}, [previewUrl]);

// Render with appropriate fit
const fitStyle = aspectRatio > 0.7 ? 'object-contain' : 'object-cover';
// 0.7 threshold: portrait uses cover, landscape uses contain
```

**Option B: Smart Crop (Center-weighted)**
```bash
# Backend: Crop landscape to portrait (9:16) keeping center
ffmpeg -i landscape.mp4 \
  -vf "crop=ih*9/16:ih,scale=720:1280" \
  preview_portrait.mp4
```

**Option C: Hybrid Approach (Best of both)**
- **Portrait source:** Use `object-cover` (fill screen)
- **Landscape source:** Use `object-contain` + black bars (preserve full frame)
- **Square source:** Use `object-contain` + bars

**Decision:** Use Option C (hybrid) to match TikTok exactly

---

### 5. ⏳ LiveShare Overlays (Deferred)

**Status:** To be reviewed separately after 1-4 are complete

**Challenge:** 
- LiveShare graphics (banner, ticker, podcast logo, lower thirds) are DOM-based HTML
- Not captured by FFmpeg video stream recording
- Would require canvas compositing or server-side overlay rendering

**Proposal:**
- Phase 1 (current): Preview shows raw media only (no overlays)
- Phase 2 (future): Composite overlays onto preview using canvas API

---

## Implementation Plan

### Phase 1: Core Video Migration (Priority)

**Tasks:**
1. ✅ Update FFmpeg utility functions (`backend/internal/utils/ffmpeg.go`)
   - Add MP4 generation with audio
   - Maintain 30-second duration
   - Use current playback time as start position
   
2. ✅ Update preview generation handler (`backend/internal/handlers/session_preview.go`)
   - Detect source resolution
   - Generate video instead of GIF
   - Store MP4 files in preview directory
   
3. ✅ Update frontend preview component (`frontend/src/components/SessionPreview.jsx`)
   - Replace `<img>` with `<video>` element
   - Enable autoplay, loop, muted (mobile compatibility)
   - Maintain progressive loading (emoji → poster → video)
   
4. ✅ Database schema updates
   - Change `preview_url` to support `.mp4` extension
   - Add `preview_format` field (gif/mp4/webm)

### Phase 2: Adaptive Quality

**Tasks:**
1. ✅ Network detection on frontend
   - Read `navigator.connection.effectiveType`
   - Request appropriate quality version
   
2. ✅ Multi-resolution generation on backend
   - Generate 540p, 720p, 1080p versions
   - Store separately: `preview_540p.mp4`, `preview_720p.mp4`, etc.
   - Serve based on query parameter
   
3. ✅ CDN preparation (optional)
   - Consider CloudFlare/AWS CloudFront for faster delivery
   - Edge caching for popular previews

### Phase 3: Aspect Ratio Intelligence

**Tasks:**
1. ✅ Source video analysis
   - Detect aspect ratio via FFprobe
   - Store metadata in database
   
2. ✅ Frontend adaptive rendering
   - Use `object-contain` for landscape
   - Use `object-cover` for portrait
   - Add pillarbox styling for letterboxed videos

---

## File Size & Bandwidth Impact

### Current (GIF)
```
30-second preview @ 640px, 12fps:
- File size: 2-3 MB
- Bandwidth (10 previews): 20-30 MB
- Load time (3G): ~8-10 seconds
```

### Planned (MP4 - 720p)
```
30-second preview @ 720px, 24fps, audio:
- File size: 1.5-2.5 MB
- Bandwidth (10 previews): 15-25 MB
- Load time (3G): ~5-8 seconds
```

### Impact:
- ✅ **Better quality** (24fps, full color, audio)
- ✅ **Smaller files** (H.264 more efficient than GIF)
- ✅ **Faster loading** (~30% improvement)

---

## Browser Compatibility

### Video Format Support

| Browser | MP4 (H.264) | WebM (VP9) | Autoplay Muted | Notes |
|---------|------------|-----------|----------------|-------|
| Chrome | ✅ | ✅ | ✅ | Full support |
| Firefox | ✅ | ✅ | ✅ | Full support |
| Safari | ✅ | ❌ | ✅ | MP4 only |
| Edge | ✅ | ✅ | ✅ | Full support |
| Mobile Safari | ✅ | ❌ | ✅ | MP4 recommended |
| Android Chrome | ✅ | ✅ | ✅ | Full support |

**Strategy:** Use MP4 as primary, WebM as fallback (optional)

---

## Refresh Logic Preservation

**Current Behavior (Maintained):**

```javascript
// Development: 1-minute refresh
const DEV_INTERVAL = 60 * 1000;

// Production: 5-minute refresh  
const PROD_INTERVAL = 5 * 60 * 1000;

// Event-driven triggers (immediate)
WebSocket.on('media_state_changed', generatePreview);

// Timed refresh (background)
setInterval(generatePreview, INTERVAL);
```

**Source Time Selection:**
- **Uploaded media:** Use `currentTime` from video player
- **LiveShare mode:** Capture current frame timestamp
- **WatchFrom mode:** Use host's playback position

**No changes needed** - same logic, just output format changes from GIF → MP4

---

## Testing Checklist

### Functional Tests
- [ ] Preview generates with audio (verify AAC track)
- [ ] Video loops correctly in browser
- [ ] Autoplay works on mobile (muted)
- [ ] Progressive loading: emoji → poster → video
- [ ] Event-driven generation triggers on media change
- [ ] Timed refresh works (1min dev, 5min prod)

### Quality Tests
- [ ] 720p resolution visible and sharp
- [ ] 24fps motion smooth (no stuttering)
- [ ] Colors vibrant (no banding)
- [ ] Audio synced with video
- [ ] File sizes within 1.5-2.5 MB range

### Adaptive Tests
- [ ] 3G network serves 540p
- [ ] 4G network serves 720p
- [ ] WiFi serves 1080p
- [ ] Low-quality source (480p) doesn't upscale

### Aspect Ratio Tests
- [ ] Portrait video (9:16) fills screen
- [ ] Landscape video (16:9) shows pillarbox
- [ ] Square video (1:1) centered with bars
- [ ] No content cropped unexpectedly

---

## Questions for Discussion

### 1. **Audio Source Handling**

**Scenario:** Uploaded media has no audio track (silent video)

Options:
- A. Generate silent MP4 (no audio track)
- B. Add default background music (royalty-free)
- C. Add ambient sound effect (optional)
- D. Fall back to GIF for silent media

**Question:** How should we handle silent source videos?

---

### 2. **Low-Quality Source Resolution**

**Scenario:** User uploads 480p video, but WiFi user expects 1080p preview

Options:
- A. **Never upscale** (cap at source: 480p max)
- B. **Always match network** (upscale 480p → 1080p)
- C. **Hybrid** (upscale up to 720p, never beyond)

**Question:** What's the acceptable upscaling limit?

---

### 3. **Multi-Resolution Storage Strategy**

**Scenario:** Storing 3 versions (540p, 720p, 1080p) triples storage

Options:
- A. Generate all 3 upfront (storage: 3× files)
- B. Generate on-demand (CPU: slower first load)
- C. Generate 720p only, scale on CDN (compromise)

**Question:** Which storage/CPU tradeoff is acceptable?

---

### 4. **Playback Time Selection Logic**

**Current:** Uses current playback position when preview requested

**Issue:** What if user just started video (0:05) but interesting part is at 2:30?

Options:
- A. Use current time (dynamic, reflects what's playing now)
- B. Use random time (variety across refreshes)
- C. Use fixed time (e.g., always 0:30 for consistency)
- D. Use "highlight reel" (detect scene changes, pick best moment)

**Question:** How should we choose the 30-second preview window?

---

### 5. **WebM Fallback Necessity**

**Scenario:** Safari doesn't support WebM, but MP4 works everywhere

**Question:** Do we need WebM at all, or is MP4-only sufficient?

---

### 6. **Preview Caching Strategy**

**Current:** Regenerates every 1min (dev) / 5min (prod)

**Question:** Should we cache previews longer if media hasn't changed?

Options:
- A. Cache until media state changes (event-driven invalidation)
- B. Keep timed refresh (current)
- C. Hybrid (cache + invalidate on change + periodic refresh)

---

## Success Metrics

**Before (GIF):**
- Quality score: 6/10 (choppy, low-color)
- File size: 2-3 MB
- Load time: 8-10s (3G)
- Engagement: No audio feedback

**Target (MP4):**
- Quality score: 9/10 (smooth, vibrant, TikTok-like)
- File size: 1.5-2.5 MB (smaller!)
- Load time: 5-8s (3G, 30% faster)
- Engagement: Audio + visual = higher

---

## Next Steps

1. **Review this document** ✅
2. **Answer discussion questions** 🔄
3. **Finalize implementation approach** ⏳
4. **Begin Phase 1: Core video migration** ⏳
5. **Test & iterate** ⏳

---

**Document Status:** 📋 Ready for Review  
**Last Updated:** April 9, 2026
