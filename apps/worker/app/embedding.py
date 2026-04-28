"""
Embedding utilities using Google Gemini.

Provides text → embedding vector conversion using Gemini's embedding API.
Used to generate vectors for ledgers and transaction narrations.
"""

from __future__ import annotations

import json
from typing import Any

import numpy as np

from app.config import settings

# Gemini embedding output dimension
GEMINI_EMBEDDING_DIM = 768


def get_gemini_embedding_model():
    """Lazy-load Gemini client."""
    import google.genai as genai
    genai_client = genai.Client(api_key=settings.gemini_api_key)
    return genai_client


def embed_text(text: str) -> list[float]:
    """
    Generate an embedding vector for the given text using Gemini.

    Returns a list of floats of dimension GEMINI_EMBEDDING_DIM.
    """
    client = get_gemini_embedding_model()
    response = client.models.embed_content(
        model="gemini-embedding-exp",
        contents=text,
    )
    # response.embedding is a dict with 'values' key
    embedding_values = response.embedding.get("values", [])
    return embedding_values


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Batch embed multiple texts."""
    client = get_gemini_embedding_model()
    response = client.models.embed_content(
        model="gemini-embedding-exp",
        contents=texts,
    )
    embeddings = []
    for emb in response.embeddings:
        embeddings.append(emb.get("values", []))
    return embeddings


def embed_ledger(ledger_name: str, ledger_description: str = "") -> list[float]:
    """
    Generate an embedding for a ledger.

    Combines ledger name and optional description to create a
    semantically rich embedding that captures the ledger's purpose.
    """
    combined = f"Ledger: {ledger_name}. Description: {ledger_description or ledger_name}"
    return embed_text(combined)


def embed_transaction(narration: str, amount: float, txn_type: str) -> list[float]:
    """
    Generate an embedding for a transaction.

    Combines narration + amount + type to create a transaction fingerprint
    that can be matched against ledger embeddings.
    """
    text = f"Transaction type: {txn_type}. Amount: {amount:.2f}. Description: {narration}"
    return embed_text(text)


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    a_np = np.array(a)
    b_np = np.array(b)
    dot = np.dot(a_np, b_np)
    norm_a = np.linalg.norm(a_np)
    norm_b = np.linalg.norm(b_np)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))
