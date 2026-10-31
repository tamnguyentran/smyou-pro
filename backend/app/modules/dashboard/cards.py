"""M18-01a/b: danh sách chi tiết + xuất CSV cho từng thẻ trên Tổng quan (khối "Đơn theo trạng thái",
"Điều phối", "Đầu việc theo trạng thái", "Nhân sự kỹ thuật", "Việc của tôi") và M18-01c ("Chăm sóc
khách hàng", "Phản hồi - đánh giá", "Top 10 khách hàng").

Điều kiện lọc lấy từ đúng các hàm mà `service.get_dashboard` dùng để đếm (`order_scope_where`,
`order_overdue_where`, `dispatch_where`, `staff_where`, `my_task_where`, `care_where`,
`feedback_where`, `top_customer_where`) để số trên thẻ và danh sách
không bao giờ lệch. Vai trò
không thấy khối trên Tổng quan nhận 404 — thẻ "không tồn tại" với họ (spec AC-DASH-070).
"""

import csv
import io
import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session, aliased

from app.core.authz import Actor
from app.core.errors import AppError
from app.modules.customers.models import Customer
from app.modules.dashboard.schemas import (
    DashboardCardItemsOut,
    DashboardCareStaffRow,
    DashboardFeedbackRow,
    DashboardOrderRow,
    DashboardStaffRow,
    DashboardTaskRow,
)
from app.modules.dashboard.service import (
    OPEN_ASSIGNMENT_STATUSES,
    VIETNAM,
    care_where,
    dispatch_where,
    feedback_where,
    my_task_where,
    order_overdue_where,
    order_scope,
    order_scope_where,
    sees_customer_sections,
    sees_dispatch,
    staff_where,
    top_customer_where,
)
from app.modules.dispatch.models import Assignment, Task
from app.modules.identity.models import Employee
from app.modules.orders.models import Order

EXPORT_MAX_ROWS = 5000
# Same notion of "active" assignee as dispatch/service.py's _INACTIVE_ASSIGNMENT_STATUSES.
_INACTIVE_ASSIGNMENT_STATUSES = ("REJECTED", "REMOVED")
_CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")
# Nhãn trạng thái phân công — cùng các nhóm của trang "Việc của tôi" (spec M18-01b §6).
_ASSIGNMENT_STATUS_LABELS = {
    "PENDING": "Chờ nhận",
    "ACCEPTED": "Đã nhận",
    "IN_PROGRESS": "Đang làm",
    "DONE": "Đã xong",
}

Where = list[ColumnElement[bool]]


@dataclass(frozen=True)
class _Card:
    label: str
    slug: str  # tên file xuất: tong-quan-<slug>-<ngày>.csv
    kind: Literal["order", "task", "staff", "feedback", "care_staff"]
    # `None` → vai trò của actor không thấy khối chứa thẻ này.
    where: Callable[[Actor, datetime], Where | None]
    # Thẻ khối "Việc của tôi": dòng đầu việc kèm trạng thái phân công của chính người gọi.
    personal: bool = False


def _order_card(extra: Callable[[datetime], Where]) -> Callable[[Actor, datetime], Where | None]:
    def where(actor: Actor, now: datetime) -> Where | None:
        scope = order_scope(actor)
        return None if scope is None else [*extra(now), *order_scope_where(scope, actor)]

    return where


def _dispatch_card(key: str) -> Callable[[Actor, datetime], Where | None]:
    def where(actor: Actor, now: datetime) -> Where | None:
        return dispatch_where(now)[key] if sees_dispatch(actor) else None

    return where


def _staff_card(key: str) -> Callable[[Actor, datetime], Where | None]:
    def where(actor: Actor, _now: datetime) -> Where | None:
        return staff_where()[key] if sees_dispatch(actor) else None

    return where


def _task_status_card(status: str) -> Callable[[Actor, datetime], Where | None]:
    def where(actor: Actor, _now: datetime) -> Where | None:
        return [Task.status == status] if sees_dispatch(actor) else None

    return where


def _my_card(key: str) -> Callable[[Actor, datetime], Where | None]:
    def where(actor: Actor, now: datetime) -> Where | None:
        return my_task_where(actor, now=now)[key] if "TECHNICIAN" in actor.roles else None

    return where


def _care_card(key: str) -> Callable[[Actor, datetime], Where | None]:
    def where(actor: Actor, now: datetime) -> Where | None:
        return care_where(now)[key] if sees_customer_sections(actor) else None

    return where


def _feedback_card(rating: int) -> Callable[[Actor, datetime], Where | None]:
    def where(actor: Actor, now: datetime) -> Where | None:
        return feedback_where(now, rating) if sees_customer_sections(actor) else None

    return where


def _status_where(status: str) -> Callable[[datetime], Where]:
    return lambda _now: [Order.status == status]


_ORDER_STATUS_CARDS = {
    "DRAFT": ("Nháp", "nhap"),
    "PENDING_DISPATCH": ("Chờ điều phối", "cho-dieu-phoi"),
    "IN_PROGRESS": ("Đang thực hiện", "dang-thuc-hien"),
    "AWAITING_CONFIRMATION": ("Chờ KH xác nhận", "cho-kh-xac-nhan"),
    "COMPLETED": ("Hoàn tất", "hoan-tat"),
    "REVISION": ("Chỉnh sửa", "chinh-sua"),
    "CANCELLED": ("Đã huỷ", "da-huy"),
}

# Nhãn giống `TASK_STATUS_LABEL` ở frontend (dispatch/taskStatus.ts).
_TASK_STATUS_CARDS = {
    "NEEDS_ASSIGNEE": ("Cần giao lại", "dv-can-giao-lai"),
    "PENDING_ACCEPTANCE": ("Chờ tiếp nhận", "dv-cho-tiep-nhan"),
    "ACCEPTED": ("Đã tiếp nhận", "dv-da-tiep-nhan"),
    "IN_PROGRESS": ("Đang thực hiện", "dv-dang-thuc-hien"),
    "DONE": ("Hoàn thành", "dv-hoan-thanh"),
    "CANCELLED": ("Đã huỷ", "dv-da-huy"),
}

_STAFF_CARDS = {
    "IN_PROGRESS": ("Đang làm", "ktv-dang-lam"),
    "NOT_STARTED": ("Chưa thực hiện", "ktv-chua-thuc-hien"),
    "IDLE": ("Chờ giao việc", "ktv-cho-giao-viec"),
}

_MY_TASK_CARDS = {
    "pending": ("Chờ nhận", "viec-cua-toi-cho-nhan"),
    "active": ("Đang làm", "viec-cua-toi-dang-lam"),
    "done_today": ("Đã xong hôm nay", "viec-cua-toi-da-xong-hom-nay"),
    "not_started": ("Chưa thực hiện", "viec-cua-toi-chua-thuc-hien"),
    "overdue": ("Quá hạn chưa hoàn thành", "viec-cua-toi-qua-han"),
}

CARDS: dict[str, _Card] = {
    **{
        f"order.{status}": _Card(label, slug, "order", _order_card(_status_where(status)))
        for status, (label, slug) in _ORDER_STATUS_CARDS.items()
    },
    "order.overdue": _Card("Đơn quá hạn", "don-qua-han", "order", _order_card(order_overdue_where)),
    "dispatch.pending_dispatch": _Card(
        "Chờ điều phối", "cho-dieu-phoi", "order", _dispatch_card("pending_dispatch")
    ),
    "dispatch.in_progress": _Card("Đang thực hiện", "dang-thuc-hien", "order", _dispatch_card("in_progress")),
    "dispatch.needs_assignee": _Card(
        "Cần giao lại", "can-giao-lai", "task", _dispatch_card("needs_assignee")
    ),
    "dispatch.overdue_tasks": _Card(
        "Đầu việc quá hạn", "dau-viec-qua-han", "task", _dispatch_card("overdue_tasks")
    ),
    **{
        f"task.{status}": _Card(label, slug, "task", _task_status_card(status))
        for status, (label, slug) in _TASK_STATUS_CARDS.items()
    },
    **{
        f"staff.{group}": _Card(label, slug, "staff", _staff_card(group))
        for group, (label, slug) in _STAFF_CARDS.items()
    },
    "staff.pending_acceptance": _Card(
        "Chưa tiếp nhận", "ktv-chua-tiep-nhan", "task", _staff_card("pending_acceptance")
    ),
    **{
        f"mine.{key}": _Card(label, slug, "task", _my_card(key), personal=True)
        for key, (label, slug) in _MY_TASK_CARDS.items()
    },
    # Nhãn như thẻ (`ORDER_STATUS_LABEL.AWAITING_CONFIRMATION` ở frontend).
    "mine.awaiting_confirmation": _Card(
        "Chờ KH xác nhận", "viec-cua-toi-cho-kh-xac-nhan", "order", _my_card("awaiting_confirmation")
    ),
    "care.customers": _Card(
        "Khách hàng đã chăm sóc", "cskh-kh-da-cham-soc", "feedback", _care_card("customers")
    ),
    "care.staff": _Card("NV đã gọi điện CSKH", "cskh-nv-goi-dien", "care_staff", _care_card("staff")),
    "care.revision_orders": _Card(
        "Đơn hàng phải sửa", "cskh-don-phai-sua", "order", _care_card("revision_orders")
    ),
    **{
        f"feedback.{n}": _Card(f"Đánh giá {n}★", f"danh-gia-{n}-sao", "feedback", _feedback_card(n))
        for n in range(1, 6)
    },
}

_ENTITIES = {"order": Order, "task": Task, "staff": Employee, "feedback": Order, "care_staff": Employee}
_TOP_CUSTOMER_PREFIX = "top."


def _top_customer_card(session: Session, raw_id: str) -> _Card | None:
    """Mã thẻ động `top.{customer_id}` (M18-01c, Q121): các đơn tạo nên 1 dòng Top 10."""
    try:
        customer_id = uuid.UUID(raw_id)
    except ValueError:
        return None
    found = session.execute(select(Customer.code, Customer.name).where(Customer.id == customer_id)).first()
    if found is None:
        return None
    code, name = found

    def where(actor: Actor, now: datetime) -> Where | None:
        return top_customer_where(now, customer_id) if sees_customer_sections(actor) else None

    return _Card(f"{name} ({code})", f"top-kh-{code.lower()}", "order", where)


def _resolve(session: Session, card: str, actor: Actor, now: datetime) -> tuple[_Card, Where]:
    if card.startswith(_TOP_CUSTOMER_PREFIX):
        definition = _top_customer_card(session, card.removeprefix(_TOP_CUSTOMER_PREFIX))
    else:
        definition = CARDS.get(card)
    where = definition.where(actor, now) if definition is not None else None
    if definition is None or where is None:
        raise AppError(404, "NOT_FOUND", "Không tìm thấy tài nguyên.")
    return definition, where


def _total(session: Session, definition: _Card, where: Where) -> int:
    return session.scalar(select(func.count()).select_from(_ENTITIES[definition.kind]).where(*where)) or 0


def _order_rows(
    session: Session, where: Where, *, show_prices: bool, offset: int, limit: int | None
) -> list[DashboardOrderRow]:
    rows = session.execute(
        select(
            Order.id,
            Order.code,
            Order.customer_name,
            Order.customer_phone,
            Employee.full_name,
            Order.status,
            Order.created_at,
            Order.total,
        )
        .join(Employee, Employee.id == Order.created_by)
        .where(*where)
        .order_by(Order.created_at.desc(), Order.code.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return [
        DashboardOrderRow(
            order_id=order_id,
            order_code=code,
            customer_name=customer_name,
            customer_phone=customer_phone,
            created_by_name=created_by_name,
            status=status,
            created_at=created_at,
            total=total if show_prices else None,
        )
        for order_id, code, customer_name, customer_phone, created_by_name, status, created_at, total in rows
    ]


def _assignee_names(session: Session, task_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, list[str]]:
    names: dict[uuid.UUID, list[str]] = {task_id: [] for task_id in task_ids}
    if not task_ids:
        return names
    for task_id, full_name in session.execute(
        select(Assignment.task_id, Employee.full_name)
        .join(Task, Task.id == Assignment.task_id)
        .join(Employee, Employee.id == Assignment.employee_id)
        .where(
            Assignment.task_id.in_(task_ids),
            Assignment.cycle == Task.cycle,
            Assignment.status.notin_(_INACTIVE_ASSIGNMENT_STATUSES),
        )
        .order_by(Employee.full_name)
    ).all():
        names[task_id].append(full_name)
    return names


def _my_assignment_statuses(
    session: Session, employee_id: uuid.UUID, task_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, str]:
    if not task_ids:
        return {}
    return dict(
        session.execute(
            select(Assignment.task_id, Assignment.status)
            .join(Task, Task.id == Assignment.task_id)
            .where(
                Assignment.task_id.in_(task_ids),
                Assignment.employee_id == employee_id,
                Assignment.cycle == Task.cycle,
                Assignment.status.notin_(_INACTIVE_ASSIGNMENT_STATUSES),
            )
        )
        .tuples()
        .all()
    )


def _task_rows(
    session: Session,
    where: Where,
    *,
    offset: int,
    limit: int | None,
    personal_for: uuid.UUID | None = None,
) -> list[DashboardTaskRow]:
    """`personal_for` (thẻ `mine.*`): thêm trạng thái phân công của nhân viên đó vào mỗi dòng."""
    rows = session.execute(
        select(
            Task.id,
            Task.code,
            Task.title,
            Order.id,
            Order.code,
            Order.customer_name,
            Task.due_at,
            Task.status,
        )
        .join(Order, Order.id == Task.order_id)
        .where(*where)
        .order_by(Task.due_at.asc(), Task.code.asc())
        .offset(offset)
        .limit(limit)
    ).all()
    task_ids = [row[0] for row in rows]
    assignees = _assignee_names(session, task_ids)
    statuses = _my_assignment_statuses(session, personal_for, task_ids) if personal_for else {}
    return [
        DashboardTaskRow(
            task_id=task_id,
            task_code=task_code,
            task_title=title,
            order_id=order_id,
            order_code=order_code,
            customer_name=customer_name,
            assignee_names=assignees[task_id],
            due_at=due_at,
            status=status,
            assignment_status=statuses.get(task_id),
        )
        for task_id, task_code, title, order_id, order_code, customer_name, due_at, status in rows
    ]


def _staff_rows(session: Session, where: Where, *, offset: int, limit: int | None) -> list[DashboardStaffRow]:
    def assignment_count(*statuses: str) -> Any:
        return (
            select(func.count())
            .where(Assignment.employee_id == Employee.id, Assignment.status.in_(statuses))
            .scalar_subquery()
        )

    rows = session.execute(
        select(
            Employee.id,
            Employee.code,
            Employee.full_name,
            Employee.phone,
            assignment_count(*OPEN_ASSIGNMENT_STATUSES),
            assignment_count("IN_PROGRESS"),
        )
        .where(*where)
        .order_by(Employee.full_name, Employee.code)
        .offset(offset)
        .limit(limit)
    ).all()
    return [
        DashboardStaffRow(
            employee_id=employee_id,
            employee_code=code,
            full_name=full_name,
            phone=phone,
            open_assignment_count=open_count,
            in_progress_assignment_count=in_progress_count,
        )
        for employee_id, code, full_name, phone, open_count, in_progress_count in rows
    ]


def _feedback_rows(
    session: Session, where: Where, *, offset: int, limit: int | None
) -> list[DashboardFeedbackRow]:
    recorder = aliased(Employee)
    rows = session.execute(
        select(
            Order.id,
            Order.code,
            Order.customer_name,
            Order.customer_phone,
            Order.csat_rating,
            Order.csat_comment,
            recorder.full_name,
            Order.csat_recorded_at,
            Order.completed_at,
        )
        .outerjoin(recorder, recorder.id == Order.csat_recorded_by)
        .where(*where)
        .order_by(Order.csat_recorded_at.desc().nulls_last(), Order.code.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    fields = list(DashboardFeedbackRow.model_fields)
    return [DashboardFeedbackRow(**dict(zip(fields, row, strict=True))) for row in rows]


def _care_staff_rows(
    session: Session, where: Where, *, now: datetime, offset: int, limit: int | None
) -> list[DashboardCareStaffRow]:
    recorded = [Order.csat_recorded_by == Employee.id, *care_where(now)["customers"]]
    care_count = select(func.count()).where(*recorded).scalar_subquery()
    last_recorded_at = select(func.max(Order.csat_recorded_at)).where(*recorded).scalar_subquery()
    rows = session.execute(
        select(Employee.id, Employee.code, Employee.full_name, care_count, last_recorded_at)
        .where(*where)
        .order_by(care_count.desc(), Employee.full_name, Employee.code)
        .offset(offset)
        .limit(limit)
    ).all()
    return [
        DashboardCareStaffRow(
            employee_id=employee_id,
            employee_code=code,
            full_name=full_name,
            care_count=count,
            last_recorded_at=last_at,
        )
        for employee_id, code, full_name, count, last_at in rows
    ]


def list_items(
    session: Session,
    actor: Actor,
    card: str,
    *,
    now: datetime,
    page: int,
    page_size: int,
    show_prices: bool,
) -> DashboardCardItemsOut:
    definition, where = _resolve(session, card, actor, now)
    out = DashboardCardItemsOut(
        card=card,
        label=definition.label,
        kind=definition.kind,
        total=_total(session, definition, where),
        page=page,
        page_size=page_size,
    )
    offset = (page - 1) * page_size
    if definition.kind == "order":
        out.order_items = _order_rows(session, where, show_prices=show_prices, offset=offset, limit=page_size)
    elif definition.kind == "staff":
        out.staff_items = _staff_rows(session, where, offset=offset, limit=page_size)
    elif definition.kind == "feedback":
        out.feedback_items = _feedback_rows(session, where, offset=offset, limit=page_size)
    elif definition.kind == "care_staff":
        out.care_staff_items = _care_staff_rows(session, where, now=now, offset=offset, limit=page_size)
    else:
        personal_for = actor.id if definition.personal else None
        out.task_items = _task_rows(session, where, offset=offset, limit=page_size, personal_for=personal_for)
    return out


def _cell(value: str | None) -> str:
    """Neutralize Excel/Sheets formula injection (CWE-1236), same as `revenue_report/service.py`."""
    text = value or ""
    return f"'{text}" if text.startswith(_CSV_FORMULA_PREFIXES) else text


def _vn_time(value: datetime) -> str:
    return value.astimezone(VIETNAM).strftime("%d/%m/%Y %H:%M")


def export_csv(
    session: Session, actor: Actor, card: str, *, now: datetime, show_prices: bool
) -> tuple[str, bytes]:
    """Toàn bộ dòng của thẻ (không phân trang) → (tên file, CSV UTF-8 BOM). Quá `EXPORT_MAX_ROWS` → 409."""
    definition, where = _resolve(session, card, actor, now)
    if _total(session, definition, where) > EXPORT_MAX_ROWS:
        raise AppError(
            409,
            "EXPORT_TOO_LARGE",
            f"Quá nhiều dòng để xuất (tối đa {f'{EXPORT_MAX_ROWS:,}'.replace(',', '.')}).",
        )

    table: list[list[Any]]
    if definition.kind == "order":
        header = ["Mã đơn", "Khách hàng", "SĐT", "Người tạo", "Ngày tạo"]
        table = [header + (["Tổng tiền"] if show_prices else [])]
        for o in _order_rows(session, where, show_prices=show_prices, offset=0, limit=None):
            line: list[Any] = [
                _cell(o.order_code),
                _cell(o.customer_name),
                _cell(o.customer_phone),
                _cell(o.created_by_name),
                _vn_time(o.created_at),
            ]
            table.append(line + ([o.total] if show_prices else []))
    elif definition.kind == "staff":
        table = [["Mã NV", "Họ tên", "SĐT", "Số việc đang mở", "Số việc đang làm"]]
        table.extend(
            [
                _cell(e.employee_code),
                _cell(e.full_name),
                _cell(e.phone),
                e.open_assignment_count,
                e.in_progress_assignment_count,
            ]
            for e in _staff_rows(session, where, offset=0, limit=None)
        )
    elif definition.kind == "feedback":
        table = [
            [
                "Mã đơn",
                "Khách hàng",
                "SĐT",
                "Số sao",
                "Nhận xét",
                "Người ghi nhận",
                "Thời điểm ghi nhận",
                "Ngày hoàn tất",
            ]
        ]
        table.extend(
            [
                _cell(f.order_code),
                _cell(f.customer_name),
                _cell(f.customer_phone),
                f.csat_rating,
                _cell(f.csat_comment),
                _cell(f.recorded_by_name),
                _vn_time(f.recorded_at),
                _vn_time(f.completed_at) if f.completed_at else "",
            ]
            for f in _feedback_rows(session, where, offset=0, limit=None)
        )
    elif definition.kind == "care_staff":
        table = [["Mã NV", "Họ tên", "Số KH đã chăm sóc", "Lần ghi gần nhất"]]
        table.extend(
            [_cell(e.employee_code), _cell(e.full_name), e.care_count, _vn_time(e.last_recorded_at)]
            for e in _care_staff_rows(session, where, now=now, offset=0, limit=None)
        )
    elif definition.personal:
        table = [["Mã đầu việc", "Đầu việc", "Mã đơn", "Khách hàng", "Hạn", "Trạng thái"]]
        table.extend(
            [
                _cell(t.task_code),
                _cell(t.task_title),
                _cell(t.order_code),
                _cell(t.customer_name),
                _vn_time(t.due_at),
                _ASSIGNMENT_STATUS_LABELS.get(t.assignment_status or "", t.assignment_status or ""),
            ]
            for t in _task_rows(session, where, offset=0, limit=None, personal_for=actor.id)
        )
    else:
        table = [["Mã đầu việc", "Đầu việc", "Mã đơn", "Khách hàng", "KTV", "Hạn"]]
        table.extend(
            [
                _cell(t.task_code),
                _cell(t.task_title),
                _cell(t.order_code),
                _cell(t.customer_name),
                _cell(", ".join(t.assignee_names)),
                _vn_time(t.due_at),
            ]
            for t in _task_rows(session, where, offset=0, limit=None)
        )

    buffer = io.StringIO()
    csv.writer(buffer).writerows(table)
    filename = f"tong-quan-{definition.slug}-{now.astimezone(VIETNAM).date().isoformat()}.csv"
    return filename, ("﻿" + buffer.getvalue()).encode("utf-8")
