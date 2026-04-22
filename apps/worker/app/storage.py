from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import jwt

from app.config import settings
from app.r2_client import get_r2_client


class StorageClient:
    def __init__(self) -> None:
        self.use_r2 = bool(
            settings.r2_account_id
            and settings.r2_access_key_id
            and settings.r2_secret_access_key
            and settings.r2_bucket_name
        )

        if not self.use_r2:
            self.base = Path(settings.local_storage_path).expanduser().resolve()
            self.base.mkdir(parents=True, exist_ok=True)

    def _local_path(self, key: str) -> Path:
        clean = key.strip("/")
        return self.base / clean

    def _upload_token(self, key: str, content_type: str, expires_in: int) -> str:
        payload = {
            "type": "upload",
            "key": key,
            "ct": content_type,
            "exp": int(time.time()) + expires_in,
        }
        return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")

    def decode_upload_token(self, token: str) -> dict[str, str] | None:
        try:
            payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        except jwt.InvalidTokenError:
            return None
        if payload.get("type") != "upload":
            return None
        key = payload.get("key")
        ct = payload.get("ct")
        if not isinstance(key, str) or not isinstance(ct, str):
            return None
        return {"key": key, "content_type": ct}

    def create_upload_url(self, key: str, content_type: str, expires_in: int = 300) -> str:
        if self.use_r2:
            client = get_r2_client()
            return client.generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": settings.r2_bucket_name,
                    "Key": key,
                    "ContentType": content_type,
                },
                ExpiresIn=expires_in,
                HttpMethod="PUT",
            )

        token = self._upload_token(key, content_type, expires_in)
        return f"{settings.api_public_base_url.rstrip('/')}/api/internal/storage/upload/{token}"

    def put_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        if self.use_r2:
            client = get_r2_client()
            client.put_object(
                Bucket=settings.r2_bucket_name,
                Key=key,
                Body=data,
                ContentType=content_type,
            )
            return

        path = self._local_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

        meta_path = path.with_suffix(path.suffix + ".meta.json")
        meta_path.write_text(json.dumps({"content_type": content_type}), encoding="utf-8")

    def get_bytes(self, key: str) -> bytes:
        if self.use_r2:
            client = get_r2_client()
            obj = client.get_object(Bucket=settings.r2_bucket_name, Key=key)
            body = obj.get("Body")
            if body is None:
                raise FileNotFoundError(key)
            return body.read()

        path = self._local_path(key)
        if not path.exists():
            raise FileNotFoundError(key)
        return path.read_bytes()

    def put_json(self, key: str, data: Any) -> None:
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.put_bytes(key, payload, content_type="application/json")

    def get_json(self, key: str) -> Any:
        raw = self.get_bytes(key)
        text = raw.decode("utf-8")
        return json.loads(text)


storage = StorageClient()
