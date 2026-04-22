from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    worker_port: int = 8001

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    openrouter_api_key: str = ""
    openrouter_model: str = "google/gemini-2.0-flash"

    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = "vouchrit-data"

    web_internal_base_url: str = "http://localhost:3000"
    web_public_base_url: str = "http://localhost:3000"
    api_public_base_url: str = "http://localhost:8001"

    worker_webhook_secret: str = "dev-worker-secret-change-me"
    connector_shared_token: str = "dev-connector-token-change-me"

    jwt_secret: str = "CHANGE_ME_generate_32chars_random_string"
    access_token_expiry_minutes: int = 15
    refresh_token_expiry_days: int = 7

    cookie_domain: str = ""
    cookie_secure: bool = False
    cookie_samesite: str = "lax"

    cors_origins: str = "https://accountant.my-ai.in,http://localhost:3000"

    cloudflare_account_id: str | None = None
    cloudflare_database_id: str | None = None
    cloudflare_api_token: str | None = None

    local_db_path: str = "../web/vouchr-local.db"
    local_storage_path: str = "./.local-objects"


settings = Settings()
