#!/bin/bash
# Apply migrations to LOCAL database (not Railway)
# Usage: ./apply_local_migrations.sh

echo "🔍 Checking current constraint on LOCAL database..."
psql -h localhost -U postgres -d wewatch_db -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'watch_sessions'::regclass AND contype = 'c';"

echo ""
echo "📝 Applying migration 1: Expand content_rating column to varchar(20)..."
psql -h localhost -U postgres -d wewatch_db -f migrations/20260509_expand_content_rating_values.sql

echo ""
echo "📝 Applying migration 2: Fix CHECK constraint to include Educational/Religious..."
psql -h localhost -U postgres -d wewatch_db -f migrations/20260509_fix_content_rating_constraint.sql

echo ""
echo "✅ Verifying new constraint..."
psql -h localhost -U postgres -d wewatch_db -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'watch_sessions'::regclass AND contype = 'c';"

echo ""
echo "✅ Migration complete! Restart your backend and try creating a session with 'Religious' content rating."
