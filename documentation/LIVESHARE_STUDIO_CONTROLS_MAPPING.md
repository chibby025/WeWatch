# LiveShare Studio Controls Mapping

This document outlines which Studio Controls are visible for each LiveShare mode.

## Control Visibility Matrix

| Studio Control | Regular | Podcast | News | Show | Standup |
|---------------|---------|---------|------|------|---------|
| 🎬 **Take a Break** | ✅ | ✅ | ✅ | ✅ | ✅ |
| 📺 **Graphics (Section)** | ✅ | ✅ | ✅ | ✅ | ❌ |
| └─ Lower Third | ✅ | ✅ | ✅ | ✅ | ❌ |
| └─ Logo Bug | ✅ | ✅ | ✅ | ✅ | ✅ |
| 📸 **Media Queue** | ❌ | ✅ | ✅ | ✅ | ❌ |
| 📰 **Ticker / Headlines** | ❌ | ❌ | ✅ | ✅ | ❌ |
| 🚨 **Breaking News Banner** | ❌ | ❌ | ✅ | ✅ | ❌ |

## Mode Descriptions

### Regular Mode
- **Use Case:** Standard live streaming
- **Controls:** Basic graphics (Lower Third, Logo Bug) and break functionality
- **Philosophy:** Clean, minimal setup for everyday streaming

### Podcast Mode
- **Use Case:** Interview/conversation-style broadcasts with guest
- **Controls:** Graphics for guest identification, Media Queue for ads/promos, break functionality
- **Philosophy:** Focus on conversation with visual aids for branding and sponsorships
- **Typical Workflow:**
  1. Use Lower Third to introduce guest
  2. Display Logo Bug for show branding
  3. Queue up sponsor ads or promo materials in Media Queue
  4. Take breaks for ad reads or intermissions

### News Mode
- **Use Case:** News broadcast with breaking coverage, headlines, live reports
- **Controls:** Full suite including Ticker for headlines and Banner for breaking news
- **Philosophy:** Professional news environment with all broadcast tools
- **Typical Workflow:**
  1. Ticker shows continuous headline scroll
  2. Lower Third for correspondent/reporter names
  3. Breaking News Banner for urgent updates
  4. Media Queue for b-roll footage or graphics packages
  5. Logo Bug for network branding

### Show Mode
- **Use Case:** Variety show, talk show, or multi-segment production
- **Controls:** ALL controls available (most flexible)
- **Philosophy:** Maximum flexibility for complex productions with multiple segments
- **Typical Workflow:**
  1. Use all graphics tools as needed per segment
  2. Media Queue for segment transitions
  3. Lower Third for guest introductions
  4. Ticker for social media interactions
  5. Banner for show announcements

### Standup Mode
- **Use Case:** Standup comedy, solo performance, minimal production
- **Controls:** Only Logo Bug and break functionality
- **Philosophy:** Ultra-minimal - let the performance take center stage
- **Typical Workflow:**
  1. Logo Bug for venue/show branding (subtle)
  2. Break functionality for set breaks
  3. No other graphics to avoid distraction

## Implementation Details

**Location:** `frontend/src/components/cinema/ui/LiveShareManager.jsx`

**Configuration Object:**
```javascript
const modeControlsMap = {
  regular: {
    takeABreak: true,
    graphics: true,
    lowerThird: true,
    logoBug: true,
    mediaQueue: false,
    ticker: false,
    banner: false,
  },
  podcast: {
    takeABreak: true,
    graphics: true,
    lowerThird: true,
    logoBug: true,
    mediaQueue: true,
    ticker: false,
    banner: false,
  },
  news: {
    takeABreak: true,
    graphics: true,
    lowerThird: true,
    logoBug: true,
    mediaQueue: true,
    ticker: true,
    banner: true,
  },
  show: {
    takeABreak: true,
    graphics: true,
    lowerThird: true,
    logoBug: true,
    mediaQueue: true,
    ticker: true,
    banner: true,
  },
  standup: {
    takeABreak: true,
    graphics: false,
    lowerThird: false,
    logoBug: true,
    mediaQueue: false,
    ticker: false,
    banner: false,
  },
};
```

**Helper Function:**
```javascript
const shouldShowControl = (controlName) => {
  if (!liveShareContentMode || !modeControlsMap[liveShareContentMode]) {
    return true; // Show all if mode not set or unknown
  }
  return modeControlsMap[liveShareContentMode][controlName] === true;
};
```

**Usage Example:**
```jsx
{shouldShowControl('mediaQueue') && (
  <details className="bg-gray-800/50 rounded-lg">
    <summary>📸 Media Queue</summary>
    {/* Media Queue controls */}
  </details>
)}
```

## Design Philosophy

Each LiveShare mode is designed to feel purpose-built rather than showing all controls everywhere:

1. **Progressive Disclosure:** Only show tools relevant to the current broadcast type
2. **Reduce Cognitive Load:** Fewer visible options = faster decision-making
3. **Professional Feel:** Mode-appropriate controls make each format feel polished
4. **Flexibility:** Show mode provides full control when needed

## Future Enhancements

- [ ] Add per-control tooltips explaining why a control is hidden in current mode
- [ ] "Advanced Mode" toggle to override visibility restrictions
- [ ] Preset configurations users can customize per mode
- [ ] Analytics: Track which controls are actually used per mode to refine defaults
- [ ] Mode-specific tutorials that only cover available controls
