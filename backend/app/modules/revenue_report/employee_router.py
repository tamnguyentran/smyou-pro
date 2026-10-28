"""`GET /api/v1/reports/revenue-by-employee`, `/lines`, `/export` (M16-05)."""

import uuid
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.modules.revenue_report import employee_service as service
from app.modules.revenue_report.schemas import EmployeeRevenueReportOut, RevenueLineOut
from app.modules.revenue_report.service import default_date_range

router = APIRouter(prefix="/api/v1/reports/revenue-by-employee", tags=["revenue-report"])
Reader = Annotated[Actor, Depends(require("report.revenue.read"))]
DateFrom = Annotated[date | None, Query(alias="from")]
Status = Literal["COMPLETED", "NOT_COMPLETED"]


def _resolve_range(request: Request, date_from: date | None, to: date | None) -> tuple[date, date]:
    if date_from is not None and to is not None:
        return date_from, to
    default_from, default_to = default_date_range(request.app.state.clock())
    return date_from or default_from, to or default_to


@router.get(
    "",
    operation_id="get_revenue_by_employee_report",
    summary="Báo cáo doanh thu theo nhân viên",
    response_model=EmployeeRevenueReportOut,
)
def get_report(
    request: Request,
    session: DbSession,
    actor: Reader,
    date_from: DateFrom = None,
    to: date | None = None,
    employee_id: uuid.UUID | None = None,
    status: Status = "COMPLETED",
) -> EmployeeRevenueReportOut:
    resolved_from, resolved_to = _resolve_range(request, date_from, to)
    return service.get_report(
        session, actor, date_from=resolved_from, date_to=resolved_to, employee_id=employee_id, status=status
    )


@router.get(
    "/lines",
    operation_id="get_revenue_by_employee_lines",
    summary="Danh sách dòng hàng của 1 nhân viên hoặc nhóm 'Chưa gán' (drilldown)",
    response_model=list[RevenueLineOut],
)
def get_lines(
    request: Request,
    session: DbSession,
    actor: Reader,
    employee_id: uuid.UUID | None = None,
    unassigned: bool = False,
    date_from: DateFrom = None,
    to: date | None = None,
    status: Status = "COMPLETED",
) -> list[RevenueLineOut]:
    resolved_from, resolved_to = _resolve_range(request, date_from, to)
    return service.get_lines(
        session,
        actor,
        date_from=resolved_from,
        date_to=resolved_to,
        status=status,
        employee_id=employee_id,
        unassigned=unassigned,
    )


@router.get("/export", operation_id="export_revenue_by_employee_report", summary="Xuất CSV báo cáo doanh thu")
def export_report(
    request: Request,
    session: DbSession,
    actor: Reader,
    date_from: DateFrom = None,
    to: date | None = None,
    employee_id: uuid.UUID | None = None,
    status: Status = "COMPLETED",
) -> Response:
    resolved_from, resolved_to = _resolve_range(request, date_from, to)
    report = service.get_report(
        session, actor, date_from=resolved_from, date_to=resolved_to, employee_id=employee_id, status=status
    )
    csv_bytes = service.build_csv(report)
    filename = f"doanh-thu-theo-nhan-vien-{resolved_from}_{resolved_to}.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
