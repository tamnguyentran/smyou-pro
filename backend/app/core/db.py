"""Database engine and declarative base (SQLAlchemy 2.0, sync — ADR-009)."""

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import Engine, MetaData, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# Deterministic constraint names so Alembic autogenerate/check stay stable.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def create_db_engine(url: str, connect_timeout_seconds: int) -> Engine:
    return create_engine(
        url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": connect_timeout_seconds},
    )


def ping(engine: Engine) -> None:
    """Raise sqlalchemy.exc.SQLAlchemyError if the database cannot answer a trivial query."""
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)


def get_session(request: Request) -> Iterator[Session]:
    """One transaction per request: committed before the response is sent, rolled back if the endpoint raises.

    Endpoints that must persist something *and* answer with an error (e.g. a failed-login counter)
    return a problem response instead of raising, so the transaction still commits.
    """
    factory: sessionmaker[Session] = request.app.state.session_factory
    with factory() as session, session.begin():
        yield session


# scope="function": the transaction commits before the response (and its Set-Cookie) is sent.
DbSession = Annotated[Session, Depends(get_session, scope="function")]
