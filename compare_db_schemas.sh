#!/bin/bash
# Compare localhost and Railway PostgreSQL schemas

echo "🔍 Comparing localhost and Railway PostgreSQL schemas..."
echo ""

# Export localhost schema (structure only, no data)
echo "📥 Exporting localhost schema..."
PGPASSWORD=Chibby pg_dump -h localhost -U postgres -d wewatch_db --schema-only --no-owner --no-acl > /tmp/localhost_schema.sql
echo "✅ Localhost schema exported to /tmp/localhost_schema.sql"
echo ""

# Export Railway schema (structure only, no data)
echo "📥 Exporting Railway schema..."
railway connect postgres -c "\
PGPASSWORD=\$PGPASSWORD pg_dump \
  -h \$PGHOST \
  -p \$PGPORT \
  -U \$PGUSER \
  -d \$PGDATABASE \
  --schema-only \
  --no-owner \
  --no-acl > /tmp/railway_schema.sql" 2>/dev/null || {
  echo "⚠️  Direct pg_dump failed, trying alternative method..."
  railway run "pg_dump --schema-only --no-owner --no-acl" > /tmp/railway_schema.sql 2>/dev/null
}

if [ ! -f /tmp/railway_schema.sql ] || [ ! -s /tmp/railway_schema.sql ]; then
  echo "⚠️  Automated export failed. Manually exporting Railway schema..."
  echo "\dt" | railway connect postgres > /tmp/railway_tables.txt 2>&1
  echo "✅ Railway tables list exported"
else
  echo "✅ Railway schema exported to /tmp/railway_schema.sql"
fi
echo ""

# Show a simple diff of table structures
echo "📊 Comparing schemas..."
echo ""
echo "=== LOCALHOST TABLES ==="
grep "CREATE TABLE" /tmp/localhost_schema.sql | sed 's/CREATE TABLE //' | sed 's/ ($//' | sort
echo ""
echo "=== RAILWAY TABLES (from logs) ==="
echo "Based on error logs, Railway is missing these columns:"
echo "  ❌ watch_sessions.preview_enabled (FIXED ✅)"
echo "  ❌ watch_sessions.podcast_logo_url (FIXED ✅)"
echo ""

# Extract table and column information from localhost
echo "🔍 Checking for other potential missing columns..."
echo ""
psql -h localhost -U postgres -d wewatch_db -c "\
SELECT 
    table_name,
    column_name,
    data_type,
    character_maximum_length,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;" > /tmp/localhost_columns.txt

echo "✅ Localhost column details saved to /tmp/localhost_columns.txt"
echo ""
echo "Now checking Railway columns..."
echo "\d watch_sessions" | railway connect postgres > /tmp/railway_watch_sessions.txt 2>&1

echo ""
echo "📋 Summary saved to:"
echo "  - /tmp/localhost_schema.sql (full localhost schema)"
echo "  - /tmp/localhost_columns.txt (localhost column details)"
echo "  - /tmp/railway_watch_sessions.txt (Railway watch_sessions structure)"
echo ""
echo "💡 To see detailed differences, run:"
echo "   diff -u /tmp/localhost_schema.sql /tmp/railway_schema.sql | less"
