#!/bin/bash

# Lecture Hall Database Verification Script
# Queries the database to show hall distribution and assignments

echo "🏫 Lecture Hall Database Verification"
echo "====================================="
echo ""

# Check if room_id provided
if [ -z "$1" ]; then
  echo "Usage: ./verify-lecture-halls.sh <room_id>"
  echo "Example: ./verify-lecture-halls.sh 123"
  exit 1
fi

ROOM_ID=$1

echo "Room ID: $ROOM_ID"
echo ""

# Query 1: Hall distribution
echo "📊 Hall Distribution:"
echo "--------------------"
psql -h localhost -p 5432 -U postgres -d wewatch_db -c "
SELECT 
  lecture_hall_number AS hall,
  COUNT(*) AS members,
  ROUND(COUNT(*) * 100.0 / 145, 1) AS \"capacity_%\"
FROM watch_session_members
WHERE watch_session_id = $ROOM_ID
  AND seat_id IS NOT NULL
GROUP BY lecture_hall_number
ORDER BY lecture_hall_number;
"

echo ""

# Query 2: Total members
echo "👥 Total Seated Members:"
echo "-----------------------"
psql -h localhost -p 5432 -U postgres -d wewatch_db -c "
SELECT COUNT(*) AS total_seated
FROM watch_session_members
WHERE watch_session_id = $ROOM_ID
  AND seat_id IS NOT NULL;
"

echo ""

# Query 3: Sample assignments (first 10 per hall)
echo "📋 Sample Assignments (First 5 per Hall):"
echo "-----------------------------------------"
psql -h localhost -p 5432 -U postgres -d wewatch_db -c "
WITH ranked AS (
  SELECT 
    user_id,
    seat_id,
    lecture_hall_number,
    ROW_NUMBER() OVER (PARTITION BY lecture_hall_number ORDER BY seat_id) AS rn
  FROM watch_session_members
  WHERE watch_session_id = $ROOM_ID
    AND seat_id IS NOT NULL
)
SELECT 
  lecture_hall_number AS hall,
  user_id,
  seat_id
FROM ranked
WHERE rn <= 5
ORDER BY lecture_hall_number, seat_id;
"

echo ""

# Query 4: Unseated members
echo "🚫 Unseated Members:"
echo "-------------------"
psql -h localhost -p 5432 -U postgres -d wewatch_db -c "
SELECT COUNT(*) AS unseated_count
FROM watch_session_members
WHERE watch_session_id = $ROOM_ID
  AND seat_id IS NULL;
"

echo ""

# Query 5: Hall occupancy visualization
echo "📈 Hall Capacity Visualization:"
echo "-------------------------------"
psql -h localhost -p 5432 -U postgres -d wewatch_db -c "
SELECT 
  lecture_hall_number AS hall,
  COUNT(*) AS members,
  REPEAT('█', CAST(COUNT(*) / 5 AS INT)) AS bar,
  CASE 
    WHEN COUNT(*) = 145 THEN '🔴 FULL'
    WHEN COUNT(*) >= 130 THEN '🟡 NEAR FULL'
    ELSE '🟢 AVAILABLE'
  END AS status
FROM watch_session_members
WHERE watch_session_id = $ROOM_ID
  AND seat_id IS NOT NULL
GROUP BY lecture_hall_number
ORDER BY lecture_hall_number;
"

echo ""
echo "✅ Verification complete!"
echo ""
echo "💡 To reset a session:"
echo "   UPDATE watch_session_members SET seat_id = NULL, lecture_hall_number = 1"
echo "   WHERE watch_session_id = $ROOM_ID;"
echo ""
