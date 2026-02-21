-- Migration: Change quizzes.session_id from integer to varchar(36) for UUID support
-- This migration will delete existing quizzes with session_id=0 (orphaned quizzes)

BEGIN;

-- Step 1: Delete orphaned quizzes (session_id = 0 or invalid)
DELETE FROM quiz_responses WHERE quiz_id IN (SELECT id FROM quizzes WHERE session_id = 0);
DELETE FROM quizzes WHERE session_id = 0;

-- Step 2: Drop the old foreign key constraint if it exists
-- ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS fk_quizzes_session;

-- Step 3: Change column type from integer to varchar(36)
ALTER TABLE quizzes ALTER COLUMN session_id TYPE varchar(36);

-- Step 4: Ensure not null constraint
ALTER TABLE quizzes ALTER COLUMN session_id SET NOT NULL;

-- Step 5: Recreate index
DROP INDEX IF EXISTS idx_room_session;
CREATE INDEX idx_room_session ON quizzes(room_id, session_id);

COMMIT;
