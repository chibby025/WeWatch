# Paystack Split Payments Setup ✅ RECOMMENDED

## 🎯 What You Did (Perfect Setup!)

You created a **Paystack Split Payment** with code: `SPL_CcDDM4qs7n`

### Your Configuration:
```
Split: Revenue-Reserve Split
Code: SPL_CcDDM4qs7n

Accounts:
├─ 85% → Reserve Subaccount (CHIBUZOR CHINWEOKWU on OPay)
├─ 15% → Revenue Subaccount (Chibuzor Chinweokwu - Nerdcorps on VFD)
└─ Transaction Fees → Deducted proportionally from all accounts
```

---

## ✅ Why This Is Better Than Transfer API

| Feature | Split Payments ✅ | Transfer API ❌ |
|---------|------------------|-----------------|
| **Split happens** | During payment collection | After payment (2 steps) |
| **Cost** | No extra fees | ₦10 per transfer |
| **Speed** | Instant | ~1 minute delay |
| **Complexity** | Simple (1 line of code) | Complex (API calls, error handling) |
| **Reliability** | 100% guaranteed | Can fail, need retries |
| **Savings** | ₦10 per transaction | Loses ₦10 per transaction |

**Example savings**: 1000 token purchases = **₦10,000 saved!**

---

## 🔧 Implementation (Already Done!)

### 1. Frontend - Added Split Code
**File**: `frontend/src/pages/PaymentPage.jsx`

```javascript
const handler = window.PaystackPop.setup({
  key: paystackKey,
  email: userEmail,
  amount: amountInKobo,
  currency: 'NGN',
  ref: reference,
  split_code: 'SPL_CcDDM4qs7n', // ✅ Automatic 85/15 split
  callback: function(response) {
    // Payment complete, money already split!
  }
});
```

### 2. Backend - Removed Transfer API
**File**: `backend/internal/handlers/wallet_handlers.go`

```go
// Old approach (removed):
// TransferToReserveAccount(netAmount, currency, reference, description)

// New approach (automatic via split code):
log.Printf("✅ Paystack split payment: ₦%.2f automatically split via SPL_CcDDM4qs7n", grossAmount)
log.Printf("   → Revenue account receives: ₦%.2f (15%%)", platformCommission)
log.Printf("   → Reserve account receives: ₦%.2f (85%%)", netAmount)
```

### 3. Environment Variable
**File**: `backend/.env`

```bash
# Split code for automatic revenue sharing
PAYSTACK_SPLIT_CODE=SPL_CcDDM4qs7n
```

---

## 💰 How It Works

### Token Purchase Flow:
```
1. User buys ₦200 worth of tokens
2. Paystack charges user ₦200
3. AUTOMATICALLY splits payment:
   - ₦30 (15%) → Revenue account (VFD - Your profit)
   - ₦170 (85%) → Reserve account (OPay - For host payouts)
4. Backend logs the split (no action needed)
5. Database tracks revenue split for analytics
```

### No Transfer Needed!
- ❌ No `TransferToReserveAccount()` call
- ❌ No ₦10 transfer fee
- ❌ No API errors or retries
- ✅ Money goes directly where it should be!

---

## 🧪 Testing

### Test Token Purchase:
```bash
1. Go to frontend: http://localhost:5173
2. Navigate to Wallet page
3. Click "Buy Tokens"
4. Purchase ₦200 worth of tokens
5. Check backend logs:
   ✅ Paystack split payment: ₦200.00 automatically split via SPL_CcDDM4qs7n
   → Revenue account receives: ₦30.00 (15%)
   → Reserve account receives: ₦170.00 (85%)
```

### Verify on Paystack Dashboard:
1. **Revenue Account (VFD)**: Check Transactions → Should see ₦30
2. **Reserve Account (OPay)**: Check Transactions → Should see ₦170
3. **Both happen instantly** - no waiting for transfers!

---

## 📊 Database Tracking

Even though split happens automatically, we still track it in database:

```sql
-- gateway_earnings table tracks the split
SELECT 
    gross_amount,        -- ₦200.00
    platform_commission, -- ₦30.00 (15%)
    net_amount,          -- ₦170.00 (85%)
    currency,
    payment_gateway
FROM gateway_earnings
WHERE session_ticket_id IS NULL  -- Token purchases
ORDER BY created_at DESC;
```

This gives you analytics without affecting the payment flow!

---

## 🔐 Security Note

The split code (`SPL_CcDDM4qs7n`) is tied to your Paystack account. Only you can:
- Modify the split percentages
- Change the subaccounts
- Delete the split configuration

Anyone can see the code in your frontend, but they can't change what it does.

---

## 🎯 When to Use Transfer API

You still need Transfer API for **host payouts only**:

```
Host earns ₦1000 from watch sessions
    ↓
Host requests withdrawal
    ↓
Admin approves
    ↓
Transfer API sends: Reserve account → Host bank
```

This is separate from token purchases - split payments handle collection, Transfer API handles distribution.

---

## 💡 Transaction Fee Handling

Your split is configured to **deduct fees proportionally**:

```
User pays: ₦200
Paystack fee (1.5%): ₦3
Net: ₦197

Split after fees:
- Revenue (15%): ₦29.55
- Reserve (85%): ₦167.45
```

This means platform and reserve both share the cost of transaction fees fairly.

---

## 🚀 Next Steps

1. ✅ **Test token purchase** with your split code
2. ✅ **Verify both accounts receive money**
3. ✅ **Confirm no transfer fees**
4. ⏳ **Set up Transfer API** for host payouts (separate from token purchases)
5. ⏳ **Build admin UI** for approving host withdrawals

---

## 📚 Additional Resources

### Paystack Documentation
- Split Payments: https://paystack.com/docs/payments/split-payments
- Subaccounts: https://paystack.com/docs/payments/subaccounts
- Managing Splits: https://dashboard.paystack.com/#/splits

### Your Dashboards
- **Revenue Account (VFD)**: Check transactions at https://dashboard.paystack.com
- **Reserve Account (OPay)**: Login with different account to see reserve transactions

---

## 🎉 Congratulations!

Your payment system is now:
- ✅ **Automatic** - No manual transfers
- ✅ **Cost-effective** - Saves ₦10 per transaction
- ✅ **Reliable** - No API failures
- ✅ **Instant** - Money splits immediately
- ✅ **Tracked** - Full analytics in database

**You made the right choice using Split Payments!** 🎊
