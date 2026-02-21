#!/usr/bin/env node

/**
 * Lecture Hall Overflow Load Test
 * 
 * Tests the automatic hall creation when 145 seats are filled.
 * Simulates 200 users joining to trigger overflow to Hall 2, Hall 3, etc.
 * 
 * Usage:
 *   node test-lecture-hall-overflow.js <roomId> <hostToken>
 * 
 * Example:
 *   node test-lecture-hall-overflow.js 123 "Bearer eyJhbGc..."
 */

const WebSocket = require('ws');

// Configuration
const WS_URL = 'ws://localhost:8080/ws';
const BACKEND_URL = 'http://localhost:8080';
const NUM_USERS = 200; // Will create Hall 1 (145), Hall 2 (55)
const DELAY_BETWEEN_JOINS = 100; // ms

// Parse command line arguments
const roomId = process.argv[2];
const hostToken = process.argv[3];

if (!roomId || !hostToken) {
  console.error('❌ Usage: node test-lecture-hall-overflow.js <roomId> <hostToken>');
  console.error('Example: node test-lecture-hall-overflow.js 123 "Bearer eyJhbGc..."');
  process.exit(1);
}

console.log('🏫 Lecture Hall Overflow Load Test');
console.log('====================================');
console.log(`Room ID: ${roomId}`);
console.log(`Users: ${NUM_USERS}`);
console.log(`Expected Halls: ${Math.ceil(NUM_USERS / 145)}`);
console.log('');

// Track hall assignments
const hallAssignments = new Map(); // userId -> hallNumber
const connections = [];
let connectedCount = 0;
let seatedCount = 0;
let hallsCreated = new Set([1]); // Start with Hall 1

/**
 * Create a simulated user connection
 */
async function createUser(userId, seatId) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    
    ws.on('open', () => {
      console.log(`✅ [User ${userId}] Connected`);
      connectedCount++;
      
      // Authenticate
      ws.send(JSON.stringify({
        type: 'authenticate',
        token: hostToken, // Using host token for simplicity
        user_id: userId,
        room_id: parseInt(roomId)
      }));
      
      // Wait for auth, then take seat
      setTimeout(() => {
        console.log(`🪑 [User ${userId}] Taking seat ${seatId}...`);
        ws.send(JSON.stringify({
          type: 'take_seat',
          seat_id: seatId.toString(),
          room_id: parseInt(roomId)
        }));
      }, 500);
    });
    
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        
        switch (msg.type) {
          case 'lecture_hall_assigned':
            const hallNumber = msg.data.hall_number;
            hallAssignments.set(userId, hallNumber);
            hallsCreated.add(hallNumber);
            seatedCount++;
            
            console.log(`🏫 [User ${userId}] ✅ Assigned to Hall ${hallNumber}, Seat ${msg.data.seat_id}`);
            console.log(`   📊 Progress: ${seatedCount}/${NUM_USERS} seated | Halls: ${hallsCreated.size}`);
            
            if (seatedCount === NUM_USERS) {
              printResults();
            }
            break;
          
          case 'lecture_hall_created':
            console.log(`🎉 [OVERFLOW] Hall ${msg.data.hall_number} created! Total halls: ${msg.data.total_halls}`);
            hallsCreated.add(msg.data.hall_number);
            break;
          
          case 'seat_assigned':
            console.log(`✅ [User ${userId}] Seat confirmed: ${msg.data?.seat_id || msg.seat_id}`);
            break;
          
          case 'error':
            console.error(`❌ [User ${userId}] Error: ${msg.message}`);
            break;
        }
      } catch (err) {
        // Ignore parse errors
      }
    });
    
    ws.on('error', (err) => {
      console.error(`❌ [User ${userId}] WebSocket error:`, err.message);
    });
    
    ws.on('close', () => {
      console.log(`🔌 [User ${userId}] Disconnected`);
    });
    
    connections.push(ws);
    resolve(ws);
  });
}

/**
 * Print test results
 */
function printResults() {
  console.log('\n');
  console.log('═══════════════════════════════════════');
  console.log('📊 LOAD TEST RESULTS');
  console.log('═══════════════════════════════════════');
  console.log(`Total Users: ${NUM_USERS}`);
  console.log(`Successfully Seated: ${seatedCount}`);
  console.log(`Halls Created: ${hallsCreated.size}`);
  console.log(`Expected Halls: ${Math.ceil(NUM_USERS / 145)}`);
  console.log('');
  
  // Count users per hall
  const hallCounts = new Map();
  hallAssignments.forEach((hallNum) => {
    hallCounts.set(hallNum, (hallCounts.get(hallNum) || 0) + 1);
  });
  
  console.log('Hall Distribution:');
  Array.from(hallsCreated).sort((a, b) => a - b).forEach(hallNum => {
    const count = hallCounts.get(hallNum) || 0;
    const bar = '█'.repeat(Math.floor(count / 5));
    console.log(`  Hall ${hallNum}: ${count}/145 seats ${bar}`);
  });
  
  console.log('');
  
  // Validate
  const expectedHalls = Math.ceil(NUM_USERS / 145);
  const actualHalls = hallsCreated.size;
  
  if (actualHalls === expectedHalls) {
    console.log('✅ TEST PASSED: Correct number of halls created');
  } else {
    console.log(`❌ TEST FAILED: Expected ${expectedHalls} halls, got ${actualHalls}`);
  }
  
  if (seatedCount === NUM_USERS) {
    console.log('✅ TEST PASSED: All users seated successfully');
  } else {
    console.log(`❌ TEST FAILED: Expected ${NUM_USERS} seated, got ${seatedCount}`);
  }
  
  console.log('═══════════════════════════════════════');
  console.log('\n');
  console.log('💡 Next: Check database for hall assignments:');
  console.log(`   SELECT lecture_hall_number, COUNT(*) FROM watch_session_members`);
  console.log(`   WHERE watch_session_id = ${roomId} GROUP BY lecture_hall_number;`);
  console.log('');
  
  // Cleanup after 5 seconds
  setTimeout(() => {
    console.log('🧹 Cleaning up connections...');
    connections.forEach(ws => ws.close());
    process.exit(0);
  }, 5000);
}

/**
 * Main test execution
 */
async function runTest() {
  console.log('🚀 Starting load test...\n');
  
  // Create users sequentially with delay
  for (let i = 1; i <= NUM_USERS; i++) {
    const userId = 1000 + i; // Start from user ID 1001
    const seatId = ((i - 1) % 145) + 1; // Seats 1-145, cycling per hall
    
    await createUser(userId, seatId);
    
    // Delay between joins to simulate realistic load
    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_JOINS));
  }
  
  console.log(`\n✅ All ${NUM_USERS} users created. Waiting for seating assignments...\n`);
  
  // Timeout after 30 seconds
  setTimeout(() => {
    if (seatedCount < NUM_USERS) {
      console.error(`\n⚠️ TIMEOUT: Only ${seatedCount}/${NUM_USERS} users seated after 30s`);
      printResults();
    }
  }, 30000);
}

// Run the test
runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
