#!/bin/bash
# Icon Usage Analysis Script
# Identifies used vs unused icons in frontend/public/icons

echo "========================================="
echo "WeWatch Icon Usage Analysis"
echo "Date: $(date)"
echo "========================================="
echo ""

cd "$(dirname "$0")/frontend"

# Create temporary files
USED_ICONS=$(mktemp)
ALL_ICONS=$(mktemp)
UNUSED_ICONS=$(mktemp)

# Extract all icon references from source code
echo "📊 Scanning source code for icon references..."
grep -rh "'/icons/" src/ --include="*.jsx" --include="*.js" | \
  grep -o "'/icons/[^']*'" | \
  sed "s/'//g" | \
  sed "s/\/icons\///g" | \
  sort -u > "$USED_ICONS"

grep -rh '"/icons/' src/ --include="*.jsx" --include="*.js" | \
  grep -o '"/icons/[^"]*"' | \
  sed 's/"//g' | \
  sed 's/\/icons\///g' | \
  sort -u >> "$USED_ICONS"

# Remove duplicates and sort
sort -u "$USED_ICONS" -o "$USED_ICONS"

# List all icon files
echo "📁 Scanning public/icons folder..."
cd public/icons
ls -1 > "$ALL_ICONS"

# Find unused icons
echo ""
echo "========================================="
echo "RESULTS"
echo "========================================="

TOTAL_FILES=$(wc -l < "$ALL_ICONS")
USED_COUNT=$(wc -l < "$USED_ICONS")

echo "Total icon files: $TOTAL_FILES"
echo "Referenced in code: $USED_COUNT"
echo ""

# Identify unused icons
comm -23 <(sort "$ALL_ICONS") <(sort "$USED_ICONS") > "$UNUSED_ICONS"
UNUSED_COUNT=$(wc -l < "$UNUSED_ICONS")

echo "Unused icons: $UNUSED_COUNT"
echo ""

# Calculate sizes
echo "========================================="
echo "SIZE ANALYSIS"
echo "========================================="
du -sh . | awk '{print "Total icons folder: " $1}'

# Calculate used icons size
USED_SIZE=0
while IFS= read -r icon; do
  if [ -f "$icon" ]; then
    SIZE=$(stat -f%z "$icon" 2>/dev/null || stat -c%s "$icon" 2>/dev/null)
    USED_SIZE=$((USED_SIZE + SIZE))
  fi
done < "$USED_ICONS"

USED_SIZE_MB=$(echo "scale=2; $USED_SIZE / 1024 / 1024" | bc)
echo "Used icons size: ${USED_SIZE_MB}MB"

# Calculate unused icons size
UNUSED_SIZE=0
while IFS= read -r icon; do
  if [ -f "$icon" ]; then
    SIZE=$(stat -f%z "$icon" 2>/dev/null || stat -c%s "$icon" 2>/dev/null)
    UNUSED_SIZE=$((UNUSED_SIZE + SIZE))
  fi
done < "$UNUSED_ICONS"

UNUSED_SIZE_MB=$(echo "scale=2; $UNUSED_SIZE / 1024 / 1024" | bc)
echo "Unused icons size: ${UNUSED_SIZE_MB}MB"
echo "Potential savings: ${UNUSED_SIZE_MB}MB"
echo ""

# Show categories of unused icons
echo "========================================="
echo "UNUSED ICONS BREAKDOWN"
echo "========================================="

echo ""
echo "Zone.Identifier files (Windows metadata):"
grep -c "Zone.Identifier" "$UNUSED_ICONS" || echo "0"

echo ""
echo "Backup/duplicate SVG files:"
grep -E "(BACKUP|OLD|OPTIMIZED|Copy)" "$UNUSED_ICONS" || echo "None"

echo ""
echo "Board variations:"
grep -E "board[0-9]+" "$UNUSED_ICONS" || echo "None"

echo ""
echo "Streaming service icons:"
grep -E "(youtube|netflix|crunchyroll|hdtoday|irokotv|moviebox|plutotv|showmax|tubi|twitch|viki|vimeo)Icon" "$UNUSED_ICONS" || echo "None"

echo ""
echo "Quiz/game icons:"
grep -E "(quiz|results)" "$UNUSED_ICONS" || echo "None"

echo ""
echo "========================================="
echo "DETAILED UNUSED ICONS LIST"
echo "========================================="
cat "$UNUSED_ICONS"

echo ""
echo "========================================="
echo "USED ICONS LIST (for reference)"
echo "========================================="
cat "$USED_ICONS"

# Cleanup
rm "$USED_ICONS" "$ALL_ICONS" "$UNUSED_ICONS"

echo ""
echo "✅ Analysis complete!"
echo ""
echo "To delete unused icons safely:"
echo "1. Review the unused icons list above"
echo "2. Create backup: cp -r public/icons public/icons.backup"
echo "3. Run deletion script (analyze-icons-delete.sh)"
