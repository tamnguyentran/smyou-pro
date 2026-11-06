"""`GET /api/v1/reports/revenue-by-product`, `/lines`, `/export` (M24-01a)."""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, Response

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.modules.revenue_report import product_service as service
from app.modules.revenue_report.employee_router import _resolve_range
from app.modules.revenue_report.product_service import Mode
from app.modules.revenue_report.schemas import ProductRevenueReportOut, RevenueLineOut

router = APIRouter(prefix="/api/v1/reports/revenue-by-product", tags=["revenue-report"])
Reader = Annotated[Actor, Depends(require("report.revenue.read"))]
DateFrom = Annotated[date | None, Query(alias="from")]
Status = Literal["COMPLETED", "NOT_COMPLETED"]
# `<uuid>` của `product_service_groups` hoặc `"ungrouped"` (đơn không có nhóm).
GroupId = Annotated[str | None, Query(max_length=64)]


@router.get(
    "",
    operation_id="get_revenue_by_product_report",
    summary="Báo cáo doanh thu theo nhóm SP/DV hoặc từng SP/DV",
    response_model=ProductRevenueReportOut,
)
def get_report(
    request: Request,
    session: DbSession,
    actor: Reader,
    mode: Mode = "group",
    date_from: DateFrom = None,
    to: date | None = None,
    status: Status = "COMPLETED",
    group_id: GroupId = None,
) -> ProductRevenueReportOut:
    resolved_from, resolved_to = _resolve_range(request, date_from, to)
    return service.get_report(
        session,
        actor,
        mode=mode,
        date_from=resolved_from,
        date_to=resolved_to,
        status=status,
        group_id=group_id,
    )


@router.get(
    "/lines",
    operation_id="get_revenue_by_product_lines",
    summary="Danh sách dòng hàng của 1 nhóm SP/DV hoặc 1 SP/DV (drilldown)",
    response_model=list[RevenueLineOut],
)
def get_lines(
    request: Request,
    session: DbSession,
    actor: Reader,
    mode: Mode,
    key: Annotated[str, Query(min_length=1, max_length=300)],
    date_from: DateFrom = None,
    to: date | None = None,
    status: Status = "COMPLETED",
    group_id: GroupId = None,
) -> list[RevenueLineOut]:
    resolved_from, resolved_to = _resolve_range(request, date_from, to)
    return service.get_lines(
        session,
        actor,
        mode=mode,
        key=key,
        date_from=resolved_from,
        date_to=resolved_to,
        status=status,
        group_id=group_id,
    )


@router.get(
    "/export",
    operation_id="export_revenue_by_product_report",
    summary="Xuất CSV báo cáo doanh thu theo SP/DV",
)
def export_report(
    request: Request,
    session: DbSession,
    actor: Reader,
    mode: Mode = "group",
    date_from: DateFrom = None,
    to: date | None = None,
    status: Status = "COMPLETED",
    group_id: GroupId = None,
) -> Response:
    resolved_from, resolved_to = _resolve_range(request, date_from, to)
    report = service.get_report(
        session,
        actor,
        mode=mode,
        date_from=resolved_from,
        date_to=resolved_to,
        status=status,
        group_id=group_id,
    )
    prefix = "doanh-thu-theo-nhom-sp-dv" if mode == "group" else "doanh-thu-theo-san-pham"
    filename = f"{prefix}-{resolved_from}_{resolved_to}.csv"
    return Response(
        content=service.build_csv(report),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
