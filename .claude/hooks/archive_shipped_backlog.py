#!/usr/bin/env python3
"""PostToolUse: keep BACKLOG.md small by moving a milestone section to the
archive file automatically, once every item directly under it is `[x]` —
so the file every /spec and /implement reads can't silently grow back.
Mirrors archive_resolved_questions.py's approach for OPEN_QUESTIONS.md.
Never blocks; any parse problem exits 0 and leaves both files untouched.
"""
import re
import sys
from pathlib import Path

SECTION_RE = re.compile(r"^## (M\d+)\b.*$")
POINTER_HEADING = "## Đã xong (tự động lưu trữ)"
BULLET_RE = re.compile(r"^- \[([ xSA~R])\]")


def split_sections(lines: list[str]) -> tuple[list[str], list[tuple[str, list[str]]]]:
    """Return (preamble lines before the first '## ' header, [(header_line, body_lines), ...])."""
    first = next((i for i, l in enumerate(lines) if l.startswith("## ")), None)
    if first is None:
        return lines, []
    preamble = lines[:first]
    sections = []
    i = first
    while i < len(lines):
        header = lines[i]
        j = i + 1
        while j < len(lines) and not lines[j].startswith("## "):
            j += 1
        sections.append((header, lines[i + 1 : j]))
        i = j
    return preamble, sections


def is_fully_done(body: list[str]) -> bool:
    markers = [m.group(1) for line in body if (m := BULLET_RE.match(line))]
    return bool(markers) and all(mark == "x" for mark in markers)


def ensure_pointer(preamble: list[str], archived_ids: list[str]) -> list[str]:
    out = list(preamble)
    heading_idx = next((i for i, l in enumerate(out) if l.strip() == POINTER_HEADING), None)
    new_lines = [f"- {mid} — xem `BACKLOG_ARCHIVE.md`." for mid in archived_ids]
    if heading_idx is None:
        if out and out[-1].strip():
            out.append("")
        out.append(POINTER_HEADING)
        out.extend(new_lines)
        out.append("")
        return out
    insert_at = heading_idx + 1
    while insert_at < len(out) and out[insert_at].startswith("- "):
        insert_at += 1
    existing = {out[i].split("—")[0].strip("- ").strip() for i in range(heading_idx + 1, insert_at)}
    to_add = [nl for nl, mid in zip(new_lines, archived_ids) if mid not in existing]
    out[insert_at:insert_at] = to_add
    return out


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    backlog = root / "docs/backlog/BACKLOG.md"
    archive = root / "docs/backlog/BACKLOG_ARCHIVE.md"
    if not backlog.is_file() or not archive.is_file():
        return 0

    lines = backlog.read_text(encoding="utf-8").splitlines()
    preamble, sections = split_sections(lines)

    already = archive.read_text(encoding="utf-8")
    already_ids = set(re.findall(r"^## (M\d+)\b", already, re.MULTILINE))

    keep_sections, to_archive, newly_archived_ids = [], [], []
    for header, body in sections:
        if header.strip() == POINTER_HEADING:
            keep_sections.append((header, body))
            continue
        m = SECTION_RE.match(header)
        milestone_id = m.group(1) if m else None
        if milestone_id and milestone_id not in already_ids and is_fully_done(body):
            to_archive.append((header, body))
            newly_archived_ids.append(milestone_id)
        else:
            keep_sections.append((header, body))

    if not to_archive:
        return 0

    archive_text = already.rstrip("\n") + "\n"
    for header, body in to_archive:
        archive_text += "\n" + header + "\n" + "\n".join(body).rstrip("\n") + "\n"
    archive.write_text(archive_text, encoding="utf-8")

    new_preamble = ensure_pointer(preamble, newly_archived_ids)
    new_lines = new_preamble
    for header, body in keep_sections:
        new_lines.append(header)
        new_lines.extend(body)
    backlog.write_text("\n".join(new_lines).rstrip("\n") + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
