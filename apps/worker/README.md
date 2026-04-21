# Vouchr Worker

FastAPI worker that:

1. Downloads PDF from Cloudflare R2
2. Extracts text + calls Gemini 2.0 Flash
3. Normalizes output to strict statement JSON
4. Uploads JSON back to R2
5. Calls web app internal webhook to update statement status

## Run

```bash
uv run uvicorn app.main:app --reload --port 8001
```
