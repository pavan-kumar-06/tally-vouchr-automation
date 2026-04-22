from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api_routes import router as api_router
from app.auth_routes import router as auth_router
from app.config import settings
from app.middleware import JWTMiddleware
from pydantic import BaseModel, Field
import uuid
import time

class WaitlistCreateRequest(BaseModel):
    email: str = Field(min_length=3)
    name: str | None = None
    company: str | None = None
    role: str | None = None

def now_unix() -> int:
    return int(time.time())

app = FastAPI(title="Vouchr API", version="0.2.0")

origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(JWTMiddleware)

# Auth endpoints available on both /auth/* and /api/auth/* for migration safety.
app.include_router(auth_router, prefix="/auth")
app.include_router(auth_router, prefix="/api/auth")

# Business + connector + internal endpoints.
app.include_router(api_router)

@app.post("/api/waitlist")
async def emergency_waitlist_signup(payload: WaitlistCreateRequest):
    """Direct route for waitlist to bypass any router issues."""
    from app.api_routes import db
    try:
        waitlist_id = f"wtl_{uuid.uuid4().hex[:12]}"
        await db.execute(
            "INSERT INTO waitlist (id, email, name, company, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [waitlist_id, payload.email.strip().lower(), payload.name, payload.company, payload.role, now_unix()]
        )
        return {"ok": True}
    except Exception as e:
        if "UNIQUE" in str(e): return {"ok": True} # Already joined
        print(f"Emergency waitlist error: {e}")
        return {"ok": False, "error": str(e)}
