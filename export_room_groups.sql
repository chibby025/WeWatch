-- Export Room Groups Data from Localhost PostgreSQL
-- Run this on your localhost database to export data

-- Copy room_groups table
COPY (
    SELECT * FROM room_groups ORDER BY id
) TO '/tmp/room_groups.csv' WITH CSV HEADER;

-- Copy user_room_groups table
COPY (
    SELECT * FROM user_room_groups ORDER BY id
) TO '/tmp/user_room_groups.csv' WITH CSV HEADER;

-- Alternative: If COPY doesn't work, use this to generate INSERT statements
-- Run this and save the output:

SELECT 
    'INSERT INTO room_groups (id, room_id, name, description, icon, created_by, is_public, display_order, created_at, updated_at) VALUES ' ||
    string_agg(
        '(' || id || ', ' || 
        room_id || ', ' ||
        quote_literal(name) || ', ' ||
        COALESCE(quote_literal(description), 'NULL') || ', ' ||
        quote_literal(icon) || ', ' ||
        created_by || ', ' ||
        is_public || ', ' ||
        display_order || ', ' ||
        quote_literal(created_at::text) || ', ' ||
        quote_literal(updated_at::text) || ')',
        ', '
    ) || ';'
FROM room_groups
WHERE room_id = 108;  -- Change to your room ID

-- User room group memberships
SELECT 
    'INSERT INTO user_room_groups (id, user_id, room_group_id, joined_at) VALUES ' ||
    string_agg(
        '(' || id || ', ' || 
        user_id || ', ' ||
        room_group_id || ', ' ||
        quote_literal(joined_at::text) || ')',
        ', '
    ) || ';'
FROM user_room_groups
WHERE room_group_id IN (SELECT id FROM room_groups WHERE room_id = 108);
