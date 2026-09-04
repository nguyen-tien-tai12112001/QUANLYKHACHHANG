from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


INSECURE_AUTH_SECRETS = {
    "c360-offline-change-this-secret",
    "thay-bang-chuoi-bi-mat-dai-va-rieng-tren-may-chu",
    "change_me_generate_a_random_secret_before_starting",
    "change-me",
    "changeme",
}


class Settings(BaseSettings):
    APP_NAME: str = "QUANLYKHACHHANG"
    DATABASE_URL: str
    CORS_ORIGINS: str = "http://localhost:3000"
    IMPORT_WORKER_COUNT: int = 1
    IMPORT_CHUNK_SIZE: int = 20000
    DELETE_UPLOAD_AFTER_SUCCESS: bool = True
    PROCESSING_WORK_MEM: str = "256MB"
    REDIS_URL: str = "redis://redis:6379/0"
    ANALYSIS_CACHE_TTL: int = 900
    ANALYSIS_CACHE_MAX_BYTES: int = 20_000_000
    AUTH_SECRET: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 240

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @field_validator("AUTH_SECRET")
    @classmethod
    def validate_auth_secret(cls, value: str) -> str:
        secret = str(value or "").strip()
        if len(secret) < 32:
            raise ValueError("AUTH_SECRET phải có ít nhất 32 ký tự")
        if secret.lower() in INSECURE_AUTH_SECRETS:
            raise ValueError("AUTH_SECRET vẫn đang dùng giá trị mẫu không an toàn")
        return secret

    @field_validator("ACCESS_TOKEN_EXPIRE_MINUTES")
    @classmethod
    def validate_access_token_expiry(cls, value: int) -> int:
        if not 15 <= int(value) <= 1440:
            raise ValueError("ACCESS_TOKEN_EXPIRE_MINUTES phải nằm trong khoảng 15–1440 phút")
        return int(value)

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
