"""Runs Alembic once before the stateful machine's examples (AC-SYS-093: "DB Postgres test sạch")."""

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

from tests.conftest import TEST_DATABASE_URL

BACKEND_DIR = Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True, scope="session")
def _migrated_stateful_db() -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    command.upgrade(config, "head")
