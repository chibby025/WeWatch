/**
 * Seat Calculator for 3D Cinema
 * Uses measured seat positions from GLB model for accurate placement
 * 
 * Grid Layout:
 * Row 1 (Front):  Seat 1-7
 * Row 2:          Seat 8-14
 * Row 3 (Middle): Seat 15-21
 * Row 4:          Seat 22-28
 * Row 5:          Seat 29-35
 * Row 6 (Back):   Seat 36-42
 */

// Measured seat positions from GLB model - Row 1 (Front row, all 7 seats)
// Anchors: Seat 1 (Alice), Seat 5 (Eve), Seat 6 (Frank) are correctly positioned
// Seats 2, 3, 4 interpolated between 1 and 5
// Seat 7 extrapolated from 5 and 6
// Y-coordinates reduced by 20%, then further reduced by 5%
const ROW_1_MEASURED = [
  { seat: 1, position: [-3.11, 1.82, -0.27], rotation: [-180.0, -3.9, -180.0] },  // ✓ Correct (Alice)
  { seat: 2, position: [-3.57, 1.73, -0.89], rotation: [-180.0, -3.1, -180.0] },  // Interpolated
  { seat: 3, position: [-4.03, 1.73, -0.86], rotation: [-180.0, -6.8, -180.0] },  // Interpolated
  { seat: 4, position: [-4.49, 1.73, -0.84], rotation: [-180.0, -6.8, -180.0] },  // Interpolated
  { seat: 5, position: [-4.95, 1.75, -0.81], rotation: [-180.0, -6.4, -180.0] },  // ✓ Correct (Eve)
  { seat: 6, position: [-5.38, 1.77, -0.87], rotation: [-180.0, -6.4, -180.0] },  // ✓ Correct (Frank)
  { seat: 7, position: [-5.81, 1.78, -0.93], rotation: [-180.0, -13.9, -180.0] }  // Extrapolated
];

// Row 3 corner seats (for interpolation)
// Shifted 2% forward (Z reduced by 2%) and height reduced by 5%
// Further adjusted: 1.5% left (X reduced), 1% forward (Z reduced), 2% down (Y reduced)
// Then shifted 1% right (X increased)
const ROW_3_CORNERS = {
  seat1: { position: [-3.17, 2.67, -2.68], rotation: [-171.5, -2.8, -179.6] },
  seat7: { position: [-6.10, 2.43, -2.53], rotation: [-180.0, -41.0, -180.0] }
};

// Row 4 corner seats (for interpolation)
const ROW_4_CORNERS = {
  seat1: { position: [-3.19, 2.92, -3.22], rotation: [-165.2, 17.1, 175.6] },
  seat7: { position: [-5.89, 3.02, -3.26], rotation: [-171.0, -13.7, -177.9] }
};

// Row 6 (Back row) corner seats - confirmed correct
const ROW_6_CORNERS = {
  seat1: { position: [-3.20, 3.59, -5.07], rotation: [-167.4, 29.7, 173.7] },
  seat7: { position: [-5.74, 3.26, -4.30], rotation: [-180.0, -12.0, -180.0] }
};

/**
 * Interpolate a full row of 7 seats from corner seat measurements
 */
function interpolateRow(leftCorner, rightCorner) {
  const seats = [];
  
  for (let seatInRow = 1; seatInRow <= 7; seatInRow++) {
    const progress = (seatInRow - 1) / 6; // 0 at seat 1, 1 at seat 7
    
    const position = [
      leftCorner.position[0] + (rightCorner.position[0] - leftCorner.position[0]) * progress,
      leftCorner.position[1] + (rightCorner.position[1] - leftCorner.position[1]) * progress,
      leftCorner.position[2] + (rightCorner.position[2] - leftCorner.position[2]) * progress
    ];
    
    const rotation = [
      leftCorner.rotation[0] + (rightCorner.rotation[0] - leftCorner.rotation[0]) * progress,
      leftCorner.rotation[1] + (rightCorner.rotation[1] - leftCorner.rotation[1]) * progress,
      leftCorner.rotation[2] + (rightCorner.rotation[2] - leftCorner.rotation[2]) * progress
    ];
    
    seats.push({
      position: position.map(n => parseFloat(n.toFixed(2))),
      rotation: rotation.map(n => parseFloat(n.toFixed(1)))
    });
  }
  
  return seats;
}

/**
 * Interpolate row positions between two known rows
 */
function interpolateRowPosition(row, startRow, startData, endRow, endData, seatInRow) {
  const rowProgress = (row - startRow) / (endRow - startRow);
  
  const startSeat = startData[seatInRow - 1];
  const endSeat = endData[seatInRow - 1];
  
  return {
    position: [
      startSeat.position[0] + (endSeat.position[0] - startSeat.position[0]) * rowProgress,
      startSeat.position[1] + (endSeat.position[1] - startSeat.position[1]) * rowProgress,
      startSeat.position[2] + (endSeat.position[2] - startSeat.position[2]) * rowProgress
    ],
    rotation: [
      startSeat.rotation[0] + (endSeat.rotation[0] - startSeat.rotation[0]) * rowProgress,
      startSeat.rotation[1] + (endSeat.rotation[1] - startSeat.rotation[1]) * rowProgress,
      startSeat.rotation[2] + (endSeat.rotation[2] - startSeat.rotation[2]) * rowProgress
    ]
  };
}

/**
 * Generate all 42 seat positions
 * Uses measured data for accuracy
 */
export function generateAllSeats() {
  const seats = [];
  
  console.log('🎬 [SeatCalculator] Generating seats from measured positions');
  
  // Row 1: Use measured positions directly
  const row1Seats = ROW_1_MEASURED;
  
  // Row 3: Interpolate from corners
  const row3Seats = interpolateRow(ROW_3_CORNERS.seat1, ROW_3_CORNERS.seat7);
  
  // Row 4: Interpolate from corners
  const row4Seats = interpolateRow(ROW_4_CORNERS.seat1, ROW_4_CORNERS.seat7);
  
  // Row 6: Interpolate from corners
  const row6Seats = interpolateRow(ROW_6_CORNERS.seat1, ROW_6_CORNERS.seat7);
  
  // Generate all 6 rows
  for (let row = 1; row <= 6; row++) {
    for (let seatInRow = 1; seatInRow <= 7; seatInRow++) {
      const seatNumber = (row - 1) * 7 + seatInRow;
      let seatData;
      
      if (row === 5) {
        // Interpolate between Row 4 and Row 6
        seatData = interpolateRowPosition(row, 4, row4Seats, 6, row6Seats, seatInRow);
        // Reduce Y position for row 5 avatars
        seatData.position[1] = seatData.position[1] - 0.25; // Lower by 0.25 units
      } else if (row === 1) {
        // Use measured Row 1 data
        seatData = row1Seats[seatInRow - 1];
      } else if (row === 2) {
        // Interpolate between Row 1 and Row 3
        seatData = interpolateRowPosition(row, 1, row1Seats, 3, row3Seats, seatInRow);
      } else if (row === 3) {
        // Use interpolated Row 3 data
        seatData = row3Seats[seatInRow - 1];
      } else if (row === 4) {
        // Use interpolated Row 4 data
        seatData = row4Seats[seatInRow - 1];
      } else { // row === 6
        // Use interpolated Row 6 data
        seatData = row6Seats[seatInRow - 1];
      }
      
      // Middle seats (seat 4) in middle rows (3-4) are premium
      const isMiddleSeat = seatInRow === 4;
      const isMiddleRow = row === 3 || row === 4;
      const isPremium = isMiddleSeat && isMiddleRow;
      
      seats.push({
        id: seatNumber,
        row,
        seatInRow,
        position: seatData.position.map(n => parseFloat(n.toFixed(2))),
        rotation: seatData.rotation.map(n => parseFloat(n.toFixed(1))),
        isPremium,
        label: `Row ${row}, Seat ${seatInRow}`
      });
    }
  }
  
  console.log(`🪑 [SeatCalculator] Generated ${seats.length} seats`);
  return seats;
}

/**
 * Calculate camera position offset from avatar position
 * Camera is positioned higher and forward for better view
 * @param {Array} avatarPosition - [x, y, z] position of the avatar
 * @returns {Array} - [x, y, z] position for the camera
 */
export function getCameraPositionFromAvatar(avatarPosition, seatId = null) {
  const [x, y, z] = avatarPosition;
  // Custom camera coordinates for seats 1-6 in row 1
  if (seatId === 1) return [-3.15, 2.64, -0.72];
  if (seatId === 2) return [-3.66, 2.61, -0.78];
  if (seatId === 3) return [-4.03, 2.50, -0.76];
  if (seatId === 4) return [-4.63, 2.79, -0.70];
  if (seatId === 5) return [-5.02, 2.09, -0.73];
  if (seatId === 6) return [-5.38, 1.89, -0.79];
  // Example: slightly lower for seat 7
  if (seatId === 7) return [x, y * 1.03, z * 0.92];
  // Default offset for all other seats
  const cameraY = y * 1.07;  // 7% higher
  const cameraZ = z * 0.91;  // 9% forward
  return [x, cameraY, cameraZ];
}

/**
 * Get seat by ID (1-42)
 * Returns both avatar position and camera position
 */
export function getSeatById(seatId) {
  const seats = generateAllSeats();
  const seat = seats.find(seat => seat.id === seatId);
  
  if (seat) {
    return {
      ...seat,
      avatarPosition: seat.position,  // Where avatar mesh appears
      cameraPosition: getCameraPositionFromAvatar(seat.position)  // Where camera is positioned
    };
  }
  
  return seat;
}

/**
 * Get seat by row and seat number
 */
export function getSeatByPosition(row, seatInRow) {
  const seats = generateAllSeats();
  return seats.find(seat => seat.row === row && seat.seatInRow === seatInRow);
}

/**
 * Assign users to seats
 * Returns seat with both avatar and camera positions
 */
export function assignUserToSeat(userId, userPreference = null) {
  const seats = generateAllSeats();
  
  // If user has preference (e.g., premium middle seats), try to assign
  if (userPreference === 'premium') {
    const premiumSeats = seats.filter(s => s.isPremium);
    const seat = premiumSeats[Math.floor(Math.random() * premiumSeats.length)];
    return {
      ...seat,
      avatarPosition: seat.position,
      cameraPosition: getCameraPositionFromAvatar(seat.position)
    };
  }
  
  // Round-robin assignment (seat ID = userId % 42 + 1)
  // This ensures even distribution and multiple users can share seats
  const seatId = ((userId - 1) % 42) + 1;
  return getSeatById(seatId);
}

/**
 * Get all premium seats (middle seats in middle rows)
 */
export function getPremiumSeats() {
  const seats = generateAllSeats();
  return seats.filter(seat => seat.isPremium);
}

// TODO: AVATAR SYSTEM (Future Feature)
// - Show 3D avatar meshes at other users' seat positions
// - Display username/messages above avatar heads
// - Show emotes/reactions floating above avatars
// - Avatar could be simple sphere with user color or basic humanoid mesh
// Implementation approach:
//   1. Create <UserAvatar> component that takes position, username, color
//   2. In CinemaScene3D, map userSeats array to <UserAvatar> components
//   3. Position avatars slightly in front of camera position (offset Z by +0.3)
//   4. Add <Html> component from drei for floating username/message bubbles
//   5. Animate emotes using react-spring or manual useFrame animations
// Related files to create:
//   - UserAvatar.jsx: Avatar mesh component
//   - MessageBubble.jsx: Floating text above avatar
//   - EmoteAnimation.jsx: Reaction animations (hearts, laughs, etc.)

// TODO: SEAT SWAPPING (Future Feature)
// - Allow users to request seat change via UI
// - Animate smooth camera transition between seats using lerp
// - Update user's seat assignment in backend/websocket state
// - Notify other users of position change for avatar updates
// Implementation approach:
//   1. Add seat selection UI overlay showing available seats
//   2. On seat selection, emit websocket event with new seat ID
//   3. Animate camera from current position to new seat position over 1-2 seconds
//   4. Update local state and broadcast to other users
// Related code:
//   - Add seatTransition state in CinemaScene3D
//   - Use lerp in useFrame for smooth camera movement
//   - WebSocket handler: onSeatSwap(userId, newSeatId)
