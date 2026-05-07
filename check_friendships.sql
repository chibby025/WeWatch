-- WeWatch Friendships Diagnostic SQL Script
-- Run this on Railway database using: railway run psql < check_friendships.sql

\echo '================================================'
\echo '🔍 WeWatch Friendships Database Diagnostic'
\echo '================================================'
\echo ''

-- Check if test025 user exists
\echo '📊 STEP 1: Checking if test025 user exists...'
\echo '-------------------------------------------'
SELECT id, username, email, created_at, updated_at 
FROM users 
WHERE username = 'test025';

\echo ''
\echo '📊 STEP 2: All users in database...'
\echo '-------------------------------------------'
SELECT id, username, email, role, created_at 
FROM users 
ORDER BY id;

\echo ''
\echo '📊 STEP 3: All accepted friendships...'
\echo '-------------------------------------------'
SELECT 
    f.id,
    f.requester_id,
    u1.username AS requester_username,
    f.recipient_id,
    u2.username AS recipient_username,
    f.status,
    f.created_at
FROM friendships f
JOIN users u1 ON f.requester_id = u1.id
JOIN users u2 ON f.recipient_id = u2.id
WHERE f.status = 'accepted'
ORDER BY f.created_at DESC;

\echo ''
\echo '📊 STEP 4: All friendships (including pending/rejected)...'
\echo '-------------------------------------------'
SELECT 
    f.id,
    f.requester_id,
    u1.username AS requester_username,
    f.recipient_id,
    u2.username AS recipient_username,
    f.status,
    f.created_at
FROM friendships f
JOIN users u1 ON f.requester_id = u1.id
JOIN users u2 ON f.recipient_id = u2.id
ORDER BY f.created_at DESC;

\echo ''
\echo '📊 STEP 5: Friendships for user ID 7 (chibuzor_dev)...'
\echo '-------------------------------------------'
SELECT 
    f.id,
    CASE 
        WHEN f.requester_id = 7 THEN u2.username
        ELSE u1.username
    END AS friend_username,
    CASE 
        WHEN f.requester_id = 7 THEN u2.id
        ELSE u1.id
    END AS friend_id,
    f.status,
    f.created_at
FROM friendships f
JOIN users u1 ON f.requester_id = u1.id
JOIN users u2 ON f.recipient_id = u2.id
WHERE (f.requester_id = 7 OR f.recipient_id = 7)
ORDER BY f.created_at DESC;

\echo ''
\echo '✅ Diagnostic complete!'
\echo '================================================'
