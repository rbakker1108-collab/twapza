"""Application settings, loaded from environment variables / .env.

Twapza-specific settings use the ``TWAPZA_`` prefix. A few well-known variables
(``ANTHROPIC_API_KEY``, ``REDIS_URL``) are read without a prefix.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

ALLOWED_EXTENSIONS = ("mp4", "mov", "mkv")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="TWAPZA_",
        env_file=("../.env", ".env"),  # repo root (when run from backend/) or cwd
        extra="ignore",
        populate_by_name=True,
    )

    # External services
    anthropic_api_key: SecretStr | None = Field(default=None, validation_alias="ANTHROPIC_API_KEY")
    claude_model: str = "claude-sonnet-5-5"
    redis_url: str = Field(default="redis://localhost:6379/0", validation_alias="REDIS_URL")

    # Storage
    storage_backend: str = "local"
    storage_root: Path = Path("./data/storage")
    database_url: str = "sqlite:///./data/twapza.db"

    # Limits
    max_upload_gb: float = 20
    max_duration_min: float = 180
    chunk_size_mb: int = 16
    retention_hours: float = 24

    # Processing
    proxy_height: int = 720
    job_timeout_seconds: int = 6 * 60 * 60
    queue_name: str = "twapza"

    # Cleanup scheduler
    cleanup_interval_seconds: int = 15 * 60

    @property
    def max_upload_bytes(self) -> int:
        return int(self.max_upload_gb * 1024**3)

    @property
    def max_duration_seconds(self) -> float:
        return self.max_duration_min * 60

    @property
    def chunk_size_bytes(self) -> int:
        return self.chunk_size_mb * 1024**2


@lru_cache
def get_settings() -> Settings:
    return Settings()
