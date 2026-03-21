# 🎯 Cinema Position Calculator Guide

## Overview
The Position Calculator is a developer tool for manually recording seat positions and camera views for the cinema's 42 seats. This replaces the old interpolation-based system with precise, hand-tuned positions.

## Quick Start

### 1. Open the Position Calculator
- Press **`P`** key while in the cinema to toggle the modal
- Modal appears over the 3D scene

### 2. Navigation Controls
When the modal is open, you have **free camera movement**:
- **`W`** - Move forward (negative Z)
- **`A`** - Move left (negative X)
- **`S`** - Move backward (positive Z)
- **`D`** - Move right (positive X)
- **`C`** - Move up (positive Y)
- **`V`** - Move down (negative Y)

### 3. Recording Workflow

For each seat (1-42):

1. **Select seat** from dropdown (e.g., "Seat 1 (Row 1, Seat 1)")
2. **Position camera** at the exact seat location using WASD+CV
3. Click **"💾 Save Seat Position"** - This saves where the avatar will stand
4. **Look left** and click **"⬅️ Left"** to save left camera view
5. **Look at screen** and click **"📺 Center"** to save center camera view
6. **Look right** and click **"➡️ Right"** to save right camera view
7. Move to next seat and repeat

### 4. Export Data
- After recording all 42 seats, click **"📥 Export JSON"**
- Save file to replace `frontend/public/cinema/cinemaSeats.json`

## File Structure

### cinemaSeats.json Format
```json
{
  "seats": [
    {
      "id": 1,
      "row": 1,
      "seatInRow": 1,
      "position": [x, y, z],  // Avatar standing position
      "cameraViews": {
        "left": { 
          "position": [x, y, z],  // Camera position
          "lookAt": [x, y, z]     // Camera look-at target
        },
        "center": { "position": [...], "lookAt": [...] },
        "right": { "position": [...], "lookAt": [...] }
      }
    },
    // ... 41 more seats
  ]
}
```

## Tips

### Positioning Strategy
1. **Start from front row** (Row 1, Seats 1-7)
2. Work **row by row** from front to back
3. Within each row, go **left to right**
4. Take breaks to avoid fatigue - save JSON frequently!

### Position Verification
- Current position shown in modal: `[x, y, z]`
- Look at coordinates to ensure consistency
- Typical cinema positions:
  - **X**: -15 to +15 (left to right)
  - **Y**: 0 to 5 (floor to head height)
  - **Z**: -10 to +10 (back to front)

### Camera View Guidelines
- **Left view**: Looking towards left wall/corner
- **Center view**: Looking at screen (negative Z direction)
- **Right view**: Looking towards right wall/corner
- Keep consistent head heights across all seats

## Keyboard Shortcuts Summary
| Key | Action |
|-----|--------|
| `P` | Toggle Position Calculator modal |
| `W/A/S/D` | Move camera horizontally |
| `C/V` | Move camera up/down |
| `L` | Snap to left view (when seated) |
| `C` | Snap to center view (when seated) |
| `R` | Snap to right view (when seated) |

## Next Steps
After completing position recording:
1. Export cinemaSeats.json
2. Replace file in `frontend/public/cinema/`
3. Update CinemaAvatarManager to load from JSON (Phase 4)
4. Remove seatCalculator.js dependencies
5. Test seat swapping with new positions
