from __future__ import annotations

import hashlib
import secrets
import time
import uuid
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.config import settings

JWT_ALGORITHM = "HS256"
ACCESS_COOKIE_NAME = "vouchr_access"
REFRESH_COOKIE_NAME = "vouchr_refresh"

_password_hasher = PasswordHasher()


def now_unix() -> int:
    return int(time.time())


def now_ms() -> int:
    return int(time.time() * 1000)


def _get_secret() -> str:
    return settings.jwt_secret


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, hashed_password: str | None) -> bool:
    if not hashed_password:
        return False
    try:
        return _password_hasher.verify(hashed_password, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def create_access_token(user_id: str, email: str, org_id: str, role: str = "owner") -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "org_id": org_id,
        "role": role,
        "type": "access",
        "iat": now_unix(),
        "exp": now_unix() + settings.access_token_expiry_minutes * 60,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, _get_secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, _get_secret(), algorithms=[JWT_ALGORITHM])
        if not isinstance(payload, dict):
            return None
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(64)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _cookie_kwargs() -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "secure": settings.cookie_secure,
        "httponly": True,
        "samesite": settings.cookie_samesite,
        "path": "/",
    }
    if settings.cookie_domain:
        kwargs["domain"] = settings.cookie_domain
    return kwargs


def set_auth_cookies(response: Any, access_token: str, refresh_token: str) -> None:
    cookie_kwargs = _cookie_kwargs()
    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        max_age=settings.access_token_expiry_minutes * 60,
        **cookie_kwargs,
    )
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=settings.refresh_token_expiry_days * 86400,
        **cookie_kwargs,
    )


def clear_auth_cookies(response: Any) -> None:
    kwargs = _cookie_kwargs()
    response.delete_cookie(key=ACCESS_COOKIE_NAME, **kwargs)
    response.delete_cookie(key=REFRESH_COOKIE_NAME, **kwargs)
