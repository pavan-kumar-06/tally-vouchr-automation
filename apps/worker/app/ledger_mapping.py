"""
Ledger mapping service.

Workflow:
1. When connector syncs masters, we index each ledger embedding → zvec
2. After transaction extraction, we embed each transaction narration
3. Search zvec for most similar ledger → suggest it to user
4. User accepts/rejects suggestion
"""

from __future__ import annotations

from typing import Any

from app.embedding import embed_ledger, embed_transaction, cosine_similarity
from app.vector_store import get_store


LEDGER_SUGGESTION_TOPK = 3
CONFIDENCE_THRESHOLD = 0.65  # Minimum similarity score to auto-suggest


def index_company_ledgers(company_id: str, ledgers: list[dict[str, Any]]) -> int:
    """
    Index all ledgers for a company into zvec.

    ledgers: list of {"name": str, "description": str, ...}
    Returns count of successfully indexed ledgers.
    """
    store = get_store(company_id)
    indexed = 0

    for ledger in ledgers:
        try:
            name = ledger.get("name", "")
            desc = ledger.get("description", "")
            vector = embed_ledger(name, desc)
            store.insert_ledger(name, vector)
            indexed += 1
        except Exception as e:
            print(f"[ledger-mapping] Failed to index ledger '{ledger.get('name')}': {e}")

    return indexed


def suggest_ledger_for_transaction(
    company_id: str,
    narration: str,
    amount: float,
    txn_type: str,
) -> list[dict[str, Any]]:
    """
    Given a transaction, find the most likely matching ledgers.

    Returns list of top-k suggestions sorted by similarity score.
    Each dict: {"ledger_name": str, "score": float}
    """
    store = get_store(company_id)

    if store.count() == 0:
        return []

    try:
        txn_vector = embed_transaction(narration, amount, txn_type)
    except Exception as e:
        print(f"[ledger-mapping] Failed to embed transaction: {e}")
        return []

    try:
        results = store.search_similar_ledgers(txn_vector, topk=LEDGER_SUGGESTION_TOPK)
        # Filter by confidence threshold
        filtered = [r for r in results if r["score"] >= CONFIDENCE_THRESHOLD]
        return filtered
    except Exception as e:
        print(f"[ledger-mapping] Vector search failed: {e}")
        return []


def map_transactions_to_ledgers(
    company_id: str,
    transactions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Map a list of extracted transactions to ledgers.

    Each transaction should have: narration, amount, type.
    Returns list with added "suggested_ledger" and "ledger_score" fields.
    """
    results = []
    for txn in transactions:
        suggestions = suggest_ledger_for_transaction(
            company_id=company_id,
            narration=txn.get("narration", ""),
            amount=txn.get("amount", 0.0),
            txn_type=txn.get("type", ""),
        )
        if suggestions:
            results.append({
                **txn,
                "suggested_ledger": suggestions[0]["ledger_name"],
                "ledger_score": round(suggestions[0]["score"], 3),
                "alternatives": [
                    {"ledger_name": s["ledger_name"], "score": s["score"]}
                    for s in suggestions[1:]
                ],
            })
        else:
            results.append({
                **txn,
                "suggested_ledger": None,
                "ledger_score": None,
                "alternatives": [],
            })
    return results
