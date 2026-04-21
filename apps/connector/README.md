# Vouchr Connector (Golang)

Local desktop bridge between Vouchr cloud and local Tally (`localhost:9000`).

## Commands

### 1) Sync Masters

```bash
go run ./cmd/vouchr-connector sync-masters
```

Fetches ledgers + voucher types from Tally and POSTs to web API.

### 2) Push Resolved Vouchers

```bash
go run ./cmd/vouchr-connector push-vouchers --statement-id=stmt_xxx
```

Fetches resolved statement JSON from web API and pushes voucher XML to Tally.

## Required env

- `VOUCHR_API_BASE_URL`
- `VOUCHR_CONNECTOR_TOKEN`
- `VOUCHR_COMPANY_ID`
- `TALLY_BASE_URL`
