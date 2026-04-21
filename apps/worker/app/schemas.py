from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ProcessStatementRequest(BaseModel):
    statement_id: str
    company_id: str
    filename: str
    source_r2_key: str
    bank_ledger_name: str | None = None
    extraction_period_from: str | None = None
    extraction_period_to: str | None = None
    file_password: str | None = None


class StatementEntry(BaseModel):
    row_id: str
    date: str
    narration: str
    amount: float = Field(gt=0)
    type: Literal["DEBIT", "CREDIT"]
    voucher_type: Literal["Payment", "Receipt", "Contra"]
    is_contra: bool = False
    ledger_name: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    raw_reference: str | None = None


class StatementJson(BaseModel):
    statement_id: str
    company_id: str
    source_file_name: str
    bank_ledger_name: str | None = None
    period_start: str | None = None
    period_end: str | None = None
    currency: str = "INR"
    extraction_model: str
    extracted_at: datetime
    entries: list[StatementEntry]


class ProcessStatementResponse(BaseModel):
    statement_id: str
    result_r2_key: str
    entry_count: int
    status: Literal["REVIEW", "FAILED"]
    processing_error: str | None = None
