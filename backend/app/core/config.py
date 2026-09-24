"""Application settings, read from environment variables (see .env.dev.example, .env.prod.example)."""

from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", frozen=True)

    app_env: Literal["development", "test", "production"] = "development"
    app_version: str = "0.1.0"
    database_url: str = "postgresql+psycopg://smyou:change-me-dev@localhost:5442/smyou"
    db_connect_timeout_seconds: int = 3
