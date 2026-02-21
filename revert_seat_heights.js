// Script to revert seat heights back to original values
const fs = require('fs');

// Seats that were modified
const seatsToRevert = [
  // Column 1: seats 25-30
  25, 26, 27, 28, 29, 30,
  // Column 2: seats 73-88
  73, 74, 75, 76, 77, 78, 79, 80,
  81, 82, 83, 84, 85, 86, 87, 88,
  // Column 3: seats 125-134
  125, 126, 127, 128, 129, 130, 131, 132, 133, 134
];

// Original heights before any modifications
const originalHeights = {
  25: 70, 26: 79.875, 27: 79.875, 28: 79.875, 29: 79.875, 30: 79.875,
  73: 70, 74: 70, 75: 70, 76: 70, 77: 70, 78: 70, 79: 70, 80: 70,
  81: 79.875, 82: 79.875, 83: 79.875, 84: 79.875, 85: 79.875, 86: 79.875, 87: 79.875, 88: 79.875,
  125: 70, 126: 70, 127: 70, 128: 70, 129: 70,
  130: 79.875, 131: 79.875, 132: 79.875, 133: 79.875, 134: 79.875
};

// Read the seat positions file
console.log('Reading lecture_hall_seats.json...');
const seatsData = JSON.parse(fs.readFileSync('./lecture_hall_seats.json', 'utf8'));

// Revert seat positions
console.log('\n=== Reverting Seat Heights to Original Values ===');
seatsToRevert.forEach(seatId => {
  const seat = seatsData.find(s => s.id === seatId);
  if (seat) {
    const currentHeight = seat.position[1];
    const originalHeight = originalHeights[seatId];
    seat.position[1] = originalHeight;
    console.log(`Seat ${seatId}: ${currentHeight} → ${originalHeight} (reverted)`);
  } else {
    console.warn(`⚠️  Seat ${seatId} not found in seats data`);
  }
});

// Write updated file
console.log('\n=== Writing Reverted File ===');
fs.writeFileSync('./lecture_hall_seats.json', JSON.stringify(seatsData, null, 2));
console.log('✅ Reverted lecture_hall_seats.json to original heights');

console.log('\n✨ Revert complete!');
console.log(`\n⚠️  NOTE: The Position Calculator does NOT use lecture_hall_seats.json`);
console.log(`   It generates seats algorithmically in handleLoadGeneratedSeats() function`);
console.log(`   File location: frontend/src/pages/PositionCalculatorPage.jsx (lines 518-615)`);
