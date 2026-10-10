"""M8-01a: báo cáo KPI thô theo KTV + xuất CSV (AC-KPI-001…015)."""

import csv
import io
import uuid
from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi import FastAPI
from sqlalchemy import Connection, text

from app.core.authz import declared_routes
from tests.integration.conftest import AN, KHOA, Person, seed
from tests.integration.test_dispatch_api import HOA, TUAN, client_as, insert_order, problem

VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")

MINH = Person("minh.vo@smyou.vn", "Minh@SmYou26", ("TECHNICIAN",), "NV015", "Võ Thành Minh", "TECHNICAL")
LAN = Person("lan.do@smyou.vn", "Lan@SmYou26", ("TECHNICIAN",), "NV016", "Đỗ Thị Lan", "TECHNICAL")
DUNG = Person("dung.ho@smyou.vn", "Dung@SmYou26", ("TECHNICIAN",), "NV018", "Hồ Văn Dũng", "TECHNICAL")


def insert_task(
    db: Connection,
    order_id: uuid.UUID,
    *,
    code: str,
    due_at: datetime,
    created_by: uuid.UUID,
    estimated_hours: str = "1",
    status: str = "IN_PROGRESS",
) -> uuid.UUID:
    task_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO tasks (id, order_id, code, title, origin, created_in_revision, status,"
            " estimated_hours, due_at, priority, created_by)"
            " VALUES (:id, :order_id, :code, :code, 'INITIAL', 0, :status, :hours, :due_at,"
            " 'NORMAL', :created_by)"
        ),
        {
            "id": task_id,
            "order_id": order_id,
            "code": code,
            "status": status,
            "hours": estimated_hours,
            "due_at": due_at,
            "created_by": created_by,
        },
    )
    return task_id


def insert_assignment(
    db: Connection,
    task_id: uuid.UUID,
    employee_id: uuid.UUID,
    status: str,
    *,
    done_at: datetime | None = None,
    rejected_at: datetime | None = None,
    actual_hours: str | None = None,
    reject_reason_code: str | None = None,
) -> uuid.UUID:
    assignment_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO assignments (id, task_id, employee_id, cycle, status, assigned_by,"
            " done_at, rejected_at, actual_hours, reject_reason_code)"
            " VALUES (:id, :task_id, :employee_id, 1, :status, :employee_id,"
            " :done_at, :rejected_at, :actual_hours, :reject_reason_code)"
        ),
        {
            "id": assignment_id,
            "task_id": task_id,
            "employee_id": employee_id,
            "status": status,
            "done_at": done_at,
            "rejected_at": rejected_at,
            "actual_hours": actual_hours,
            "reject_reason_code": reject_reason_code,
        },
    )
    return assignment_id


def insert_defect_record(
    db: Connection,
    task_id: uuid.UUID,
    assignment_id: uuid.UUID,
    employee_id: uuid.UUID,
    *,
    created_at: datetime,
    excluded_from_kpi: bool = False,
    reported_by: uuid.UUID,
) -> uuid.UUID:
    defect_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO defect_records (id, task_id, cycle, assignment_id, employee_id, reason,"
            " severity, reported_by, excluded_from_kpi, created_at)"
            " VALUES (:id, :task_id, 1, :assignment_id, :employee_id, 'Làm lại', 'MINOR',"
            " :reported_by, :excluded, :created_at)"
        ),
        {
            "id": defect_id,
            "task_id": task_id,
            "assignment_id": assignment_id,
            "employee_id": employee_id,
            "reported_by": reported_by,
            "excluded": excluded_from_kpi,
            "created_at": created_at,
        },
    )
    return defect_id


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    ids = {p.code: seed(db, p) for p in (AN, HOA, TUAN, KHOA, MINH, LAN)}
    ids[DUNG.code] = seed(db, DUNG, is_active=False)
    return ids


@pytest.fixture
def report_data(db: Connection, people: dict[str, uuid.UUID]) -> dict[str, uuid.UUID]:
    order = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2609-K01")
    khoa = people["NV014"]
    minh = people["NV015"]
    dung = people["NV018"]

    # Khoa: 2 DONE assignments, 1 on-time + 1 late (AC-KPI-001).
    t1 = insert_task(
        db,
        order,
        code="DH2609-K01-T1",
        due_at=datetime(2026, 9, 10, 17, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
        estimated_hours="2",
    )
    a1 = insert_assignment(
        db, t1, khoa, "DONE", done_at=datetime(2026, 9, 10, 15, 0, tzinfo=VIETNAM), actual_hours="1.5"
    )
    t2 = insert_task(
        db,
        order,
        code="DH2609-K01-T2",
        due_at=datetime(2026, 9, 12, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
        estimated_hours="3",
    )
    a2 = insert_assignment(db, t2, khoa, "DONE", done_at=datetime(2026, 9, 12, 14, 0, tzinfo=VIETNAM))

    # Khoa: 3 REJECTED in range (2xDISTANCE, 1xSICK) + 1 REJECTED out of range (AC-KPI-002).
    t3 = insert_task(
        db,
        order,
        code="DH2609-K01-T3",
        due_at=datetime(2026, 9, 15, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    insert_assignment(
        db,
        t3,
        khoa,
        "REJECTED",
        rejected_at=datetime(2026, 9, 5, 9, 0, tzinfo=VIETNAM),
        reject_reason_code="DISTANCE",
    )
    t4 = insert_task(
        db,
        order,
        code="DH2609-K01-T4",
        due_at=datetime(2026, 9, 16, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    insert_assignment(
        db,
        t4,
        khoa,
        "REJECTED",
        rejected_at=datetime(2026, 9, 6, 9, 0, tzinfo=VIETNAM),
        reject_reason_code="DISTANCE",
    )
    t5 = insert_task(
        db,
        order,
        code="DH2609-K01-T5",
        due_at=datetime(2026, 9, 17, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    insert_assignment(
        db,
        t5,
        khoa,
        "REJECTED",
        rejected_at=datetime(2026, 9, 7, 9, 0, tzinfo=VIETNAM),
        reject_reason_code="SICK",
    )
    t6 = insert_task(
        db,
        order,
        code="DH2609-K01-T6",
        due_at=datetime(2026, 9, 18, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    insert_assignment(
        db,
        t6,
        khoa,
        "REJECTED",
        rejected_at=datetime(2026, 8, 20, 9, 0, tzinfo=VIETNAM),
        reject_reason_code="OTHER",
    )

    # Khoa: 2 defect_records in range, 1 excluded_from_kpi=true (AC-KPI-003).
    insert_defect_record(
        db, t1, a1, khoa, created_at=datetime(2026, 9, 11, 10, 0, tzinfo=VIETNAM), reported_by=people["NV010"]
    )
    insert_defect_record(
        db,
        t2,
        a2,
        khoa,
        created_at=datetime(2026, 9, 13, 10, 0, tzinfo=VIETNAM),
        excluded_from_kpi=True,
        reported_by=people["NV010"],
    )

    # Minh: some unrelated DONE data in range, so Khoa's self-scope must not see it (AC-KPI-008/009).
    t7 = insert_task(
        db,
        order,
        code="DH2609-K01-T7",
        due_at=datetime(2026, 9, 10, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    insert_assignment(
        db, t7, minh, "DONE", done_at=datetime(2026, 9, 10, 8, 0, tzinfo=VIETNAM), actual_hours="1"
    )

    # Dung: inactive, but has old DONE data in range — must still appear (AC-KPI-004).
    t8 = insert_task(
        db,
        order,
        code="DH2609-K01-T8",
        due_at=datetime(2026, 9, 10, 9, 0, tzinfo=VIETNAM),
        created_by=people["NV010"],
    )
    insert_assignment(
        db, t8, dung, "DONE", done_at=datetime(2026, 9, 10, 8, 0, tzinfo=VIETNAM), actual_hours="1"
    )

    # Lan: active, zero activity in range — must still appear with all-zero row (AC-KPI-004).
    return {"t1": t1, "t2": t2}


def rows_by_employee(res: Any) -> dict[str, dict[str, Any]]:
    assert res.status_code == 200, res.text
    return {row["employee_id"]: row for row in res.json()["rows"]}


QS = "from=2026-09-01&to=2026-09-30"


@pytest.mark.ac("AC-KPI-001")
def test_report_completed_hours_and_on_time(
    app: FastAPI, report_data: dict[str, uuid.UUID], people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    rows = rows_by_employee(an.get(f"/api/v1/kpi/report?{QS}"))
    khoa = rows[str(people["NV014"])]
    assert khoa["completed_task_count"] == 2
    assert khoa["on_time_count"] == 1
    assert khoa["on_time_rate"] == 0.5
    assert float(khoa["estimated_hours_total"]) == 5
    assert float(khoa["actual_hours_total"]) == 1.5
    assert khoa["actual_hours_missing_count"] == 1


@pytest.mark.ac("AC-KPI-002")
def test_report_rejection_counts_by_reason_within_range(
    app: FastAPI, report_data: dict[str, uuid.UUID], people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    rows = rows_by_employee(an.get(f"/api/v1/kpi/report?{QS}"))
    khoa = rows[str(people["NV014"])]
    assert khoa["rejection_counts"] == {"BUSY": 0, "SICK": 1, "SKILL": 0, "DISTANCE": 2, "OTHER": 0}
    assert khoa["rejection_total"] == 3


@pytest.mark.ac("AC-KPI-003")
def test_report_defect_count_excludes_flagged(
    app: FastAPI, report_data: dict[str, uuid.UUID], people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    rows = rows_by_employee(an.get(f"/api/v1/kpi/report?{QS}"))
    assert rows[str(people["NV014"])]["defect_count"] == 1


@pytest.mark.ac("AC-KPI-004")
def test_report_lists_all_technicians_incl_inactive_zero_rows(
    app: FastAPI, report_data: dict[str, uuid.UUID], people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    res = an.get(f"/api/v1/kpi/report?{QS}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert [row["employee_code"] for row in body["rows"]] == ["NV014", "NV015", "NV016", "NV018"]
    rows = rows_by_employee(res)
    lan = rows[str(people["NV016"])]
    assert lan["completed_task_count"] == 0
    assert lan["on_time_rate"] is None
    assert lan["rejection_total"] == 0
    assert lan["defect_count"] == 0
    assert float(lan["estimated_hours_total"]) == 0
    assert float(lan["actual_hours_total"]) == 0
    dung = rows[str(people["NV018"])]
    assert dung["employee_is_active"] is False
    assert dung["completed_task_count"] == 1


@pytest.mark.ac("AC-KPI-005")
def test_report_employee_id_filter_scope_all(
    app: FastAPI, report_data: dict[str, uuid.UUID], people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    res = an.get(f"/api/v1/kpi/report?{QS}&employee_id={people['NV014']}")
    assert res.status_code == 200, res.text
    assert [row["employee_id"] for row in res.json()["rows"]] == [str(people["NV014"])]


@pytest.mark.ac("AC-KPI-006")
def test_report_employee_id_not_technician_404(
    app: FastAPI, report_data: dict[str, uuid.UUID], people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    problem(an.get(f"/api/v1/kpi/report?{QS}&employee_id={people['NV005']}"), 404, "NOT_FOUND")


@pytest.mark.ac("AC-KPI-007")
def test_report_tech_lead_same_as_manager(
    app: FastAPI, report_data: dict[str, uuid.UUID], people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    tuan = client_as(app, TUAN)
    assert an.get(f"/api/v1/kpi/report?{QS}").json() == tuan.get(f"/api/v1/kpi/report?{QS}").json()


@pytest.mark.ac("AC-KPI-008")
def test_report_technician_scope_self_only(
    app: FastAPI, report_data: dict[str, uuid.UUID], people: dict[str, uuid.UUID]
) -> None:
    khoa = client_as(app, KHOA)
    res = khoa.get(f"/api/v1/kpi/report?{QS}")
    assert res.status_code == 200, res.text
    rows = res.json()["rows"]
    assert [row["employee_id"] for row in rows] == [str(people["NV014"])]
    assert rows[0]["completed_task_count"] == 2


@pytest.mark.ac("AC-KPI-009")
def test_report_technician_scope_ignores_employee_id_param(
    app: FastAPI, report_data: dict[str, uuid.UUID], people: dict[str, uuid.UUID]
) -> None:
    khoa = client_as(app, KHOA)
    res = khoa.get(f"/api/v1/kpi/report?{QS}&employee_id={people['NV015']}")
    assert res.status_code == 200, res.text
    assert [row["employee_id"] for row in res.json()["rows"]] == [str(people["NV014"])]


@pytest.mark.ac("AC-KPI-010")
def test_report_forbidden_without_capability(app: FastAPI, report_data: dict[str, uuid.UUID]) -> None:
    hoa = client_as(app, HOA)
    problem(hoa.get(f"/api/v1/kpi/report?{QS}"), 403, "FORBIDDEN")


@pytest.mark.ac("AC-KPI-011")
@pytest.mark.parametrize(
    "query",
    [
        "from=2026-09-30&to=2026-09-01",
        "to=2026-09-30",
        "from=2026-09-01",
        "from=2026-09-32&to=2026-09-30",
    ],
)
def test_report_date_validation_reversed_missing_malformed(
    app: FastAPI, report_data: dict[str, uuid.UUID], query: str
) -> None:
    an = client_as(app, AN)
    problem(an.get(f"/api/v1/kpi/report?{query}"), 422, "VALIDATION_ERROR")


@pytest.mark.ac("AC-KPI-012")
def test_report_vn_day_boundary(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    order = insert_order(db, created_by=people["NV005"], status="IN_PROGRESS", code="DH2609-K02")
    khoa = people["NV014"]
    due = datetime(2026, 9, 2, 0, 0, tzinfo=UTC)
    task = insert_task(db, order, code="DH2609-K02-T1", due_at=due, created_by=people["NV010"])
    # 2026-09-01 00:30 UTC == 2026-09-01 07:30 VN — falls inside the VN day 2026-09-01.
    insert_assignment(db, task, khoa, "DONE", done_at=datetime(2026, 9, 1, 0, 30, tzinfo=UTC))

    an = client_as(app, AN)
    rows = rows_by_employee(an.get("/api/v1/kpi/report?from=2026-09-01&to=2026-09-01"))
    assert rows[str(khoa)]["completed_task_count"] == 1


@pytest.mark.ac("AC-KPI-013")
def test_export_csv_headers_and_content(
    app: FastAPI, report_data: dict[str, uuid.UUID], people: dict[str, uuid.UUID]
) -> None:
    an = client_as(app, AN)
    res = an.get(f"/api/v1/kpi/report/export?{QS}")
    assert res.status_code == 200, res.text
    assert res.headers["content-type"] == "text/csv; charset=utf-8"
    assert (
        res.headers["content-disposition"] == 'attachment; filename="bao-cao-kpi-2026-09-01_2026-09-30.csv"'
    )
    raw = res.content
    assert raw.startswith(b"\xef\xbb\xbf")
    text_content = raw.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text_content))
    header = next(reader)
    assert header == [
        "Mã KTV",
        "Họ tên",
        "Số task xong",
        "Số đúng hạn",
        "Tỷ lệ đúng hạn",
        "Từ chối - Bận việc khác",
        "Từ chối - Ốm/bệnh",
        "Từ chối - Không đúng chuyên môn",
        "Từ chối - Quá xa",
        "Từ chối - Khác",
        "Tổng từ chối",
        "Số lỗi ghi nhận",
        "Giờ ước tính",
        "Giờ thực tế",
        "Số lần thiếu khai giờ thực tế",
    ]
    data_rows = {row[0]: row for row in reader}
    khoa_row = data_rows["NV014"]
    assert khoa_row[2] == "2"  # Số task xong
    assert khoa_row[3] == "1"  # Số đúng hạn
    assert khoa_row[10] == "3"  # Tổng từ chối
    assert khoa_row[11] == "1"  # Số lỗi ghi nhận


@pytest.mark.ac("AC-KPI-014")
def test_export_forbidden_without_capability(app: FastAPI, report_data: dict[str, uuid.UUID]) -> None:
    hoa = client_as(app, HOA)
    problem(hoa.get(f"/api/v1/kpi/report/export?{QS}"), 403, "FORBIDDEN")


@pytest.mark.ac("AC-KPI-015")
def test_export_technician_scope_self_only(
    app: FastAPI, report_data: dict[str, uuid.UUID], people: dict[str, uuid.UUID]
) -> None:
    khoa = client_as(app, KHOA)
    res = khoa.get(f"/api/v1/kpi/report/export?{QS}")
    assert res.status_code == 200, res.text
    text_content = res.content.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text_content))
    next(reader)  # header
    data_rows = list(reader)
    assert len(data_rows) == 1
    assert data_rows[0][0] == "NV014"


def test_report_route_declares_capability(app: FastAPI) -> None:
    routes = declared_routes(app)
    assert ("GET", "/api/v1/kpi/report", "kpi.read") in routes
    assert ("GET", "/api/v1/kpi/report/export", "kpi.read") in routes
