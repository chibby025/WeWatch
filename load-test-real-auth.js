#!/usr/bin/env node
/**
 * WeWatch Load Testing Script - WITH REAL AUTHENTICATION
 * 
 * This version creates real test users in the database and uses proper JWT tokens
 * Use this for more realistic testing with actual backend validation
 * 
 * Prerequisites:
 * 1. Backend server running on localhost:8080
 * 2. Database accessible
 * 3. Test users created (or script will create them)
 * 
 * Usage:
 *   node load-test-real-auth.js --users 100 --room 108
 */

const WebSocket = require('ws');
const fetch = require('node-fetch');
const { performance } = require('perf_hooks');

// ===========================
// Configuration
// ===========================
const CONFIG = {
  apiUrl: 'http://localhost:8080/api',
  wsUrl: 'ws://localhost:8080/ws',
  roomId: 108,
  sessionId: null,
  
  // Test credentials
  testUserPrefix: 'loadtest',
  testUserPassword: 'LoadTest123!',
  
  // Test parameters
  totalUsers: 50, // Start smaller with real auth
  rampUpSeconds: 10,
  durationSeconds: 60,
  
  // Behavior
  messageInterval: 10000,
  takeSeatProbability: 0.9
};

const metrics = {
  startTime: null,
  endTime: null,
  auth: {
    registrations: 0,
    registrationsFailed: 0,
    logins: 0,
    loginsFailed: 0
  },
  connections: {
    attempted: 0,
    successful: 0,
    failed: 0,
    durations: []
  },
  messages: {
    sent: 0,
    received: 0,
    latencies: [],
    errors: 0
  },
  seats: {
    assignmentsSent: 0,
    assignmentsConfirmed: 0
  },
  errors: []
};

// ===========================
// API Client
// ===========================
class APIClient {
  static async registerUser(username, email, password) {
    try {
      const response = await fetch(`${CONFIG.apiUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      
      if (response.ok) {
        metrics.auth.registrations++;
        return await response.json();
      } else {
        const errorText = await response.text();
        // If user already exists, that's okay for load testing
        if (errorText.includes('already exists')) {
          console.log(`ℹ️  User ${username} already exists, will use for testing`);
          return null;
        }
        throw new Error(errorText);
      }
    } catch (error) {
      metrics.auth.registrationsFailed++;
      console.error(`Registration failed for ${username}:`, error.message);
      return null;
    }
  }
  
  static async loginUser(username, password) {
    try {
      const response = await fetch(`${CONFIG.apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      if (response.ok) {
        metrics.auth.logins++;
        const data = await response.json();
        return data.token;
      } else {
        throw new Error(await response.text());
      }
    } catch (error) {
      metrics.auth.loginsFailed++;
      console.error(`Login failed for ${username}:`, error.message);
      return null;
    }
  }
  
  static async getOrCreateSession(roomId, token) {
    try {
      // Check for active session
      const checkResponse = await fetch(`${CONFIG.apiUrl}/rooms/${roomId}/active-session`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (checkResponse.ok) {
        const data = await checkResponse.json();
        if (data.session_id) {
          return data.session_id;
        }
      }
      
      // Create new session
      const createResponse = await fetch(`${CONFIG.apiUrl}/rooms/${roomId}/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          watch_type: 'classroom',
          ticketing_enabled: false
        })
      });
      
      if (createResponse.ok) {
        const data = await createResponse.json();
        return data.session_id;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get/create session:', error.message);
      return null;
    }
  }
}

// ===========================
// Authenticated Client
// ===========================
class AuthenticatedClient {
  constructor(username, token, userId) {
    this.username = username;
    this.token = token;
    this.userId = userId;
    this.ws = null;
    this.connected = false;
    this.seatId = null;
    this.messageInterval = null;
    this.pendingMessages = new Map();
  }
  
  async connect() {
    return new Promise((resolve, reject) => {
      const startTime = performance.now();
      metrics.connections.attempted++;
      
      const sessionParam = CONFIG.sessionId ? `&session_id=${CONFIG.sessionId}` : '';
      const url = `${CONFIG.wsUrl}?room_id=${CONFIG.roomId}&token=${this.token}${sessionParam}`;
      
      this.ws = new WebSocket(url);
      
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
        const duration = performance.now() - startTime;
        metrics.connections.successful++;
        metrics.connections.durations.push(duration);
        console.log(`✅ ${this.username} connected (${duration.toFixed(0)}ms)`);
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
        if (this.messageInterval) clearInterval(this.messageInterval);
      });
    });
  }
  
  handleMessage(data) {
    try {
      metrics.messages.received++;
      const message = JSON.parse(data.toString());
      
      if (message.type === 'seat_assigned' && message.data?.user_id === this.userId) {
        const messageId = `seat_${message.data.seat_id}`;
        if (this.pendingMessages.has(messageId)) {
          const latency = performance.now() - this.pendingMessages.get(messageId);
          metrics.messages.latencies.push(latency);
          this.pendingMessages.delete(messageId);
          this.seatId = message.data.seat_id;
          metrics.seats.assignmentsConfirmed++;
        }
      }
    } catch (error) {
      metrics.messages.errors++;
    }
  }
  
  async takeSeat() {
    if (!this.connected) return;
    
    const seatId = Math.floor(Math.random() * 145) + 1;
    const row = Math.floor((seatId - 1) / 12);
    const col = (seatId - 1) % 12;
    
    const message = {
      type: 'take_seat',
      seat_id: seatId,
      row: row,
      col: col,
      user_id: this.userId
    };
    
    this.pendingMessages.set(`seat_${seatId}`, performance.now());
    
    try {
      this.ws.send(JSON.stringify(message));
      metrics.messages.sent++;
      metrics.seats.assignmentsSent++;
    } catch (error) {
      metrics.errors.push(`${this.username}: Failed to take seat`);
    }
  }
  
  startBehavior() {
    if (Math.random() < CONFIG.takeSeatProbability) {
      setTimeout(() => this.takeSeat(), Math.random() * 5000);
    }
    
    this.messageInterval = setInterval(() => {
      if (this.connected) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping' }));
          metrics.messages.sent++;
        } catch (error) {
          // Ignore
        }
      }
    }, CONFIG.messageInterval);
  }
  
  disconnect() {
    if (this.messageInterval) clearInterval(this.messageInterval);
    if (this.ws) this.ws.close();
  }
}

// ===========================
// Main Orchestrator
// ===========================
async function runLoadTest() {
  metrics.startTime = Date.now();
  
  console.log('\n' + '='.repeat(60));
  console.log('  WeWatch Load Test - WITH REAL AUTHENTICATION');
  console.log('='.repeat(60) + '\n');
  
  console.log(`📋 Preparing ${CONFIG.totalUsers} test users...\n`);
  
  const clients = [];
  const users = [];
  
  // Generate user credentials
  for (let i = 0; i < CONFIG.totalUsers; i++) {
    users.push({
      username: `${CONFIG.testUserPrefix}_${i}`,
      email: `${CONFIG.testUserPrefix}_${i}@loadtest.com`,
      password: CONFIG.testUserPassword
    });
  }
  
  // Register/login all users first
  console.log('🔐 Authenticating users...\n');
  for (const user of users) {
    await APIClient.registerUser(user.username, user.email, user.password);
    const token = await APIClient.loginUser(user.username, user.password);
    
    if (token) {
      user.token = token;
    } else {
      console.error(`❌ Failed to authenticate ${user.username}`);
    }
  }
  
  const authenticatedUsers = users.filter(u => u.token);
  console.log(`\n✅ ${authenticatedUsers.length}/${CONFIG.totalUsers} users authenticated\n`);
  
  if (authenticatedUsers.length === 0) {
    console.error('❌ No users could authenticate. Aborting test.');
    process.exit(1);
  }
  
  // Get or create session (use first user's token)
  console.log('📡 Setting up session...\n');
  CONFIG.sessionId = await APIClient.getOrCreateSession(CONFIG.roomId, authenticatedUsers[0].token);
  if (CONFIG.sessionId) {
    console.log(`✅ Using session: ${CONFIG.sessionId}\n`);
  } else {
    console.log('ℹ️  No session created, clients will join room only\n');
  }
  
  // Ramp up connections
  console.log(`🚀 Connecting ${authenticatedUsers.length} users...\n`);
  const delayBetweenUsers = (CONFIG.rampUpSeconds * 1000) / authenticatedUsers.length;
  
  for (const user of authenticatedUsers) {
    const client = new AuthenticatedClient(user.username, user.token, null);
    clients.push(client);
    
    client.connect()
      .then(() => client.startBehavior())
      .catch(error => console.error(`❌ ${user.username} connection failed:`, error.message));
    
    await sleep(delayBetweenUsers);
  }
  
  console.log(`\n⏱️  Sustaining load for ${CONFIG.durationSeconds} seconds...\n`);
  
  // Progress updates
  const progressInterval = setInterval(() => {
    const active = clients.filter(c => c.connected).length;
    const elapsed = Math.floor((Date.now() - metrics.startTime) / 1000);
    console.log(`📊 [${elapsed}s] Active: ${active}/${clients.length} | Msgs: ${metrics.messages.received} | Errors: ${metrics.errors.length}`);
  }, 10000);
  
  await sleep(CONFIG.durationSeconds * 1000);
  
  clearInterval(progressInterval);
  
  console.log('\n🛑 Disconnecting clients...\n');
  clients.forEach(c => c.disconnect());
  
  await sleep(1000);
  
  metrics.endTime = Date.now();
  
  generateReport();
}

function generateReport() {
  console.log('\n' + '='.repeat(60));
  console.log('  LOAD TEST RESULTS');
  console.log('='.repeat(60) + '\n');
  
  console.log('🔐 AUTHENTICATION:');
  console.log(`  Registrations:   ${metrics.auth.registrations}`);
  console.log(`  Logins:          ${metrics.auth.logins} (${metrics.auth.loginsFailed} failed)`);
  
  console.log('\n📡 CONNECTIONS:');
  console.log(`  Attempted:       ${metrics.connections.attempted}`);
  console.log(`  Successful:      ${metrics.connections.successful} (${(metrics.connections.successful / metrics.connections.attempted * 100).toFixed(1)}%)`);
  console.log(`  Failed:          ${metrics.connections.failed}`);
  
  if (metrics.connections.durations.length > 0) {
    const avg = average(metrics.connections.durations);
    const p95 = percentile(metrics.connections.durations, 95);
    console.log(`  Avg time:        ${avg.toFixed(0)}ms`);
    console.log(`  P95 time:        ${p95.toFixed(0)}ms`);
  }
  
  console.log('\n💬 MESSAGES:');
  console.log(`  Sent:            ${metrics.messages.sent}`);
  console.log(`  Received:        ${metrics.messages.received}`);
  
  if (metrics.messages.latencies.length > 0) {
    const avg = average(metrics.messages.latencies);
    const p95 = percentile(metrics.messages.latencies, 95);
    console.log(`  Avg latency:     ${avg.toFixed(0)}ms`);
    console.log(`  P95 latency:     ${p95.toFixed(0)}ms`);
  }
  
  console.log('\n🪑 SEATS:');
  console.log(`  Requested:       ${metrics.seats.assignmentsSent}`);
  console.log(`  Confirmed:       ${metrics.seats.assignmentsConfirmed} (${(metrics.seats.assignmentsConfirmed / metrics.seats.assignmentsSent * 100).toFixed(1)}%)`);
  
  console.log('\n❌ ERRORS:');
  console.log(`  Total:           ${metrics.errors.length}`);
  
  console.log('\n' + '='.repeat(60) + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function average(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * (p / 100)) - 1;
  return sorted[index];
}

function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--users') CONFIG.totalUsers = parseInt(args[++i]);
    if (args[i] === '--room') CONFIG.roomId = parseInt(args[++i]);
    if (args[i] === '--duration') CONFIG.durationSeconds = parseInt(args[++i]);
  }
}

// Run
parseArgs();
runLoadTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
