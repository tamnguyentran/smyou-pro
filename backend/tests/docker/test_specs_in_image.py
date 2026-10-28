"""AC-SYS-030: the production image carries spec/ and loads it without any mount (run by make smoke-prod)."""

import os

import pytest

from app.core.spec_loader import load_specs
from tests.docker.stack import run
from tests.spec_fixtures import REPO_SPEC_DIR

pytestmark = pytest.mark.docker

BACKEND = f"smyou-backend:{os.environ.get('SMOKE_TAG', 'dev')}"
PROBE = (
    "from app.main import create_app; a = create_app(); s = a.state.specs; "
    "print(len(s.permissions.capabilities), len(s.state_machines.guards))"
)


@pytest.mark.ac("AC-SYS-030")
def test_prod_image_loads_bundled_specs() -> None:
    out = run(
        "docker", "run", "--rm", "--platform", "linux/amd64", "--entrypoint", "python", BACKEND, "-c", PROBE
    )
    repo = load_specs(REPO_SPEC_DIR)
    expected = [str(len(repo.permissions.capabilities)), str(len(repo.state_machines.guards))]
    assert out.split()[-2:] == expected
