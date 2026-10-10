"""M8-04: `build_csv` thêm `'` trước ô `employee_code`/`employee_full_name` bắt đầu bằng
`=+-@` để Excel/Sheets không chạy như công thức (AC-KPI-027…029).
"""

import csv
import io
import uuid
from decimal import Decimal

import pytest

from app.modules.kpi.schemas import KpiReportOut, KpiRowOut, RejectionCounts
from app.modules.kpi.service import build_csv

_ZERO_COUNTS = RejectionCounts(BUSY=0, SICK=0, SKILL=0, DISTANCE=0, OTHER=0)


def _row(*, code: str, full_name: str) -> KpiRowOut:
    return KpiRowOut(
        employee_id=uuid.uuid4(),
        employee_code=code,
        employee_full_name=full_name,
        employee_is_active=True,
        completed_task_count=0,
        on_time_count=0,
        on_time_rate=None,
        rejection_counts=_ZERO_COUNTS,
        rejection_total=0,
        defect_count=0,
        estimated_hours_total=Decimal("0"),
        actual_hours_total=Decimal("0"),
        actual_hours_missing_count=0,
    )


def _csv_rows(report: KpiReportOut) -> list[list[str]]:
    text_content = build_csv(report).decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text_content))
    next(reader)  # header
    return list(reader)


@pytest.mark.ac("AC-KPI-027")
def test_full_name_starting_with_equals_is_escaped() -> None:
    report = KpiReportOut.model_validate(
        {"from": "2026-09-01", "to": "2026-09-30", "rows": [_row(code="NV001", full_name="=1+1")]}
    )

    rows = _csv_rows(report)

    assert rows[0][1] == "'=1+1"


@pytest.mark.ac("AC-KPI-028")
@pytest.mark.parametrize("prefix", ["+", "-", "@"])
def test_code_and_full_name_starting_with_dangerous_prefix_are_escaped(prefix: str) -> None:
    report = KpiReportOut.model_validate(
        {
            "from": "2026-09-01",
            "to": "2026-09-30",
            "rows": [_row(code=f"{prefix}NV001", full_name=f"{prefix}Tên nguy hiểm")],
        }
    )

    rows = _csv_rows(report)

    assert rows[0][0] == f"'{prefix}NV001"
    assert rows[0][1] == f"'{prefix}Tên nguy hiểm"


@pytest.mark.ac("AC-KPI-029")
def test_normal_full_name_is_not_escaped() -> None:
    report = KpiReportOut.model_validate(
        {
            "from": "2026-09-01",
            "to": "2026-09-30",
            "rows": [_row(code="NV014", full_name="Nguyễn Văn A")],
        }
    )

    rows = _csv_rows(report)

    assert rows[0][0] == "NV014"
    assert rows[0][1] == "Nguyễn Văn A"
