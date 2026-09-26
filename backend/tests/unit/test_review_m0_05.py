"""Review M0-05: nightly guards proven by running them; no silent green paths left in CI."""

import os
import re
import stat
import subprocess
from pathlib import Path
from typing import Any

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[3]
WORKFLOWS = ROOT / ".github" / "workflows"
REQUIRED_JOBS = {"backend", "frontend", "contract", "traceability", "e2e", "security", "image"}
SWALLOW = re.compile(r"\|\|\s*(true|:|exit 0)\b|\bset \+e\b")


def workflow(name: str) -> dict[Any, Any]:
    data = yaml.safe_load((WORKFLOWS / name).read_text(encoding="utf-8"))
    assert isinstance(data, dict)
    return data


def step_running(job: dict[str, Any], needle: str) -> str:
    runs = [s["run"] for s in job["steps"] if "run" in s and needle in s["run"]]
    assert len(runs) == 1, f"expected one step running {needle!r}, got {len(runs)}"
    return runs[0]


def run_step(script: str, cwd: Path) -> tuple[int, str, str]:
    """Run a workflow `run:` block like GitHub does (bash -e) with a `uv` stub that logs and fails."""
    bin_dir = cwd / "_bin"
    bin_dir.mkdir()
    log = cwd / "_uv.log"
    stub = bin_dir / "uv"
    stub.write_text(f'#!/bin/bash\necho "$*" >> "{log}"\nexit 1\n', encoding="utf-8")
    stub.chmod(stub.stat().st_mode | stat.S_IEXEC)
    env = {**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}"}
    result = subprocess.run(  # noqa: S603 - fixed argv, script comes from our own workflow file
        ["/bin/bash", "-e", "-c", script],
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    return result.returncode, result.stdout, log.read_text(encoding="utf-8") if log.exists() else ""


NIGHTLY_CASES = [
    ("mutation", "mutmut", "app/modules/orders/domain.py", "mutmut run"),
    ("stateful-long", "tests/stateful", "tests/stateful/test_x.py", "pytest tests/stateful"),
]


@pytest.mark.ac("AC-SYS-032")
@pytest.mark.parametrize(("job", "needle", "marker", "expected_call"), NIGHTLY_CASES)
def test_nightly_step_skips_without_code(
    tmp_path: Path, job: str, needle: str, marker: str, expected_call: str
) -> None:
    script = step_running(workflow("nightly.yml")["jobs"][job], needle)
    code, out, calls = run_step(script, tmp_path)
    assert code == 0
    assert "::notice::" in out
    assert "skipped" in out
    assert calls == "", "nothing may run while the code does not exist"


@pytest.mark.ac("AC-SYS-032")
@pytest.mark.parametrize(("job", "needle", "marker", "expected_call"), NIGHTLY_CASES)
def test_nightly_step_runs_and_fails_once_code_exists(
    tmp_path: Path, job: str, needle: str, marker: str, expected_call: str
) -> None:
    script = step_running(workflow("nightly.yml")["jobs"][job], needle)
    (tmp_path / marker).parent.mkdir(parents=True)
    (tmp_path / marker).write_text("", encoding="utf-8")
    code, out, calls = run_step(script, tmp_path)
    assert expected_call in calls
    assert "skipped" not in out
    assert code != 0, "a failing tool must fail the nightly step"


@pytest.mark.ac("AC-SYS-032")
def test_nightly_token_is_read_only() -> None:
    assert workflow("nightly.yml")["permissions"] == {"contents": "read"}


@pytest.mark.ac("AC-SYS-031")
def test_required_jobs_are_never_skipped_by_conditions() -> None:
    jobs = workflow("ci.yml")["jobs"]
    assert "detect" not in jobs, "scaffold detection is obsolete; skipped jobs count as passed checks"
    for name in REQUIRED_JOBS:
        assert "if" not in jobs[name], f"{name} can be skipped (a skipped required check counts as green)"


@pytest.mark.ac("AC-SYS-031")
def test_no_error_swallowing_variants() -> None:
    for name, job in workflow("ci.yml")["jobs"].items():
        for step in job.get("steps", []):
            if "run" in step and step.get("if") != "failure()":
                assert not SWALLOW.search(step["run"]), f"{name}: {step['run']!r}"


@pytest.mark.ac("AC-SYS-031")
def test_pull_request_trigger_has_no_filters() -> None:
    ci = workflow("ci.yml")
    on = ci.get("on", ci.get(True))
    assert on["pull_request"] in (None, {}), "path/branch filters could skip required checks"


@pytest.mark.ac("AC-SYS-031")
def test_image_job_builds_amd64_in_one_command_and_scans_both_images() -> None:
    job = workflow("ci.yml")["jobs"]["image"]
    runs = [s["run"] for s in job["steps"] if "run" in s]
    assert any(re.search(r"^make build-prod .*PLATFORM=linux/amd64", r) for r in runs), runs
    scans = [
        s["with"] for s in job["steps"] if str(s.get("uses", "")).startswith("aquasecurity/trivy-action@")
    ]
    assert {s["image-ref"] for s in scans} == {"smyou-backend:ci", "smyou-web:ci"}
    assert all(str(s["exit-code"]) == "1" for s in scans)
