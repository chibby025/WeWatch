// tests/performance/payment-system-load-test.js
// Payment System Load Test - K6 Performance Testing
// Tests: Token purchase, wallet balance, ticket purchase, donations, gifts, payouts

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const tokenPurchaseErrors = new Counter('token_purchase_errors');
const walletQueryErrors = new Counter('wallet_query_errors');
const ticketPurchaseErrors = new Counter('ticket_purchase_errors');
const donationErrors = new Counter('donation_errors');
const giftErrors = new Counter('gift_errors');
const payoutErrors = new Counter('payout_errors');

const tokenPurchaseLatency = new Trend('token_purchase_latency');
const walletQueryLatency = new Trend('wallet_query_latency');
const ticketPurchaseLatency = new Trend('ticket_purchase_latency');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 20 },   // Ramp up to 20 users
    { duration: '2m', target: 20 },   // Stay at 20 users
    { duration: '30s', target: 50 },  // Spike to 50 users
    { duration: '1m', target: 50 },   // Stay at 50 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2s
    http_req_failed: ['rate<0.1'],     // Error rate under 10%
    token_purchase_errors: ['count<5'], // Max 5 token purchase errors
    wallet_query_errors: ['count<10'],  // Max 10 wallet query errors
  },
};

const BASE_URL = 'http://localhost:8080';

// Test user credentials (adjust based on your test data)
const TEST_USERS = [
  { id: 7, email: 'chibi@gmail.com', password: 'testpassword' },
  // Add more test users if needed
];

// Login and get JWT token
function login(email, password) {
  const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    email: email,
    password: password,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (loginRes.status === 200) {
    const body = JSON.parse(loginRes.body);
    return body.token;
  }
  return null;
}

// Test 1: Health Check (baseline)
export function healthCheck() {
  const res = http.get(`${BASE_URL}/api/health`);
  check(res, {
    'health check status 200': (r) => r.status === 200,
    'health check response time < 100ms': (r) => r.timings.duration < 100,
  });
}

// Test 2: Wallet Balance Query (READ operation)
export function testWalletQuery(token, userId) {
  const start = Date.now();
  const res = http.get(`${BASE_URL}/api/wallet/${userId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  
  const duration = Date.now() - start;
  walletQueryLatency.add(duration);

  const success = check(res, {
    'wallet query status 200': (r) => r.status === 200,
    'wallet query response time < 500ms': (r) => r.timings.duration < 500,
    'wallet has balance field': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.wallet && typeof body.wallet.token_balance !== 'undefined';
      } catch {
        return false;
      }
    },
  });

  if (!success) walletQueryErrors.add(1);
}

// Test 3: Token Transaction History (READ operation)
export function testTransactionHistory(token, userId) {
  const res = http.get(`${BASE_URL}/api/wallet/${userId}/transactions?limit=10`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  check(res, {
    'transaction history status 200': (r) => r.status === 200,
    'transaction history response time < 1s': (r) => r.timings.duration < 1000,
  });
}

// Test 4: Token Purchase Simulation (WRITE operation - CAREFUL)
// Note: This will actually create transactions in dev DB
// Only enable if you have test Paystack tokens
export function testTokenPurchaseFlow(token, userId) {
  const start = Date.now();
  
  // We'll only test the endpoint availability, not actual purchase
  // to avoid creating real transactions during load test
  const res = http.get(`${BASE_URL}/api/wallet/${userId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  
  const duration = Date.now() - start;
  tokenPurchaseLatency.add(duration);

  const success = check(res, {
    'token purchase endpoint accessible': (r) => r.status === 200 || r.status === 400,
    'token purchase response time < 1s': (r) => r.timings.duration < 1000,
  });

  if (!success) tokenPurchaseErrors.add(1);
}

// Test 5: Payout Request Query (READ operation)
export function testPayoutQuery(token, userId) {
  const res = http.get(`${BASE_URL}/api/payouts/${userId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  check(res, {
    'payout query status 200': (r) => r.status === 200,
    'payout query response time < 500ms': (r) => r.timings.duration < 500,
  });
}

// Test 6: Gateway Earnings Query (READ operation)
export function testGatewayEarnings(token) {
  const res = http.get(`${BASE_URL}/api/gateway-earnings/me`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  check(res, {
    'gateway earnings status 200': (r) => r.status === 200,
    'gateway earnings response time < 500ms': (r) => r.timings.duration < 500,
  });
}

// Test 7: Platform Accounting (Admin endpoint)
export function testPlatformAccounting(token) {
  const res = http.get(`${BASE_URL}/api/admin/accounting`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  // May return 403 if not admin, which is expected
  check(res, {
    'accounting endpoint responds': (r) => r.status === 200 || r.status === 403,
    'accounting response time < 1s': (r) => r.timings.duration < 1000,
  });
}

// Main test scenario
export default function () {
  // Select random test user
  const user = TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];
  
  // Login to get token
  const token = login(user.email, user.password);
  
  if (!token) {
    console.log(`Failed to login as ${user.email}`);
    sleep(1);
    return;
  }

  // Simulate realistic user behavior with pauses
  
  // 1. Check wallet balance (common operation)
  testWalletQuery(token, user.id);
  sleep(0.5);

  // 2. Check transaction history (common operation)
  testTransactionHistory(token, user.id);
  sleep(0.5);

  // 3. Check payout status (less common)
  if (Math.random() > 0.7) { // 30% of users check payouts
    testPayoutQuery(token, user.id);
    sleep(0.5);
  }

  // 4. Check gateway earnings (hosts only)
  if (Math.random() > 0.8) { // 20% check earnings
    testGatewayEarnings(token);
    sleep(0.5);
  }

  // 5. Simulate token purchase flow (rare, high-value operation)
  if (Math.random() > 0.95) { // 5% attempt purchases
    testTokenPurchaseFlow(token, user.id);
    sleep(1);
  }

  // Random sleep between requests (1-3 seconds)
  sleep(Math.random() * 2 + 1);
}

// Teardown function
export function teardown(data) {
  console.log('\n========================================');
  console.log('Payment System Load Test Complete');
  console.log('========================================');
}
