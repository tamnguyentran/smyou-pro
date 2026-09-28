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
