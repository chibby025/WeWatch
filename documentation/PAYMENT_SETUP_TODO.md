# Payment System Setup TODO List

**Last Updated:** December 11, 2025  
**Status:** ✅ COMPLETE - System Ready for Testing

---

## 🎉 SETUP COMPLETE!

**What's Configured:**
- ✅ Paystack Revenue Account (15% profit)
- ✅ Paystack Reserve Account (85% host pool)
- ✅ Database migrations run successfully
- ✅ Backend payment system initialized
- ✅ Frontend restricted to NGN only
- ✅ Automatic 85/15 payment split configured

**📖 READ THIS FIRST:** See [PAYMENT_FLOW_EXPLAINED.md](PAYMENT_FLOW_EXPLAINED.md) for complete payment flow documentation.

---

## 🎯 Critical Path: Get System Running

### ✅ DONE - Code Implementation
- [x] Multi-account payment system coded
- [x] Database migrations created
- [x] Admin dashboard endpoints
- [x] Frontend components (10 components)
- [x] Backend compiles successfully

### 🔴 TODO - Your Action Items

---

## Step 1: Email Accounts (IN PROGRESS)

**Status:** ✅ 1/2 emails created

**What You Need:**
- [ ] Email 1: `your-email@gmail.com` (✅ DONE)
- [ ] Email 2: `your-email-2@gmail.com` or use Gmail alias trick below

**Gmail Alias Trick (Easier):**
If you have `chibuzor@gmail.com`, you can use:
- `chibuzor+revenue@gmail.com` (Stripe Revenue Account)
- `chibuzor+reserve@gmail.com` (Stripe Reserve Account)
- Both emails go to the same inbox!
- Stripe sees them as different accounts

**Alternative:**
- Use temporary email service (Proton Mail, Outlook, Yahoo)
- Ask a trusted friend/family to create one account for you
- Use business email if you have one

---

## Step 2: Create Stripe Accounts

**Once you have 2 emails:**

### Account 1: Revenue (Your 15% Profit)
1. [ ] Go to: https://dashboard.stripe.com/register
2. [ ] Sign up with Email 1
3. [ ] Name: "WeWatch Revenue" 
4. [ ] Navigate to: Developers → API Keys
5. [ ] Copy both test keys:
   - [ ] `STRIPE_REVENUE_PUBLISHABLE_KEY=pk_test_...`
   - [ ] `STRIPE_REVENUE_SECRET_KEY=sk_test_...`
6. [ ] Paste into `backend/.env` file

### Account 2: Reserve (Host 85% Money)
1. [ ] Go to: https://dashboard.stripe.com/register
2. [ ] Sign up with Email 2
3. [ ] Name: "WeWatch Reserve"
4. [ ] Navigate to: Developers → API Keys
5. [ ] Copy both test keys:
   - [ ] `STRIPE_RESERVE_PUBLISHABLE_KEY=pk_test_...`
   - [ ] `STRIPE_RESERVE_SECRET_KEY=sk_test_...`
6. [ ] Paste into `backend/.env` file

---

## Step 3: Run Database Migrations

**Time:** 2 minutes

```bash
# Connect to PostgreSQL
psql -h localhost -p 5432 -U postgres -d wewatch_db

# Run migrations (copy-paste each line)
\i migrations/012_create_platform_accounting.sql
\i migrations/013_add_split_transfer_ids.sql

# Verify
SELECT * FROM platform_accounting;
# Should show 1 row with all zeros

# Exit
\q
```

- [ ] Migration 012 completed (platform_accounting table created)
- [ ] Migration 013 completed (transfer ID fields added)
- [ ] Verified platform_accounting row exists

---

## Step 4: Test Token Purchase

**Time:** 5 minutes

```bash
# Start backend
cd backend
./server

# Look for this message:
# ✅ Multi-account payment system initialized
#    - Revenue account (15%) ready
#    - Reserve account (85%) ready
```

**Test with cURL:**
```bash
# Get your auth token first (login)
TOKEN="your_jwt_token_here"

# Buy 100 tokens ($10)
curl -X POST http://localhost:8080/api/tokens/purchase \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "payment_method": "stripe",
    "payment_token": "tok_visa"
  }'

# Check logs for:
# 💳 Splitting Stripe payment: $10.00 (85% reserve, 15% revenue)
# ✅ Payment split successful
# 📊 Platform accounting updated: Revenue=1.50, Reserve=8.50
```

- [ ] Backend starts without errors
- [ ] Token purchase request succeeds
- [ ] Logs show payment split (85/15)
- [ ] Accounting table updated

---

## Step 5: View Admin Dashboard

**Time:** 1 minute

```bash
# Check your profit
curl http://localhost:8080/api/admin/accounting \
  -H "Authorization: Bearer $TOKEN"

# Should show:
# {
#   "platform_owner": {
#     "your_profit": 1.50,  // Your 15%
#     "explanation": "This is YOUR money"
#   },
#   "host_reserves": {
#     "total_reserved": 8.50,  // Host 85%
#     "explanation": "This is HOST money - DON'T TOUCH!"
#   }
# }
```

- [ ] Admin endpoint returns accounting data
- [ ] Revenue shows 15% of purchases
- [ ] Reserve shows 85% of purchases
- [ ] `is_balanced` is true

---

## Step 6: Verify in Stripe Dashboard

**Time:** 2 minutes

1. [ ] Login to Revenue Stripe account
2. [ ] Go to: Payments → Transfers
3. [ ] Verify $1.50 transfer received

4. [ ] Login to Reserve Stripe account  
5. [ ] Go to: Payments → Transfers
6. [ ] Verify $8.50 transfer received

---

## 🚀 Optional: Paystack Setup (For African Users)

**SKIP THIS FOR NOW** - Only needed if you want Nigerian/Ghanaian users

Same process as Stripe:
1. [ ] Create 2 Paystack accounts at https://dashboard.paystack.com/signup
2. [ ] Get API keys for both
3. [ ] Add to `.env`:
   - `PAYSTACK_REVENUE_PUBLIC_KEY=...`
   - `PAYSTACK_REVENUE_SECRET_KEY=...`
   - `PAYSTACK_RESERVE_PUBLIC_KEY=...`
   - `PAYSTACK_RESERVE_SECRET_KEY=...`

---

## 📋 Quick Reference - What Goes Where

**In `backend/.env` file:**
```bash
# After you get Stripe keys, paste them here:
STRIPE_REVENUE_PUBLISHABLE_KEY=pk_test_...
STRIPE_REVENUE_SECRET_KEY=sk_test_...
STRIPE_RESERVE_PUBLISHABLE_KEY=pk_test_...
STRIPE_RESERVE_SECRET_KEY=sk_test_...
```

**Stripe Dashboard Locations:**
- Create account: https://dashboard.stripe.com/register
- Get API keys: Dashboard → Developers → API Keys
- View transfers: Dashboard → Payments → Transfers

---

## ⚡ TEMPORARY WORKAROUND (If Email Issue Persists)

**Use ONE Stripe account for both (testing only):**

1. [ ] Create 1 Stripe account
2. [ ] Copy the same keys to both REVENUE and RESERVE:
```bash
STRIPE_REVENUE_SECRET_KEY=sk_test_YOUR_KEY
STRIPE_RESERVE_SECRET_KEY=sk_test_YOUR_KEY  # Same key
```

**Why this works:**
- Code will still run and track accounting
- Database will still separate 15% vs 85%
- Money won't be physically separated (in 1 account)
- Good enough for initial testing
- Create 2nd account later when you have time

---

## 🎯 Priority Order

**DO FIRST (This Week):**
1. ✅ Code implementation (DONE)
2. 🔴 Get 2nd email somehow (Gmail alias trick or friend's email)
3. 🔴 Create 2 Stripe accounts
4. 🔴 Add keys to `.env`
5. 🔴 Run migrations
6. 🔴 Test one token purchase

**DO LATER (When Scaling):**
- Paystack accounts (for African market)
- Production Stripe keys (when going live)
- Real payment integration (Stripe Elements on frontend)

**SKIP FOR NOW:**
- Admin dashboard UI (endpoints work, UI can wait)
- CSV export feature (nice-to-have)
- Webhook handling (Phase 5)

---

## 🆘 Blockers & Solutions

### Blocker: Can't create 2nd email
**Solutions:**
1. Use Gmail alias: `yourname+revenue@gmail.com`, `yourname+reserve@gmail.com`
2. Use temporary email: Proton Mail, Outlook
3. Ask trusted person to create account for you
4. Use temporary workaround (1 Stripe account for now)

### Blocker: Stripe won't accept test mode
**Solution:**
- Test mode works without verification
- Don't activate account yet
- Just get test keys (pk_test_, sk_test_)

### Blocker: Migration fails
**Solution:**
```bash
# Check if tables already exist
\dt platform_accounting
\dt token_transactions

# If exists, check columns
\d token_transactions
# Should have revenue_transfer_id and reserve_transfer_id
```

---

## ✅ Success Criteria

**You're done when:**
- [ ] Backend starts with "Multi-account payment system initialized"
- [ ] Token purchase splits payment 85/15
- [ ] `/api/admin/accounting` shows your profit vs host reserves
- [ ] Database has `platform_accounting` table with data
- [ ] Stripe dashboard shows transfers in both accounts

**Time Estimate:** 30 minutes total (once you have emails)

---

## 📞 Current Status

**What's Working:**
✅ All code written and tested  
✅ Backend compiles successfully  
✅ Migrations ready  
✅ Frontend components ready  

**What's Blocked:**
🔴 Waiting for 2nd email to create Stripe accounts

**Next Action:**
Try Gmail alias trick OR use temporary workaround (1 account) to continue testing while you figure out emails.

---

**Don't let email creation block you!** Use the temporary workaround and move forward. You can add the 2nd account later.
