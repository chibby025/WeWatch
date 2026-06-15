# LetsWatchOut — Token Pricing System

## Token Economics

### Pricing
- **₦165 = 1 Token** (1 token = 100 stored units)
- Withdrawal rate: **₦122 per token** (≈74% of buy price — 26% platform margin)
- Tokens are the universal currency for all in-app transactions

### Storage Format
- Tokens stored as **integers representing cents** (100 units = 1 token)
- `tokensInCents = int(amountNGN * 100 / 165)`
- Display: divide by 100 and show 2 decimal places

### Paystack Fee Structure
Local Nigerian cards (Paystack):
- **Under ₦2,500**: 1.5% only, no flat fee
- **₦2,500 and above**: 1.5% + ₦100 flat fee, capped at ₦2,000

Examples:
- ₦165 purchase → ₦2.48 fee → ₦162.52 net → 98 stored units (≈0.98 tokens)
- ₦1,000 purchase → ₦15 fee → ₦985 net → 597 stored units
- ₦5,000 purchase → ₦175 fee → ₦4,825 net → 2,924 stored units

## Revenue Splits

| Transaction type | Host | Platform | Notes |
|---|---|---|---|
| Token purchase | 75% (reserve) | 25% | Via Paystack Split Code `SPL_CcDDM4qs7n` |
| Gateway ticket | 75% | 25% | — |
| Token ticket | 100% | 0% | Host bears full risk; no Paystack fee |
| Token donation | 75% | 25% | Commission deducted before crediting host |
| Gateway donation | 75% | 25% | Commission deducted before recording net amount |
| Token gift (peer-to-peer) | 95% (recipient) | 5% | Transfer fee, not a host commission |

## Paystack Split Code

Active split code: **`SPL_CcDDM4qs7n`**
- Automatically routes 75% → Reserve subaccount, 25% → Platform Revenue at payment time
- No manual transfers needed for token purchases or gateway tickets

## Withdrawal Policy

- **Minimum withdrawal**: 820 token units = ~8.2 tokens = **₦1,000** gross
- **Withdrawal fee**: ₦100 flat (no percentage; no cap needed)
- **Net payout**: gross NGN − ₦100
- **Example**: Withdraw 1,000 units (10 tokens) → gross ₦1,220 − ₦100 fee → **₦1,120 transferred**

KYC thresholds:
- Up to ₦5,000: no KYC required (after first withdrawal)
- ₦5,001–₦9,999: KYC required
- ₦10,000+: manual admin review

## Implementation Notes

### Backend
- `tokensInCents = int((amount * 100) / 165)` when crediting wallet
- Token → NGN conversion rate: `tokens_in_cents * 122 / 100`
- Withdrawal fee applied in `autoProcessPayout` before Paystack transfer

### Super Admin wallet
- Receives platform profit splits via `TransferSplitProfitHandler`
- User ID read from `SUPER_ADMIN_USER_ID` env var (Railway config), defaults to 7

### Verification Queries
```sql
-- User's token balance
SELECT token_balance FROM user_wallets WHERE user_id = ?;

-- Platform revenue from gateway earnings
SELECT SUM(gross_amount), SUM(platform_commission), SUM(net_amount)
FROM gateway_earnings;

-- Token purchases only
SELECT * FROM gateway_earnings
WHERE session_ticket_id IS NULL AND donation_id IS NULL;
```
