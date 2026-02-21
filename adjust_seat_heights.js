// Script to raise specific seat heights by 20% (SEATS ONLY - cameras later)
const fs = require('fs');

// Seats to adjust
const seatsToAdjust = [
  // Column 1: seats 25-30
  25, 26, 27, 28, 29, 30,
  // Column 2: seats 73-88
  73, 74, 75, 76, 77, 78, 79, 80,
  81, 82, 83, 84, 85, 86, 87, 88,
  // Column 3: seats 125-134
  125, 126, 127, 128, 129, 130, 131, 132, 133, 134
];

const heightIncrease = 0.20; // 20%

// Read the seat positions file
console.log('Reading lecture_hall_seats.json...');
const seatsData = JSON.parse(fs.readFileSync('./lecture_hall_seats.json', 'utf8'));

console.log('⚠️  SEATS ONLY MODE - Cameras will NOT be adjusted');

// Update seat positions
console.log('\n=== Updating Seat Heights ===');
seatsToAdjust.forEach(seatId => {
  const seat = seatsData.find(s => s.id === seatId);
  if (seat) {
    const oldHeight = seat.position[1];
    const heightDelta = oldHeight * heightIncrease;
    seat.position[1] = parseFloat((oldHeight + heightDelta).toFixed(3));
    console.log(`Seat ${seatId}: ${oldHeight} → ${seat.position[1]} (+${heightDelta.toFixed(3)})`);
  } else {
    console.warn(`⚠️  Seat ${seatId} not found in seats data`);
  }
});

console.log('\n⚠️  Skipping camera height adjustments (seats only mode)');

// Write updated files
console.log('\n=== Writing Updated Files ===');
fs.writeFileSync('./lecture_hall_seats.json', JSON.stringify(seatsData, null, 2));
console.log('✅ Updated lecture_hall_seats.json');
console.log('⏭️  Camera files NOT modified (awaiting final height approval)');

console.log('\n✨ Seat height adjustments complete!');
console.log(`\nAdjusted ${seatsToAdjust.length} seat positions by 20%:`);
console.log(`  Column 1: seats 25-30 (6 seats)`);
console.log(`  Column 2: seats 73-88 (16 seats)`);
console.log(`  Column 3: seats 125-134 (10 seats)`);
console.log('\n📌 Next step: Reload seats in Position Calculator to see the difference');