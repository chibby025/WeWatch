# Church Mode: Hymns Feature

## Overview
Complete hymn lyrics display system for Church mode broadcasts, enabling pastors to display worship song lyrics in real-time without audio playback. This completes the Church mode "overlay trilogy" alongside Bible verses and presentation slides.

## Features

### 🎵 Hymn Search & Selection
- **Quick Access**: 10 popular hymns for instant selection
  - Amazing Grace
  - How Great Thou Art
  - Holy, Holy, Holy
  - Blessed Assurance
  - Great Is Thy Faithfulness
  - It Is Well With My Soul
  - Just As I Am
  - Rock of Ages
  - Be Thou My Vision
  - A Mighty Fortress

- **API Search**: Search Hymnary.org's database of thousands of hymns
  - Search by title or hymn number
  - Real-time results from comprehensive database
  - Fallback support for offline use

### 📖 Verse-by-Verse Display
- Display one verse at a time (like traditional worship projection)
- Clear verse numbering (Verse 1, Verse 2, Chorus, etc.)
- Smooth navigation between verses
- Shows current verse position (e.g., "Verse 2 of 4")

### 🎨 Customizable Display
- **Text Color**: White, Gold, Cyan, Yellow, Pink presets
- **Title Color**: Separate color for hymn title
- **Text Size**: 24px to 48px range
- **Text Weight**: Normal, Bold, Light options
- **Text Case**: Normal, Uppercase, Lowercase, Capitalize
- **Background**: Customizable background color/opacity

### ⌨️ Studio Controls
- Show/Hide toggle (instant on/off)
- Previous/Next verse navigation
- Current verse indicator
- Verse counter display
- Author attribution

## Architecture

### Components

#### **HymnsControl.jsx**
Studio control panel for selecting and managing hymns during broadcast.

**Props:**
- `onShowHymn(hymnData)` - Callback to display hymn
- `onHideHymn()` - Callback to hide hymn
- `currentHymn` - Currently displayed hymn object
- `currentVerse` - Current verse number (1-indexed)

**State:**
- Search query and results
- Selected hymn preview
- Text styling options
- Loading and error states

**Features:**
- Quick access buttons for popular hymns
- API search functionality
- Verse navigation controls
- Customization options (expandable details)

#### **HymnOverlay.jsx**
Full-screen overlay component for displaying hymn lyrics to viewers.

**Props:**
- `hymn` - Hymn object with verses and metadata
- `isActive` - Whether overlay is visible
- `currentVerse` - Current verse number
- `onDismiss` - Close handler (host only)

**Display:**
- Full-screen overlay with customizable background
- Hymn title at top
- Current verse text (large, centered)
- Verse type indicator (Verse 1, Chorus, etc.)
- Author attribution
- Navigation hint
- Fade-in/out animations

### API Integration

#### **hymnsApi.js**
Utility functions for Hymnary.org API integration.

**Functions:**
```javascript
// Search hymns by title or text
searchHymns(query) → Promise<Array<HymnResult>>

// Get full hymn details with all verses
getHymnDetails(hymnId) → Promise<HymnData>

// Parse API response into display format
parseHymnData(apiResponse) → HymnData

// Split hymn text into individual verses
splitIntoVerses(text) → Array<Verse>

// Get fallback hymn for offline support
getFallbackHymn(hymnId) → HymnData | null
```

**Constants:**
```javascript
POPULAR_HYMNS // Array of 10 common hymns for quick access
FALLBACK_HYMNS // Offline support data (Amazing Grace preloaded)
```

**API Endpoint:**
```
https://hymnary.org/api/hymn.json?query={query}&max=20
https://hymnary.org/api/hymn/{hymnId}.json
```

### LiveShareManager Integration

**New State (lines 315-317):**
```javascript
const [currentHymn, setCurrentHymn] = useState(null);
const [currentHymnVerse, setCurrentHymnVerse] = useState(1);
```

**New Handlers (lines 1215-1295):**
```javascript
handleShowHymn(hymnData) // Display hymn overlay
handleHideHymn() // Hide hymn overlay
handleChangeHymnVerse(verseNumber) // Navigate between verses
```

**Mode Controls Map (line 416):**
```javascript
church: {
  // ... other controls
  hymns: true, // ✅ Enabled for Church mode only
}
```

**Studio Controls Render (lines 2874-2882):**
```javascript
{shouldShowControl('hymns') && (
  <HymnsControl
    onShowHymn={handleShowHymn}
    onHideHymn={handleHideHymn}
    currentHymn={currentHymn}
    currentVerse={currentHymnVerse}
  />
)}
```

## Data Flow

### 1. Host Searches for Hymn
```
User types in HymnsControl search → 
searchHymns() API call → 
Display results → 
User selects hymn → 
getHymnDetails() API call → 
Show preview with verse count
```

### 2. Host Displays Hymn
```
User clicks "Show on Screen" → 
handleShowHymn(hymnData) → 
Update state (currentHymn, currentHymnVerse) → 
Broadcast via WebSocket → 
Update GraphicsRenderer → 
Show HymnOverlay to all viewers
```

### 3. Host Changes Verse
```
User clicks Next/Previous in HymnsControl → 
handleChangeHymnVerse(verseNumber) → 
Update state (currentHymnVerse) → 
Broadcast via WebSocket → 
Update GraphicsRenderer → 
HymnOverlay updates to new verse
```

### 4. Host Hides Hymn
```
User clicks "Hide" → 
handleHideHymn() → 
Clear state (currentHymn, currentHymnVerse) → 
Broadcast via WebSocket → 
Remove from GraphicsRenderer → 
HymnOverlay disappears for all viewers
```

## WebSocket Protocol

### Hymn Update Message
```javascript
{
  type: 'hymn_update',
  data: {
    hymn: {
      title: 'Amazing Grace',
      author: 'John Newton',
      verses: [...],
      textStyle: {
        color: '#FFFFFF',
        titleColor: '#FFD700',
        size: 36,
        weight: 400,
        case: 'none'
      },
      backgroundColor: 'rgba(0, 0, 0, 0.95)'
    },
    verse: 2, // Current verse number
    active: true // true = show, false = hide
  }
}
```

## Use Cases

### Real-World Church Example
**Scenario**: Sunday morning worship service at small community church

**Before WeWatch**:
- Needed: $2,000 projector + laptop + HDMI cables + PowerPoint software
- Setup: 30 minutes before service to connect everything
- Barrier: Many small churches couldn't afford equipment

**With WeWatch Church Mode**:
1. Pastor opens WeWatch on phone (cost: $0 with existing device)
2. Starts LiveShare in Church mode
3. Congregation watches on TV or personal devices
4. Pastor searches "Amazing Grace" in HymnsControl
5. Clicks "Show on Screen" → Everyone sees lyrics
6. Swipes to next verse → All viewers see Verse 2
7. After song, clicks "Hide" → Continues with sermon slides

**Impact**: Removes $2,000+ equipment barrier, enables any church to broadcast worship

## Competitive Advantage

### What Makes This Unique
1. **Phone-Only Operation**: No laptop, projector, or cables needed
2. **Free Hymn Database**: Access to thousands of hymns via Hymnary.org
3. **Text-Only Approach**: No copyright issues (displaying lyrics you already own rights to)
4. **Integrated System**: Seamlessly switch between hymns, Bible verses, and slides
5. **Multi-Device Viewing**: Viewers watch on any device (TV, phone, tablet)

### Competitor Comparison
| Feature | WeWatch Church | ProPresenter | EasyWorship | Proclaim |
|---------|----------------|--------------|-------------|----------|
| **Cost** | Free | $399 | $299 | $499/year |
| **Equipment** | Phone only | Laptop + projector | Laptop + projector | Laptop + projector |
| **Setup Time** | 30 seconds | 15-30 minutes | 15-30 minutes | 15-30 minutes |
| **Hymns Database** | Free (Hymnary) | Paid licenses | Paid licenses | Paid licenses |
| **Bible Verses** | ✅ Built-in | ✅ Yes | ✅ Yes | ✅ Yes |
| **Slides** | ✅ Upload from phone | ✅ Yes | ✅ Yes | ✅ Yes |
| **Multi-Device** | ✅ Any device | ❌ Projector only | ❌ Projector only | ❌ Projector only |

## Bundle Impact

### Code Size Analysis
- **HymnsControl.jsx**: ~300 lines (~12KB)
- **HymnOverlay.jsx**: ~120 lines (~5KB)
- **hymnsApi.js**: ~150 lines (~5KB)
- **Total Addition**: ~22KB uncompressed
- **Gzipped Estimate**: ~6KB (minimal impact)

### Performance Optimization
- Lazy loaded as part of LiveShareManager chunk
- API calls only when user searches (not on initial load)
- Fallback hymns preloaded for offline support (1 hymn = ~2KB)
- No media files (text only = minimal bandwidth)

## Testing Checklist

### Functional Tests
- [ ] Search hymns by title
- [ ] Select popular hymn from quick access
- [ ] Display hymn with default styling
- [ ] Navigate between verses (Next/Previous)
- [ ] Hide hymn overlay
- [ ] Customize text color, size, weight, case
- [ ] Handle API errors gracefully
- [ ] Use fallback hymn when offline

### Integration Tests
- [ ] Hymn displays on all viewer devices
- [ ] WebSocket synchronization works correctly
- [ ] Switch between Bible, Hymn, and Presentation overlays
- [ ] Only one overlay visible at a time
- [ ] Graphics renderer updates properly
- [ ] Toast notifications appear for actions

### UX Tests
- [ ] Search is fast and responsive
- [ ] Results are relevant to query
- [ ] Verse navigation is intuitive
- [ ] Styling options are easy to use
- [ ] Overlay is readable on various screen sizes
- [ ] Fade animations are smooth

## Future Enhancements

### Potential Features
1. **Chord Charts**: Display guitar/piano chords above lyrics
2. **Multiple Languages**: Search and display hymns in different languages
3. **Custom Hymns**: Allow users to add their own church's hymns
4. **Slide Backgrounds**: Add background images to hymn overlays
5. **Split Screen**: Show lyrics + chords simultaneously
6. **Export/Print**: Generate printable hymn sheets
7. **Favorites**: Save frequently used hymns for quick access
8. **Auto-Advance**: Automatically advance verses with timer

### Backend Requirements (Optional)
1. **Hymn Caching**: Cache popular hymns to reduce API calls
   - Endpoint: `GET /api/hymns/popular`
   - Store top 100 hymns in database
   - Refresh weekly

2. **Usage Analytics**: Track most-used hymns per church
   - Endpoint: `POST /api/sessions/:id/hymn-log`
   - Help churches discover popular songs

3. **Custom Hymns**: Store user-uploaded hymns
   - Endpoint: `POST /api/hymns/custom`
   - Per-user or per-church storage

## Documentation for Pastors

### Quick Start Guide
1. **Start Church Mode**: Tap "LiveShare" → Select "Church Mode"
2. **Open Hymns Control**: Scroll to "🎵 Hymn Lyrics" section in Studio Controls
3. **Quick Select**: Tap any popular hymn for instant display
4. **Search**: Type hymn title → Tap Search → Select from results
5. **Display**: Tap "Show on Screen" → Hymn appears for all viewers
6. **Navigate**: Tap ← → to change verses
7. **Hide**: Tap "Hide" when song is finished

### Tips for Best Experience
- **Prepare Ahead**: Search and preview hymns before service starts
- **Use Quick Access**: Add your 3-4 most common hymns to popular list
- **Test Visibility**: Check text color/size on sample viewer device
- **Practice Navigation**: Familiarize yourself with verse controls
- **One Overlay at a Time**: Hide Bible verse before showing hymn

## Implementation Status

### ✅ Completed
- [x] HymnsControl component with search and selection UI
- [x] HymnOverlay component with verse-by-verse display
- [x] hymnsApi.js utility with Hymnary.org integration
- [x] LiveShareManager integration (state, handlers, render)
- [x] WebSocket protocol for synchronization
- [x] Popular hymns quick access
- [x] Fallback hymns for offline support
- [x] Customizable text styling
- [x] Verse navigation controls

### 🔄 In Progress
- [ ] Build verification (check bundle size impact)
- [ ] Testing with real church service workflow
- [ ] Documentation for backend team (WebSocket handlers)

### 📋 Pending
- [ ] Backend hymn caching (optional optimization)
- [ ] Usage analytics (optional feature)
- [ ] Custom hymns storage (optional feature)
- [ ] Marketing materials for church outreach

## Summary

The hymns feature completes WeWatch's Church mode offering by providing a free, mobile-first solution for displaying worship song lyrics during broadcasts. Combined with Bible verses and presentation slides, churches can now conduct full services using only a phone, eliminating the $2,000+ equipment barrier and making quality broadcasting accessible to all congregations.

**Key Innovation**: Text-only overlays controlled from phone, synchronized to unlimited viewers on any device, with zero setup time and zero additional cost.
