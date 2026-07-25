# LiveShare Tab - Complete Layout Blueprint

## 📱 LeftSidebar → LiveShare Tab (Before Mode Selection)

```
┌───────────────────────────────────────┐
│ LeftSidebar (350px wide)             │
├───────────────────────────────────────┤
│  Tabs: [Upload] [LiveShare] [Watch]  │ ← Tab navigation
├───────────────────────────────────────┤
│                                       │
│  🎬 SELECT LIVESHARE MODE             │
│                                       │
│  ┌─────────────────────────────────┐ │
│  │  🎥 Regular                     │ │ ← Blue border
│  │  Casual streaming & gaming      │ │
│  └─────────────────────────────────┘ │
│                                       │
│  ┌─────────────────────────────────┐ │
│  │  🎙️ Podcast                     │ │ ← Purple border
│  │  Interviews & talk shows        │ │
│  └─────────────────────────────────┘ │
│                                       │
│  ┌─────────────────────────────────┐ │
│  │  📰 News                        │ │ ← Red border
│  │  Breaking news & reporting      │ │
│  └─────────────────────────────────┘ │
│                                       │
│  ┌─────────────────────────────────┐ │
│  │  🎬 Show                        │ │ ← Green border
│  │  Entertainment & game shows     │ │
│  └─────────────────────────────────┘ │
│                                       │
└───────────────────────────────────────┘
```

---

## 📱 LeftSidebar → LiveShare Tab (After Selecting "News" Mode)

```
┌────────────────────────────────────────┐
│ LeftSidebar (350px wide)              │
├────────────────────────────────────────┤
│  Tabs: [Upload] [LiveShare] [Watch]   │
├────────────────────────────────────────┤
│ ↓ SCROLLABLE CONTENT BELOW ↓          │
│                                        │
│ ━━━━━━━ CURRENT MODE ━━━━━━━          │
│ 📰 News Mode                           │
│ [Change Mode]                          │
│                                        │
│ ━━━━━━━ THEME ━━━━━━━                 │
│ Current: News (Red)                    │
│                                        │
│ Colors:                                │
│ Primary:   [🔴] #DC2626                │
│ Secondary: [⚫] #991B1B                │
│ Accent:    [🔵] #0052A5                │
│                                        │
│ Font: [Helvetica Neue Bold ▼]         │
│                                        │
│ ━━━━━━━ GRAPHICS ━━━━━━━              │
│                                        │
│ ☑ Lower Third                          │
│   Name:  [Jane Smith           ]       │
│   Title: [Lagos, Nigeria       ]       │
│   Position: [Bottom Left ▼]            │
│                                        │
│ ☑ Ticker (Scrolling Headlines)         │
│   Headlines (3):                       │
│   1. "Markets surge 10%"    [✕]       │
│   2. "Election results in"  [✕]       │
│   3. "Weather alert issued" [✕]       │
│   [+ Add Headline]                     │
│                                        │
│ ☑ Banner                               │
│   Text: [BREAKING NEWS         ]       │
│   Position: [Top ▼]                    │
│                                        │
│ ☑ Logo Bug                             │
│   [Upload Logo] or drag here           │
│   Position: [Top Right ▼]              │
│   Opacity: [●────────] 80%            │
│                                        │
│ ━━━━━━━ MEDIA QUEUE ━━━━━━━           │
│                                        │
│ [+ Upload Image/Video]                 │
│                                        │
│ Queue (2 items):                       │
│ ┌──────────────────────────┐          │
│ │ [📸] intro-logo.png      │          │
│ │      [▶ Play] [✕ Delete] │          │
│ └──────────────────────────┘          │
│ ┌──────────────────────────┐          │
│ │ [🎬] weather-map.mp4     │          │
│ │      [▶ Play] [✕ Delete] │          │
│ └──────────────────────────┘          │
│                                        │
│ ━━━━━━━ AUDIO ━━━━━━━                 │
│                                        │
│ Background Music:                      │
│ [Upload MP3/WAV]                       │
│ Volume: [🔊●─────] 30%                │
│                                        │
│ Audio Ducking (when speaking):         │
│ Level: [●──────] 20% reduction        │
│                                        │
│ Sound Effects:                         │
│ [Upload Short Clips]                   │
│                                        │
│ ━━━━━━━ START BROADCAST ━━━━━━━       │
│                                        │
│ ┌──────────────────────────┐          │
│ │  📹 Start Camera          │          │ ← Green button
│ └──────────────────────────┘          │
│                                        │
│ ┌──────────────────────────┐          │
│ │  🖥️ Share Screen         │          │ ← Purple button
│ └──────────────────────────┘          │
│                                        │
└────────────────────────────────────────┘
```

---

## 🎨 Mode-Specific Layouts

### Regular Mode (Minimal)
```
━━━ GRAPHICS ━━━
☐ Lower Third (optional)
☑ Logo Bug (default ON)

[Most sections collapsed - simple UX]
```

### Podcast Mode (Conversational)
```
━━━ GRAPHICS ━━━
☑ Lower Third
  Host:  [John Doe         ]
  Guest: [Jane Smith       ]
☑ Logo Bug

━━━ LAYOUT ━━━
Guest View: [Side-by-Side ▼]
Split: [50/50 ▼]
```

### News Mode (Information-Dense) - SHOWN ABOVE
All graphics ON by default, ticker + banner prominent

### Show Mode (Entertainment)
```
━━━ GRAPHICS ━━━
☑ Lower Third
☑ Banner
  Text: [COMING UP NEXT     ]
☑ Logo Bug

━━━ LAYOUT ━━━
Guest View: [Dynamic ▼]
  (switches between solo, PiP, split)
```

---

## 🔄 State Management

### Session Storage (Per Broadcast)
```javascript
const liveShareSession = {
  mode: 'news',
  theme: {
    name: 'News',
    colors: {
      primary: '#DC2626',
      secondary: '#991B1B',
      accent: '#0052A5'
    },
    font: 'Helvetica Neue Bold'
  },
  graphics: {
    lowerThird: {
      active: true,
      name: 'Jane Smith',
      title: 'Lagos, Nigeria',
      position: 'bottom-left'
    },
    ticker: {
      active: true,
      headlines: [
        'Markets surge 10%',
        'Election results in',
        'Weather alert issued'
      ],
      speed: 50
    },
    banner: {
      active: true,
      text: 'BREAKING NEWS',
      position: 'top'
    },
    logoBug: {
      active: true,
      url: 'https://cdn.wewatch.com/logos/user123.png',
      position: 'top-right',
      opacity: 0.8
    }
  },
  mediaQueue: [
    {
      id: 1,
      type: 'image',
      url: 'intro-logo.png',
      status: 'queued'
    },
    {
      id: 2,
      type: 'video',
      url: 'weather-map.mp4',
      status: 'queued'
    }
  ],
  audio: {
    backgroundMusic: {
      url: null,
      volume: 0.3
    },
    ducking: {
      enabled: true,
      level: 0.2
    }
  }
};
```

### WebSocket Sync Messages
```javascript
// When host changes theme color
{
  type: 'liveshare_theme_update',
  sessionId: 'sess_123',
  data: {
    colors: {
      primary: '#FF0000' // Changed to brighter red
    }
  }
}

// When host shows lower third
{
  type: 'liveshare_graphics_update',
  sessionId: 'sess_123',
  data: {
    layer: 'lower_third',
    active: true,
    content: {
      name: 'Jane Smith',
      title: 'Lagos, Nigeria'
    }
  }
}

// When host plays media from queue
{
  type: 'liveshare_media_play',
  sessionId: 'sess_123',
  data: {
    mediaId: 1,
    url: 'https://cdn.wewatch.com/media/intro-logo.png',
    duration: 5000 // Auto-hide after 5s
  }
}

// When host toggles ticker
{
  type: 'liveshare_ticker_update',
  sessionId: 'sess_123',
  data: {
    active: true,
    headlines: [
      'Markets surge 10%',
      'Election results in'
    ]
  }
}
```

---

## 📐 Component Hierarchy

```
LeftSidebar.jsx (existing)
├─ LiveShareTab (NEW section in existing file)
   │
   ├─ LiveShareModeSelector.jsx (NEW)
   │  ├─ Props: onModeSelect, currentMode
   │  └─ Shows 4 mode buttons
   │
   └─ LiveShareStudioControls.jsx (NEW)
      │
      ├─ ThemeCustomizer (NEW)
      │  ├─ Color pickers
      │  ├─ Font selector
      │  └─ Reset button
      │
      ├─ GraphicsControls (NEW)
      │  ├─ LowerThirdControl
      │  ├─ TickerControl
      │  ├─ BannerControl
      │  └─ LogoBugControl
      │
      ├─ MediaQueueManager (NEW)
      │  ├─ Upload area
      │  ├─ Queue list
      │  └─ Play/Delete buttons
      │
      ├─ AudioEnhancementsControls (NEW)
      │  ├─ Background music upload
      │  ├─ Volume slider
      │  └─ Ducking slider
      │
      └─ BroadcastButtons (NEW)
         ├─ Start Camera
         └─ Share Screen
```

---

## 🎨 Styling Guide

### Mode Colors (Border/Accent)
```css
.mode-regular {
  border: 2px solid #3B82F6; /* Blue */
}
.mode-podcast {
  border: 2px solid #9333EA; /* Purple */
}
.mode-news {
  border: 2px solid #DC2626; /* Red */
}
.mode-show {
  border: 2px solid #10B981; /* Green */
}
```

### Control Sections
```css
.studio-section {
  background: rgba(217, 217, 217, 0.1);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.studio-section-title {
  font-size: 12px;
  font-weight: 700;
  color: #9CA3AF;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
}
```

### Interactive Elements
```css
.graphic-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.graphic-toggle:hover {
  background: rgba(0, 0, 0, 0.5);
}

.graphic-toggle input[type="checkbox"] {
  width: 20px;
  height: 20px;
  accent-color: var(--mode-color); /* Mode-specific */
}
```

---

## 🚀 Implementation Steps (Phase 1 - MVP)

### 1. Update LeftSidebar.jsx (2 hours)
- Add LiveShareModeSelector component
- Add basic ThemeCustomizer
- Add LogoBugControl (upload + display)
- Add LowerThirdControl (name + title inputs)

### 2. Create GraphicsRenderer.js (1 hour)
- Canvas setup
- Draw logo bug
- Draw lower third (static, no animation)
- Layer management (z-index)

### 3. Backend API Endpoints (1 hour)
- POST `/api/liveshare/graphics/upload` (logo upload to S3)
- POST `/api/liveshare/theme/update` (save theme to session)
- GET `/api/liveshare/session/:id` (fetch current graphics state)

### 4. WebSocket Integration (30 mins)
- Add message types: `liveshare_theme_update`, `liveshare_graphics_update`
- Broadcast to all viewers in session

### 5. Testing (30 mins)
- Upload logo → displays on canvas
- Change theme colors → updates overlay
- Edit lower third → shows name/title
- Mode switching → loads correct defaults

**Total: 5 hours** ✅

---

## ✅ Pre-Implementation Checklist

- [x] UI flow defined (mode → customize → broadcast)
- [x] Component hierarchy designed
- [x] State management planned
- [x] WebSocket messages specified
- [x] Performance validated (lightweight)
- [x] API endpoints identified
- [ ] Figma mockups (optional, can skip for MVP)
- [ ] Database migrations written
- [ ] S3 bucket configured for media uploads
- [ ] CloudFront distribution for CDN delivery

---

**Ready to implement?** All architectural decisions made. Start with Phase 1 MVP (5 hours).

**Questions remaining:**
1. Should we add mode switching after going live? (or lock mode once live?)
2. Auto-save theme preferences for next session? (or reset to defaults?)
3. Limit media queue items? (suggest 5 max for MVP)

Let me know and we can begin! 🚀
