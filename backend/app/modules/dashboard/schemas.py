"""Response bodies for `GET /api/v1/dashboard` (M7-02) and its card drill-down (M18-01a)."""

import uuid
from datetime import datetime
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
    overdue_count: int


class DispatchSummaryOut(BaseModel):
    pending_dispatch_count: int
    in_progress_order_count: int
    needs_assignee_count: int
    overdue_task_count: int


class TaskStatusCounts(BaseModel):
    NEEDS_ASSIGNEE: int
    PENDING_ACCEPTANCE: int
    ACCEPTED: int
    IN_PROGRESS: int
    DONE: int
    CANCELLED: int


class TaskSummaryOut(BaseModel):
    counts_by_status: TaskStatusCounts


class StaffStatusCounts(BaseModel):
    IN_PROGRESS: int
    NOT_STARTED: int
    IDLE: int


class StaffSummaryOut(BaseModel):
    active_technician_count: int
    counts_by_status: StaffStatusCounts
    pending_acceptance_count: int


class MyTaskSummaryOut(BaseModel):
    pending_count: int
    active_count: int
    done_today_count: int
    not_started_count: int
    overdue_count: int
    awaiting_confirmation_count: int


class CareSummaryOut(BaseModel):
    today: int
    month: int


class TopCustomerOut(BaseModel):
    customer_id: uuid.UUID
    customer_code: str
    customer_name: str
    order_count: int
    total_revenue: int


class DashboardOut(BaseModel):
    # Mọi khoá tuỳ chọn: `None` khi vai trò không phù hợp (router trả về với
    # response_model_exclude_none=True nên khoá vắng mặt hẳn trong JSON, không phải null).
    order_summary: OrderSummaryOut | None = None
    dispatch_summary: DispatchSummaryOut | None = None
    task_summary: TaskSummaryOut | None = None
    staff_summary: StaffSummaryOut | None = None
    my_task_summary: MyTaskSummaryOut | None = None
    today_tasks: list[MyAssignmentOut] | None = None
    # M15-04: company-wide, không scope theo actor — xem decision log trong dashboard/service.py.
    top_customers: list[TopCustomerOut] | None = None
    feedback_summary: dict[str, int] | None = None
    # M16-03: company-wide, cùng điều kiện vai trò với top_customers/feedback_summary.
    care_summary: CareSummaryOut | None = None
    care_staff_count: int | None = None
    orders_needing_revision_count: int | None = None


class DashboardOrderRow(BaseModel):
    order_id: uuid.UUID
    order_code: str
    customer_name: str | None
    customer_phone: str | None
    created_by_name: str
    status: str
    created_at: datetime
    # M18-01a: `None` khi actor không có `order.read_prices` (scope "all").
    total: int | None


class DashboardTaskRow(BaseModel):
    task_id: uuid.UUID
    task_code: str
    task_title: str
    order_id: uuid.UUID
    order_code: str
    customer_name: str | None
    assignee_names: list[str]
    due_at: datetime
    status: str
    # M18-01b: trạng thái phân công của chính người gọi — chỉ thẻ `mine.*`, `None` với thẻ khác.
    assignment_status: str | None = None


class DashboardStaffRow(BaseModel):
    """M18-01b: 1 KTV trong popup 3 thẻ nhóm của khối "Nhân sự kỹ thuật"."""

    employee_id: uuid.UUID
    employee_code: str
    full_name: str
    phone: str | None
    open_assignment_count: int
    in_progress_assignment_count: int


class DashboardFeedbackRow(BaseModel):
    """M18-01c: 1 đơn đã ghi phản hồi — popup "Khách hàng đã chăm sóc" và thẻ n★."""

    order_id: uuid.UUID
    order_code: str
    customer_name: str | None
    customer_phone: str | None
    csat_rating: int
    csat_comment: str | None
    recorded_by_name: str | None
    recorded_at: datetime
    completed_at: datetime | None


class DashboardCareStaffRow(BaseModel):
    """M18-01c: 1 nhân viên đã ghi phản hồi trong tháng — popup "NV đã gọi điện CSKH"."""

    employee_id: uuid.UUID
    employee_code: str
    full_name: str
    care_count: int
    last_recorded_at: datetime


class DashboardCardItemsOut(BaseModel):
    """`GET /api/v1/dashboard/cards/{card}/items` (M18-01a/b/c): đúng 1 danh sách theo `kind`."""

    card: str
    label: str
    kind: Literal["order", "task", "staff", "feedback", "care_staff"]
    total: int
    page: int
    page_size: int
    order_items: list[DashboardOrderRow] | None = None
    task_items: list[DashboardTaskRow] | None = None
    staff_items: list[DashboardStaffRow] | None = None
    feedback_items: list[DashboardFeedbackRow] | None = None
    care_staff_items: list[DashboardCareStaffRow] | None = None
