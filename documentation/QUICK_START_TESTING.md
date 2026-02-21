# Quick Start: Testing Auto-Approval System

## 🚀 Start Here

### Step 1: Verify Backend is Running
```bash
# Terminal 1: Backend
cd WeWatch/backend
go run main

# Should see:
# ✓ Server running on :8080
# ✓ Database connected
# ✓ Routes registered
```

### Step 2: Verify Frontend is Running
```bash
# Terminal 2: Frontend
cd WeWatch/frontend
npm run dev

# Should see:
# ✓ Vite dev server on :5173
# ✓ Assets compiled
# ✓ Ready for testing
```

### Step 3: Access App
```
http://localhost:5173
```

---

## 🧪 Test Scenario 1: Auto-Approve ✅

**What:** Small withdrawal should auto-approve instantly

### Setup:
1. Login as host with ₦50,000 earnings
2. Verify KYC is verified
3. This is 2nd+ withdrawal

### Execute:
```
1. Click Home → "💸 Withdraw Earnings"
   OR: Navigate to /withdraw directly

2. Click quick button: [₦5000]
   → Amount fills: 5000

3. Select bank account:
   → Choose existing or add new

4. Click "Withdraw ₦5,000"
   → Loading spinner shows

5. Wait 2-3 seconds
   → Check response
```

### Expected Result:
```
✅ Response shows:
   - "auto_approve": true
   - "message": "Processing withdrawal automatically..."
   - Status badge: "Processing"

✅ Backend logs:
   - "Auto-approve: YES"
   - "Amount: ₦5,000"
   - "Spawning background transfer goroutine"

✅ Database:
   - Payout status: "processing"
   - Amount: 5000

✅ After 1-2 minutes:
   - Status updates to "completed"
   - Message: "✅ Completed"
```

---

## 🧪 Test Scenario 2: First-Time Withdrawal ❌

**What:** First withdrawal should require manual review

### Setup:
1. Create NEW host account
2. First withdrawal ever
3. Amount: ₦2,000 (eligible for auto)

### Execute:
```
1. Navigate to /withdraw

2. Click [₦5000] or enter ₦2,000

3. Select bank account

4. Click "Withdraw ₦2,000"
   → Loading spinner shows

5. Wait response
```

### Expected Result:
```
⏳ Response shows:
   - "auto_approve": false
   - "message": "Sent for review"
   - Status: "pending"

❌ Backend logs:
   - "Auto-approve: NO - First withdrawal"

⏳ Frontend:
   - Status badge: "Pending"
   - Message: "⏳ Waiting for admin review"

📋 Admin Dashboard:
   - Shows in "Pending Withdrawals"
   - Waiting for approval

✅ After admin approves:
   - Status updates to "processing"
   - Then "completed"
```

---

## 🧪 Test Scenario 3: Large Amount ❌

**What:** Amount ≥ ₦10,000 should require manual review

### Setup:
1. Host with ₦100,000 earnings
2. KYC verified
3. 5th+ withdrawal

### Execute:
```
1. Navigate to /withdraw

2. Enter amount: ₦50,000

3. Select bank account

4. Click "Withdraw ₦50,000"
```

### Expected Result:
```
⏳ Response shows:
   - "auto_approve": false
   - Amount too large: ₦50,000 > ₦10,000

❌ Backend logs:
   - "Auto-approve: NO - Amount exceeds threshold"

📋 Admin Dashboard:
   - Shows in pending withdrawals
   - Large amount flag

✅ After admin approves:
   - Transfer initiates
   - Status: "processing" → "completed"
```

---

## 🧪 Test Scenario 4: No KYC ❌

**What:** KYC-required amount without verification should fail

### Setup:
1. Host with ₦10,000 earnings
2. KYC NOT verified
3. 2nd+ withdrawal

### Execute:
```
1. Navigate to /withdraw

2. Enter amount: ₦8,000 (> ₦5,000)
   → No KYC verification exists

3. Select bank account

4. Click "Withdraw ₦8,000"
```

### Expected Result:
```
❌ Response or error:
   - "KYC verification required"
   - Cannot auto-approve

🔐 Backend logs:
   - "Auto-approve: NO - KYC required for > ₦5,000"

📱 Frontend:
   - Error message: "KYC verification required"
   - Link to KYC page

🔗 Solution:
   - Host completes KYC
   - Returns to withdrawal
   - Now can auto-approve
```

---

## 🧪 Test Scenario 5: Non-Bank Transfer ❌

**What:** Non-bank payment methods should require manual review

### Setup:
1. Host trying to withdraw via PayPal
2. Amount: ₦3,000 (eligible)
3. All else valid

### Execute:
```
1. Navigate to /withdraw

2. Enter amount: ₦3,000

3. Select payment method: PayPal
   (if available in dropdown)

4. Click "Withdraw ₦3,000"
```

### Expected Result:
```
⏳ Response shows:
   - "auto_approve": false
   - Only bank transfers auto-approve

🔗 Backend logs:
   - "Auto-approve: NO - Invalid payment method"
   - "Method: paypal, Required: bank_transfer"

📋 Shows in pending:
   - Manual review needed
   - Admin can approve/reject

💡 Note:
   - Currently only bank_transfer supported
   - PayPal/mobile money may not be visible
   - This is for future expansion
```

---

## 🔍 How to Check Logs

### Backend Logs:
```bash
# Look for auto-approval messages:

# Search for:
grep "Auto-approve" backend.log

# Should see:
"Auto-approve: YES - Processing withdrawal"
"Auto-approve: NO - Amount exceeds threshold"
"Auto-approve: NO - First withdrawal"
"Auto-approve: NO - KYC required"
```

### Frontend Console:
```javascript
// Open browser DevTools (F12)

// Look for:
// ✓ API response logs
// ✓ Auto-approval status
// ✓ Status updates
// ✓ Error messages

console.log('Withdrawal response:', response);
```

### Database:
```sql
-- Check payout status:
SELECT 
  id, user_id, amount_value, status, 
  created_at, updated_at
FROM payouts
ORDER BY created_at DESC
LIMIT 10;

-- Expected statuses:
-- pending (waiting for admin)
-- processing (auto-approved, transferring)
-- completed (successful)
-- failed (error occurred)
```

---

## 📱 UI Elements to Check

### Withdrawal Page:
- [ ] Balance displays correctly
- [ ] Quick buttons work (₦5K, ₦10K, ₦20K)
- [ ] Amount input validates
- [ ] Bank account selector shows
- [ ] Add new account form works
- [ ] Withdraw button enabled/disabled
- [ ] Loading spinner shows during request
- [ ] Status badge displays
- [ ] Error messages show correctly
- [ ] Withdrawal history lists payouts
- [ ] Status colors are correct

### Status Colors:
```
✅ Completed    → Green background
🔄 Processing   → Blue spinner
⏳ Pending       → Yellow/Orange
❌ Failed       → Red background
```

### Menu Navigation:
- [ ] "Withdraw Earnings" visible in sidebar
- [ ] Click opens /withdraw page
- [ ] "Auto-Approved" badge shows (if applicable)
- [ ] Back button works
- [ ] Mobile responsive

---

## 🐛 Troubleshooting

### Problem: "Not auto-approved" when should be
**Check:**
```
1. Is amount < ₦10,000?           ✓
2. Is KYC verified (if > ₦5K)?    ✓
3. Is NOT first withdrawal?        ✓
4. Is bank_transfer method?        ✓
5. Check backend logs for reason   ✓
```

### Problem: Page not loading
**Fix:**
```
1. Check frontend is running:      npm run dev
2. Check backend is running:       go run main
3. Check port 5173 is accessible
4. Check network tab for API errors
5. Check browser console
```

### Problem: Status not updating
**Check:**
```
1. Refresh page (manual update)
2. Check database for new status
3. Check backend logs for goroutine
4. Wait 1-2 minutes for transfer
5. Check Paystack logs
```

### Problem: "KYC required" error
**Fix:**
```
1. Navigate to /wallet or settings
2. Submit KYC verification
3. Wait for approval (usually instant in dev)
4. Return to withdrawal page
5. Try again
```

---

## 📊 Metrics to Check

### Auto-Approval Rate:
```
Good:  70-80% (most withdrawals auto-approve)
Fair:  50-70% (some manual reviews)
Bad:   <50% (too many manual reviews)

Check:
SELECT 
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as auto_completed,
  COUNT(CASE WHEN status IN ('pending', 'rejected') THEN 1 END) as manual_review,
  ROUND(100.0 * COUNT(CASE WHEN status = 'completed' THEN 1 END) / 
        COUNT(*), 2) as auto_approval_rate
FROM payouts
WHERE created_at > NOW() - INTERVAL '24 hours';
```

### Processing Time:
```
Expected:
- Response: < 100ms
- Auto-transfer: 1-3 seconds
- Paystack arrival: 20-60 seconds

Check:
SELECT 
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_seconds,
  MAX(EXTRACT(EPOCH FROM (updated_at - created_at))) as max_seconds
FROM payouts
WHERE status IN ('completed', 'processing')
AND created_at > NOW() - INTERVAL '24 hours';
```

---

## ✅ Testing Checklist

- [ ] Backend compiles without errors
- [ ] Frontend loads without errors
- [ ] Can login as host
- [ ] Can navigate to /withdraw
- [ ] Small withdrawal auto-approves
- [ ] First withdrawal requires review
- [ ] Large withdrawal requires review
- [ ] KYC requirement works
- [ ] Bank account management works
- [ ] Withdrawal history shows
- [ ] Status updates correctly
- [ ] Balance decreases after withdrawal
- [ ] Admin can see pending payouts
- [ ] Admin can approve/reject
- [ ] Transfer processes successfully
- [ ] Database records updated
- [ ] Logs show correct information
- [ ] Error handling works
- [ ] Responsive design looks good
- [ ] All UI elements functional

---

## 🎉 Success Criteria

All of the following must be true:

1. ✅ Auto-approval happens instantly (< 1 second)
2. ✅ Manual review items go to admin queue
3. ✅ KYC requirement enforced
4. ✅ First-time withdrawal blocked
5. ✅ Large amounts blocked
6. ✅ Bank account validated
7. ✅ Status updates correctly
8. ✅ Withdrawal history accurate
9. ✅ No database errors
10. ✅ No JavaScript errors

---

## 📞 Need Help?

### Check These Files:
- Backend: `backend/internal/handlers/payout_handlers.go`
- Frontend: `frontend/src/pages/WithdrawalPage.jsx`
- Routes: `frontend/src/App.jsx`
- Navigation: `frontend/src/components/LobbyLeftSidebar.jsx`
- Docs: `documentation/AUTO_APPROVAL_*.md`

### Common Questions:
- **"Why didn't it auto-approve?"** → Check logs, verify KYC/amount/first-time
- **"Where's my money?"** → Check payout status in database
- **"How long until arrival?"** → Paystack transfers in 24 hours
- **"Can I cancel?"** → Only if status is "pending"

---

## 🚀 You're Ready!

Everything is set up and ready to test. 

**Start with Test Scenario 1** (auto-approve) to verify everything works! ✅
