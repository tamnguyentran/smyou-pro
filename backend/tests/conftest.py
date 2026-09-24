import os
from collections.abc import Callable

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from hypothesis import settings as hypothesis_settings

from app.core.config import Settings
from app.main import create_app

hypothesis_settings.register_profile("ci", max_examples=100, deadline=None)
hypothesis_settings.register_profile("nightly", max_examples=2000, deadline=None)
hypothesis_settings.load_profile(os.environ.get("HYPOTHESIS_PROFILE", "ci"))

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://smyou:change-me-dev@localhost:5442/smyou_test"
)
# Nothing listens on port 1: connection is refused immediately.
UNREACHABLE_DATABASE_URL = "postgresql+psycopg://smyou:super-secret-pw@127.0.0.1:1/smyou"


@pytest.fixture
def make_app() -> Callable[..., FastAPI]:
    def _make(**overrides: str) -> FastAPI:
        values = {"app_env": "test", "database_url": TEST_DATABASE_URL, **overrides}
        return create_app(Settings(**values))

    return _make


@pytest.fixture
def client(make_app: Callable[..., FastAPI]) -> TestClient:
    return TestClient(make_app(), raise_server_exceptions=False)
