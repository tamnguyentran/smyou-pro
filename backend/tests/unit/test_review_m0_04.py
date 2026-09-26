"""Review M0-04: sharper spec-loader checks (error messages, forbidden fields, all machines)."""

from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi import FastAPI

from app.core.spec_loader import SpecError, load_specs
from tests.spec_fixtures import copy_specs, edit

SM = "state_machines.yaml"
PERM = "permissions.yaml"


def rejected(spec_dir: Path) -> str:
    with pytest.raises(SpecError) as excinfo:
        load_specs(spec_dir)
    return str(excinfo.value)


@pytest.mark.ac("AC-SYS-005")
def test_non_utf8_file_is_a_spec_error_naming_the_file(tmp_path: Path) -> None:
    spec_dir = copy_specs(tmp_path)
    with (spec_dir / PERM).open("ab") as fh:
        fh.write(b"\xff\xfe")
    assert PERM in rejected(spec_dir)


@pytest.mark.ac("AC-SYS-005")
def test_unhashable_yaml_key_is_a_spec_error(tmp_path: Path) -> None:
    spec_dir = copy_specs(tmp_path)
    edit(spec_dir, SM, r"^version: 1\n", "version: 1\n? [a, b]\n: 1\n")
    assert SM in rejected(spec_dir)


@pytest.mark.ac("AC-SYS-005")
def test_syntax_error_reports_line(tmp_path: Path) -> None:
    spec_dir = copy_specs(tmp_path)
    edit(spec_dir, SM, r"^order:\n  label: Đơn hàng", "order:\n  label: [unclosed")
    assert "line" in rejected(spec_dir)


@pytest.mark.ac("AC-SYS-005")
def test_missing_file_is_a_spec_error(tmp_path: Path) -> None:
    spec_dir = copy_specs(tmp_path)
    (spec_dir / PERM).unlink()
    assert PERM in rejected(spec_dir)


@pytest.mark.ac("AC-SYS-025")
def test_unknown_field_is_forbidden(tmp_path: Path) -> None:
    spec_dir = copy_specs(tmp_path)
    edit(
        spec_dir,
        PERM,
        r"^  MANAGER: +\{ label: Quản lý chung \}",
        "  MANAGER:    { label: Quản lý chung, level: 1 }",
    )
    message = rejected(spec_dir)
    assert "roles.MANAGER.level" in message
    assert "Extra inputs" in message


@pytest.mark.ac("AC-SYS-025")
@pytest.mark.parametrize(
    ("file", "pattern", "replacement", "expected"),
    [
        (
            SM,
            r"to: IN_PROGRESS\n(      actor: system\n      effects: \[audit\])",
            r"to: IN_PROGRES\n\1",
            "order.transitions[2].to: unknown state 'IN_PROGRES'",
        ),
        (
            SM,
            r"(command: accept\n      from: \[PENDING\]\n      to: )ACCEPTED",
            r"\1ACCEPTD",
            "assignment.transitions[0].to: unknown state 'ACCEPTD'",
        ),
        (
            SM,
            r"(command: reopen\n      capability: )task\.reopen",
            r"\1task.reopenx",
            "task.commands[3].capability: 'task.reopenx'",
        ),
        (SM, r"guards: \[order_in_revision,", "guards: [order_in_revisionx,", "task.commands[3].guards"),
        (SM, r"(    DRAFT: +\{ label: Nháp, +color: todo \}\n)", r"\1\1", "duplicate key 'DRAFT'"),
        (
            SM,
            r"(command: start_dispatch.*\n.*\n.*\n      actor: system\n)",
            r"\1      capability: order.submit\n",
            "exactly one of `capability` or `actor`",
        ),
        (
            PERM,
            r"(    icon: History\n    path: /audit\n    capability: )audit\.read",
            r"\1audit.readx",
            "menu[7].capability: unknown capability 'audit.readx'",
        ),
    ],
)
def test_error_messages_point_at_the_exact_place(
    tmp_path: Path, file: str, pattern: str, replacement: str, expected: str
) -> None:
    spec_dir = copy_specs(tmp_path)
    edit(spec_dir, file, pattern, replacement)
    assert expected in rejected(spec_dir)


@pytest.mark.ac("AC-SYS-024")
def test_app_state_holds_full_specs(make_app: Callable[..., FastAPI]) -> None:
    specs = make_app().state.specs
    assert len(specs.state_machines.guards) == 20
    assert len(specs.state_machines.order.states) == 7
    assert specs.permissions.menu[0].id == "dashboard"
