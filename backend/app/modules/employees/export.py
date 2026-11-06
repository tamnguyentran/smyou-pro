"""CSV for `GET /api/v1/employees/export` (M20-08): every profile field of each employee; cell rules
in `app/core/csv_export.py`. Never a password hash or login-lock state."""

from collections.abc import Iterable, Mapping

from app.core.csv_export import GENDER_LABELS, day, moment, number_text, text, to_bytes
from app.modules.identity.models import ROLES, Employee

CSV_HEADER = [
    "Mã NV",
    "Họ tên",
    "Tài khoản đăng nhập",
    "Email",
    "Số điện thoại",
    "Ngày sinh",
    "Nơi sinh",
    "Giới tính",
    "Địa chỉ",
    "Số CMND/CCCD",
    "Ngày cấp",
    "Nơi cấp",
    "Tình trạng hôn nhân",
    "Phòng ban",
    "Chức danh",
    "Vai trò",
    "Trạng thái",
    "Ngày tạo",
]
# Same wording as the UI's MARITAL_STATUS_LABELS (features/employees/schemas.ts).
_MARITAL_LABELS = {"SINGLE": "Độc thân", "MARRIED": "Đã kết hôn", "DIVORCED": "Ly hôn", "WIDOWED": "Goá"}


def _roles(employee: Employee, role_labels: Mapping[str, str]) -> str:
    held = {r.role for r in employee.roles}
    return ", ".join(role_labels.get(role, role) for role in ROLES if role in held)


def build_csv(rows: Iterable[Employee], role_labels: Mapping[str, str]) -> bytes:
    """`rows` already ordered; `role_labels` = permissions.yaml role → Vietnamese label."""
    return to_bytes(
        CSV_HEADER,
        (
            [
                text(e.code),
                text(e.full_name),
                text(e.username),
                text(e.email),
                number_text(e.phone),
                day(e.birth_date),
                text(e.birth_place),
                GENDER_LABELS.get(e.gender, e.gender) if e.gender else "",
                text(e.address),
                number_text(e.id_number),
                day(e.id_issued_date),
                text(e.id_issued_place),
                _MARITAL_LABELS.get(e.marital_status, e.marital_status) if e.marital_status else "",
                text(e.department.name),
                text(e.title),
                _roles(e, role_labels),
                "Đang hoạt động" if e.is_active else "Đã khoá",
                moment(e.created_at),
            ]
            for e in rows
        ),
    )
