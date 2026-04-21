"""
Auth endpoints: /auth/link-session, /auth/refresh, /auth/logout
All other endpoints are protected by require_jwt middleware.
"""
from fastapi import APIRouter, Request, HTTPException, Response
from pydantic import BaseModel
from app.auth import (
    create_token_pair,
    decode_token,
    set_jwt_cookies,
    clear_jwt_cookies,
    ACCESS_TOKEN_EXPIRY_MINUTES,
)


router = APIRouter(prefix="/auth", tags=["auth"])


class LinkSessionRequest(BaseModel):
    email: str
    user_id: str
    org_id: str
    role: str = "user"


class RefreshRequest(BaseModel):
    pass  # refresh token read from cookie


@router.post("/link-session")
async def link_session(payload: LinkSessionRequest, response: Response):
    """
    Called by Next.js after Better Auth login.
    Issues JWT access + refresh cookies (Domain=.my-ai.in).
    """
    access, refresh = create_token_pair(
        user_id=payload.user_id,
        email=payload.email,
        org_id=payload.org_id,
        role=payload.role,
    )
    set_jwt_cookies(response, access, refresh)
    return {
        "ok": True,
        "email": payload.email,
        "org_id": payload.org_id,
        "expires_in": ACCESS_TOKEN_EXPIRY_MINUTES * 60,
    }


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    """
    Reads refresh token from cookie, validates it,
    and issues new access + refresh tokens.
    """
    refresh_token = request.cookies.get("vouchr_refresh")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")

    payload = decode_token(refresh_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Not a refresh token")

    # Issue new pair
    access, refresh = create_token_pair(
        user_id=payload["sub"],
        email=payload.get("email", ""),
        org_id=payload.get("org_id", ""),
        role=payload.get("role", "user"),
    )
    set_jwt_cookies(response, access, refresh)
    return {"ok": True, "expires_in": ACCESS_TOKEN_EXPIRY_MINUTES * 60}


@router.post("/logout")
async def logout(response: Response):
    """Clear JWT cookies."""
    clear_jwt_cookies(response)
    return {"ok": True}


@router.get("/me")
async def me(request: Request):
    """Return current user info from JWT (for debugging)."""
    access_token = request.cookies.get("vouchr_access")
    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_token(access_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return {
        "user_id": payload.get("sub"),
        "email": payload.get("email"),
        "org_id": payload.get("org_id"),
        "role": payload.get("role"),
    }
