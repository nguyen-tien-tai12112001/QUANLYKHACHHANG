from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "QUANLYKHACHHANG"
    DATABASE_URL: str
    CORS_ORIGINS: str = "http://localhost:3000"
    IMPORT_WORKER_COUNT: int = 1
    IMPORT_CHUNK_SIZE: int = 20000
    DELETE_UPLOAD_AFTER_SUCCESS: bool = True
    PROCESSING_WORK_MEM: str = "256MB"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
