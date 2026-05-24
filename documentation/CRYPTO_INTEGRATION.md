# WeWatch Payment Integration Plan

**Status:** 🟡 Phase 1 Live — Phase 2 Planned  
**Last Updated:** 2026-05-23  

---

## Payment Rails — Priority Order

We grow the payment stack in stages. Each phase only starts when the
previous one is stable and we have real user demand for the next.

| Phase | Gateway | Market | Currency | Status |
|---|---|---|---|---|
| 1 | Paystack | Nigeria + Ghana/Kenya/SA | NGN/GHS/KES/ZAR | ✅ Live |
| 2 | Stripe | UK / US / Europe | GBP / USD / EUR | 🔜 Next |
| 3 | Coinbase Commerce | Pan-Africa (no Paystack) + crypto users | USDC / USDT | 📋 Planned |

**Why this order:**
- Paystack is live and covers our primary market (Nigeria)
- Stripe unlocks UK/US which is the next target audience
- Coinbase Commerce covers African countries outside Paystack's map
  (Ethiopia, DRC, Tanzania, etc.) and users who prefer crypto
- Crypto is NOT the solution for UK/US — Stripe is. UK/US users
  expect card payments and will not convert to crypto just to use us

---

## Phase 1 — Paystack (Live)

**Covers:** Nigeria, Ghana, Kenya, South Africa  
**Currencies:** NGN, GHS, KES, ZAR  
**Use case:** Token purchases, ticket payments, withdrawals  

**Pricing (NGN):**
```
Buy rate:  ₦165 / token  (user pays)
Sell rate: ₦122 / token  (host withdraws)
Spread:    ₦43  / token  (26% platform margin)
```

**Important:** Paystack does NOT work for UK/US users reliably.
International cards on a Nigerian merchant account have high decline
rates from issuing banks flagging it as a foreign/risk transaction.
Do not present Paystack as an option to UK/US users — use Stripe.

---

## Phase 2 — Stripe (Next Priority)

**Covers:** UK, US, Europe, any international card  
**Currencies:** GBP, USD, EUR  
**Use case:** Token purchases, ticket payments  
**Withdrawals:** Stripe Connect (for hosts with international bank accounts)

**Why Stripe before crypto:**
- UK/US users recognise and trust Stripe
- No decline risk — Stripe is native to those markets
- Already scaffolded in `payment_account.go`, `TokenPurchaseModal.jsx`,
  and `token_transaction.go` — just needs activating

**Pricing (USD):**
```
Buy rate:  $0.126 / token  (8 tokens per $1 — 26% spread matches NGN model)
Sell rate: $0.10  / token  (10 tokens per $1)
Spread:    $0.026 / token  (26% platform margin)
```

**GBP/EUR:** Apply equivalent spread at prevailing exchange rate.
Fixed rates updated quarterly to avoid excessive FX exposure.

**Implementation tasks (when ready):**
- [ ] Create Stripe account and get API keys
- [ ] Add `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` to `.env`
- [ ] Activate Stripe tab in `TokenPurchaseModal.jsx` (currently disabled)
- [ ] Implement `purchaseTokensStripe()` in `paymentApi.js` (stub exists)
- [ ] Backend: Stripe webhook handler for payment confirmation
- [ ] Enable USD/GBP/EUR token packages with correct pricing
- [ ] Stripe Connect for host withdrawals (international bank accounts)

---

## Phase 3 — Coinbase Commerce (Planned)

**Covers:** Crypto-preferring users globally; African countries outside
Paystack's coverage map (Ethiopia, DRC, Tanzania, Cameroon, etc.)  
**Currencies:** USDC, USDT  
**Recommended networks:** USDC on Base, USDT/USDC on Polygon  
**Avoid:** Ethereum mainnet (gas fees too high for small purchases)

**Why Coinbase Commerce:**
- No KYC required to start accepting payments
- 1% fee vs Paystack's 1.5% + ₦100
- Instant settlement in stablecoin — no NGN devaluation risk
- Reaches African diaspora and users in non-Paystack countries
- Webhook-based confirmation, simple REST API

**Pricing (USDC/USDT):**
```
Buy rate:  $0.126 / token  (same as Stripe — 26% spread)
Sell rate: $0.10  / token
Spread:    $0.026 / token  (26% margin)

Example:
  User pays $12.60 USDC → receives 100 tokens
  Host earns 75 tokens (after 25% platform cut)
  Host withdraws 75 × $0.10 = $7.50 USDC
```

---

## Token Economics — All Currencies

The same spread model applies across every payment rail.
The platform makes money on every token that enters and exits.

```
Currency   Buy rate        Sell rate       Spread
─────────────────────────────────────────────────
NGN        ₦165/token      ₦122/token      26%
USD        $0.126/token    $0.10/token     26%
GBP        £0.099/token    £0.079/token    26% (approx)
USDC/USDT  $0.126/token    $0.10/token     26%
```

---

## Treasury & Liquidity — The Two-Account Problem

**The problem:**
The platform holds real money in separate treasury pools:
- NGN sits in the Paystack account
- USDC/USDT sits in the Coinbase wallet
- USD sits in the Stripe account

If a host earns tokens from USDC-paying viewers but wants to withdraw
in NGN, the Paystack account cannot cover it — the money is in Coinbase.
Trying to pre-fund a USDC reserve is not feasible.

**The solution: Currency-Backed Token Tracking**

Tokens are fungible from the user's perspective (one balance) but the
backend tracks the currency source of every token.

```
user_wallets table:
  token_balance:        1000  (total — what user sees)
  naira_backed_tokens:   600  (funded via Paystack)
  crypto_backed_tokens:  400  (funded via Coinbase)
  usd_backed_tokens:       0  (funded via Stripe — future)
```

**When tokens are spent (ticket purchase, donation):**
Deduct proportionally from each backing source:
```
naira_ratio  = naira_backed_tokens  / token_balance
crypto_ratio = crypto_backed_tokens / token_balance

naira_deduction  = floor(amount_spent × naira_ratio)
crypto_deduction = amount_spent − naira_deduction
```

**When a host withdraws:**
The system shows what is available per currency:
```
Withdraw to Bank Account (Paystack):  up to 450 tokens = ₦54,900
Withdraw to Crypto Wallet (USDC):     up to 300 tokens = $30.00
```
Host picks one or both. Platform only pays from the corresponding pool.
The money is ALWAYS there because backed tokens = actual received funds.

**DB migration needed when Phase 3 is built:**
```sql
ALTER TABLE user_wallets
  ADD COLUMN IF NOT EXISTS naira_backed_tokens  INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crypto_backed_tokens INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usd_backed_tokens    INT DEFAULT 0;

-- Existing users: all tokens are naira-backed
UPDATE user_wallets SET naira_backed_tokens = token_balance;

-- Constraint: backed tokens must always sum to total
ALTER TABLE user_wallets
  ADD CONSTRAINT check_token_backing
  CHECK (token_balance = naira_backed_tokens + crypto_backed_tokens + usd_backed_tokens);
```

---

## DB Schema — Already Exists

The `token_transaction` model already has all crypto fields:
```go
PaymentProvider  string  // 'paystack', 'stripe', 'coinbase_commerce'
CryptoCurrency   string  // 'USDT', 'USDC', NULL for fiat
CryptoAmount     string  // Amount in crypto (string for precision)
CryptoNetwork    string  // 'polygon', 'base', NULL for fiat
BlockchainTxHash string  // Blockchain transaction hash
CoinbaseChargeID string  // Coinbase Commerce charge ID
```

No model changes needed. Only `user_wallets` needs the backing columns
when Phase 3 is built.

---

## Coinbase Commerce — Implementation Notes (Phase 3)

**Receiving payments (Phase 3A) — No KYC required:**
1. Create Coinbase Commerce account (free, 5 min)
2. Backend: `POST /payments/crypto/create-charge` — creates a charge
   via Coinbase API, returns hosted payment URL
3. Frontend: redirect user to Coinbase hosted checkout page
4. Webhook: `POST /webhooks/coinbase-commerce` — confirms payment,
   credits tokens, updates `crypto_backed_tokens`
5. Security: verify `X-CC-Webhook-Signature` header (HMAC SHA256)
6. Idempotency: check `coinbase_charge_id` is not already processed

**Paying out (Phase 3B) — Business KYC required:**
- Use Circle API to send USDC to host's wallet address
- Requires business registration (CAC certificate)
- Circle transfer fee: ~$0.50/transaction
- Split 50/50: host pays $0.25, platform absorbs $0.25
- Minimum withdrawal: 10 tokens ($1.00) to cover fees

---

## What We Are NOT Building (Yet)

The following are interesting long-term ideas but are not on the
current roadmap. Do not start these before Phase 2 (Stripe) is live:

- **NFT event tickets** — ERC-721 on Polygon
- **Smart contract escrow** — Trustless refunds
- **Token-gated events** — NFT holder perks
- **Blockchain analytics dashboard** — Public on-chain stats
- **Secondary NFT marketplace** — Ticket resale

These belong in a post-funding roadmap, not the current build.

---

## Open Questions (Resolve Before Phase 3)

1. **Business registration (CAC)** — Required for Circle API (crypto
   withdrawals). Estimated ₦50,000–₦100,000, 2–4 weeks in Nigeria.
2. **USD host withdrawals** — Stripe Connect for international hosts
   needs to be live before we can offer USD payout.
3. **Minimum crypto withdrawal** — Confirm minimum token amount to
   make Circle fees worthwhile (currently suggested: 10 tokens = $1).
