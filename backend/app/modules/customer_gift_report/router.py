"""`GET /api/v1/reports/customer-gifts`, `/{customer_id}/items`, `/export` (M16-02a)."""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.modules.customer_gift_report import service
from app.modules.customer_gift_report.schemas import CustomerGiftReportOut
from app.modules.customer_gifts.schemas import CustomerGiftOut

router = APIRouter(prefix="/api/v1/reports/customer-gifts", tags=["customer-gift-report"])
Reader = Annotated[Actor, Depends(require("report.customer_gift.read"))]
DateFrom = Annotated[date | None, Query(alias="from")]


def _resolve_range(request: Request, date_from: date | None, to: date | None) -> tuple[date, date]:
    if date_from is not None and to is not None:
        return date_from, to
    default_from, default_to = service.default_date_range(request.app.state.clock())
    return date_from or default_from, to or default_to


@router.get(
    "",
    operation_id="get_customer_gift_report",
    summary="Báo cáo chi phí quà tặng KH theo khách hàng",
    response_model=CustomerGiftReportOut,
)
def get_report(
    request: Request,
    session: DbSession,
    actor: Reader,
    date_from: DateFrom = None,
    to: date | None = None,
    customer_id: uuid.UUID | None = None,
) -> CustomerGiftReportOut:
    resolved_from, resolved_to = _resolve_range(request, date_from, to)
    return service.get_report(
        session, actor, date_from=resolved_from, date_to=resolved_to, customer_id=customer_id
    )


@router.get(
    "/{customer_id}/items",
    operation_id="get_customer_gift_report_items",
    summary="Danh sách bản ghi tặng quà của 1 khách hàng trong khoảng (drilldown)",
    response_model=list[CustomerGiftOut],
)
def get_customer_items(
    request: Request,
    session: DbSession,
    actor: Reader,
    customer_id: uuid.UUID,
    date_from: DateFrom = None,
    to: date | None = None,
) -> list[CustomerGiftOut]:
    resolved_from, resolved_to = _resolve_range(request, date_from, to)
    return service.get_customer_items(
        session, actor, customer_id, date_from=resolved_from, date_to=resolved_to
    )


@router.get(
    "/export", operation_id="export_customer_gift_report", summary="Xuất CSV báo cáo chi phí quà tặng KH"
)
def export_report(
    request: Request,
    session: DbSession,
    actor: Reader,
    date_from: DateFrom = None,
    to: date | None = None,
    customer_id: uuid.UUID | None = None,
) -> Response:
    resolved_from, resolved_to = _resolve_range(request, date_from, to)
    report = service.get_report(
        session, actor, date_from=resolved_from, date_to=resolved_to, customer_id=customer_id
    )
    csv_bytes = service.build_csv(report)
    filename = f"chi-phi-qua-tang-kh-{resolved_from}_{resolved_to}.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
