"""`GET /api/v1/dashboard` (M7-02) + drill-down của từng thẻ `/cards/{card}/items|export` (M18-01a/b)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response

from app.core.authz import Actor, effective_scopes, require
from app.core.db import DbSession
from app.modules.dashboard import cards, service
from app.modules.dashboard.schemas import DashboardCardItemsOut, DashboardOut

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])
Reader = Annotated[Actor, Depends(require("dashboard.read"))]


@router.get(
    "",
    operation_id="get_dashboard",
    summary="Tổng quan theo vai trò",
    response_model=DashboardOut,
    # exclude_unset (not exclude_none): a section the caller's roles don't grant must be ABSENT
    # from the JSON (spec §4), but a present section's own nullable fields (e.g. task_description)
    # must stay as explicit `null`, not also get stripped — exclude_none would do that recursively.
    response_model_exclude_unset=True,
)
def get_dashboard(request: Request, session: DbSession, actor: Reader) -> DashboardOut:
    now = request.app.state.clock()
    return service.get_dashboard(session, actor, now=now)


def _show_prices(request: Request, actor: Actor, card: str) -> bool:
    """Tổng tiền chỉ hiện khi actor có `order.read_prices` scope "all" (fail-closed với scope hẹp hơn).
    Ngoại lệ M18-01b (AC-DASH-091): thẻ `mine.*` chỉ chứa đơn có phân công của chính actor, nên scope
    "assigned" (KTV, Q03) cũng đủ."""
    scopes = effective_scopes(request.app.state.specs.permissions, actor.roles, "order.read_prices")
    return "all" in scopes or (card.startswith("mine.") and "assigned" in scopes)


@router.get(
    "/cards/{card}/items",
    operation_id="get_dashboard_card_items",
    summary="Danh sách chi tiết tạo nên số trên 1 thẻ Tổng quan",
    response_model=DashboardCardItemsOut,
)
def get_card_items(
    request: Request,
    session: DbSession,
    actor: Reader,
    card: str,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> DashboardCardItemsOut:
    return cards.list_items(
        session,
        actor,
        card,
        now=request.app.state.clock(),
        page=page,
        page_size=page_size,
        show_prices=_show_prices(request, actor, card),
    )


@router.get(
    "/cards/{card}/export",
    operation_id="export_dashboard_card_items",
    summary="Xuất CSV toàn bộ danh sách của 1 thẻ Tổng quan",
)
def export_card_items(request: Request, session: DbSession, actor: Reader, card: str) -> Response:
    filename, content = cards.export_csv(
        session, actor, card, now=request.app.state.clock(), show_prices=_show_prices(request, actor, card)
    )
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
