"""Application settings, read from environment variables (see .env.dev.example, .env.prod.example)."""

from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

# <repo>/spec when running from source; /spec inside the production image (app lives in /app).
DEFAULT_SPEC_DIR = Path(__file__).resolve().parents[3] / "spec"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", frozen=True)

    app_env: Literal["development", "test", "production"] = "development"
    app_version: str = "0.1.0"
    database_url: str = "postgresql+psycopg://smyou:change-me-dev@localhost:5442/smyou"
    db_connect_timeout_seconds: int = 3
    spec_dir: Path = DEFAULT_SPEC_DIR
