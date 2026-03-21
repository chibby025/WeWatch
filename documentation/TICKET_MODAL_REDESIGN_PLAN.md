# 🎟️ Ticket Modal Redesign Plan - Two-Part Ticket Layout

## Current Situation
The existing implementation uses the full CINETICKET.svg (1.4MB) with foreignObject overlays. User feedback indicates the UI needs improvement.

## New Approach - Two SVG Files

### Available Assets
1. **blankticketinfo.svg** (233KB)
   - Dimensions: 696 x 365 pixels
   - Red top section with "CINEMA TICKET" text
   - Contains fields: Date, Time, Screen, Seat
   - **Purpose**: Display session information (decorative/read-only)

2. **blankticket.svg** (29KB)
   - Dimensions: 626 x 626 pixels  
   - Blank white section
   - **Purpose**: Interactive payment form area

## Layout Structure

```
┌─────────────────────────────────────────┐
│  🍿 CINEMA TICKET 🎬                    │  ← blankticketinfo.svg (TOP)
│  ═══════════════════════════════════    │
│  Date: 2/12/2026                        │     Session Info Section
│  Time: 01:46 PM                         │     - Watch Type (dynamic)
│  Screen: 3D Cinema                      │     - Started Date/Time
│  Seat: Balance: 0.21 tokens            │     - Balance Display
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  Payment Method                         │  ← blankticket.svg (BOTTOM)
│  🪙 Tokens    💳 Card                   │
│                                         │     Interactive Form Section
│  ☐ Gift this ticket                    │     - Payment method selector
│                                         │     - Gift checkbox + form
│  Purchase Summary                       │     - Purchase summary
│  Ticket Price: 0.82 tokens             │     - Action buttons
│  Payment: tokens                        │     - Footer notes
│  Total: 0.82 tokens                    │
│                                         │
│  [Cancel]  [🎟️ Purchase]               │
│  Card payments coming soon              │
└─────────────────────────────────────────┘
```

## Field Mapping

### blankticketinfo.svg Fields → Our Data
- **"CINEMA TICKET"** → Dynamic based on `session.watch_type`
  - `3d_cinema` → "CINEMA TICKET"
  - `video_watch` → "VIDEO WATCH TICKET"
  - `lecture_hall` → "LECTURE HALL TICKET"
  - Gift mode → "GIFT [TYPE] TICKET"

- **Date field** → `session.started_at` (date part)
- **Time field** → `session.started_at` (time part)
- **Screen field** → `session.watch_type` (capitalize)
- **Seat field** → Balance display: `wallet.token_balance`

### blankticket.svg Content (foreignObject)
All interactive form elements:
- Payment method tabs (Tokens/Card)
- Gift checkbox
- Recipient username input
- Gift message textarea
- Purchase summary
- Action buttons (Cancel/Purchase)
- Footer notes

## Visual Enhancements

### 1. Insufficient Balance Stamp
- **Position**: Overlay on blankticket.svg section
- **Style**: Rotated -15°, red circular stamp
- **Content**: "INSUFFICIENT BALANCE" + "BUY TOKENS" button
- **Condition**: `hasInsufficientBalance === true`

### 2. Gift Mode Ribbon
- **Position**: Diagonal corner (top-right of full modal)
- **Style**: Red ribbon with "🎁 GIFT" text
- **Condition**: `isGift === true`
- **Additional**: Changes top text to "GIFT [TYPE] TICKET"

### 3. Animation
- Ticket "tears" open vertically on mount
- Slide up from bottom with bounce effect
- Duration: 600ms ease-out

## Implementation Strategy

### Phase 1: SVG Analysis (Current Step)
- [x] Locate new SVG files
- [ ] Analyze blankticketinfo.svg structure
- [ ] Analyze blankticket.svg structure
- [ ] Identify text elements and IDs
- [ ] Plan foreignObject placement zones

### Phase 2: Component Restructure
- [ ] Replace CINETICKET.svg with two-part layout
- [ ] Position blankticketinfo.svg at top
- [ ] Position blankticket.svg at bottom
- [ ] Ensure proper aspect ratios maintained
- [ ] Test responsive scaling

### Phase 3: Dynamic Text Replacement
- [ ] Locate "CINEMA TICKET" text element in SVG
- [ ] Implement text replacement based on watch_type
- [ ] Map date/time/screen/seat fields to data
- [ ] Test text overflow handling

### Phase 4: foreignObject Content
- [ ] Create foreignObject zone for blankticket.svg
- [ ] Move all interactive elements to this zone
- [ ] Maintain existing functionality (payment, gift, validation)
- [ ] Ensure proper z-indexing

### Phase 5: Visual Overlays
- [ ] Implement insufficient balance stamp
- [ ] Implement gift mode ribbon
- [ ] Position overlays correctly over two-part layout
- [ ] Add tearing animation

### Phase 6: Testing & Polish
- [ ] Test all watch types (cinema/video/lecture)
- [ ] Test insufficient balance flow
- [ ] Test gift mode flow
- [ ] Test responsive behavior (mobile/tablet/desktop)
- [ ] Verify animation smoothness
- [ ] Check accessibility (screen readers, keyboard nav)

## Technical Considerations

### SVG Text Manipulation Options

**Option A: Direct SVG DOM Manipulation**
```jsx
useEffect(() => {
  const svgText = document.querySelector('#cinema-text');
  if (svgText) svgText.textContent = getWatchTypeDisplay();
}, [session.watch_type, isGift]);
```
- Pros: Direct, efficient
- Cons: Requires specific element IDs in SVG

**Option B: CSS Overlay**
```jsx
<div className="absolute top-[position] left-[position]">
  <span className="text-red-800 font-black">
    {getWatchTypeDisplay()} TICKET
  </span>
</div>
```
- Pros: Flexible, easy to style
- Cons: Positioning needs precise calibration

**Option C: SVG with embedded foreignObject for text**
```xml
<foreignObject x="100" y="50" width="400" height="60">
  <div>{dynamicText}</div>
</foreignObject>
```
- Pros: Part of SVG, scales properly
- Cons: Requires modifying SVG file

### Responsive Strategy
- Container: `max-w-lg` (portrait orientation)
- Stack vertically: top SVG above bottom SVG
- Use CSS Grid or Flexbox for layout
- SVG viewBox preserves aspect ratio automatically
- Media queries for mobile font sizes

### Performance
- **blankticket.svg**: 29KB (very lightweight!)
- **blankticketinfo.svg**: 233KB (reasonable)
- **Total**: ~262KB vs previous 1.4MB (81% reduction!)
- Consider lazy loading if modal not immediately visible

## Questions to Address

1. **SVG Text Elements**: Do blankticketinfo.svg text elements have IDs we can target?
2. **Color Scheme**: Does the red top section match our theme? (Looks good from description)
3. **Perforated Edge**: Is there a visual separator between the two SVGs we should honor?
4. **SVG Modifications**: Are we allowed to modify the SVG files directly, or must we use overlays?
5. **Field Usage**: Should we use ALL the fields (Date/Time/Screen/Seat), or can we combine/skip some?

## Proposed Field Usage

### Recommended Mapping
- **Date**: `new Date(session.started_at).toLocaleDateString()`
- **Time**: `new Date(session.started_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})`
- **Screen**: `session.watch_type` (capitalized: "3D Cinema", "Video Watch", "Lecture Hall")
- **Seat**: "Balance: X.XX tokens" (since there are no actual seats in virtual sessions)

### Alternative Mapping (if Seat doesn't fit)
- **Date**: Session start date
- **Time**: Session start time
- **Screen**: Watch type
- **Seat**: Host name or Session title

## Next Steps

1. **Analyze SVG Structure**: Open both SVG files in a text editor
   - Identify text element IDs and positions
   - Check for existing foreignObject zones
   - Note any special styling or gradients

2. **Create Mockup**: Sketch the exact layout with measurements
   - Calculate foreignObject coordinates
   - Determine text overlay positions
   - Plan stamp/ribbon absolute positioning

3. **Implement Prototype**: Build minimal version
   - Load both SVGs
   - Test dynamic text replacement
   - Verify responsive scaling

4. **Iterate**: Refine based on visual feedback
   - Adjust colors if needed
   - Fine-tune positioning
   - Polish animations

## Success Criteria
- ✅ Cleaner, more professional UI
- ✅ Better separation between info and interaction
- ✅ Dynamic text updates work smoothly
- ✅ All existing functionality preserved
- ✅ Responsive on all devices
- ✅ Faster load time (81% smaller assets)
- ✅ Animations enhance UX without being distracting
