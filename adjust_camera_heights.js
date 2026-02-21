// Script to raise camera heights by 10% for seats with raised positions
const fs = require('fs');

// Seats with raised positions (need matching camera height adjustments)
const seatsToAdjust = [
  // Column 1: seats 21-30
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
  // Column 2: seats 73-88
  73, 74, 75, 76, 77, 78, 79, 80,
  81, 82, 83, 84, 85, 86, 87, 88,
  // Column 3: seats 125-134
  125, 126, 127, 128, 129, 130, 131, 132, 133, 134
];

const heightIncrease = 0.10; // 10%

// Read the camera positions files
console.log('Reading camera positions files...');
const cameraDataSrc = JSON.parse(fs.readFileSync('./frontend/src/data/lecture_hall_camera_positions.json', 'utf8'));

let cameraDataPublic;
try {
  cameraDataPublic = JSON.parse(fs.readFileSync('./frontend/public/data/lecture_hall_camera_positions.json', 'utf8'));
} catch (err) {
  console.log('⚠️  Public folder camera file not found, will only update src folder');
}

// Update camera positions
console.log('\n=== Updating Camera Heights by 10% ===');
seatsToAdjust.forEach(seatId => {
  // Update src folder
  const cameraSrc = cameraDataSrc[seatId.toString()];
  if (cameraSrc && cameraSrc.position) {
    const oldHeight = cameraSrc.position.y;
    const heightDelta = oldHeight * heightIncrease;
    cameraSrc.position.y = parseFloat((oldHeight + heightDelta).toFixed(3));
    console.log(`Camera ${seatId}: ${oldHeight.toFixed(3)} → ${cameraSrc.position.y} (+${heightDelta.toFixed(3)})`);
  } else {
    console.warn(`⚠️  Camera ${seatId} not found in src camera data`);
  }
  
  // Update public folder if exists
  if (cameraDataPublic) {
    const cameraPublic = cameraDataPublic[seatId.toString()];
    if (cameraPublic && cameraPublic.position) {
      const oldHeight = cameraPublic.position.y;
      const heightDelta = oldHeight * heightIncrease;
      cameraPublic.position.y = parseFloat((oldHeight + heightDelta).toFixed(3));
    }
  }
});

// Write updated files
console.log('\n=== Writing Updated Camera Files ===');
fs.writeFileSync('./frontend/src/data/lecture_hall_camera_positions.json', JSON.stringify(cameraDataSrc, null, 2));
console.log('✅ Updated frontend/src/data/lecture_hall_camera_positions.json');

if (cameraDataPublic) {
  fs.writeFileSync('./frontend/public/data/lecture_hall_camera_positions.json', JSON.stringify(cameraDataPublic, null, 2));
  console.log('✅ Updated frontend/public/data/lecture_hall_camera_positions.json');
}

console.log('\n✨ Camera height adjustments complete!');
console.log(`\nAdjusted ${seatsToAdjust.length} camera positions by 10%:`);
console.log(`  Column 1: seats 21-30 (10 seats)`);
console.log(`  Column 2: seats 73-88 (16 seats)`);
console.log(`  Column 3: seats 125-134 (10 seats)`);
console.log('\n📌 Camera viewpoints now match raised seat positions');
