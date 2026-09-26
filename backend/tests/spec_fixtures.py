"""Helpers to test the spec loader against edited copies of the repo's spec files."""

import re
import shutil
from pathlib import Path

REPO_SPEC_DIR = Path(__file__).resolve().parents[2] / "spec"


def copy_specs(tmp_path: Path) -> Path:
    target = tmp_path / "spec"
    shutil.copytree(REPO_SPEC_DIR, target)
    return target


def edit(spec_dir: Path, file: str, pattern: str, replacement: str) -> None:
    """Regex-replace the first match in spec_dir/file; fails loudly if the pattern is not found."""
    path = spec_dir / file
    text = path.read_text(encoding="utf-8")
    new, count = re.subn(pattern, replacement, text, count=1, flags=re.M)
    assert count == 1, f"pattern not found in {file}: {pattern!r}"
    path.write_text(new, encoding="utf-8")
