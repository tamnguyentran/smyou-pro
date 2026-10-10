"""Response body for `GET /api/v1/dashboard` (M7-02)."""

from typing import Literal

from pydantic import BaseModel

from app.modules.assignments.schemas import MyAssignmentOut


class OrderStatusCounts(BaseModel):
    DRAFT: int
    PENDING_DISPATCH: int
    IN_PROGRESS: int
    AWAITING_CONFIRMATION: int
    COMPLETED: int
    REVISION: int
    CANCELLED: int


class OrderSummaryOut(BaseModel):
    scope: Literal["own", "all"]
    counts_by_status: OrderStatusCounts


class DispatchSummaryOut(BaseModel):
    pending_dispatch_count: int
    needs_assignee_count: int
    overdue_task_count: int


class DashboardOut(BaseModel):
    # Mọi khoá tuỳ chọn: `None` khi vai trò không phù hợp (router trả về với
    # response_model_exclude_none=True nên khoá vắng mặt hẳn trong JSON, không phải null).
    order_summary: OrderSummaryOut | None = None
    dispatch_summary: DispatchSummaryOut | None = None
    today_tasks: list[MyAssignmentOut] | None = None
