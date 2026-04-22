#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${D1_DB_NAME:-vouchrit-db}"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN is required"
  exit 1
fi

MIGRATIONS=(
  "../../packages/db/drizzle/0000_flimsy_nightcrawler.sql"
  "../../packages/db/drizzle/0001_striped_komodo.sql"
  "../../packages/db/drizzle/0002_ledger_kind.sql"
  "../../packages/db/drizzle/0003_master_source_fields.sql"
  "../../packages/db/drizzle/0004_first_hairball.sql"
  "../../packages/db/drizzle/0005_backend_auth.sql"
)

echo "Applying migrations to D1 database: ${DB_NAME}"
for f in "${MIGRATIONS[@]}"; do
  echo "-> ${f}"
  corepack pnpm --filter @vouchr/web exec wrangler d1 execute "${DB_NAME}" --remote --file="${f}"
done

echo "Verifying tables..."
corepack pnpm --filter @vouchr/web exec wrangler d1 execute "${DB_NAME}" --remote --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
