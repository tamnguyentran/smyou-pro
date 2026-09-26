"""Loads and validates spec/state_machines.yaml and spec/permissions.yaml (business-rule source of truth)."""

from pathlib import Path
from typing import Any


class SpecError(Exception):
    """A spec file is unreadable, malformed or inconsistent. The app must not start."""


def load_specs(spec_dir: Path) -> Any:  # stub (M0-04 red phase)
    raise NotImplementedError
