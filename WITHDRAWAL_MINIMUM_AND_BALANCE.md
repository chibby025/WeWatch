# Withdrawal Minimum & Balance Checking - Updated

## ✅ Minimum Withdrawal Amounts

### Current Settings:

**Your Code** (in `payment_account.go`):
- ₦50 minimum (Paystack's limit)
- GHS 10 minimum (Paystack's limit)
- $1, €1, £1 minimum (Stripe's limits)

**Paystack's Hard Limits** (cannot go lower):
- **Nigeria: ₦50**
- Ghana: GHS 10
- Kenya: KES 1
- South Africa: ZAR 1

### Can You Remove the Minimum?

**No** - Paystack enforces these limits. Even if you remove the check from your code, Paystack will reject transfers below ₦50.

**What You CAN Do:**
- Keep ₦50 as minimum (already set)
- This allows small withdrawals like ₦100, ₦200, etc.
- Much better than the old ₦2,000 limit that didn't exist

---

## 🏦 Checking Subaccount Balance

### The Problem:
- **Split codes** don't have their own balance
- **Subaccounts** have balances, but Paystack API doesn't expose them
- Dashboard only shows the split percentages, not balances

### Where to See Balances:

#### Option 1: Paystack Dashboard (Manual Check)
1. Go to https://dashboard.paystack.com/#/subaccounts
2. Click on **OPay** subaccount (`ACCT_epxk1vpdzgkxysu`)
3. Look for balance/transactions section
4. You should see current balance (₦900)

#### Option 2: Track Internally (Recommended ✅)
Your `platform_accounting` table already tracks this:
- `reserve_balance` = Total in host reserve (75% of all sales)
- Update it every time money comes in or goes out

### How Money Flows:

```
Ticket Sale: ₦1,000
    ↓
Split Code (SPL_CcDDM4qs7n) applies
    ↓
├─ ₦750 → OPay Subaccount (reserve_balance)
└─ ₦250 → Revenue Account (platform profit)

Host Withdrawal: ₦200
    ↓
Transfer from OPay Subaccount
    ↓
Reserve Balance: ₦750 - ₦200 = ₦550
```

---

## 🔧 How to Check Current Reserve Balance

### Method 1: Query Your Database
```sql
SELECT 
    reserve_balance,
    available_for_withdrawal,
    last_updated
FROM platform_accounting
ORDER BY last_updated DESC
LIMIT 1;
```

### Method 2: Check Paystack Subaccount Page
1. Login to https://dashboard.paystack.com
2. Go to **Subaccounts** section
3. Find **OPay** (`ACCT_epxk1vpdzgkxysu`)
4. Click on it to see transactions and balance

### Method 3: Add Balance Check Endpoint (Optional)
Create an admin endpoint to show reserve balance:

```go
// GET /api/admin/reserve-balance
func GetReserveBalance(c *gin.Context) {
    db := c.MustGet("db").(*gorm.DB)
    
    accounting, err := models.GetPlatformAccounting(db)
    if err != nil {
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }
    
    c.JSON(200, gin.H{
        "reserve_balance": accounting.ReserveBalance,
        "available_for_withdrawal": accounting.GetAvailableReserve(),
        "last_updated": accounting.LastUpdated,
    })
}
```

---

## 🎯 Why Your Withdrawals Failed

### Issue 1: Low Balance
- Reserve has ₦900
- Minimum withdrawal is ₦50 (✅ OK)
- But you probably tried withdrawing more than ₦900

### Issue 2: Amount = "N/A"
- The `amount_value` field was NULL in database
- This suggests the withdrawal request didn't properly save the amount
- Could be token conversion issue or database constraint

### Issue 3: Split Not Working?
- Check if the split code `SPL_CcDDM4qs7n` is being used in ticket purchases
- Verify 75% is actually going to OPay subaccount
- Test with a small ticket purchase and check both accounts

---

## ✅ Testing Plan

### Step 1: Verify Current Balance
```bash
# Check database
psql -h localhost -U postgres -d wewatch_db -c "SELECT reserve_balance FROM platform_accounting ORDER BY last_updated DESC LIMIT 1;"

# Expected: Should show close to ₦900
```

### Step 2: Make Test Ticket Purchase
1. Buy a ₦1,000 ticket
2. Check Paystack dashboard:
   - Revenue account should get ₦250
   - OPay subaccount should get ₦750
3. Check database reserve_balance increased by ₦750

### Step 3: Test Small Withdrawal
1. Request ₦100 withdrawal (above ₦50 minimum)
2. Check terminal logs for detailed error messages
3. If balance is sufficient, transfer should succeed

### Step 4: Verify Split Code Usage
Check your ticket purchase code to ensure it uses:
```javascript
// Frontend payment initiation
{
  amount: ticketPrice,
  split_code: "SPL_CcDDM4qs7n"  // ✅ This applies 75-25 split
}
```

---

## 🚨 Current Status

### ✅ Fixed:
- Minimum withdrawal set to ₦50 (Paystack's limit)
- Better error logging added
- Split ratio comments corrected (75-25)
- Amount validation added

### ⚠️ To Investigate:
- Why reserve only has ₦900 (should be 75% of all ticket sales)
- Whether split code is properly applied to payments
- Why previous withdrawals showed "N/A" amount

### 📋 Next Steps:
1. Restart backend to apply new minimum (₦50)
2. Check Paystack subaccount page for actual balance
3. Test ticket purchase to verify split is working
4. Try small withdrawal (₦100) and check detailed logs
5. Fund reserve account if split isn't working yet

---

## 💡 Key Takeaways

1. **Minimum withdrawal**: ₦50 (Paystack's limit, cannot change)
2. **Balance not in API**: Track in `platform_accounting.reserve_balance`
3. **Split accounts work**: Money goes directly to subaccounts, no intermediate balance
4. **Check dashboard**: Only reliable way to see Paystack subaccount balance
5. **Your code is correct**: Issue is likely low balance or split not applied to payments
