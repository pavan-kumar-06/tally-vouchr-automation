from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio
import json
import uuid
import time
from datetime import datetime

from app.middleware import JWTMiddleware
from app.auth_routes import router as auth_router
from app.config import settings
from app.process import process_statement
from app.schemas import ProcessStatementRequest, ProcessStatementResponse

app = FastAPI(title="Vouchr Worker", version="0.1.0")

# ── CORS ──────────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://accountant.my-ai.in",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── JWT Auth middleware ─────────────────────────────────────────────────────────
app.add_middleware(JWTMiddleware)

# ── Auth routes (public — no JWT required) ────────────────────────────────────
app.include_router(auth_router)

# ── In-memory state ────────────────────────────────────────────────────────────
active_connections: dict[str, asyncio.Queue] = {}
sync_status: dict[str, dict] = {}


def _token_auth(token: str) -> None:
    if token != settings.connector_shared_token:
        raise HTTPException(status_code=401, detail="Invalid connector token")


def _new_sync_id() -> str:
    return f"sync_{uuid.uuid4().hex[:12]}"


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True}


# ── Protected routes ───────────────────────────────────────────────────────────

@app.post("/v1/process-statement", response_model=ProcessStatementResponse)
async def process_statement_route(payload: ProcessStatementRequest, request: Request):
    """Process a bank statement PDF. Requires JWT auth."""
    return await process_statement(payload)


@app.get("/v1/connector/events")
async def connector_events(
    x_connector_token: str = Header(..., alias="x-connector-token"),
    x_connector_id: str = Header(..., alias="x-connector-id"),
    x_org_id: str = Header(..., alias="x-org-id"),
):
    """SSE stream. Connector connects once per org."""
    _token_auth(x_connector_token)

    queue: asyncio.Queue = asyncio.Queue()
    active_connections[x_org_id] = queue

    print(f"[connector] SSE connected: connector_id={x_connector_id}, org_id={x_org_id}")

    async def event_generator():
        try:
            yield f"data: {json.dumps({'type': 'CONNECTED', 'connector_id': x_connector_id})}\n\n"
            # Trigger company discovery on connect
            yield f"data: {json.dumps({'type': 'DISCOVER_COMPANIES'})}\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'type': 'HEARTBEAT'})}\n\n"
        except asyncio.CancelledError:
            print(f"[connector] SSE disconnected: org_id={x_org_id}")
        finally:
            active_connections.pop(x_org_id, None)

    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


class SyncMastersRequest(BaseModel):
    company_id: str
    org_id: str
    tally_remote_id: str


@app.post("/v1/connector/sync-masters")
async def sync_masters(payload: SyncMastersRequest):
    """Trigger masters sync. Connector SSE must be connected."""
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

    print(f"[sync-masters] sync_id={sync_id}, company_id={payload.company_id}, org_id={payload.org_id}")

    queue = active_connections.get(payload.org_id)
    if queue:
        await queue.put({
            "type": "SYNC_MASTERS",
            "sync_id": sync_id,
            "company_id": payload.company_id,
            "org_id": payload.org_id,
            "tally_remote_id": payload.tally_remote_id,
            "timestamp": datetime.utcnow().isoformat(),
        })
        print(f"[sync-masters] Pushed to connector for org_id={payload.org_id}")
    else:
        print(f"[sync-masters] No active connector for org_id={payload.org_id}")

    return {"sync_id": sync_id, "status": "PENDING"}


@app.get("/v1/connector/status/{sync_id}")
async def sync_status_endpoint(sync_id: str):
    entry = sync_status.get(sync_id)
    if not entry:
        return {"status": "NOT_FOUND"}
    return entry


class ConnectorCompleteRequest(BaseModel):
    sync_id: str
    success: bool
    result: dict | None = None
    error: str | None = None


@app.post("/v1/connector/complete")
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

    print(f"[connector/complete] sync_id={payload.sync_id}, success={payload.success}")

    return {"ok": True}
