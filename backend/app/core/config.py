"""Application settings (stub for M0-01 RED; completed in GREEN)."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_env: str = "development"
    app_version: str = "0.1.0"
    database_url: str = "postgresql+psycopg://smyou:change-me-dev@localhost:5442/smyou"
