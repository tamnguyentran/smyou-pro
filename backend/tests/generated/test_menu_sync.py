"""frontend/src/app/menu.json is generated from spec/permissions.yaml and must not drift (AC-SYS-034)."""

import json

import pytest

from app.core.spec_loader import load_specs, menu_document
from tests.spec_fixtures import REPO_SPEC_DIR

MENU_JSON = REPO_SPEC_DIR.parent / "frontend" / "src" / "app" / "menu.json"


@pytest.mark.ac("AC-SYS-034")
def test_menu_json_is_the_yaml_menu() -> None:
    expected = menu_document(load_specs(REPO_SPEC_DIR).permissions)
    assert json.loads(MENU_JSON.read_text(encoding="utf-8")) == expected


@pytest.mark.ac("AC-SYS-034")
def test_menu_document_has_menu_bottom_nav_and_role_labels() -> None:
    doc = menu_document(load_specs(REPO_SPEC_DIR).permissions)
    assert set(doc) == {"roles", "menu", "mobile_bottom_nav"}
    assert doc["roles"] == {
        "MANAGER": "Quản lý chung",
        "SALE": "Nhân viên kinh doanh",
        "CUSTOMER_CARE": "Chăm sóc khách hàng",
        "TECH_LEAD": "Quản lý kỹ thuật",
        "TECHNICIAN": "Nhân viên kỹ thuật",
    }
    assert [item["id"] for item in doc["menu"]] == [
        "dashboard",
        "my-work",
        "dispatch",
        "sales",
        "catalog",
        "employees",
        "reports",
        "audit",
    ]
    dispatch = doc["menu"][2]
    assert dispatch["capability"] == "task.manage"
    assert [c["badge"] for c in dispatch["children"]] == [
        "pending_dispatch_count",
        None,
        None,
        "revision_count",
    ]
    assert doc["mobile_bottom_nav"]["primary_action"]["TECHNICIAN"] is None
    assert doc["mobile_bottom_nav"]["primary_action"]["TECH_LEAD"]["label"] == "Tạo đầu việc"


@pytest.mark.ac("AC-RPT-055")
def test_reports_menu_group_has_no_capability_of_its_own() -> None:
    """Parent stays capability-less so SALE/CUSTOMER_CARE (report.revenue.read, no kpi.read) see it."""
    doc = menu_document(load_specs(REPO_SPEC_DIR).permissions)
    reports = next(item for item in doc["menu"] if item["id"] == "reports")
    assert reports["capability"] is None
    assert [c["id"] for c in reports["children"]] == [
        "reports-kpi",
        "reports-revenue-customer",
        "reports-revenue-employee",
    ]
    assert [c["capability"] for c in reports["children"]] == [
        "kpi.read",
        "report.revenue.read",
        "report.revenue.read",
    ]
