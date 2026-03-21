# Cinema Seat Assignment Debug Logs

## Changes Made (2026-01-26)

### Problem Identified
- Host (userId 7) gets Seat 36 → Position `5-0` (Row 6, Seat 1 - back left)
- Member (userId 8) gets Seat 35 → Position `4-6` (Row 5, Seat 7 - front right)
- **They are in DIFFERENT ROWS**, not next to each other!

### Root Cause
The `assignUserToSeat()` function uses **reverse-fill algorithm**:
```javascript
const totalSeats = 42;
const reverseSeatIndex = (userId - 1) % totalSeats;
const seatId = totalSeats - reverseSeatIndex;

// userId 7: reverseSeatIndex = 6, seatId = 42 - 6 = 36
// userId 8: reverseSeatIndex = 7, seatId = 42 - 7 = 35
```

**Seat Layout:**
```
Row 1: [1]  [2]  [3]  [4]  [5]  [6]  [7]     ← FRONT
Row 2: [8]  [9]  [10] [11] [12] [13] [14]
Row 3: [15] [16] [17] [18] [19] [20] [21]
Row 4: [22] [23] [24] [25] [26] [27] [28]
Row 5: [29] [30] [31] [32] [33] [34] [35]    ← userId 8 = Seat 35
Row 6: [36] [37] [38] [39] [40] [41] [42]    ← userId 7 = Seat 36, BACK
```

### Debug Logs Added

#### 1. **Initial Seat Assignment** (CinemaScene3DDemo.jsx:162)
```javascript
🎯 [SEAT ASSIGNMENT] User 7 (chibi) → Seat #36 = Row 6, Col 1 (key: 5-0)
🎯 [SEAT ASSIGNMENT] User 8 (michelle) → Seat #35 = Row 5, Col 7 (key: 4-6)
```

#### 2. **Auto-Assignment Trigger** (CinemaScene3DDemo.jsx:1055)
```javascript
🪑 [AUTO-ASSIGN] Assigning user 7 to seat 5-0
📡 [AUTO-ASSIGN] Broadcasting to backend: user 7 → seat 5-0
```

#### 3. **Avatar Rendering** (AvatarManager.jsx:110-127)
```javascript
✅ [AVATAR] chibi (ID: 7) → seat 5-0
❌ [AVATAR] michelle (ID: 8) - NO SEAT (filtered out)
🎬 [AVATAR] Rendering 1/2 real users with seats
```

#### 4. **Seat State Updates** (CinemaScene3DDemo.jsx:87-92)
```javascript
🪑 [SEATS] 2 real users seated: 7→5-0, 8→4-6
```

### Verbose Logs Removed

**Before:**
```javascript
🎬 [CinemaScene3D] Passing to AvatarManager: 2 real members, 1 real seats  // Spammed every frame!
🪑 [CinemaScene3D] Auto-assign effect running: {...}  // Every useEffect run
👥 [AvatarManager] Members: 2 real, 14 demo | Seats: 15  // Every render
```

**After:**
- Removed per-frame logging from CinemaScene3D
- Removed verbose useEffect dependency logging
- Consolidated AvatarManager logs to single line per user

### Expected Log Flow (Fresh Join)

**Host Tab:**
```javascript
🎯 [SEAT ASSIGNMENT] User 7 (chibi) → Seat #36 = Row 6, Col 1 (key: 5-0)
🪑 [AUTO-ASSIGN] Assigning user 7 to seat 5-0
📡 [AUTO-ASSIGN] Broadcasting to backend: user 7 → seat 5-0
✅ [AVATAR] chibi (ID: 7) → seat 5-0
🎬 [AVATAR] Rendering 1/1 real users with seats
```

**Member Tab:**
```javascript
🎯 [SEAT ASSIGNMENT] User 8 (michelle) → Seat #35 = Row 5, Col 7 (key: 4-6)
🪑 [AUTO-ASSIGN] Assigning user 8 to seat 4-6
📡 [AUTO-ASSIGN] Broadcasting to backend: user 8 → seat 4-6
✅ [AVATAR] chibi (ID: 7) → seat 5-0
✅ [AVATAR] michelle (ID: 8) → seat 4-6
🎬 [AVATAR] Rendering 2/2 real users with seats
```

**Host Tab (After Member Joins):**
```javascript
✅ [AVATAR] chibi (ID: 7) → seat 5-0
❌ [AVATAR] michelle (ID: 8) - NO SEAT (filtered out)
🎬 [AVATAR] Rendering 1/2 real users with seats
// ... after seat_state_refresh ...
✅ [AVATAR] michelle (ID: 8) → seat 4-6
🎬 [AVATAR] Rendering 2/2 real users with seats
```

## Next Steps

### Option 1: Sequential Fill (Seats Next to Each Other)
Change algorithm to fill seats in order:
```javascript
const seatId = ((userId - 1) % totalSeats) + 1;
// userId 7 → seat 7
// userId 8 → seat 8 (next to each other in Row 2)
```

### Option 2: Back Row Priority (Current, but Fix Gaps)
Keep reverse fill but start from seat 42:
```javascript
const seatId = 43 - userId;  // Simple reverse
// userId 7 → seat 36
// userId 8 → seat 35 (still different rows!)
```

### Option 3: Back Row, Left to Right
Fill back row first, then move forward:
```javascript
const seatsPerRow = 7;
const rowFromBack = Math.floor((userId - 1) / seatsPerRow);
const colInRow = (userId - 1) % seatsPerRow;
const row = 6 - rowFromBack;  // Start from row 6
const seat = (row - 1) * 7 + colInRow + 1;
// userId 7 → Row 6, Col 0 → Seat 36
// userId 8 → Row 6, Col 1 → Seat 37 (NEXT TO EACH OTHER!)
```

## Recommendation

Use **Option 3** for cinema - fills back row left-to-right, then moves forward. This keeps early users together in the back row.

**Modified `assignUserToSeat()` for Cinema:**
```javascript
export function assignUserToSeat(userId, userPreference = null) {
  const seats = generateAllSeats();
  if (userPreference === 'premium') {
    const premiumSeats = seats.filter(s => s.isPremium);
    const seat = premiumSeats[Math.floor(Math.random() * premiumSeats.length)];
    return { ...seat, avatarPosition: seat.position, cameraPosition: getCameraPositionFromAvatar(seat.position, seat.id) };
  }

  // Fill back row first (Row 6), left to right, then Row 5, etc.
  const seatsPerRow = 7;
  const rowFromBack = Math.floor((userId - 1) / seatsPerRow);
  const colInRow = (userId - 1) % seatsPerRow;
  const row = 6 - rowFromBack;  // Row 6 → Row 1
  const seatInRow = colInRow + 1;  // 1-based
  const seatId = (row - 1) * seatsPerRow + seatInRow;
  
  return getSeatById(seatId);
}
```

**Result:**
- userId 7 → Seat 36 (Row 6, Col 1)
- userId 8 → Seat 37 (Row 6, Col 2) ← **NEXT TO EACH OTHER!**
- userId 9 → Seat 38 (Row 6, Col 3)
- ...
- userId 14 → Seat 42 (Row 6, Col 7) ← Back row filled
- userId 15 → Seat 29 (Row 5, Col 1) ← Next row

---

**Status**: Debug logs added, verbose spam reduced. Ready to test and see clear seat assignments.
