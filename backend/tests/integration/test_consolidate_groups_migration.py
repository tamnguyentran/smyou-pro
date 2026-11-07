"""M20-06 (AC-CAT-100…105): migration gộp "Nhóm sản phẩm/dịch vụ" về 3 nhóm chuẩn của M16-07.
Chạy riêng như test_order_division_migration.py (downgrade/upgrade commit thật) — dữ liệu tạm
riêng (nhân viên, 2 nhóm tự thêm, 5 đơn), tự dọn dẹp. Fixture `consolidated` phải đứng trước
`api`/`db` trong tham số test để được dọn **sau** khi transaction của `db` đã rollback.
"""

import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, Engine, create_engine, text

from app.modules.departments.models import STANDARD_DEPARTMENT_IDS
from tests.conftest import TEST_DATABASE_URL
from tests.integration.conftest import AN, seed
from tests.integration.test_orders_api import client_as, problem

BACKEND_DIR = Path(__file__).resolve().parents[2]
# Head right before the M20-06 migration (M19-01a order_lines_added_by).
_BEFORE_REVISION = "3f8a1c6d2e90"

OFFICE = "a1111111-1111-4111-8111-111111111111"
SECURITY = "a2222222-2222-4222-8222-222222222222"
GENERAL = "a3333333-3333-4333-8333-333333333333"
STANDARD = {GENERAL: "Kỹ thuật chung", SECURITY: "Thiết bị an ninh", OFFICE: "Thiết bị văn phòng"}

# order code -> (status, version, group key or None)
ORDERS = {
    "DH2610-0101": ("IN_PROGRESS", 3, "network"),
    "DH2610-0102": ("COMPLETED", 1, "old_printer"),
    "DH2610-0103": ("PENDING_DISPATCH", 2, "office"),
    "DH2610-0104": ("PENDING_DISPATCH", 2, None),
    "DH2610-0105": ("DRAFT", 3, "network"),
}


def _alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    return config


def _audit_count(engine: Engine) -> int:
    with engine.connect() as conn:
        return int(conn.execute(text("SELECT count(*) FROM audit_events")).scalar_one())


def _orders(engine: Engine, ids: dict[str, uuid.UUID]) -> dict[str, dict[str, Any]]:
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT * FROM orders WHERE id = ANY(:ids)"), {"ids": list(ids.values())})
        return {row.code: dict(row._mapping) for row in rows}


def _groups(engine: Engine) -> dict[str, dict[str, Any]]:
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT id, name, is_active, version FROM product_service_groups"))
        return {str(row.id): dict(row._mapping) for row in rows}


@pytest.fixture
def consolidated(migrated: None) -> Iterator[dict[str, Any]]:
    """DB in the spec's "Dữ liệu chung" state, migrated to head; yields ids + pre-migration snapshots."""
    config = _alembic_config()
    engine = create_engine(TEST_DATABASE_URL)
    employee_id = uuid.uuid4()
    groups = {"network": uuid.uuid4(), "old_printer": uuid.uuid4()}
    group_ids = {**groups, "office": uuid.UUID(OFFICE)}
    order_ids = {code: uuid.uuid4() for code in ORDERS}

    command.downgrade(config, _BEFORE_REVISION)
    try:
        with engine.begin() as conn:
            conn.execute(
                text("UPDATE product_service_groups SET name = 'Camera - An ninh' WHERE id = :id"),
                {"id": SECURITY},
            )
            conn.execute(
                text("UPDATE product_service_groups SET is_active = false WHERE id = :id"), {"id": GENERAL}
            )
            conn.execute(
                text(
                    "INSERT INTO product_service_groups (id, name, is_active) VALUES"
                    " (:network, 'Thiết bị mạng', true), (:old_printer, 'Máy in cũ', false)"
                ),
                groups,
            )
            conn.execute(
                text(
                    "INSERT INTO employees (id, code, full_name, email, username, department_id,"
                    " password_hash) VALUES (:id, 'NV-MIGGRP', 'NV tạm cho test migration',"
                    " 'miggrp@smyou.vn', 'miggrp', :dept, 'x')"
                ),
                {"id": employee_id, "dept": STANDARD_DEPARTMENT_IDS["ECONOMIC"]},
            )
            for code, (status, version, group) in ORDERS.items():
                conn.execute(
                    text(
                        "INSERT INTO orders (id, code, created_by, status, version, division_id, total)"
                        " VALUES (:id, :code, :created_by, :status, :version, :division_id, 1100000)"
                    ),
                    {
                        "id": order_ids[code],
                        "code": code,
                        "created_by": employee_id,
                        "status": status,
                        "version": version,
                        "division_id": group_ids[group] if group else None,
                    },
                )
                conn.execute(
                    text(
                        "INSERT INTO order_lines (order_id, position, item_type, name_snapshot,"
                        " unit_snapshot, vat_rate, quantity, unit_price, line_gross, line_vat, line_total)"
                        " VALUES (:order_id, 1, 'CUSTOM', 'Lắp đặt', 'lần', 10, 1, 1000000, 1000000, 100000,"
                        " 1100000)"
                    ),
                    {"order_id": order_ids[code]},
                )

        before = {
            "orders": _orders(engine, order_ids),
            "groups": _groups(engine),
            "audit": _audit_count(engine),
        }
        command.upgrade(config, "head")
        yield {"config": config, "engine": engine, "order_ids": order_ids, "groups": groups, "before": before}
    finally:
        with engine.begin() as conn:
            ids = list(order_ids.values())
            conn.execute(text("DELETE FROM order_lines WHERE order_id = ANY(:ids)"), {"ids": ids})
            conn.execute(text("DELETE FROM orders WHERE id = ANY(:ids)"), {"ids": ids})
            conn.execute(text("DELETE FROM employees WHERE id = :id"), {"id": employee_id})
            conn.execute(
                text("DELETE FROM product_service_groups WHERE id = ANY(:ids)"),
                {"ids": list(groups.values())},
            )
            # Leave the 3 standard groups exactly as M16-07 seeded them for the other tests.
            for group_id, name in STANDARD.items():
                conn.execute(
                    text("UPDATE product_service_groups SET name = :name, is_active = true WHERE id = :id"),
                    {"id": group_id, "name": name},
                )
        command.upgrade(config, "head")
        engine.dispose()


@pytest.mark.ac("AC-CAT-100")
def test_only_three_standard_groups_active(
    consolidated: dict[str, Any], app: FastAPI, db: Connection
) -> None:
    seed(db, AN)
    an = client_as(app, AN)

    res = an.get("/api/v1/product-service-groups", params={"is_active": "true", "limit": 100})

    assert res.status_code == 200, res.text
    assert {item["id"]: item["name"] for item in res.json()["items"]} == STANDARD


@pytest.mark.ac("AC-CAT-101")
def test_custom_groups_deactivated_not_deleted(consolidated: dict[str, Any]) -> None:
    groups = _groups(consolidated["engine"])
    before = consolidated["before"]["groups"]
    network = str(consolidated["groups"]["network"])
    old_printer = str(consolidated["groups"]["old_printer"])

    assert (groups[network]["name"], groups[network]["is_active"]) == ("Thiết bị mạng", False)
    assert (groups[old_printer]["name"], groups[old_printer]["is_active"]) == ("Máy in cũ", False)
    assert groups[network]["version"] == before[network]["version"] + 1


@pytest.mark.ac("AC-CAT-100")
def test_standard_groups_version_bumped_only_when_changed(consolidated: dict[str, Any]) -> None:
    groups = _groups(consolidated["engine"])
    before = consolidated["before"]["groups"]

    assert groups[SECURITY]["version"] == before[SECURITY]["version"] + 1
    assert groups[GENERAL]["version"] == before[GENERAL]["version"] + 1
    assert groups[OFFICE]["version"] == before[OFFICE]["version"]


@pytest.mark.ac("AC-CAT-100")
def test_upgrade_on_odd_db_restores_three_standard_groups(migrated: None) -> None:
    """Missing standard row, custom active groups holding standard names, swapped standard names."""
    config = _alembic_config()
    engine = create_engine(TEST_DATABASE_URL)
    customs = [uuid.uuid4(), uuid.uuid4()]

    command.downgrade(config, _BEFORE_REVISION)
    try:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM product_service_groups WHERE id = :id"), {"id": SECURITY})
            conn.execute(
                text("UPDATE product_service_groups SET name = 'Văn phòng cũ' WHERE id = :id"), {"id": OFFICE}
            )
            conn.execute(
                text(
                    "UPDATE product_service_groups SET name = 'Thiết bị văn phòng', is_active = true"
                    " WHERE id = :id"
                ),
                {"id": GENERAL},
            )
            conn.execute(
                text(
                    "INSERT INTO product_service_groups (id, name, is_active) VALUES"
                    " (:a, 'Thiết bị an ninh', true), (:b, 'Kỹ thuật chung', true)"
                ),
                {"a": customs[0], "b": customs[1]},
            )

        command.upgrade(config, "head")

        groups = _groups(engine)
        assert {gid: g["name"] for gid, g in groups.items() if g["is_active"]} == STANDARD
        assert [groups[str(c)]["is_active"] for c in customs] == [False, False]
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM product_service_groups WHERE id = ANY(:ids)"), {"ids": customs})
            conn.execute(
                text("UPDATE product_service_groups SET name = 'tmp-' || id WHERE id = ANY(:ids)"),
                {"ids": [uuid.UUID(gid) for gid in STANDARD]},
            )
            for group_id, name in STANDARD.items():
                conn.execute(
                    text("UPDATE product_service_groups SET name = :name, is_active = true WHERE id = :id"),
                    {"id": group_id, "name": name},
                )
        command.upgrade(config, "head")
        engine.dispose()


@pytest.mark.ac("AC-CAT-102")
def test_orders_on_custom_groups_moved_to_general(consolidated: dict[str, Any]) -> None:
    after = _orders(consolidated["engine"], consolidated["order_ids"])
    before = consolidated["before"]["orders"]

    for code in ("DH2610-0101", "DH2610-0102"):
        assert str(after[code]["division_id"]) == GENERAL
        assert after[code]["version"] == before[code]["version"] + 1
        unchanged = {
            k: v for k, v in after[code].items() if k not in {"division_id", "version", "updated_at"}
        }
        assert unchanged == {
            k: v for k, v in before[code].items() if k not in {"division_id", "version", "updated_at"}
        }
    assert after["DH2610-0101"]["version"] == 4
    with consolidated["engine"].connect() as conn:
        lines = conn.execute(
            text("SELECT count(*), sum(line_total) FROM order_lines WHERE order_id = :id"),
            {"id": consolidated["order_ids"]["DH2610-0101"]},
        ).one()
    assert tuple(lines) == (1, 1100000)


@pytest.mark.ac("AC-CAT-103")
def test_orders_on_standard_or_null_group_untouched(consolidated: dict[str, Any]) -> None:
    after = _orders(consolidated["engine"], consolidated["order_ids"])
    before = consolidated["before"]["orders"]

    assert str(after["DH2610-0103"]["division_id"]) == OFFICE
    assert after["DH2610-0104"]["division_id"] is None
    for code in ("DH2610-0103", "DH2610-0104"):
        assert after[code]["version"] == before[code]["version"]


@pytest.mark.ac("AC-CAT-104")
def test_no_audit_events_and_rerun_is_noop(consolidated: dict[str, Any]) -> None:
    engine = consolidated["engine"]
    assert _audit_count(engine) == consolidated["before"]["audit"]
    groups = _groups(engine)
    orders = _orders(engine, consolidated["order_ids"])

    command.downgrade(consolidated["config"], _BEFORE_REVISION)
    command.upgrade(consolidated["config"], "head")

    assert _groups(engine) == groups
    assert _orders(engine, consolidated["order_ids"]) == orders
    assert _audit_count(engine) == consolidated["before"]["audit"]


@pytest.mark.ac("AC-CAT-105")
def test_open_draft_gets_stale_version_then_reassigns(
    consolidated: dict[str, Any], app: FastAPI, db: Connection
) -> None:
    seed(db, AN)
    an: TestClient = client_as(app, AN)
    order_id = consolidated["order_ids"]["DH2610-0105"]

    stale = an.patch(f"/api/v1/orders/{order_id}", json={"division_id": SECURITY, "version": 3})
    problem(stale, 409, "STALE_VERSION")

    fresh = an.get(f"/api/v1/orders/{order_id}").json()
    assert fresh["version"] == 4
    res = an.patch(f"/api/v1/orders/{order_id}", json={"division_id": SECURITY, "version": fresh["version"]})

    assert res.status_code == 200, res.text
    assert (res.json()["division_id"], res.json()["division_name"]) == (SECURITY, "Thiết bị an ninh")
