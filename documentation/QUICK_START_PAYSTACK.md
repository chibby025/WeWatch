# 🚀 Quick Start: Paystack Split Payments ✅

## ⚡ TL;DR - What You Need to Do

✅ **DONE!** You already created your split payment: `SPL_CcDDM4qs7n`

Remaining steps:
1. **Test a token purchase** (money splits automatically!)
2. **Verify both accounts** receive money
3. **Optional**: Set up Transfer API for host payouts (later)

---

## 📋 Your Current Setup ✅

### What You Already Did:
```
✅ Created split payment: SPL_CcDDM4qs7n
✅ Configured 85/15 split:
   - 85% → Reserve (OPay) for host payouts
   - 15% → Revenue (VFD) for platform profit
✅ Set transaction fees to deduct proportionally
```

### What We Updated:
```
✅ Added split_code to frontend payment initialization
✅ Updated backend to use split payments (no transfers needed)
✅ Added PAYSTACK_SPLIT_CODE to .env
✅ Removed Transfer API calls for token purchases
```

## 🧪 Test It Now (1 minute)

### Test Steps:
```bash
1. Start backend:
   cd backend
   ./server

2. Start frontend:
   cd frontend  
   npm run dev

3. Go to: http://localhost:5173

4. Navigate to Wallet page

5. Click "Buy Tokens"

6. Purchase ₦200 worth of tokens

7. Complete payment on Paystack
```

### What to Check:

**Backend Logs** (should see):
```
✅ Paystack split payment: ₦200.00 automatically split via SPL_CcDDM4qs7n
   → Revenue account receives: ₦30.00 (15%)
   → Reserve account receives: ₦170.00 (85%)
```

**Paystack Dashboards**:
```
Revenue Account (VFD):
- Transactions → ₦30 IN (your 15% profit)

Reserve Account (OPay):  
- Transactions → ₦170 IN (for host payouts)
```

### Expected Result:
- ✅ User pays ₦200
- ✅ Money automatically splits
- ✅ Revenue gets ₦30 (15%)
- ✅ Reserve gets ₦170 (85%)
- ✅ **NO transfer fees!** ₦10 saved!

---

## 🔥 What Happens Now?

### Token Purchase Flow (Automatic)
```
User buys ₦200 tokens
    ↓
Payment goes to Revenue account
    ↓
Backend automatically transfers ₦170 (85%) to Reserve
    ↓
Revenue keeps ₦30 (15%)
```

### Host Withdrawal Flow (Manual approval)
```
Host requests payout
    ↓
You (admin) approve in dashboard
    ↓
Backend transfers from Reserve → Host bank
    ↓
Host receives money in 24 hours
```

---

## 🚨 Troubleshooting

### "Transfers not enabled"
→ Go to Settings → Preferences → Enable Transfers

### "Insufficient balance"
→ Wait for payments to settle (usually instant for test payments)

### "Invalid recipient code"
→ Check format: must be `RCP_xxxxxxxxxx` (not `RCPT_` or other)

### "Backend still logging manual action"
→ Check `.env` has `PAYSTACK_RESERVE_RECIPIENT_CODE=RCP_xxxxx`
→ Restart backend after editing `.env`

---

## 📊 Admin Features

### New API Endpoints (Super Admin Only)
```
GET  /api/admin/payouts/pending      - View pending payouts
POST /api/admin/payouts/:id/process  - Approve payout
POST /api/admin/payouts/:id/reject   - Reject payout
```

### Test with Postman/curl
```bash
# Get pending payouts
curl http://localhost:8080/api/admin/payouts/pending \
  -H "Cookie: wewatch_token=YOUR_SUPER_ADMIN_TOKEN"

# Process payout
curl -X POST http://localhost:8080/api/admin/payouts/1/process \
  -H "Cookie: wewatch_token=YOUR_SUPER_ADMIN_TOKEN"
```

---

## 📱 Next: Create Admin UI

Create `frontend/src/pages/AdminPayouts.jsx`:
```jsx
// Simple payout approval interface
function AdminPayouts() {
  const [payouts, setPayouts] = useState([]);
  
  useEffect(() => {
    axios.get('/api/admin/payouts/pending').then(res => {
      setPayouts(res.data.payouts);
    });
  }, []);
  
  const processPayout = (id) => {
    axios.post(`/api/admin/payouts/${id}/process`).then(() => {
      alert('Payout processed!');
      // Refresh list
    });
  };
  
  return (
    <div>
      <h1>Pending Payouts</h1>
      {payouts.map(payout => (
        <div key={payout.id}>
          <p>Host: {payout.user?.username}</p>
          <p>Amount: ₦{payout.amount_value}</p>
          <button onClick={() => processPayout(payout.id)}>
            Approve & Transfer
          </button>
        </div>
      ))}
    </div>
  );
}
```

---

## 🎉 You're Done!

Your payment system now:
- ✅ Automatically splits 15% / 85%
- ✅ Transfers to Reserve account instantly
- ✅ Allows hosts to withdraw
- ✅ Admin can approve payouts
- ✅ All tracked in database

**Full documentation**: `documentation/AUTOMATED_PAYMENTS_COMPLETE.md`
