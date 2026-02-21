-- Check failed withdrawal details
SELECT 
    id,
    user_id,
    payout_type,
    payout_method,
    amount_tokens,
    amount_value,
    amount_currency,
    status,
    gateway_transfer_id,
    payment_account_id,
    payout_details,
    created_at,
    updated_at
FROM payouts
WHERE created_at >= '2026-02-10'
ORDER BY created_at DESC;

-- Check the payment account details used
SELECT 
    pa.id,
    pa.user_id,
    pa.gateway,
    pa.account_holder_name,
    pa.currency,
    pa.is_verified,
    pa.paystack_recipient_code,
    pa.is_primary
FROM payment_accounts pa
WHERE pa.user_id IN (SELECT user_id FROM payouts WHERE created_at >= '2026-02-10');

-- Check platform accounting reserve balance
SELECT 
    reserve_balance,
    available_for_withdrawal,
    last_updated
FROM platform_accounting
ORDER BY last_updated DESC
LIMIT 1;
