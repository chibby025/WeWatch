-- WeWatch: Cleanup Orphaned Quizzes from Ended Sessions
-- This script deletes all quizzes and quiz responses for ended or deleted sessions
-- Run this script to clean up the 21 orphaned quizzes

-- Step 1: Show count of orphaned quizzes (from ended sessions)
SELECT COUNT(*) as orphaned_quiz_count 
FROM quizzes q
LEFT JOIN watch_sessions ws ON q.session_id = ws.id
WHERE ws.ended_at IS NOT NULL OR ws.id IS NULL;

-- Step 2: Show count of orphaned quiz responses
SELECT COUNT(*) as orphaned_response_count
FROM quiz_responses qr
WHERE qr.quiz_id IN (
    SELECT q.id FROM quizzes q
    LEFT JOIN watch_sessions ws ON q.session_id = ws.id
    WHERE ws.ended_at IS NOT NULL OR ws.id IS NULL
);

-- Step 3: Delete orphaned quiz responses (foreign key constraint requires this first)
DELETE FROM quiz_responses
WHERE quiz_id IN (
    SELECT q.id FROM quizzes q
    LEFT JOIN watch_sessions ws ON q.session_id = ws.id
    WHERE ws.ended_at IS NOT NULL OR ws.id IS NULL
);

-- Step 4: Delete orphaned quizzes
DELETE FROM quizzes
WHERE id IN (
    SELECT q.id FROM quizzes q
    LEFT JOIN watch_sessions ws ON q.session_id = ws.id
    WHERE ws.ended_at IS NOT NULL OR ws.id IS NULL
);

-- Step 5: Verify cleanup - should show 0 orphaned quizzes
SELECT COUNT(*) as remaining_orphaned_quizzes 
FROM quizzes q
LEFT JOIN watch_sessions ws ON q.session_id = ws.id
WHERE ws.ended_at IS NOT NULL OR ws.id IS NULL;

-- Step 6: Show all remaining quizzes (should only be from active sessions)
SELECT 
    q.id as quiz_id,
    q.name as quiz_name,
    q.status,
    q.session_id,
    ws.session_id as session_uuid,
    ws.ended_at,
    CASE 
        WHEN ws.ended_at IS NULL THEN 'Active Session'
        ELSE 'Ended Session (ORPHANED)'
    END as session_status
FROM quizzes q
LEFT JOIN watch_sessions ws ON q.session_id = ws.id
ORDER BY q.created_at DESC;
