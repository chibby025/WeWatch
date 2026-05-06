#!/bin/bash
# Generate and apply schema sync from localhost to Railway

echo "🔄 Syncing localhost PostgreSQL schema to Railway..."
echo ""
echo "⚠️  WARNING: This will modify your Railway production database!"
echo "Press Ctrl+C to cancel, or Enter to continue..."
read

# Get localhost schema (only CREATE TABLE, ALTER TABLE, CREATE INDEX)
echo "📥 Extracting localhost schema..."
PGPASSWORD=Chibby pg_dump -h localhost -U postgres -d wewatch_db \
  --schema-only \
  --no-owner \
  --no-acl \
  --no-privileges \
  -t rooms \
  -t users \
  -t watch_sessions \
  -t watch_session_members \
  -t room_members \
  -t messages \
  -t posts \
  -t comments \
  -t likes \
  -t room_groups \
  -t user_room_groups \
  -t token_blacklists \
  -t user_follows \
  -t notifications \
  -t media_files \
  -t tickets \
  -t transactions \
  -t withdrawals \
  -t scheduled_events \
  > /tmp/localhost_tables.sql

echo "✅ Schema extracted"
echo ""
echo "📊 Generating safe migration script..."

# Create a safe migration script that checks before altering
cat > /tmp/railway_migration.sql << 'EOF'
-- Railway Schema Migration
-- Generated from localhost PostgreSQL
-- Safely adds missing columns without breaking existing data

\c railway;

-- Helper function to add column if not exists
CREATE OR REPLACE FUNCTION add_column_if_not_exists(
    table_name_param TEXT,
    column_name_param TEXT,
    column_definition TEXT
) RETURNS VOID AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = table_name_param 
        AND column_name = column_name_param
    ) THEN
        EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', 
            table_name_param, column_name_param, column_definition);
        RAISE NOTICE 'Added column %.%', table_name_param, column_name_param;
    ELSE
        RAISE NOTICE 'Column %.% already exists', table_name_param, column_name_param;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Get all columns from localhost and check Railway
EOF

# Query localhost to get all columns that might be missing
PGPASSWORD=Chibby psql -h localhost -U postgres -d wewatch_db -t -A -F"|" -c "
SELECT 
    table_name,
    column_name,
    CASE 
        WHEN data_type = 'character varying' THEN 'VARCHAR(' || character_maximum_length || ')'
        WHEN data_type = 'timestamp without time zone' THEN 'TIMESTAMP'
        WHEN data_type = 'boolean' THEN 'BOOLEAN'
        WHEN data_type = 'integer' THEN 'INTEGER'
        WHEN data_type = 'bigint' THEN 'BIGINT'
        WHEN data_type = 'text' THEN 'TEXT'
        WHEN data_type = 'numeric' THEN 'NUMERIC(' || numeric_precision || ',' || numeric_scale || ')'
        WHEN data_type = 'real' THEN 'REAL'
        WHEN data_type = 'double precision' THEN 'DOUBLE PRECISION'
        ELSE UPPER(data_type)
    END ||
    CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
    CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END as column_def
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('rooms', 'users', 'watch_sessions', 'watch_session_members', 
                     'room_members', 'messages', 'posts', 'comments', 'likes',
                     'room_groups', 'user_room_groups', 'token_blacklists',
                     'user_follows', 'notifications', 'media_files', 'tickets',
                     'transactions', 'withdrawals', 'scheduled_events')
  AND column_name NOT IN ('id', 'created_at', 'updated_at', 'deleted_at')
ORDER BY table_name, ordinal_position;
" | while IFS='|' read -r table col def; do
  # Skip empty lines
  [ -z "$table" ] && continue
  
  # Add to migration script
  echo "SELECT add_column_if_not_exists('$table', '$col', '$def');" >> /tmp/railway_migration.sql
done

# Add final cleanup
cat >> /tmp/railway_migration.sql << 'EOF'

-- Cleanup helper function
DROP FUNCTION add_column_if_not_exists;

-- Show final column count per table
SELECT 
    table_name,
    COUNT(*) as column_count
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;
EOF

echo "✅ Migration script generated: /tmp/railway_migration.sql"
echo ""
echo "📝 Review the migration script:"
echo ""
head -50 /tmp/railway_migration.sql
echo ""
echo "... (truncated, see full file at /tmp/railway_migration.sql)"
echo ""
echo "🚀 Apply migration to Railway? (yes/no)"
read answer

if [ "$answer" = "yes" ]; then
    echo ""
    echo "🔄 Applying migration to Railway..."
    cat /tmp/railway_migration.sql | railway connect postgres
    echo ""
    echo "✅ Migration complete!"
else
    echo "❌ Migration cancelled"
    echo "💡 You can manually apply it later with:"
    echo "   cat /tmp/railway_migration.sql | railway connect postgres"
fi
