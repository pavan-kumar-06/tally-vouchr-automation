# Lightsail + Cloudflare D1 Runbook

This runbook is for running the monorepo on AWS Lightsail with Cloudflare D1 + R2.

## 0) What causes `table not found` in this repo

- FastAPI is now the source of auth/business APIs.
- D1 remains the source of truth for auth/domain data.
- If tables are not migrated in D1, API calls fail with `no such table`.

## 1) Required Cloudflare token scope for D1 CLI/API

Create/update an API token with at least:

- Account: `D1 Read`
- Account: `D1 Write` (or `D1 Edit` in dashboard wording)
- Account scope restricted to your account

Quick check:

```bash
curl -sS "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/d1/database/$CLOUDFLARE_DATABASE_ID" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

If this returns auth error, fix token first.

## 2) Configure production env on Lightsail (web)

In `apps/web/.env.local` ensure:

```env
NEXT_PUBLIC_API_BASE_URL=https://accountant.my-ai.in
```

In `apps/worker/.env` ensure:

```env
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_DATABASE_ID=...
CLOUDFLARE_API_TOKEN=...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=vouchrit-data
CONNECTOR_SHARED_TOKEN=...
WORKER_WEBHOOK_SECRET=...
JWT_SECRET=...
COOKIE_DOMAIN=.my-ai.in
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
```

## 3) Apply schema migrations (critical)

Run from repo root on server:

```bash
# Verify wrangler can see DB
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN \
corepack pnpm --filter @vouchr/web exec wrangler d1 info vouchrit-db --json

# Apply full schema directly to remote D1 in order
for f in \
  packages/db/drizzle/0000_flimsy_nightcrawler.sql \
  packages/db/drizzle/0001_striped_komodo.sql \
  packages/db/drizzle/0002_ledger_kind.sql \
  packages/db/drizzle/0003_master_source_fields.sql \
  packages/db/drizzle/0004_first_hairball.sql \
  packages/db/drizzle/0005_backend_auth.sql
  do
    echo "Applying $f"
    CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN \
    corepack pnpm --filter @vouchr/web exec wrangler d1 execute vouchrit-db --remote --file="$f"
  done
```

Then verify tables exist:

```bash
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN \
corepack pnpm --filter @vouchr/web exec wrangler d1 execute vouchrit-db --remote \
  --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

## 4) Migration bug fixed in repo

`0005_backend_auth.sql` adds backend-first auth tables:
- `users`
- `organizations`
- `memberships`
- `refresh_tokens`

It also backfills org/user/membership records from legacy Better Auth tables to keep existing company ownership mapping valid during transition.

## 5) Start services

```bash
# web
corepack pnpm --filter @vouchr/web build
corepack pnpm --filter @vouchr/web start

# worker (separate process)
cd apps/worker
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install fastapi uvicorn pydantic-settings argon2-cffi google-genai boto3 httpx pypdf python-multipart PyJWT
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 6) Signup and fetch IDs for connector

Get latest organization/company IDs from DB:

```bash
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN \
corepack pnpm --filter @vouchr/web exec wrangler d1 execute vouchrit-db --remote \
  --command="SELECT id,name,slug FROM organizations ORDER BY created_at DESC LIMIT 10;"

CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN \
corepack pnpm --filter @vouchr/web exec wrangler d1 execute vouchrit-db --remote \
  --command="SELECT id,name,organization_id FROM companies ORDER BY created_at DESC LIMIT 20;"
```

Connector needs `VOUCHR_COMPANY_ID` (company table `id`), not org id.

## 7) Using D1 from Next.js and Python when running outside Cloudflare

When running on Lightsail, there is no Worker `env.DB` binding.
The FastAPI backend uses D1 REST API:
- `POST /accounts/{account_id}/d1/database/{database_id}/query`
- Auth header: `Authorization: Bearer <API_TOKEN>`
