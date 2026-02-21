const fs = require('fs');
const path = require('path');

// Read the two files
const centerFile = path.join(__dirname, 'public/cinema/cinemaSeats.json');
const leftRightFile = path.join(__dirname, '../../../Users/Chinw/Downloads/cinemaSeats (10).json');

console.log('Reading center coordinates from:', centerFile);
console.log('Reading left/right coordinates from:', leftRightFile);

const centerData = JSON.parse(fs.readFileSync(centerFile, 'utf8'));
const leftRightData = JSON.parse(fs.readFileSync(leftRightFile, 'utf8'));

// Merge the data
const mergedSeats = centerData.seats.map(centerSeat => {
  const leftRightSeat = leftRightData.seats.find(s => s.id === centerSeat.id);
  
  if (!leftRightSeat) {
    console.warn(`⚠️  Seat ${centerSeat.id} not found in left/right data`);
    return centerSeat;
  }
  
  return {
    ...centerSeat,
    cameraViews: {
      left: leftRightSeat.cameraViews.left,
      center: centerSeat.cameraViews.center,
      right: leftRightSeat.cameraViews.right
    }
  };
});

const mergedData = {
  seats: mergedSeats
};

// Write merged data back to cinemaSeats.json
const outputPath = centerFile;
fs.writeFileSync(outputPath, JSON.stringify(mergedData, null, 2));

console.log('✅ Merged data written to:', outputPath);
console.log(`✅ Total seats: ${mergedSeats.length}`);

// Verify the merge
let successCount = 0;
mergedSeats.forEach(seat => {
  const hasPosition = seat.position.some(v => v !== 0);
  const hasCenter = seat.cameraViews.center.position.some(v => v !== 0);
  const hasLeft = seat.cameraViews.left.position.some(v => v !== 0);
  const hasRight = seat.cameraViews.right.position.some(v => v !== 0);
  
  if (hasPosition && hasCenter && hasLeft && hasRight) {
    successCount++;
  } else {
    console.warn(`⚠️  Seat ${seat.id}: position=${hasPosition}, center=${hasCenter}, left=${hasLeft}, right=${hasRight}`);
  }
});

console.log(`✅ ${successCount}/${mergedSeats.length} seats have complete data`);
