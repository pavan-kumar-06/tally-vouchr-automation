from __future__ import annotations

import asyncio
import json
import time
import uuid
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.auth import now_unix
from app.auth_routes import AuthContext, get_current_user
from app.config import settings
from app.d1_client import D1Client
from app.process import process_statement
from app.schemas import ProcessStatementRequest
from app.storage import storage

router = APIRouter(tags=["api"])
db = D1Client()

active_connections: dict[str, asyncio.Queue] = {}
sync_status: dict[str, dict[str, Any]] = {}

CANONICAL_VOUCHERS = ["Payment", "Receipt", "Contra"]
BANK_PARENT = "Bank Accounts"


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _token_auth(token: str | None) -> None:
    if not token or token != settings.connector_shared_token:
        raise HTTPException(status_code=401, detail="Invalid connector token")


def _new_sync_id() -> str:
    return f"sync_{uuid.uuid4().hex[:12]}"


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value).lower() in {"1", "true", "yes"}


def _company_to_api(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "organizationId": row["organization_id"],
        "ownerId": row["owner_id"],
        "name": row["name"],
        "tallyCompanyName": row.get("tally_company_name"),
        "tallyCompanyRemoteId": row.get("tally_company_remote_id"),
        "defaultBankLedgerName": row.get("default_bank_ledger_name"),
        "connectorLastSyncedAt": row.get("connector_last_synced_at"),
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
    }


def _statement_to_api(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "companyId": row["company_id"],
        "uploadedByUserId": row["uploaded_by_user_id"],
        "filename": row["filename"],
        "sourceR2Key": row["source_r2_key"],
        "resultR2Key": row.get("result_r2_key"),
        "status": row["status"],
        "bankLedgerName": row.get("bank_ledger_name"),
        "passwordProtected": _to_bool(row.get("password_protected", 0)),
        "extractionPeriodFrom": row.get("extraction_period_from"),
        "extractionPeriodTo": row.get("extraction_period_to"),
        "entryCount": int(row.get("entry_count") or 0),
        "processingError": row.get("processing_error"),
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
    }


async def _get_company_for_org(company_id: str, org_id: str) -> dict[str, Any] | None:
    return await db.one(
        "SELECT * FROM companies WHERE id = ? AND organization_id = ? LIMIT 1",
        [company_id, org_id],
    )


class CompanyCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    tallyCompanyName: str | None = None
    tallyCompanyRemoteId: str | None = None


class CompanyPatchRequest(BaseModel):
    tallyCompanyName: str | None = None
    tallyCompanyRemoteId: str | None = None


class StatementUploadRequest(BaseModel):
    companyId: str
    filename: str
    contentType: str = "application/pdf"
    bankLedgerName: str | None = None
    extractionPeriodFrom: str | None = None
    extractionPeriodTo: str | None = None
    passwordProtected: bool = False


class StatementProcessRequest(BaseModel):
    filePassword: str | None = None


class StatementPatchRequest(BaseModel):
    bankLedgerName: str | None = None


class StatementArchiveRequest(BaseModel):
    archived: bool = True


class EntriesPutRequest(BaseModel):
    entries: list[dict[str, Any]]
    extractionModel: str | None = None


class DiscoveryCompany(BaseModel):
    name: str
    remoteId: str | None = None
    guid: str | None = None


class DiscoveryRequest(BaseModel):
    organizationId: str
    companies: list[DiscoveryCompany]


class SyncMastersTriggerRequest(BaseModel):
    company_id: str
    org_id: str
    tally_remote_id: str


class DashboardSyncTriggerRequest(BaseModel):
    companyId: str
    orgId: str
    tallyRemoteId: str


class MasterEntry(BaseModel):
    name: str
    type: Literal["LEDGER", "VOUCHER_TYPE"]
    ledgerKind: Literal["BANK", "OTHER"] | None = None
    parent: str | None = None
    isDeemedPositive: bool | None = None


class SyncMastersRequest(BaseModel):
    organizationId: str
    tallyCompanyRemoteId: str
    masters: list[MasterEntry]


class ProcessedWebhookPayload(BaseModel):
    statementId: str
    resultR2Key: str | None = None
    entryCount: int = 0
    status: Literal["REVIEW", "FAILED", "SYNCED", "ARCHIVED", "DELETED", "PROCESSING", "UPLOADED"]
    processingError: str | None = None
class ConnectorCompleteRequest(BaseModel):
    sync_id: str
    success: bool
    result: dict[str, Any] | None = None
    error: str | None = None


class WaitlistCreateRequest(BaseModel):
    email: str = Field(min_length=3)
    name: str | None = None
    company: str | None = None
    role: str | None = None


def _normalize_name(value: str) -> str:
    return value.strip().upper().replace("\t", " ").replace("  ", " ")


def _clean_tally_text(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = "".join(ch for ch in value if 32 <= ord(ch) <= 126).strip()
    return cleaned or None


def _classify_ledger_kind(master: MasterEntry) -> str | None:
    if master.type != "LEDGER":
        return None
    if master.ledgerKind:
        return master.ledgerKind
    parent = (_clean_tally_text(master.parent) or "").upper()
    if parent == "BANK ACCOUNTS":
        return "BANK"
    return "OTHER"


async def _mark_statement_processed(statement_id: str, payload: dict[str, Any]) -> None:
    await db.execute(
        """
        UPDATE statements
        SET result_r2_key = ?,
            entry_count = ?,
            status = ?,
            processing_error = ?,
            updated_at = ?
        WHERE id = ?
        """,
        [
            payload.get("result_r2_key"),
            int(payload.get("entry_count") or 0),
            payload.get("status"),
            payload.get("processing_error"),
            now_unix(),
            statement_id,
        ],
    )


async def _run_processing_background(statement_row: dict[str, Any], file_password: str | None) -> None:
    req = ProcessStatementRequest(
        statement_id=statement_row["id"],
        company_id=statement_row["company_id"],
        filename=statement_row["filename"],
        source_r2_key=statement_row["source_r2_key"],
        bank_ledger_name=statement_row.get("bank_ledger_name"),
        extraction_period_from=statement_row.get("extraction_period_from"),
        extraction_period_to=statement_row.get("extraction_period_to"),
        file_password=file_password,
    )

    result = await process_statement(req)
    await _mark_statement_processed(statement_row["id"], result.model_dump())


@router.get("/health")
async def health():
    return {"ok": True}


@router.post("/api/waitlist")
async def waitlist_signup(payload: WaitlistCreateRequest):
    """Public endpoint to join the waitlist. Unauthenticated."""
    try:
        waitlist_id = f"wtl_{uuid.uuid4().hex[:12]}"
        await db.execute(
            "INSERT INTO waitlist (id, email, name, company, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [
                waitlist_id,
                payload.email.strip().lower(),
                payload.name.strip() if payload.name else None,
                payload.company.strip() if payload.company else None,
                payload.role.strip() if payload.role else None,
                now_unix(),
            ],
        )
        return {"ok": True}
    except Exception as e:
        if "UNIQUE" in str(e):
            return {"ok": True}
        print(f"Waitlist error: {e}")
        raise HTTPException(status_code=500, detail="Failed to join waitlist")



@router.get("/api/companies")
async def list_companies(ctx: AuthContext = Depends(get_current_user)):
    rows = await db.query(
        "SELECT * FROM companies WHERE organization_id = ? ORDER BY created_at DESC",
        [ctx.org_id],
    )
    return [_company_to_api(row) for row in rows]


@router.get("/api/companies/{company_id}")
async def get_company(company_id: str, ctx: AuthContext = Depends(get_current_user)):
    row = await _get_company_for_org(company_id, ctx.org_id)
    if not row:
        raise HTTPException(status_code=404, detail="Company not found")
    return _company_to_api(row)


@router.post("/api/companies")
async def create_company(payload: CompanyCreateRequest, ctx: AuthContext = Depends(get_current_user)):
    company_id = _new_id("cmp")
    now = now_unix()

    await db.execute(
        """
        INSERT INTO companies (
          id, organization_id, owner_id, name,
          tally_company_name, tally_company_remote_id,
          default_bank_ledger_name, connector_last_synced_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
        """,
        [
            company_id,
            ctx.org_id,
            ctx.user_id,
            payload.name.strip(),
            payload.tallyCompanyName,
            payload.tallyCompanyRemoteId,
            now,
            now,
        ],
    )

    return {
        "id": company_id,
        "name": payload.name.strip(),
        "organizationId": ctx.org_id,
        "tallyCompanyName": payload.tallyCompanyName,
        "tallyCompanyRemoteId": payload.tallyCompanyRemoteId,
    }


@router.patch("/api/companies/{company_id}")
async def patch_company(company_id: str, payload: CompanyPatchRequest, ctx: AuthContext = Depends(get_current_user)):
    company = await _get_company_for_org(company_id, ctx.org_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    await db.execute(
        """
        UPDATE companies
        SET tally_company_name = ?, tally_company_remote_id = ?, updated_at = ?
        WHERE id = ? AND organization_id = ?
        """,
        [payload.tallyCompanyName, payload.tallyCompanyRemoteId, now_unix(), company_id, ctx.org_id],
    )
    return {"ok": True}


@router.get("/api/companies/{company_id}/statements")
async def list_company_statements(company_id: str, ctx: AuthContext = Depends(get_current_user)):
    company = await _get_company_for_org(company_id, ctx.org_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    rows = await db.query(
        "SELECT * FROM statements WHERE company_id = ? ORDER BY created_at DESC",
        [company_id],
    )
    return [_statement_to_api(row) for row in rows]


@router.get("/api/companies/{company_id}/bank-ledgers")
async def company_bank_ledgers(company_id: str, ctx: AuthContext = Depends(get_current_user)):
    company = await _get_company_for_org(company_id, ctx.org_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    rows = await db.query(
        """
        SELECT name FROM tally_masters
        WHERE company_id = ? AND type = 'LEDGER' AND is_active = 1 AND source_parent = ?
        ORDER BY name ASC
        """,
        [company_id, BANK_PARENT],
    )

    if rows:
        return {"names": [row["name"] for row in rows], "source": "BANK_PARENT"}

    fallback = await db.query(
        """
        SELECT name FROM tally_masters
        WHERE company_id = ? AND type = 'LEDGER' AND is_active = 1
        ORDER BY name ASC
        LIMIT 500
        """,
        [company_id],
    )
    return {"names": [row["name"] for row in fallback], "source": "ALL_UNTAGGED"}


@router.get("/api/companies/{company_id}/statements/duplicate-check")
async def duplicate_statement_check(company_id: str, filename: str, ctx: AuthContext = Depends(get_current_user)):
    company = await _get_company_for_org(company_id, ctx.org_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    lower = filename.strip().lower()
    if not lower:
        raise HTTPException(status_code=400, detail="filename required")

    existing = await db.one(
        """
        SELECT id
        FROM statements
        WHERE company_id = ? AND lower(filename) = ?
        LIMIT 1
        """,
        [company_id, lower],
    )

    return {"exists": bool(existing), "statementId": existing["id"] if existing else None}


@router.post("/api/statements/upload-url")
async def create_statement_upload(payload: StatementUploadRequest, ctx: AuthContext = Depends(get_current_user)):
    company = await _get_company_for_org(payload.companyId, ctx.org_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    statement_id = _new_id("stmt")
    ext = payload.filename.split(".")[-1].lower() if "." in payload.filename else "pdf"
    source_key = f"statements/{payload.companyId}/{statement_id}/source.{ext}"
    now = now_unix()

    await db.execute(
        """
        INSERT INTO statements (
          id, company_id, uploaded_by_user_id, filename, source_r2_key,
          result_r2_key, status, bank_ledger_name, password_protected,
          extraction_period_from, extraction_period_to, entry_count,
          processing_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, 'UPLOADED', ?, ?, ?, ?, 0, NULL, ?, ?)
        """,
        [
            statement_id,
            payload.companyId,
            ctx.user_id,
            payload.filename,
            source_key,
            payload.bankLedgerName,
            1 if payload.passwordProtected else 0,
            payload.extractionPeriodFrom,
            payload.extractionPeriodTo,
            now,
            now,
        ],
    )

    upload_url = storage.create_upload_url(source_key, payload.contentType)
    return {"statementId": statement_id, "sourceR2Key": source_key, "uploadUrl": upload_url}


@router.put("/api/internal/storage/upload/{upload_token}")
async def local_upload(upload_token: str, request: Request):
    token_data = storage.decode_upload_token(upload_token)
    if not token_data:
        raise HTTPException(status_code=401, detail="Invalid upload token")

    body = await request.body()
    storage.put_bytes(token_data["key"], body, content_type=token_data["content_type"])
    return {"ok": True}


@router.post("/api/statements/{statement_id}/process")
async def process_statement_route(
    statement_id: str,
    payload: StatementProcessRequest,
    background_tasks: BackgroundTasks,
    ctx: AuthContext = Depends(get_current_user),
):
    row = await db.one(
        """
        SELECT s.* FROM statements s
        JOIN companies c ON c.id = s.company_id
        WHERE s.id = ? AND c.organization_id = ?
        LIMIT 1
        """,
        [statement_id, ctx.org_id],
    )

    if not row:
        raise HTTPException(status_code=404, detail="Statement not found")

    if row["status"] == "PROCESSING":
        raise HTTPException(status_code=409, detail="Already processing")

    if row["status"] not in {"UPLOADED", "FAILED", "ARCHIVED"}:
        raise HTTPException(status_code=400, detail="Statement cannot be processed in this state")

    file_password = payload.filePassword.strip() if payload.filePassword else None
    if _to_bool(row.get("password_protected")) and not file_password:
        raise HTTPException(status_code=400, detail="PDF password is required for this file")

    extraction_period_to = row.get("extraction_period_to")
    if not extraction_period_to:
        extraction_period_to = datetime.utcnow().date().isoformat()

    await db.execute(
        """
        UPDATE statements
        SET status = 'PROCESSING', extraction_period_to = ?, processing_error = NULL, updated_at = ?
        WHERE id = ?
        """,
        [extraction_period_to, now_unix(), statement_id],
    )

    row["extraction_period_to"] = extraction_period_to
    row["status"] = "PROCESSING"

    background_tasks.add_task(_run_processing_background, row, file_password)
    return {"ok": True}


@router.patch("/api/statements/{statement_id}")
async def patch_statement(
    statement_id: str,
    payload: StatementPatchRequest,
    ctx: AuthContext = Depends(get_current_user),
):
    row = await db.one(
        """
        SELECT s.id FROM statements s
        JOIN companies c ON c.id = s.company_id
        WHERE s.id = ? AND c.organization_id = ?
        LIMIT 1
        """,
        [statement_id, ctx.org_id],
    )
    if not row:
        raise HTTPException(status_code=404, detail="Statement not found")

    if payload.bankLedgerName is not None:
        await db.execute(
            "UPDATE statements SET bank_ledger_name = ?, updated_at = ? WHERE id = ?",
            [payload.bankLedgerName or None, now_unix(), statement_id],
        )

    return {"ok": True}


@router.post("/api/internal/statements/{statement_id}/processed")
async def worker_processed_statement(
    statement_id: str,
    payload: ProcessedWebhookPayload,
    x_worker_secret: str | None = Header(default=None, alias="x-worker-secret"),
):
    if x_worker_secret != settings.worker_webhook_secret:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if payload.statementId != statement_id:
        raise HTTPException(status_code=400, detail="Statement mismatch")

    await _mark_statement_processed(
        statement_id,
        {
            "result_r2_key": payload.resultR2Key,
            "entry_count": payload.entryCount,
            "status": payload.status,
            "processing_error": payload.processingError,
        },
    )
    return {"ok": True}


@router.get("/api/statements/{statement_id}/entries")
async def get_statement_entries(statement_id: str, ctx: AuthContext = Depends(get_current_user)):
    row = await db.one(
        """
        SELECT s.result_r2_key FROM statements s
        JOIN companies c ON c.id = s.company_id
        WHERE s.id = ? AND c.organization_id = ?
        LIMIT 1
        """,
        [statement_id, ctx.org_id],
    )

    if not row or not row.get("result_r2_key"):
        raise HTTPException(status_code=404, detail="Result not ready")

    try:
        data = storage.get_json(row["result_r2_key"])
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Result not ready")
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch statement data")

    return data


@router.put("/api/statements/{statement_id}/entries")
async def put_statement_entries(
    statement_id: str,
    payload: EntriesPutRequest,
    ctx: AuthContext = Depends(get_current_user),
):
    row = await db.one(
        """
        SELECT s.result_r2_key FROM statements s
        JOIN companies c ON c.id = s.company_id
        WHERE s.id = ? AND c.organization_id = ?
        LIMIT 1
        """,
        [statement_id, ctx.org_id],
    )

    if not row or not row.get("result_r2_key"):
        raise HTTPException(status_code=404, detail="Statement not found")

    key = row["result_r2_key"]
    existing: dict[str, Any]
    try:
        data = storage.get_json(key)
        existing = data if isinstance(data, dict) else {}
    except Exception:
        existing = {}

    updated = {
        **existing,
        "extraction_model": payload.extractionModel or existing.get("extraction_model") or "manual-review",
        "extracted_at": existing.get("extracted_at") or datetime.utcnow().isoformat(),
        "entries": payload.entries,
    }
    storage.put_json(key, updated)
    return {"ok": True}


@router.post("/api/statements/{statement_id}/archive")
async def archive_statement(
    statement_id: str,
    payload: StatementArchiveRequest,
    ctx: AuthContext = Depends(get_current_user),
):
    row = await db.one(
        """
        SELECT s.id, s.status
        FROM statements s
        JOIN companies c ON c.id = s.company_id
        WHERE s.id = ? AND c.organization_id = ?
        LIMIT 1
        """,
        [statement_id, ctx.org_id],
    )
    if not row:
        raise HTTPException(status_code=404, detail="Statement not found")

    if row["status"] == "PROCESSING":
        raise HTTPException(status_code=400, detail="Cannot archive while processing")

    next_status = "ARCHIVED" if payload.archived else "REVIEW"
    await db.execute(
        "UPDATE statements SET status = ?, updated_at = ? WHERE id = ?",
        [next_status, now_unix(), statement_id],
    )
    return {"ok": True}


@router.delete("/api/statements/{statement_id}/archive")
async def delete_statement(statement_id: str, ctx: AuthContext = Depends(get_current_user)):
    row = await db.one(
        """
        SELECT s.id, s.status
        FROM statements s
        JOIN companies c ON c.id = s.company_id
        WHERE s.id = ? AND c.organization_id = ?
        LIMIT 1
        """,
        [statement_id, ctx.org_id],
    )
    if not row:
        raise HTTPException(status_code=404, detail="Statement not found")

    if row["status"] == "PROCESSING":
        raise HTTPException(status_code=400, detail="Cannot delete while processing")

    await db.execute(
        "UPDATE statements SET status = 'DELETED', updated_at = ? WHERE id = ?",
        [now_unix(), statement_id],
    )
    return {"ok": True}


@router.get("/api/statements/{statement_id}/preview")
async def statement_preview(statement_id: str, ctx: AuthContext = Depends(get_current_user)):
    row = await db.one(
        """
        SELECT s.*
        FROM statements s
        JOIN companies c ON c.id = s.company_id
        WHERE s.id = ? AND c.organization_id = ?
        LIMIT 1
        """,
        [statement_id, ctx.org_id],
    )
    if not row:
        raise HTTPException(status_code=404, detail="Statement not found")
    return _statement_to_api(row)


@router.get("/api/statements/{statement_id}/review-context")
async def statement_review_context(statement_id: str, ctx: AuthContext = Depends(get_current_user)):
    stmt = await db.one(
        """
        SELECT s.*, c.name AS company_name, c.tally_company_name, c.tally_company_remote_id
        FROM statements s
        JOIN companies c ON c.id = s.company_id
        WHERE s.id = ? AND c.organization_id = ?
        LIMIT 1
        """,
        [statement_id, ctx.org_id],
    )
    if not stmt:
        raise HTTPException(status_code=404, detail="Statement not found")

    company_id = stmt["company_id"]

    non_bank = await db.query(
        """
        SELECT name FROM tally_masters
        WHERE company_id = ? AND type = 'LEDGER' AND is_active = 1 AND source_parent <> ?
        ORDER BY name ASC
        """,
        [company_id, BANK_PARENT],
    )

    if non_bank:
        ledger_rows = non_bank
    else:
        if stmt.get("bank_ledger_name"):
            ledger_rows = await db.query(
                """
                SELECT name FROM tally_masters
                WHERE company_id = ? AND type = 'LEDGER' AND is_active = 1 AND name <> ?
                ORDER BY name ASC
                """,
                [company_id, stmt.get("bank_ledger_name")],
            )
        else:
            ledger_rows = await db.query(
                """
                SELECT name FROM tally_masters
                WHERE company_id = ? AND type = 'LEDGER' AND is_active = 1
                ORDER BY name ASC
                """,
                [company_id],
            )

    voucher_rows = await db.query(
        """
        SELECT name FROM tally_masters
        WHERE company_id = ? AND type = 'VOUCHER_TYPE' AND is_active = 1
        """,
        [company_id],
    )

    voucher_names = {str(v["name"]).strip().upper() for v in voucher_rows}
    matched = [v for v in CANONICAL_VOUCHERS if v.strip().upper() in voucher_names]
    voucher_types = matched if matched else CANONICAL_VOUCHERS

    entries: list[dict[str, Any]] = []
    if stmt.get("result_r2_key"):
        try:
            data = storage.get_json(stmt["result_r2_key"])
            if isinstance(data, dict) and isinstance(data.get("entries"), list):
                entries = data["entries"]
        except Exception:
            entries = []

    return {
        "statement": _statement_to_api(stmt),
        "companyName": stmt.get("tally_company_name") or stmt.get("company_name") or "",
        "tallyRemoteId": stmt.get("tally_company_remote_id") or "",
        "ledgers": [row["name"] for row in ledger_rows],
        "voucherTypes": voucher_types,
        "entries": entries,
    }


@router.post("/api/connector/discovery")
async def connector_discovery_upsert(
    payload: DiscoveryRequest,
    x_connector_token: str | None = Header(default=None, alias="x-connector-token"),
):
    _token_auth(x_connector_token)

    now = now_unix()
    for item in payload.companies:
        remote_id = item.remoteId or item.guid or item.name
        await db.execute(
            """
            INSERT INTO tally_discovery (
              id, organization_id, tally_company_name, tally_company_remote_id, last_seen_at
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(organization_id, tally_company_remote_id)
            DO UPDATE SET tally_company_name = excluded.tally_company_name, last_seen_at = excluded.last_seen_at
            """,
            [_new_id("td"), payload.organizationId, item.name, remote_id, now],
        )

    return {"ok": True, "count": len(payload.companies)}


@router.get("/api/connector/discovery")
async def connector_discovery_list(_ctx: AuthContext = Depends(get_current_user)):
    rows = await db.query(
        "SELECT * FROM tally_discovery ORDER BY last_seen_at DESC",
        [],
    )

    return [
        {
            "id": row["id"],
            "organizationId": row["organization_id"],
            "tallyCompanyName": row["tally_company_name"],
            "tallyCompanyRemoteId": row["tally_company_remote_id"],
            "lastSeenAt": row["last_seen_at"],
        }
        for row in rows
    ]


@router.get("/api/connector/mapped-companies")
async def mapped_companies(
    x_connector_token: str | None = Header(default=None, alias="x-connector-token"),
):
    _token_auth(x_connector_token)

    rows = await db.query(
        "SELECT tally_company_remote_id FROM companies WHERE tally_company_remote_id IS NOT NULL",
        [],
    )
    remote_ids = [row["tally_company_remote_id"] for row in rows if row.get("tally_company_remote_id")]
    return {"mappedRemoteIds": remote_ids}


@router.post("/api/connector/sync")
async def trigger_connector_sync(payload: DashboardSyncTriggerRequest, ctx: AuthContext = Depends(get_current_user)):
    company = await _get_company_for_org(payload.companyId, ctx.org_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    if not payload.tallyRemoteId:
        raise HTTPException(status_code=400, detail="tallyRemoteId is required")

    sync_id = _new_sync_id()
    sync_status[sync_id] = {
        "status": "PENDING",
        "company_id": payload.companyId,
        "org_id": ctx.org_id,
        "tally_remote_id": payload.tallyRemoteId,
        "created_at": time.time(),
        "result": None,
        "error": None,
    }

    queue = active_connections.get(ctx.org_id)
    if queue:
        await queue.put(
            {
                "type": "SYNC_MASTERS",
                "sync_id": sync_id,
                "company_id": payload.companyId,
                "org_id": ctx.org_id,
                "tally_remote_id": payload.tallyRemoteId,
                "timestamp": datetime.utcnow().isoformat(),
            }
        )

    return {"sync_id": sync_id, "status": "PENDING"}


@router.get("/api/connector/status/{sync_id}")
async def get_sync_status(sync_id: str, _ctx: AuthContext = Depends(get_current_user)):
    entry = sync_status.get(sync_id)
    if not entry:
        return {"status": "NOT_FOUND"}
    return entry


@router.post("/api/connector/sync-masters")
async def connector_sync_masters(
    payload: SyncMastersRequest,
    x_connector_token: str | None = Header(default=None, alias="x-connector-token"),
):
    _token_auth(x_connector_token)

    if len(payload.masters) == 0:
        return {"ok": True, "count": 0}

    company = await db.one(
        "SELECT * FROM companies WHERE tally_company_remote_id = ? LIMIT 1",
        [payload.tallyCompanyRemoteId],
    )
    if not company:
        raise HTTPException(status_code=404, detail="No mapped company found for this Tally ID")

    now = now_unix()

    for master in payload.masters:
        ledger_kind = _classify_ledger_kind(master)
        source_parent = _clean_tally_text(master.parent) if master.type == "LEDGER" else None
        source_is_deemed_positive = master.isDeemedPositive if master.type == "LEDGER" else None

        await db.execute(
            """
            INSERT INTO tally_masters (
              id, company_id, type, name, normalized_name,
              ledger_kind, source_parent, source_is_deemed_positive,
              is_active, source_updated_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
            ON CONFLICT(company_id, type, normalized_name)
            DO UPDATE SET
              name = excluded.name,
              ledger_kind = excluded.ledger_kind,
              source_parent = excluded.source_parent,
              source_is_deemed_positive = excluded.source_is_deemed_positive,
              is_active = 1,
              source_updated_at = excluded.source_updated_at,
              updated_at = excluded.updated_at
            """,
            [
                _new_id("tm"),
                company["id"],
                master.type,
                master.name,
                _normalize_name(master.name),
                ledger_kind,
                source_parent,
                source_is_deemed_positive,
                now,
                now,
                now,
            ],
        )

    await db.execute(
        """
        UPDATE tally_masters
        SET is_active = 0, updated_at = ?
        WHERE company_id = ? AND (source_updated_at IS NULL OR source_updated_at < ?)
        """,
        [now, company["id"], now],
    )

    await db.execute(
        "UPDATE companies SET connector_last_synced_at = ?, updated_at = ? WHERE id = ?",
        [now, now, company["id"]],
    )

    return {"ok": True, "count": len(payload.masters)}


@router.get("/api/connector/statements/{statement_id}/resolved")
async def connector_resolved_statement(
    statement_id: str,
    x_connector_token: str | None = Header(default=None, alias="x-connector-token"),
):
    _token_auth(x_connector_token)

    row = await db.one("SELECT result_r2_key FROM statements WHERE id = ? LIMIT 1", [statement_id])
    if not row or not row.get("result_r2_key"):
        raise HTTPException(status_code=404, detail="Resolved statement not found")

    try:
        data = storage.get_json(row["result_r2_key"])
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Resolved statement not found")

    return data


@router.get("/v1/connector/events")
async def connector_events(
    x_connector_token: str = Header(..., alias="x-connector-token"),
    x_connector_id: str = Header(..., alias="x-connector-id"),
    x_org_id: str = Header(..., alias="x-org-id"),
):
    _token_auth(x_connector_token)

    queue: asyncio.Queue = asyncio.Queue()
    active_connections[x_org_id] = queue

    async def event_generator():
        try:
            yield f"data: {json.dumps({'type': 'CONNECTED', 'connector_id': x_connector_id})}\n\n"
            yield f"data: {json.dumps({'type': 'DISCOVER_COMPANIES'})}\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'type': 'HEARTBEAT'})}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            active_connections.pop(x_org_id, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/v1/connector/sync-masters")
async def trigger_sync_masters_legacy(payload: SyncMastersTriggerRequest):
    sync_id = _new_sync_id()
    sync_status[sync_id] = {
        "status": "PENDING",
        "company_id": payload.company_id,
        "org_id": payload.org_id,
        "tally_remote_id": payload.tally_remote_id,
        "created_at": time.time(),
        "result": None,
        "error": None,
    }

    queue = active_connections.get(payload.org_id)
    if queue:
        await queue.put(
            {
                "type": "SYNC_MASTERS",
                "sync_id": sync_id,
                "company_id": payload.company_id,
                "org_id": payload.org_id,
                "tally_remote_id": payload.tally_remote_id,
                "timestamp": datetime.utcnow().isoformat(),
            }
        )

    return {"sync_id": sync_id, "status": "PENDING"}


@router.get("/v1/connector/status/{sync_id}")
async def sync_status_legacy(sync_id: str):
    entry = sync_status.get(sync_id)
    if not entry:
        return {"status": "NOT_FOUND"}
    return entry


@router.post("/v1/connector/complete")
async def connector_complete(
    payload: ConnectorCompleteRequest,
    x_connector_token: str = Header(..., alias="x-connector-token"),
):
    _token_auth(x_connector_token)

    entry = sync_status.get(payload.sync_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Sync ID not found")

    entry["status"] = "COMPLETED" if payload.success else "FAILED"
    entry["result"] = payload.result
    entry["error"] = payload.error
    entry["completed_at"] = time.time()

    return {"ok": True}


@router.post("/v1/process-statement")
async def process_statement_legacy(payload: ProcessStatementRequest):
    return await process_statement(payload)
