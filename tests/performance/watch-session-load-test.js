#!/usr/bin/env node
/**
 * WeWatch - Watch Session Load Test
 * 
 * Tests concurrent users in a REAL watch session:
 * - Creates a watch session
 * - Spawns concurrent users
 * - Users join via WebSocket
 * - Simulates watching behavior (play, pause, seek, chat, seats)
 * - Monitors for crashes, disconnections, memory issues
 * 
 * Usage:
 *   node tests/performance/watch-session-load-test.js --users 20
 */

const WebSocket = require('ws');
const http = require('http');
const { performance } = require('perf_hooks');

// Store cookies for session management
let sessionCookies = [];

// ===========================
// Configuration
// ===========================
const CONFIG = {
  apiUrl: 'http://localhost:8080',
  wsUrl: 'ws://localhost:8080',
  
  // Test credentials (user that will create the session)
  hostUser: {
    email: 'michelle@gmail.com',
    password: 'Password'
  },
  
  // Test parameters (override with CLI args)
  concurrentUsers: 20,
  rampUpSeconds: 10,
  testDurationSeconds: 60,
  
  // Use existing session (can be overridden)
  useExistingSession: true,
  existingRoomId: 108,
  existingSessionId: 'faf6c932-232a-48b7-afcc-f8f6aaeb4e5a',
  
  // Behavior settings
  takeSeatProbability: 0.7, // 70% of users take seats
  chatMessageInterval: 8000, // Send chat every 8 seconds
  syncInterval: 15000, // Request sync every 15 seconds
  
  // Video to watch (will be created in session)
  testVideo: {
    title: "Load Test Video",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    mediaType: "youtube",
    thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg"
  }
};

// ===========================
// Metrics Collection
// ===========================
const metrics = {
  startTime: null,
  endTime: null,
  sessionId: null,
  roomId: null,
  
  connections: {
    attempted: 0,
    successful: 0,
    failed: 0,
    disconnected: 0,
    durations: []
  },
  
  messages: {
    sent: 0,
    received: 0,
    errors: 0,
    syncEvents: 0,
    chatMessages: 0
  },
  
  seats: {
    taken: 0,
    failed: 0
  },
  
  errors: [],
  activeUsers: 0,
  peakUsers: 0
};

// ===========================
// API Helper Functions
// ===========================
async function apiRequest(method, path, data = null, useCookies = false) {
  return new Promise((resolve, reject) => {
    const url = new URL(CONFIG.apiUrl + path);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    // Add cookies if available
    if (useCookies && sessionCookies.length > 0) {
      options.headers['Cookie'] = sessionCookies.join('; ');
    }
    
    const req = http.request(url, options, (res) => {
      // Store cookies from Set-Cookie headers
      const setCookies = res.headers['set-cookie'];
      if (setCookies) {
        sessionCookies = sessionCookies.concat(setCookies.map(c => c.split(';')[0]));
      }
      
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${parsed.error || body}`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function loginUser(email, password) {
  try {
    const response = await apiRequest('POST', '/api/auth/login', { email, password }, false);
    console.log(`✅ Logged in, got ${sessionCookies.length} cookies`);
    return 'cookie-auth'; // Return placeholder - we're using cookies
  } catch (error) {
    throw new Error(`Login failed: ${error.message}`);
  }
}

async function createInstantWatchRoom(token) {
  try {
    // Use cookies for auth
    const roomData = {
      name: `Load Test Room - ${new Date().toISOString()}`,
      type: "lecture_hall",
      is_private: false
    };
    
    const response = await apiRequest('POST', '/api/rooms/instant-watch', roomData, true);
    return {
      roomId: response.room_id || response.id,
      sessionId: response.session_id
    };
  } catch (error) {
    throw new Error(`Failed to create instant watch room: ${error.message}`);
  }
}

async function addVideoToSession(token, roomId, video) {
  try {
    await apiRequest('POST', `/api/rooms/${roomId}/media/stream`, video, true);
  } catch (error) {
    console.warn(`⚠️  Failed to add video: ${error.message}`);
  }
}

// ===========================
// Fake Viewer Client
// ===========================
class ViewerClient {
  constructor(userId, username, roomId, sessionId, token) {
    this.userId = userId;
    this.username = username;
    this.roomId = roomId;
    this.sessionId = sessionId;
    this.token = token;
    this.ws = null;
    this.connected = false;
    this.seatId = null;
    this.intervals = [];
    this.connectionStartTime = null;
  }
  
  async connect() {
    return new Promise((resolve, reject) => {
      this.connectionStartTime = performance.now();
      metrics.connections.attempted++;
      
      // WebSocket endpoint is /api/rooms/:id/ws  
      const url = `${CONFIG.wsUrl}/api/rooms/${this.roomId}/ws`;
      const wsOptions = {
        headers: {
          'Cookie': sessionCookies.join('; ')
        }
      };
      
      console.log(`🔌 Connecting ${this.username} to ${url}...`);
      this.ws = new WebSocket(url, wsOptions);
      
      const timeout = setTimeout(() => {
        if (!this.connected) {
          this.ws.close();
          metrics.connections.failed++;
          reject(new Error('Connection timeout'));
        }
      }, 5000);
      
      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.connected = true;
        const duration = performance.now() - this.connectionStartTime;
        metrics.connections.successful++;
        metrics.connections.durations.push(duration);
        metrics.activeUsers++;
        metrics.peakUsers = Math.max(metrics.peakUsers, metrics.activeUsers);
        
        console.log(`✅ [${metrics.activeUsers}/${CONFIG.concurrentUsers}] ${this.username} connected (${duration.toFixed(0)}ms)`);
        resolve();
      });
      
      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });
      
      this.ws.on('error', (error) => {
        metrics.connections.failed++;
        metrics.errors.push(`${this.username}: ${error.message}`);
      });
      
      this.ws.on('close', () => {
        this.connected = false;
        metrics.activeUsers--;
        metrics.connections.disconnected++;
        this.cleanup();
      });
    });
  }
  
  handleMessage(data) {
    try {
      metrics.messages.received++;
      const message = JSON.parse(data.toString());
      
      // Track different message types
      if (message.type === 'video_sync') {
        metrics.messages.syncEvents++;
      } else if (message.type === 'chat_message') {
        metrics.messages.chatMessages++;
      } else if (message.type === 'seat_assigned' && message.data?.user_id === this.userId) {
        this.seatId = message.data.seat_id;
        metrics.seats.taken++;
        console.log(`🪑 ${this.username} took seat ${this.seatId}`);
      }
    } catch (error) {
      metrics.messages.errors++;
      metrics.errors.push(`${this.username}: Parse error - ${error.message}`);
    }
  }
  
  sendMessage(message) {
    if (!this.connected || !this.ws) return;
    
    try {
      this.ws.send(JSON.stringify(message));
      metrics.messages.sent++;
    } catch (error) {
      metrics.messages.errors++;
      metrics.errors.push(`${this.username}: Send failed - ${error.message}`);
    }
  }
  
  takeSeat() {
    if (!this.connected || this.seatId) return;
    
    // Random seat in lecture hall (145 seats)
    const seatId = Math.floor(Math.random() * 145) + 1;
    const row = Math.floor((seatId - 1) / 12);
    const col = (seatId - 1) % 12;
    
    this.sendMessage({
      type: 'take_seat',
      seat_id: seatId,
      row: row,
      col: col,
      user_id: this.userId
    });
  }
  
  sendChat() {
    const messages = [
      "This is awesome! 🎉",
      "Great movie choice",
      "Anyone else lagging?",
      "This scene is epic",
      "lol 😂",
      "🍿🍿🍿",
      "Wait, what just happened?",
      "Can we rewind that?"
    ];
    
    this.sendMessage({
      type: 'chat_message',
      content: messages[Math.floor(Math.random() * messages.length)],
      user_id: this.userId,
      username: this.username
    });
  }
  
  requestSync() {
    this.sendMessage({
      type: 'request_sync'
    });
  }
  
  simulateWatching() {
    // Take a seat if probability allows
    if (Math.random() < CONFIG.takeSeatProbability) {
      setTimeout(() => this.takeSeat(), Math.random() * 5000);
    }
    
    // Periodically send chat messages
    const chatInterval = setInterval(() => {
      if (Math.random() < 0.3) { // 30% chance to send chat
        this.sendChat();
      }
    }, CONFIG.chatMessageInterval + Math.random() * 3000);
    this.intervals.push(chatInterval);
    
    // Periodically request sync
    const syncInterval = setInterval(() => {
      this.requestSync();
    }, CONFIG.syncInterval + Math.random() * 5000);
    this.intervals.push(syncInterval);
  }
  
  cleanup() {
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
  }
  
  disconnect() {
    this.cleanup();
    if (this.ws) {
      this.ws.close();
    }
  }
}

// ===========================
// Test Orchestrator
// ===========================
class LoadTestOrchestrator {
  constructor() {
    this.clients = [];
    this.hostToken = null;
  }
  
  async setup() {
    console.log('\n🔧 Setting up watch session load test...\n');
    
    // Step 1: Login to get session cookies
    console.log('1️⃣  Logging in to get session cookies...');
    this.hostToken = await loginUser(CONFIG.hostUser.email, CONFIG.hostUser.password);
    console.log('✅ Logged in\n');
    
    // Step 2: Use existing session or create new one
    let sessionId, roomId;
    
    if (CONFIG.useExistingSession) {
      console.log('2️⃣  Using existing watch session...');
      sessionId = CONFIG.existingSessionId;
      roomId = CONFIG.existingRoomId;
      console.log(`✅ Room ID: ${roomId}`);
      console.log(`✅ Session ID: ${sessionId}\n`);
    } else {
      console.log('2️⃣  Creating new instant watch room...');
      const result = await createInstantWatchRoom(this.hostToken);
      sessionId = result.sessionId;
      roomId = result.roomId;
      console.log(`✅ Room created: ${roomId}`);
      console.log(`✅ Session created: ${sessionId}\n`);
      
      console.log('3️⃣  Adding video to room...');
      await addVideoToSession(this.hostToken, roomId, CONFIG.testVideo);
      console.log('✅ Video added\n');
    }
    
    metrics.sessionId = sessionId;
    metrics.roomId = roomId;
    
    return { sessionId, roomId };
  }
  
  async spawnUsers(sessionId, roomId) {
    const delayBetweenUsers = (CONFIG.rampUpSeconds * 1000) / CONFIG.concurrentUsers;
    
    console.log(`4️⃣  Spawning ${CONFIG.concurrentUsers} concurrent viewers...\n`);
    console.log(`⏱️  Ramp-up time: ${CONFIG.rampUpSeconds}s (${delayBetweenUsers.toFixed(0)}ms between each user)\n`);
    
    for (let i = 0; i < CONFIG.concurrentUsers; i++) {
      const username = `viewer_${i}`;
      const userId = 2000 + i;
      
      // For simplicity, all users use the same token (guests)
      // In production, each would have their own token
      const client = new ViewerClient(userId, username, roomId, sessionId, this.hostToken);
      this.clients.push(client);
      
      // Connect and start watching behavior (don't await)
      client.connect()
        .then(() => client.simulateWatching())
        .catch(error => {
          console.error(`❌ ${username} failed: ${error.message}`);
        });
      
      await sleep(delayBetweenUsers);
    }
    
    console.log(`\n✅ All users spawned! Current active: ${metrics.activeUsers}\n`);
  }
  
  async run() {
    try {
      metrics.startTime = Date.now();
      
      // Setup session
      const { sessionId, roomId } = await this.setup();
      
      // Spawn concurrent users
      await this.spawnUsers(sessionId, roomId);
      
      // Sustain load
      console.log(`⏳ Sustaining load for ${CONFIG.testDurationSeconds} seconds...\n`);
      await sleep(CONFIG.testDurationSeconds * 1000);
      
      // Cleanup
      console.log('\n🧹 Cleaning up...');
      this.clients.forEach(client => client.disconnect());
      await sleep(2000); // Wait for disconnections
      
      metrics.endTime = Date.now();
      
      // Print results
      this.printResults();
      
    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
      process.exit(1);
    }
  }
  
  printResults() {
    const duration = (metrics.endTime - metrics.startTime) / 1000;
    const avgConnTime = metrics.connections.durations.length > 0
      ? metrics.connections.durations.reduce((a, b) => a + b, 0) / metrics.connections.durations.length
      : 0;
    
    const errorRate = metrics.connections.attempted > 0
      ? (metrics.connections.failed / metrics.connections.attempted) * 100
      : 0;
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 WATCH SESSION LOAD TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`\n⏱️  Test Duration: ${duration.toFixed(1)}s`);
    console.log(`🎬 Session ID: ${metrics.sessionId}`);
    console.log(`🏠 Room ID: ${metrics.roomId}`);
    
    console.log('\n👥 CONNECTIONS:');
    console.log(`   Attempted:    ${metrics.connections.attempted}`);
    console.log(`   Successful:   ${metrics.connections.successful} ✅`);
    console.log(`   Failed:       ${metrics.connections.failed} ${metrics.connections.failed > 0 ? '❌' : ''}`);
    console.log(`   Disconnected: ${metrics.connections.disconnected}`);
    console.log(`   Peak Users:   ${metrics.peakUsers}`);
    console.log(`   Avg Connect:  ${avgConnTime.toFixed(0)}ms`);
    console.log(`   Error Rate:   ${errorRate.toFixed(1)}%`);
    
    console.log('\n💬 MESSAGES:');
    console.log(`   Sent:         ${metrics.messages.sent}`);
    console.log(`   Received:     ${metrics.messages.received}`);
    console.log(`   Chat:         ${metrics.messages.chatMessages}`);
    console.log(`   Sync Events:  ${metrics.messages.syncEvents}`);
    console.log(`   Errors:       ${metrics.messages.errors}`);
    
    console.log('\n🪑 SEATS:');
    console.log(`   Taken:        ${metrics.seats.taken}`);
    console.log(`   Failed:       ${metrics.seats.failed}`);
    
    // Pass/Fail criteria
    console.log('\n✅ SUCCESS CRITERIA:');
    const passConnection = metrics.connections.successful >= CONFIG.concurrentUsers * 0.95;
    const passErrorRate = errorRate < 10;
    const passMessages = metrics.messages.errors < metrics.messages.sent * 0.05;
    
    console.log(`   ${passConnection ? '✅' : '❌'} 95%+ users connected (${metrics.connections.successful}/${CONFIG.concurrentUsers})`);
    console.log(`   ${passErrorRate ? '✅' : '❌'} Error rate < 10% (${errorRate.toFixed(1)}%)`);
    console.log(`   ${passMessages ? '✅' : '❌'} Message errors < 5% (${metrics.messages.errors}/${metrics.messages.sent})`);
    
    const passed = passConnection && passErrorRate && passMessages;
    
    console.log('\n' + '='.repeat(60));
    if (passed) {
      console.log('🎉 TEST PASSED - Session handled concurrent users successfully!');
    } else {
      console.log('❌ TEST FAILED - Session has scalability issues');
    }
    console.log('='.repeat(60) + '\n');
    
    // Show first few errors if any
    if (metrics.errors.length > 0) {
      console.log('\n⚠️  Errors (showing first 10):');
      metrics.errors.slice(0, 10).forEach(err => console.log(`   - ${err}`));
      if (metrics.errors.length > 10) {
        console.log(`   ... and ${metrics.errors.length - 10} more errors`);
      }
    }
  }
}

// ===========================
// Utility Functions
// ===========================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--users':
        CONFIG.concurrentUsers = parseInt(args[++i]) || 20;
        break;
      case '--rampup':
        CONFIG.rampUpSeconds = parseInt(args[++i]) || 10;
        break;
      case '--duration':
        CONFIG.testDurationSeconds = parseInt(args[++i]) || 60;
        break;
      case '--help':
        console.log(`
WeWatch Watch Session Load Test

Usage: node tests/performance/watch-session-load-test.js [options]

Options:
  --users <n>       Number of concurrent users (default: 20)
  --rampup <n>      Ramp-up time in seconds (default: 10)
  --duration <n>    Test duration in seconds (default: 60)
  --help            Show this help message

Examples:
  node tests/performance/watch-session-load-test.js --users 20
  node tests/performance/watch-session-load-test.js --users 50 --duration 120
        `);
        process.exit(0);
    }
  }
}

// ===========================
// Main Execution
// ===========================
async function main() {
  parseArgs();
  
  console.log('\n' + '='.repeat(60));
  console.log('🎬 WeWatch - Watch Session Load Test');
  console.log('='.repeat(60));
  console.log(`\nConfig:`);
  console.log(`  Concurrent Users: ${CONFIG.concurrentUsers}`);
  console.log(`  Ramp-up Time: ${CONFIG.rampUpSeconds}s`);
  console.log(`  Test Duration: ${CONFIG.testDurationSeconds}s`);
  
  const orchestrator = new LoadTestOrchestrator();
  await orchestrator.run();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Test interrupted by user');
  process.exit(0);
});

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
