#!/bin/bash
# Regenerates src/lib/supabase/database.types.ts from the live schema.
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; . ./.env.local; set +a
curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/types/typescript?included_schemas=public" \
  | python3 -c "import sys,json; sys.stdout.write(json.load(sys.stdin)['types'])" > src/lib/supabase/database.types.ts
echo "types regenerated"
