from fastapi import FastAPI

from app.process import process_statement
from app.schemas import ProcessStatementRequest, ProcessStatementResponse

app = FastAPI(title="Vouchr Worker", version="0.1.0")


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/v1/process-statement", response_model=ProcessStatementResponse)
async def process_statement_route(payload: ProcessStatementRequest):
    return await process_statement(payload)
