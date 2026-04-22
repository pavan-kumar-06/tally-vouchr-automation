#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${D1_DB_NAME:-vouchrit-db}"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN is required"
  exit 1
fi

echo "Organizations:"
corepack pnpm --filter @vouchr/web exec wrangler d1 execute "${DB_NAME}" --remote --command="SELECT id,name,slug FROM organization ORDER BY created_at DESC LIMIT 20;"

echo "Companies (use company id for connector VOUCHR_COMPANY_ID):"
corepack pnpm --filter @vouchr/web exec wrangler d1 execute "${DB_NAME}" --remote --command="SELECT id,name,organization_id FROM companies ORDER BY created_at DESC LIMIT 50;"
