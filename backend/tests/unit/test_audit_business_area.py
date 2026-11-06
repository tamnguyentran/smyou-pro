"""M21-04: every audit event maps to a "Nghiệp vụ" and every recorded action has a UI label
(AC-SYS-142, AC-SYS-143). Both are scans so a new EntityType / action fails here, not in prod."""

import re
from pathlib import Path

import pytest
import yaml

from app.modules.audit.domain import AUTH_ACTIONS, BusinessArea, EntityType, business_area
from tests.spec_fixtures import REPO_SPEC_DIR

MODULES_DIR = Path(__file__).resolve().parents[2] / "app" / "modules"
LABELS_TS = REPO_SPEC_DIR.parent / "frontend" / "src" / "features" / "audit" / "labels.ts"

# `action="x"`, `action = "x"` (orders dispatch), and dotted names passed positionally to a
# module's own _record helper (company_profile.update, kpi_target.set, ...).
_ACTION_KWARG = re.compile(r"\baction\s*=\s*\"([^\"]+)\"")
_DOTTED_ACTION = re.compile(r"\"((?:company_profile|kpi_target)\.[a-z_]+)\"")
# departments._save(session, actor, department, "create" | "activate"/"deactivate", ...)
_DEPARTMENT_SAVE = re.compile(r"_save\(\s*session,\s*actor,\s*department,\s*(.+?),", re.S)
_STRING = re.compile(r"\"([a-z_\-.]+)\"")


def _recorded_actions() -> set[str]:
    actions: set[str] = set()
    for path in MODULES_DIR.rglob("*.py"):
        source = path.read_text(encoding="utf-8")
        actions.update(_ACTION_KWARG.findall(source))
        actions.update(m for m in _DOTTED_ACTION.findall(source) if not m.endswith(".manage"))
        for arg in _DEPARTMENT_SAVE.findall(source):
            actions.update(_STRING.findall(arg))
    # orders.service records `action=command` for every order transition in the state machine.
    machines = yaml.safe_load((REPO_SPEC_DIR / "state_machines.yaml").read_text(encoding="utf-8"))
    actions.update(t["command"] for t in machines["order"]["transitions"])
    return actions


def _ui_action_labels() -> set[str]:
    source = LABELS_TS.read_text(encoding="utf-8")
    block = source.split("export const ACTION_LABELS", 1)[1].split("};", 1)[0]
    return set(re.findall(r"^\s*\"?([a-z_\-.]+)\"?\s*:", block, re.M))


@pytest.mark.ac("AC-SYS-142")
@pytest.mark.parametrize("entity_type", list(EntityType))
def test_every_entity_type_maps_to_a_business_area(entity_type: EntityType) -> None:
    assert isinstance(business_area(entity_type.value, "create"), BusinessArea)


@pytest.mark.ac("AC-SYS-142")
def test_employee_login_actions_are_auth_and_the_rest_employees() -> None:
    for action in AUTH_ACTIONS:
        assert business_area("EMPLOYEE", action) is BusinessArea.AUTH
    assert business_area("EMPLOYEE", "roles") is BusinessArea.EMPLOYEES
    assert business_area("PRODUCT", "update") is BusinessArea.CATALOG
    assert business_area("SERVICE", "create") is BusinessArea.CATALOG
    assert business_area("ASSIGNMENT", "accept") is BusinessArea.ASSIGNMENTS


@pytest.mark.ac("AC-SYS-142")
def test_unmapped_entity_type_is_an_error_not_a_silent_default() -> None:
    with pytest.raises(KeyError):
        business_area("NEW_THING", "create")


@pytest.mark.ac("AC-SYS-143")
def test_every_recorded_action_has_a_ui_label() -> None:
    recorded = _recorded_actions()
    # Sanity: the scan really sees the dynamic sources, not just literal kwargs.
    assert {"submit", "start_dispatch", "kpi_target.copy", "company_profile.update"} <= recorded
    missing = recorded - _ui_action_labels()
    assert not missing, f"thiếu nhãn ACTION_LABELS cho: {sorted(missing)}"
