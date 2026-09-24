"""FastAPI application factory (stub for M0-01 RED; completed in GREEN)."""

from fastapi import FastAPI

from app.core.config import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    return FastAPI()


app = create_app()
