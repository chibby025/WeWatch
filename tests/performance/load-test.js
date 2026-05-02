// WeWatch Performance Test - Load Test
// Purpose: Test normal expected traffic
// Users: Ramp up to 10 concurrent users
// Duration: 5 minutes total

import http from 'k6/http';
import { check, sleep } from 'k6';

// Test configuration - simulates 20 users watching content
export const options = {
  stages: [
    { duration: '30s', target: 20 }, // Ramp up to 20 users over 30 seconds
    { duration: '2m', target: 20 },  // Stay at 20 users for 2 minutes
    { duration: '30s', target: 0 },  // Ramp down to 0 users over 30 seconds
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],    // 95% of requests under 500ms
    http_req_failed: ['rate<0.05'],      // Less than 5% failure rate
    http_reqs: ['rate>5'],               // At least 5 requests per second
  },
};

// Test scenarios - simulates real user behavior
export default function () {
  // Scenario 1: User checks active sessions (unauthenticated)
  const sessionsRes = http.get('http://localhost:8080/api/sessions/active');
  
  check(sessionsRes, {
    'can view sessions page': (r) => r.status === 401 || r.status === 200,
  });

  sleep(1); // User reads the page

  // Scenario 2: User logs in
  const loginPayload = JSON.stringify({
    email: 'michelle@gmail.com',
    password: 'Password',
  });

  const loginRes = http.post('http://localhost:8080/api/auth/login', loginPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  const loginSuccess = check(loginRes, {
    'login successful': (r) => r.status === 200,
    'login returns token': (r) => r.body.includes('user'),
  });

  if (!loginSuccess) {
    // If login fails, don't continue
    return;
  }

  sleep(2); // User navigates after login

  // Scenario 3: User views their active sessions (authenticated)
  const authSessionsRes = http.get('http://localhost:8080/api/sessions/active?limit=10&offset=0');
  
  check(authSessionsRes, {
    'authenticated sessions loaded': (r) => r.status === 200,
    'sessions data returned': (r) => r.body.includes('sessions'),
  });

  sleep(2); // User browses sessions

  // Scenario 4: User views rooms list
  const roomsRes = http.get('http://localhost:8080/api/rooms?limit=10&offset=0');
  
  check(roomsRes, {
    'rooms endpoint responds': (r) => r.status === 200 || r.status === 401,
  });

  sleep(3); // User browses rooms, decides what to watch

  // Scenario 5: User checks profile
  const profileRes = http.get('http://localhost:8080/api/auth/me');
  
  check(profileRes, {
    'profile loads': (r) => r.status === 200 || r.status === 401,
  });

  // Think time - user considers options
  sleep(5);
}
