"""`GET /api/v1/reports/revenue-by-customer`, `/{customer_id}/lines`, `/export` (M16-06)."""

import uuid
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.modules.revenue_report import service
from app.modules.revenue_report.schemas import RevenueLineOut, RevenueReportOut

router = APIRouter(prefix="/api/v1/reports/revenue-by-customer", tags=["revenue-report"])
Reader = Annotated[Actor, Depends(require("report.revenue.read"))]
DateFrom = Annotated[date | None, Query(alias="from")]
Status = Literal["COMPLETED", "NOT_COMPLETED"]


def _resolve_range(request: Request, date_from: date | None, to: date | None) -> tuple[date, date]:
    if date_from is not None and to is not None:
        return date_from, to
    default_from, default_to = service.default_date_range(request.app.state.clock())
    return date_from or default_from, to or default_to


@router.get(
    "",
    operation_id="get_revenue_by_customer_report",
    summary="Báo cáo doanh thu theo khách hàng",
    response_model=RevenueReportOut,
)
def get_report(
    request: Request,
    session: DbSession,
    actor: Reader,
    date_from: DateFrom = None,
    to: date | None = None,
    customer_id: uuid.UUID | None = None,
    status: Status = "COMPLETED",
) -> RevenueReportOut:
    resolved_from, resolved_to = _resolve_range(request, date_from, to)
    return service.get_report(
        session, actor, date_from=resolved_from, date_to=resolved_to, customer_id=customer_id, status=status
    )


@router.get(
    "/{customer_id}/lines",
    operation_id="get_revenue_by_customer_lines",
    summary="Danh sách dòng hàng của 1 khách hàng theo người bán hoặc nhóm 'Chưa gán' (drilldown)",
    response_model=list[RevenueLineOut],
)
def get_customer_lines(
    request: Request,
    session: DbSession,
    actor: Reader,
    customer_id: uuid.UUID,
    date_from: DateFrom = None,
    to: date | None = None,
    status: Status = "COMPLETED",
    seller_id: uuid.UUID | None = None,
    unassigned: bool = False,
) -> list[RevenueLineOut]:
    resolved_from, resolved_to = _resolve_range(request, date_from, to)
    return service.get_customer_lines(
        session,
        actor,
        customer_id,
        date_from=resolved_from,
        date_to=resolved_to,
        status=status,
        seller_id=seller_id,
        unassigned=unassigned,
    )


@router.get("/export", operation_id="export_revenue_by_customer_report", summary="Xuất CSV báo cáo doanh thu")
def export_report(
    request: Request,
    session: DbSession,
    actor: Reader,
    date_from: DateFrom = None,
    to: date | None = None,
    customer_id: uuid.UUID | None = None,
    status: Status = "COMPLETED",
) -> Response:
    resolved_from, resolved_to = _resolve_range(request, date_from, to)
    report = service.get_report(
        session, actor, date_from=resolved_from, date_to=resolved_to, customer_id=customer_id, status=status
    )
    csv_bytes = service.build_csv(report)
    filename = f"doanh-thu-theo-khach-hang-{resolved_from}_{resolved_to}.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
