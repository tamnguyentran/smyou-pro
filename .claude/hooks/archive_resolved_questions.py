#!/usr/bin/env python3
"""PostToolUse: keep OPEN_QUESTIONS.md small by moving rows marked done to
the archive file automatically, right when they're edited — so the file
AI reads on every /spec can't silently grow back. Never blocks; any
parse problem exits 0 and leaves both files untouched."""
import re
import sys
from pathlib import Path

DONE_MARKERS = {"✅"}
ROW_RE = re.compile(r"^\|\s*(Q\d+)\s*\|.*\|\s*([^\|]*?)\s*\|\s*$")


def split_header_and_rows(lines: list[str]) -> tuple[list[str], list[str]]:
    header_end = 0
    for i, line in enumerate(lines):
        if line.strip().startswith("|---"):
            header_end = i + 1
            break
    return lines[: header_end + 0], lines[header_end:] if header_end else ([], lines)


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    open_q = root / "docs/product/OPEN_QUESTIONS.md"
    archive = root / "docs/product/OPEN_QUESTIONS_ARCHIVE.md"
    if not open_q.is_file() or not archive.is_file():
        return 0

    text = open_q.read_text(encoding="utf-8")
    lines = text.splitlines()

    sep_idx = next((i for i, l in enumerate(lines) if l.strip().startswith("|---")), None)
    if sep_idx is None:
        return 0

    before = lines[: sep_idx + 1]
    body = lines[sep_idx + 1 :]

    keep, moved = [], []
    for line in body:
        if not line.strip().startswith("|"):
            keep.append(line)
            continue
        m = ROW_RE.match(line)
        if m and m.group(2).strip() in DONE_MARKERS:
            moved.append(line)
        else:
            keep.append(line)

    if not moved:
        return 0

    already = archive.read_text(encoding="utf-8")
    already_ids = set(re.findall(r"^\|\s*(Q\d+)\s*\|", already, re.MULTILINE))
    new_rows = [l for l in moved if (m := ROW_RE.match(l)) and m.group(1) not in already_ids]
    if not new_rows:
        # already archived (e.g. hook ran twice) — still drop them from the active file
        open_q.write_text("\n".join(before + keep) + "\n", encoding="utf-8")
        return 0

    archive_text = already.rstrip("\n") + "\n" + "\n".join(new_rows) + "\n"
    archive.write_text(archive_text, encoding="utf-8")
    open_q.write_text("\n".join(before + keep) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
