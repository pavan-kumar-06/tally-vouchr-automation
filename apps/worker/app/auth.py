"""
JWT-based auth for Vouchr Python BE.
- Issues JWTs on login/link-session
- Validates JWTs on all protected endpoints
- Refresh tokens for silent re-auth
"""
import jwt
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal
from app.config import settings

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRY_MINUTES = 15
REFRESH_TOKEN_EXPIRY_DAYS = 7


def _get_secret() -> str:
    return settings.jwt_secret


def create_access_token(
    user_id: str,
    email: str,
    org_id: str,
    role: str = "user",
) -> str:
    """Create a short-lived access JWT (15 min)."""
    payload = {
        "sub": user_id,
        "email": email,
        "org_id": org_id,
        "role": role,
        "type": "access",
        "iat": int(time.time()),
        "exp": int(time.time()) + ACCESS_TOKEN_EXPIRY_MINUTES * 60,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, _get_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    """Create a long-lived refresh JWT (7 days)."""
    payload = {
        "sub": user_id,
        "type": "refresh",
        "iat": int(time.time()),
        "exp": int(time.time()) + REFRESH_TOKEN_EXPIRY_DAYS * 86400,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, _get_secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    """Decode and validate a JWT. Returns payload or None if invalid/expired."""
    try:
        return jwt.decode(token, _get_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def create_token_pair(
    user_id: str,
    email: str,
    org_id: str,
    role: str = "user",
) -> tuple[str, str]:
    """Create both access + refresh tokens."""
    access = create_access_token(user_id, email, org_id, role)
    refresh = create_refresh_token(user_id)
    return access, refresh


def set_jwt_cookies(
    response,
    access_token: str,
    refresh_token: str,
    domain: str = "",  # empty = no domain attr (dev), ".my-ai.in" for production
    secure: bool = False,
):
    """
    Attach JWT cookies to a response object (FastAPI/Starlette).

    - local dev: domain="", no Domain attr set, works on localhost
    - production: domain=".my-ai.in", works across accountant.my-ai.in / aiaccountantbe.my-ai.in
    """
    cookie_kwargs = {
        "secure": secure,
        "httponly": True,
        "samesite": "Lax",
    }
    if domain:
        cookie_kwargs["domain"] = domain

    response.set_cookie(
        key="vouchr_access",
        value=access_token,
        max_age=ACCESS_TOKEN_EXPIRY_MINUTES * 60,
        **cookie_kwargs,
    )
    response.set_cookie(
        key="vouchr_refresh",
        value=refresh_token,
        max_age=REFRESH_TOKEN_EXPIRY_DAYS * 86400,
        **cookie_kwargs,
    )


def clear_jwt_cookies(response, domain: str = "", secure: bool = False):
    """Clear both JWT cookies on logout."""
    kwargs = {"secure": secure, "httponly": True, "samesite": "Lax"}
    if domain:
        kwargs["domain"] = domain
    response.delete_cookie(key="vouchr_access", **kwargs)
    response.delete_cookie(key="vouchr_refresh", **kwargs)
