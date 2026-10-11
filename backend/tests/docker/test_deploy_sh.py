"""scripts/deploy.sh local prechecks that need a real Docker daemon (M9-02).

Run by `make e2e`/`make smoke-prod` (marker `docker`). Does not need a real server:
the missing-image check must fail before the script ever reaches the ssh step.
"""

from pathlib import Path

import pytest

from tests.docker.stack import run_allow_failure

pytestmark = pytest.mark.docker

ROOT = Path(__file__).resolve().parents[3]
DEPLOY_SH = ROOT / "scripts" / "deploy.sh"


@pytest.mark.ac("AC-SYS-106")
def test_deploy_with_missing_local_image_fails_before_ssh() -> None:
    bogus_tag = "m9-02-no-such-image"
    result = run_allow_failure("bash", str(DEPLOY_SH), bogus_tag)
    assert result.returncode != 0
    assert "make build-prod" in result.stderr
    assert bogus_tag in result.stderr
