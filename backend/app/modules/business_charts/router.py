"""`GET /api/v1/reports/business-charts/{results,sales,staff}` (M23a)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.modules.business_charts import service
from app.modules.business_charts.schemas import BusinessResultsOut, BusinessSalesOut, BusinessStaffOut, Metric
from app.modules.kpi_targets.schemas import MONTH_PATTERN

router = APIRouter(prefix="/api/v1/reports/business-charts", tags=["business-charts"])
Reader = Annotated[Actor, Depends(require("report.business_charts.read"))]
FromQuery = Annotated[str | None, Query(alias="from", pattern=MONTH_PATTERN, examples=["2026-09"])]
ToQuery = Annotated[str | None, Query(pattern=MONTH_PATTERN, examples=["2026-10"])]


def _period(request: Request, from_: str | None, to: str | None) -> service.Period:
    return service.resolve_period(from_, to, request.app.state.clock())


@router.get(
    "/results",
    operation_id="get_business_results_charts",
    summary="Biểu đồ: doanh thu & lợi nhuận theo tháng, cơ cấu, khách mới/quay lại",
    response_model=BusinessResultsOut,
)
def get_results(
    request: Request, session: DbSession, actor: Reader, from_: FromQuery = None, to: ToQuery = None
) -> BusinessResultsOut:
    return service.get_results(session, _period(request, from_, to))


@router.get(
    "/sales",
    operation_id="get_business_sales_charts",
    summary="Biểu đồ: Pareto 80/20, top bán chạy và bán chậm",
    response_model=BusinessSalesOut,
)
def get_sales(
    request: Request,
    session: DbSession,
    actor: Reader,
    from_: FromQuery = None,
    to: ToQuery = None,
    metric: Metric = "revenue",
) -> BusinessSalesOut:
    return service.get_sales(session, _period(request, from_, to), metric)


@router.get(
    "/staff",
    operation_id="get_business_staff_charts",
    summary="Biểu đồ: giờ được phân công theo KTV, tỷ lệ hoàn thành KPI",
    response_model=BusinessStaffOut,
)
def get_staff(
    request: Request, session: DbSession, actor: Reader, from_: FromQuery = None, to: ToQuery = None
) -> BusinessStaffOut:
    return service.get_staff(session, _period(request, from_, to))
