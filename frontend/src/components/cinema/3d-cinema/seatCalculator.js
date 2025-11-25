/**
 * Seat Calculator for 3D Cinema
 * Uses measured seat positions from GLB model for accurate placement
 * All coordinates are in GLB-local space (no world offset applied)
 */

// === Measured Row 1 with FULL viewPresets ===
const ROW_1_MEASURED = [
  {
    seat: 1,
    position: [-3.11, 1.82, -0.27],
    rotation: [-180.0, -3.9, -180.0],
    viewPresets: {
      lookLeft: { target: [-8, 2, -2] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [1, 3, -1] }
    }
  },
  {
    seat: 2,
    position: [-3.57, 1.73, -0.89],
    rotation: [-180.0, -3.1, -180.0],
    viewPresets: {
      lookLeft: { target: [-7, 2, -2] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [1.5, 3, -1] }
    }
  },
  {
    seat: 3,
    position: [-4.03, 1.73, -0.86],
    rotation: [-180.0, -6.8, -180.0],
    viewPresets: {
      lookLeft: { target: [-6, 2, -2] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [2, 3, -1] }
    }
  },
  {
    seat: 4,
    position: [-4.49, 1.73, -0.84],
    rotation: [-180.0, -6.8, -180.0],
    viewPresets: {
      lookLeft: { target: [-5, 2, -2] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [2, 3, -1] }
    }
  },
  {
    seat: 5,
    position: [-4.95, 1.75, -0.81],
    rotation: [-180.0, -6.4, -180.0],
    viewPresets: {
      lookLeft: { target: [-4, 2, -2] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [1, 3, -1] }
    }
  },
  {
    seat: 6,
    position: [-5.38, 1.77, -0.87],
    rotation: [-180.0, -6.4, -180.0],
    viewPresets: {
      lookLeft: { target: [-4, 2, -2] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [0, 3, -1] }
    }
  },
  {
    seat: 7,
    position: [-5.81, 1.78, -0.93],
    rotation: [-180.0, -13.9, -180.0],
    viewPresets: {
      lookLeft: { target: [-3, 2, -2] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [-1, 3, -1] }
    }
  }
];

// === Row 3 corner seats ===
const ROW_3_CORNERS = {
  seat1: {
    position: [-3.17, 2.67, -2.68],
    rotation: [-171.5, -2.8, -179.6],
    viewPresets: {
      lookLeft: { target: [-8, 3, -4] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [1, 3, -3] }
    }
  },
  seat7: {
    position: [-6.10, 2.43, -2.53],
    rotation: [-180.0, -41.0, -180.0],
    viewPresets: {
      lookLeft: { target: [-4, 3, -4] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [-1, 3, -2] }
    }
  }
};

// === Row 4 corner seats ===
const ROW_4_CORNERS = {
  seat1: {
    position: [-3.19, 2.92, -3.22],
    rotation: [-165.2, 17.1, 175.6],
    viewPresets: {
      lookLeft: { target: [-8, 3, -5] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [1, 3, -4] }
    }
  },
  seat7: {
    position: [-5.89, 3.02, -3.26],
    rotation: [-171.0, -13.7, -177.9],
    viewPresets: {
      lookLeft: { target: [-4, 3, -5] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [-1, 3, -3] }
    }
  }
};

// === Row 6 (Back row) corner seats ===
const ROW_6_CORNERS = {
  seat1: {
    position: [-3.20, 3.59, -5.07],
    rotation: [-167.4, 29.7, 173.7],
    viewPresets: {
      lookLeft: { target: [-8, 4, -7] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [1, 4, -6] }
    }
  },
  seat7: {
    position: [-5.74, 3.26, -4.30],
    rotation: [-180.0, -12.0, -180.0],
    viewPresets: {
      lookLeft: { target: [-4, 4, -7] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [-1, 4, -5] }
    }
  }
};

/**
 * Interpolate view presets between two seats
 */
function interpolateViewPresets(leftPreset, rightPreset, progress) {
  if (!leftPreset || !rightPreset) return null;
  const interpolateTarget = (a, b) => [
    a[0] + (b[0] - a[0]) * progress,
    a[1] + (b[1] - a[1]) * progress,
    a[2] + (b[2] - a[2]) * progress
  ];
  return {
    lookLeft: { target: interpolateTarget(leftPreset.lookLeft.target, rightPreset.lookLeft.target) },
    lookCenter: { target: interpolateTarget(leftPreset.lookCenter.target, rightPreset.lookCenter.target) },
    lookRight: { target: interpolateTarget(leftPreset.lookRight.target, rightPreset.lookRight.target) }
  };
}

/**
 * Interpolate a full row of 7 seats from corner seat measurements
 */
function interpolateRow(leftCorner, rightCorner) {
  const seats = [];
  for (let seatInRow = 1; seatInRow <= 7; seatInRow++) {
    const progress = (seatInRow - 1) / 6;
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
    const viewPresets = interpolateViewPresets(
      leftCorner.viewPresets,
      rightCorner.viewPresets,
      progress
    );
    seats.push({
      position: position.map(n => parseFloat(n.toFixed(2))),
      rotation: rotation.map(n => parseFloat(n.toFixed(1))),
      viewPresets
    });
  }
  return seats;
}

/**
 * Interpolate view presets between rows
 */
function interpolateViewPresetsBetweenRows(startPreset, endPreset, rowProgress) {
  if (!startPreset || !endPreset) return null;
  const interpolateTarget = (a, b) => [
    a[0] + (b[0] - a[0]) * rowProgress,
    a[1] + (b[1] - a[1]) * rowProgress,
    a[2] + (b[2] - a[2]) * rowProgress
  ];
  return {
    lookLeft: { target: interpolateTarget(startPreset.lookLeft.target, endPreset.lookLeft.target) },
    lookCenter: { target: interpolateTarget(startPreset.lookCenter.target, endPreset.lookCenter.target) },
    lookRight: { target: interpolateTarget(startPreset.lookRight.target, endPreset.lookRight.target) }
  };
}

/**
 * Interpolate row positions between two known rows
 */
function interpolateRowPosition(row, startRow, startData, endRow, endData, seatInRow) {
  const rowProgress = (row - startRow) / (endRow - startRow);
  const startSeat = startData[seatInRow - 1];
  const endSeat = endData[seatInRow - 1];
  const viewPresets = interpolateViewPresetsBetweenRows(
    startSeat.viewPresets,
    endSeat.viewPresets,
    rowProgress
  );
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
    ],
    viewPresets
  };
}

/**
 * Generate all 42 seat positions with view presets
 */
export function generateAllSeats() {
  const seats = [];
  const row1Seats = ROW_1_MEASURED;
  const row3Seats = interpolateRow(ROW_3_CORNERS.seat1, ROW_3_CORNERS.seat7);
  const row4Seats = interpolateRow(ROW_4_CORNERS.seat1, ROW_4_CORNERS.seat7);
  const row6Seats = interpolateRow(ROW_6_CORNERS.seat1, ROW_6_CORNERS.seat7);

  for (let row = 1; row <= 6; row++) {
    for (let seatInRow = 1; seatInRow <= 7; seatInRow++) {
      const seatNumber = (row - 1) * 7 + seatInRow;
      let seatData;

      if (row === 5) {
        seatData = interpolateRowPosition(row, 4, row4Seats, 6, row6Seats, seatInRow);
        seatData.position[1] -= 0.25;
      } else if (row === 1) {
        seatData = row1Seats[seatInRow - 1];
      } else if (row === 2) {
        seatData = interpolateRowPosition(row, 1, row1Seats, 3, row3Seats, seatInRow);
      } else if (row === 3) {
        seatData = row3Seats[seatInRow - 1];
      } else if (row === 4) {
        seatData = row4Seats[seatInRow - 1];
      } else {
        seatData = row6Seats[seatInRow - 1];
      }

      const isMiddleSeat = seatInRow === 4;
      const isMiddleRow = row === 3 || row === 4;
      const isPremium = isMiddleSeat && isMiddleRow;

      seats.push({
        id: seatNumber,
        row,
        seatInRow,
        position: seatData.position.map(n => parseFloat(n.toFixed(2))),
        rotation: seatData.rotation.map(n => parseFloat(n.toFixed(1))),
        viewPresets: seatData.viewPresets,
        isPremium,
        label: `Row ${row}, Seat ${seatInRow}`
      });
    }
  }
  return seats;
}

/**
 * Calculate camera position offset from avatar position
 */
export function getCameraPositionFromAvatar(avatarPosition, seatId = null) {
  const [x, y, z] = avatarPosition;
  // ✅ Row 1 seats (A1-A7, seats 1-7) - Raised slightly to look more downward
  if (seatId >= 1 && seatId <= 7) return [x, 2.35, -0.86];
  // ✅ Row 2 seats (B1-B7, seats 8-14) - All use same Y & Z from B1, keep individual X
  if (seatId >= 8 && seatId <= 14) return [x, 2.65, -2.38];
  // ✅ Apply same camera adjustment to all Row 5 seats (E1-E7, seats 29-35)
  if (seatId >= 29 && seatId <= 35) return [x, y * 1.22, z - 0.3];
  const cameraY = y * 1.07;
  const cameraZ = z * 0.91;
  return [x, cameraY, cameraZ];
}

/**
 * Get seat by ID (1-42) — includes viewPresets and cameraPosition
 */
export function getSeatById(seatId) {
  const seats = generateAllSeats();
  const seat = seats.find(seat => seat.id === seatId);
  if (seat) {
    return {
      ...seat,
      avatarPosition: seat.position,
      cameraPosition: getCameraPositionFromAvatar(seat.position, seatId)
    };
  }
  return null;
}

/**
 * Assign users to seats — returns full seat object with viewPresets
 */
export function assignUserToSeat(userId, userPreference = null) {
  const seats = generateAllSeats();
  if (userPreference === 'premium') {
    const premiumSeats = seats.filter(s => s.isPremium);
    const seat = premiumSeats[Math.floor(Math.random() * premiumSeats.length)];
    return {
      ...seat,
      avatarPosition: seat.position,
      cameraPosition: getCameraPositionFromAvatar(seat.position, seat.id)
    };
  }

  const totalSeats = seats.length;
  const reverseSeatIndex = (userId - 1) % totalSeats;
  const seatId = totalSeats - reverseSeatIndex;
  return getSeatById(seatId);
}
/**
 * Get seat by row and seat number (1-based)
 */
export function getSeatByPosition(row, seatInRow) {
  const seats = generateAllSeats();
  return seats.find(seat => seat.row === row && seat.seatInRow === seatInRow);
}
/**
 * Get all premium seats
 */
export function getPremiumSeats() {
  const seats = generateAllSeats();
  return seats.filter(seat => seat.isPremium);
}