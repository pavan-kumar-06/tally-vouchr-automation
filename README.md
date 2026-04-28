# AI Accounting Pipeline

AI-powered accounting automation platform. Extracts transaction data from bank PDFs, intelligently maps entries to ledger accounts using semantic vector search, and pushes vouchers to Tally ERP — with full audit trail and review workflow.

## Architecture

### Phase 1 — Statement Extraction

1. **Connector** (`sync-masters`) pushes ledgers/voucher types from Tally to the API
2. **Web app** creates a statement record + presigned R2 URL for PDF upload
3. **Web app** triggers the FastAPI worker to process the statement
4. **Worker** reads PDF from R2 → OpenRouter/Gemini extracts transactions → normalized JSON → R2
5. **Review UI** loads entries in a virtualized grid; user edits and saves
6. **Connector** (`push-vouchers`) sends XML to Tally

### Phase 2 — Intelligent Ledger Mapping (zvec + Gemini)

Each accepted transaction → ledger mapping is stored as a **768-dimensional embedding vector** in **zvec** (Alibaba's in-process vector database). When a new transaction arrives, it is embedded using Gemini and similarity search finds the closest stored mapping vectors — the associated ledger is suggested to the user.

```
Transaction Narration
        │
        ▼
┌───────────────────┐
│  Gemini Embedding │  (gemini-embedding-exp, 768-dim)
└───────────────────┘
        │
        ▼
┌───────────────────────┐     ┌──────────────────────────────┐
│         zvec           │◀───▶│  Ledger Mapping Collection    │
│  (per-company store)  │     │  (accepted txn→ledger vectors)│
└───────────────────────┘     └──────────────────────────────┘
        │
        ▼
┌────────────────────────────────────┐
│  Top-K Ledger Suggestions           │
│  ranked by cosine similarity        │
│  → User accepts / rejects           │
└────────────────────────────────────┘
```

Over time, the vector store grows with accepted mappings — making suggestions progressively more accurate.

## Repo Layout

```
apps/
  web/        Next.js 15.5 App Router — Dashboard, banking feeds, review UI
  worker/     FastAPI + OpenRouter/Gemini — PDF extraction, R2 storage, webhook callbacks
  connector/  Go CLI — sync-masters, push-vouchers for Tally ERP
packages/
  db/         Drizzle schema — auth/org + companies + masters + statements
  contracts/  Zod schemas — statement JSON & webhook payloads
```

## Tech Stack

| Layer | Technology |
|---|---|
| Web | Next.js 15.5, Better Auth, TanStack Table, Zustand |
| Worker API | FastAPI, Pydantic, OpenRouter, Gemini |
| Database | Cloudflare D1 (SQLite), Drizzle ORM |
| Object Storage | Cloudflare R2 (S3-compatible) |
| Vector Store | **zvec** (in-process vector DB by Alibaba) |
| Embeddings | Google Gemini `gemini-embedding-exp` (768-dim) |
| Connector | Go CLI → Tally XML API |
| Deployment | Cloudflare Workers (web), FastAPI on Lightsail |

## Credential Setup

### Cloudflare
```bash
R2_ACCOUNT_ID=your_r2_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=vouchrit-data
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
CLOUDFLARE_DATABASE_ID=your_d1_database_id
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
```

### Auth
```bash
BETTER_AUTH_SECRET=generate_32_char_random_string
BETTER_AUTH_URL=https://your-domain.com
```

### Worker & Integrations
```bash
GEMINI_API_KEY=your_gemini_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
WORKER_WEBHOOK_SECRET=same_value_in_web_and_worker
WORKER_BASE_URL=http://localhost:8001
CONNECTOR_SHARED_TOKEN=same_in_web_and_connector
```

### Connector
```bash
VOUCHR_API_BASE_URL=https://your-domain.com
VOUCHR_CONNECTOR_TOKEN=same_as_web_env
VOUCHR_COMPANY_ID=company_uuid
TALLY_BASE_URL=http://localhost:9000
```

## Local Dev Setup

### 1) Install dependencies
```bash
pnpm install
```

### 2) Web app
```bash
cp apps/web/.env.example apps/web/.env.local
# fill in CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_DATABASE_ID / CLOUDFLARE_API_TOKEN
# run D1 schema migration:
CLOUDFLARE_API_TOKEN=... ./scripts/migrate-d1.sh
pnpm --filter @vouchr/web dev
```

### 3) Worker (FastAPI)
```bash
cd apps/worker
cp .env.example .env
uv sync
uv run uvicorn app.main:app --reload --port 8001
```

### 4) Connector (Go CLI)
```bash
cd apps/connector
export VOUCHR_API_BASE_URL=http://localhost:3000
export VOUCHR_CONNECTOR_TOKEN=<same-as-web-env>
export VOUCHR_COMPANY_ID=<company-id>
go run ./cmd/vouchr-connector sync-masters
```

### Ledger Mapping (Phase 2)

Vector store initializes per-company at runtime. Accepted transaction → ledger mappings are embedded using Gemini and stored in **zvec**:

- **Storage path**: `./.local-objects/zvec/{company_id}.zvec`
- **Embedding model**: Gemini `gemini-embedding-exp` (768-dim vectors)
- **Vector DB**: [zvec](https://github.com/alibaba/zvec) by Alibaba — in-process, WAL-persisted

## Completed Features

- Monorepo scaffolding with pnpm workspaces
- Multi-tenant schema and statement model
- PDF extraction pipeline with OpenRouter/Gemini fallback
- R2 storage integration for PDFs and extracted JSON
- Desktop-first dashboard/banking/review UI
- Virtualized review grid with local dirty-state save
- Connector commands for Tally sync/push
- Phase 2: Ledger mapping via zvec + Gemini embeddings
