#!/usr/bin/env python3
"""Write the API's OpenAPI document as stable, sorted JSON.

Run with the backend environment:  cd backend && uv run python ../scripts/export_openapi.py <output.json>
The frontend generates its TypeScript API types from this file (ADR-010).
"""

import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.main import create_app  # noqa: E402  # needs sys.path set above


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: export_openapi.py <output.json>", file=sys.stderr)
        return 2
    target = Path(sys.argv[1])
    target.parent.mkdir(parents=True, exist_ok=True)
    spec = create_app().openapi()
    target.write_text(json.dumps(spec, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
