"""Every guard named in spec/state_machines.yaml has code, or is explicitly pending for a backlog item."""

import re
from pathlib import Path

import pytest

from app.core.spec_loader import load_specs
from app.modules.workflow.guards import GUARDS, PENDING_GUARDS
from tests.spec_fixtures import REPO_SPEC_DIR

BACKLOG = Path(__file__).resolve().parents[3] / "docs" / "backlog" / "BACKLOG.md"


def backlog_status() -> dict[str, str]:
    text = BACKLOG.read_text(encoding="utf-8")
    return {m.group(2): m.group(1) for m in re.finditer(r"^- \[(.)\] \*\*(M\d-\d\d)\b", text, re.M)}


@pytest.mark.ac("AC-SYS-026")
def test_yaml_guards_are_implemented_or_pending() -> None:
    yaml_guards = set(load_specs(REPO_SPEC_DIR).state_machines.guards)
    implemented, pending = set(GUARDS), set(PENDING_GUARDS)
    assert yaml_guards, "no guards loaded"
    assert not (implemented & pending), f"both implemented and pending: {implemented & pending}"
    assert yaml_guards - implemented - pending == set(), "guards without code"
    assert (implemented | pending) - yaml_guards == set(), "registry names not in the YAML"


@pytest.mark.ac("AC-SYS-026")
def test_pending_guards_point_to_open_backlog_items() -> None:
    status = backlog_status()
    for guard, item in PENDING_GUARDS.items():
        assert item in status, f"{guard}: unknown backlog item {item}"
        assert status[item] != "x", f"{guard}: {item} is done — implement the guard and move it to GUARDS"


@pytest.mark.ac("AC-SYS-026")
def test_implemented_guards_are_callable() -> None:
    for name, fn in GUARDS.items():
        assert callable(fn), name
