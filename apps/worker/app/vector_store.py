"""
zvec vector store for transaction-to-ledger mapping.

Uses zvec (in-process vector DB by Alibaba) for storing ledger embeddings
and Gemini-text-embedding for generating embeddings.
"""

from __future__ import annotations

import os
import re
import json
from pathlib import Path
from typing import Any

import numpy as np

from app.config import settings

# Lazy-import zvec to avoid hard crash if not installed
_zvec = None

def _get_zvec():
    global _zvec
    if _zvec is None:
        import zvec as _z
        _zvec = _z
    return _zvec


LEDGER_DIM = 768  # Gemini text-embedding-001 output dimension


class VectorStore:
    """
    In-process vector store for ledger embeddings.

    Each company has its own zvec collection so embeddings are isolated.
    We store one entry per ledger (user + company + ledger_name → vector).
    """

    def __init__(self, company_id: str):
        self.company_id = company_id
        self.zvec_dir = Path(getattr(settings, "local_storage_path", "./.local-objects")) / "zvec"
        self.zvec_dir.mkdir(parents=True, exist_ok=True)

        db_path = str(self.zvec_dir / f"{company_id}.zvec")
        z = _get_zvec()

        schema = z.CollectionSchema(
            name=company_id,
            vectors=z.VectorSchema("embedding", z.DataType.VECTOR_FP32, LEDGER_DIM),
        )
        try:
            self._collection = z.create_and_open(path=db_path, schema=schema)
        except Exception:
            # Already exists — open it
            self._collection = z.open(path=db_path)

    def insert_ledger(self, ledger_name: str, vector: list[float]) -> None:
        """Insert or upsert a ledger embedding."""
        # zvec doc_id must be alphanumeric + underscore only; slugify ledger name
        safe_name = re.sub(r"[^a-zA-Z0-9_]", "_", ledger_name)
        doc_id = f"ledger_{safe_name}"
        try:
            self._collection.insert([
                _get_zvec().Doc(id=doc_id, vectors={"embedding": vector})
            ])
        except Exception:
            # Upsert: delete then re-insert
            self._collection.delete(doc_id)
            self._collection.insert([
                _get_zvec().Doc(id=doc_id, vectors={"embedding": vector})
            ])

    def search_similar_ledgers(
        self, query_vector: list[float], *, topk: int = 5
    ) -> list[dict[str, Any]]:
        """Search for most similar ledgers to a transaction embedding."""
        results = self._collection.query(
            _get_zvec().VectorQuery("embedding", vector=query_vector),
            topk=topk,
        )
        parsed = []
        for r in results:
            doc_id = r.id
            score = r.score
            if doc_id.startswith("ledger_"):
                ledger_name = doc_id.replace("ledger_", "")
            else:
                ledger_name = doc_id
            parsed.append({
                "ledger_name": ledger_name,
                "score": score,
            })
        return parsed

    def count(self) -> int:
        """Return number of ledgers indexed for this company."""
        return self._collection.stats.doc_count


def get_store(company_id: str) -> VectorStore:
    """Factory to get a VectorStore for a company."""
    return VectorStore(company_id)
