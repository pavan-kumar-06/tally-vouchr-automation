from __future__ import annotations

import io
import json
from datetime import datetime

import httpx
import pdfplumber

from app.config import settings
from app.gemini import extract_transactions
from app.r2_client import get_r2_client
from app.schemas import ProcessStatementRequest, ProcessStatementResponse, StatementEntry, StatementJson


SUPPORTED_DATE_FORMATS = (
    "%Y-%m-%d",
    "%d-%m-%Y",
    "%d/%m/%Y",
    "%d-%m-%y",
    "%d/%m/%y",
)


def normalize_date(value: str) -> str:
    value = value.strip()
    for fmt in SUPPORTED_DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"Unsupported date format: {value}")


def normalize_type(value: str) -> str:
    normalized = value.strip().upper()
    if normalized in {"DEBIT", "DR", "DB"}:
        return "DEBIT"
    if normalized in {"CREDIT", "CR"}:
        return "CREDIT"
    raise ValueError(f"Unsupported transaction type: {value}")


def voucher_from_type(txn_type: str) -> str:
    if txn_type == "DEBIT":
        return "Payment"
    return "Receipt"


def extract_pdf_text(file_bytes: bytes, password: str | None = None) -> str:
    text_parts: list[str] = []

    with pdfplumber.open(io.BytesIO(file_bytes), password=password) as pdf:
        for page in pdf.pages:
            # Extract text with layout preservation
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)

            # Also extract tables for structured bank statement data
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if row:
                        row_text = " | ".join(str(cell) if cell else "" for cell in row)
                        text_parts.append(f"[TABLE_ROW] {row_text}")

    text = "\n".join(text_parts).strip()
    if not text:
        raise ValueError("No extractable text found in PDF. It may be scanned/image-based.")
    return text


def normalize_transactions(raw: list[dict]) -> list[StatementEntry]:
    normalized: list[StatementEntry] = []

    for idx, row in enumerate(raw, start=1):
        try:
            narration = str(row.get("narration", "")).strip()
            amount = float(row.get("amount"))
            tx_type = normalize_type(str(row.get("type", "")))
            date = normalize_date(str(row.get("date", "")))

            if not narration or amount <= 0:
                continue

            normalized.append(
                StatementEntry(
                    row_id=f"tx_{idx:06d}",
                    date=date,
                    narration=narration,
                    amount=round(amount, 2),
                    type=tx_type,
                    voucher_type=voucher_from_type(tx_type),
                    is_contra=False,
                    confidence=0.85,
                    raw_reference=str(row.get("reference") or ""),
                )
            )
        except Exception:
            continue

    return normalized


async def notify_web_app(payload: ProcessStatementResponse):
    url = f"{settings.web_internal_base_url}/api/internal/statements/{payload.statement_id}/processed"
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            url,
            headers={"x-worker-secret": settings.worker_webhook_secret},
            json={
                "statementId": payload.statement_id,
                "resultR2Key": payload.result_r2_key,
                "entryCount": payload.entry_count,
                "status": payload.status,
                "processingError": payload.processing_error,
            },
        )
        response.raise_for_status()


async def process_statement(request: ProcessStatementRequest) -> ProcessStatementResponse:
    print(f"[worker] Starting processing for statement: {request.statement_id}")
    r2 = get_r2_client()
    result_key = f"statements/{request.company_id}/{request.statement_id}/extracted.json"

    try:
        print(f"[worker] Fetching source file from R2: {request.source_r2_key}")
        source_obj = r2.get_object(Bucket=settings.r2_bucket_name, Key=request.source_r2_key)
        source_bytes = source_obj["Body"].read()
        print(f"[worker] Source file fetched. Size: {len(source_bytes)} bytes")

        print("[worker] Extracting text from PDF...")
        statement_text = extract_pdf_text(source_bytes, password=request.file_password)
        print(f"[worker] Text extraction complete. Length: {len(statement_text)} chars")

        # Save extracted text locally for debugging
        debug_path = f"/tmp/extracted_{request.statement_id}.txt"
        with open(debug_path, "w", encoding="utf-8") as f:
            f.write(statement_text)
        print(f"[worker] Saved extracted text to {debug_path}")

        print("[worker] Sending text to OpenRouter AI for extraction...")
        raw_transactions = extract_transactions(
            statement_text=statement_text,
            period_from=request.extraction_period_from,
            period_to=request.extraction_period_to,
        )
        print(f"[worker] OpenRouter returned {len(raw_transactions)} raw transactions")

        print("[worker] Normalizing transactions...")
        entries = normalize_transactions(raw_transactions)
        print(f"[worker] Normalization complete. {len(entries)} valid transactions found")

        payload = StatementJson(
            statement_id=request.statement_id,
            company_id=request.company_id,
            source_file_name=request.filename,
            bank_ledger_name=request.bank_ledger_name,
            period_start=request.extraction_period_from,
            period_end=request.extraction_period_to,
            extraction_model=settings.openrouter_model,
            extracted_at=datetime.utcnow(),
            entries=entries,
        )

        print(f"[worker] Saving extracted JSON to R2: {result_key}")
        r2.put_object(
            Bucket=settings.r2_bucket_name,
            Key=result_key,
            Body=json.dumps(payload.model_dump(mode="json"), ensure_ascii=False).encode("utf-8"),
            ContentType="application/json",
        )

        response_payload = ProcessStatementResponse(
            statement_id=request.statement_id,
            result_r2_key=result_key,
            entry_count=len(entries),
            status="REVIEW",
        )
        print(f"[worker] Successfully processed statement: {request.statement_id}")
    except Exception as exc:
        print(f"[worker] ERROR processing statement {request.statement_id}: {str(exc)}")
        response_payload = ProcessStatementResponse(
            statement_id=request.statement_id,
            result_r2_key=result_key,
            entry_count=0,
            status="FAILED",
            processing_error=str(exc),
        )

    print(f"[worker] Notifying web app callback for {request.statement_id}...")
    try:
        await notify_web_app(response_payload)
        print(f"[worker] Web app notified successfully")
    except Exception as notify_exc:
        print(f"[worker] FAILED to notify web app: {str(notify_exc)}")

    return response_payload
