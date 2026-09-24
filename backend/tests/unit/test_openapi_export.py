import json
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "export_openapi.py"


def _export(target: Path) -> str:
    subprocess.run([sys.executable, str(SCRIPT), str(target)], check=True, capture_output=True, text=True)  # noqa: S603  # fixed script path, test-controlled args
    return target.read_text(encoding="utf-8")


@pytest.mark.ac("AC-SYS-011")
def test_openapi_export_is_deterministic_and_contains_health(tmp_path: Path) -> None:
    first = _export(tmp_path / "a.json")
    second = _export(tmp_path / "b.json")

    assert first == second
    spec = json.loads(first)
    assert spec["paths"]["/api/v1/health"]["get"]["operationId"] == "system_health"
    assert list(spec.keys()) == sorted(spec.keys())
