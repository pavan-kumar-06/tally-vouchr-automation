from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api_routes import router as api_router
from app.auth_routes import router as auth_router
from app.config import settings
from app.middleware import JWTMiddleware

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
