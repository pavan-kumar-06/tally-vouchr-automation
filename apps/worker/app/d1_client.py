from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

import httpx

from app.config import settings


class D1Client:
    """Cloudflare D1 API client with local SQLite fallback for development/testing."""

    def __init__(self) -> None:
        self.use_remote = bool(
            settings.cloudflare_account_id
            and settings.cloudflare_database_id
            and settings.cloudflare_api_token
        )

        if self.use_remote:
            self.base_url = (
                f"https://api.cloudflare.com/client/v4/accounts/{settings.cloudflare_account_id}"
                f"/d1/database/{settings.cloudflare_database_id}"
            )
            self.headers = {
                "Authorization": f"Bearer {settings.cloudflare_api_token}",
                "Content-Type": "application/json",
            }
        else:
            self.local_db_path = Path(settings.local_db_path).expanduser().resolve()
            self.local_db_path.parent.mkdir(parents=True, exist_ok=True)

    async def query(self, sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
        if self.use_remote:
            payload = {"sql": sql, "params": params or []}
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(f"{self.base_url}/query", headers=self.headers, json=payload)
                resp.raise_for_status()
                data = resp.json()

            if not data.get("success"):
                raise RuntimeError(f"D1 query failed: {data.get('errors')}")

            result = (data.get("result") or [{}])[0]
            if not result.get("success"):
                raise RuntimeError(f"D1 query result unsuccessful: {result}")

            rows = result.get("results") or []
            if isinstance(rows, list):
                return [dict(row) for row in rows]
            return []

        return self._local_query(sql, params or [])

    async def execute(self, sql: str, params: list[Any] | None = None) -> None:
        await self.query(sql, params)

    async def one(self, sql: str, params: list[Any] | None = None) -> dict[str, Any] | None:
        rows = await self.query(sql, params)
        return rows[0] if rows else None

    def _local_query(self, sql: str, params: list[Any]) -> list[dict[str, Any]]:
        with sqlite3.connect(self.local_db_path) as conn:
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON")
            cursor = conn.execute(sql, params)

            rows: list[dict[str, Any]] = []
            if cursor.description is not None:
                rows = [dict(row) for row in cursor.fetchall()]

            conn.commit()
            return rows
