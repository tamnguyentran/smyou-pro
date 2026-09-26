"""Authorization dependencies (ARCHITECTURE §6). Capabilities come from spec/permissions.yaml."""

from collections.abc import Callable
from typing import Any

from fastapi import FastAPI


def require(capability: str) -> Callable[[], None]:  # stub (M0-04 red phase)
    def dependency() -> None:
        return None

    return dependency


def undeclared_routes(app: FastAPI, permissions: Any) -> list[str]:  # stub (M0-04 red phase)
    return []
