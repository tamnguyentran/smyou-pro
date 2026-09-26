"""M1-02: badge-counter registry checks, apply_scope basics, and the /me OpenAPI contract."""

import uuid
from collections.abc import Callable

import pytest
from fastapi import FastAPI
from sqlalchemy import Column, MetaData, Table, Uuid, select

from app.core.authz import Actor, apply_scope
from app.core.config import Settings
from app.core.counters import check_counter_registry, visible_badges
from app.core.spec_loader import SpecError, load_specs
from app.main import create_app
from tests.conftest import TEST_DATABASE_URL
from tests.spec_fixtures import REPO_SPEC_DIR

PERMISSIONS = load_specs(REPO_SPEC_DIR).permissions


def _zero(*_: object) -> int:
    return 0


@pytest.mark.ac("AC-AUTH-032")
def test_visible_badges_follow_menu_capabilities() -> None:
    assert visible_badges(PERMISSIONS, frozenset({"MANAGER"})) == set()
    assert visible_badges(PERMISSIONS, frozenset({"TECHNICIAN"})) == {"pending_assignments_count"}
    assert visible_badges(PERMISSIONS, frozenset({"TECH_LEAD"})) == {
        "pending_dispatch_count",
        "revision_count",
    }
    assert visible_badges(PERMISSIONS, frozenset({"SALE", "TECHNICIAN"})) == {"pending_assignments_count"}


@pytest.mark.ac("AC-AUTH-032")
def test_counter_for_an_unknown_badge_stops_the_app() -> None:
    check_counter_registry(PERMISSIONS, {"pending_dispatch_count": _zero})
    with pytest.raises(SpecError, match="unread_orders_count"):
        check_counter_registry(PERMISSIONS, {"unread_orders_count": _zero})
    with pytest.raises(SpecError, match="unread_orders_count"):
        create_app(
            Settings(app_env="test", database_url=TEST_DATABASE_URL), counters={"unread_orders_count": _zero}
        )


@pytest.mark.ac("AC-AUTH-037")
def test_apply_scope_all_is_unfiltered_and_empty_is_false() -> None:
    table = Table("t", MetaData(), Column("id", Uuid, primary_key=True), Column("created_by", Uuid))
    stmt = select(table.c.id)
    rules = {"own": lambda a: table.c.created_by == a.id}
    everyone = Actor(uuid.uuid4(), frozenset({"MANAGER"}), False, capability="order.read", scopes=("all",))
    nobody = Actor(uuid.uuid4(), frozenset({"SALE"}), False, capability="order.read", scopes=())
    assert apply_scope(stmt, everyone, rules) is stmt
    assert "false" in str(apply_scope(stmt, nobody, rules).compile()).lower()


@pytest.mark.ac("AC-AUTH-039")
def test_openapi_describes_me(make_app: Callable[..., FastAPI]) -> None:
    spec = make_app().openapi()
    operation = spec["paths"]["/api/v1/me"]["get"]
    assert operation["operationId"] == "me_get"
    schema = operation["responses"]["200"]["content"]["application/json"]["schema"]
    assert schema["$ref"].endswith("/MeResponse")
    assert {"401", "403"} <= set(operation["responses"])
    me = spec["components"]["schemas"]["MeResponse"]
    assert set(me["properties"]) == {"employee", "roles", "capabilities", "counters"}
