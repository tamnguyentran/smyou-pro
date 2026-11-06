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
        "reports",
        "organization",
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
@pytest.mark.ac("AC-RPT-121")
def test_reports_menu_group_has_no_capability_of_its_own() -> None:
    """Parent stays capability-less so SALE/CUSTOMER_CARE (report.revenue.read, no kpi.read) see it."""
    doc = menu_document(load_specs(REPO_SPEC_DIR).permissions)
    reports = next(item for item in doc["menu"] if item["id"] == "reports")
    assert reports["capability"] is None
    assert [c["id"] for c in reports["children"]] == [
        # M23a AC-RPT-121: "Biểu đồ kinh doanh" heads the group.
        "reports-business-charts",
        "reports-kpi",
        # M21-02b AC-RPT-087: new "Báo cáo KPI" right below "Công việc theo nhân viên".
        "reports-kpi-sales",
        "reports-revenue-customer",
        "reports-revenue-employee",
        # M24-01b AC-RPT-152: right below "Doanh thu theo nhân viên".
        "reports-revenue-product",
        "reports-customer-gift",
    ]
    assert [c["capability"] for c in reports["children"]] == [
        "report.business_charts.read",
        "kpi.read",
        "report.kpi_sales.read",
        "report.revenue.read",
        "report.revenue.read",
        "report.revenue.read",
        "report.customer_gift.read",
    ]


@pytest.mark.ac("AC-RPT-152")
def test_revenue_by_product_menu_item_follows_revenue_by_employee() -> None:
    doc = menu_document(load_specs(REPO_SPEC_DIR).permissions)
    children = next(item for item in doc["menu"] if item["id"] == "reports")["children"]
    ids = [c["id"] for c in children]
    item = children[ids.index("reports-revenue-employee") + 1]
    assert item["id"] == "reports-revenue-product"
    assert item["label"] == "Doanh thu theo SP/DV"
    assert item["path"] == "/reports/revenue-by-product"
    assert item["icon"] == "Package"
    assert item["capability"] == "report.revenue.read"


@pytest.mark.ac("AC-SYS-034")
def test_organization_menu_group_holds_company_departments_employees() -> None:
    """Parent stays capability-less: company.manage and employee.manage are checked per child."""
    doc = menu_document(load_specs(REPO_SPEC_DIR).permissions)
    group = next(item for item in doc["menu"] if item["id"] == "organization")
    assert group["label"] == "Thông tin Công ty"
    assert group["capability"] is None
    assert [(c["id"], c["path"], c["capability"]) for c in group["children"]] == [
        ("company", "/settings/company", "company.manage"),
        ("departments", "/settings/departments", "employee.manage"),
        ("employees", "/employees", "employee.manage"),
        # M21-01b AC-KPI-046: right below "Nhân sự & phân quyền".
        ("kpi_targets", "/settings/kpi-targets", "kpi_target.manage"),
    ]
