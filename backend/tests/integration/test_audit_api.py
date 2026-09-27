"""M1-05: GET /api/v1/audit-events — read, filter, paginate; Manager-only (AC-SYS-068…071).

Rows are inserted directly (like `seed` does for employees) so occurred_at/actor_id are fully
controlled, independent of whatever else in the app happens to write audit_events.
"""

import uuid
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, insert

from app.modules.audit.models import AuditEvent
from tests.integration.conftest import AN, KHOA, Person, login, seed

BINH = Person("binh.le@smyou.vn", "Binh@SmYou26", ("MANAGER",), "NV002", "Lê Văn Bình", "MANAGEMENT")
TUAN = Person("tuan.pham@smyou.vn", "Tuan@SmYou26", ("TECH_LEAD",), "NV010", "Phạm Quốc Tuấn", "TECHNICAL")
HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")


def insert_event(
    db: Connection,
    *,
    occurred_at: datetime,
    actor_id: uuid.UUID | None,
    entity_id: uuid.UUID,
    action: str = "update",
    entity_type: str = "EMPLOYEE",
) -> None:
    db.execute(
        insert(AuditEvent.__table__).values(
            occurred_at=occurred_at,
            actor_id=actor_id,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
        )
    )


def login_as(client: TestClient, person: Person) -> None:
    res = login(client, person.email, person.password)
    assert res.status_code == 200, res.text


@pytest.mark.ac("AC-SYS-068")
def test_list_shape_sorted_desc_and_limit_validation(api: TestClient, db: Connection) -> None:
    an = seed(db, AN)
    hoa = seed(db, HOA)
    insert_event(
        db, occurred_at=datetime(2026, 1, 1, tzinfo=UTC), actor_id=an, entity_id=hoa, action="create"
    )
    insert_event(
        db, occurred_at=datetime(2026, 1, 2, tzinfo=UTC), actor_id=None, entity_id=hoa, action="update"
    )
    insert_event(db, occurred_at=datetime(2026, 1, 3, tzinfo=UTC), actor_id=an, entity_id=hoa, action="roles")
    login_as(api, AN)  # this itself audits a "login" row for `an`, sorted first (most recent)

    res = api.get("/api/v1/audit-events?limit=20&offset=0")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 4
    assert body["limit"] == 20
    assert body["offset"] == 0
    assert body["items"][0]["action"] == "login"
    seeded = body["items"][1:]
    actions = [item["action"] for item in seeded]
    assert actions == ["roles", "update", "create"]
    assert set(seeded[0]) == {
        "id",
        "occurred_at",
        "actor",
        "entity_type",
        "entity_id",
        "action",
        "from_status",
        "to_status",
        "data",
    }
    assert seeded[0]["actor"] == {"id": str(an), "code": "NV001", "full_name": "Nguyễn Văn An"}
    assert seeded[1]["actor"] is None

    too_big = api.get("/api/v1/audit-events?limit=101")
    assert too_big.status_code == 422


@pytest.mark.ac("AC-SYS-069")
def test_filter_by_actor_and_reject_unknown_entity_type(api: TestClient, db: Connection) -> None:
    an = seed(db, AN)
    binh = seed(db, BINH)
    hoa = seed(db, HOA)
    insert_event(db, occurred_at=datetime(2026, 1, 1, tzinfo=UTC), actor_id=an, entity_id=hoa)
    insert_event(db, occurred_at=datetime(2026, 1, 2, tzinfo=UTC), actor_id=binh, entity_id=hoa)
    login_as(api, AN)

    res = api.get(f"/api/v1/audit-events?actor_id={binh}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 1
    assert body["items"][0]["actor"]["id"] == str(binh)

    bad = api.get("/api/v1/audit-events?entity_type=FOO")
    assert bad.status_code == 422


@pytest.mark.ac("AC-SYS-070")
def test_filter_by_occurred_range_uses_vietnam_calendar_days(api: TestClient, db: Connection) -> None:
    an = seed(db, AN)
    hoa = seed(db, HOA)
    # VN = UTC+7. 2026-09-19T18:00Z -> 2026-09-20T01:00 VN (inside the 20th).
    inside_early = datetime(2026, 9, 19, 18, 0, tzinfo=UTC)
    # 2026-09-20T15:00Z -> 2026-09-20T22:00 VN (still inside the 20th).
    inside_late = datetime(2026, 9, 20, 15, 0, tzinfo=UTC)
    # 2026-09-20T18:00Z -> 2026-09-21T01:00 VN (the next VN day — must be excluded).
    outside = datetime(2026, 9, 20, 18, 0, tzinfo=UTC)
    insert_event(db, occurred_at=inside_early, actor_id=an, entity_id=hoa, action="a")
    insert_event(db, occurred_at=inside_late, actor_id=an, entity_id=hoa, action="b")
    insert_event(db, occurred_at=outside, actor_id=an, entity_id=hoa, action="c")
    login_as(api, AN)

    res = api.get("/api/v1/audit-events?occurred_from=2026-09-20&occurred_to=2026-09-20")
    assert res.status_code == 200, res.text
    actions = {item["action"] for item in res.json()["items"]}
    assert actions == {"a", "b"}

    invalid_range = api.get("/api/v1/audit-events?occurred_from=2026-09-20&occurred_to=2026-09-19")
    assert invalid_range.status_code == 422


@pytest.mark.ac("AC-SYS-071")
def test_non_manager_roles_get_403(app: FastAPI, db: Connection) -> None:
    seed(db, TUAN)
    seed(db, HOA)
    seed(db, KHOA)

    for person in (TUAN, HOA, KHOA):
        client = TestClient(app, raise_server_exceptions=False)
        login(client, person.email, person.password)
        res = client.get("/api/v1/audit-events")
        assert res.status_code == 403, (person.code, res.text)
        assert res.json()["code"] == "FORBIDDEN"
