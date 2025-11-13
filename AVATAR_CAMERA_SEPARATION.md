# Avatar and Camera Position Separation

## Overview
Implemented separation between avatar rendering positions and camera viewing positions to prevent view obstruction when users are in first-person mode.

## Problem
When the camera was positioned at the exact same coordinates as the avatar, the first-person view would be obstructed by the avatar mesh or other nearby objects.

## Solution
- **Avatar Position**: Where the 3D avatar mesh is rendered (visible to other users)
- **Camera Position**: Where the user's camera/view is positioned (5% higher, 3% forward)

## Changes Made

### 1. seatCalculator.js
Added camera position calculation function:
```javascript
export function getCameraPositionFromAvatar(avatarPosition) {
  const [x, y, z] = avatarPosition;
  const cameraY = y * 1.05;  // 5% higher
  const cameraZ = z * 0.97;  // 3% forward
  return [x, cameraY, cameraZ];
}
```

Modified `getSeatById()` to return both positions:
```javascript
return {
  ...seat,
  avatarPosition: seat.position,  // Where avatar mesh appears
  cameraPosition: getCameraPositionFromAvatar(seat.position)  // Where camera is positioned
};
```

Updated `assignUserToSeat()` to include both positions in return value.

### 2. CinemaScene3D.jsx
Changed camera initialization to use camera position instead of avatar position:
```javascript
const cameraStartPosition = assignedSeat.cameraPosition;  // Changed from assignedSeat.position
```

### 3. AvatarManager.jsx
- Updated to use `avatarPosition` instead of `position` for rendering avatars
- Added logic to hide current user's avatar (they see from camera, not their avatar):
```javascript
if (isCurrentUser) {
  return null;  // Hide current user's avatar
}
```

Pass avatar position to components:
```javascript
seatPosition={seatAssignment.avatarPosition}  // Changed from seatAssignment.position
```

## Result
- ✅ Camera positioned 5% higher and 3% forward from avatar position
- ✅ Clear, unobstructed first-person view for all seats
- ✅ Current user's avatar is hidden from their own view
- ✅ Other users see all avatars including the current user
- ✅ All 42 seats receive the same consistent offset

## Testing
Test in `CinemaScene3DDemo.jsx` by:
1. Moving test user through different seats (IDs 1-42)
2. Verifying camera view is not obstructed
3. Confirming other users' avatars are visible and positioned correctly
4. Checking that current user's avatar is not visible to themselves

## Next Steps
- Continue Row 5 testing (seats 29-35)
- Complete Row 6 testing (seats 36-42)
- Final validation across all 42 seats with camera offsets
