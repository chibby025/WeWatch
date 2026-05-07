-- Fix Missing Friendship: chibi (ID 7) <-> test025 (ID 5)
-- This friendship exists in localhost but is missing in Railway production

-- Insert the missing friendship
INSERT INTO friendships (requester_id, recipient_id, status, created_at, updated_at)
VALUES (7, 5, 'accepted', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Verify the friendship was created
SELECT 
    f.id,
    u1.username AS requester_username,
    u2.username AS recipient_username,
    f.status,
    f.created_at
FROM friendships f
JOIN users u1 ON f.requester_id = u1.id
JOIN users u2 ON f.recipient_id = u2.id
WHERE (f.requester_id = 7 AND f.recipient_id = 5) 
   OR (f.requester_id = 5 AND f.recipient_id = 7);
