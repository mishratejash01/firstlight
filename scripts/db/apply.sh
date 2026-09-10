#!/bin/bash
# Applies one migration file. Fails loudly on error.
#   scripts/db/apply.sh supabase/migrations/2026..._name.sql
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; . ./.env.local; set +a
TMP=$(mktemp)
python3 -c "import json,sys;print(json.dumps({'query':open(sys.argv[1]).read()}))" "$1" > "$TMP"
RESP=$(curl -s -X POST \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  --data-binary @"$TMP" \
  "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query")
rm -f "$TMP"
if echo "$RESP" | grep -q '"message"'; then echo "FAILED: $1"; echo "$RESP"; exit 1; fi
echo "applied: $(basename "$1")"
