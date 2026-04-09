# Parallel Upload Testing Guide 🧪

## Quick Test Checklist

### ✅ Test 1: Basic Functionality (2 minutes)
**Goal:** Verify parallel uploads work

1. **Start frontend:**
   ```bash
   cd frontend
   npm run dev
   ```

2. **Upload a video:**
   - File: Any video 20-50 MB
   - Network: Current connection
   - Expected: Upload completes successfully

3. **Check console logs:**
   ```
   ✅ Look for: "Using X concurrent chunks"
   ✅ Look for: "Uploading chunks Y-Z of N"
   ✅ Look for: "Batch X Complete"
   ```

4. **Verify in UI:**
   - Progress bar updates smoothly
   - Video appears in playlist after upload
   - Poster generates within 2 seconds

---

### ✅ Test 2: Network Speed Test (5 minutes)
**Goal:** Measure actual speed improvement

#### Setup - Chrome DevTools
1. Open DevTools → Network tab
2. Click "Online" dropdown → "Add custom profile"
3. Create profiles:
   - **Fast 4G:** Download: 20 Mbps, Upload: 10 Mbps, Latency: 40ms
   - **3G:** Download: 1.5 Mbps, Upload: 750 Kbps, Latency: 200ms

#### Test - 4G (Expected: 5 concurrent chunks)
1. **Select Fast 4G profile**
2. **Upload 40 MB video**
3. **Check Network tab:**
   - Should see 5 chunk requests uploading **simultaneously**
   - Chunk requests should have overlapping time bars
4. **Measure time:**
   - Expected: 6-10 seconds
   - Baseline (sequential): ~32 seconds
   - **Speedup: ~4-5x faster** ✅

#### Test - 3G (Expected: 3 concurrent chunks)
1. **Select 3G profile**
2. **Upload 20 MB video**
3. **Check Network tab:**
   - Should see 3 chunk requests uploading simultaneously
4. **Measure time:**
   - Expected: 15-20 seconds
   - Baseline (sequential): ~45 seconds
   - **Speedup: ~2-3x faster** ✅

---

### ✅ Test 3: Console Output Verification
**Goal:** Verify parallel batching logs

**Expected Console Output:**
```
🌐 [Network Detection] Effective type: 4g
📶 [Network] 4G detected - Using 5 concurrent chunks
📦 [Chunked Upload] Starting: {uploadId: "...", fileName: "video.mp4", ...}
🚀 [Parallel Upload] Using 5 concurrent uploads for 4g
📦 [Batch 1] Uploading chunks 1-5 of 20
✅ [Batch 1] Complete (5/20 chunks uploaded)
📦 [Batch 2] Uploading chunks 6-10 of 20
✅ [Batch 2] Complete (10/20 chunks uploaded)
📦 [Batch 3] Uploading chunks 11-15 of 20
✅ [Batch 3] Complete (15/20 chunks uploaded)
📦 [Batch 4] Uploading chunks 16-20 of 20
✅ [Batch 4] Complete (20/20 chunks uploaded)
🎉 [Parallel Upload] All 20 chunks uploaded successfully
✅ [Chunked Upload] Assembly succeeded
```

**Key Indicators:**
- ✅ "Using X concurrent uploads" message
- ✅ Batch numbers increment correctly
- ✅ Chunks per batch = concurrency (5 for 4G, 3 for 3G, 2 for 2G)
- ✅ No errors or retries (unless network is unstable)

---

### ✅ Test 4: Network Tab Visual Check
**Goal:** See parallel requests in action

**Chrome DevTools → Network Tab:**

1. **Filter by "chunk"** (to see only chunk uploads)

2. **Watch the timing bars:**
   ```
   Sequential Upload (OLD):
   Chunk 1: |████████████|
   Chunk 2:            |████████████|
   Chunk 3:                        |████████████|
   
   Parallel Upload (NEW):
   Chunk 1: |████████████|
   Chunk 2: |████████████|
   Chunk 3: |████████████|
   Chunk 4: |████████████|
   Chunk 5: |████████████|
   ```

3. **Verify:**
   - ✅ Multiple chunks have **overlapping time bars**
   - ✅ 2-5 chunks uploading at the same time
   - ✅ Batches are distinct (gaps between batch groups)

---

### ✅ Test 5: Progress Tracking
**Goal:** Verify UI updates correctly

**Watch the Upload Progress UI:**

1. **Progress Bar:**
   - Updates in steps (not smooth continuous)
   - Steps = batch size (2-5 chunks)
   - Example with 5 concurrent: 0% → 25% → 50% → 75% → 100%

2. **Upload Speed:**
   - Should show MB/s increasing as chunks complete
   - Example: 1.2 MB/s → 3.5 MB/s → 5.8 MB/s

3. **ETA (Estimated Time):**
   - Should decrease as upload progresses
   - Example: 30s → 20s → 10s → 5s

4. **Uploaded/Total:**
   - Example: "15.0 MB / 40.0 MB"
   - Should match progress bar percentage

---

### ✅ Test 6: Error Handling
**Goal:** Verify retries and error recovery

#### Simulate Network Failure
1. **Start upload**
2. **After 2-3 seconds:**
   - DevTools → Network → Offline
3. **Wait 5 seconds**
4. **Re-enable network:**
   - DevTools → Network → Online

**Expected Behavior:**
- ✅ Failed chunks retry up to 3 times
- ✅ Console shows retry attempts
- ✅ Upload continues after network recovery
- ✅ No data loss (resumable)

---

### ✅ Test 7: Different File Sizes

| File Size | Chunk Size | Total Chunks | 4G (5 concurrent) | 3G (3 concurrent) |
|-----------|------------|--------------|-------------------|-------------------|
| 10 MB     | 2 MB       | 5 chunks     | ~2 seconds        | ~5 seconds        |
| 40 MB     | 2 MB       | 20 chunks    | ~6-8 seconds      | ~15-20 seconds    |
| 100 MB    | 2 MB       | 50 chunks    | ~15-20 seconds    | ~40-50 seconds    |
| 500 MB    | 5 MB       | 100 chunks   | ~60-80 seconds    | ~180-240 seconds  |

**Test:**
1. Upload videos of different sizes
2. Verify chunk count matches file size
3. Verify time is proportional to chunks/concurrency

---

## Success Criteria ✅

### Must Pass:
- [x] Upload completes successfully
- [x] Multiple chunks upload simultaneously (visible in Network tab)
- [x] Console shows batch upload logs
- [x] Progress bar updates correctly
- [x] Video appears in playlist
- [x] Poster generates within 2 seconds
- [x] No JavaScript errors in console
- [x] Speed improvement: 3-5x faster on 4G

### Nice to Have:
- [ ] Upload speed > 5 MB/s on WiFi
- [ ] Smooth progress updates (< 500ms gaps)
- [ ] ETA accuracy within 10%
- [ ] Graceful degradation on 2G (2 concurrent)

---

## Troubleshooting

### Issue: "Using 1 concurrent chunks"
**Cause:** Network detection failed  
**Fix:** Browser doesn't support `navigator.connection`  
**Workaround:** Defaults to 3 concurrent (unknown network)

### Issue: Chunks still upload sequentially
**Cause:** Backend rate limiting or server limit  
**Check:** Backend logs for rate limit errors  
**Fix:** Increase backend concurrency limit

### Issue: Progress jumps too much (0% → 50% → 100%)
**Cause:** File has only 2 chunks, 5 concurrent = 1 batch  
**Expected:** Small files will have fewer batches  
**Not a bug:** Progress reflects actual batch completion

### Issue: Speed slower than expected
**Cause:** Network bandwidth, server upload limit, or disk I/O  
**Check:** 
- DevTools → Network → Throttling disabled?
- Backend CPU/disk usage?
- Internet speed test (fast.com)?

---

## Performance Benchmarks

### Baseline (Sequential Upload)
```
File: 40 MB video
Network: 4G (10 Mbps upload)
Chunk Size: 2 MB
Total Chunks: 20
Time: ~32 seconds
Speed: 1.25 MB/s
```

### With Parallel Upload (5 concurrent)
```
File: 40 MB video
Network: 4G (10 Mbps upload)
Chunk Size: 2 MB
Total Chunks: 20
Batches: 4 (5 chunks per batch)
Time: ~6-8 seconds
Speed: 5-6 MB/s
Speedup: 4-5x faster ✅
```

### Calculation
```
Sequential: 40 MB / 10 Mbps ≈ 32 seconds
Parallel (5x): 40 MB / (10 Mbps × 5) ≈ 6.4 seconds

Note: Actual speedup depends on:
- Backend throughput limits
- Network stability
- Server CPU/disk I/O
- Browser connection limits (usually 6-8 per domain)
```

---

## Next Steps

1. **Run Tests 1-3** (Quick validation - 10 minutes)
2. **Measure actual speedup** (Compare before/after)
3. **Report results** (Time, speedup, any issues)
4. **Production testing** (Real users, real networks)
5. **Monitor metrics** (Upload success rate, average time)

---

## Questions to Answer

### During Testing:
1. **What's the actual speedup?** (Sequential vs Parallel)
2. **Does it work on 2G/3G?** (2-3 concurrent chunks)
3. **Any errors or retries?** (Check console logs)
4. **Progress updates smooth?** (< 500ms gaps)
5. **Poster generates correctly?** (Within 2 seconds)

### After Testing:
1. **Is 5 concurrent too aggressive?** (Should we use 3 for 4G?)
2. **Do we need dynamic concurrency?** (Adjust during upload)
3. **Should we add HTTP/2 multiplexing?** (Browser optimization)
4. **Any backend bottlenecks?** (CPU, disk, network)

---

## Report Template

```markdown
## Parallel Upload Test Results

**Date:** [Today's date]
**Tester:** [Your name]
**Browser:** [Chrome/Firefox/Safari + version]

### Test 1: Basic Functionality
- [x] Upload completed: YES/NO
- [x] Parallel logs visible: YES/NO
- [x] Video in playlist: YES/NO
- [x] Poster generated: YES/NO

### Test 2: Speed Test
- **Network:** 4G (10 Mbps upload)
- **File:** 40 MB video
- **Time:** X seconds
- **Speedup:** Xx faster (vs ~32s baseline)
- **Chunks concurrent:** X (expected 5)

### Test 3: Console Output
- [x] "Using X concurrent chunks": YES/NO
- [x] Batch logs visible: YES/NO
- [x] No errors: YES/NO

### Test 4: Network Tab
- [x] Multiple simultaneous requests: YES/NO
- [x] Overlapping time bars: YES/NO
- [x] Batches visible: YES/NO

### Issues Found:
- [List any issues]

### Recommendations:
- [Any suggestions]
```

---

**Ready to test!** 🚀  
Start with Test 1 (2 minutes) to verify basic functionality.
