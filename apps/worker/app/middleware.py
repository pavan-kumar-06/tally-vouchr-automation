"""
JWT auth middleware for FastAPI.
Protects all /v1/* routes unless they opt-out with `public=True`.
"""
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from app.auth import decode_token


# Paths that don't require JWT
# SSE connector events use x-connector-token header auth instead
PUBLIC_PATHS = {
    "/health",
    "/auth/signup",
    "/auth/login",
    "/auth/logout",
    "/auth/refresh",
    "/auth/me",
    "/auth/health",
    "/api/auth/signup",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/refresh",
    "/api/auth/me",
    "/api/auth/health",
    "/v1/auth/link-session",
    "/v1/auth/refresh",
    "/v1/auth/logout",
    "/v1/auth/me",
    "/v1/connector/events",
    "/v1/connector/sync-masters",
    "/v1/connector/complete",
    "/v1/connector/status",
}


class JWTMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Skip auth for public paths
        if path in PUBLIC_PATHS or not path.startswith("/v1/"):
            return await call_next(request)

        # Read access token from cookie
        access_token = request.cookies.get("vouchr_access")
        if not access_token:
            return JSONResponse(
                status_code=401,
                content={"error": "Authentication required"},
            )

        payload = decode_token(access_token)
        if not payload:
            return JSONResponse(
                status_code=401,
                content={"error": "Token expired or invalid"},
            )

        # Attach user info to request state
        request.state.user = payload
        request.state.org_id = payload.get("org_id")
        request.state.user_id = payload.get("sub")

        return await call_next(request)
