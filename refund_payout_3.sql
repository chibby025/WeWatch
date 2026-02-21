-- Refund failed withdrawal for Payout ID 3
-- User: chibi (user_id = 7)
-- Amount: 1 token (100 cents) = ₦122

BEGIN;

-- 1. Check current state
SELECT 
    'BEFORE REFUND' as status,
    id, 
    user_id, 
    token_balance / 100.0 as tokens,
    token_balance as token_cents
FROM user_wallets 
WHERE user_id = 7;

SELECT 
    'PAYOUT STATUS' as info,
    id, 
    status, 
    amount_tokens,
    amount_value,
    failure_reason
FROM payouts 
WHERE id = 3;

-- 2. Refund the 1 token (100 cents) to wallet
UPDATE user_wallets 
SET token_balance = token_balance + 100  -- 1 token = 100 cents
WHERE user_id = 7;

-- 3. Create refund transaction record
INSERT INTO token_transactions (
    user_id, 
    transaction_type, 
    amount, 
    balance_after, 
    description,
    created_at
)
SELECT 
    7,
    'refund',
    100,
    token_balance,
    'Manual refund for failed withdrawal (Payout #3): Paystack account not registered for transfers',
    NOW()
FROM user_wallets 
WHERE user_id = 7;

-- 4. Mark the payout as failed
UPDATE payouts 
SET 
    status = 'failed',
    failure_reason = 'You cannot initiate third party payouts as a starter business - upgrade to Registered Business at dashboard.paystack.com',
    updated_at = NOW()
WHERE id = 3;

-- 5. Verify the refund
SELECT 
    'AFTER REFUND' as status,
    id, 
    user_id, 
    token_balance / 100.0 as tokens,
    token_balance as token_cents
FROM user_wallets 
WHERE user_id = 7;

SELECT 
    'PAYOUT UPDATED' as info,
    id, 
    status, 
    amount_tokens,
    amount_value,
    failure_reason
FROM payouts 
WHERE id = 3;

SELECT 
    'REFUND TRANSACTION' as info,
    id,
    transaction_type,
    amount / 100.0 as tokens,
    balance_after / 100.0 as balance_after_tokens,
    description,
    created_at
FROM token_transactions
WHERE user_id = 7
ORDER BY created_at DESC
LIMIT 3;

COMMIT;

-- If everything looks good, the changes are committed
-- If something is wrong, you can ROLLBACK instead
