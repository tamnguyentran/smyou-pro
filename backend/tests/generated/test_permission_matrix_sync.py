"""features/employees/permissionMatrix.json is generated from spec/permissions.yaml (AC-EMP-080)."""

import json

import pytest

from app.core.spec_loader import (
    PERMISSIONS_FILE,
    SpecError,
    load_specs,
    permission_matrix_document,
)
from app.modules.employees.domain import MANAGER_BUNDLE
from tests.spec_fixtures import REPO_SPEC_DIR

MATRIX_JSON = REPO_SPEC_DIR.parent / "frontend" / "src" / "features" / "employees" / "permissionMatrix.json"


def _document() -> dict:
    source = (REPO_SPEC_DIR / PERMISSIONS_FILE).read_text(encoding="utf-8")
    return permission_matrix_document(load_specs(REPO_SPEC_DIR).permissions, source, MANAGER_BUNDLE)


@pytest.mark.ac("AC-EMP-080")
def test_permission_matrix_json_is_the_yaml_matrix() -> None:
    assert json.loads(MATRIX_JSON.read_text(encoding="utf-8")) == _document()


@pytest.mark.ac("AC-EMP-080")
def test_matrix_has_roles_scopes_and_groups_in_yaml_order() -> None:
    doc = _document()
    assert set(doc) == {"roles", "scopes", "groups", "manager_bundle"}
    assert doc["roles"] == {
        "MANAGER": "Quản lý chung",
        "SALE": "Nhân viên kinh doanh",
        "CUSTOMER_CARE": "Chăm sóc khách hàng",
        "TECH_LEAD": "Quản lý kỹ thuật",
        "TECHNICIAN": "Nhân viên kỹ thuật",
    }
    assert doc["scopes"] == ["all", "own", "assigned", "self"]
    assert [g["label"] for g in doc["groups"]] == [
        "Danh mục",
        "Nhân sự",
        "Khách hàng",
        "Đơn hàng",
        "Đầu việc",
        "Báo cáo",
        "Hệ thống",
    ]


@pytest.mark.ac("AC-EMP-080")
def test_every_capability_appears_once_with_its_role_scopes() -> None:
    permissions = load_specs(REPO_SPEC_DIR).permissions
    capabilities = [c for g in _document()["groups"] for c in g["capabilities"]]
    assert [c["id"] for c in capabilities] == list(permissions.capabilities)
    by_id = {c["id"]: c["roles"] for c in capabilities}
    assert by_id["order.edit_draft"] == {"MANAGER": "all", "SALE": "own", "CUSTOMER_CARE": "own"}
    assert by_id["assignment.respond"] == {"TECHNICIAN": "self"}
    orders = next(g for g in _document()["groups"] if g["label"] == "Đơn hàng")
    assert "order.create" in [c["id"] for c in orders["capabilities"]]


@pytest.mark.ac("AC-EMP-080")
def test_capability_outside_a_group_comment_is_rejected() -> None:
    permissions = load_specs(REPO_SPEC_DIR).permissions
    source = "capabilities:\n  catalog.read: { MANAGER: all }\n"
    with pytest.raises(SpecError, match=r"catalog\.read"):
        permission_matrix_document(permissions, source, MANAGER_BUNDLE)


@pytest.mark.ac("AC-EMP-089")
def test_matrix_carries_the_server_manager_bundle_in_role_order() -> None:
    """The guide's "Quản lý chung" column is a union over this list, so it must be the server rule."""
    assert _document()["manager_bundle"] == ["SALE", "CUSTOMER_CARE", "TECH_LEAD"]
    assert set(_document()["manager_bundle"]) == MANAGER_BUNDLE - {"MANAGER"}
