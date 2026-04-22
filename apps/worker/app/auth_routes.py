from __future__ import annotations

import re
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from app.auth import (
    ACCESS_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    clear_auth_cookies,
    create_access_token,
    decode_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    now_unix,
    set_auth_cookies,
    verify_password,
)
from app.config import settings
from app.d1_client import D1Client

router = APIRouter(tags=["auth"])
db = D1Client()


class SignupRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    name: str = Field(min_length=1, max_length=120)
    organization_name: str | None = Field(default=None, max_length=120)


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthContext(BaseModel):
    user_id: str
    email: str
    name: str
    org_id: str
    org_name: str
    role: str


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    slug = slug.strip("-")
    return slug or "org"


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


async def _ensure_legacy_rows(
    user_id: str,
    email: str,
    name: str,
    org_id: str,
    org_name: str,
    org_slug: str,
    role: str,
    created_at: int,
    password_hash: str | None = None,
) -> None:
    # Legacy Better Auth tables stay available during migration.
    await db.execute(
        """
        INSERT OR IGNORE INTO user (id, name, email, email_verified, image, created_at, updated_at)
        VALUES (?, ?, ?, 0, NULL, ?, ?)
        """,
        [user_id, name, email, created_at, created_at],
    )

    await db.execute(
        """
        INSERT OR IGNORE INTO organization (id, name, slug, logo, metadata, created_at)
        VALUES (?, ?, ?, NULL, NULL, ?)
        """,
        [org_id, org_name, org_slug, created_at],
    )

    await db.execute(
        """
        INSERT OR IGNORE INTO member (id, user_id, organization_id, role, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        [_new_id("mem"), user_id, org_id, role, created_at],
    )

    if password_hash:
        await db.execute(
            """
            INSERT OR IGNORE INTO account (
              id, user_id, account_id, provider_id, access_token, refresh_token,
              access_token_expires_at, refresh_token_expires_at, id_token, password, created_at, updated_at
            ) VALUES (?, ?, ?, 'credential', NULL, NULL, NULL, NULL, NULL, ?, ?, ?)
            """,
            [_new_id("acc"), user_id, email, password_hash, created_at, created_at],
        )


async def _issue_session(response: Response, user: dict, membership: dict) -> dict:
    refresh_plain = generate_refresh_token()
    refresh_hash = hash_refresh_token(refresh_plain)
    token_id = _new_id("rt")
    now = now_unix()
    expires_at = now + settings.refresh_token_expiry_days * 86_400

    await db.execute(
        """
        INSERT INTO refresh_tokens (
          id, user_id, organization_id, token_hash, expires_at,
          created_at, updated_at, revoked_at, replaced_by_token_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)
        """,
        [
            token_id,
            user["id"],
            membership["organization_id"],
            refresh_hash,
            expires_at,
            now,
            now,
        ],
    )

    access = create_access_token(
        user_id=user["id"],
        email=user["email"],
        org_id=membership["organization_id"],
        role=membership.get("role") or "owner",
    )
    set_auth_cookies(response, access, refresh_plain)

    return {
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user.get("name") or "",
        },
        "organization": {
            "id": membership["organization_id"],
            "name": membership.get("organization_name") or "",
            "role": membership.get("role") or "owner",
        },
    }


async def _find_primary_membership(user_id: str) -> dict | None:
    return await db.one(
        """
        SELECT m.organization_id, m.role, o.name AS organization_name
        FROM memberships m
        JOIN organizations o ON o.id = m.organization_id
        WHERE m.user_id = ?
        ORDER BY m.created_at ASC
        LIMIT 1
        """,
        [user_id],
    )


async def get_current_user(request: Request) -> AuthContext:
    access_token = request.cookies.get(ACCESS_COOKIE_NAME)
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = decode_token(access_token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired access token")

    user_id = payload.get("sub")
    org_id = payload.get("org_id")
    if not isinstance(user_id, str) or not isinstance(org_id, str):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    row = await db.one(
        """
        SELECT u.id, u.email, u.name, m.organization_id, m.role, o.name AS organization_name
        FROM users u
        JOIN memberships m ON m.user_id = u.id
        JOIN organizations o ON o.id = m.organization_id
        WHERE u.id = ? AND m.organization_id = ?
        LIMIT 1
        """,
        [user_id, org_id],
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Membership not found")

    return AuthContext(
        user_id=row["id"],
        email=row["email"],
        name=row.get("name") or "",
        org_id=row["organization_id"],
        org_name=row.get("organization_name") or "",
        role=row.get("role") or "owner",
    )


@router.post("/signup")
async def signup(payload: SignupRequest, response: Response):
    email = _normalize_email(payload.email)
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email")

    existing = await db.one("SELECT id FROM users WHERE email = ? LIMIT 1", [email])
    if existing:
        raise HTTPException(status_code=409, detail="Email already in use")

    user_id = _new_id("usr")
    org_id = _new_id("org")
    membership_id = _new_id("ms")
    org_name = (payload.organization_name or f"{payload.name}'s Organization").strip()
    org_slug = f"{_slugify(org_name)}-{uuid.uuid4().hex[:8]}"
    password_hash = hash_password(payload.password)
    now = now_unix()

    await db.execute(
        """
        INSERT INTO users (id, email, name, password_hash, email_verified, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
        """,
        [user_id, email, payload.name.strip(), password_hash, now, now],
    )

    await db.execute(
        """
        INSERT INTO organizations (id, name, slug, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        [org_id, org_name, org_slug, now, now],
    )

    await db.execute(
        """
        INSERT INTO memberships (id, user_id, organization_id, role, created_at, updated_at)
        VALUES (?, ?, ?, 'owner', ?, ?)
        """,
        [membership_id, user_id, org_id, now, now],
    )

    await _ensure_legacy_rows(
        user_id=user_id,
        email=email,
        name=payload.name.strip(),
        org_id=org_id,
        org_name=org_name,
        org_slug=org_slug,
        role="owner",
        created_at=now,
        password_hash=password_hash,
    )

    user = {"id": user_id, "email": email, "name": payload.name.strip()}
    membership = {
        "organization_id": org_id,
        "organization_name": org_name,
        "role": "owner",
    }
    session = await _issue_session(response, user, membership)
    return {"ok": True, **session}


@router.post("/login")
async def login(payload: LoginRequest, response: Response):
    email = _normalize_email(payload.email)

    user = await db.one(
        "SELECT id, email, name, password_hash FROM users WHERE email = ? LIMIT 1",
        [email],
    )
    if not user or not verify_password(payload.password, user.get("password_hash")):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    membership = await _find_primary_membership(user["id"])
    if not membership:
        now = now_unix()
        org_id = _new_id("org")
        org_name = f"{(user.get('name') or 'My')} Organization"
        org_slug = f"{_slugify(org_name)}-{uuid.uuid4().hex[:8]}"

        await db.execute(
            """
            INSERT INTO organizations (id, name, slug, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            [org_id, org_name, org_slug, now, now],
        )
        await db.execute(
            """
            INSERT INTO memberships (id, user_id, organization_id, role, created_at, updated_at)
            VALUES (?, ?, ?, 'owner', ?, ?)
            """,
            [_new_id("ms"), user["id"], org_id, now, now],
        )

        await _ensure_legacy_rows(
            user_id=user["id"],
            email=user["email"],
            name=user.get("name") or "",
            org_id=org_id,
            org_name=org_name,
            org_slug=org_slug,
            role="owner",
            created_at=now,
            password_hash=None,
        )

        membership = {
            "organization_id": org_id,
            "organization_name": org_name,
            "role": "owner",
        }

    session = await _issue_session(response, user, membership)
    return {"ok": True, **session}


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")

    token_hash = hash_refresh_token(refresh_token)
    row = await db.one(
        """
        SELECT rt.id, rt.user_id, rt.organization_id, rt.expires_at, rt.revoked_at,
               u.email, u.name,
               m.role,
               o.name AS organization_name
        FROM refresh_tokens rt
        JOIN users u ON u.id = rt.user_id
        LEFT JOIN memberships m ON m.user_id = rt.user_id AND m.organization_id = rt.organization_id
        LEFT JOIN organizations o ON o.id = rt.organization_id
        WHERE rt.token_hash = ?
        LIMIT 1
        """,
        [token_hash],
    )

    now = now_unix()
    if not row or row.get("revoked_at") is not None or int(row.get("expires_at") or 0) <= now:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    new_refresh_plain = generate_refresh_token()
    new_refresh_hash = hash_refresh_token(new_refresh_plain)
    new_token_id = _new_id("rt")
    expires_at = now + settings.refresh_token_expiry_days * 86_400

    await db.execute(
        """
        INSERT INTO refresh_tokens (
          id, user_id, organization_id, token_hash, expires_at,
          created_at, updated_at, revoked_at, replaced_by_token_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)
        """,
        [
            new_token_id,
            row["user_id"],
            row["organization_id"],
            new_refresh_hash,
            expires_at,
            now,
            now,
        ],
    )

    await db.execute(
        """
        UPDATE refresh_tokens
        SET revoked_at = ?, updated_at = ?, replaced_by_token_id = ?
        WHERE id = ?
        """,
        [now, now, new_token_id, row["id"]],
    )

    access = create_access_token(
        user_id=row["user_id"],
        email=row["email"],
        org_id=row["organization_id"],
        role=row.get("role") or "owner",
    )
    set_auth_cookies(response, access, new_refresh_plain)

    return {
        "ok": True,
        "user": {
            "id": row["user_id"],
            "email": row["email"],
            "name": row.get("name") or "",
        },
        "organization": {
            "id": row["organization_id"],
            "name": row.get("organization_name") or "",
            "role": row.get("role") or "owner",
        },
    }


@router.post("/logout")
async def logout(request: Request, response: Response):
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if refresh_token:
        token_hash = hash_refresh_token(refresh_token)
        now = now_unix()
        await db.execute(
            """
            UPDATE refresh_tokens
            SET revoked_at = COALESCE(revoked_at, ?), updated_at = ?
            WHERE token_hash = ?
            """,
            [now, now, token_hash],
        )

    clear_auth_cookies(response)
    return {"ok": True}


@router.get("/me")
async def me(ctx: AuthContext = Depends(get_current_user)):
    return {
        "user": {
            "id": ctx.user_id,
            "email": ctx.email,
            "name": ctx.name,
        },
        "organization": {
            "id": ctx.org_id,
            "name": ctx.org_name,
            "role": ctx.role,
        },
    }


@router.get("/health")
async def auth_health():
    return {"ok": True, "service": "auth"}
