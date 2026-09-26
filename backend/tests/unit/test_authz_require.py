"""M0-04: require() fails closed until authentication exists (M1-01/M1-02)."""

from collections.abc import Callable

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core.authz import require


@pytest.mark.ac("AC-SYS-028")
def test_required_capability_without_login_is_401(make_app: Callable[..., FastAPI]) -> None:
    app = make_app()

    @app.get("/api/v1/probe", dependencies=[Depends(require("order.read"))])
    def probe() -> dict[str, bool]:
        return {"ok": True}

    res = TestClient(app).get("/api/v1/probe")
    assert res.status_code == 401
    assert res.headers["content-type"].startswith("application/problem+json")
    body = res.json()
    assert body["code"] == "UNAUTHENTICATED"
    assert body["detail"] == "Vui lòng đăng nhập."
