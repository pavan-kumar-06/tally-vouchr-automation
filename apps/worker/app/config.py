from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    worker_port: int = 8001

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    openrouter_api_key: str = ""
    openrouter_model: str = "google/gemini-2.0-flash"

    r2_account_id: str
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_bucket_name: str = "vouchrit-data"

    web_internal_base_url: str = "http://localhost:3000"
    web_public_base_url: str = "http://localhost:3000"
    worker_webhook_secret: str
    connector_shared_token: str = "dev-connector-token-change-me"
    jwt_secret: str = "CHANGE_ME_generate_32chars_random_string"


settings = Settings()
