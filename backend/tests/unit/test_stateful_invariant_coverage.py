"""AC-SYS-094: every invariant listed in spec/state_machines.yaml must have exactly one
`@invariant()` method on `WorkflowMachine` (tests/stateful/test_workflow_stateful.py), with a
docstring matching the YAML line verbatim (stripped) — so nobody can add/remove a YAML invariant
without updating the stateful test.
"""

import inspect

import pytest
from hypothesis.stateful import INVARIANT_MARKER

from app.core.spec_loader import load_specs
from tests.spec_fixtures import REPO_SPEC_DIR
from tests.stateful.test_workflow_stateful import WorkflowMachine

SPECS = load_specs(REPO_SPEC_DIR)


def _invariant_docstrings() -> list[str]:
    docstrings = []
    for _name, member in inspect.getmembers(WorkflowMachine):
        invar = getattr(member, INVARIANT_MARKER, None)
        if invar is not None:
            assert invar.function.__doc__, f"{member.__name__} is missing a docstring"
            docstrings.append(invar.function.__doc__.strip())
    return docstrings


@pytest.mark.ac("AC-SYS-094")
def test_invariant_count_matches_yaml() -> None:
    yaml_invariants = SPECS.state_machines.invariants
    assert len(yaml_invariants) == 8
    assert len(_invariant_docstrings()) == len(yaml_invariants)


@pytest.mark.ac("AC-SYS-094")
def test_every_yaml_invariant_has_a_matching_invariant_method() -> None:
    yaml_invariants = {line.strip() for line in SPECS.state_machines.invariants}
    assert set(_invariant_docstrings()) == yaml_invariants
