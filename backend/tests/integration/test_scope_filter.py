"""M1-02: data scope filtering on real Postgres (AC-AUTH-036…038).

A test-only table stands in for orders/tasks: `own` = created by the actor, `assigned` = the actor is in
the assignee list, `self` is deliberately NOT supported by this entity.
"""

import logging
import uuid
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI, Request
from fastapi.testclient import TestClient
from sqlalchemy import Column, Connection, ForeignKey, MetaData, Table, Text, Uuid, exists, select
from sqlalchemy.orm import Session

from app.core.authz import Actor, ScopeRules, apply_scope, get_in_scope_or_404, require
from app.core.db import DbSession
from app.core.errors import AppError

META = MetaData()
PROBE = Table(
    "scope_probe",
    META,
    Column("id", Uuid, primary_key=True),
    Column("created_by", Uuid, nullable=False),
    Column("label", Text, nullable=False),
    prefixes=["TEMPORARY"],
)
ASSIGNEES = Table(
    "scope_probe_assignees",
    META,
    Column("probe_id", Uuid, ForeignKey("scope_probe.id"), primary_key=True),
    Column("employee_id", Uuid, primary_key=True),
    prefixes=["TEMPORARY"],
)

RULES: ScopeRules = {
    "own": lambda actor: PROBE.c.created_by == actor.id,
    "assigned": lambda actor: exists().where(
        ASSIGNEES.c.probe_id == PROBE.c.id, ASSIGNEES.c.employee_id == actor.id
    ),
}

HA, AN, KHOA, OTHER = (uuid.uuid4() for _ in range(4))
R1, R2, R3, R4 = (uuid.uuid4() for _ in range(4))


@pytest.fixture
def probes(db: Connection) -> Connection:
    META.create_all(db)
    db.execute(
        PROBE.insert(),
        [
            {"id": R1, "created_by": HA, "label": "của Hà 1"},
            {"id": R2, "created_by": HA, "label": "của Hà 2"},
            {"id": R3, "created_by": AN, "label": "của An"},
            {"id": R4, "created_by": OTHER, "label": "giao cho Khoa và Hà"},
        ],
    )
    db.execute(
        ASSIGNEES.insert(), [{"probe_id": R4, "employee_id": KHOA}, {"probe_id": R4, "employee_id": HA}]
    )
    return db


def actor(employee_id: uuid.UUID, *scopes: str, capability: str = "order.read") -> Actor:
    return Actor(employee_id, frozenset({"SALE"}), False, capability=capability, scopes=scopes)


def ids(db: Connection, who: Actor) -> set[uuid.UUID]:
    with Session(bind=db) as session:
        return set(session.scalars(apply_scope(select(PROBE.c.id), who, RULES)))


@pytest.mark.ac("AC-AUTH-036")
def test_scopes_filter_rows(probes: Connection) -> None:
    assert ids(probes, actor(AN, "all")) == {R1, R2, R3, R4}
    assert ids(probes, actor(HA, "own")) == {R1, R2}
    assert ids(probes, actor(KHOA, "assigned")) == {R4}
    assert ids(probes, actor(HA, "own", "assigned")) == {R1, R2, R4}


@pytest.mark.ac("AC-AUTH-037")
def test_unsupported_or_empty_scope_returns_nothing_and_warns(
    probes: Connection, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.WARNING):
        assert ids(probes, actor(KHOA, "self", capability="task.read")) == set()
    assert "task.read" in caplog.text
    assert "self" in caplog.text
    assert ids(probes, actor(KHOA)) == set()
    # An unsupported scope next to a supported one still only widens by the supported rule.
    assert ids(probes, actor(HA, "own", "self")) == {R1, R2}


def _probe_app(app: FastAPI) -> FastAPI:
    def as_ha(_: Request, __: Session) -> Actor | None:
        return Actor(HA, frozenset({"SALE"}), False)

    app.state.authenticator = as_ha

    def read_probe(
        probe_id: uuid.UUID, session: DbSession, who: Annotated[Actor, Depends(require("order.cancel"))]
    ) -> dict[str, str]:
        label = get_in_scope_or_404(session, select(PROBE.c.label).where(PROBE.c.id == probe_id), who, RULES)
        return {"label": str(label)}

    app.add_api_route("/api/v1/probe/{probe_id}", read_probe, methods=["GET"])
    return app


@pytest.mark.ac("AC-AUTH-038")
def test_out_of_scope_and_missing_look_identical(app: FastAPI, probes: Connection) -> None:
    api = TestClient(_probe_app(app), raise_server_exceptions=False)

    mine = api.get(f"/api/v1/probe/{R1}")
    assert mine.status_code == 200
    assert mine.json() == {"label": "của Hà 1"}

    out_of_scope = api.get(f"/api/v1/probe/{R3}")
    missing = api.get(f"/api/v1/probe/{uuid.uuid4()}")
    assert out_of_scope.status_code == missing.status_code == 404

    def comparable(body: dict[str, object]) -> dict[str, object]:
        return {k: v for k, v in body.items() if k not in {"instance", "request_id"}}

    assert comparable(out_of_scope.json()) == comparable(missing.json())
    assert out_of_scope.json()["code"] == "NOT_FOUND"
    assert out_of_scope.json()["detail"] == "Không tìm thấy tài nguyên."


@pytest.mark.ac("AC-AUTH-038")
def test_get_in_scope_or_404_raises_the_same_error(probes: Connection) -> None:
    ha = actor(HA, "own")
    with Session(bind=probes) as session:
        assert (
            get_in_scope_or_404(session, select(PROBE.c.label).where(PROBE.c.id == R2), ha, RULES)
            == "của Hà 2"
        )
        errors = []
        for probe_id in (R3, uuid.uuid4()):
            with pytest.raises(AppError) as caught:
                get_in_scope_or_404(session, select(PROBE.c.label).where(PROBE.c.id == probe_id), ha, RULES)
            errors.append((caught.value.status, caught.value.code, caught.value.detail, caught.value.errors))
    assert errors[0] == errors[1] == (404, "NOT_FOUND", "Không tìm thấy tài nguyên.", None)
