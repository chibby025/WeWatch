// Final Lecture Hall Seat Configuration - 145 seats
// Column 1: Seats 1-40 (5 seats × 8 rows) - Right to Left
// Column 2: Seats 41-104 (8 seats × 8 rows) - Left to Right
// Column 3: Seats 105-144 (5 seats × 8 rows) - Left to Right
// Host: Seat 145 - Front of class

const LECTURE_HALL_SEATS = [];
let seatId = 1;

// Column 1: 5 seats per row, 8 rows (Right to Left)
const col1_x = [-92.52, -103.504, -114.318, -125.345, -135.921];
const startZ = -132;
const startY = 30.5;
const rowSpacingZ = 27.5;
const rowSpacingY = 9.875;

for (let row = 0; row < 8; row++) {
  const z = startZ + (row * rowSpacingZ);
  let y = startY + (row * rowSpacingY);
  const zVariation = (row % 2) * 0.5;
  if (row >= 6) y = y * 1.1; // Last 2 rows raised 10%
  
  for (let seat = 0; seat < 5; seat++) {
    LECTURE_HALL_SEATS.push({
      id: seatId++,
      position: [col1_x[seat], y, z + zVariation],
      row: row + 1,
      column: 1,
      seatInRow: seat + 1
    });
  }
}

// Column 2: 8 seats per row, 8 rows (Left to Right)
const col2_x = [-34.929, -24.752, -13.284, -3.266, 7.068, 17.067, 28.573, 38.565];

for (let row = 0; row < 8; row++) {
  const z = startZ + (row * rowSpacingZ);
  let y = startY + (row * rowSpacingY);
  const zVariation = (row % 2) * 0.5;
  if (row >= 6) y = y * 1.1; // Last 2 rows raised 10%
  
  for (let seat = 0; seat < 8; seat++) {
    LECTURE_HALL_SEATS.push({
      id: seatId++,
      position: [col2_x[seat], y, z + zVariation],
      row: row + 1,
      column: 2,
      seatInRow: seat + 1
    });
  }
}

// Column 3: 5 seats per row, 8 rows (Left to Right)
const col3_x = [96.487, 107.009, 117.541, 128.001, 139.034];

for (let row = 0; row < 8; row++) {
  const z = startZ + (row * rowSpacingZ);
  let y = startY + (row * rowSpacingY);
  const zVariation = (row % 2) * 0.5;
  if (row >= 6) y = y * 1.1; // Last 2 rows raised 10%
  
  for (let seat = 0; seat < 5; seat++) {
    LECTURE_HALL_SEATS.push({
      id: seatId++,
      position: [col3_x[seat], y, z + zVariation],
      row: row + 1,
      column: 3,
      seatInRow: seat + 1
    });
  }
}

// Host/Teacher seat (Front of class)
LECTURE_HALL_SEATS.push({
  id: 145,
  position: [7.121, 18.737, -229.244],
  row: 0,
  column: 0,
  seatInRow: 0,
  isHost: true,
  label: 'Host'
});

console.log(JSON.stringify(LECTURE_HALL_SEATS, null, 2));
