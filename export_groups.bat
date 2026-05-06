@echo off
REM Quick export script for room groups (Windows)

echo 🔍 Connecting to localhost PostgreSQL...
echo.
echo 📊 Fetching room groups for room 108...
echo.

REM You can run this directly in Windows terminal if you have psql in PATH
REM Or just copy these queries manually into pgAdmin or DataGrip

echo Copy this query into your PostgreSQL client:
echo ===============================================
echo.
echo SELECT 
echo     'INSERT INTO room_groups (id, room_id, name, description, icon, created_by, is_public, display_order, created_at, updated_at) VALUES (' ^|^|
echo     id ^|^| ', ' ^|^| 
echo     room_id ^|^| ', ' ^|^|
echo     quote_literal(name) ^|^| ', ' ^|^|
echo     COALESCE(quote_literal(description), 'NULL') ^|^| ', ' ^|^|
echo     quote_literal(icon) ^|^| ', ' ^|^|
echo     created_by ^|^| ', ' ^|^|
echo     is_public ^|^| ', ' ^|^|
echo     display_order ^|^| ', ' ^|^|
echo     quote_literal(created_at::text) ^|^| ', ' ^|^|
echo     quote_literal(updated_at::text) ^|^| ');'
echo FROM room_groups
echo WHERE room_id = 108
echo ORDER BY id;
echo.
echo ===============================================
echo.
pause
