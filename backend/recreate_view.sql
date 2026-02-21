-- Recreate top_rated_rooms view after column type migration
-- Run this after GORM migration completes successfully

CREATE OR REPLACE VIEW top_rated_rooms AS
SELECT 
    id,
    name,
    host_id,
    average_rating,
    total_ratings,
    description,
    created_at
FROM rooms
WHERE total_ratings >= 5  -- Only show rooms with at least 5 ratings
ORDER BY average_rating DESC, total_ratings DESC
LIMIT 50;
