// WeWatch Performance Test - Smoke Test
// Purpose: Verify basic functionality works before load testing
// Users: 1 virtual user
// Duration: 30 seconds

import http from 'k6/http';
import { check, sleep } from 'k6';

// Test configuration
export const options = {
  vus: 1,           // 1 virtual user
  duration: '30s',  // Run for 30 seconds
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be under 500ms
    http_req_failed: ['rate<0.01'],   // Less than 1% of requests should fail
  },
};

// Test scenarios
export default function () {
  // Test 1: Get active sessions (unauthenticated - should return 401)
  const sessionsRes = http.get('http://localhost:8080/api/sessions/active');
  
  check(sessionsRes, {
    'sessions endpoint responds': (r) => r.status === 401 || r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  // Test 2: Login
  const loginPayload = JSON.stringify({
    email: 'michelle@gmail.com',
    password: 'Password',
  });

  const loginRes = http.post('http://localhost:8080/api/auth/login', loginPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(loginRes, {
    'login successful': (r) => r.status === 200,
    'login returns user': (r) => r.json('user') !== undefined,
    'login fast': (r) => r.timings.duration < 1000,
  });

  // Test 3: Get active sessions (authenticated)
  const authSessionsRes = http.get('http://localhost:8080/api/sessions/active');
  
  check(authSessionsRes, {
    'authenticated sessions loaded': (r) => r.status === 200,
    'sessions response fast': (r) => r.timings.duration < 500,
  });

  // Think time - user reads the page
  sleep(1);
}
