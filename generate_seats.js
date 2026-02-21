// Generate all 120 lecture hall seats based on manual measurements

// Column 1 measurements (seats 1-40)
const col1_row1 = [
  [-92, 30.5, -132],
  [-105.5, 30.5, -132],
  [-114, 30.5, -132],
  [-125, 30.5, -131],
  [-136.5, 30.5, -130]
];

const col1_row2 = [
  [-93.558, 37.214, -106.503],
  [-103.066, 38.012, -106.274],
  [-115.586, 38.012, -105.564],
  [-124.56, 38.012, -106.772],
  [-136.58, 38.012, -106.05]
];

const col1_row3 = [
  [-91.765, 49.012, -76.003],
  [-103.204, 49.012, -78.769],
  [-113.724, 49.012, -78.013],
  [-126.802, 49.012, -74.815],
  [-134.707, 49.012, -79]
];

const col1_row4 = [
  [-93.275, 64.493, -47.268],
  [-102.751, 64.493, -48.108],
  [-113.78, 64.493, -47.503],
  [-125.862, 64.493, -45.435],
  [-136.819, 64.493, -46.829]
];

const col1_row8 = [
  [-92, 109.5, 62.5],
  [-103, 109.5, 63.5],
  [-114.5, 109.5, 65],
  [-124.5, 109.5, 64],
  [-135, 109.5, 66]
];

// Column 2 measurements (starts at seat 41)
const col2_row1 = [
  [-35.221, 29.2, -131.959],
  [-24.306, 29.2, -130.508],
  [-13.932, 29.2, -128.601],
  [-2.67, 29.2, -131.135],
  [8.375, 29.2, -131.177]
];

// Calculate average spacing
function calculateAverageSpacing(row1, row2) {
  const zDiff = row2[0][2] - row1[0][2];
  const yDiff = row2[0][1] - row1[0][1];
  return { z: zDiff, y: yDiff };
}

// Calculate X positions for each seat in a row (average pattern)
function getRowXPositions(referenceRow) {
  return referenceRow.map(seat => seat[0]);
}

// Generate all seats
const allSeats = [];
let seatNumber = 1;

// Column 1 average X positions
const col1_xPositions = [
  (col1_row1[0][0] + col1_row2[0][0] + col1_row3[0][0] + col1_row4[0][0] + col1_row8[0][0]) / 5,
  (col1_row1[1][0] + col1_row2[1][0] + col1_row3[1][0] + col1_row4[1][0] + col1_row8[1][0]) / 5,
  (col1_row1[2][0] + col1_row2[2][0] + col1_row3[2][0] + col1_row4[2][0] + col1_row8[2][0]) / 5,
  (col1_row1[3][0] + col1_row2[3][0] + col1_row3[3][0] + col1_row4[3][0] + col1_row8[3][0]) / 5,
  (col1_row1[4][0] + col1_row2[4][0] + col1_row3[4][0] + col1_row4[4][0] + col1_row8[4][0]) / 5
];

// Row spacing
const spacing1to2 = calculateAverageSpacing(col1_row1, col1_row2);
const spacing2to3 = calculateAverageSpacing(col1_row2, col1_row3);
const spacing3to4 = calculateAverageSpacing(col1_row3, col1_row4);
const spacing4to8 = {
  z: (col1_row8[0][2] - col1_row4[0][2]) / 4,
  y: (col1_row8[0][1] - col1_row4[0][1]) / 4
};

console.log('Row spacing:', { spacing1to2, spacing2to3, spacing3to4, spacing4to8 });
console.log('Col1 X positions:', col1_xPositions);

// Generate Column 1 (seats 1-40)
const col1_startZ = col1_row1[0][2];
const col1_startY = col1_row1[0][1];
const rowSpacingZ = 27.5; // average
const rowSpacingY = 9.875; // average

for (let row = 0; row < 8; row++) {
  const z = col1_startZ + (row * rowSpacingZ);
  const y = col1_startY + (row * rowSpacingY);
  const zVariation = (row % 2) * 0.5; // slight variation
  
  for (let seat = 0; seat < 5; seat++) {
    allSeats.push({
      seatNumber: seatNumber++,
      position: [
        parseFloat(col1_xPositions[seat].toFixed(3)),
        parseFloat(y.toFixed(3)),
        parseFloat((z + zVariation).toFixed(3))
      ]
    });
  }
}

// Generate Column 2 (seats 41-80)
const columnOffset = col2_row1[0][0] - col1_row1[0][0]; // ~57
const col2_xPositions = col1_xPositions.map(x => x + columnOffset);

console.log('Column offset:', columnOffset);
console.log('Col2 X positions:', col2_xPositions);

for (let row = 0; row < 8; row++) {
  const z = col1_startZ + (row * rowSpacingZ);
  const y = col1_startY + (row * rowSpacingY);
  const zVariation = (row % 2) * 0.5;
  
  for (let seat = 0; seat < 5; seat++) {
    allSeats.push({
      seatNumber: seatNumber++,
      position: [
        parseFloat(col2_xPositions[seat].toFixed(3)),
        parseFloat(y.toFixed(3)),
        parseFloat((z + zVariation).toFixed(3))
      ]
    });
  }
}

// Generate Column 3 (seats 81-120)
const col3_xPositions = col2_xPositions.map(x => x + columnOffset);

console.log('Col3 X positions:', col3_xPositions);

for (let row = 0; row < 8; row++) {
  const z = col1_startZ + (row * rowSpacingZ);
  const y = col1_startY + (row * rowSpacingY);
  const zVariation = (row % 2) * 0.5;
  
  for (let seat = 0; seat < 5; seat++) {
    allSeats.push({
      seatNumber: seatNumber++,
      position: [
        parseFloat(col3_xPositions[seat].toFixed(3)),
        parseFloat(y.toFixed(3)),
        parseFloat((z + zVariation).toFixed(3))
      ]
    });
  }
}

// Output
console.log('\n=== ALL 120 LECTURE HALL SEATS ===\n');
console.log(JSON.stringify(allSeats, null, 2));

// Also output in format for seatCalculator.js
console.log('\n=== FOR seatCalculator.js ===\n');
console.log('const LECTURE_HALL_SEATS = [');
allSeats.forEach((seat, idx) => {
  console.log(`  { id: ${seat.seatNumber}, position: [${seat.position[0]}, ${seat.position[1]}, ${seat.position[2]}] }${idx < allSeats.length - 1 ? ',' : ''}`);
});
console.log('];');
