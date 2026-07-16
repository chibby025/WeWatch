#!/usr/bin/env bash
# Game poster migration — two jobs:
#
#   1. UPLOAD Roulette.webp (genuinely new — not yet on BunnyCDN).
#      All other posters were already migrated in a prior session and
#      the carousel already caches them from CDN, so re-uploading to
#      the same path risks the edge cache getting stuck on the old version.
#
#   2. DELETE the remaining local .webp files (already served from CDN)
#      and clean up Windows Zone.Identifier sidecar files.
#
#   custom-backgrounds/ is left completely untouched.
#
# Run from the repo root in WSL: bash migrate_game_posters_to_bunny.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/backend/.env"
IMAGES_DIR="$SCRIPT_DIR/frontend/public/images"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found" >&2
  exit 1
fi

# Parse .env — handles CRLF line endings and ignores comments/blanks
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// /}" ]] && continue
  [[ "$line" != *=* ]] && continue
  key="${line%%=*}"
  value="${line#*=}"
  key="${key// /}"
  value="${value%%#*}"
  value="${value%"${value##*[![:space:]]}"}"
  value="${value#"${value%%[![:space:]]*}"}"
  if [[ "$value" =~ ^\"(.*)\"$ ]]; then value="${BASH_REMATCH[1]}"; fi
  if [[ "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi
  [[ -z "$key" ]] && continue
  export "$key=$value"
done < "$ENV_FILE"

: "${BUNNY_STORAGE_ZONE:?Need BUNNY_STORAGE_ZONE in .env}"
: "${BUNNY_ACCESS_KEY:?Need BUNNY_ACCESS_KEY in .env}"
: "${BUNNY_PULL_ZONE_URL:?Need BUNNY_PULL_ZONE_URL in .env}"
: "${BUNNY_STORAGE_REGION:=}"

if [[ -n "$BUNNY_STORAGE_REGION" && "$BUNNY_STORAGE_REGION" != "de" ]]; then
  STORAGE_BASE="https://${BUNNY_STORAGE_REGION}.storage.bunnycdn.com"
else
  STORAGE_BASE="https://storage.bunnycdn.com"
fi

# ── Step 1: Upload Roulette.webp (the only new poster) ──────────────────────
echo ""
echo "=== Step 1: Upload new poster (Roulette) ==="

ROULETTE_LOCAL="$IMAGES_DIR/Roulette.webp"
ROULETTE_REMOTE="games/posters/roulette.webp"
ROULETTE_URL="${STORAGE_BASE}/${BUNNY_STORAGE_ZONE}/${ROULETTE_REMOTE}"

if [[ ! -f "$ROULETTE_LOCAL" ]]; then
  echo "  ⚠️  Roulette.webp not yet in $IMAGES_DIR"
  echo "     (Windows→WSL sync may be pending — copy it then re-run)"
else
  echo "  → uploading Roulette.webp → roulette.webp"
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PUT "$ROULETTE_URL" \
    -H "AccessKey: ${BUNNY_ACCESS_KEY}" \
    -H "Content-Type: image/webp" \
    --data-binary "@${ROULETTE_LOCAL}")

  if [[ "$http_code" == "201" || "$http_code" == "200" ]]; then
    echo "  ✅ HTTP $http_code — ${BUNNY_PULL_ZONE_URL}/${ROULETTE_REMOTE}"
    rm -f "$ROULETTE_LOCAL"
    [[ -f "${ROULETTE_LOCAL}:Zone.Identifier" ]] && rm -f "${ROULETTE_LOCAL}:Zone.Identifier"
  else
    echo "  ❌ HTTP $http_code — local file kept, nothing deleted" >&2
    exit 1
  fi
fi

# ── Step 2: Delete local copies of already-CDN-hosted posters ───────────────
echo ""
echo "=== Step 2: Remove local copies (already on BunnyCDN) ==="

already_on_cdn=(
  "Air Hockey Poster.webp"
  "Fowl Play Poster.webp"
  "Glass Bridge Poster.webp"
  "Hangman Poster.webp"
  "Ping Pong Poster.webp"
  "Red Light Green Light Poster.webp"
  "Space Attack Poster.webp"
  "Sudoku Poster.webp"
  "Tug of War Poster.webp"
)

deleted=0
for name in "${already_on_cdn[@]}"; do
  f="$IMAGES_DIR/$name"
  if [[ -f "$f" ]]; then
    rm -f "$f"
    echo "  🗑️  deleted: $name"
    ((deleted++)) || true
  fi
done
echo "  ($deleted file(s) removed)"

# ── Step 3: Clean up Zone.Identifier sidecar files ──────────────────────────
echo ""
echo "=== Step 3: Clean up Zone.Identifier sidecars ==="

zone_count=0
while IFS= read -r -d '' f; do
  echo "  removing: $(basename "$f")"
  rm -f "$f"
  ((zone_count++)) || true
done < <(find "$IMAGES_DIR" -maxdepth 1 -name "*Zone.Identifier" -print0 2>/dev/null)
[[ $zone_count -eq 0 ]] && echo "  (none found)"

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "=== Done ==="
echo "  custom-backgrounds/ was not touched."
echo ""
echo "  What's left in images/:"
ls "$IMAGES_DIR" 2>/dev/null || echo "  (empty or directory missing)"
