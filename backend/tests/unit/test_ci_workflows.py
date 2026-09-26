"""M0-05: CI contract — every quality layer runs on PRs, nothing fails silently, nightly skips honestly."""

import re
from pathlib import Path
from typing import Any

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[3]
WORKFLOWS = ROOT / ".github" / "workflows"
REQUIRED_JOBS = {"backend", "frontend", "contract", "traceability", "e2e", "security", "image"}


def load(path: Path) -> dict[Any, Any]:
    assert path.is_file(), f"{path.relative_to(ROOT)} is missing"
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    assert isinstance(data, dict)
    return data


def triggers(workflow: dict[Any, Any]) -> dict[str, Any]:
    # PyYAML (YAML 1.1) reads the bare key `on` as the boolean True.
    value = workflow.get("on", workflow.get(True))
    assert isinstance(value, dict)
    return value


def run_lines(job: dict[str, Any]) -> list[tuple[dict[str, Any], str]]:
    return [(step, step["run"]) for step in job.get("steps", []) if "run" in step]


def uses(job: dict[str, Any]) -> list[dict[str, Any]]:
    return [step for step in job.get("steps", []) if "uses" in step]


@pytest.mark.ac("AC-SYS-031")
def test_ci_runs_every_required_job_on_prs_and_main() -> None:
    ci = load(WORKFLOWS / "ci.yml")
    on = triggers(ci)
    assert "pull_request" in on
    assert on["push"]["branches"] == ["main"]
    assert set(ci["jobs"]) >= REQUIRED_JOBS


@pytest.mark.ac("AC-SYS-031")
def test_ci_never_passes_on_failure() -> None:
    ci = load(WORKFLOWS / "ci.yml")
    for name, job in ci["jobs"].items():
        assert not job.get("continue-on-error"), name
        for step in job.get("steps", []):
            assert not step.get("continue-on-error"), f"{name}: {step}"
        for step, command in run_lines(job):
            if step.get("if") == "failure()":
                continue  # log collection after a failure may not mask the original error
            assert "|| true" not in command, f"{name}: `{command}` swallows errors"


@pytest.mark.ac("AC-SYS-031")
def test_image_job_builds_amd64_smokes_and_scans() -> None:
    job = load(WORKFLOWS / "ci.yml")["jobs"]["image"]
    commands = " ".join(cmd for _, cmd in run_lines(job))
    assert re.search(r"make build-prod \S*.*PLATFORM=linux/amd64", commands)
    assert "make smoke-prod" in commands
    trivy = [s for s in uses(job) if s["uses"].startswith("aquasecurity/trivy-action@")]
    assert trivy, "no trivy scan"
    assert str(trivy[0]["with"]["exit-code"]) == "1"


@pytest.mark.ac("AC-SYS-031")
def test_e2e_and_backend_jobs_enforce_their_gates() -> None:
    jobs = load(WORKFLOWS / "ci.yml")["jobs"]
    assert any(cmd.strip() == "make e2e" for _, cmd in run_lines(jobs["e2e"]))
    backend = " ".join(cmd for _, cmd in run_lines(jobs["backend"]))
    assert "--cov-fail-under=85" in backend


@pytest.mark.ac("AC-SYS-032")
@pytest.mark.parametrize(
    ("job", "marker"), [("mutation", "app/modules/*/domain.py"), ("stateful-long", "tests/stateful")]
)
def test_nightly_skips_with_notice_until_code_exists(job: str, marker: str) -> None:
    steps = run_lines(load(WORKFLOWS / "nightly.yml")["jobs"][job])
    guarded = [cmd for _, cmd in steps if marker in cmd]
    assert guarded, f"{job}: no step checks for {marker}"
    assert all("::notice::" in cmd and "skipped" in cmd for cmd in guarded), guarded


@pytest.mark.ac("AC-SYS-032")
def test_nightly_mutation_threshold_still_enforced() -> None:
    steps = " ".join(cmd for _, cmd in run_lines(load(WORKFLOWS / "nightly.yml")["jobs"]["mutation"]))
    assert "score >= 80" in steps
    assert "raise SystemExit(0 if score >= 80 else 1)" in steps


@pytest.mark.ac("AC-SYS-033")
def test_dependabot_covers_every_ecosystem_weekly() -> None:
    config = load(ROOT / ".github" / "dependabot.yml")
    assert config["version"] == 2
    entries = {(u["package-ecosystem"], u["directory"]) for u in config["updates"]}
    expected = {
        ("pip", "/backend"),
        ("npm", "/frontend"),
        ("github-actions", "/"),
        ("docker", "/backend"),
        ("docker", "/frontend"),
    }
    assert expected <= entries
    assert all(u["schedule"]["interval"] == "weekly" for u in config["updates"])
