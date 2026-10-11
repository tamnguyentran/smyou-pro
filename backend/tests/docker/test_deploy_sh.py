"""scripts/deploy.sh local prechecks that need a real Docker daemon (M9-02).

Run by `make e2e`/`make smoke-prod` (marker `docker`). Does not need a real server:
the missing-image check must fail before the script ever reaches the ssh step.
"""

import subprocess
from pathlib import Path

import pytest

pytestmark = pytest.mark.docker

ROOT = Path(__file__).resolve().parents[3]
DEPLOY_SH = ROOT / "scripts" / "deploy.sh"


@pytest.mark.ac("AC-SYS-106")
def test_deploy_with_missing_local_image_fails_before_ssh() -> None:
    bogus_tag = "m9-02-no-such-image"
    result = subprocess.run(
        ["bash", str(DEPLOY_SH), bogus_tag],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode != 0
    assert "make build-prod" in result.stderr
    assert bogus_tag in result.stderr
