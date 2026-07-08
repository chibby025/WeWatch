#!/usr/bin/env bash
# Migrates VS Battle game sounds + videos from frontend/public/ to BunnyCDN.
# Reads credentials from backend/.env — no hardcoded keys.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/backend/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found" >&2
  exit 1
fi

# Parse .env — handles CRLF line endings and ignores comments/blanks
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"         # strip Windows \r
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// /}" ]] && continue
  [[ "$line" != *=* ]] && continue
  key="${line%%=*}"
  value="${line#*=}"
  key="${key// /}"             # strip spaces from key
  value="${value%%#*}"         # strip inline comments
  value="${value%"${value##*[![:space:]]}"}"  # rtrim
  value="${value#"${value%%[![:space:]]*}"}"  # ltrim
  # Remove surrounding quotes if present
  if [[ "$value" =~ ^\"(.*)\"$ ]]; then value="${BASH_REMATCH[1]}"; fi
  if [[ "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi
  [[ -z "$key" ]] && continue
  export "$key=$value"
done < "$ENV_FILE"

: "${BUNNY_STORAGE_ZONE:?Need BUNNY_STORAGE_ZONE in .env}"
: "${BUNNY_ACCESS_KEY:?Need BUNNY_ACCESS_KEY in .env}"
: "${BUNNY_PULL_ZONE_URL:?Need BUNNY_PULL_ZONE_URL in .env}"
: "${BUNNY_STORAGE_REGION:=}"  # optional — some zones don't set it

# Build storage API base URL
if [[ -n "$BUNNY_STORAGE_REGION" && "$BUNNY_STORAGE_REGION" != "de" ]]; then
  STORAGE_BASE="https://${BUNNY_STORAGE_REGION}.storage.bunnycdn.com"
else
  STORAGE_BASE="https://storage.bunnycdn.com"
fi

SOUNDS_SRC="$SCRIPT_DIR/frontend/public/sounds/gameSounds"
VIDS_SRC="$SCRIPT_DIR/frontend/public/gamevids"

upload() {
  local local_path="$1"
  local remote_path="$2"
  local filename
  filename="$(basename "$local_path")"
  # URL-encode spaces → %20
  local encoded_path
  encoded_path="$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" "$remote_path")"
  local url="${STORAGE_BASE}/${BUNNY_STORAGE_ZONE}/${encoded_path}"

  echo "  → uploading: $filename"
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PUT "$url" \
    -H "AccessKey: ${BUNNY_ACCESS_KEY}" \
    -H "Content-Type: application/octet-stream" \
    --data-binary "@${local_path}")

  if [[ "$http_code" == "201" || "$http_code" == "200" ]]; then
    echo "    ✅ $http_code — ${BUNNY_PULL_ZONE_URL}/$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe='/'))" "$remote_path")"
  else
    echo "    ❌ HTTP $http_code for $filename" >&2
  fi
}

echo ""
echo "=== Uploading game sounds → games/sounds/ ==="
while IFS= read -r -d '' f; do
  name="$(basename "$f")"
  # Skip Zone.Identifier sidecar files
  [[ "$name" == *Zone.Identifier* ]] && continue
  upload "$f" "games/sounds/${name}"
done < <(find "$SOUNDS_SRC" -maxdepth 1 -type f -print0)

echo ""
echo "=== Uploading game videos → games/vids/ ==="
while IFS= read -r -d '' f; do
  name="$(basename "$f")"
  [[ "$name" == *Zone.Identifier* ]] && continue
  upload "$f" "games/vids/${name}"
done < <(find "$VIDS_SRC" -maxdepth 1 -type f -print0)

echo ""
echo "=== Done ==="
echo ""
echo "CDN base: ${BUNNY_PULL_ZONE_URL}"
echo ""
echo "Paste these constants into VsBattleGame.jsx:"
echo ""
echo "const CDN = '${BUNNY_PULL_ZONE_URL}';"
echo "const SOUND_FILES = {"
while IFS= read -r -d '' f; do
  name="$(basename "$f")"
  [[ "$name" == *Zone.Identifier* ]] && continue
  encoded="$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe='/'))" "games/sounds/${name}")"
  echo "  // ${name}: \`\${CDN}/${encoded}\`,"
done < <(find "$SOUNDS_SRC" -maxdepth 1 -type f -print0)
echo "};"
