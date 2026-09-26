"""Application settings, read from environment variables (see .env.dev.example, .env.prod.example)."""

import re
import secrets
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# <repo>/spec when running from source; /spec inside the production image (app lives in /app).
DEFAULT_SPEC_DIR = Path(__file__).resolve().parents[3] / "spec"
MIN_PRODUCTION_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", frozen=True)

    app_env: Literal["development", "test", "production"] = "development"
    app_version: str = "0.1.0"
    database_url: str = "postgresql+psycopg://smyou:change-me-dev@localhost:5442/smyou"
    db_connect_timeout_seconds: int = 3
    spec_dir: Path = DEFAULT_SPEC_DIR

    # Authentication (ARCHITECTURE §2, PRD §6)
    # Unset → random per process (dev/test only; compose.prod.yml requires JWT_SECRET).
    jwt_secret: str = Field(default_factory=lambda: secrets.token_urlsafe(48))
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    cookie_secure: bool = False
    login_max_failed: int = 5
    login_lock_minutes: int = 15
    # URL prefix the app is served under ("" in dev, "/smyoutask" in production — ADR-014).
    base_path: str = ""

    @field_validator("base_path")
    @classmethod
    def _normalise_base_path(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        if value and not re.fullmatch(r"(/[A-Za-z0-9_-]+)+", value):
            raise ValueError("BASE_PATH must be empty or look like /smyoutask")
        return value

    @model_validator(mode="after")
    def _strong_secret_in_production(self) -> "Settings":
        if self.app_env == "production" and len(self.jwt_secret) < MIN_PRODUCTION_SECRET_LENGTH:
            raise ValueError(
                f"JWT_SECRET must be at least {MIN_PRODUCTION_SECRET_LENGTH} characters in production"
            )
        return self
