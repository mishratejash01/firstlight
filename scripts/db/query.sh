#!/bin/bash
# Runs SQL from stdin against the Supabase project via the Management API.
#   scripts/db/query.sh <<'SQL'
#   select count(*) from public.articles;
#   SQL
# Reads SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF from .env.local.
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; . ./.env.local; set +a
TMP=$(mktemp)
python3 -c "import json,sys;print(json.dumps({'query':sys.stdin.read()}))" > "$TMP"
curl -s -X POST \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  --data-binary @"$TMP" \
  "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query"
rm -f "$TMP"
echo
