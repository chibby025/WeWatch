# WeWatch Load Testing Guide

## Overview

This guide explains how to perform load testing on the WeWatch lecture hall system to validate 1000-user scalability.

## Prerequisites

1. **Backend server running** on `localhost:8080`
2. **Node.js installed** (v14+)
3. **Required packages**: `ws`, `node-fetch`

Install dependencies:
```bash
npm install ws node-fetch
```

## Load Testing Scripts

### 1. `load-test.js` - Lightweight Mock Testing
Fast testing with fake tokens (no database overhead).

**Best for:**
- Quick smoke tests
- Testing WebSocket connection handling
- Validating message throughput
- Finding connection bottlenecks

**Usage:**
```bash
# Basic test: 100 users for 60 seconds
node load-test.js

# Custom configuration
node load-test.js --users 500 --rampup 20 --duration 120

# Spike test: 500 users in 5 seconds
node load-test.js --scenario spike

# Sustained load: 1000 users for 5 minutes
node load-test.js --scenario sustained --users 1000
```

**Limitations:**
- Uses fake authentication tokens
- Backend may reject connections without valid JWT
- No database operations tested

### 2. `load-test-real-auth.js` - Realistic Testing
Full authentication flow with real users and tokens.

**Best for:**
- Realistic production simulation
- Testing authentication bottlenecks
- Database performance under load
- End-to-end system validation

**Usage:**
```bash
# Create 50 test users and simulate load
node load-test-real-auth.js --users 50 --room 108

# Extended test
node load-test-real-auth.js --users 100 --duration 180
```

**Note:** Creates test users with prefix `loadtest_X` in your database.

## Understanding the Metrics

### Connection Metrics
- **Attempted**: Total connection attempts
- **Successful**: Connections that completed handshake
- **Failed**: Timeouts or rejected connections
- **Avg/P95 time**: How long connections take to establish

**Targets:**
- Success rate: ≥95%
- Avg connection time: <2000ms
- P95 connection time: <5000ms

### Message Metrics
- **Sent**: Messages sent by clients
- **Received**: Messages received by clients
- **Latency**: Round-trip time for acknowledged messages
- **Throughput**: Messages per second

**Targets:**
- Avg latency: <1000ms
- P95 latency: <2000ms
- No message loss (<1% error rate)

### Seat Assignment Metrics
- **Requested**: Clients requesting seats
- **Confirmed**: Seat assignments acknowledged
- **Confirmation rate**: Should be ≥95%

## Test Scenarios

### 1. Baseline Test (100 users)
```bash
node load-test.js --users 100 --rampup 10 --duration 60
```
Validates basic functionality. Should pass easily.

### 2. Target Load Test (500 users)
```bash
node load-test.js --users 500 --rampup 30 --duration 120
```
Tests normal expected peak load. Should pass comfortably.

### 3. Maximum Capacity Test (1000 users)
```bash
node load-test.js --users 1000 --rampup 60 --duration 300
```
Tests upper limit. May reveal bottlenecks.

### 4. Spike Test
```bash
node load-test.js --scenario spike
```
500 users connecting in 5 seconds. Tests connection handling under sudden load.

### 5. Stress Test (Beyond Capacity)
```bash
node load-test.js --users 2000 --rampup 120 --duration 300
```
Pushes system beyond designed capacity to find breaking point.

## Monitoring During Tests

### Backend Monitoring

**1. Watch Go server output:**
```bash
cd backend
go run cmd/server/main.go
```

Look for:
- Connection acceptance rates
- Error messages
- Hub performance logs

**2. Monitor system resources:**
```bash
# CPU and memory usage
htop

# Open connections
ss -s
netstat -an | grep 8080 | wc -l
```

**3. Database monitoring (if using real auth):**
```bash
psql -h localhost -p 5432 -U postgres -d wewatch_db

# Query active connections
SELECT count(*) FROM pg_stat_activity WHERE datname='wewatch_db';

# Check slow queries
SELECT query, state, wait_event FROM pg_stat_activity WHERE state != 'idle';
```

### Frontend Monitoring

Open a browser tab with the host user to observe:
- Member count accuracy
- Seat visualization
- Console errors

## Interpreting Results

### ✅ PASSING Test Indicators
- Connection success rate >95%
- Avg message latency <1000ms
- No memory leaks (stable memory usage)
- No goroutine leaks (stable goroutine count)
- Error rate <5%

### ⚠️ WARNING Signs
- Connection success rate 90-95%
- Avg message latency 1000-2000ms
- Increasing error rate over time
- Gradual memory increase

### ❌ FAILING Test Indicators
- Connection success rate <90%
- Avg message latency >2000ms
- Connection timeouts
- Database connection exhaustion
- OOM errors
- Rapid goroutine growth

## Common Bottlenecks & Solutions

### 1. Connection Timeouts
**Symptom:** High connection failure rate, timeouts

**Causes:**
- Not enough file descriptors
- Connection backlog too small
- Slow TLS handshake

**Solutions:**
```bash
# Increase file descriptor limit
ulimit -n 65536

# In Go server, increase backlog
net.Listen("tcp", ":8080")  # Add ListenConfig with higher backlog
```

### 2. High Message Latency
**Symptom:** Messages taking >2 seconds

**Causes:**
- Hub mutex contention
- Slow database queries
- Inefficient broadcasting

**Solutions:**
- Optimize Hub locking strategy
- Add database indexes
- Batch broadcast operations
- Use connection pooling

### 3. Memory Leaks
**Symptom:** Steadily increasing memory

**Causes:**
- Not closing WebSocket connections
- Unbounded channel buffers
- Caching without eviction

**Solutions:**
- Ensure proper cleanup in disconnect handlers
- Use buffered channels with limits
- Implement cache eviction policies

### 4. Database Saturation
**Symptom:** Connection pool exhausted

**Solutions:**
```go
// In database.go
db.SetMaxOpenConns(100)
db.SetMaxIdleConns(25)
db.SetConnMaxLifetime(5 * time.Minute)
```

### 5. Goroutine Explosion
**Symptom:** Thousands of goroutines created

**Causes:**
- Creating goroutines without cleanup
- Blocking operations in goroutines
- Not closing channels

**Solutions:**
- Use worker pools instead of goroutine-per-request
- Add context cancellation
- Properly close channels

## Backend Optimizations for Scale

### 1. Hub Architecture
```go
// Use sharded hubs instead of single global hub
type HubPool struct {
    hubs []*Hub
    shardCount int
}

func (hp *HubPool) GetHub(roomID int) *Hub {
    shard := roomID % hp.shardCount
    return hp.hubs[shard]
}
```

### 2. Message Batching
```go
// Batch broadcasts instead of individual sends
type MessageBatch struct {
    messages []Message
    roomID   int
}

// Process batches every 50ms instead of real-time
```

### 3. Connection Pooling
```go
// Reuse buffers
var bufferPool = sync.Pool{
    New: func() interface{} {
        return make([]byte, 4096)
    },
}
```

## Progressive Load Testing Strategy

### Phase 1: Validation (Week 1)
1. Run baseline tests (100 users) ✅
2. Fix any issues found
3. Run target load tests (500 users)
4. Optimize if needed

### Phase 2: Stress Testing (Week 2)
1. Run maximum capacity tests (1000 users)
2. Identify bottlenecks
3. Implement optimizations
4. Retest

### Phase 3: Beyond Limits (Week 3)
1. Run stress tests (>1000 users)
2. Document breaking points
3. Plan scaling strategy (horizontal scaling, etc.)

## Cleaning Up After Tests

### Remove Test Users (if using real auth)
```sql
-- Connect to database
psql -h localhost -p 5432 -U postgres -d wewatch_db

-- Delete test users
DELETE FROM users WHERE username LIKE 'loadtest_%';
DELETE FROM watch_session_members WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'loadtest_%');

-- Vacuum tables
VACUUM ANALYZE users;
VACUUM ANALYZE watch_session_members;
```

### Clear Test Sessions
```sql
-- Delete test sessions
DELETE FROM watch_sessions WHERE room_id = 108 AND created_at > NOW() - INTERVAL '1 hour';
```

## Continuous Load Testing

### Automated Testing
Set up cron job for regular load tests:

```bash
#!/bin/bash
# load-test-cron.sh

DATE=$(date +%Y%m%d_%H%M%S)
LOG_DIR="/var/log/wewatch/loadtests"

mkdir -p $LOG_DIR

node /path/to/load-test.js --users 500 --duration 120 > $LOG_DIR/test_$DATE.log 2>&1

# Alert if test failed
if [ $? -ne 0 ]; then
    echo "Load test failed at $DATE" | mail -s "WeWatch Load Test Alert" admin@example.com
fi
```

## Reporting Template

After each test, document:

```
## Load Test Report - [DATE]

**Configuration:**
- Users: X
- Ramp-up: X seconds
- Duration: X seconds
- Scenario: [baseline|target|stress|spike]

**Results:**
- Connection success rate: X%
- Avg latency: Xms
- P95 latency: Xms
- Throughput: X msgs/sec
- Error rate: X%

**Status:** [PASS/FAIL]

**Bottlenecks Found:**
1. [Issue 1]
2. [Issue 2]

**Recommendations:**
1. [Action 1]
2. [Action 2]

**Next Steps:**
- [ ] Implement optimization X
- [ ] Retest with Y users
```

## Troubleshooting

### Script Won't Run
```bash
# Check Node.js version
node --version  # Should be v14+

# Install dependencies
npm install ws node-fetch

# Check if backend is running
curl http://localhost:8080/api/health
```

### All Connections Failing
1. Verify backend is running on port 8080
2. Check firewall settings
3. Look for JWT validation errors in backend logs
4. Try with `load-test-real-auth.js` instead

### Inconsistent Results
- Run multiple times and average results
- Ensure no other heavy processes running
- Use same hardware for comparison tests
- Clear caches between runs

## Next Steps

After completing load tests:
1. ✅ Document maximum capacity
2. ✅ Identify bottlenecks  
3. ✅ Implement optimizations
4. ✅ Plan horizontal scaling if needed
5. ✅ Set up monitoring dashboards
6. ✅ Create alerting rules

---

**Questions?** Check backend logs, monitor system resources, and gradually increase load to find the breaking point.
