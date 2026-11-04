"""`GET /api/v1/reports/kpi-sales`, `/export` and `GET /api/v1/me/kpi-sales` (M21-02a)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.modules.kpi_targets import sales_service as service
from app.modules.kpi_targets.sales_schemas import KpiSalesReportOut, MyKpiSalesOut
from app.modules.kpi_targets.schemas import MONTH_PATTERN

router = APIRouter(prefix="/api/v1/reports/kpi-sales", tags=["kpi-sales-report"])
me_router = APIRouter(prefix="/api/v1/me", tags=["me"])
Reader = Annotated[Actor, Depends(require("report.kpi_sales.read"))]
Self = Annotated[Actor, Depends(require("profile.manage"))]
MonthQuery = Annotated[str | None, Query(pattern=MONTH_PATTERN, examples=["2026-11"])]


def _report(
    request: Request,
    session: DbSession,
    month: str | None,
    department_id: uuid.UUID | None,
    group_id: uuid.UUID | None,
    employee_id: uuid.UUID | None,
) -> KpiSalesReportOut:
    return service.get_report(
        session,
        service.resolve_month(month, request.app.state.clock()),
        department_id=department_id,
        group_id=group_id,
        employee_id=employee_id,
    )


@router.get(
    "",
    operation_id="get_kpi_sales_report",
    summary="Báo cáo KPI: doanh số, doanh thu thuần so với mục tiêu theo tháng",
    response_model=KpiSalesReportOut,
)
def get_report(
    request: Request,
    session: DbSession,
    actor: Reader,
    month: MonthQuery = None,
    department_id: uuid.UUID | None = None,
    group_id: uuid.UUID | None = None,
    employee_id: uuid.UUID | None = None,
) -> KpiSalesReportOut:
    return _report(request, session, month, department_id, group_id, employee_id)


@router.get("/export", operation_id="export_kpi_sales_report", summary="Xuất CSV báo cáo KPI")
def export_report(
    request: Request,
    session: DbSession,
    actor: Reader,
    month: MonthQuery = None,
    department_id: uuid.UUID | None = None,
    group_id: uuid.UUID | None = None,
    employee_id: uuid.UUID | None = None,
) -> Response:
    report = _report(request, session, month, department_id, group_id, employee_id)
    return Response(
        content=service.build_csv(report),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="bao-cao-kpi-{report.month}.csv"'},
    )


@me_router.get(
    "/kpi-sales",
    operation_id="me_kpi_sales",
    summary="KPI doanh số của tôi trong tháng",
    response_model=MyKpiSalesOut,
)
def my_kpi_sales(
    request: Request, session: DbSession, actor: Self, month: MonthQuery = None
) -> MyKpiSalesOut:
    return service.get_mine(session, actor.id, service.resolve_month(month, request.app.state.clock()))
