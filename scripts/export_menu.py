#!/usr/bin/env python3
"""Write the navigation part of spec/permissions.yaml as JSON for the frontend (AC-SYS-034).

Run with the backend environment:  cd backend && uv run python ../scripts/export_menu.py <output.json>
"""

import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.spec_loader import load_specs, menu_document  # noqa: E402  # needs sys.path set above

SPEC_DIR = BACKEND_DIR.parent / "spec"


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: export_menu.py <output.json>", file=sys.stderr)
        return 2
    target = Path(sys.argv[1])
    doc = menu_document(load_specs(SPEC_DIR).permissions)
    target.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
