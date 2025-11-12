# 3D Cinema Seat Assignment System

## Overview
Calculated seat positioning system for 7x6 grid (42 seats total) based on measured corner positions from GLB model.

## Files Created

### `seatCalculator.js`
**Purpose:** Core seat calculation logic
- Generates all 42 seat positions from 6 measured corner positions
- Calculates spacing: ~0.46 units per seat (X), ~0.72 units per row (Z), ~0.25 units elevation (Y)
- Interpolates rotations so seats angle toward screen appropriately
- Identifies premium seats (Row 3-4, Seat 4 - middle seats with best view)
- Assigns users to seats via `assignUserToSeat(userId)`

**Key Functions:**
- `generateAllSeats()` → Returns array of 42 seat objects
- `getSeatById(id)` → Get specific seat (1-42)
- `assignUserToSeat(userId, preference)` → Assign user to seat position
- `getPremiumSeats()` → Get middle seats in middle rows

### `SeatMarkers.jsx`
**Purpose:** Visual verification of calculated positions
- Renders green spheres at each seat position
- Gold spheres for premium seats
- Floating labels showing seat numbers
- Info panel showing seat statistics

**Props:**
- `showLabels` - Display seat numbers (default: true)
- `showPremiumOnly` - Only show premium seats (default: false)
- `markerSize` - Size of sphere markers (default: 0.1)

### Updated `CinemaScene3D.jsx`
**Changes:**
- Imports seat calculator and markers
- Generates all 42 seats on mount
- Assigns authenticated user to a seat
- Uses assigned seat's position/rotation for camera
- Conditionally shows seat markers via `showSeatMarkers` prop
- Updated debug panel to show assigned seat info

### Updated `CinemaScene3DDemo.jsx`
**Changes:**
- Added test controls for trying different seats
- Number input to test seats 1-42
- Quick jump buttons for front/middle/back seats
- Random seat assignment button
- Toggle to show/hide seat markers
- Premium seats highlighted in yellow

## Measured Seat Positions

Based on your navigation data:

| Position | Row | Seat | X | Y | Z | Notes |
|----------|-----|------|-------|------|-------|-------|
| Front-Left | 1 | 1 | -3.08 | 2.37 | -1.15 | Starting reference |
| Front-Right | 1 | 7 | -5.94 | 2.34 | -1.06 | |
| Mid-Left | 3 | 1 | -3.11 | 3.09 | -2.86 | |
| Mid-Right | 3 | 7 | -6.07 | 2.75 | -2.61 | Premium row |
| Back-Left | 6 | 1 | -3.20 | 3.78 | -5.07 | |
| Back-Right | 6 | 7 | -5.74 | 3.43 | -4.30 | |

## Calculated Pattern

```javascript
Spacing per seat (X-axis): ~0.46 units (negative, decreasing left→right)
Spacing per row (Z-axis): ~0.72 units (negative, decreasing front→back)
Elevation per row (Y-axis): ~0.25 units (positive, rising front→back)
```

## Premium Seats
Seats with best view (middle of middle rows):
- Seat #18: Row 3, Seat 4 ⭐
- Seat #25: Row 4, Seat 4 ⭐

## Testing

1. Navigate to `/cinema-3d-demo`
2. Use test controls to jump to different seats
3. Verify seat markers align with actual GLB seat models
4. Check that camera view faces screen correctly from each position
5. Toggle markers on/off to see calculated vs actual positions

## Multi-User Support

**Current:** Single user assigned to seat based on `authenticatedUserID`
**Scalable:** Multiple users can share same camera position (60+ users possible)
**Round-robin:** User ID modulo 42 ensures even distribution

## Future Features (Noted in Code)

### Avatar System
- Show 3D avatar meshes at other users' seat positions
- Display username/messages above avatar heads
- Show emotes/reactions floating above avatars
- Simple sphere or basic humanoid mesh

**Files to create:**
- `UserAvatar.jsx` - Avatar mesh component
- `MessageBubble.jsx` - Floating text above avatars
- `EmoteAnimation.jsx` - Reaction animations

### Seat Swapping
- UI for selecting different seat
- Smooth camera transition animation (lerp)
- WebSocket event to broadcast position change
- Update other users' avatar positions

## Camera Lock (Planned)

Restrict OrbitControls to prevent free movement:
```javascript
<OrbitControls
  enablePan={false}           // No position movement
  enableZoom={false}          // Optional: no zoom
  minAzimuthAngle={-Math.PI/4}  // Look left limit
  maxAzimuthAngle={Math.PI/4}   // Look right limit
  minPolarAngle={Math.PI/3}     // Look up limit
  maxPolarAngle={2*Math.PI/3}   // Look down limit
/>
```

Users can only rotate head (look around) but stay in assigned seat.

## Next Steps

1. ✅ Verify seat markers align with GLB model seats
2. ⏳ Test all 42 seat positions for correct view
3. ⏳ Implement camera movement restrictions
4. ⏳ Add dynamic lighting system (dim for movies)
5. ⏳ Build avatar system for multi-user presence
6. ⏳ Implement seat swapping feature
