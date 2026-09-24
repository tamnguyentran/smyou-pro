from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config

from tests.conftest import TEST_DATABASE_URL

BACKEND_DIR = Path(__file__).resolve().parents[2]


def _alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    return config


@pytest.mark.ac("AC-SYS-012")
def test_migrations_upgrade_downgrade_upgrade_and_no_drift() -> None:
    config = _alembic_config()

    command.upgrade(config, "head")
    command.downgrade(config, "-1")
    command.upgrade(config, "head")
    command.check(config)  # raises if models and migrations disagree
