-- Verify the friendship fix for user ID 7 (chibi)
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
AND f.status = 'accepted'
ORDER BY f.created_at DESC;

\echo ''
\echo '✅ Expected: 2 friends (michelle and test025)'
