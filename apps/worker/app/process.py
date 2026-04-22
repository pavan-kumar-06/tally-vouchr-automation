from __future__ import annotations

import io
from datetime import datetime

import pdfplumber

from app.config import settings
from app.gemini import extract_transactions
from app.schemas import ProcessStatementRequest, ProcessStatementResponse, StatementEntry, StatementJson
from app.storage import storage

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
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)

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


async def process_statement(request: ProcessStatementRequest) -> ProcessStatementResponse:
    print(f"[worker] Starting processing for statement: {request.statement_id}")
    result_key = f"statements/{request.company_id}/{request.statement_id}/extracted.json"

    try:
        print(f"[worker] Reading source file: {request.source_r2_key}")
        source_bytes = storage.get_bytes(request.source_r2_key)

        print("[worker] Extracting text from PDF...")
        statement_text = extract_pdf_text(source_bytes, password=request.file_password)

        print("[worker] Sending text to OpenRouter AI for extraction...")
        raw_transactions = extract_transactions(
            statement_text=statement_text,
            period_from=request.extraction_period_from,
            period_to=request.extraction_period_to,
        )

        entries = normalize_transactions(raw_transactions)

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

        storage.put_json(result_key, payload.model_dump(mode="json"))

        return ProcessStatementResponse(
            statement_id=request.statement_id,
            result_r2_key=result_key,
            entry_count=len(entries),
            status="REVIEW",
        )
    except Exception as exc:
        print(f"[worker] ERROR processing statement {request.statement_id}: {str(exc)}")
        return ProcessStatementResponse(
            statement_id=request.statement_id,
            result_r2_key=result_key,
            entry_count=0,
            status="FAILED",
            processing_error=str(exc),
        )
