"""Pure audit rules: which entity types the shared record() accepts (M1-05).

Extended by later modules (M3 orders, M4 tasks, ...) when their state machines start
calling record() for the `audit` effect declared in spec/state_machines.yaml.
"""

from enum import StrEnum


class EntityType(StrEnum):
    EMPLOYEE = "EMPLOYEE"
    PRODUCT = "PRODUCT"
    SERVICE = "SERVICE"
    CUSTOMER = "CUSTOMER"
    ORDER = "ORDER"
    TASK = "TASK"
    ASSIGNMENT = "ASSIGNMENT"
    CUSTOMER_GIFT = "CUSTOMER_GIFT"
    COMPANY_PROFILE = "COMPANY_PROFILE"
    DEPARTMENT = "DEPARTMENT"
    KPI_TARGET = "KPI_TARGET"


class BusinessArea(StrEnum):
    """M21-04: the "Nghiệp vụ" (screen) an event belongs to — computed on read, never stored."""

    ORDERS = "ORDERS"
    TASKS = "TASKS"
    ASSIGNMENTS = "ASSIGNMENTS"
    CUSTOMERS = "CUSTOMERS"
    CUSTOMER_GIFTS = "CUSTOMER_GIFTS"
    CATALOG = "CATALOG"
    EMPLOYEES = "EMPLOYEES"
    AUTH = "AUTH"
    COMPANY = "COMPANY"
    DEPARTMENTS = "DEPARTMENTS"
    KPI_TARGETS = "KPI_TARGETS"


# EMPLOYEE events written by the sign-in flow belong to "Đăng nhập", not "Nhân sự & phân quyền".
AUTH_ACTIONS = frozenset({"login", "login_failed", "login_refused", "account_locked", "password_changed"})

# The one place entity_type → business_area lives (spec M21-04 §2). EMPLOYEE is split by AUTH_ACTIONS.
ENTITY_BUSINESS_AREA: dict[str, BusinessArea] = {
    EntityType.ORDER: BusinessArea.ORDERS,
    EntityType.TASK: BusinessArea.TASKS,
    EntityType.ASSIGNMENT: BusinessArea.ASSIGNMENTS,
    EntityType.CUSTOMER: BusinessArea.CUSTOMERS,
    EntityType.CUSTOMER_GIFT: BusinessArea.CUSTOMER_GIFTS,
    EntityType.PRODUCT: BusinessArea.CATALOG,
    EntityType.SERVICE: BusinessArea.CATALOG,
    EntityType.EMPLOYEE: BusinessArea.EMPLOYEES,
    EntityType.COMPANY_PROFILE: BusinessArea.COMPANY,
    EntityType.DEPARTMENT: BusinessArea.DEPARTMENTS,
    EntityType.KPI_TARGET: BusinessArea.KPI_TARGETS,
}


def business_area(entity_type: str, action: str) -> BusinessArea:
    """KeyError on an unmapped entity_type: record() only accepts EntityType values, and a new
    one must be mapped here (AC-SYS-142) rather than fall into a silent default."""
    if entity_type == EntityType.EMPLOYEE and action in AUTH_ACTIONS:
        return BusinessArea.AUTH
    return ENTITY_BUSINESS_AREA[entity_type]
