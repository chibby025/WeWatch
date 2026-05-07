-- Check existing tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema='public' 
AND table_name IN ('friendships', 'users', 'lobby_chats', 'posts', 'watch_session_posts') 
ORDER BY table_name;

-- Check friendships table structure and data
\d friendships
SELECT COUNT(*) as total_friendships FROM friendships;
SELECT id, requester_id, recipient_id, status, created_at FROM friendships ORDER BY created_at DESC LIMIT 10;

-- Check users table - avatar_url column
\d users
SELECT id, username, avatar_url FROM users WHERE avatar_url IS NOT NULL AND avatar_url != '/avatars/default.png' LIMIT 10;

-- Check lobby_chats table - attachment_url column
\d lobby_chats
SELECT id, sender_id, recipient_id, message_type, attachment_url, attachment_name FROM lobby_chats 
WHERE message_type != 'text' OR attachment_url IS NOT NULL 
ORDER BY created_at DESC LIMIT 10;

-- Check posts table (if exists)
SELECT COUNT(*) as total_posts FROM posts WHERE image_url IS NOT NULL;
SELECT id, user_id, image_url FROM posts WHERE image_url IS NOT NULL LIMIT 10;

-- Check watch_session_posts table (if exists)
SELECT COUNT(*) as total_session_posts FROM watch_session_posts WHERE image_url IS NOT NULL;
SELECT id, user_id, image_url FROM watch_session_posts WHERE image_url IS NOT NULL LIMIT 10;
