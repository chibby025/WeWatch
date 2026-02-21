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
      lookLeft: { target: [1, 3, -1] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [-8, 2, -2] }
    }
  },
  {
    seat: 2,
    position: [-3.57, 1.73, -0.89],
    rotation: [-180.0, -3.1, -180.0],
    viewPresets: {
      lookLeft: { target: [1.5, 3, -1] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [-7, 2, -2] }
    }
  },
  {
    seat: 3,
    position: [-4.03, 1.73, -0.86],
    rotation: [-180.0, -6.8, -180.0],
    viewPresets: {
      lookLeft: { target: [2, 3, -1] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [-6, 2, -2] }
    }
  },
  {
    seat: 4,
    position: [-4.49, 1.73, -0.84],
    rotation: [-180.0, -6.8, -180.0],
    viewPresets: {
      lookLeft: { target: [2, 3, -1] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [-5, 2, -2] }
    }
  },
  {
    seat: 5,
    position: [-4.95, 1.75, -0.81],
    rotation: [-180.0, -6.4, -180.0],
    viewPresets: {
      lookLeft: { target: [1, 3, -1] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [-4, 2, -2] }
    }
  },
  {
    seat: 6,
    position: [-5.38, 1.77, -0.87],
    rotation: [-180.0, -6.4, -180.0],
    viewPresets: {
      lookLeft: { target: [0, 3, -1] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [-4, 2, -2] }
    }
  },
  {
    seat: 7,
    position: [-5.81, 1.78, -0.93],
    rotation: [-180.0, -13.9, -180.0],
    viewPresets: {
      lookLeft: { target: [-1, 3, -1] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [-3, 2, -2] }
    }
  }
];

// === Row 3 corner seats ===
const ROW_3_CORNERS = {
  seat1: {
    position: [-3.17, 2.67, -2.68],
    rotation: [-171.5, -2.8, -179.6],
    viewPresets: {
      lookLeft: { target: [1, 3, -3] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [-8, 3, -4] }
    }
  },
  seat7: {
    position: [-6.10, 2.43, -2.53],
    rotation: [-180.0, -41.0, -180.0],
    viewPresets: {
      lookLeft: { target: [-1, 3, -2] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [-4, 3, -4] }
    }
  }
};

// === Row 4 corner seats ===
const ROW_4_CORNERS = {
  seat1: {
    position: [-3.19, 2.92, -3.22],
    rotation: [-165.2, 17.1, 175.6],
    viewPresets: {
      lookLeft: { target: [1, 3, -4] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [-8, 3, -5] }
    }
  },
  seat7: {
    position: [-5.89, 3.02, -3.26],
    rotation: [-171.0, -13.7, -177.9],
    viewPresets: {
      lookLeft: { target: [-1, 3, -3] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [-4, 3, -5] }
    }
  }
};

// === Row 6 (Back row) corner seats ===
const ROW_6_CORNERS = {
  seat1: {
    position: [-3.20, 3.59, -5.07],
    rotation: [-167.4, 29.7, 173.7],
    viewPresets: {
      lookLeft: { target: [1, 4, -6] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [-8, 4, -7] }
    }
  },
  seat7: {
    position: [-5.74, 3.26, -4.30],
    rotation: [-180.0, -12.0, -180.0],
    viewPresets: {
      lookLeft: { target: [-1, 4, -5] },
      lookCenter: { target: [-3.5, 4, 0] },
      lookRight: { target: [-4, 4, -7] }
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
 * Fills back row (Row 6) first, left to right, then Row 5, etc.
 * This keeps early users together in the back row.
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

  // Fill back row first (Row 6), left to right, then Row 5, etc.
  const seatsPerRow = 7;
  const totalSeats = seats.length; // 42
  const userIndex = (userId - 1) % totalSeats; // 0-based, wrap around if > 42
  
  const rowFromBack = Math.floor(userIndex / seatsPerRow); // 0 = back row, 1 = one row forward, etc.
  const colInRow = userIndex % seatsPerRow; // 0-6 (left to right)
  
  const row = 6 - rowFromBack;  // Row 6, 5, 4, 3, 2, 1
  const seatInRow = colInRow + 1;  // 1-7 (1-based)
  const seatId = (row - 1) * seatsPerRow + seatInRow;
  
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

// ============================================
// LECTURE HALL SEAT CONFIGURATION (145 SEATS)
// ============================================

/**
 * Lecture Hall Seat Data
 * - 144 student seats in 3 columns (Column 1: 40 seats, Column 2: 64 seats, Column 3: 40 seats)
 * - 1 host/teacher seat at front (seat 145)
 * - All positions measured and validated from lecture_hall.glb
 */
const LECTURE_HALL_SEATS = [
  // Column 1: Seats 1-40 (5 seats × 8 rows, right-to-left)
  {"id":1,"position":[-92.52,30.5,-132],"row":1,"column":1,"seatInRow":1},
  {"id":2,"position":[-103.504,30.5,-132],"row":1,"column":1,"seatInRow":2},
  {"id":3,"position":[-114.318,30.5,-132],"row":1,"column":1,"seatInRow":3},
  {"id":4,"position":[-125.345,30.5,-132],"row":1,"column":1,"seatInRow":4},
  {"id":5,"position":[-135.921,30.5,-132],"row":1,"column":1,"seatInRow":5},
  {"id":6,"position":[-92.52,40.375,-159],"row":2,"column":1,"seatInRow":1},
  {"id":7,"position":[-103.504,40.375,-159],"row":2,"column":1,"seatInRow":2},
  {"id":8,"position":[-114.318,40.375,-159],"row":2,"column":1,"seatInRow":3},
  {"id":9,"position":[-125.345,40.375,-159],"row":2,"column":1,"seatInRow":4},
  {"id":10,"position":[-135.921,40.375,-159],"row":2,"column":1,"seatInRow":5},
  {"id":11,"position":[-92.52,50.25,-186.5],"row":3,"column":1,"seatInRow":1},
  {"id":12,"position":[-103.504,50.25,-186.5],"row":3,"column":1,"seatInRow":2},
  {"id":13,"position":[-114.318,50.25,-186.5],"row":3,"column":1,"seatInRow":3},
  {"id":14,"position":[-125.345,50.25,-186.5],"row":3,"column":1,"seatInRow":4},
  {"id":15,"position":[-135.921,50.25,-186.5],"row":3,"column":1,"seatInRow":5},
  {"id":16,"position":[-92.52,60.125,-214],"row":4,"column":1,"seatInRow":1},
  {"id":17,"position":[-103.504,60.125,-214],"row":4,"column":1,"seatInRow":2},
  {"id":18,"position":[-114.318,60.125,-214],"row":4,"column":1,"seatInRow":3},
  {"id":19,"position":[-125.345,60.125,-214],"row":4,"column":1,"seatInRow":4},
  {"id":20,"position":[-135.921,60.125,-214],"row":4,"column":1,"seatInRow":5},
  {"id":21,"position":[-92.52,70,-241.5],"row":5,"column":1,"seatInRow":1},
  {"id":22,"position":[-103.504,70,-241.5],"row":5,"column":1,"seatInRow":2},
  {"id":23,"position":[-114.318,70,-241.5],"row":5,"column":1,"seatInRow":3},
  {"id":24,"position":[-125.345,70,-241.5],"row":5,"column":1,"seatInRow":4},
  {"id":25,"position":[-135.921,70,-241.5],"row":5,"column":1,"seatInRow":5},
  {"id":26,"position":[-92.52,79.875,-269],"row":6,"column":1,"seatInRow":1},
  {"id":27,"position":[-103.504,79.875,-269],"row":6,"column":1,"seatInRow":2},
  {"id":28,"position":[-114.318,79.875,-269],"row":6,"column":1,"seatInRow":3},
  {"id":29,"position":[-125.345,79.875,-269],"row":6,"column":1,"seatInRow":4},
  {"id":30,"position":[-135.921,79.875,-269],"row":6,"column":1,"seatInRow":5},
  {"id":31,"position":[-92.52,89.8625,-296],"row":7,"column":1,"seatInRow":1},
  {"id":32,"position":[-103.504,89.8625,-296],"row":7,"column":1,"seatInRow":2},
  {"id":33,"position":[-114.318,89.8625,-296],"row":7,"column":1,"seatInRow":3},
  {"id":34,"position":[-125.345,89.8625,-296],"row":7,"column":1,"seatInRow":4},
  {"id":35,"position":[-135.921,89.8625,-296],"row":7,"column":1,"seatInRow":5},
  {"id":36,"position":[-92.52,99.8625,-323.5],"row":8,"column":1,"seatInRow":1},
  {"id":37,"position":[-103.504,99.8625,-323.5],"row":8,"column":1,"seatInRow":2},
  {"id":38,"position":[-114.318,99.8625,-323.5],"row":8,"column":1,"seatInRow":3},
  {"id":39,"position":[-125.345,99.8625,-323.5],"row":8,"column":1,"seatInRow":4},
  {"id":40,"position":[-135.921,99.8625,-323.5],"row":8,"column":1,"seatInRow":5},
  
  // Column 2: Seats 41-104 (8 seats × 8 rows, left-to-right)
  {"id":41,"position":[-34.929,30.5,-132],"row":1,"column":2,"seatInRow":1},
  {"id":42,"position":[-24.752,30.5,-132],"row":1,"column":2,"seatInRow":2},
  {"id":43,"position":[-13.284,30.5,-132],"row":1,"column":2,"seatInRow":3},
  {"id":44,"position":[-3.266,30.5,-132],"row":1,"column":2,"seatInRow":4},
  {"id":45,"position":[7.068,30.5,-132],"row":1,"column":2,"seatInRow":5},
  {"id":46,"position":[17.067,30.5,-132],"row":1,"column":2,"seatInRow":6},
  {"id":47,"position":[28.573,30.5,-132],"row":1,"column":2,"seatInRow":7},
  {"id":48,"position":[38.565,30.5,-132],"row":1,"column":2,"seatInRow":8},
  {"id":49,"position":[-34.929,40.375,-159],"row":2,"column":2,"seatInRow":1},
  {"id":50,"position":[-24.752,40.375,-159],"row":2,"column":2,"seatInRow":2},
  {"id":51,"position":[-13.284,40.375,-159],"row":2,"column":2,"seatInRow":3},
  {"id":52,"position":[-3.266,40.375,-159],"row":2,"column":2,"seatInRow":4},
  {"id":53,"position":[7.068,40.375,-159],"row":2,"column":2,"seatInRow":5},
  {"id":54,"position":[17.067,40.375,-159],"row":2,"column":2,"seatInRow":6},
  {"id":55,"position":[28.573,40.375,-159],"row":2,"column":2,"seatInRow":7},
  {"id":56,"position":[38.565,40.375,-159],"row":2,"column":2,"seatInRow":8},
  {"id":57,"position":[-34.929,50.25,-186.5],"row":3,"column":2,"seatInRow":1},
  {"id":58,"position":[-24.752,50.25,-186.5],"row":3,"column":2,"seatInRow":2},
  {"id":59,"position":[-13.284,50.25,-186.5],"row":3,"column":2,"seatInRow":3},
  {"id":60,"position":[-3.266,50.25,-186.5],"row":3,"column":2,"seatInRow":4},
  {"id":61,"position":[7.068,50.25,-186.5],"row":3,"column":2,"seatInRow":5},
  {"id":62,"position":[17.067,50.25,-186.5],"row":3,"column":2,"seatInRow":6},
  {"id":63,"position":[28.573,50.25,-186.5],"row":3,"column":2,"seatInRow":7},
  {"id":64,"position":[38.565,50.25,-186.5],"row":3,"column":2,"seatInRow":8},
  {"id":65,"position":[-34.929,60.125,-214],"row":4,"column":2,"seatInRow":1},
  {"id":66,"position":[-24.752,60.125,-214],"row":4,"column":2,"seatInRow":2},
  {"id":67,"position":[-13.284,60.125,-214],"row":4,"column":2,"seatInRow":3},
  {"id":68,"position":[-3.266,60.125,-214],"row":4,"column":2,"seatInRow":4},
  {"id":69,"position":[7.068,60.125,-214],"row":4,"column":2,"seatInRow":5},
  {"id":70,"position":[17.067,60.125,-214],"row":4,"column":2,"seatInRow":6},
  {"id":71,"position":[28.573,60.125,-214],"row":4,"column":2,"seatInRow":7},
  {"id":72,"position":[38.565,60.125,-214],"row":4,"column":2,"seatInRow":8},
  {"id":73,"position":[-34.929,70,-241.5],"row":5,"column":2,"seatInRow":1},
  {"id":74,"position":[-24.752,70,-241.5],"row":5,"column":2,"seatInRow":2},
  {"id":75,"position":[-13.284,70,-241.5],"row":5,"column":2,"seatInRow":3},
  {"id":76,"position":[-3.266,70,-241.5],"row":5,"column":2,"seatInRow":4},
  {"id":77,"position":[7.068,70,-241.5],"row":5,"column":2,"seatInRow":5},
  {"id":78,"position":[17.067,70,-241.5],"row":5,"column":2,"seatInRow":6},
  {"id":79,"position":[28.573,70,-241.5],"row":5,"column":2,"seatInRow":7},
  {"id":80,"position":[38.565,70,-241.5],"row":5,"column":2,"seatInRow":8},
  {"id":81,"position":[-34.929,79.875,-269],"row":6,"column":2,"seatInRow":1},
  {"id":82,"position":[-24.752,79.875,-269],"row":6,"column":2,"seatInRow":2},
  {"id":83,"position":[-13.284,79.875,-269],"row":6,"column":2,"seatInRow":3},
  {"id":84,"position":[-3.266,79.875,-269],"row":6,"column":2,"seatInRow":4},
  {"id":85,"position":[7.068,79.875,-269],"row":6,"column":2,"seatInRow":5},
  {"id":86,"position":[17.067,79.875,-269],"row":6,"column":2,"seatInRow":6},
  {"id":87,"position":[28.573,79.875,-269],"row":6,"column":2,"seatInRow":7},
  {"id":88,"position":[38.565,79.875,-269],"row":6,"column":2,"seatInRow":8},
  {"id":89,"position":[-34.929,89.8625,-296],"row":7,"column":2,"seatInRow":1},
  {"id":90,"position":[-24.752,89.8625,-296],"row":7,"column":2,"seatInRow":2},
  {"id":91,"position":[-13.284,89.8625,-296],"row":7,"column":2,"seatInRow":3},
  {"id":92,"position":[-3.266,89.8625,-296],"row":7,"column":2,"seatInRow":4},
  {"id":93,"position":[7.068,89.8625,-296],"row":7,"column":2,"seatInRow":5},
  {"id":94,"position":[17.067,89.8625,-296],"row":7,"column":2,"seatInRow":6},
  {"id":95,"position":[28.573,89.8625,-296],"row":7,"column":2,"seatInRow":7},
  {"id":96,"position":[38.565,89.8625,-296],"row":7,"column":2,"seatInRow":8},
  {"id":97,"position":[-34.929,99.8625,-323.5],"row":8,"column":2,"seatInRow":1},
  {"id":98,"position":[-24.752,99.8625,-323.5],"row":8,"column":2,"seatInRow":2},
  {"id":99,"position":[-13.284,99.8625,-323.5],"row":8,"column":2,"seatInRow":3},
  {"id":100,"position":[-3.266,99.8625,-323.5],"row":8,"column":2,"seatInRow":4},
  {"id":101,"position":[7.068,99.8625,-323.5],"row":8,"column":2,"seatInRow":5},
  {"id":102,"position":[17.067,99.8625,-323.5],"row":8,"column":2,"seatInRow":6},
  {"id":103,"position":[28.573,99.8625,-323.5],"row":8,"column":2,"seatInRow":7},
  {"id":104,"position":[38.565,99.8625,-323.5],"row":8,"column":2,"seatInRow":8},
  
  // Column 3: Seats 105-144 (5 seats × 8 rows, left-to-right)
  {"id":105,"position":[96.487,30.5,-132],"row":1,"column":3,"seatInRow":1},
  {"id":106,"position":[107.009,30.5,-132],"row":1,"column":3,"seatInRow":2},
  {"id":107,"position":[117.541,30.5,-132],"row":1,"column":3,"seatInRow":3},
  {"id":108,"position":[128.001,30.5,-132],"row":1,"column":3,"seatInRow":4},
  {"id":109,"position":[139.034,30.5,-132],"row":1,"column":3,"seatInRow":5},
  {"id":110,"position":[96.487,40.375,-159],"row":2,"column":3,"seatInRow":1},
  {"id":111,"position":[107.009,40.375,-159],"row":2,"column":3,"seatInRow":2},
  {"id":112,"position":[117.541,40.375,-159],"row":2,"column":3,"seatInRow":3},
  {"id":113,"position":[128.001,40.375,-159],"row":2,"column":3,"seatInRow":4},
  {"id":114,"position":[139.034,40.375,-159],"row":2,"column":3,"seatInRow":5},
  {"id":115,"position":[96.487,50.25,-186.5],"row":3,"column":3,"seatInRow":1},
  {"id":116,"position":[107.009,50.25,-186.5],"row":3,"column":3,"seatInRow":2},
  {"id":117,"position":[117.541,50.25,-186.5],"row":3,"column":3,"seatInRow":3},
  {"id":118,"position":[128.001,50.25,-186.5],"row":3,"column":3,"seatInRow":4},
  {"id":119,"position":[139.034,50.25,-186.5],"row":3,"column":3,"seatInRow":5},
  {"id":120,"position":[96.487,60.125,-214],"row":4,"column":3,"seatInRow":1},
  {"id":121,"position":[107.009,60.125,-214],"row":4,"column":3,"seatInRow":2},
  {"id":122,"position":[117.541,60.125,-214],"row":4,"column":3,"seatInRow":3},
  {"id":123,"position":[128.001,60.125,-214],"row":4,"column":3,"seatInRow":4},
  {"id":124,"position":[139.034,60.125,-214],"row":4,"column":3,"seatInRow":5},
  {"id":125,"position":[96.487,70,-241.5],"row":5,"column":3,"seatInRow":1},
  {"id":126,"position":[107.009,70,-241.5],"row":5,"column":3,"seatInRow":2},
  {"id":127,"position":[117.541,70,-241.5],"row":5,"column":3,"seatInRow":3},
  {"id":128,"position":[128.001,70,-241.5],"row":5,"column":3,"seatInRow":4},
  {"id":129,"position":[139.034,70,-241.5],"row":5,"column":3,"seatInRow":5},
  {"id":130,"position":[96.487,79.875,-269],"row":6,"column":3,"seatInRow":1},
  {"id":131,"position":[107.009,79.875,-269],"row":6,"column":3,"seatInRow":2},
  {"id":132,"position":[117.541,79.875,-269],"row":6,"column":3,"seatInRow":3},
  {"id":133,"position":[128.001,79.875,-269],"row":6,"column":3,"seatInRow":4},
  {"id":134,"position":[139.034,79.875,-269],"row":6,"column":3,"seatInRow":5},
  {"id":135,"position":[96.487,89.8625,-296],"row":7,"column":3,"seatInRow":1},
  {"id":136,"position":[107.009,89.8625,-296],"row":7,"column":3,"seatInRow":2},
  {"id":137,"position":[117.541,89.8625,-296],"row":7,"column":3,"seatInRow":3},
  {"id":138,"position":[128.001,89.8625,-296],"row":7,"column":3,"seatInRow":4},
  {"id":139,"position":[139.034,89.8625,-296],"row":7,"column":3,"seatInRow":5},
  {"id":140,"position":[96.487,99.8625,-323.5],"row":8,"column":3,"seatInRow":1},
  {"id":141,"position":[107.009,99.8625,-323.5],"row":8,"column":3,"seatInRow":2},
  {"id":142,"position":[117.541,99.8625,-323.5],"row":8,"column":3,"seatInRow":3},
  {"id":143,"position":[128.001,99.8625,-323.5],"row":8,"column":3,"seatInRow":4},
  {"id":144,"position":[139.034,99.8625,-323.5],"row":8,"column":3,"seatInRow":5},
  
  // Host/Teacher seat at front (seat 145)
  {"id":145,"position":[7.121,18.737,-229.244],"row":0,"column":0,"seatInRow":0,"isHost":true,"label":"Host"}
];

/**
 * Generate all lecture hall seats (145 total)
 * @returns {Array} Array of 145 seat objects with positions and metadata
 */
export function generateLectureHallSeats() {
  return LECTURE_HALL_SEATS.map(seat => {
    // apply optional mirroring to seat positions
    const mirroredPos = maybeMirrorPosition(seat.position);
    const baseTarget = seat.isHost ? [0, 50, -250] : [0, 65, -238];
    const mirroredTarget = maybeMirrorTarget(baseTarget);
    return {
      id: seat.id,
      position: mirroredPos,
      row: seat.row,
      column: seat.column,
      seatInRow: seat.seatInRow,
      isHost: seat.isHost || false,
      label: seat.label || `Seat ${seat.id}`,
      // Calculate camera position with offset behind and above the seat (use mirrored position)
      avatarPosition: mirroredPos,
      cameraPosition: getCameraPositionForLectureHallSeat(mirroredPos, seat.id),
      // Camera target - where to look (mirrored when applicable)
      lookAtTarget: mirroredTarget
    };
  });
}

/**
 * Calculate camera position for lecture hall seat
 * Smart offset calculation based on seat position relative to whiteboard
 * Whiteboard center at [0, 65, -238]
 */
function getCameraPositionForLectureHallSeat(position, seatId) {
  const [x, y, z] = position;
  const WHITEBOARD_Z = -238;
  
  // For host seat (145), position camera at teacher's head level facing students
  if (seatId === 145) {
    // Camera at elevated position, facing forward toward the class
    // Offset: +2.239 X, +10.963 Y (higher up), +6.694 Z (further forward)
    return [x + 2.239, y + 10.963, z + 6.694];
  }
  
  // For student seats, calculate smart camera offset based on position relative to whiteboard
  const cameraY = y + 2; // 2 units above avatar's head level
  
  // Calculate camera Z position based on seat location:
  // Z-axis: More negative = farther back in room
  // Row 1 (Z=-132) is FRONT (in front of whiteboard)
  // Row 8 (Z=-323) is BACK (behind whiteboard)
  // Whiteboard at Z=-238
  let cameraZ;
  if (z > WHITEBOARD_Z) {
    // Seat is in front of whiteboard (less negative Z, like row 1-4)
    // Camera BEHIND avatar (add positive offset, moves toward back of room)
    cameraZ = z + 6;
  } else {
    // Seat is behind whiteboard (more negative Z, like row 5-8)
    // Camera IN FRONT of avatar (subtract, moves toward front of room)
    cameraZ = z - 10;
  }
  
  return [x, cameraY, cameraZ];
}

/**
 * Get lecture hall seat by ID (1-145)
 * @param {number} seatId - Seat ID (1-145)
 * @returns {Object|null} Seat object with position and camera data
 */
export function getLectureHallSeatById(seatId) {
  const seats = generateLectureHallSeats();
  return seats.find(seat => seat.id === seatId) || null;
}

/**
 * Assign user to lecture hall seat
 * @param {number} userId - User ID
 * @param {string|null} userPreference - Optional preference ('front', 'back', 'left', 'right', 'center')
 * @returns {Object} Assigned seat object
 */
export function assignUserToLectureHallSeat(userId, userPreference = null) {
  const seats = generateLectureHallSeats();
  const studentSeats = seats.filter(s => !s.isHost); // Exclude host seat from assignment
  
  // Handle preference-based assignment
  if (userPreference) {
    let filteredSeats = studentSeats;
    
    switch(userPreference) {
      case 'front':
        filteredSeats = studentSeats.filter(s => s.row <= 2);
        break;
      case 'back':
        filteredSeats = studentSeats.filter(s => s.row >= 7);
        break;
      case 'left':
        filteredSeats = studentSeats.filter(s => s.column === 1);
        break;
      case 'right':
        filteredSeats = studentSeats.filter(s => s.column === 3);
        break;
      case 'center':
        filteredSeats = studentSeats.filter(s => s.column === 2);
        break;
    }
    
    if (filteredSeats.length > 0) {
      return filteredSeats[Math.floor(Math.random() * filteredSeats.length)];
    }
  }
  
  // Default: reverse fill from back to front
  const totalSeats = studentSeats.length;
  const reverseSeatIndex = (userId - 1) % totalSeats;
  const seatId = totalSeats - reverseSeatIndex + 1; // +1 because student seats start at id 1
  return getLectureHallSeatById(seatId);
}

/**
 * Get lecture hall seat by row and position
 * @param {number} row - Row number (1-8, or 0 for host)
 * @param {number} seatInRow - Seat position in row
 * @returns {Object|null} Seat object
 */
export function getLectureHallSeatByPosition(row, seatInRow) {
  const seats = generateLectureHallSeats();
  return seats.find(seat => seat.row === row && seat.seatInRow === seatInRow) || null;
}

/**
 * Get all lecture hall seats in a specific column
 * @param {number} column - Column number (1, 2, or 3)
 * @returns {Array} Array of seats in the specified column
 */
export function getLectureHallSeatsByColumn(column) {
  const seats = generateLectureHallSeats();
  return seats.filter(seat => seat.column === column && !seat.isHost);
}

/**
 * Get the host seat
 * @returns {Object} Host seat object (seat 145)
 */
export function getLectureHallHostSeat() {
  return getLectureHallSeatById(145);
}

// ----------------------------
// Lecture hall mirroring helper
// ----------------------------
let lectureHallMirror = {
  mirrorX: false,
  mirrorZ: false,
  // sensible default center (whiteboard area) - can be overridden
  center: { x: 0, z: -238 }
};

export function setLectureHallMirror(opts = {}) {
  if (typeof opts.mirrorX === 'boolean') lectureHallMirror.mirrorX = opts.mirrorX;
  if (typeof opts.mirrorZ === 'boolean') lectureHallMirror.mirrorZ = opts.mirrorZ;
  if (opts.center && typeof opts.center.x === 'number' && typeof opts.center.z === 'number') {
    lectureHallMirror.center = { x: opts.center.x, z: opts.center.z };
  }
  // attach to window for quick dev-console toggling
  try {
    if (typeof window !== 'undefined') {
      window.__WeWatchLectureMirror = lectureHallMirror;
      window.__WeWatchSetLectureMirror = setLectureHallMirror;
    }
  } catch (e) {}
  console.info('Lecture hall mirror updated:', lectureHallMirror);
}

export function getLectureHallMirror() {
  return { ...lectureHallMirror };
}

function maybeMirrorPosition(pos) {
  if (!pos || !Array.isArray(pos)) return pos;
  let [x, y, z] = pos;
  if (lectureHallMirror.mirrorX) x = 2 * lectureHallMirror.center.x - x;
  if (lectureHallMirror.mirrorZ) z = 2 * lectureHallMirror.center.z - z;
  return [parseFloat(x.toFixed(3)), parseFloat(y.toFixed(3)), parseFloat(z.toFixed(3))];
}

function maybeMirrorTarget(target) {
  if (!target || !Array.isArray(target)) return target;
  let [x, y, z] = target;
  if (lectureHallMirror.mirrorX) x = 2 * lectureHallMirror.center.x - x;
  if (lectureHallMirror.mirrorZ) z = 2 * lectureHallMirror.center.z - z;
  return [parseFloat(x.toFixed(3)), parseFloat(y.toFixed(3)), parseFloat(z.toFixed(3))];
}