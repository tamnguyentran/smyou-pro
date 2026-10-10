"""`GET /api/v1/kpi/report` + `/export` (M8-01a)."""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.core.authz import Actor, require
from app.core.db import DbSession
from app.modules.kpi import service
from app.modules.kpi.schemas import KpiReportOut

router = APIRouter(prefix="/api/v1/kpi", tags=["kpi"])
Reader = Annotated[Actor, Depends(require("kpi.read"))]
DateFrom = Annotated[date, Query(alias="from")]


@router.get(
    "/report", operation_id="get_kpi_report", summary="Báo cáo KPI thô theo KTV", response_model=KpiReportOut
)
def get_report(
    session: DbSession, actor: Reader, date_from: DateFrom, to: date, employee_id: uuid.UUID | None = None
) -> KpiReportOut:
    return service.get_report(session, actor, date_from=date_from, date_to=to, employee_id=employee_id)


@router.get("/report/export", operation_id="export_kpi_report", summary="Xuất CSV báo cáo KPI")
def export_report(
    session: DbSession, actor: Reader, date_from: DateFrom, to: date, employee_id: uuid.UUID | None = None
) -> Response:
    report = service.get_report(session, actor, date_from=date_from, date_to=to, employee_id=employee_id)
    csv_bytes = service.build_csv(report)
    filename = f"bao-cao-kpi-{date_from}_{to}.csv"
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
