from __future__ import annotations

import json
import time

import openai
from openai import OpenAI

from app.config import settings
from app.prompts import STATEMENT_EXTRACTION_SYSTEM_PROMPT, build_user_prompt


OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
openrouter_client = OpenAI(
    base_url=OPENROUTER_BASE_URL,
    api_key=settings.openrouter_api_key,
)

MAX_RETRIES = 5
BASE_DELAY = 2  # seconds


def _strip_markdown_fence(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        return "\n".join(lines).strip()
    return text


def extract_transactions_from_url(pdf_url: str, period_from: str | None, period_to: str | None) -> list[dict]:
    prompt = build_user_prompt(statement_text="[PDF_URL]", period_from=period_from, period_to=period_to)

    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            response = openrouter_client.chat.completions.create(
                model=settings.openrouter_model,
                messages=[
                    {"role": "system", "content": STATEMENT_EXTRACTION_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": pdf_url, "detail": "high"},
                            },
                        ],
                    },
                ],
                temperature=0,
                max_tokens=12000,
            )

            raw = response.choices[0].message.content
            if not raw or not raw.strip():
                raise ValueError("OpenRouter returned empty response")

            parsed = json.loads(_strip_markdown_fence(raw))
            if isinstance(parsed, dict) and "transactions" in parsed:
                parsed = parsed["transactions"]
            if not isinstance(parsed, list):
                raise ValueError(f"Expected JSON array, got {type(parsed).__name__}")
            return parsed

        except Exception as exc:
            last_error = exc
            error_code = getattr(exc, "status_code", None)
            if error_code in (503, 429, 502):
                if attempt < MAX_RETRIES - 1:
                    delay = BASE_DELAY * (2 ** attempt)
                    time.sleep(delay)
                continue
            raise

    raise RuntimeError(f"OpenRouter failed after {MAX_RETRIES} retries: {last_error}")


def extract_transactions(statement_text: str, period_from: str | None, period_to: str | None) -> list[dict]:
    # Fallback text-based extraction (used if PDF URL is not available)
    prompt = build_user_prompt(statement_text=statement_text, period_from=period_from, period_to=period_to)

    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            response = openrouter_client.chat.completions.create(
                model=settings.openrouter_model,
                messages=[
                    {"role": "system", "content": STATEMENT_EXTRACTION_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                temperature=0,
                max_tokens=12000,
            )

            raw = response.choices[0].message.content
            if not raw or not raw.strip():
                raise ValueError("OpenRouter returned empty response")

            parsed = json.loads(_strip_markdown_fence(raw))
            if isinstance(parsed, dict) and "transactions" in parsed:
                parsed = parsed["transactions"]
            if not isinstance(parsed, list):
                raise ValueError(f"Expected JSON array, got {type(parsed).__name__}")
            return parsed

        except Exception as exc:
            last_error = exc
            error_code = getattr(exc, "status_code", None)
            if error_code in (503, 429, 502):
                if attempt < MAX_RETRIES - 1:
                    delay = BASE_DELAY * (2 ** attempt)
                    time.sleep(delay)
                continue
            raise

    raise RuntimeError(f"OpenRouter failed after {MAX_RETRIES} retries: {last_error}")
