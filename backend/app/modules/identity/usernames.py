"""Usernames generated from the full name (M17-03b §2). Pure stdlib — the backfill migration imports it."""

import re
import unicodedata

USERNAME_PATTERN = r"^[a-z0-9]+(\.[a-z0-9]+)*$"
USERNAME_MAX_LENGTH = 50
# Leaves room for the duplicate number within USERNAME_MAX_LENGTH.
_BASE_MAX_LENGTH = 45
# A full name with no letter or digit at all (e.g. "???") still needs a login name.
_FALLBACK = "nhanvien"


def _ascii_word(word: str) -> str:
    decomposed = unicodedata.normalize("NFD", word.replace("đ", "d").replace("Đ", "D"))
    return re.sub(r"[^a-z0-9]", "", decomposed.lower())


def base_username(full_name: str) -> str:
    """ "Nguyễn Trần Tâm" → "tam.nt": last word, a dot, then the initial of every other word."""
    words = [w for w in (_ascii_word(part) for part in full_name.split()) if w]
    if not words:
        return _FALLBACK
    *others, last = words
    base = f"{last}.{''.join(w[0] for w in others)}" if others else last
    return base[:_BASE_MAX_LENGTH].rstrip(".")


def unique_username(base: str, taken: set[str]) -> str:
    """`base`, or `base2`, `base3`… — the first one not in `taken` (compared case-insensitively)."""
    lowered = {t.lower() for t in taken}
    candidate, n = base, 1
    while candidate in lowered:
        n += 1
        candidate = f"{base}{n}"
    return candidate
