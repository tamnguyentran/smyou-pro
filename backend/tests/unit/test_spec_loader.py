"""M0-04: spec/*.yaml are loaded and validated at startup; a broken spec stops the app."""

from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi import FastAPI

from app.core.spec_loader import SpecError, load_specs
from tests.spec_fixtures import REPO_SPEC_DIR, copy_specs, edit

SM = "state_machines.yaml"
PERM = "permissions.yaml"


@pytest.mark.ac("AC-SYS-024")
def test_repo_specs_load() -> None:
    specs = load_specs(REPO_SPEC_DIR)
    sm = specs.state_machines
    assert len(sm.order.states) == 7
    assert len(sm.order.transitions) == 8
    assert sm.order.initial == "DRAFT"
    assert len(sm.task.states) == 6
    assert len(sm.task.commands) == 5
    assert len(sm.assignment.states) == 6
    assert len(sm.assignment.transitions) == 5
    assert len(sm.guards) == 20
    perm = specs.permissions
    assert set(perm.roles) == {"MANAGER", "SALE", "TECH_LEAD", "TECHNICIAN"}
    assert len(perm.capabilities) == 28
    assert perm.capabilities["order.read"] == {
        "MANAGER": "all",
        "SALE": "all",
        "TECH_LEAD": "all",
        "TECHNICIAN": "assigned",
    }
    assert perm.public_routes == [
        "GET /api/v1/health",
        "POST /api/v1/auth/login",
        "POST /api/v1/auth/refresh",
        "POST /api/v1/auth/logout",
    ]


@pytest.mark.ac("AC-SYS-024")
def test_app_exposes_loaded_specs(make_app: Callable[..., FastAPI]) -> None:
    app = make_app()
    assert len(app.state.specs.permissions.capabilities) == 28


BROKEN = [
    pytest.param(SM, r"^order:\n  label: Đơn hàng", "order:\n  label: [unclosed", SM, id="yaml-syntax"),
    pytest.param(SM, r"^      to: PENDING_DISPATCH\n", "", "order.transitions[0].to", id="missing-to"),
    pytest.param(PERM, r"^capabilities:", "capabilitiez:", "capabilities", id="missing-capabilities"),
]


@pytest.mark.ac("AC-SYS-005")
@pytest.mark.parametrize(("file", "pattern", "replacement", "expected"), BROKEN)
def test_broken_spec_stops_the_app(
    tmp_path: Path,
    make_app: Callable[..., FastAPI],
    file: str,
    pattern: str,
    replacement: str,
    expected: str,
) -> None:
    spec_dir = copy_specs(tmp_path)
    edit(spec_dir, file, pattern, replacement)
    with pytest.raises(SpecError) as excinfo:
        make_app(spec_dir=str(spec_dir))
    message = str(excinfo.value)
    assert file in message
    assert expected in message


INCONSISTENT = [
    pytest.param(SM, r"to: PENDING_DISPATCH", "to: PENDING", "PENDING", id="to-unknown-state"),
    pytest.param(
        SM,
        r"from: \[DRAFT\]\n      to: PENDING_DISPATCH",
        "from: [DRAFTX]\n      to: PENDING_DISPATCH",
        "DRAFTX",
        id="from-unknown-state",
    ),
    pytest.param(SM, r"^  initial: DRAFT", "  initial: NEW", "NEW", id="initial-unknown"),
    pytest.param(
        SM,
        r"guards: \[customer_present,",
        "guards: [customer_presence,",
        "customer_presence",
        id="guard-undeclared",
    ),
    pytest.param(
        SM,
        r"capability: order\.revise",
        "capability: order.revisit",
        "order.revisit",
        id="capability-unknown",
    ),
    pytest.param(
        SM,
        r"(command: start_dispatch.*\n.*\n.*\n      actor: system\n)",
        r"\1      capability: order.submit\n",
        "order.transitions[2]",
        id="capability-and-actor",
    ),
    pytest.param(
        SM,
        r"^      capability: order\.complete\n",
        "",
        "order.transitions[4]",
        id="neither-capability-nor-actor",
    ),
    pytest.param(
        SM,
        r"allowed_task_status: \[DONE\]",
        "allowed_task_status: [FINISHED]",
        "FINISHED",
        id="allowed-task-status-unknown",
    ),
    pytest.param(SM, r"\{ status: DONE, ", "{ status: FINISHED, ", "FINISHED", id="derived-status-unknown"),
    pytest.param(SM, r"(DRAFT: +\{ label: Nháp, +color: )todo", r"\1grey", "grey", id="color-unknown"),
    pytest.param(
        PERM,
        r"catalog\.manage: +\{ MANAGER: all \}",
        "catalog.manage: { ADMIN: all }",
        "ADMIN",
        id="capability-unknown-role",
    ),
    pytest.param(
        PERM,
        r"catalog\.manage: +\{ MANAGER: all \}",
        "catalog.manage: { MANAGER: everything }",
        "everything",
        id="capability-unknown-scope",
    ),
    pytest.param(
        PERM,
        r"capability: customer\.manage \}",
        "capability: customer.delete }",
        "customer.delete",
        id="menu-child-capability-unknown",
    ),
    pytest.param(PERM, r"\{ id: services,", "{ id: products,", "products", id="menu-duplicate-id"),
    pytest.param(
        PERM, r"^  - GET /api/v1/health", "  - /api/v1/health", "/api/v1/health", id="public-route-format"
    ),
    pytest.param(
        PERM,
        r"^    SALE: +\{ label: Tạo đơn,",
        "    SELLER:     { label: Tạo đơn,",
        "SELLER",
        id="primary-action-unknown-role",
    ),
    pytest.param(
        SM, r"^(    DRAFT: +\{ label: Nháp, +color: todo \}\n)", r"\1\1", "DRAFT", id="duplicate-yaml-key"
    ),
]


@pytest.mark.ac("AC-SYS-025")
@pytest.mark.parametrize(("file", "pattern", "replacement", "expected"), INCONSISTENT)
def test_inconsistent_spec_is_rejected(
    tmp_path: Path, file: str, pattern: str, replacement: str, expected: str
) -> None:
    spec_dir = copy_specs(tmp_path)
    edit(spec_dir, file, pattern, replacement)
    with pytest.raises(SpecError) as excinfo:
        load_specs(spec_dir)
    assert expected in str(excinfo.value)


@pytest.mark.ac("AC-SYS-029")
def test_unregistered_guard_stops_the_app(tmp_path: Path, make_app: Callable[..., FastAPI]) -> None:
    spec_dir = copy_specs(tmp_path)
    edit(spec_dir, SM, r"guards: \[customer_present,", "guards: [brand_new_guard, customer_present,")
    edit(spec_dir, SM, r"^guards:\n", "guards:\n  brand_new_guard: added without code\n")
    with pytest.raises(SpecError) as excinfo:
        make_app(spec_dir=str(spec_dir))
    assert "brand_new_guard" in str(excinfo.value)
