"""`GET /api/v1/kpi/report` + `/export` (M8-01a) — số liệu KPI thô theo KTV & khoảng ngày.

Biên ngày quy đổi theo giờ Việt Nam, cùng mẫu `_vn_day_start_utc` ở `audit/service.py` (M1-05
AC-SYS-070) và `dashboard/service.py` (M7-02). Không chấm điểm/xếp hạng (Q10) — chỉ số liệu thô.
"""

import csv
import io
import uuid
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.authz import Actor
from app.core.errors import AppError
from app.modules.dispatch.models import Assignment, DefectRecord, Task
from app.modules.identity.models import Employee, EmployeeRole
from app.modules.kpi.schemas import KpiReportOut, KpiRowOut, RejectionCounts

VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")

_CSV_HEADER = [
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
_REASON_COLUMN_ORDER = ("BUSY", "SICK", "SKILL", "DISTANCE", "OTHER")


def _vn_day_start_utc(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=VIETNAM)


def get_report(
    session: Session, actor: Actor, *, date_from: date, date_to: date, employee_id: uuid.UUID | None
) -> KpiReportOut:
    if date_from > date_to:
        message = "Từ ngày không được sau Đến ngày."
        raise AppError(
            422,
            "VALIDATION_ERROR",
            message,
            errors=[{"field": "from", "code": "invalid_range", "message": message}],
        )

    employees_query = (
        select(Employee.id, Employee.code, Employee.full_name, Employee.is_active)
        .where(Employee.roles.any(EmployeeRole.role == "TECHNICIAN"))
        .order_by(Employee.code)
    )
    if "all" not in actor.scopes:
        employees_query = employees_query.where(Employee.id == actor.id)
    elif employee_id is not None:
        employees_query = employees_query.where(Employee.id == employee_id)
    employees = session.execute(employees_query).all()

    if employee_id is not None and "all" in actor.scopes and not employees:
        raise AppError(404, "NOT_FOUND", "Không tìm thấy tài nguyên.")

    employee_ids = [row.id for row in employees]
    occurred_from = _vn_day_start_utc(date_from)
    occurred_to_exclusive = _vn_day_start_utc(date_to + timedelta(days=1))

    completed = _completed_aggregates(session, employee_ids, occurred_from, occurred_to_exclusive)
    rejections = _rejection_aggregates(session, employee_ids, occurred_from, occurred_to_exclusive)
    defects = _defect_aggregates(session, employee_ids, occurred_from, occurred_to_exclusive)

    rows = []
    for row in employees:
        completed_count, on_time_count, estimated_total, actual_total, missing_count = completed.get(
            row.id, (0, 0, Decimal(0), Decimal(0), 0)
        )
        reason_counts = rejections.get(row.id, {})
        rows.append(
            KpiRowOut(
                employee_id=row.id,
                employee_code=row.code,
                employee_full_name=row.full_name,
                employee_is_active=row.is_active,
                completed_task_count=completed_count,
                on_time_count=on_time_count,
                on_time_rate=(
                    float(
                        (Decimal(on_time_count) / completed_count).quantize(
                            Decimal("0.0001"), rounding=ROUND_HALF_UP
                        )
                    )
                    if completed_count
                    else None
                ),
                rejection_counts=RejectionCounts(
                    **{code: reason_counts.get(code, 0) for code in _REASON_COLUMN_ORDER}
                ),
                rejection_total=sum(reason_counts.values()),
                defect_count=defects.get(row.id, 0),
                estimated_hours_total=estimated_total,
                actual_hours_total=actual_total,
                actual_hours_missing_count=missing_count,
            )
        )
    return KpiReportOut(**{"from": date_from}, to=date_to, rows=rows)


def _completed_aggregates(
    session: Session,
    employee_ids: list[uuid.UUID],
    occurred_from: datetime,
    occurred_to_exclusive: datetime,
) -> dict[uuid.UUID, tuple[int, int, Decimal, Decimal, int]]:
    if not employee_ids:
        return {}
    rows = session.execute(
        select(
            Assignment.employee_id,
            Assignment.done_at,
            Task.due_at,
            Task.estimated_hours,
            Assignment.actual_hours,
        )
        .join(Task, Task.id == Assignment.task_id)
        .where(
            Assignment.employee_id.in_(employee_ids),
            Assignment.status == "DONE",
            Assignment.done_at >= occurred_from,
            Assignment.done_at < occurred_to_exclusive,
        )
    ).all()
    aggregates: dict[uuid.UUID, tuple[int, int, Decimal, Decimal, int]] = {}
    for employee_id, done_at, due_at, estimated_hours, actual_hours in rows:
        count, on_time, est_total, act_total, missing = aggregates.get(
            employee_id, (0, 0, Decimal(0), Decimal(0), 0)
        )
        count += 1
        if done_at <= due_at:
            on_time += 1
        est_total += estimated_hours
        if actual_hours is None:
            missing += 1
        else:
            act_total += actual_hours
        aggregates[employee_id] = (count, on_time, est_total, act_total, missing)
    return aggregates


def _rejection_aggregates(
    session: Session,
    employee_ids: list[uuid.UUID],
    occurred_from: datetime,
    occurred_to_exclusive: datetime,
) -> dict[uuid.UUID, dict[str, int]]:
    if not employee_ids:
        return {}
    rows = session.execute(
        select(Assignment.employee_id, Assignment.reject_reason_code, func.count())
        .where(
            Assignment.employee_id.in_(employee_ids),
            Assignment.status == "REJECTED",
            Assignment.rejected_at >= occurred_from,
            Assignment.rejected_at < occurred_to_exclusive,
        )
        .group_by(Assignment.employee_id, Assignment.reject_reason_code)
    ).all()
    aggregates: dict[uuid.UUID, dict[str, int]] = {}
    for employee_id, reason_code, count in rows:
        aggregates.setdefault(employee_id, {})[reason_code] = count
    return aggregates


def _defect_aggregates(
    session: Session,
    employee_ids: list[uuid.UUID],
    occurred_from: datetime,
    occurred_to_exclusive: datetime,
) -> dict[uuid.UUID, int]:
    if not employee_ids:
        return {}
    rows = session.execute(
        select(DefectRecord.employee_id, func.count())
        .where(
            DefectRecord.employee_id.in_(employee_ids),
            DefectRecord.excluded_from_kpi.is_(False),
            DefectRecord.created_at >= occurred_from,
            DefectRecord.created_at < occurred_to_exclusive,
        )
        .group_by(DefectRecord.employee_id)
    ).all()
    counts: dict[uuid.UUID, int] = {}
    for employee_id, count in rows:
        counts[employee_id] = count
    return counts


def build_csv(report: KpiReportOut) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(_CSV_HEADER)
    for row in report.rows:
        writer.writerow(
            [
                row.employee_code,
                row.employee_full_name,
                row.completed_task_count,
                row.on_time_count,
                "" if row.on_time_rate is None else row.on_time_rate,
                row.rejection_counts.BUSY,
                row.rejection_counts.SICK,
                row.rejection_counts.SKILL,
                row.rejection_counts.DISTANCE,
                row.rejection_counts.OTHER,
                row.rejection_total,
                row.defect_count,
                row.estimated_hours_total,
                row.actual_hours_total,
                row.actual_hours_missing_count,
            ]
        )
    return ("﻿" + buffer.getvalue()).encode("utf-8")
