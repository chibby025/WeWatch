#!/usr/bin/env node
/**
 * WeWatch Load Testing Script
 * 
 * Tests WebSocket scalability by spawning concurrent fake clients
 * Validates 1000-user capacity for lecture hall sessions
 * 
 * Usage:
 *   node load-test.js --users 100 --rampup 10 --duration 60
 *   node load-test.js --scenario spike
 *   node load-test.js --scenario sustained --users 1000
 */

const WebSocket = require('ws');
const { performance } = require('perf_hooks');

// ===========================
// Configuration
// ===========================
const CONFIG = {
  // Server settings
  wsUrl: 'ws://localhost:8080/ws',
  authToken: null, // Will be set per user
  roomId: 108,
  sessionId: null, // Will be fetched
  
  // Test parameters (can be overridden by CLI args)
  totalUsers: 100,
  rampUpSeconds: 10, // Time to spawn all users
  durationSeconds: 60, // How long to sustain load
  
  // Behavior settings
  messageInterval: 5000, // Send message every 5 seconds
  takeSeatProbability: 0.8, // 80% of users take seats
  
  // Performance thresholds
  maxConnectionTime: 5000, // ms
  maxMessageLatency: 1000, // ms
  acceptableErrorRate: 0.05 // 5%
};

// ===========================
// Metrics Collection
// ===========================
const metrics = {
  startTime: null,
  endTime: null,
  
  connections: {
    attempted: 0,
    successful: 0,
    failed: 0,
    durations: [] // ms
  },
  
  messages: {
    sent: 0,
    received: 0,
    latencies: [], // ms
    errors: 0
  },
  
  seats: {
    assignmentsSent: 0,
    assignmentsConfirmed: 0,
    assignmentsFailed: 0
  },
  
  errors: [],
  
  // Per-second metrics for graphing
  timeline: []
};

// ===========================
// Fake Client Class
// ===========================
class FakeClient {
  constructor(userId, username, token) {
    this.userId = userId;
    this.username = username;
    this.token = token;
    this.ws = null;
    this.connected = false;
    this.seatId = null;
    this.messageInterval = null;
    this.connectionStartTime = null;
    this.pendingMessages = new Map(); // messageId -> timestamp
  }
  
  async connect() {
    return new Promise((resolve, reject) => {
      this.connectionStartTime = performance.now();
      metrics.connections.attempted++;
      
      const url = `${CONFIG.wsUrl}?room_id=${CONFIG.roomId}&token=${this.token}${CONFIG.sessionId ? `&session_id=${CONFIG.sessionId}` : ''}`;
      
      this.ws = new WebSocket(url);
      
      const timeout = setTimeout(() => {
        if (!this.connected) {
          this.ws.close();
          metrics.connections.failed++;
          metrics.errors.push(`User ${this.userId}: Connection timeout`);
          reject(new Error('Connection timeout'));
        }
      }, CONFIG.maxConnectionTime);
      
      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.connected = true;
        const duration = performance.now() - this.connectionStartTime;
        metrics.connections.successful++;
        metrics.connections.durations.push(duration);
        
        console.log(`✅ User ${this.userId} (${this.username}) connected in ${duration.toFixed(0)}ms`);
        resolve();
      });
      
      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });
      
      this.ws.on('error', (error) => {
        metrics.connections.failed++;
        metrics.errors.push(`User ${this.userId}: ${error.message}`);
        reject(error);
      });
      
      this.ws.on('close', () => {
        this.connected = false;
        if (this.messageInterval) {
          clearInterval(this.messageInterval);
        }
      });
    });
  }
  
  handleMessage(data) {
    try {
      metrics.messages.received++;
      const message = JSON.parse(data.toString());
      
      // Track latency for acknowledged messages
      if (message.type === 'seat_assigned' && message.data?.user_id === this.userId) {
        const messageId = `seat_${message.data.seat_id}`;
        if (this.pendingMessages.has(messageId)) {
          const latency = performance.now() - this.pendingMessages.get(messageId);
          metrics.messages.latencies.push(latency);
          this.pendingMessages.delete(messageId);
          
          this.seatId = message.data.seat_id;
          metrics.seats.assignmentsConfirmed++;
          console.log(`🪑 User ${this.userId} assigned to seat ${this.seatId} (${latency.toFixed(0)}ms latency)`);
        }
      }
      
      // Track session status updates
      if (message.type === 'session_status') {
        // Validate member count
        if (message.data?.members) {
          const memberCount = message.data.members.length;
          // Could add validation here
        }
      }
      
    } catch (error) {
      metrics.messages.errors++;
      metrics.errors.push(`User ${this.userId}: Failed to parse message - ${error.message}`);
    }
  }
  
  async takeSeat() {
    if (!this.connected || !this.ws) {
      metrics.seats.assignmentsFailed++;
      return;
    }
    
    // Random seat between 1-145 (lecture hall capacity)
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
    
    const messageId = `seat_${seatId}`;
    this.pendingMessages.set(messageId, performance.now());
    
    try {
      this.ws.send(JSON.stringify(message));
      metrics.messages.sent++;
      metrics.seats.assignmentsSent++;
    } catch (error) {
      metrics.seats.assignmentsFailed++;
      metrics.errors.push(`User ${this.userId}: Failed to take seat - ${error.message}`);
    }
  }
  
  sendRandomMessage() {
    if (!this.connected || !this.ws) return;
    
    const messageTypes = ['chat_message', 'ping', 'request_seat_state'];
    const randomType = messageTypes[Math.floor(Math.random() * messageTypes.length)];
    
    let message;
    switch (randomType) {
      case 'chat_message':
        message = {
          type: 'chat_message',
          content: `Test message from ${this.username}`,
          user_id: this.userId
        };
        break;
      case 'ping':
        message = { type: 'ping' };
        break;
      case 'request_seat_state':
        message = { type: 'request_seat_state' };
        break;
    }
    
    try {
      this.ws.send(JSON.stringify(message));
      metrics.messages.sent++;
    } catch (error) {
      metrics.messages.errors++;
    }
  }
  
  startBehavior() {
    // Take a seat if probability allows
    if (Math.random() < CONFIG.takeSeatProbability) {
      setTimeout(() => this.takeSeat(), Math.random() * 3000);
    }
    
    // Periodically send messages
    this.messageInterval = setInterval(() => {
      this.sendRandomMessage();
    }, CONFIG.messageInterval + Math.random() * 2000); // Add jitter
  }
  
  disconnect() {
    if (this.messageInterval) {
      clearInterval(this.messageInterval);
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}

// ===========================
// Load Test Orchestrator
// ===========================
class LoadTestOrchestrator {
  constructor() {
    this.clients = [];
    this.metricsInterval = null;
  }
  
  async generateFakeUsers(count) {
    console.log(`\n📋 Generating ${count} fake users...`);
    const users = [];
    
    for (let i = 0; i < count; i++) {
      users.push({
        userId: 1000 + i,
        username: `loadtest_user_${i}`,
        token: `fake_token_${i}` // In production, get real tokens
      });
    }
    
    console.log(`✅ Generated ${count} fake users\n`);
    return users;
  }
  
  async rampUpUsers(users) {
    const delayBetweenUsers = (CONFIG.rampUpSeconds * 1000) / users.length;
    console.log(`🚀 Ramping up ${users.length} users over ${CONFIG.rampUpSeconds} seconds (${delayBetweenUsers.toFixed(0)}ms between each)\n`);
    
    for (const userData of users) {
      const client = new FakeClient(userData.userId, userData.username, userData.token);
      this.clients.push(client);
      
      // Connect in background (don't await)
      client.connect()
        .then(() => client.startBehavior())
        .catch(error => {
          console.error(`❌ User ${userData.userId} failed to connect:`, error.message);
        });
      
      // Wait before spawning next user
      await sleep(delayBetweenUsers);
    }
    
    console.log(`\n✅ All ${users.length} users spawned. Waiting for connections...\n`);
    
    // Wait for connections to stabilize
    await sleep(2000);
  }
  
  startMetricsCollection() {
    let lastSecond = Math.floor(Date.now() / 1000);
    let secondMetrics = {
      timestamp: lastSecond,
      messagesReceived: 0,
      messagesSent: 0,
      errors: 0,
      activeConnections: 0
    };
    
    this.metricsInterval = setInterval(() => {
      const currentSecond = Math.floor(Date.now() / 1000);
      
      if (currentSecond > lastSecond) {
        // Save previous second's metrics
        metrics.timeline.push(secondMetrics);
        
        // Start new second
        lastSecond = currentSecond;
        secondMetrics = {
          timestamp: currentSecond,
          messagesReceived: metrics.messages.received,
          messagesSent: metrics.messages.sent,
          errors: metrics.errors.length,
          activeConnections: this.clients.filter(c => c.connected).length
        };
      }
    }, 100);
  }
  
  async runTest(scenario = 'default') {
    metrics.startTime = Date.now();
    
    console.log('\n' + '='.repeat(60));
    console.log('  WeWatch Load Test - Scenario: ' + scenario.toUpperCase());
    console.log('='.repeat(60) + '\n');
    
    const users = await this.generateFakeUsers(CONFIG.totalUsers);
    
    this.startMetricsCollection();
    
    await this.rampUpUsers(users);
    
    console.log(`⏱️  Sustaining load for ${CONFIG.durationSeconds} seconds...\n`);
    
    // Print progress every 10 seconds
    const progressInterval = setInterval(() => {
      const active = this.clients.filter(c => c.connected).length;
      const elapsed = Math.floor((Date.now() - metrics.startTime) / 1000);
      console.log(`📊 [${elapsed}s] Active: ${active}/${CONFIG.totalUsers} | Msgs: ${metrics.messages.received} | Errors: ${metrics.errors.length}`);
    }, 10000);
    
    await sleep(CONFIG.durationSeconds * 1000);
    
    clearInterval(progressInterval);
    clearInterval(this.metricsInterval);
    
    console.log('\n🛑 Disconnecting all clients...\n');
    this.clients.forEach(client => client.disconnect());
    
    await sleep(1000); // Let disconnections complete
    
    metrics.endTime = Date.now();
    
    this.generateReport();
  }
  
  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('  LOAD TEST RESULTS');
    console.log('='.repeat(60) + '\n');
    
    const totalDuration = (metrics.endTime - metrics.startTime) / 1000;
    
    // Connection metrics
    console.log('📡 CONNECTIONS:');
    console.log(`  Attempted:     ${metrics.connections.attempted}`);
    console.log(`  Successful:    ${metrics.connections.successful} (${(metrics.connections.successful / metrics.connections.attempted * 100).toFixed(1)}%)`);
    console.log(`  Failed:        ${metrics.connections.failed}`);
    
    if (metrics.connections.durations.length > 0) {
      const avgConnectionTime = average(metrics.connections.durations);
      const p95ConnectionTime = percentile(metrics.connections.durations, 95);
      const maxConnectionTime = Math.max(...metrics.connections.durations);
      
      console.log(`  Avg time:      ${avgConnectionTime.toFixed(0)}ms`);
      console.log(`  P95 time:      ${p95ConnectionTime.toFixed(0)}ms`);
      console.log(`  Max time:      ${maxConnectionTime.toFixed(0)}ms`);
    }
    
    // Message metrics
    console.log('\n💬 MESSAGES:');
    console.log(`  Sent:          ${metrics.messages.sent}`);
    console.log(`  Received:      ${metrics.messages.received}`);
    console.log(`  Errors:        ${metrics.messages.errors}`);
    console.log(`  Throughput:    ${(metrics.messages.received / totalDuration).toFixed(1)} msgs/sec`);
    
    if (metrics.messages.latencies.length > 0) {
      const avgLatency = average(metrics.messages.latencies);
      const p95Latency = percentile(metrics.messages.latencies, 95);
      const maxLatency = Math.max(...metrics.messages.latencies);
      
      console.log(`  Avg latency:   ${avgLatency.toFixed(0)}ms`);
      console.log(`  P95 latency:   ${p95Latency.toFixed(0)}ms`);
      console.log(`  Max latency:   ${maxLatency.toFixed(0)}ms`);
    }
    
    // Seat assignment metrics
    console.log('\n🪑 SEAT ASSIGNMENTS:');
    console.log(`  Requested:     ${metrics.seats.assignmentsSent}`);
    console.log(`  Confirmed:     ${metrics.seats.assignmentsConfirmed} (${(metrics.seats.assignmentsConfirmed / metrics.seats.assignmentsSent * 100).toFixed(1)}%)`);
    console.log(`  Failed:        ${metrics.seats.assignmentsFailed}`);
    
    // Error summary
    console.log('\n❌ ERRORS:');
    console.log(`  Total:         ${metrics.errors.length}`);
    const errorRate = metrics.errors.length / metrics.connections.attempted;
    console.log(`  Error rate:    ${(errorRate * 100).toFixed(2)}%`);
    
    if (metrics.errors.length > 0 && metrics.errors.length <= 10) {
      console.log('\n  Recent errors:');
      metrics.errors.slice(-10).forEach(err => console.log(`    - ${err}`));
    }
    
    // Performance assessment
    console.log('\n✅ PERFORMANCE ASSESSMENT:');
    const passed = [];
    const failed = [];
    
    if (metrics.connections.successful / metrics.connections.attempted >= 0.95) {
      passed.push('Connection success rate >= 95%');
    } else {
      failed.push(`Connection success rate: ${(metrics.connections.successful / metrics.connections.attempted * 100).toFixed(1)}% (target: 95%)`);
    }
    
    if (metrics.messages.latencies.length > 0) {
      const avgLatency = average(metrics.messages.latencies);
      if (avgLatency < CONFIG.maxMessageLatency) {
        passed.push(`Average latency < ${CONFIG.maxMessageLatency}ms`);
      } else {
        failed.push(`Average latency: ${avgLatency.toFixed(0)}ms (target: <${CONFIG.maxMessageLatency}ms)`);
      }
    }
    
    if (errorRate < CONFIG.acceptableErrorRate) {
      passed.push(`Error rate < ${CONFIG.acceptableErrorRate * 100}%`);
    } else {
      failed.push(`Error rate: ${(errorRate * 100).toFixed(2)}% (target: <${CONFIG.acceptableErrorRate * 100}%)`);
    }
    
    if (passed.length > 0) {
      console.log('  ✅ Passed:');
      passed.forEach(p => console.log(`     - ${p}`));
    }
    
    if (failed.length > 0) {
      console.log('  ❌ Failed:');
      failed.forEach(f => console.log(`     - ${f}`));
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // Final verdict
    if (failed.length === 0) {
      console.log('🎉 ALL TESTS PASSED! System can handle the load.\n');
    } else {
      console.log('⚠️  SOME TESTS FAILED. Review performance bottlenecks.\n');
    }
  }
}

// ===========================
// Utility Functions
// ===========================
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

// ===========================
// CLI Argument Parsing
// ===========================
function parseArgs() {
  const args = process.argv.slice(2);
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--users':
        CONFIG.totalUsers = parseInt(args[++i]);
        break;
      case '--rampup':
        CONFIG.rampUpSeconds = parseInt(args[++i]);
        break;
      case '--duration':
        CONFIG.durationSeconds = parseInt(args[++i]);
        break;
      case '--scenario':
        const scenario = args[++i];
        if (scenario === 'spike') {
          CONFIG.totalUsers = 500;
          CONFIG.rampUpSeconds = 5;
          CONFIG.durationSeconds = 30;
        } else if (scenario === 'sustained') {
          CONFIG.totalUsers = 1000;
          CONFIG.rampUpSeconds = 30;
          CONFIG.durationSeconds = 300;
        }
        break;
      case '--help':
        console.log(`
WeWatch Load Testing Script

Usage:
  node load-test.js [options]

Options:
  --users <n>       Number of concurrent users (default: 100)
  --rampup <s>      Ramp-up time in seconds (default: 10)
  --duration <s>    Test duration in seconds (default: 60)
  --scenario <name> Predefined scenario: spike, sustained
  --help            Show this help message

Examples:
  node load-test.js --users 500 --rampup 20 --duration 120
  node load-test.js --scenario spike
  node load-test.js --scenario sustained
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
  
  const orchestrator = new LoadTestOrchestrator();
  await orchestrator.runTest();
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { FakeClient, LoadTestOrchestrator };
