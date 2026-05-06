-- Fix posts that might have missing user associations
-- This query checks if posts have valid user_id references

-- Check posts with invalid user_id
SELECT p.id, p.title, p.user_id, u.id as actual_user_id, u.username
FROM posts p
LEFT JOIN users u ON p.user_id = u.id
WHERE p.deleted_at IS NULL;

-- If you find posts with NULL users, you can either:
-- 1. Delete them (if they're orphaned):
-- DELETE FROM posts WHERE user_id NOT IN (SELECT id FROM users);

-- 2. Or assign them to a default user (replace 1 with valid user ID):
-- UPDATE posts SET user_id = 1 WHERE user_id NOT IN (SELECT id FROM users);
