#!/bin/bash
# Quick export script for room groups

echo "🔍 Connecting to localhost PostgreSQL..."
echo ""
echo "📊 Fetching room groups for room 108..."
echo ""

# Export as INSERT statements
psql -U postgres -d wewatch_db -t -A -c "
SELECT 
    'INSERT INTO room_groups (id, room_id, name, description, icon, created_by, is_public, display_order, created_at, updated_at) VALUES (' ||
    id || ', ' || 
    room_id || ', ' ||
    quote_literal(name) || ', ' ||
    COALESCE(quote_literal(description), 'NULL') || ', ' ||
    quote_literal(icon) || ', ' ||
    created_by || ', ' ||
    is_public || ', ' ||
    display_order || ', ' ||
    quote_literal(created_at::text) || ', ' ||
    quote_literal(updated_at::text) || ');'
FROM room_groups
WHERE room_id = 108
ORDER BY id;
"

echo ""
echo "👥 Fetching user memberships..."
echo ""

psql -U postgres -d wewatch_db -t -A -c "
SELECT 
    'INSERT INTO user_room_groups (id, user_id, room_group_id, joined_at) VALUES (' ||
    id || ', ' || 
    user_id || ', ' ||
    room_group_id || ', ' ||
    quote_literal(joined_at::text) || ');'
FROM user_room_groups
WHERE room_group_id IN (SELECT id FROM room_groups WHERE room_id = 108)
ORDER BY id;
"

echo ""
echo "✅ Done! Copy the INSERT statements above and run them in Railway PostgreSQL"
