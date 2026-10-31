#!/usr/bin/env python3
"""Write the capability × role matrix of spec/permissions.yaml as JSON for the frontend (AC-EMP-080).

Run with the backend environment:  cd backend && uv run python ../scripts/export_permission_matrix.py <output.json>
"""

import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.spec_loader import PERMISSIONS_FILE, load_specs, permission_matrix_document  # noqa: E402  # needs sys.path set above
from app.modules.employees.domain import MANAGER_BUNDLE  # noqa: E402  # needs sys.path set above

SPEC_DIR = BACKEND_DIR.parent / "spec"


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: export_permission_matrix.py <output.json>", file=sys.stderr)
        return 2
    target = Path(sys.argv[1])
    source = (SPEC_DIR / PERMISSIONS_FILE).read_text(encoding="utf-8")
    doc = permission_matrix_document(load_specs(SPEC_DIR).permissions, source, MANAGER_BUNDLE)
    target.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
