# Vouchr.it Monorepo (SaaS Blueprint)

Monorepo implementation for the high-throughput AI accounting pipeline:

- Next.js 15 SaaS web app (`apps/web`)
- FastAPI Gemini worker (`apps/worker`)
- Golang desktop connector (`apps/connector`)
- Shared Drizzle schema (`packages/db`)
- Shared JSON contracts (`packages/contracts`)

This setup follows your architecture decisions and borrows selective patterns from Cloudflare SaaS starters (D1 + R2 + Drizzle + modular app boundaries), without copying blindly.

## Repo Layout

```text
apps/
  web/        # Next.js 15 App Router, Better Auth, APIs, review UI
  worker/     # FastAPI + Gemini extraction + R2 writeback + webhook callback
  connector/  # Go CLI (sync-masters, push-vouchers)
packages/
  db/         # Drizzle schema (auth/org + companies + masters + statements)
  contracts/  # Zod schemas for statement JSON + webhook payloads
```

## Core Flow

1. Connector runs `sync-masters` and pushes ledgers/voucher types to `/api/connector/sync-masters`.
2. Web app creates statement row + presigned URL for PDF upload (`/api/statements/upload-url`).
3. Web app triggers worker (`/api/statements/:id/process`).
4. Worker reads PDF from R2, calls Gemini, normalizes JSON, writes `extracted.json` to R2.
5. Worker calls web internal webhook (`/api/internal/statements/:id/processed`).
6. Review page loads entries in virtualized grid (TanStack + Zustand), user edits, clicks save.
7. Connector runs `push-vouchers --statement-id=...` and pushes XML to Tally.

## Credentials Required

### Cloudflare
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME` (recommended: `vouchrit-data`)
- D1 database id/name for production binding (`wrangler.toml`)

### Auth
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`

### Worker/Integration
- `GEMINI_API_KEY`
- `WORKER_WEBHOOK_SECRET` (same value in web + worker)
- `WORKER_BASE_URL` (web -> worker internal URL)

### Connector
- `CONNECTOR_SHARED_TOKEN` (same in web + connector)
- `VOUCHR_COMPANY_ID` (for each mapped local connector instance)
- `TALLY_BASE_URL` (default: `http://localhost:9000`)

## Local Dev

### 1) Install dependencies

```bash
pnpm install
```

### 2) Web app

```bash
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @vouchr/web dev
```

### 3) Worker

```bash
cd apps/worker
cp .env.example .env
uv sync
uv run uvicorn app.main:app --reload --port 8001
```

### 4) Connector

```bash
cd apps/connector
export VOUCHR_API_BASE_URL=http://localhost:3000
export VOUCHR_CONNECTOR_TOKEN=<same-as-web-env>
export VOUCHR_COMPANY_ID=<company-id>
go run ./cmd/vouchr-connector sync-masters
```

## Current Status

- [x] Monorepo scaffolding
- [x] Multi-tenant schema and statement model
- [x] Worker extraction prompt + strict JSON normalization
- [x] Desktop-first dashboard/banking/review UI with matching design language
- [x] Virtualized review grid with local dirty-state save
- [x] Connector command skeletons for Tally sync/push
- [ ] Production auth flows/screens
- [ ] Exact Tally XML mapping finalization
- [ ] End-to-end integration tests
