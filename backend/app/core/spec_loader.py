"""Loads and validates spec/state_machines.yaml and spec/permissions.yaml (business-rule source of truth).

Two layers: Pydantic models reject malformed or unknown fields; cross-checks reject references that
do not resolve (states, guards, capabilities, roles, scopes, menu ids). Any problem raises SpecError,
and create_app() lets it propagate so the app never starts on a broken spec.
"""

import re
from collections.abc import Hashable, Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

STATE_MACHINES_FILE = "state_machines.yaml"
PERMISSIONS_FILE = "permissions.yaml"
PUBLIC_ROUTE = re.compile(r"^(GET|POST|PUT|PATCH|DELETE) /\S*$")


class SpecError(Exception):
    """A spec file is unreadable, malformed or inconsistent. The app must not start."""


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)


# ---------------- state_machines.yaml ----------------
Color = Literal["todo", "in_progress", "review", "completed", "urgent"]


class StateDef(_Strict):
    label: str
    color: Color
    terminal: bool = False


class Transition(_Strict):
    command: str
    from_: list[str] = Field(alias="from", min_length=1)
    to: str
    capability: str | None = None
    actor: Literal["system", "assignee"] | None = None
    guards: list[str] = []
    effects: list[str] = []

    @model_validator(mode="after")
    def _one_authority(self) -> "Transition":
        if (self.capability is None) == (self.actor is None):
            raise ValueError("needs exactly one of `capability` or `actor`")
        return self


class Machine(_Strict):
    label: str
    initial: str
    states: dict[str, StateDef]
    transitions: list[Transition]


class DerivedRule(_Strict):
    status: str
    when: str


class TaskCommand(_Strict):
    command: str
    capability: str
    allowed_task_status: list[str] = []
    guards: list[str] = []
    effects: list[str] = []
    origin: str | None = None


class TaskMachine(_Strict):
    label: str
    derived_status: list[DerivedRule]
    states: dict[str, StateDef]
    commands: list[TaskCommand]


class StateMachinesSpec(_Strict):
    version: int
    order: Machine
    task: TaskMachine
    assignment: Machine
    reject_reason_codes: dict[str, str]
    guards: dict[str, str]
    invariants: list[str]


# ---------------- permissions.yaml ----------------
class Role(_Strict):
    label: str


class MenuItem(_Strict):
    id: str
    label: str
    icon: str
    path: str | None = None
    capability: str | None = None
    badge: str | None = None
    children: list["MenuItem"] = []


class PrimaryAction(_Strict):
    label: str
    icon: str
    path: str


class BottomNav(_Strict):
    items: list[str]
    primary_action: dict[str, PrimaryAction | None]


class PermissionsSpec(_Strict):
    version: int
    roles: dict[str, Role]
    scopes: list[str]
    capabilities: dict[str, dict[str, str]]
    public_routes: list[str]
    menu: list[MenuItem]
    mobile_bottom_nav: BottomNav


@dataclass(frozen=True)
class Specs:
    state_machines: StateMachinesSpec
    permissions: PermissionsSpec


# ---------------- loading ----------------
class _UniqueKeyLoader(yaml.SafeLoader):
    """SafeLoader that rejects duplicate keys (plain PyYAML silently keeps the last one)."""

    def construct_mapping(self, node: yaml.MappingNode, deep: bool = False) -> dict[Any, Any]:
        seen: set[Any] = set()
        for key_node, _ in node.value:
            key = self.construct_object(key_node, deep=deep)
            if not isinstance(key, Hashable):
                continue  # super() raises a proper ConstructorError for unhashable keys
            if key in seen:
                raise yaml.constructor.ConstructorError(
                    None, None, f"duplicate key {key!r}", key_node.start_mark
                )
            seen.add(key)
        return super().construct_mapping(node, deep=deep)


def _read_yaml(text: str) -> Any:
    loader = _UniqueKeyLoader(text)
    try:
        return loader.get_single_data()
    finally:
        loader.dispose()


def _path(loc: Iterable[int | str]) -> str:
    out = ""
    for part in loc:
        out += f"[{part}]" if isinstance(part, int) else (f".{part}" if out else str(part))
    return out


def _parse[M: BaseModel](spec_dir: Path, file: str, model: type[M]) -> M:
    path = spec_dir / file
    try:
        raw = _read_yaml(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise SpecError(f"{file}: cannot read {path}: {exc.strerror}") from exc
    except UnicodeDecodeError as exc:
        raise SpecError(f"{file}: not valid UTF-8 (byte {exc.start})") from exc
    except yaml.YAMLError as exc:
        raise SpecError(f"{file}: invalid YAML: {exc}") from exc
    try:
        return model.model_validate(raw)
    except ValidationError as exc:
        lines = []
        for err in exc.errors():
            got = err.get("input")
            suffix = f" (got {got!r})" if isinstance(got, str | int | float) else ""
            lines.append(f"{file}: {_path(err['loc']) or '<root>'}: {err['msg']}{suffix}")
        raise SpecError("\n".join(lines)) from exc


def _check_state_machines(sm: StateMachinesSpec, capabilities: set[str]) -> list[str]:
    problems: list[str] = []
    f = STATE_MACHINES_FILE

    def check_refs(where: str, guards: list[str], capability: str | None) -> None:
        problems.extend(
            f"{f}: {where}.guards: unknown guard {g!r} (declare it under `guards:`)"
            for g in guards
            if g not in sm.guards
        )
        if capability is not None and capability not in capabilities:
            problems.append(
                f"{f}: {where}.capability: {capability!r} is not a capability in {PERMISSIONS_FILE}"
            )

    def check_machine(name: str, machine: Machine) -> None:
        states = set(machine.states)
        if machine.initial not in states:
            problems.append(f"{f}: {name}.initial: unknown state {machine.initial!r}")
        for i, t in enumerate(machine.transitions):
            where = f"{name}.transitions[{i}]"
            problems.extend(f"{f}: {where}.from: unknown state {s!r}" for s in t.from_ if s not in states)
            if t.to not in states:
                problems.append(f"{f}: {where}.to: unknown state {t.to!r}")
            check_refs(where, t.guards, t.capability)

    check_machine("order", sm.order)
    check_machine("assignment", sm.assignment)
    task_states = set(sm.task.states)
    for i, rule in enumerate(sm.task.derived_status):
        if rule.status not in task_states:
            problems.append(f"{f}: task.derived_status[{i}].status: unknown state {rule.status!r}")
    for i, cmd in enumerate(sm.task.commands):
        where = f"task.commands[{i}]"
        problems.extend(
            f"{f}: {where}.allowed_task_status: unknown state {s!r}"
            for s in cmd.allowed_task_status
            if s not in task_states
        )
        check_refs(where, cmd.guards, cmd.capability)
    return problems


def _check_permissions(perm: PermissionsSpec) -> list[str]:
    problems: list[str] = []
    f = PERMISSIONS_FILE
    roles, scopes = set(perm.roles), set(perm.scopes)
    for cap, grants in perm.capabilities.items():
        for role, scope in grants.items():
            if role not in roles:
                problems.append(f"{f}: capabilities.{cap}: unknown role {role!r}")
            if scope not in scopes:
                problems.append(f"{f}: capabilities.{cap}.{role}: unknown scope {scope!r}")
    for route in perm.public_routes:
        if not PUBLIC_ROUTE.match(route):
            problems.append(f"{f}: public_routes: {route!r} must look like 'GET /api/v1/...'")

    seen_ids: set[str] = set()

    def walk(items: list[MenuItem], where: str) -> None:
        for i, item in enumerate(items):
            here = f"{where}[{i}]"
            if item.id in seen_ids:
                problems.append(f"{f}: {here}.id: duplicate menu id {item.id!r}")
            seen_ids.add(item.id)
            if item.capability is not None and item.capability not in perm.capabilities:
                problems.append(f"{f}: {here}.capability: unknown capability {item.capability!r}")
            walk(item.children, f"{here}.children")

    walk(perm.menu, "menu")
    for role in perm.mobile_bottom_nav.primary_action:
        if role not in roles:
            problems.append(f"{f}: mobile_bottom_nav.primary_action: unknown role {role!r}")
    return problems


def load_specs(spec_dir: Path) -> Specs:
    """Parse and cross-check both spec files; raise SpecError listing every problem found."""
    state_machines = _parse(spec_dir, STATE_MACHINES_FILE, StateMachinesSpec)
    permissions = _parse(spec_dir, PERMISSIONS_FILE, PermissionsSpec)
    problems = _check_permissions(permissions)
    problems += _check_state_machines(state_machines, set(permissions.capabilities))
    if problems:
        raise SpecError("\n".join(problems))
    return Specs(state_machines=state_machines, permissions=permissions)


def check_guard_registry(specs: Specs, implemented: Iterable[str], pending: Iterable[str]) -> None:
    """Every guard named in the YAML must have code, or be explicitly pending for a backlog item."""
    missing = sorted(set(specs.state_machines.guards) - set(implemented) - set(pending))
    if missing:
        raise SpecError(
            f"{STATE_MACHINES_FILE}: guards without code "
            f"(add to GUARDS or PENDING_GUARDS): {', '.join(missing)}"
        )


def menu_document(permissions: PermissionsSpec) -> dict[str, Any]:
    """What the frontend needs to draw navigation (frontend/src/app/menu.json, AC-SYS-034)."""
    return {
        "roles": {role: spec.label for role, spec in permissions.roles.items()},
        "menu": [item.model_dump(mode="json") for item in permissions.menu],
        "mobile_bottom_nav": permissions.mobile_bottom_nav.model_dump(mode="json"),
    }
