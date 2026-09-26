"""Alembic environment: online migrations only, URL from settings unless provided."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

# Import every module's models here so autogenerate/check see all tables.
import app.core.sequences  # registers tables on Base.metadata
import app.modules.identity.models  # noqa: F401  # registers tables on Base.metadata
from app.core.config import Settings
from app.core.db import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def run_migrations_online() -> None:
    url = config.get_main_option("sqlalchemy.url") or Settings().database_url
    connectable = create_engine(url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
